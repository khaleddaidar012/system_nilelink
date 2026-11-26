import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { localizeTimelineEvent } from "../../lib/requests/timeline-i18n.ts"

test("Task 31: localizes all historical & new request timeline events in AR and EN", () => {
  const cases = [
    {
      event: { title: "Request Submitted by Client", comment: "Initial order inquiry received." },
      arTitle: "تم تقديم الطلب بواسطة العميل",
      enTitle: "Request Submitted by Client",
      arComment: "تم استلام طلب الخدمة المبدئي.",
      enComment: "Initial order inquiry received.",
    },
    {
      event: { title: "Document Required", comment: "Please upload the required documents (UCR/ACID) to proceed." },
      arTitle: "مستندات مطلوبة",
      enTitle: "Document Required",
      arComment: "يرجى رفع المستندات المطلوبة (UCR / ACID) لاستكمال الإجراءات.",
      enComment: "Please upload the required documents (UCR/ACID) to proceed.",
    },
    {
      event: { title: "Document Submitted", comment: "Pending staff review." },
      arTitle: "تم رفع المستند",
      enTitle: "Document Submitted",
      arComment: "بانتظار مراجعة فريق العمل.",
      enComment: "Pending staff review.",
    },
    {
      event: {
        title: "Direct processing / تنفيذ مباشر دون عرض سعر",
        comment: "Request workflow selected by authorized employee",
      },
      arTitle: "تنفيذ مباشر دون عرض سعر",
      enTitle: "Direct Processing",
      arComment: "تم تحديد مسار العمل بواسطة الموظف المختص.",
      enComment: "Request workflow selected by authorized employee.",
    },
    {
      event: {
        title: "Responsible employee assigned / تعيين الموظف المسؤول",
        comment: "Request workflow selected by authorized employee",
      },
      arTitle: "تعيين الموظف المسؤول",
      enTitle: "Responsible Employee Assigned",
      arComment: "تم تحديد مسار العمل بواسطة الموظف المختص.",
      enComment: "Request workflow selected by authorized employee.",
    },
    {
      event: {
        title: "Documents Approved",
        comment: "Required submitted documents verified. Preparing quotation.",
      },
      arTitle: "تم اعتماد المستندات",
      enTitle: "Documents Approved",
      arComment: "تم التحقق من المستندات المطلوبة وجارٍ تجهيز عرض السعر.",
      enComment: "Required submitted documents verified. Preparing quotation.",
    },
    {
      event: {
        title: "Order Confirmed & Processing Started",
        comment: "Your order 123456-9 is now actively processing.",
      },
      arTitle: "تم تأكيد الطلب وبدء التنفيذ",
      enTitle: "Order Confirmed & Processing Started",
      arComment: "طلبك رقم 123456-9 قيد التنفيذ الآن.",
      enComment: "Your order 123456-9 is now actively processing.",
    },
    {
      event: {
        title: "Quote Provided",
        comment: "Quote Q-2026-001 (5300 EGP) sent for review.",
      },
      arTitle: "تم إرسال عرض السعر",
      enTitle: "Quote Provided",
      arComment: "تم إرسال عرض السعر Q-2026-001 (5300 EGP) للمراجعة.",
      enComment: "Quote Q-2026-001 (5300 EGP) has been sent for review.",
    },
    {
      event: {
        title: "تم تعيين UCR / UCR provided",
        comment: "يرجى تقديم رقم UCR للطلب 123456-9.",
      },
      arTitle: "تم تعيين رقم UCR",
      enTitle: "UCR Provided",
      arComment: "يرجى تقديم رقم UCR للطلب 123456-9.",
      enComment: "Please provide the UCR number for request 123456-9.",
    },
  ]

  for (const c of cases) {
    const ar = localizeTimelineEvent(c.event, "ar")
    const en = localizeTimelineEvent(c.event, "en")
    assert.equal(ar.title, c.arTitle)
    assert.equal(en.title, c.enTitle)
    assert.equal(ar.comment, c.arComment)
    assert.equal(en.comment, c.enComment)
  }

  // Tracking number segment is marked LTR for RTL rendering
  const processingAr = localizeTimelineEvent(
    { title: "Order Confirmed & Processing Started", comment: "Your order 123456-9 is now actively processing." },
    "ar"
  )
  assert.ok(processingAr.commentSegments.some(s => s.text === "123456-9" && s.ltr === true))

  // Free-form staff comment is preserved verbatim
  const manual = localizeTimelineEvent(
    { title: "Document Rejected", comment: "يرجى إرسال نسخة أوضح من السجل التجاري" },
    "ar"
  )
  assert.equal(manual.title, "تم رفض المستند")
  assert.equal(manual.comment, "يرجى إرسال نسخة أوضح من السجل التجاري")
})

test("Task 34: EditPermissionsModal hides Tiered pricing UI and has no duplicate Accounts access checkbox", () => {
  const modalPath = resolve(process.cwd(), "components/admin/staff/EditPermissionsModal.tsx")
  const source = readFileSync(modalPath, "utf8")
  assert.ok(!source.includes("التسعير المتدرج"), "Tiered pricing label must be hidden from EditPermissionsModal")
  assert.ok(!source.includes("Tiered pricing"), "Tiered pricing label must be hidden from EditPermissionsModal")
  const accountsMatches = source.match(/id:\s*"canAccessAccounts"/g) || []
  assert.equal(accountsMatches.length, 1, "Accounts access permission must appear exactly once")
})
