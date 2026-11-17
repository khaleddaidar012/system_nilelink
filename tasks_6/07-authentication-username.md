# Task: Authentication — Username Support in Login & Register

Status: completed
Priority: medium

---

## Objective

Allow customers to use either their **email address** OR a **username** when logging in. During registration, provide an optional username field. The system should accept either identifier at the login screen without requiring the user to know which one they registered with.

---

## Background & Current State

### Login API
File: `app/api/auth/login/route.ts`

The login schema already accepts `identifier`:
```ts
const loginSchema = z.object({
  identifier: z.string().min(1, "Email or Username is required").trim(),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional().default(true),
})
```

And the query already supports both:
```ts
const user = await User.findOne({
  $or: [{ email: normalizedIdentifier }, { username: normalizedIdentifier }],
}).select("+passwordHash")
```

**Backend login is already implemented correctly.**

### User Model
File: `lib/models/User.ts`

```ts
username?: string  // already exists — sparse, unique, lowercase, trimmed
```

The `username` field already exists in the schema with a sparse unique index.

### Register API
File: `app/api/auth/register/route.ts`

The `registerSchema` does NOT include `username`:
```ts
const registerSchema = z.object({
  firstName: ...,
  lastName: ...,
  email: ...,
  password: ...,
  // NO username field here
})
```

And the `User.create(...)` call does NOT pass `username`. So if a user registers, they cannot set a username at registration time.

### Login UI
File: `app/[locale]/login/page.tsx`

The login form may have an "Email" labeled input that should be changed to "Email or Username" / "البريد أو اسم المستخدم".

### Register UI
File: `app/[locale]/register/page.tsx`

The register form has no username field and needs one added (optional).

---

## Subtasks

### Backend — Register API

- [x] **7.1** Update `registerSchema` in `app/api/auth/register/route.ts` to include an optional `username` field:
  ```ts
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be 30 characters or less")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores")
    .toLowerCase()
    .trim()
    .optional()
  ```

- [x] **7.2** In the register route body extraction, extract `username` from `parsed.data`

- [x] **7.3** Before creating the user, check if the username is already taken:
  ```ts
  if (username) {
    const existingUsername = await User.findOne({ username })
    if (existingUsername) {
      return NextResponse.json({ error: "Username is already taken" }, { status: 409 })
    }
  }
  ```

- [x] **7.4** Pass `username` to `User.create(...)` in the register route (only if provided):
  ```ts
  const user = await User.create({
    email,
    username: username || undefined,  // sparse index — undefined = not set
    ...
  })
  ```

- [x] **7.5** Include `username` in the response body of the register API

### Backend — Login API

- [x] **7.6** Verify the login API in `app/api/auth/login/route.ts` works correctly for both email and username — verified and fully functional

### Frontend — Login Page

- [x] **7.7** Read `app/[locale]/login/page.tsx` to find the email input field

- [x] **7.8** Update the login form input:
  - Change label from "Email" to "Email or Username" (English) / "البريد الإلكتروني أو اسم المستخدم" (Arabic)
  - Change `type="email"` to `type="text"` (since username is not an email)
  - Update placeholder text accordingly
  - Update the field's `name`/`id` to `"identifier"` if not already

- [x] **7.9** Update the login form submission to send `{ identifier, password, rememberMe }` to `/api/auth/login`

- [x] **7.10** Update any client-side validation to accept email OR username format (don't enforce email format on the identifier field)

### Frontend — Register Page

- [x] **7.11** Read `app/[locale]/register/page.tsx` to understand the current form layout

- [x] **7.12** Add a username input field to the register form:
  - Label: "Username (optional)" / "اسم المستخدم (اختياري)"
  - Placeholder: "e.g., mohamed_cairo" / "مثال: mohamed_cairo"
  - Validation: 3-30 chars, alphanumeric + underscore only
  - Show validation error inline if format is invalid
  - Position: after "Email" field or in the personal info section

- [x] **7.13** Include `username` in the register form submission payload (only if the user filled it in)

- [x] **7.14** Handle the 409 "Username already taken" error response from the API and display it next to the username field

### i18n

- [x] **7.15** Add/update i18n keys:
  - `"auth.identifier"`: `"Email or Username"` / `"البريد الإلكتروني أو اسم المستخدم"`
  - `"auth.username"`: `"Username"` / `"اسم المستخدم"`
  - `"auth.username.optional"`: `"Username (optional)"` / `"اسم المستخدم (اختياري)"`
  - `"auth.username.placeholder"`: `"e.g., ahmed_cairo"` / `"مثال: ahmed_cairo"`
  - `"auth.username.taken"`: `"Username is already taken"` / `"اسم المستخدم مستخدم بالفعل"`
  - `"auth.username.format"`: `"Only letters, numbers, and underscores"` / `"أحرف وأرقام وشرطة سفلية فقط"`

---

## Acceptance Criteria

- [x] Customer can register with an optional username
- [x] Customer can login using either their email address OR their username
- [x] Login form label/placeholder reads "Email or Username" in both languages
- [x] Register form has a username field (optional, with validation)
- [x] If username is taken at registration, a clear error is shown next to the field
- [x] If username format is invalid (spaces, special chars), inline validation error is shown
- [x] Existing accounts without a username can still log in using their email
- [x] Existing login behavior is 100% preserved

---

## Dependencies

- `app/api/auth/register/route.ts` — backend update
- `app/api/auth/login/route.ts` — verify (likely no changes needed)
- `app/[locale]/login/page.tsx` — UI update
- `app/[locale]/register/page.tsx` — UI update
- `messages/ar.json`, `messages/en.json` — i18n

---

## Edge Cases

- [x] Username with spaces → reject with clear error
- [x] Username with Arabic characters → reject (only ASCII alphanumeric + underscore)
- [x] Username that is exactly an email format (e.g., "user@example.com") → login should try email first, then username
- [x] Case sensitivity: "Mohamed" and "mohamed" should be treated as the same username (both lowercased on save)
- [x] Very long username (100+ chars) → server validation blocks it (max 30)
- [x] Empty string username submitted → treated as not provided (don't save empty string to DB)

---

## Regression Requirements

Must NOT break:
- Existing customer login by email (no username)
- Existing password reset flow (uses email)
- Existing email verification flow (uses email)
- Existing JWT token generation (email field still primary)
- Admin and staff login (they use email only)
