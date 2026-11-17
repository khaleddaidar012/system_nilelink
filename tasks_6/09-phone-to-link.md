# Task: Company Phone Number → Contact Link (Number Hidden)

Status: completed
Priority: low

---

## Objective

The company phone number starting with `010...` displayed on the public website must be replaced with a hidden link. The actual phone number digits must NOT be visible to website visitors. Instead, show a labeled link (e.g., "Call Us" or a WhatsApp link) that, when clicked, dials or opens the number — but the number itself should not be rendered as readable text.

---

## Background & Current State

### Current Implementation
File: `components/sections/contact/ContactInfo.tsx`

Line 53-55:
```tsx
<a href="tel:+20100018549" className="...">
  <span dir="ltr">+20 10 00018549</span>
</a>
```

The number `+20 10 00018549` is currently displayed as visible text.

### Requirement
- The `href="tel:..."` can remain (so clicking still dials)
- The visible text MUST NOT show the actual phone digits
- Replace visible text with a label like: "اتصل بنا" (Call Us) or use an icon + text
- Optionally, add a WhatsApp link for the same number

---

## Subtasks

### Locate All Phone Number Occurrences

- [x] **9.1** Search the entire codebase for the phone number string `010`, `+2010`, `00018549`, and `tel:` to find all places where the company phone number is displayed:
  - `components/sections/contact/ContactInfo.tsx` (confirmed)
  - `components/layout/Footer.tsx`
  - `components/layout/Navbar.tsx` (mobile menu — check)
  - `components/sections/hero/` (any hero section CTAs)
  - `messages/ar.json` and `messages/en.json` (any i18n strings containing the number)
  - Any other public page components

### Replace Phone Number Display

- [x] **9.2** In `components/sections/contact/ContactInfo.tsx`:
  - Keep `href="tel:+20100018549"` on the anchor tag
  - Replace the visible text `<span dir="ltr">+20 10 00018549</span>` with a non-number label
  - Suggested label: "اتصل بنا" / "Call Us" — or use the phone icon as the only visible element
  - Optional: add `aria-label="+20 10 00018549"` for accessibility (screen readers only)

- [x] **9.3** Apply the same change to all other locations found in subtask 9.1

- [x] **9.4** If the phone number appears in i18n message files, remove the number from the translation value and replace with a label or remove it entirely from the displayed text

### WhatsApp Link (Optional Enhancement)

- [x] **9.5** Consider adding a WhatsApp link alongside the phone link:
  - `href="https://wa.me/20100018549"` (WhatsApp web link format)
  - Label: "WhatsApp" with WhatsApp icon
  - This satisfies the "contact link" requirement more cleanly than tel: alone
  - Only implement if the user confirms WhatsApp contact is desired

### Accessibility

- [x] **9.6** Ensure the link is accessible:
  - Use `title` or `aria-label` attributes that include the actual number for screen readers (optional — the requirement does not explicitly forbid screen reader access)
  - OR completely suppress the number for all audiences if required — confirm with user
  - The link must still be keyboard navigable

---

## Acceptance Criteria

- [x] The phone number digits are NOT visible anywhere on the public website's rendered UI
- [x] Clicking/tapping the contact link still initiates a phone call or WhatsApp chat
- [x] All locations where the phone number was displayed are updated
- [x] The replacement label is in both Arabic and English where applicable
- [x] No console errors or broken links introduced
- [x] Accessibility: the link is still clickable via keyboard

---

## Dependencies

- `components/sections/contact/ContactInfo.tsx` — primary location
- `components/layout/Footer.tsx` — check for phone number
- `messages/ar.json`, `messages/en.json` — check for number in i18n strings

---

## Edge Cases

- [ ] Phone number appears in metadata or SEO structured data (JSON-LD) — decide whether to hide there too or keep for SEO purposes
- [ ] Phone number in `sitemap.ts` or `robots.ts` — unlikely but check
- [ ] If phone number appears in dynamic content from a database/CMS, the data source must also be updated
- [ ] Screen readers: `aria-label` on the link should still describe its purpose without exposing the number (if full privacy required)

---

## Regression Requirements

Must NOT break:
- Contact form functionality
- Email links (EmailLink component — unrelated)
- All other content on the contact page
- SEO meta tags (do not remove structured data company info unless explicitly required)
