import type { Actor, Data } from "../workflows/runtime"
export function canOperateRequest(actor: Actor, request: Data): boolean {
  return actor.user.role === "super_admin" || (actor.user.role === "staff" && request.assignedStaffId === actor.user._id)
}
