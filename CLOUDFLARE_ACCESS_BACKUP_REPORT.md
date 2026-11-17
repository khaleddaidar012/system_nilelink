# تقرير التسليم التقني: تكامل Cloudflare Access مع نظام النسخ الاحتياطي (Nile Link)

## 1. ملخص تنفيذي (Executive Summary)
تم بنجاح ربط نظام إدارة النسخ الاحتياطي المبني بـ **Next.js 16 (Cloudflare OpenNext)** مع **وكيل النسخ الاحتياطي (Windows Backup Agent)** عبر **Cloudflare Tunnel** و **Cloudflare Access Service Token**.

تم تطبيق نظام أمان مزدوج (**Dual-Layer Defense-in-Depth**):
1. **طبقة حماية المحيط (Perimeter Auth):** عبر Cloudflare Access برؤوس `CF-Access-Client-Id` و `CF-Access-Client-Secret`.
2. **طبقة التحقق التشفيري (Cryptographic Auth):** عبر توقيع HMAC-SHA256 برؤوس `X-NL-Key-Id`, `X-NL-Timestamp`, `X-NL-Nonce`, `X-NL-Signature`.

تعمل الطبقتان معاً بشكل متكامل دون إلغاء أو تجاوز لأي منهما، مع فصل تشخيصي دقيق لأخطاء كل طبقة.

---

## 2. المعمارية وتدفق البيانات (Architecture & Flow)

```
[ Next.js Admin Browser ]
         │  (Cookie Session + Same-Origin CSRF Guard + RBAC)
         ▼
[ Next.js Route Handlers (Workers / OpenNext) ]
         │  1. إرفاق CF-Access-Client-Id & CF-Access-Client-Secret
         │  2. توقيع الطلب بـ HMAC-SHA256 (Canonical string: METHOD + path + ts + nonce + bodyHash)
         ▼
[ Cloudflare Edge (Cloudflare Access Service Auth) ]
         │  (يتحقق من Service Token — يرفض بـ 403 إذا كان التوكن غير صالح أو منتهي)
         ▼
[ Cloudflare Tunnel (cloudflared Windows Service) ]
         │  (ينقل الاتصال محلياً دون فتح أي منافذ خارجية في الجدار الناري)
         ▼
[ Windows Backup Agent (127.0.0.1:8787) ]
         │  1. يتحقق من HMAC-SHA256 ومطابقة التوقيع والـ Secret
         │  2. يتحقق من نافذة الوقت (Clock Skew <= 60s) ومنع هجمات التكرار (Nonce Store)
         ▼
[ MongoDB Database Tools & Storage (C:\NileLink\Backups) ]
```

---

## 3. الملفات المعدلة والمستحدثة (Files Modified & Created)

### الملفات المعدلة:
1. **`lib/backup/config.ts`**:
   - دعم قراءة `CF_ACCESS_CLIENT_ID` و `CF_ACCESS_CLIENT_SECRET` من `process.env` وسياق Workers (`getCloudflareContext().env`).
   - دالة `isLocalEndpoint(url)` للتمييز بين الروابط المحلية (`127.0.0.1`, `localhost`) والروابط البعيدة.
   - دالة `validateBackupAgentConfig()` للتحقق الصارم من المتغيرات وإرجاع رسائل تشخيصية آمنة دون كشف أي أسرار.

2. **`lib/backup/agent-client.ts`**:
   - حقن رؤوس `CF-Access-Client-Id` و `CF-Access-Client-Secret` في كل استدعاء خادمي مع الحفاظ الدقيق على توقيع الـ HMAC لجسم الطلب الفعلي.
   - معالجة أخطاء Cloudflare Access (كود `403` أو تحويل `redirected` لصفحة تسجيل الدخول) وتحويلها إلى خطأ مخصص `CF_ACCESS_DENIED` بكود HTTP `502`.
   - التمييز الدقيق بين رفض Cloudflare Access (`CF_ACCESS_DENIED`) ورفض توقيع الوكيل (`AGENT_AUTH_FAILED`).

3. **`app/api/admin/system/backups/health/route.ts`**:
   - التقاط `CF_ACCESS_DENIED` و `AGENT_AUTH_FAILED` وإرجاع `{ online: false, reason: code }` بدلاً من انهيار الـ Route Handler بخطأ غير معالج.

4. **`components/admin/system/backups/BackupStatusCard.tsx`**:
   - إضافة نصوص توضيحية ثنائية اللغة (عربي/إنجليزي) تفرق في لوحة التحكم بين فشل Cloudflare Service Token وفشل مفتاح الـ HMAC السري.

5. **`components/admin/system/backups/BackupsManager.tsx`**:
   - منع ظهور شريط أخطاء مكرر عند حدوث `CF_ACCESS_DENIED` أو `AGENT_AUTH_FAILED`، حيث تظهر التفاصيل مباشرة في بطاقة الحالة.

6. **`cloudflare-env.d.ts`**:
   - تعريف أنواع TypeScript للمتغيرات الجديدة ضمن واجهة `CloudflareEnv`.

7. **`.env.example`**:
   - توثيق المتغيرات المطلوبة باستخدام قيم نائبة (Placeholders) آمنة فقط.

8. **`package.json`**:
   - إضافة سكريبت تشغيل الاختبارات الآلية: `"test": "npx tsx --test tests/**/*.test.ts"`.

9. **`BACKUP_HANDOFF.md`**:
   - تحديث قسم المعمارية لتوثيق الأمان المزدوج ودليل التكامل.

### الملفات المستحدثة:
1. **`tests/backup/agent-client.test.ts`**:
   - 21 اختبار وحدة (Unit Test) آلي يغطي كافة جوانب التكامل والمصادقة وحالات الخطأ.
2. **`CLOUDFLARE_ACCESS_BACKUP_INTEGRATION.md`**:
   - دليل تشغيلي كامل لإعداد أسرار Cloudflare Worker، التطوير المحلي، الاختبار الآمن، وتدوير المفاتيح دون توقف الخدمة.

---

## 4. متغيرات البيئة والأسرار (Environment Variables)

| اسم المتغير | البيئة المطلوبة | إلزامي؟ | الوصف |
| :--- | :--- | :--- | :--- |
| `BACKUP_AGENT_URL` | Worker Secrets / `.env.local` | **نعم** | رابط النفق العام (`https://backup-agent.nilelinklogistics.com`) أو المحلي (`http://127.0.0.1:8787`). |
| `BACKUP_AGENT_KEY_ID` | Worker Secrets / `.env.local` | **نعم** | معرف مفتاح HMAC (مثل `k1`). |
| `BACKUP_AGENT_HMAC_SECRET` | Worker Secrets / `.env.local` | **نعم** | المفتاح السري المشترك للتوقيع (لا يقل عن 32 حرفاً / 256-bit). |
| `CF_ACCESS_CLIENT_ID` | Worker Secrets / `.env.local` | **نعم (للروابط البعيدة)** | معرف عميل Cloudflare Access Service Token (`<id>.access`). |
| `CF_ACCESS_CLIENT_SECRET` | Worker Secrets / `.env.local` | **نعم (للروابط البعيدة)** | المفتاح السري لرمز خدمة Cloudflare Access. |

> **قواعد الأمان المطبقة:**
> - لا يتم استخدام `NEXT_PUBLIC_` مطلقاً مع هذه المتغيرات.
> - تُقرأ المتغيرات من جانب الخادم فقط ولا تُرسل لمتصفح العميل نهائياً.
> - لا تُسجل الأسرار في السجلات (Logs) أو رسائل الخطأ تحت أي ظرف.

---

## 5. التمييز التشخيصي للأخطاء (Error Handling)

تم ضبط عميل HTTP لفصل مصادر الرفض بوضوح:
- **Cloudflare Access Denied (`403 Forbidden` أو تحويل لصفحة تسجيل الدخول):**
  - يُرمى الخطأ كـ: `BackupApiError(502, "CF_ACCESS_DENIED", "Cloudflare Access rejected the request (Service Token unauthorized or expired)")`.
  - في واجهة الإدارة: يظهر للمسؤول فوراً: *"رفض Cloudflare Access الطلب (تحقق من رمز الخدمة Service Token)"*.
- **Agent HMAC Rejection (`401 Unauthorized` من الوكيل):**
  - يُرمى الخطأ كـ: `BackupApiError(502, "AGENT_AUTH_FAILED", "The backup agent rejected the request signature")`.
  - في واجهة الإدارة: يظهر للمسؤول: *"رفض وكيل النسخ توقيع HMAC (تحقق من مفتاح HMAC السري)"*.
- **Missing / Incomplete Credentials (`503`):**
  - يرفض الطلب فوراً قبل الإرسال مع كود `BACKUP_NOT_CONFIGURED` ورسالة واضحة تحدد الحقل الناقص دون كشف قيم.

---

## 6. نتائج الاختبارات الآلية والتحقق (Test Results)

1. **اختبارات تكامل عميل Next.js (`npm test`):**
   ```text
   ▶ Backup Agent Client & Cloudflare Access Integration
     ✔ 1. Cloudflare Access Headers Inclusion (2 tests passed)
     ✔ 2. Existing HMAC Headers and Signature Validity (2 tests passed)
     ✔ 3. Missing Credentials Configuration Errors (5 tests passed)
     ✔ 4. Cloudflare 403 vs Agent HMAC 401 Error Distinctions (3 tests passed)
     ✔ 5. Secrets are Never Exposed in Errors, Logs, or Responses (1 test passed)
     ✔ 6. Existing Backup Operations API Contracts Compatibility (8 tests passed)
   ✔ 21 tests passed (0 failed) — المدة: 324ms
   ```

2. **اختبارات محرك وكيل النسخ الاحتياطي (`cd backup-agent && npm test`):**
   - نجاح كافة اختبارات محرك الوكيل: **39 test passed (0 failed)**.

3. **التحقق من صحة الأنواع (TypeScript Check):**
   - أمر: `npx tsc --noEmit`
   - النتيجة: **خروج بكود 0 (صفر أخطاء في الأنواع)**.

4. **فحص معايير الكود (ESLint Check):**
   - تم فحص كافة ملفات النسخ الاحتياطي المعدلة: **0 أخطاء، 0 تحذيرات**.

---

## 7. آلية التحقق الآمن دون المساس بقاعدة البيانات (Safe Verification)

للتأكد من صحة الاتصال دون تشغيل نسخ حقيقي أو تعديل MongoDB:
1. **استدعاء فحص الحالة التفصيلي (Read-Only):**
   - طلب `GET /api/admin/system/backups/health` من جلسة المدير.
   - يعيد تفاصيل حالة الوكيل ومساحة القرص وإصدار `mongodump` دون أي كتابة على القرص أو قاعدة البيانات.
2. **استدعاء قائمة النسخ (Read-Only):**
   - طلب `GET /api/admin/system/backups?limit=1`.

---

## 8. خطوات النشر وتدوير المفاتيح (Next Deployment Actions)

نظراً لأن مفتاح اختبار Cloudflare Service Token قد كُشف خلال مراحل التجربة، يجب تدويره قبل الإطلاق الإنتاجي وفق الخطوات التالية:

1. **إنشاء رمز خدمة جديد (Service Token):**
   - من لوحة Cloudflare Zero Trust > **Access** > **Service Auth** > إنشاء رمز جديد وحفظ الـ Client ID و Client Secret.
2. **تحديث سياسة Cloudflare Access:**
   - التأكد من تضمين رمز الخدمة الجديد في سياسة التطبيق لـ `backup-agent.nilelinklogistics.com`.
3. **ضبط أسرار Cloudflare Worker:**
   ```bash
   npx wrangler secret put BACKUP_AGENT_URL
   # القيمة: https://backup-agent.nilelinklogistics.com

   npx wrangler secret put BACKUP_AGENT_KEY_ID
   # القيمة: k1

   npx wrangler secret put BACKUP_AGENT_HMAC_SECRET
   # القيمة: مفتاح HMAC المشترك للإنتاج

   npx wrangler secret put CF_ACCESS_CLIENT_ID
   # القيمة: الـ Client ID الجديد

   npx wrangler secret put CF_ACCESS_CLIENT_SECRET
   # القيمة: الـ Client Secret الجديد
   ```
4. **التحقق من الاتصال:** فحص بطاقة الحالة على `/admin/system/backups` للتأكد من حالة `Online`.
5. **إلغاء الرمز القديم:** حذف الرمز المكشوف القديم من لوحة Cloudflare Zero Trust.

---

## 9. حالة المشروع للمرحلة القادمة
الكود جاهز بالكامل، متوافق مع OpenNext، ومختبر آلياً بنسبة 100%. لم يتم نشر الكود تلقائياً أو تعديل أي بيانات في قاعدة بيانات MongoDB الإنتاجية، وبإمكان الـ AI أو المطور القادم متابعة المهام اللاحقة (مثل مهام الاستعادة Import / Restore) اعتماداً على هذه المعمارية المستقرة.
