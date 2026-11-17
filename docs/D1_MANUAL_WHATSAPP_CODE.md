# Manual WhatsApp acknowledgement — 22 October 2026

Explicitly requested business rule: take the last six decimal digits of the registered phone, add 123456, and compare the complete decimal result. There is no modulo, truncation or zero padding. Example: 01092912431 → 912431 + 123456 → 1035887. Results may contain six or seven digits.

`manualWhatsappCode` is shared by the live D1 verification handler and legacy verification route. D1 derives the value from the authenticated user's stored phone; a phone supplied in the request is ignored. Authentication and rate limiting remain required. Requesting WhatsApp account verification prepares the manual flow without contacting a messaging provider or returning a preview code. The UI accepts six or seven digits and describes a manual request rather than claiming automatic delivery.

This predictable rule does not prove possession of a WhatsApp account or receipt of a message. It only implements the business's requested acknowledgement. It must not be used for login, password reset or email verification. Those existing random/expiring flows are unchanged. Company document approval and service authorization remain independent of the WhatsApp flag.

Tests cover the seven-digit example, international/local/Arabic phone formats, six-digit sums, maximum carry, missing phone, rejected wrong code, server-owned phone selection, no external dispatch, and unchanged email OTP expiry behavior.

Published Worker version: 517c678a-4a48-46ca-9a29-5dbd441785c0. All 235 D1 tests passed; TypeScript and the isolated OpenNext build passed. Live validation on the already-verified admin account confirmed manual preparation without a message, wrong-code rejection and acceptance of the stored-phone calculation. No customer verification flag was changed for testing. The build used a fresh isolated directory on C because D lacked space; no older deployment caches were deleted.
