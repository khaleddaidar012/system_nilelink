/** Minimal structural subset of Cloudflare's D1 binding; no MongoDB dependency. */
export type D1Value = string | number | null | ArrayBuffer | Uint8Array

export interface D1QueryResult<T = Record<string, unknown>> {
  success: boolean
  results: T[]
  meta: { changes: number; [key: string]: unknown }
  error?: string
}

export interface D1Statement {
  bind(...values: D1Value[]): D1Statement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<D1QueryResult<T>>
  run<T = Record<string, unknown>>(): Promise<D1QueryResult<T>>
}

export interface D1Binding {
  prepare(sql: string): D1Statement
  batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<D1QueryResult<T>[]>
}

/** Resolve per request: never retain a request-scoped binding globally. */
export async function getD1(): Promise<D1Binding> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare")
  const { env } = await getCloudflareContext({ async: true })
  const binding = (env as unknown as { DB?: D1Binding }).DB
  if (!binding) {
    throw new Error("D1 binding DB is missing. Configure and migrate the target database before enabling D1.")
  }
  return binding
}

/** Do not retry writes here: callers must supply domain-specific idempotency. */
export function requireD1Success<T>(result: D1QueryResult<T>): D1QueryResult<T> {
  if (!result.success) throw new Error("D1 operation failed")
  return result
}
