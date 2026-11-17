export function expiryNotification(title: string, category: string, company: string, expiry: string | Date, daysLeft: number) {
  const expired = daysLeft <= 0
  const date = new Date(expiry).toISOString().slice(0, 10)
  return {
    title: `${expired ? "انتهاء صلاحية مستند" : "تنبيه تجديد مستند"}: ${title}`,
    message: `الشركة: ${company}. المستند: ${title}. النوع: ${category}. تاريخ انتهاء الصلاحية: ${date}. ${expired ? `منتهي منذ ${Math.abs(daysLeft)} يوم.` : `متبقي ${daysLeft} يوم على الانتهاء.`} الإجراء المطلوب: رفع نسخة مجددة من المستند لمراجعتها واعتمادها.`,
  }
}
