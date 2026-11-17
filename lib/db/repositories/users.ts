import type { D1Binding } from "../d1"
import type { UserRole, UserStatus, IStaffPermissions } from "../../models/User"

export interface StoredUser {
  _id: string
  email: string
  username?: string | null
  passwordHash?: string
  role: UserRole
  status: UserStatus
  firstName: string
  lastName: string
  phone?: string
  avatarUrl?: string | null
  staffPermissions?: IStaffPermissions
  emailVerified?: boolean
  whatsappVerified?: boolean
  emailVerificationToken?: string | null
  emailVerificationExpires?: string | null
  emailVerificationOtp?: string | null
  emailVerificationOtpExpires?: string | null
  whatsappVerificationCode?: string | null
  whatsappVerificationExpires?: string | null
  passwordResetToken?: string | null
  passwordResetExpires?: string | null
  passwordResetOtp?: string | null
  passwordResetOtpExpires?: string | null
  passwordResetChannel?: "email" | "whatsapp" | null
  createdAt?: string
  updatedAt?: string
  customerId?: string | null
  [field: string]: unknown
}

export interface VersionedUser {
  user: StoredUser
  revision: number
}

interface UserRow {
  data: string
  revision: number
}

function readUser(row: UserRow | null, includePassword: boolean): VersionedUser | null {
  if (!row) return null
  const user = JSON.parse(row.data) as StoredUser
  if (!includePassword) delete user.passwordHash
  return { user, revision: row.revision }
}

/** New D1 repository contract; not a Mongoose document and has no save() hook. */
export class D1UsersRepository {
  private readonly db: D1Binding

  constructor(db: D1Binding) { this.db = db }

  async findById(id: string): Promise<VersionedUser | null> {
    return readUser(await this.db.prepare(
      "SELECT json_remove(data, '$.passwordHash') AS data, revision FROM users WHERE id = ?"
    ).bind(id).first<UserRow>(), false)
  }

  /** Only authentication code should use this method. Never serialize it to API responses. */
  async findForPasswordLogin(email: string): Promise<VersionedUser | null> {
    return readUser(await this.db.prepare(
      "SELECT data, revision FROM users WHERE email = ?"
    ).bind(email.trim().toLowerCase()).first<UserRow>(), true)
  }

  async findForIdentifier(identifier: string): Promise<VersionedUser | null> {
    const value = identifier.trim().toLowerCase()
    return readUser(await this.db.prepare(
      "SELECT data, revision FROM users WHERE email = ? OR username = ? ORDER BY id LIMIT 1"
    ).bind(value, value).first<UserRow>(), true)
  }
}
