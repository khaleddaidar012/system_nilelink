"use client"

import { useTranslations } from "next-intl"
import { useState } from "react"
import { motion } from "framer-motion"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { Send } from "lucide-react"
import { Button } from "@/components/ui/Button"
import {BrandButton, publicBrandStyles} from "@/components/public-brand"
import { toast } from "sonner"
import { quoteFormSchema, type QuoteFormData } from "@/types/quote"

export function QuoteForm({branded=false}: {branded?:boolean} = {}) {
  const t = useTranslations("quote.form")
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<QuoteFormData>({
    resolver: zodResolver(quoteFormSchema),
  })

  const onSubmit = async (data: QuoteFormData) => {
    setLoading(true)
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.message || t("error"))
      }

      toast.success(result.message || t("success"))
      reset()
    } catch (err) {
      const message = err instanceof Error ? err.message : t("error")
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const inputClass = branded ? publicBrandStyles.control : "w-full rounded-xl border border-secondary-200 bg-white px-4 py-3 text-sm text-secondary-900 placeholder-secondary-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-secondary-700 dark:bg-secondary-800 dark:text-white dark:placeholder-secondary-500"
  const errorClass = branded ? publicBrandStyles.error : "mt-1 text-xs text-error"
  const labelClass = branded ? publicBrandStyles.label : "mb-1.5 block text-sm font-medium text-secondary-700 dark:text-secondary-300"
  const Title = branded ? "h3" : "h2"

  return (
    <motion.div
      initial={branded ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      {!branded && <Title className={branded ? publicBrandStyles.cardHeading : "mb-8 text-2xl font-bold text-secondary-900 dark:text-white"}>
        {t("title")}
      </Title>}

      <form suppressHydrationWarning aria-label={t("title")} onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="full-quote-firstName" className={labelClass}>
              {t("firstName")} *
            </label>
            <input suppressHydrationWarning {...register("firstName")} id="full-quote-firstName" aria-invalid={!!errors.firstName} aria-describedby={errors.firstName ? "full-quote-firstName-error" : undefined} className={inputClass} />
            {errors.firstName && <p id="full-quote-firstName-error" role="alert" className={errorClass}>{errors.firstName.message}</p>}
          </div>
          <div>
            <label htmlFor="full-quote-lastName" className={labelClass}>
              {t("lastName")} *
            </label>
            <input suppressHydrationWarning {...register("lastName")} id="full-quote-lastName" aria-invalid={!!errors.lastName} aria-describedby={errors.lastName ? "full-quote-lastName-error" : undefined} className={inputClass} />
            {errors.lastName && <p id="full-quote-lastName-error" role="alert" className={errorClass}>{errors.lastName.message}</p>}
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="full-quote-company" className={labelClass}>
              {t("company")}
            </label>
            <input suppressHydrationWarning {...register("company")} id="full-quote-company" aria-invalid={!!errors.company} aria-describedby={errors.company ? "full-quote-company-error" : undefined} className={inputClass} />
          </div>
          <div>
            <label htmlFor="full-quote-email" className={labelClass}>
              {t("email")} *
            </label>
            <input suppressHydrationWarning type="email" dir="ltr" {...register("email")} id="full-quote-email" aria-invalid={!!errors.email} aria-describedby={errors.email ? "full-quote-email-error" : undefined} className={inputClass} />
            {errors.email && <p id="full-quote-email-error" role="alert" className={errorClass}>{errors.email.message}</p>}
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="full-quote-phone" className={labelClass}>
              {t("phone")} *
            </label>
            <input suppressHydrationWarning type="tel" dir="ltr" {...register("phone")} id="full-quote-phone" aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "full-quote-phone-error" : undefined} className={inputClass} />
            {errors.phone && <p id="full-quote-phone-error" role="alert" className={errorClass}>{errors.phone.message}</p>}
          </div>
          <div>
            <label htmlFor="full-quote-freightType" className={labelClass}>
              {t("freightType")} *
            </label>
            <select suppressHydrationWarning {...register("freightType")} id="full-quote-freightType" aria-invalid={!!errors.freightType} aria-describedby={errors.freightType ? "full-quote-freightType-error" : undefined} className={inputClass}>
              <option value="air">{t("freightAir")}</option>
              <option value="road">{t("freightRoad")}</option>
              <option value="ocean">{t("freightOcean")}</option>
            </select>
            {errors.freightType && <p id="full-quote-freightType-error" role="alert" className={errorClass}>{errors.freightType.message}</p>}
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <label htmlFor="full-quote-weight" className={labelClass}>
              {t("weight")}
            </label>
            <input suppressHydrationWarning type="number" {...register("weight")} id="full-quote-weight" aria-invalid={!!errors.weight} aria-describedby={errors.weight ? "full-quote-weight-error" : undefined} className={inputClass} />
          </div>
          <div>
            <label htmlFor="full-quote-quantity" className={labelClass}>
              {t("quantity")}
            </label>
            <input suppressHydrationWarning type="number" {...register("quantity")} id="full-quote-quantity" aria-invalid={!!errors.quantity} aria-describedby={errors.quantity ? "full-quote-quantity-error" : undefined} className={inputClass} />
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="full-quote-from" className={labelClass}>
              {t("from")} *
            </label>
            <input suppressHydrationWarning {...register("from")} id="full-quote-from" aria-invalid={!!errors.from} aria-describedby={errors.from ? "full-quote-from-error" : undefined} className={inputClass} />
            {errors.from && <p id="full-quote-from-error" role="alert" className={errorClass}>{errors.from.message}</p>}
          </div>
          <div>
            <label htmlFor="full-quote-to" className={labelClass}>
              {t("to")} *
            </label>
            <input suppressHydrationWarning {...register("to")} id="full-quote-to" aria-invalid={!!errors.to} aria-describedby={errors.to ? "full-quote-to-error" : undefined} className={inputClass} />
            {errors.to && <p id="full-quote-to-error" role="alert" className={errorClass}>{errors.to.message}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="full-quote-notes" className={labelClass}>
            {t("notes")}
          </label>
          <textarea suppressHydrationWarning {...register("notes")} id="full-quote-notes" aria-invalid={!!errors.notes} aria-describedby={errors.notes ? "full-quote-notes-error" : undefined} rows={3} className={inputClass} />
        </div>

        {branded ? <BrandButton type="submit" disabled={loading}>{t("submit")}</BrandButton> : (
        <Button type="submit" loading={loading} size="lg" className="w-full gap-2 sm:w-auto">
          <Send className="h-4 w-4" />
          {t("submit")}
        </Button>
        )}
      </form>
    </motion.div>
  )
}
