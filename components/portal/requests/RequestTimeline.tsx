"use client"
import { groupTimelineEvents } from "@/lib/requests/timeline-groups"
import { serviceStyle } from "@/lib/requests/service-colors"
import { localizeTimelineEvent } from "@/lib/requests/timeline-i18n"
import { useLocale } from "next-intl"
import { serviceLabels } from "@/lib/requests/progress"
import { serviceTheme, serviceSequenceRank } from "@/lib/requests/execution"
import { serviceStages } from "@/lib/requests/tracking"

const statusText: Record<string, [string, string]> = {
  not_started: ["لم تبدأ", "Not started"],
  in_progress: ["قيد التنفيذ", "In progress"],
  completed: ["مكتملة", "Completed"],
}

export function RequestTimeline({
  events,
  services = [],
  admin = false,
}: {
  events: any[]
  services?: { serviceKey: string }[]
  admin?: boolean
}) {
  const locale = useLocale() === "ar" ? "ar" : "en"
  const ar = locale === "ar"
  const lang = ar ? 0 : 1
  const groups = groupTimelineEvents(events || [], services)
  const keys = [...groups.keys()].sort((a, b) =>
    a === "general" ? -1 : b === "general" ? 1 : serviceSequenceRank(a) - serviceSequenceRank(b)
  )

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold">
        {ar ? "سجل الطلب ومراحل الخدمات" : "Request and service history"}
      </h2>
      {keys.map(key => {
        const rows = groups
          .get(key)!
          .map((event, index) => ({ event, index }))
          .sort(
            (a, b) =>
              (Date.parse(a.event.createdAt) || 0) - (Date.parse(b.event.createdAt) || 0) ||
              a.index - b.index
          )

        return (
          <details
            style={serviceStyle(key)}
            key={key}
            open={key !== "general" || rows.length < 6}
            className={"service-history-group rounded-2xl border p-4 " + serviceTheme(key)}
          >
            <summary className="cursor-pointer font-bold">
              {key === "general"
                ? ar
                  ? "أحداث الطلب والسجل السابق"
                  : "Request events and prior history"
                : serviceLabels[key]?.[lang] || key}{" "}
              <span className="text-xs font-normal">({rows.length})</span>
            </summary>
            <ol className="service-events mt-4 border-s-2 ps-4">
              {rows.map(({ event, index }) => {
                const stage = event.stageKey
                  ? serviceStages({ serviceKey: key }).find(s => s.stageKey === event.stageKey)
                  : null
                const stageLabelOverride = stage ? (ar ? stage.labelAr : stage.labelEn) : null
                const localized = localizeTimelineEvent(event, locale, stageLabelOverride)

                return (
                  <li
                    key={event.eventId || index}
                    className="service-event relative space-y-1 py-4 text-sm first:pt-0 last:pb-0"
                  >
                    <p className="font-bold">{localized.title}</p>
                    {event.stageStatus && (
                      <p className="text-xs">
                        {event.previousStageStatus &&
                          (statusText[event.previousStageStatus]?.[lang] || event.previousStageStatus) +
                            " ← "}
                        {statusText[event.stageStatus]?.[lang] || event.stageStatus}
                      </p>
                    )}
                    {localized.commentSegments.length > 0 && (
                      <p className="whitespace-pre-wrap break-words">
                        {localized.commentSegments.map((seg, i) =>
                          seg.ltr ? (
                            <bdi key={i} dir="ltr">
                              {seg.text}
                            </bdi>
                          ) : (
                            <span key={i}>{seg.text}</span>
                          )
                        )}
                      </p>
                    )}
                    <p className="text-xs">
                      {Number.isFinite(Date.parse(event.createdAt))
                        ? new Date(event.createdAt).toLocaleString(ar ? "ar-EG" : "en-GB")
                        : "—"}
                      {admin && event.actorName ? " · " + event.actorName : ""}
                    </p>
                  </li>
                )
              })}
            </ol>
          </details>
        )
      })}
    </section>
  )
}
