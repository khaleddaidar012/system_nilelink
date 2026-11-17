export interface StatementEmailTemplateOptions {
  customerName: string
  periodStr: string
  openingBalance: number
  totalDebit: number
  totalCredit: number
  closingBalance: number
  currency: string
  customMessage?: string
}

export function getStatementEmailTemplate(options: StatementEmailTemplateOptions): string {
  const opFormatted = Number(options.openingBalance).toLocaleString("en-US", { minimumFractionDigits: 2 })
  const debFormatted = Number(options.totalDebit).toLocaleString("en-US", { minimumFractionDigits: 2 })
  const credFormatted = Number(options.totalCredit).toLocaleString("en-US", { minimumFractionDigits: 2 })
  const closeFormatted = Number(options.closingBalance).toLocaleString("en-US", { minimumFractionDigits: 2 })

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>كشف حساب مالي - Nile Link Logistics</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; direction: rtl; text-align: right; }
    .card { max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: #0f172a; padding: 28px 32px; color: #ffffff; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
    .header p { margin: 6px 0 0 0; color: #94a3b8; font-size: 13px; }
    .content { padding: 32px; }
    .kpi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 20px 0; }
    .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; }
    .kpi-label { font-size: 11px; color: #64748b; font-weight: 700; margin-bottom: 4px; }
    .kpi-value { font-size: 16px; font-weight: 800; font-family: monospace; color: #0f172a; }
    .highlight-due { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px; text-align: center; margin: 20px 0; }
    .due-amount { font-size: 24px; font-weight: 900; color: #1d4ed8; font-family: monospace; }
    .notice { background: #fefce8; border-right: 4px solid #eab308; padding: 14px; border-radius: 6px; font-size: 13px; color: #854d0e; margin: 20px 0; }
    .footer { padding: 24px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>شركة نايل لينك للخدمات اللوجستية</h1>
      <p>Nile Link Logistics S.A.E — الإدارة المالية وإدارة الحسابات</p>
    </div>
    <div class="content">
      <h2 style="font-size: 18px; margin-top: 0; color: #0f172a;">السادة / ${options.customerName} المحترمون،</h2>
      <p style="font-size: 14px; line-height: 1.7; color: #475569;">
        تحية طيبة وبعد،<br>
        مرفق لكم طيه كشف الحساب المالي المعتمد عن الفترة: <strong>${options.periodStr}</strong>، متضمناً كافة المعاملات اللوجستية ومطالبات الشحن والمبالغ المسددة.
      </p>

      ${options.customMessage ? `
      <div style="background: #f1f5f9; padding: 14px; border-radius: 8px; font-size: 13px; color: #334155; margin: 16px 0;">
        ${options.customMessage}
      </div>
      ` : ""}

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">الرصيد الافتتاحي</div>
          <div class="kpi-value">${opFormatted} ${options.currency}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">إجمالي الفواتير والرسوم</div>
          <div class="kpi-value" style="color: #e11d48;">+${debFormatted} ${options.currency}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">إجمالي المدفوعات المسددة</div>
          <div class="kpi-value" style="color: #16a34a;">-${credFormatted} ${options.currency}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">عدد المعاملات</div>
          <div class="kpi-value">${options.periodStr}</div>
        </div>
      </div>

      <div class="highlight-due">
        <div style="font-size: 12px; font-weight: bold; color: #1e40af; margin-bottom: 4px;">صافي الرصيد الختامي المستحق (Closing Balance)</div>
        <div class="due-amount">${closeFormatted} ${options.currency}</div>
      </div>

      <div class="notice">
        📌 <strong>ملاحظة هامة:</strong> يرجى الاطلاع على ملف PDF المرفق بهذا البريد لمراجعة جدول حركات الحساب التفصيلي.
      </div>
    </div>
    <div class="footer">
      <p style="margin: 0 0 4px 0;"><strong>نايل لينك للخدمات اللوجستية ش.م.م</strong></p>
      <p style="margin: 0;">هاتف: 01000018549 | بريد إلكتروني: info@nilelinklogistics.com | مصر</p>
    </div>
  </div>
</body>
</html>
`
}
