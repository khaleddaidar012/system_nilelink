"use client"

import { useTranslations } from "next-intl"
import { useState } from "react"
import { motion } from "framer-motion"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Send } from "lucide-react"
import { Button } from "@/components/ui/Button"
import {BrandButton, publicBrandStyles} from "@/components/public-brand"
import { toast } from "sonner"

type ContactFormData = {
  name: string
  email: string
  phone?: string
  subject?: string
  message: string
}

export function ContactForm({branded=false}: {branded?:boolean} = {}) {
  const t = useTranslations("contact.form")
  const [loading, setLoading] = useState(false)

  const contactSchema = z.object({
    name: z.string().min(1, t("errors.nameRequired")),
    email: z.string().email(t("errors.emailInvalid")),
    phone: z.string().optional(),
    subject: z.string().optional(),
    message: z.string().min(10, t("errors.messageMin")),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
  })

  const onSubmit = async (data: ContactFormData) => {
    setLoading(true)
    try {
      const res = await fetch("/api/contact", {
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
      <form suppressHydrationWarning aria-label={t("title")} onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            {branded && <label htmlFor="full-contact-name" className={labelClass}>{t("name")}</label>}
            <input suppressHydrationWarning {...register("name")} id="full-contact-name" aria-invalid={!!errors.name} aria-describedby={errors.name ? "full-contact-name-error" : undefined} placeholder={t("name")} className={inputClass} />
            {errors.name && <p id="full-contact-name-error" role="alert" className={errorClass}>{errors.name.message}</p>}
          </div>
          <div>
            {branded && <label htmlFor="full-contact-email" className={labelClass}>{t("email")}</label>}
            <input suppressHydrationWarning type="email" dir="ltr" {...register("email")} id="full-contact-email" aria-invalid={!!errors.email} aria-describedby={errors.email ? "full-contact-email-error" : undefined} placeholder={t("email")} className={inputClass} />
            {errors.email && <p id="full-contact-email-error" role="alert" className={errorClass}>{errors.email.message}</p>}
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            {branded && <label htmlFor="full-contact-phone" className={labelClass}>{t("phone")}</label>}
            <input suppressHydrationWarning type="tel" dir="ltr" {...register("phone")} id="full-contact-phone" aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "full-contact-phone-error" : undefined} placeholder={t("phone")} className={inputClass} />
          </div>
          <div>
            {branded && <label htmlFor="full-contact-subject" className={labelClass}>{t("subject")}</label>}
            <input suppressHydrationWarning {...register("subject")} id="full-contact-subject" aria-invalid={!!errors.subject} aria-describedby={errors.subject ? "full-contact-subject-error" : undefined} placeholder={t("subject")} className={inputClass} />
          </div>
        </div>
        <div>
          {branded && <label htmlFor="full-contact-message" className={labelClass}>{t("message")}</label>}
          <textarea suppressHydrationWarning {...register("message")} id="full-contact-message" aria-invalid={!!errors.message} aria-describedby={errors.message ? "full-contact-message-error" : undefined} rows={5} placeholder={t("message")} className={inputClass} />
          {errors.message && <p id="full-contact-message-error" role="alert" className={errorClass}>{errors.message.message}</p>}
        </div>
        {branded ? <BrandButton type="submit" disabled={loading}>{t("submit")}</BrandButton> : (
        <Button type="submit" loading={loading} size="lg" className="gap-2">
          <Send className="h-4 w-4" />
          {t("submit")}
        </Button>
        )}
      </form>
    </motion.div>
  )
}
