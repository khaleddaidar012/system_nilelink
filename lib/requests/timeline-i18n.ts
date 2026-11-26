export type TimelineLocale = "ar" | "en"

export interface TimelineTextSegment {
  text: string
  ltr?: boolean
}

export interface LocalizedTimelineEvent {
  title: string
  comment: string
  commentSegments: TimelineTextSegment[]
}

const normalize = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")

const normalizeLower = (value: unknown) => normalize(value).toLowerCase()

const hasArabic = (value: string) => /[\u0600-\u06FF]/.test(value)
const hasLatin = (value: string) => /[A-Za-z]/.test(value)

const REQUEST_STATUS_LABELS: Record<string, [string, string]> = {
  submitted: ["تم تقديم الطلب", "Submitted"],
  document_required: ["مستندات مطلوبة", "Documents Required"],
  document_under_review: ["المستندات قيد المراجعة", "Documents Under Review"],
  quote_pending: ["بانتظار عرض السعر", "Quote Pending"],
  quote_provided: ["تم إرسال عرض السعر", "Quote Provided"],
  quote_accepted: ["تم قبول عرض السعر", "Quote Accepted"],
  quote_rejected: ["تم رفض عرض السعر", "Quote Rejected"],
  processing: ["قيد التنفيذ", "Processing"],
  completed: ["مكتمل", "Completed"],
  cancelled: ["ملغي", "Cancelled"],
  pending: ["قيد الانتظار", "Pending"],
  active: ["نشط", "Active"],
}

const EXACT_TITLE_MAP: Record<string, [string, string]> = {
  "request submitted by client": ["تم تقديم الطلب بواسطة العميل", "Request Submitted by Client"],
  "request submitted": ["تم تقديم الطلب", "Request Submitted"],
  "document required": ["مستندات مطلوبة", "Document Required"],
  "documents required": ["مستندات مطلوبة", "Documents Required"],
  "document submitted": ["تم رفع المستند", "Document Submitted"],
  "documents submitted": ["تم رفع المستندات", "Documents Submitted"],
  "account documents confirmed": ["تم تأكيد مستندات الحساب", "Account Documents Confirmed"],
  "documents approved": ["تم اعتماد المستندات", "Documents Approved"],
  "document approved": ["تم اعتماد المستند", "Document Approved"],
  "document rejected": ["تم رفض المستند", "Document Rejected"],
  "documents rejected": ["تم رفض المستندات", "Documents Rejected"],
  "documents under review": ["المستندات قيد المراجعة", "Documents Under Review"],
  "direct processing": ["تنفيذ مباشر دون عرض سعر", "Direct Processing"],
  "quotation required": ["عرض سعر مطلوب", "Quotation Required"],
  "responsible employee assigned": ["تعيين الموظف المسؤول", "Responsible Employee Assigned"],
  "order confirmed & processing started": ["تم تأكيد الطلب وبدء التنفيذ", "Order Confirmed & Processing Started"],
  "quote provided": ["تم إرسال عرض السعر", "Quote Provided"],
  "quote updated": ["تم تحديث عرض السعر", "Quote Updated"],
  "schedule & quote provided": ["تم إرسال الجدول وعرض السعر", "Schedule & Quote Provided"],
  "quote accepted": ["تم قبول عرض السعر", "Quote Accepted"],
  "quotation accepted": ["تم قبول عرض السعر", "Quotation Accepted"],
  "quote rejected": ["تم رفض عرض السعر", "Quote Rejected"],
  "quotation rejected": ["تم رفض عرض السعر", "Quotation Rejected"],
  "existing agreement applied": ["تم تطبيق اتفاق السعر السابق", "Existing Agreement Applied"],
  "service activated": ["تم تفعيل الخدمة", "Service Activated"],
  "service not accepted": ["لم يتم قبول الخدمة", "Service Not Accepted"],
  "service added": ["تمت إضافة الخدمة", "Service Added"],
  "service completed": ["اكتملت الخدمة", "Service Completed"],
  "request completed": ["تم الانتهاء من الطلب", "Request Completed"],
  "historical completion reviewed": ["تمت مراجعة اكتمال الطلب", "Historical Completion Reviewed"],
  "request update": ["تحديث على الطلب", "Request Update"],
  "ucr requested": ["مطلوب رقم UCR", "UCR Requested"],
  "ucr provided": ["تم تعيين رقم UCR", "UCR Provided"],
  "ucr issued": ["تم إصدار رقم UCR", "UCR Issued"],
  "customer ucr received": ["تم استلام رقم UCR من العميل", "Customer UCR Received"],
  "acid requested": ["مطلوب رقم ACID", "ACID Requested"],
  "acid issued": ["تم إصدار رقم ACID", "ACID Issued"],
  "final shipment documents uploaded": ["تم رفع المستندات النهائية للشحنة", "Final Shipment Documents Uploaded"],
  "final document archived": ["تم أرشفة مستند نهائي", "Final Document Archived"],
  "customs manifest processed": ["تمت معالجة البيان الجمركي", "Customs Manifest Processed"],
}

const EXACT_COMMENT_MAP: Record<string, [string, string]> = {
  "initial order inquiry received.": ["تم استلام طلب الخدمة المبدئي.", "Initial order inquiry received."],
  "initial request created.": ["تم إنشاء الطلب المبدئي.", "Initial request created."],
  "please upload the required documents (ucr/acid) to proceed.": [
    "يرجى رفع المستندات المطلوبة (UCR / ACID) لاستكمال الإجراءات.",
    "Please upload the required documents (UCR/ACID) to proceed.",
  ],
  "pending staff review.": ["بانتظار مراجعة فريق العمل.", "Pending staff review."],
  "customer uploaded the required document. pending staff review.": [
    "قام العميل برفع المستند المطلوب، وبانتظار مراجعة فريق العمل.",
    "Customer uploaded the required document. Pending staff review.",
  ],
  "customer confirmed use of verified account documents for this request.": [
    "أكد العميل استخدام مستندات الحساب المعتمدة لهذا الطلب.",
    "Customer confirmed use of verified account documents for this request.",
  ],
  "required submitted documents verified. preparing quotation.": [
    "تم التحقق من المستندات المطلوبة وجارٍ تجهيز عرض السعر.",
    "Required submitted documents verified. Preparing quotation.",
  ],
  "required document verified. proceeding to quotation.": [
    "تم التحقق من المستند المطلوب وجارٍ تجهيز عرض السعر.",
    "Required document verified. Proceeding to quotation.",
  ],
  "awaiting review of submitted documents.": [
    "بانتظار مراجعة المستندات المرفوعة.",
    "Awaiting review of submitted documents.",
  ],
  "request workflow selected by authorized employee": [
    "تم تحديد مسار العمل بواسطة الموظف المختص.",
    "Request workflow selected by authorized employee.",
  ],
  "the customer has accepted the quotation.": [
    "قام العميل بقبول عرض السعر.",
    "The customer has accepted the quotation.",
  ],
  "the customer has rejected the quotation.": [
    "قام العميل برفض عرض السعر.",
    "The customer has rejected the quotation.",
  ],
  "the status of your service request has been updated.": [
    "تم تحديث حالة طلب الخدمة الخاص بك.",
    "The status of your service request has been updated.",
  ],
  "your request has been updated.": [
    "تم تحديث طلبك.",
    "Your request has been updated.",
  ],
  "service selected during request creation.": [
    "تم اختيار الخدمة أثناء إنشاء الطلب.",
    "Service selected during request creation.",
  ],
}

function splitBilingualSlash(raw: string): { ar?: string; en?: string } | null {
  const parts = raw.split(/\s+\/\s+/)
  if (parts.length !== 2) return null
  const [first, second] = parts.map(p => p.trim())
  if (!first || !second) return null
  const firstAr = hasArabic(first)
  const secondAr = hasArabic(second)
  if (firstAr && !secondAr && hasLatin(second)) return { ar: first, en: second }
  if (!firstAr && hasLatin(first) && secondAr) return { ar: second, en: first }
  return null
}

function translateStatusToken(raw: string, locale: TimelineLocale): string | null {
  const key = normalizeLower(raw).replace(/\s+/g, "_")
  const entry = REQUEST_STATUS_LABELS[key]
  if (!entry) return null
  return locale === "ar" ? entry[0] : entry[1]
}

export function localizeTimelineTitle(rawTitle: unknown, locale: TimelineLocale): string {
  const raw = normalize(rawTitle)
  if (!raw) return ""
  const langIdx = locale === "ar" ? 0 : 1

  const bilingual = splitBilingualSlash(raw)
  if (bilingual) {
    const enMapped = bilingual.en ? EXACT_TITLE_MAP[normalizeLower(bilingual.en)] : undefined
    if (enMapped) return enMapped[langIdx]
    const candidate = locale === "ar" ? bilingual.ar : bilingual.en
    if (candidate) {
      const mapped = EXACT_TITLE_MAP[normalizeLower(candidate)]
      return mapped ? mapped[langIdx] : candidate
    }
  }

  const exact = EXACT_TITLE_MAP[normalizeLower(raw)]
  if (exact) return exact[langIdx]

  const complianceMatch = raw.match(/^(UCR|ACID)\s+(Issued|Requested)$/i)
  if (complianceMatch) {
    const type = complianceMatch[1].toUpperCase()
    const verb = complianceMatch[2].toLowerCase()
    if (verb === "issued") return locale === "ar" ? `تم إصدار رقم ${type}` : `${type} Issued`
    return locale === "ar" ? `مطلوب رقم ${type}` : `${type} Requested`
  }

  const statusTitle = translateStatusToken(raw, locale)
  if (statusTitle) return statusTitle

  return raw
}

function segmentsToString(segments: TimelineTextSegment[]): string {
  return segments.map(s => s.text).join("")
}

export function localizeTimelineComment(rawComment: unknown, locale: TimelineLocale): {
  text: string
  segments: TimelineTextSegment[]
} {
  const raw = normalize(rawComment)
  if (!raw) return { text: "", segments: [] }
  const langIdx = locale === "ar" ? 0 : 1

  const exact = EXACT_COMMENT_MAP[normalizeLower(raw)]
  if (exact) {
    const text = exact[langIdx]
    return { text, segments: [{ text }] }
  }

  // "Your order <tracking> is now actively processing."
  const orderProcessing = raw.match(/^Your order (.+?) is now actively processing\.?$/i)
  if (orderProcessing) {
    const tracking = orderProcessing[1].trim()
    const segments: TimelineTextSegment[] = locale === "ar"
      ? [{ text: "طلبك رقم " }, { text: tracking, ltr: true }, { text: " قيد التنفيذ الآن." }]
      : [{ text: "Your order " }, { text: tracking, ltr: true }, { text: " is now actively processing." }]
    return { text: segmentsToString(segments), segments }
  }

  // "The shipment is now actively processing based on Quote <quoteNumber>."
  const shipmentQuoteProcessing = raw.match(/^The shipment is now actively processing based on Quote (.+?)\.?$/i)
  if (shipmentQuoteProcessing) {
    const quoteNo = shipmentQuoteProcessing[1].trim()
    const segments: TimelineTextSegment[] = locale === "ar"
      ? [{ text: "الشحنة قيد التنفيذ الآن بناءً على عرض السعر " }, { text: quoteNo, ltr: true }, { text: "." }]
      : [{ text: "The shipment is now actively processing based on Quote " }, { text: quoteNo, ltr: true }, { text: "." }]
    return { text: segmentsToString(segments), segments }
  }

  // "Quote <Q> (<AMT> <CUR>) sent for review." or "... has been (updated and )?sent to customer for review."
  const quoteSent = raw.match(/^Quote\s+([^\s(]+)\s+\(([^)]+)\)\s+(?:has been\s+)?(updated and sent|sent)(?:\s+to customer)?\s+for review\.?$/i)
  if (quoteSent) {
    const [, quoteNo, amountStr, actionVerb] = quoteSent
    const isUpdated = actionVerb.toLowerCase().includes("updated")
    const segments: TimelineTextSegment[] = locale === "ar"
      ? [
          { text: isUpdated ? "تم تحديث وإرسال عرض السعر " : "تم إرسال عرض السعر " },
          { text: quoteNo, ltr: true },
          { text: " (" },
          { text: amountStr, ltr: true },
          { text: ") للمراجعة." },
        ]
      : [
          { text: "Quote " },
          { text: quoteNo, ltr: true },
          { text: " (" },
          { text: amountStr, ltr: true },
          { text: isUpdated ? ") has been updated and sent for review." : ") has been sent for review." },
        ]
    return { text: segmentsToString(segments), segments }
  }

  // "Customer accepted/rejected quote <Q>."
  const customerQuoteDecision = raw.match(/^Customer (accepted|rejected) quote ([^.]+?)\.(?:\s*Operations will now commence\.)?$/i)
  if (customerQuoteDecision) {
    const accepted = customerQuoteDecision[1].toLowerCase() === "accepted"
    const quoteNo = customerQuoteDecision[2].trim()
    const segments: TimelineTextSegment[] = locale === "ar"
      ? [
          { text: accepted ? "قام العميل بقبول عرض السعر " : "قام العميل برفض عرض السعر " },
          { text: quoteNo, ltr: true },
          { text: "." },
        ]
      : [
          { text: accepted ? "Customer accepted quote " : "Customer rejected quote " },
          { text: quoteNo, ltr: true },
          { text: "." },
        ]
    return { text: segmentsToString(segments), segments }
  }

  // "Quote <Q>"
  const shortQuote = raw.match(/^Quote\s+([A-Za-z0-9_-]+)$/i)
  if (shortQuote) {
    const quoteNo = shortQuote[1].trim()
    const segments: TimelineTextSegment[] = locale === "ar"
      ? [{ text: "عرض السعر " }, { text: quoteNo, ltr: true }]
      : [{ text: "Quote " }, { text: quoteNo, ltr: true }]
    return { text: segmentsToString(segments), segments }
  }

  // "The <UCR|ACID> number has been (successfully )?issued: <NUM>."
  const complianceIssued = raw.match(/^The (UCR|ACID) number has been (?:successfully )?issued:\s*(.+?)\.?$/i)
  if (complianceIssued) {
    const type = complianceIssued[1].toUpperCase()
    const num = complianceIssued[2].trim()
    const segments: TimelineTextSegment[] = locale === "ar"
      ? [{ text: `تم إصدار رقم ${type}: ` }, { text: num, ltr: true }, { text: "." }]
      : [{ text: `The ${type} number has been issued: ` }, { text: num, ltr: true }, { text: "." }]
    return { text: segmentsToString(segments), segments }
  }

  // "Customer requested the <UCR|ACID> number for <TRK>."
  const complianceReq = raw.match(/^Customer requested the (UCR|ACID) number for (.+?)\.?$/i)
  if (complianceReq) {
    const type = complianceReq[1].toUpperCase()
    const trk = complianceReq[2].trim()
    const segments: TimelineTextSegment[] = locale === "ar"
      ? [{ text: `طلب العميل استخراج رقم ${type} للطلب ` }, { text: trk, ltr: true }, { text: "." }]
      : [{ text: `Customer requested the ${type} number for ` }, { text: trk, ltr: true }, { text: "." }]
    return { text: segmentsToString(segments), segments }
  }

  // "The customer has requested to get the <UCR|ACID> number to complete the request."
  const complianceReq2 = raw.match(/^The customer has requested to get the (UCR|ACID) number to complete the request\.?$/i)
  if (complianceReq2) {
    const type = complianceReq2[1].toUpperCase()
    const text = locale === "ar"
      ? `طلب العميل استخراج رقم ${type} لاستكمال الطلب.`
      : `The customer requested the ${type} number to complete the request.`
    return { text, segments: [{ text }] }
  }

  // "يرجى تقديم رقم UCR للطلب <TRK>."
  const arUcrRequest = raw.match(/^يرجى تقديم رقم UCR للطلب\s+(.+?)\.?$/)
  if (arUcrRequest) {
    const trk = arUcrRequest[1].trim()
    const segments: TimelineTextSegment[] = locale === "ar"
      ? [{ text: "يرجى تقديم رقم UCR للطلب " }, { text: trk, ltr: true }, { text: "." }]
      : [{ text: "Please provide the UCR number for request " }, { text: trk, ltr: true }, { text: "." }]
    return { text: segmentsToString(segments), segments }
  }

  // "<N> مستند / document(s)"
  const finalDocsCount = raw.match(/^(\d+)\s+مستند\s*\/\s*document\(s\)$/i)
  if (finalDocsCount) {
    const n = finalDocsCount[1]
    const segments: TimelineTextSegment[] = locale === "ar"
      ? [{ text: n, ltr: true }, { text: " مستند" }]
      : [{ text: n, ltr: true }, { text: Number(n) === 1 ? " document" : " documents" }]
    return { text: segmentsToString(segments), segments }
  }

  // "A schedule has been provided for <TRK>."
  const scheduleProvided = raw.match(/^A schedule has been provided for (.+?)\.?$/i)
  if (scheduleProvided) {
    const trk = scheduleProvided[1].trim()
    const segments: TimelineTextSegment[] = locale === "ar"
      ? [{ text: "تم إرسال الجدول الزمني للطلب " }, { text: trk, ltr: true }, { text: "." }]
      : [{ text: "A schedule has been provided for " }, { text: trk, ltr: true }, { text: "." }]
    return { text: segmentsToString(segments), segments }
  }

  // "The uploaded document was rejected. Reason: <REASON>. Please re-upload."
  const docRejected = raw.match(/^The uploaded document was rejected\. Reason:\s*(.+?)\.?\s*Please re-upload\.?$/i)
  if (docRejected) {
    const reason = docRejected[1].trim()
    const text = locale === "ar"
      ? `تم رفض المستند المرفوع. السبب: ${reason}. يرجى إعادة الرفع.`
      : `The uploaded document was rejected. Reason: ${reason}. Please re-upload.`
    return { text, segments: [{ text }] }
  }

  // 'Your request "<SUBJ>" is now <STATUS>.'
  const reqStatusNow = raw.match(/^Your request "(.+?)" is now (.+?)\.?$/i)
  if (reqStatusNow) {
    const subj = reqStatusNow[1].trim()
    const translatedStatus = translateStatusToken(reqStatusNow[2], locale) || reqStatusNow[2].trim()
    const text = locale === "ar"
      ? `أصبحت حالة طلبك «${subj}» الآن: ${translatedStatus}.`
      : `Your request "${subj}" is now ${translatedStatus}.`
    return { text, segments: [{ text }] }
  }

  // Bilingual slash fallback for comments
  const bilingual = splitBilingualSlash(raw)
  if (bilingual) {
    const text = (locale === "ar" ? bilingual.ar : bilingual.en) || raw
    return { text, segments: [{ text }] }
  }

  // Preserve free-form staff comments as written
  return { text: raw, segments: [{ text: raw }] }
}

export function localizeTimelineEvent(
  event: { eventType?: string; title?: string; comment?: string; stageLabelAr?: string; stageLabelEn?: string },
  locale: TimelineLocale,
  stageLabelOverride?: string | null
): LocalizedTimelineEvent {
  const ar = locale === "ar"
  let title = ""
  if (event.eventType === "request_completed") {
    title = ar ? "تم الانتهاء من الطلب" : "Request Completed"
  } else if (event.eventType === "service_completed") {
    title = ar ? "اكتملت الخدمة — التالية جاهزة للبدء" : "Service completed — the next service is ready"
  } else if (stageLabelOverride) {
    title = stageLabelOverride
  } else if (ar && event.stageLabelAr) {
    title = event.stageLabelAr
  } else if (!ar && event.stageLabelEn) {
    title = event.stageLabelEn
  } else {
    title = localizeTimelineTitle(event.title, locale)
  }

  const localizedComment = localizeTimelineComment(event.comment, locale)
  return {
    title,
    comment: localizedComment.text,
    commentSegments: localizedComment.segments,
  }
}
