# Task 26 — Public quick quote inquiry

Implemented on `codex/public-brand-redesign-2026-11-22`, 2026-11-23. Not deployed to production.

Arabic and English homepages now include a four-field inquiry after the how-we-work section: editable origin (initially Damietta), destination, free-text shipment type and phone. Destination port, FCL 40’ HC / LCL and +20 are examples/placeholders. A warm brand gradient surrounds a Chalk form with a Steel submit button. Desktop copy/form order follows reading direction; mobile shows the copy first. The gradient keeps light copy over its dark portion. Labels, error descriptions, visible focus, phone direction, pending state and confirmation are accessible. Safiro remains pending under task 21.

The header and hero quote actions target the localized `/#quick-quote` anchor. The form explicitly explains phone follow-up and links to the unchanged full `/request-quote` form. Other homepage languages retain their current sections.

## Delivery contract

`POST /api/quick-quote` accepts only `from`, `to`, `shipmentType` and `phone`. Shared Zod validation trims values, rejects blanks/unknown fields, limits lengths and accepts telephone punctuation and Arabic digits (7–15 digits). A request UUID in `Idempotency-Key` is required. Oversized and malformed requests are rejected before delivery. HTML output escapes input; the plain-text message contains exactly the submitted shipment/contact data, with no invented name/email or guessed freight mode.

The new inquiry uses the existing configured email provider and recipient from `getEmailConfig()` (`EMAIL_TO`, otherwise the configured company contact). It is an email inquiry for staff phone follow-up, not an authenticated customer order or generated quotation. `EMAIL_DELIVERY_ENABLED=true` and a working delivery provider are prerequisites. No request is acknowledged until `sendEmailWithReceipt()` returns a non-mock receipt; failures return a generic 503 without secrets or PII. Provider acceptance is not a guarantee of inbox placement.

The browser synchronously locks submission, disables controls while pending, preserves input on failure and resets after confirmed success only. Failed unchanged submissions keep their UUID. The payload hash is incorporated in the provider idempotency key, so modified data cannot reuse a conflicting provider payload. Resend supports provider deduplication; SMTP does not supply equivalent retry deduplication. This does not claim universal exactly-once delivery across transports. There is no automatic retry or live delivery test in this task.

## Verification

- Seven persistent handler contract tests passed using an injected test receiver: delivery awaited, validation rejects without dispatch, malformed/oversized requests, escaped HTML, provider failures and missing/mock receipts, stable provider keys and Arabic digits.
- Run: `node --import ./tests/d1/register-typescript.mjs --test tests/public/quick-quote.test.mjs`.
- Actual Next.js webpack/Chrome: AR/EN at 1440, 1280, 768, 390 and 360 px; four labelled inputs, correct anchors/full form route, no overflow or page errors, dark preference/reduced motion. English desktop and Arabic mobile screenshots visually reviewed.
- Both localized forms: invalid fields focus and prevent dispatch; network error, 503 and HTTP-200-with-false-success preserve values; two simultaneous submit events yield one pending request; confirmed success clears entered details. Inline status/error messages are readable and focused.
- Actual local endpoint with delivery disabled returned 503. No live email was sent. Browser API delivery responses were mocked; handler contract tests used a test receiver.
- Existing full API was separately bundled with an isolated email receiver: original full contract accepted once; missing required identity fields still rejected. Existing full API/form sources were unchanged.
- TypeScript, targeted ESLint and whitespace checks passed. Private evidence and isolated full-form regression harness are under `.private/task26-*`.

Final production build, recipient/configuration review and combined release remain task 30. No customer/internal workflow or database schema was changed.
