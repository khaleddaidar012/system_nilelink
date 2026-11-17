"use client"

import { usePortalLiveRefresh } from "@/hooks/useLiveUpdates"
import { useState, useEffect, useMemo } from "react"
import { useTranslations } from "next-intl"
import { RequestTracking } from "@/components/portal/requests/RequestTracking"
import { Link } from "@/navigation"
import { PortalHeader } from "@/components/portal/PortalHeader"
import { QuoteSummaryCards } from "@/components/portal/quotes/QuoteSummaryCards"
import { QuotesToolbar } from "@/components/portal/quotes/QuotesToolbar"
import { QuotesTable } from "@/components/portal/quotes/QuotesTable"
import { QuoteDetailsModal } from "@/components/portal/quotes/QuoteDetailsModal"

export default function PortalQuotesPage() {
  const t = useTranslations()
  const [quotes, setQuotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // Search & Filters State
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  
  // Modal State
  const [selectedQuote, setSelectedQuote] = useState<any | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const fetchQuotes = async (background = false) => {
    if (!background) setLoading(true)
    try {
      const res = await fetch("/api/portal/quotes", {cache:"no-store"})
      const data = await res.json()
      if (data.quotes) {
        setQuotes(data.quotes)
        setSelectedQuote((current: any) => current ? data.quotes.find((quote: any) => quote._id === current._id) || null : null)
      }
    } catch { /* Keep the previous data while offline. */ } finally {
      if (!background) setLoading(false)
    }
  }

  useEffect(() => {
    fetchQuotes()
  }, [])

  usePortalLiveRefresh(() => { void fetchQuotes(true) }, ["quote_updated", "request_updated"])

  // Derived state for summary cards
  const summaryData = useMemo(() => {
    return {
      total: quotes.length,
      sent: quotes.filter(q => q.status === "sent").length,
      accepted: quotes.filter(q => ["accepted","partially_accepted"].includes(q.status)).length,
      rejected: quotes.filter(q => q.status === "rejected").length,
      pending: quotes.filter(q => ["draft", "pending", "viewed"].includes(q.status)).length,
      valuesByCurrency: quotes.reduce((totals: Record<string,number>, quote) => { const currency=quote.currency || "EGP"; totals[currency]=(totals[currency] || 0)+Number(quote.totalAmount || 0); return totals }, {}),
      totalValue: quotes.reduce((acc, q) => acc + (q.totalAmount || 0), 0)
    }
  }, [quotes])

  // Filtered quotes for the table
  const filteredQuotes = useMemo(() => {
    return quotes.filter(q => {
      const matchesSearch = searchQuery === "" || 
        q.quoteNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.requestNumber?.toLowerCase().includes(searchQuery.toLowerCase())
      
      const matchesStatus = statusFilter === "all" || q.status === statusFilter
      
      return matchesSearch && matchesStatus
    })
  }, [quotes, searchQuery, statusFilter])

  const handleViewQuote = (quote: any) => {
    setSelectedQuote(quote)
    setIsModalOpen(true)
  }

  return (
    <div className="flex flex-col min-h-full bg-slate-50/50 dark:bg-slate-900/50">
      <PortalHeader
        title={t("portal.sidebar.quotes") || "Quotes"}
        subtitle={t("portal.quotes.subtitle") || "Review and manage shipping quotes sent to your company."}
      />

      <div className="space-y-6 p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto w-full">
        <QuoteSummaryCards data={summaryData} loading={loading} />
        {filteredQuotes.filter(quote=>["accepted","partially_accepted"].includes(quote.status)).map(quote=><section key={quote._id} className="space-y-3"><Link className="text-sm font-bold text-primary-600" href={`/portal/requests/${quote.requestId?._id || quote.requestId}`}>{quote.requestNumber || quote.quoteNumber}</Link><RequestTracking requestId={quote.requestId?._id || quote.requestId} /></section>)}
        
        <div className="flex flex-col rounded-2xl border border-secondary-200/80 bg-white shadow-sm dark:border-secondary-800 dark:bg-secondary-900 overflow-hidden">
          <QuotesToolbar 
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
          />
          
          <QuotesTable 
            quotes={filteredQuotes} 
            loading={loading} 
            onViewDetails={handleViewQuote} 
          />
        </div>
      </div>

      <QuoteDetailsModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        quote={selectedQuote} 
        onQuoteUpdated={(updatedQuote:any) => { if(updatedQuote){setQuotes(current=>current.map(row=>row._id===updatedQuote._id?{...row,...updatedQuote}:row));setSelectedQuote((current:any)=>current?{...current,...updatedQuote}:null)} void fetchQuotes(true) }}
      />
    </div>
  )
}
