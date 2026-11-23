import type {AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes} from "react"
import {AlertCircle, CheckCircle2} from "lucide-react"
import styles from "./public-brand.module.css"
import "./fonts.css"

const classes = (...values: (string | undefined | false)[]) => values.filter(Boolean).join(" ")
export const publicBrandStyles = styles
export const publicBrandFontReadiness = {arabic: "ready-temporary-noto-kufi", english: "pending-safiro-webfont", englishFallback: "Arial, Helvetica, sans-serif"} as const
const buttonVariants={primary:styles.primary,secondary:styles.secondary,steel:styles.solidSteel}

export function BrandScope({locale="en",className,children,...props}:HTMLAttributes<HTMLDivElement>&{locale?:string}) {
  return <div {...props} lang={locale} dir={locale==="ar"?"rtl":"ltr"} className={classes(styles.scope,locale==="ar"&&styles.arabic,className)}>{children}</div>
}
export function BrandContainer({className,...props}:HTMLAttributes<HTMLDivElement>) {return <div {...props} className={classes(styles.container,className)}/>}
export function BrandStack({className,...props}:HTMLAttributes<HTMLDivElement>) {return <div {...props} className={classes(styles.stack,className)}/>}
export function BrandGrid({className,...props}:HTMLAttributes<HTMLDivElement>) {return <div {...props} className={classes(styles.grid,className)}/>}
export function BrandActions({className,...props}:HTMLAttributes<HTMLDivElement>) {return <div {...props} className={classes(styles.actions,className)}/>}
export function BrandSection({tone="quay",className,...props}:HTMLAttributes<HTMLElement>&{tone?:"quay"|"paper"|"steel"|"corten"|"oxidation"|"photo"}) {return <section {...props} className={classes(styles.section,styles[tone],className)}/>}
export function BrandHeading({as:Tag="h2",size="sectionHeading",className,...props}:HTMLAttributes<HTMLHeadingElement>&{as?:"h1"|"h2"|"h3";size?:"display"|"sectionHeading"|"cardHeading"}) {return <Tag {...props} className={classes(styles.heading,styles[size],className)}/>}
export function BrandText({size="text",className,...props}:HTMLAttributes<HTMLParagraphElement>&{size?:"text"|"small"|"eyebrow"}) {return <p {...props} className={classes(styles[size],className)}/>}
export function BrandCard({className,...props}:HTMLAttributes<HTMLElement>) {return <article {...props} className={classes(styles.card,className)}/>}
export function BrandButton({variant="primary",type="button",className,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:keyof typeof buttonVariants}) {return <button {...props} type={type} className={classes(styles.button,buttonVariants[variant],className)}/>}
export function BrandLink({variant="primary",className,...props}:AnchorHTMLAttributes<HTMLAnchorElement>&{variant?:keyof typeof buttonVariants}) {return <a {...props} className={classes(styles.button,buttonVariants[variant],className)}/>}

type FieldProps={id:string;label:string;hint?:string;error?:string}
function descriptionIds(id:string,hint?:string,error?:string,extra?:string) {return [hint&&`${id}-hint`,error&&`${id}-error`,extra].filter(Boolean).join(" ")||undefined}
function Field({id,label,hint,error,required,children}:{required?:boolean;children:ReactNode}&FieldProps) {
  return <div className={styles.field}><label className={styles.label} htmlFor={id}>{label}{required&&<span aria-hidden="true"> *</span>}</label>{children}{hint&&<p id={`${id}-hint`} className={styles.hint}>{hint}</p>}{error&&<p id={`${id}-error`} role="alert" className={styles.error}><AlertCircle size={16} aria-hidden="true"/>{error}</p>}</div>
}
export function BrandInput({id,label,hint,error,className,required,"aria-describedby":extra,...props}:Omit<InputHTMLAttributes<HTMLInputElement>,"id">&FieldProps) {
  return <Field {...{id,label,hint,error,required}}><input {...props} id={id} required={required} aria-invalid={error?true:props["aria-invalid"]} aria-describedby={descriptionIds(id,hint,error,extra)} className={classes(styles.control,className)}/></Field>
}
export function BrandSelect({id,label,hint,error,className,required,"aria-describedby":extra,...props}:Omit<SelectHTMLAttributes<HTMLSelectElement>,"id">&FieldProps) {
  return <Field {...{id,label,hint,error,required}}><select {...props} id={id} required={required} aria-invalid={error?true:props["aria-invalid"]} aria-describedby={descriptionIds(id,hint,error,extra)} className={classes(styles.control,className)}/></Field>
}
export function BrandTextarea({id,label,hint,error,className,required,"aria-describedby":extra,...props}:Omit<TextareaHTMLAttributes<HTMLTextAreaElement>,"id">&FieldProps) {
  return <Field {...{id,label,hint,error,required}}><textarea {...props} id={id} required={required} aria-invalid={error?true:props["aria-invalid"]} aria-describedby={descriptionIds(id,hint,error,extra)} className={classes(styles.control,className)}/></Field>
}
export function BrandNotice({kind,children}:{kind:"error"|"success";children:ReactNode}) {
  const Icon=kind==="error"?AlertCircle:CheckCircle2
  return <div role={kind==="error"?"alert":"status"} className={classes(styles.notice,kind==="error"?styles.noticeError:styles.noticeSuccess)}><Icon size={20} className={styles.icon} aria-hidden="true"/><div>{children}</div></div>
}
