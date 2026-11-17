export interface InvoiceEmailTemplateOptions {
  customerName: string
  invoiceNumber: string
  totalAmount: number
  currency: string
  dueDate?: string | Date | null
  token: string
  notes?: string
}

export function getInvoiceEmailTemplate(options: InvoiceEmailTemplateOptions): string {
  const formattedDueDate = options.dueDate
    ? new Date(options.dueDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "-"

  const formattedAmount = Number(options.totalAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })
  const publicViewUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://nilelink.com"}/invoice/${options.token}`

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Commercial Invoice ${options.invoiceNumber}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: #0f172a; padding: 32px; text-align: left; color: #ffffff; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
    .header p { margin: 6px 0 0 0; color: #94a3b8; font-size: 13px; }
    .content { padding: 32px; }
    .invoice-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 24px 0; }
    .row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
    .label { color: #64748b; font-weight: 500; }
    .value { color: #0f172a; font-weight: 700; }
    .total-row { border-top: 1px solid #cbd5e1; padding-top: 12px; margin-top: 12px; font-size: 16px; }
    .btn { display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: 700; font-size: 14px; margin-top: 16px; }
    .footer { padding: 24px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>NILE LINK LOGISTICS</h1>
      <p>Commercial Freight & Logistics Services</p>
    </div>
    <div class="content">
      <h2 style="font-size: 18px; margin-top: 0; color: #0f172a;">Dear ${options.customerName},</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #475569;">
        Please find attached the official commercial invoice <strong>${options.invoiceNumber}</strong> issued for your freight forwarding and logistics services.
      </p>

      <div class="invoice-box">
        <div class="row">
          <span class="label">Invoice Number:</span>
          <span class="value" style="font-family: monospace;">${options.invoiceNumber}</span>
        </div>
        <div class="row">
          <span class="label">Payment Due Date:</span>
          <span class="value">${formattedDueDate}</span>
        </div>
        <div class="row total-row">
          <span class="label" style="font-weight: 700; color: #0f172a;">Total Amount Due:</span>
          <span class="value" style="color: #2563eb; font-size: 18px;">${formattedAmount} ${options.currency}</span>
        </div>
      </div>

      <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
        A copy of the complete commercial invoice in PDF format is attached to this email for your accounting records.
      </p>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${publicViewUrl}" class="btn">View & Download Invoice Online</a>
      </div>

      <p style="font-size: 12px; color: #94a3b8; line-height: 1.5;">
        If you have any questions or require additional documentation, please contact our billing department at info@nilelinklogistics.com or call your account manager.
      </p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Nile Link Logistics S.A.E • Damietta, Egypt</p>
      <p style="margin-top: 4px;">This is an automated commercial notification.</p>
    </div>
  </div>
</body>
</html>
`
}
