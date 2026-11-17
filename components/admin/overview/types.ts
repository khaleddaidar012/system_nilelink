export type SystemStatusLevel = "healthy" | "warning" | "critical"

export interface SystemAlertItem {
  id: string
  level: "critical" | "warning" | "info"
  source: "email" | "backup" | "agent" | "system"
  titleEn: string
  titleAr: string
  messageEn: string
  messageAr: string
  actionUrl?: string
  actionLabelEn?: string
  actionLabelAr?: string
}

export interface ActivityItem {
  id: string
  event: string
  operation: string
  result: string
  actorName?: string
  actorRole?: string
  createdAt: string
  titleEn: string
  titleAr: string
  summaryEn: string
  summaryAr: string
  actionUrl?: string
}

export interface AdminOverviewData {
  timestamp: string
  databaseProvider?: "d1" | "mongodb"
  previewOnly?: boolean
  systemStatus: SystemStatusLevel

  email: {
    provider?: string
    configured?: boolean
    deferred?: boolean
    status: "online" | "degraded" | "offline" | "unknown"
    smtpStatus: "running" | "stopped" | "not_installed" | "unknown"
    imapStatus: "running" | "stopped" | "not_installed" | "unknown"
    smtpReachable: boolean
    imapReachable: boolean
    responseTimeMs?: number
    banner?: string
    monitoring: "available" | "agent_unreachable" | "endpoint_missing" | "error" | "deferred" | "provider-api"
    agentVersion?: string
    agentSupportsMailMonitoring?: boolean
    queues: {
      inbound: number | null
      outbound: number | null
      badMail: number | null
      accessible: boolean
    }
    lastCheck: string
    lastSuccessfulCheck: string | null
    lastOutage: {
      startedAt: string
      endedAt: string | null
      reason: string
    } | null
    diagnostics: string[]
    error?: string
  }

  backups: {
    provider?: "d1"
    monitoring?: string
    firstScheduledRunObserved?: boolean
    lastScheduledCompletedAt?: string | null
    lastFailureAt?: string | null
    agentStatus: "online" | "offline" | "unknown"
    schedulerStatus: "enabled" | "disabled" | "unknown"
    nextScheduledRun: string | null
    lastCompletedAt: string | null
    latestBackupStatus: "completed" | "failed" | "running" | "quarantined" | "unknown"
    totalBackups: number
    failedBackups: number
    missedScheduledBackup: boolean
    lastSuccessfulBackupAgeHours: number | null
    isBackupOverdue: boolean
    diskSpace?: {
      freeBytes?: number
      totalBytes?: number
      freePercentage?: number
      diskLow: boolean
    }
    error?: string
  }

  employees: {
    total: number
    active: number
    inactive: number
    recentlyAdded: Array<{
      id: string
      name: string
      email: string
      jobTitle: string
      role: string
      status: string
      createdAt: string
    }>
    roleDistribution: Record<string, number>
  }

  alerts: SystemAlertItem[]
  recentActivity: ActivityItem[]
}
