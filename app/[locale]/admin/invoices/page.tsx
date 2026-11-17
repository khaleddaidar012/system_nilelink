"use client"

import { useSearchParams } from "next/navigation"
import { useState, useEffect, useCallback } from "react"
import { useLocale, useTranslations } from "next-intl"
import { AdminHeader } from "@/components/admin/AdminHeader"
import { AdminInvoiceKpis } from "@/components/admin/invoices/AdminInvoiceKpis"
import { AdminInvoicesToolbar } from "@/components/admin/invoices/AdminInvoicesToolbar"
import { AdminInvoicesTable } from "@/components/admin/invoices/AdminInvoicesTable"
import { CreateInvoiceModal } from "@/components/admin/invoices/CreateInvoiceModal"
import { EditInvoiceModal } from "@/components/admin/invoices/EditInvoiceModal"
import { InvoiceReviewDrawer } from "@/components/admin/invoices/InvoiceReviewDrawer"
import { SendInvoiceDialog } from "@/components/admin/invoices/SendInvoiceDialog"
import { Plus, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { Link } from "@/navigation"
import { useCanAccessAccounts } from "@/components/admin/AdminExperienceContext"

export default function AdminInvoicesPage() {
  const canAccessAccounts = useCanAccessAccounts()
  const searchParams=useSearchParams()
  const locale = useLocale()
  const isAr = locale === "ar"
  const t = useTranslations()

  const [invoices, setInvoices] = useState<any[]>([])
  const [metrics, setMetrics] = useState<any>({
    totalDraftCount: 0,
    totalConfirmedCount: 0,
    totalInvoicedAmount: 0,
    totalPaidAmount: 0,
    totalRemainingAmount: 0,
  })
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 })
  const [loading, setLoading] = useState(true)

  // Filters
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [documentTypeFilter, setDocumentTypeFilter] = useState("all")

  // Modals & Drawers state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  useEffect(()=>{const id=searchParams.get("edit");if(id&&/^[a-f\d]{24}$/i.test(id))setEditingInvoiceId(id)},[searchParams])
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null)
  const [sendingInvoice, setSendingInvoice] = useState<any | null>(null)

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("page", String(pagination.page))
      params.set("limit", String(pagination.limit))
      if (searchQuery.trim()) params.set("search", searchQuery.trim())
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (documentTypeFilter !== "all") params.set("documentType", documentTypeFilter)

      const res = await fetch(`/api/admin/invoices?${params.toString()}`)
      const data = await res.json()

      if (data.success) {
        setInvoices(data.invoices || [])
        if (data.pagination) setPagination(data.pagination)
        if (data.metrics) setMetrics(data.metrics)
      } else {
        toast.error(data.error || "Failed to fetch invoices")
      }
    } catch (err: any) {
      toast.error("Failed to load invoices")
    } finally {
      setLoading(false)
    }
  }, [pagination.page, pagination.limit, searchQuery, statusFilter, documentTypeFilter])

  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  const handleDeleteDraft = async (invoice: any) => {
    const confirmMsg = isAr
      ? `هل أنت متأكد من رغبتك في حذف المسودة ${invoice.invoiceNumber}؟ لا يمكن التراجع عن هذا الإجراء.`
      : `Are you sure you want to delete draft invoice ${invoice.invoiceNumber}? This action cannot be undone.`

    if (!window.confirm(confirmMsg)) return

    try {
      const res = await fetch(`/api/admin/invoices/${invoice._id}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete draft invoice")
      }
      toast.success(isAr ? "تم حذف المسودة بنجاح" : "Draft deleted successfully")
      fetchInvoices()
    } catch (err: any) {
      toast.error(err.message || "Failed to delete draft")
    }
  }

  return (
    <div className="flex flex-col min-h-full space-y-6">
      <AdminHeader
        title={isAr ? "إدارة الفواتير والماليات" : "Commercial Invoices & Billing"}
        subtitle={
          isAr
            ? "إصدار ومراجعة واعتماد الفواتير التجارية وتتبع مستحقات الشحن والتخليص الجمركي"
            : "Generate, review, and confirm freight commercial invoices and track customer payment collections"
        }
      />

      <div className="space-y-6 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8">
        {canAccessAccounts && <Link href="/admin/shipment-invoices" className="inline-flex rounded-xl border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-bold text-primary-700 dark:border-primary-900 dark:bg-primary-950 dark:text-primary-300">
          {isAr ? "حسابات وفواتير الشحنات" : "Shipment accounting & invoices"}
        </Link>}
        {/* Top Header Action Bar */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {isAr ? "نظرة عامة على الفواتير" : "Invoices Overview"}
            </h2>
            <p className="text-xs text-slate-500">
              {isAr
                ? "المستحقات، الفواتير المعتمدة، ومعدلات التحصيل"
                : "Receivables, confirmed invoices, and collection rates"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-primary-600 hover:bg-primary-500 rounded-xl shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? "إنشاء فاتورة جديدة" : "Create Invoice"}</span>
          </button>
        </div>
        {/* Summary Metric Cards */}
        <AdminInvoiceKpis metrics={metrics} />

        {/* Master Table Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <AdminInvoicesToolbar
            searchQuery={searchQuery}
            onSearchChange={(q) => {
              setSearchQuery(q)
              setPagination((p) => ({ ...p, page: 1 }))
            }}
            statusFilter={statusFilter}
            onStatusChange={(s) => {
              setStatusFilter(s)
              setPagination((p) => ({ ...p, page: 1 }))
            }}
            documentTypeFilter={documentTypeFilter}
            onDocumentTypeChange={(dt) => {
              setDocumentTypeFilter(dt)
              setPagination((p) => ({ ...p, page: 1 }))
            }}
            onRefresh={fetchInvoices}
            loading={loading}
          />

          <AdminInvoicesTable
            invoices={invoices}
            loading={loading}
            onSelectInvoice={(inv) => setSelectedInvoice(inv)}
            onEditDraft={(id) => setEditingInvoiceId(id)}
            onSendInvoice={(inv) => setSendingInvoice(inv)}
            onDeleteDraft={handleDeleteDraft}
          />

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
              <span>
                {isAr
                  ? `صفحة ${pagination.page} من ${pagination.totalPages} (${pagination.total} فاتورة)`
                  : `Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} invoices)`}
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
                </button>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {isCreateOpen && (
        <CreateInvoiceModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={() => fetchInvoices()}
        />
      )}

      {/* Edit Modal */}
      {editingInvoiceId && (
        <EditInvoiceModal
          isOpen={!!editingInvoiceId}
          onClose={() => setEditingInvoiceId(null)}
          invoiceId={editingInvoiceId}
          onSuccess={() => fetchInvoices()}
        />
      )}

      {/* Review & Confirm Drawer */}
      {selectedInvoice && (
        <InvoiceReviewDrawer
          isOpen={!!selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          invoice={selectedInvoice}
          onStatusUpdated={() => fetchInvoices()}
          onOpenEdit={(id) => setEditingInvoiceId(id)}
          onOpenSend={(inv) => setSendingInvoice(inv)}
        />
      )}

      {/* Send Email Dialog */}
      {sendingInvoice && (
        <SendInvoiceDialog
          isOpen={!!sendingInvoice}
          onClose={() => setSendingInvoice(null)}
          invoice={sendingInvoice}
          onSuccess={() => fetchInvoices()}
        />
      )}
    </div>
  )
}
