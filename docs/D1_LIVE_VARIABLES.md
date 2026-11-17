# إعدادات النشر الفعلي

التطبيق المنشور هو `nilelink-system` في حساب Cloudflare المقصود. إعداد النشر المحلي الفعلي في `.private/d1-migration/first-launch/application/wrangler.json`، وهو ملف خاص غير مرفوع إلى Git. إعداد `wrangler.jsonc` القديم ليس وجهة النشر الجديدة.

## الربط والأسرار

| العنصر | موضعه واستخدامه |
| --- | --- |
| `DB` | Binding إلى `nilelink-production`؛ لا يحتاج API Token داخل التطبيق. |
| `D1_PREVIEW_FILES` | Binding إلى `nilelink-production-files`؛ الاسم احتُفظ به لتوافق مسارات الملفات. |
| `D1_BACKUPS` | Binding إلى `nilelink-production-backups` لقراءة سجلات النسخ. |
| `ASSETS` | أصول الموقع والخطوط المطلوبة لتوليد PDF. |
| `D1_BACKUP_RUNNER` | Service binding إلى `nilelink-first-launch-backup` لإنشاء نسخة يدوية. |
| `JWT_SECRET`, `AUTH_SECRET`, `CRON_SECRET` | Cloudflare Secrets؛ لا توضع قيمها في vars أو الشات أو الواجهة. |
| `D1_BACKUP_TRIGGER_KEY` | Secret خاص بتشغيل خدمة النسخ؛ لا يسمح بإدارة حساب Cloudflare. |
| `BACKUP_ENCRYPTION_KEY` | في خدمة النسخ المستقلة فقط؛ لا يُنقل إلى تطبيق الويب. |
| `D1_STAGING_GATE_SECRET` | سر المراجعة السابق؛ الدخول الفعلي لا يتطلبه. |

متغيرات التفعيل تربط مدخل التطبيق بالحساب وقاعدة البيانات والمخازن المعتمدة. `D1_MIGRATION_PREVIEW=true` و`D1_STORAGE_MODE=r2-preview` اسمان تقنيان مستخدمان للتوافق؛ حالة النشر الفعلية `D1_RUNTIME_STAGE=first-launch-live` ولا تعني هذه الأسماء أن البيانات تجريبية.

## توكن Cloudflare

Wrangler يستخدم تسجيل الدخول OAuth على جهاز النشر. لا حاجة لإنشاء `API_TOKEN` داخل Worker، ولا تُنسخ بيانات اعتماد الحساب القديم. عند إعداد CI لاحقًا يمكن تخزين `CLOUDFLARE_API_TOKEN` كسر في منصة CI مع صلاحيات محدودة للحساب الجديد؛ لا يُضاف إلى `NEXT_PUBLIC_*` أو Git أو ملفات الأصول.

## التحديث

بعد تعديل الكود يُنشأ بناء معزول بالعنوان العام الصحيح:

```powershell
node --use-system-ca scripts/d1/build-audit.mjs --worker --first-launch
```

لتهيئة سر تشغيل النسخ من ملفه الخاص الموجود، دون طباعة قيمته:

```powershell
node --use-system-ca scripts/d1/deploy-live-project.mjs --install-backup-secret
```

ثم يرفع الأمر التالي البناء الجديد إلى الوجهة المحددة فقط، ويحفظ الإعداد السابق في مجلد deployments الخاص:

```powershell
node --use-system-ca scripts/d1/deploy-live-project.mjs --execute
node --use-system-ca scripts/d1/validate-first-launch-live.mjs
node --use-system-ca scripts/d1/audit-live-project.mjs
```

هذه الأوامر لا تعيد استيراد البيانات ولا تمس MongoDB. فحص الصفحات لا يثبت كل عمليات التعديل؛ تقارير الاختبار تذكر نطاقها صراحة. البريد مفعّل عبر Resend حسب التحديث أدناه. WhatsApp ما زال يحتاج بيانات حسابه الحقيقية. لا تُنسخ خدمة بريد Windows إلى Workers.

تحديث 21 أكتوبر: فُعّل إرسال البريد باستخدام مفتاح Resend الموجود بعد إثبات صلاحية المفتاح وتوثيق نطاق الإرسال. المفتاح محفوظ كـSecret `RESEND_API_KEY`، والمتغيرات `EMAIL_PROVIDER=resend` و`EMAIL_FROM` و`EMAIL_TO` و`EMAIL_DELIVERY_ENABLED=true` مفعّلة في النشر الفعلي. أمر تثبيت السر `deploy-live-project.mjs --install-email-secret` لا يعرض قيمته؛ أمر النشر `deploy-live-project.mjs --execute --enable-email` يفعّل الإعداد مع البناء الصحيح. اختُبرت رسالة واحدة بإذن المستخدم وأكد Resend تسليمها. تفاصيل الوظائف والأدلة في `docs/D1_EMAIL_DELIVERY.md`. WhatsApp غير مهيأ بعد، واستضافة صندوق البريد الوارد لم تتغير.
