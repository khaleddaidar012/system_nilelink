"use client"

import { useState } from "react"
import { useLocale } from "next-intl"
import { useTheme } from "@/components/layout/ThemeProvider"
import { Moon, Sun, Globe, ChevronDown } from "lucide-react"
import { Link, usePathname } from "@/navigation"
import { CompanyStatusBadge } from "./CompanyStatusBadge"
import { usePortal } from "./PortalContext"
import { NotificationBellPopover } from "./NotificationBellPopover"
import { AccountDropdown } from "./header/AccountDropdown"
import { LiveIndicator } from "./header/LiveIndicator"
import { ChatLink } from "@/components/chat/ChatLink"

interface PortalHeaderProps {
  title?: string
  subtitle?: string
}

const languages = [
  { code: "ar", label: "العربية" },
  { code: "en", label: "English" },
]

export function PortalHeader({ title, subtitle }: PortalHeaderProps) {
  const locale = useLocale()
  const pathname = usePathname()
  const { customer } = usePortal()
  const { theme, setTheme } = useTheme()
  const [langOpen, setLangOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 sm:px-6 backdrop-blur-xl dark:border-slate-800/80 dark:bg-[#0d1322]/90 gap-2">
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <div>
          <h1 className="text-sm font-bold text-slate-900 dark:text-white sm:text-lg truncate flex items-center gap-2">
            {title || (customer ? customer.companyName : "Client Portal")}
            {customer && <CompanyStatusBadge status={customer.accountStatus} />}
          </h1>
          {subtitle && (
            <p className="hidden sm:block text-xs text-secondary-500 dark:text-secondary-400 line-clamp-1">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        {/* Language Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => setLangOpen(!langOpen)}
            className="flex items-center gap-1.5 rounded-xl border border-secondary-200/80 bg-white px-2.5 py-2 text-xs font-semibold text-secondary-700 shadow-sm transition-colors hover:bg-secondary-50 dark:border-secondary-700 dark:bg-secondary-800 dark:text-secondary-300 dark:hover:bg-secondary-700"
          >
            <Globe className="h-3.5 w-3.5" />
            <span className="uppercase">{locale}</span>
            <ChevronDown className="h-3 w-3" />
          </button>

          {langOpen && (
            <div className="absolute top-full right-0 z-50 mt-1 w-28 rounded-xl border border-secondary-200 bg-white py-1 shadow-lg dark:border-secondary-700 dark:bg-secondary-900 rtl:right-auto rtl:left-0">
              {languages.map((l) => (
                <Link
                  key={l.code}
                  href={pathname}
                  locale={l.code as any}
                  onClick={() => setLangOpen(false)}
                  className={`block px-3 py-1.5 text-xs font-medium transition-colors ${
                    locale === l.code
                      ? "bg-primary-50 font-bold text-primary-600 dark:bg-primary-950/40 dark:text-primary-400"
                      : "text-secondary-700 hover:bg-secondary-50 dark:text-secondary-300 dark:hover:bg-secondary-800"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Notifications Popover */}
        <ChatLink portal />
        <NotificationBellPopover />
        <LiveIndicator />

        {/* Theme Switcher */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="rounded-xl border border-secondary-200/80 bg-white p-2 text-secondary-600 shadow-sm transition-colors hover:bg-secondary-50 hover:text-secondary-900 dark:border-secondary-700 dark:bg-secondary-800 dark:text-secondary-300 dark:hover:bg-secondary-700 dark:hover:text-white"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <AccountDropdown />
      </div>
    </header>
  )
}
