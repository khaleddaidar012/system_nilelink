import Image from "next/image"
import {BrandActions,BrandButton,BrandCard,BrandContainer,BrandGrid,BrandHeading,BrandInput,BrandLink,BrandNotice,BrandScope,BrandSection,BrandSelect,BrandStack,BrandText,BrandTextarea,publicBrandStyles} from "./index"

/** Development/review content only; not mounted on a public application route. */
export function BrandShowcase({locale="en"}:{locale?:"ar"|"en"}) {
  const ar=locale==="ar"
  const services=ar?["شحن بحري","شحن جوي","نقل بري","تخليص جمركي","مخازن","تأمين الشحنة"]:["Sea freight","Air freight","Land transport","Customs clearance","Warehousing","Cargo insurance"]
  const icons=["sea-freight","air-freight","land-transport","customs-clearance","warehousing","cargo-insurance"]
  return <BrandScope locale={locale}>
    <BrandSection tone="paper"><BrandContainer><BrandStack>
      <BrandText size="eyebrow">CORTEN / {ar?"معاينة نظام التصميم":"PUBLIC DESIGN SYSTEM PREVIEW"}</BrandText>
      <BrandHeading as="h1" size="display">{ar?"واضح، ومكتوب من الأول.":"CLEAR. WRITTEN OUT FROM THE START."}</BrandHeading>
      <BrandText>{ar?"ألوان دافئة، نص مقروء، ومساحات واضحة لكل جزء.":"Warm surfaces, readable type, and room for every detail."}</BrandText>
      <BrandText size="small">{ar?"معاينة للمراجعة فقط. خط Safiro الإنجليزي قيد الاستكمال؛ المعروض حاليًا خط النظام البديل.":"Review preview only. Safiro English webfont is pending; English currently uses the documented system fallback."}</BrandText>
      <BrandActions><BrandLink href="#quote-preview">{ar?"عرض النموذج":"View form"}</BrandLink><BrandButton variant="secondary">{ar?"إجراء ثانوي":"Secondary action"}</BrandButton><BrandButton disabled>{ar?"غير متاح الآن":"Currently unavailable"}</BrandButton></BrandActions>
    </BrandStack></BrandContainer></BrandSection>
    <BrandSection><BrandContainer><BrandStack>
      <BrandHeading>{ar?"نظام واحد لكل خدمة":"ONE SYSTEM. EVERY SERVICE."}</BrandHeading>
      <BrandGrid>{services.map((label,i)=><BrandCard key={icons[i]}><BrandStack><Image src={`/brand/nilelink/icons/cards/${icons[i]}.svg`} width={48} height={48} alt="" aria-hidden="true"/><BrandHeading as="h3" size="cardHeading">{label}</BrandHeading><BrandText size="small">{ar?"بطاقة محايدة وأيقونة موحدة بلون كورتن.":"A quiet surface with a consistent Corten icon."}</BrandText></BrandStack></BrandCard>)}</BrandGrid>
    </BrandStack></BrandContainer></BrandSection>
    <BrandSection tone="steel"><BrandContainer><BrandStack><BrandText size="eyebrow">{ar?"تفاصيل واضحة":"EVERY LINE CLEAR"}</BrandText><BrandHeading>{ar?"الفحمي للنصوص والحقول الداكنة":"STEEL FOR DARK SURFACES."}</BrandHeading><BrandText size="small">{ar?"الألوان المساعدة تستخدم مع تباين واضح.":"Supporting colors retain a clear reading contrast."}</BrandText><BrandActions><BrandButton>{ar?"اطلب عرض سعر":"Get a full quote"}</BrandButton><BrandButton variant="secondary">{ar?"تواصل معنا":"Contact us"}</BrandButton></BrandActions></BrandStack></BrandContainer></BrandSection>
    <BrandSection tone="corten"><BrandContainer><BrandStack><BrandHeading>{ar?"كل بند في مكانه":"EACH DETAIL IN ITS PLACE."}</BrandHeading><BrandText>{ar?"البرتقالي الصدئي للحضور المميز، مع أزرار فحمية واضحة.":"Corten carries the brand, with clear Steel actions."}</BrandText><BrandActions><BrandButton>{ar?"متابعة":"Continue"}</BrandButton><BrandButton variant="secondary">{ar?"رجوع":"Go back"}</BrandButton></BrandActions></BrandStack></BrandContainer></BrandSection>
    <BrandSection tone="oxidation" id="quote-preview"><BrandContainer><BrandStack><BrandHeading id="quote-heading">{ar?"نموذج معاينة":"FORM PREVIEW"}</BrandHeading><BrandText size="small">{ar?"عينة مكونات فقط؛ الأزرار لا ترسل أي بيانات.":"Component samples only; the buttons do not submit data."}</BrandText><BrandCard><BrandStack role="group" aria-labelledby="quote-heading"><BrandGrid>
      <BrandInput id={`origin-${locale}`} label={ar?"من":"From"} defaultValue={ar?"دمياط":"Damietta"} required/>
      <BrandInput id={`destination-${locale}`} label={ar?"إلى":"To"} placeholder={ar?"ميناء الوصول":"Destination port"} hint={ar?"اختر الوجهة المناسبة للشحنة.":"Choose the shipment destination."}/>
      <BrandSelect id={`cargo-${locale}`} label={ar?"نوع الشحنة":"Cargo type"} defaultValue="fcl"><option value="fcl">FCL</option><option value="lcl">LCL</option></BrandSelect>
      <BrandInput id={`phone-${locale}`} type="tel" dir="ltr" label={ar?"رقم الموبايل":"Mobile"} placeholder="+20"/>
      <BrandInput id={`email-${locale}`} type="email" label={ar?"البريد الإلكتروني":"Email"} defaultValue="not-an-email" error={ar?"اكتب بريدًا إلكترونيًا صحيحًا.":"Enter a valid email address."}/>
      <BrandInput id={`disabled-${locale}`} label={ar?"اختيار غير متاح":"Unavailable option"} disabled placeholder={ar?"غير متاح الآن":"Currently unavailable"}/>
    </BrandGrid><BrandTextarea id={`notes-${locale}`} label={ar?"ملاحظات":"Notes"} rows={3} placeholder={ar?"تفاصيل إضافية عن الشحنة":"Additional shipment details"}/><BrandActions><BrandButton variant="steel">{ar?"معاينة الإرسال":"Preview action"}</BrandButton></BrandActions><BrandNotice kind="error">{ar?"راجع البيانات الموضحة قبل المتابعة.":"Review the highlighted information before continuing."}</BrandNotice><BrandNotice kind="success">{ar?"مثال على رسالة نجاح واضحة.":"A clear success-message example."}</BrandNotice></BrandStack></BrandCard></BrandStack></BrandContainer></BrandSection>
    <BrandSection tone="photo" style={{backgroundImage:"url(/brand/nilelink/images/hero-desktop-1280.webp)"}}><div className={publicBrandStyles.photoScrim}><BrandContainer><BrandStack><BrandText size="eyebrow">DAM → WORLD</BrandText><BrandHeading>{ar?"المعلومة واضحة فوق الصورة":"READABLE OVER PHOTOGRAPHY."}</BrandHeading><BrandText>{ar?"طبقة فحمية تمنع ضياع النص في تفاصيل الصورة.":"A Steel scrim keeps the content readable over the photograph."}</BrandText><BrandActions><BrandButton>{ar?"طلب سعر":"Get a quote"}</BrandButton><BrandButton variant="secondary">WhatsApp</BrandButton></BrandActions></BrandStack></BrandContainer></div></BrandSection>
  </BrandScope>
}
