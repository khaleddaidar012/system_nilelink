export const serviceStatuses = ["pending", "active", "on_hold", "completed", "cancelled"] as const
export const serviceStatusLabels: Record<string, [string,string]> = {
  pending:["لم تبدأ","Not started"], active:["جارية","In progress"], in_progress:["جارية","In progress"],
  on_hold:["متوقفة مؤقتًا","On hold"], completed:["مكتملة","Completed"], done:["مكتملة","Completed"], cancelled:["ملغاة","Cancelled"],
}
export const serviceLabels: Record<string,[string,string]> = {
  sea_freight:["الشحن البحري","Sea freight"], ocean_freight:["الشحن البحري","Ocean freight"], air_freight:["الشحن الجوي","Air freight"],
  freight_booking:["حجز الشحن","Freight booking"], inland_transportation:["النقل الداخلي","Inland transportation"],
  land_freight:["النقل البري","Land freight"], land_transport:["النقل البري","Land transportation"],
  customs_clearance:["التخليص الجمركي","Customs clearance"], warehousing:["التخزين","Warehousing"], storage:["التخزين","Storage"],
  general_inquiry:["الاستفسار","General inquiry"],
}
export const canonicalServiceStatus = (status:string) => status === "in_progress" ? "active" : status === "done" ? "completed" : status
export const serviceTransitions: Record<string, readonly string[]> = {
  pending:["active","on_hold","cancelled"], active:["on_hold","completed","cancelled"],
  on_hold:["pending","active","cancelled"], completed:["active"], cancelled:["pending"],
}
