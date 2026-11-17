# Portal status and notification update — 22 October 2026

The header, sidebar and account-health banner now render CompanyStatusBadge from the same PortalContext customer.accountStatus value. The badge owns the shared label, icon and styles. Unverified is amber; inactive is rose. The banner no longer substitutes the unverified state for warning accounts with no documents. This changes presentation, not approval or permissions.

Opening the notification bell acknowledges notifications through the authenticated API and updates both counters. The live Worker normalizes an empty mark-read POST to explicit JSON because OpenNext exposes empty request bodies as non-null streams. Nonempty payloads and authentication/tenant checks are preserved.

Published version: 17f78e9a-4b8d-4e98-9fcd-297bf49ba0a6. Isolated Next/OpenNext build passed, including TypeScript, 340 static pages and trace isolation. The focused gate and notification/workflow tests passed 36/36; focused ESLint reported no errors.

Live browser verification used the existing admin account: opening the bell changed the sidebar count from 35 to no badge; it stayed cleared after reload. An independent authenticated read confirmed unreadCount=0 and all five latest notifications read, without submitting another acknowledgement. Evidence is under the private first-launch/portal-ui directory. The admin has no customer company card, so this browser test does not represent the customer's three-badge screenshot.

The verification screen also displayed the compact email confirmation on the existing admin account. Pending WhatsApp layout is conditional in the built application; the admin's WhatsApp flag was already verified. No WhatsApp message or OTP delivery was tested or enabled by this update.
