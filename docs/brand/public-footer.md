# Task 27 — Public footer and container pattern

Implemented on `codex/public-brand-redesign-2026-11-22`, 2026-11-23. Not deployed to production.

Arabic and English homepages use a scoped Steel footer with the localized “Clear, and it stays.” tagline and Damietta/Egypt contact line. Additional compact navigation preserves the existing public pages, full quote form, customer/staff login, six existing service destinations and configured social channels. Contact links read `CONTACT` for mailto, tel, WhatsApp, maps, Facebook and LinkedIn; they do not force Gmail or invent operational details from the brand guide.

The prepared 60 px corrugation pattern appears below the footer at ≤600 px, with the primary Corten/Chalk N mark. Rib Shadow is confined to the decorative rib asset. The pattern wrapper is hidden from assistive technology and reserves 200 px; desktop retains the simple charcoal footer. A normal back-to-top anchor replaces the legacy floating scroll button on the two branded homepages, so the footer adds no floating control over the quote form.

There are no real privacy or terms pages in the current application: the old footer labels pointed to the homepage. The new footer has an explicitly labelled privacy/terms enquiry link to contact. Approved policy content/routes remain a release dependency; no policy text was invented. `CONTACT.PHONE` and the WhatsApp number currently differ in the source configuration; both are preserved verbatim, with contact-data review reserved for release rather than guessing a correction.

Other public pages/languages keep the existing footer until their redesign tasks. The existing admin/customer portal suppression guard remains ahead of the new homepage branch. Internal layouts and data were not modified. Font readiness remains as documented in task 21.

## Verification

- Actual local Next.js webpack/Chrome: Arabic and English at 1440, 1280, 768, 390 and 360 px, dark preference and reduced motion. Single footer, no overflow or page errors, correct configured contact destinations, no empty links or fixed footer controls.
- Mobile pattern shown; desktop pattern hidden. Keyboard focus visible and back-to-top anchor functional in both locales.
- English desktop and Arabic mobile screenshots visually inspected against reference pages 29/30. French homepage and English company page retain their legacy footer.
- TypeScript, targeted ESLint and whitespace checks passed. Browser APIs mocked; no emails, phone calls or WhatsApp messages sent. Private evidence: `.private/task27-*`.
- Full production build, approved policy/contact review and combined release remain task 30.
