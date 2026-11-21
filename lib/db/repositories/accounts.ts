import {assessD1Customer} from "../../compliance/d1"
import {accountDocumentStats,effectiveAccountDocuments,isAccountDocument,complianceState} from "../../compliance/account-health"
import type { D1Binding, D1Statement, D1Value } from "../d1"
import type { StoredUser, VersionedUser } from "./users"
import type { AccountStatus } from "../../models/Customer"
import type { IStaffPermissions } from "../../models/User"
import { activityStatement, activityLabel } from "../../activity/record"
import type { ActivityContext, ActivityTarget } from "../../activity/record"
import { canAccessAccounts } from "../../auth/accounts-access"
import { taxCustomerReference, taxReferenceKey, taxReferenceSql } from "../../references/tax-reference"

export interface AccountCustomer {
  _id: string
  companyName: string
  commercialRegisterNumber: string
  taxCardNumber: string
  contactEmail: string
  contactPhone: string
  accountStatus: AccountStatus
  statusReason?: string
  maxAllowedDocuments?: number
  industry?: string
  address?: string
  city?: string
  country?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}
export interface AccountRole {
  _id: string
  title: string
  permissions: IStaffPermissions
  isSystem: boolean
  [key: string]: unknown
}
export interface Versioned<T> { value: T; revision: number }
interface Row { data: string; revision: number }
export class AccountConflictError extends Error {
  constructor() { super("Account changed concurrently or conflicts with an existing account. Reload and retry.") }
}

export function newAccountId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), n => n.toString(16).padStart(2, "0")).join("")
}

/** Only top-level fields selected by a domain operation are writable. */
function patchExpression(patch: Record<string, unknown>): { expression: string; values: D1Value[] } {
  let expression = "data"
  const values: D1Value[] = []
  for (const [key, value] of Object.entries({ ...patch, updatedAt: new Date().toISOString() })) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key) || key === "createdAt") throw new Error("Invalid account patch field")
    if (value === undefined) {
      expression = `json_remove(${expression}, '$.${key}')`
    } else {
      const json = JSON.stringify(value)
      if (json === undefined) throw new Error("Invalid account patch value")
      expression = `json_set(${expression}, '$.${key}', json(?))`
      values.push(json)
    }
  }
  return { expression, values }
}

export class D1AccountsRepository {
  readonly db: D1Binding
  activity?: ActivityContext
  constructor(db: D1Binding) { this.db = db }

  private async transaction(statements: D1Statement[], target?: ActivityTarget): Promise<void> {
    if (this.activity && target) statements.push(activityStatement(this.db, this.activity, target))
    try { await this.db.batch(statements) } catch (error) {
      if (error instanceof Error && /UNIQUE constraint|CHECK constraint/i.test(error.message)) throw new AccountConflictError()
      throw error
    }
  }

  private update(table: "users" | "customers", id: string, revision: number, patch: Record<string, unknown>): D1Statement {
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Invalid account revision")
    const { expression, values } = patchExpression(patch)
    return this.db.prepare(`UPDATE ${table} SET data = ${expression}, revision = revision + 1 WHERE id = ? AND revision = ?`)
      .bind(...values, id, revision)
  }

  private guard(id: string): D1Statement {
    return this.db.prepare("INSERT INTO _nilelink_write_guards (id, valid) VALUES (?, changes())").bind(id)
  }

  async findUser(field: "email" | "username" | "id", value: string, includePassword = false): Promise<VersionedUser | null> {
    const row = await this.db.prepare(`SELECT ${includePassword ? "data" : "json_remove(data, '$.passwordHash') AS data"}, revision FROM users WHERE ${field} = ?`)
      .bind(field === "id" ? value : value.trim().toLowerCase()).first<Row>()
    return row ? { user: JSON.parse(row.data) as StoredUser, revision: row.revision } : null
  }

  async findUserByToken(kind: "passwordReset" | "emailVerification", token: string): Promise<VersionedUser | null> {
    const row = await this.db.prepare(`SELECT json_remove(data, '$.passwordHash') AS data, revision FROM users
      WHERE json_extract(data, '$.${kind}Token') = ? AND json_extract(data, '$.${kind}Expires') > ? LIMIT 1`)
      .bind(token, new Date().toISOString()).first<Row>()
    return row ? { user: JSON.parse(row.data), revision: row.revision } : null
  }

  async findResetUser(identifier: string, channel: "email" | "whatsapp"): Promise<VersionedUser | null> {
    if (channel === "email") return this.findUser("email", identifier)
    const digits = identifier.replace(/\D/g, "")
    // Never let an empty phone suffix match every account. Ambiguous numbers
    // require the complete email instead of selecting an arbitrary user.
    if (digits.length < 8) return this.findUser("email", identifier)
    const rows = await this.db.prepare(`SELECT json_remove(data, '$.passwordHash') AS data, revision FROM users
      WHERE json_extract(data, '$.phone') = ? OR instr(json_extract(data, '$.phone'), ?) > 0 OR email = ? LIMIT 2`)
      .bind(identifier.trim(), digits.slice(-8), identifier.trim().toLowerCase()).all<Row>()
    if (rows.results.length !== 1) return null
    return { user: JSON.parse(rows.results[0].data), revision: rows.results[0].revision }
  }

  async findCustomer(id: string): Promise<Versioned<AccountCustomer> | null> {
    const row = await this.db.prepare("SELECT data, revision FROM customers WHERE id = ?").bind(id).first<Row>()
    return row ? { value: JSON.parse(row.data), revision: row.revision } : null
  }

  async customerByRegistration(number: string): Promise<AccountCustomer | null> {
    const row = await this.db.prepare("SELECT data FROM customers WHERE commercialRegisterNumber = ? LIMIT 1").bind(number).first<Row>()
    return row ? JSON.parse(row.data) : null
  }
  async customerByTaxNumber(number: string): Promise<AccountCustomer | null> {
    const row = await this.db.prepare(`SELECT data FROM customers WHERE json_extract(data,'$.taxReferenceKey')=? OR ${taxReferenceSql()}=? LIMIT 1`)
      .bind(taxReferenceKey(number), taxReferenceKey(number)).first<Row>()
    return row ? JSON.parse(row.data) : null
  }

  async register(customer: AccountCustomer, user: StoredUser): Promise<void> {
    Object.assign(customer, taxCustomerReference(customer.taxCardNumber))
    const guardId = newAccountId()
    await this.transaction([
      this.db.prepare(`INSERT INTO _nilelink_write_guards (id, valid) SELECT ?, CASE WHEN EXISTS (SELECT 1 FROM customers WHERE commercialRegisterNumber = ? OR ${taxReferenceSql()} = ? OR json_extract(data,'$.customerCode')=?) THEN 0 ELSE 1 END`)
        .bind(guardId, customer.commercialRegisterNumber, taxReferenceKey(customer.taxCardNumber), customer.customerCode as string),
      this.db.prepare("INSERT INTO customers (id, data) VALUES (?, ?)").bind(customer._id, JSON.stringify(customer)),
      this.db.prepare("INSERT INTO users (id, data) VALUES (?, ?)").bind(user._id, JSON.stringify(user)),
      this.db.prepare("DELETE FROM _nilelink_write_guards WHERE id = ?").bind(guardId),
    ], { type: "customers", id: customer._id, label: customer.companyName, customerId: customer._id })
  }

  async patchUser(user: VersionedUser, patch: Record<string, unknown>): Promise<void> {
    await this.updateProfile(user, patch)
  }

  async updateProfile(user: VersionedUser, userPatch: Record<string, unknown>, customer?: Versioned<AccountCustomer>, customerPatch: Record<string, unknown> = {}): Promise<void> {
    if (customer && user.user.customerId !== customer.value._id) throw new Error("Customer ownership mismatch")
    const guards: string[] = []
    const statements: D1Statement[] = []
    for (const [table, id, revision, patch] of [
      ["users", user.user._id, user.revision, userPatch],
      ...(customer ? [["customers", customer.value._id, customer.revision, customerPatch] as const] : []),
    ] as const) {
      if (!Object.keys(patch).length && !(table === "users" && customer && Object.keys(customerPatch).length)) continue
      const guardId = newAccountId()
      guards.push(guardId)
      statements.push(this.update(table, id, revision, patch), this.guard(guardId))
    }
    if (!statements.length) return
    statements.push(...guards.map(id => this.db.prepare("DELETE FROM _nilelink_write_guards WHERE id = ?").bind(id)))
    await this.transaction(statements, { type: customer ? "customers" : "users", id: customer?.value._id || user.user._id, label: customer ? customer.value.companyName : activityLabel(user.user), customerId: user.user.customerId, changedFields: [...Object.keys(userPatch), ...Object.keys(customerPatch)] })
  }

  async listStaff(): Promise<StoredUser[]> {
    const rows = await this.db.prepare("SELECT json_remove(data, '$.passwordHash') AS data FROM users WHERE role IN ('staff', 'super_admin') ORDER BY createdAt DESC").all<Row>()
    return rows.results.map(row => JSON.parse(row.data))
  }

  async createStaff(user: StoredUser): Promise<void> {
    await this.transaction([this.db.prepare("INSERT INTO users (id, data) VALUES (?, ?)").bind(user._id, JSON.stringify(user))], { type: "users", id: user._id, label: activityLabel(user) })
  }

  async listRoles(): Promise<AccountRole[]> {
    const rows = await this.db.prepare("SELECT data FROM role_configs ORDER BY json_extract(data, '$.createdAt') ASC").all<Row>()
    return rows.results.map(row => JSON.parse(row.data))
  }

  async createRole(role: AccountRole): Promise<void> {
    const existing = await this.listRoles()
    if (existing.some(value => value.title.toLowerCase() === role.title.toLowerCase())) throw new AccountConflictError()
    const guardId = newAccountId()
    await this.transaction([
      // Serialize additions optimistically against the reviewed role set. This
      // avoids SQLite lower()'s ASCII-only behavior for concurrent Unicode names.
      this.db.prepare("INSERT INTO _nilelink_write_guards (id, valid) SELECT ?, CASE WHEN (SELECT count(*) FROM role_configs) = ? THEN 1 ELSE 0 END").bind(guardId, existing.length),
      this.db.prepare("INSERT INTO role_configs (id, data) VALUES (?, ?)").bind(role._id, JSON.stringify(role)),
      this.db.prepare("DELETE FROM _nilelink_write_guards WHERE id = ?").bind(guardId),
    ], { type: "role_configs", id: role._id, label: role.title })
  }

  async listCustomers(status?: string): Promise<AccountCustomer[]> {
    const rows = await this.db.prepare(`SELECT data FROM customers ${status && status !== "all" ? "WHERE accountStatus = ?" : ""} ORDER BY json_extract(data, '$.updatedAt') DESC, id`)
      .bind(...(status && status !== "all" ? [status] : [])).all<Row>()
    return rows.results.map(row => JSON.parse(row.data))
  }

  async customerUsers(id: string): Promise<StoredUser[]> {
    const rows = await this.db.prepare("SELECT json_remove(data, '$.passwordHash') AS data FROM users WHERE customerId = ?").bind(id).all<Row>()
    return rows.results.map(row => JSON.parse(row.data))
  }

  async customerDocuments(id: string, expiryOnly = false): Promise<Record<string, any>[]> {
    const rows = await this.db.prepare(`SELECT data FROM documents WHERE customerId = ? AND isArchived = 0
      ${expiryOnly ? "AND expiryDate IS NOT NULL ORDER BY expiryDate ASC, json_extract(data, '$.title') ASC" : "ORDER BY createdAt DESC"}`)
      .bind(id).all<Row>()
    const docs=rows.results.map(row => JSON.parse(row.data)).filter(isAccountDocument)
    return (expiryOnly?effectiveAccountDocuments(docs).filter(doc=>!!doc.expiryDate):docs).map(doc=>({...doc,status:complianceState(doc)}))
  }

  async documentStats(id: string, now = new Date()): Promise<Record<string, number>> {
    return accountDocumentStats(await this.customerDocuments(id), now.getTime())
  }
  async complianceCustomer(value:AccountCustomer){return (await assessD1Customer(this.db,value)).customer as AccountCustomer}

  async unreadCount(user: StoredUser): Promise<number> {
    const isStaff = user.role === "staff" || user.role === "super_admin"
    const row = await this.db.prepare(`SELECT count(*) AS count FROM notifications n WHERE isRead = 0 AND (
      recipientUserId = ? OR (recipientUserId IS NULL AND (
        (? = 1 AND targetAudience IN ('staff', 'all_staff')) OR
        (? = 'super_admin' AND targetAudience = 'super_admin') OR
        (? = 0 AND targetAudience = 'customer' AND (recipientCustomerId IS NULL OR recipientCustomerId = ?)))))
      AND (json_extract(n.data,'$.requiredPermission') IS NULL OR (json_extract(n.data,'$.requiredPermission')='accounts' AND ?=1))
      AND NOT EXISTS (SELECT 1 FROM json_each(n.data, '$.readBy') r WHERE r.value = ?)`)
      .bind(user._id, isStaff ? 1 : 0, user.role, isStaff ? 1 : 0, user.customerId ?? null,canAccessAccounts(user)?1:0, user._id).first<{ count: number }>()
    return row!.count
  }

  async operationStats(id: string): Promise<Record<string, number>> {
    return (await this.db.prepare(`SELECT count(*) AS totalShipments,
      coalesce(sum(status IN ('submitted','document_required','document_under_review','quote_pending','quote_provided','quote_accepted','processing')), 0) AS activeShipments,
      coalesce(sum(status = 'completed'), 0) AS deliveredShipments FROM customer_requests WHERE customerId = ?`)
      .bind(id).first<Record<string, number>>())!
  }

  async recentInvoices(id: string): Promise<Record<string, any>[]> {
    const rows = await this.db.prepare("SELECT data FROM invoices WHERE customerId = ? ORDER BY createdAt DESC LIMIT 5").bind(id).all<Row>()
    return rows.results.map(row => JSON.parse(row.data))
  }

  async updateCustomerStatus(customer: Versioned<AccountCustomer>, patch: Record<string, unknown>, notifications: Record<string, unknown>[]): Promise<void> {
    const guardId = newAccountId()
    await this.transaction([
      this.update("customers", customer.value._id, customer.revision, patch), this.guard(guardId),
      ...notifications.map(doc => this.db.prepare("INSERT INTO notifications (id, data) VALUES (?, ?)").bind(String(doc._id), JSON.stringify(doc))),
      this.db.prepare("DELETE FROM _nilelink_write_guards WHERE id = ?").bind(guardId),
    ], { type: "customers", id: customer.value._id, label: customer.value.companyName, customerId: customer.value._id, changedFields: Object.keys(patch) })
  }
}
