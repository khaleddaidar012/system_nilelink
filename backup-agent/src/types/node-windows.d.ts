declare module "node-windows" {
  export class Service {
    constructor(config: {
      name: string
      description?: string
      script: string
      nodeOptions?: string[]
      wait?: number
      grow?: number
      maxRetries?: number
      env?: Array<{ name: string; value: string }>
    })
    on(event: string, callback: (...args: any[]) => void): void
    install(): void
    uninstall(): void
    start(): void
    stop(): void
    restart(): void
    exists: boolean
  }
}
