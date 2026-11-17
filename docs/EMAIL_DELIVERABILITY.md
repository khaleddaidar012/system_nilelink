# Transactional email deliverability

## Findings — 2026-11-16

The actual domain is `nilelinklogistics.com`, not the task's example `nilelink.com`. Resend's authenticated read-only domains API reports **verified**, region `eu-west-1`. Public DNS has one root SPF record, a `send` return-path SPF + MX, a `resend._domainkey` DKIM public key, and `_dmarc` with `p=none; rua=mailto:dmarc@nilelinklogistics.com`. DNS existence alone does not prove an individual message passed alignment or reached Inbox.

Do not replace the return-path MX/SPF with generic SES examples: the currently published MX is `feedback.forge.rmta.net`. Obtain exact required records from this account's Resend domain configuration. Root SPF authorizes an existing mail server and must not be overwritten or duplicated. No DNS change was made.

Code now supplies branded From, Reply-To, plain text alongside HTML, and X-Mailer. SMTP preserves the configured verified sender instead of using the authentication username as From. Existing provider receipts, idempotency, attachment handling and safe error behavior remain. These changes improve message construction; they do not guarantee Inbox placement.

## Provider choice

Keep Resend: it is already integrated, authenticated and verified. Switching to SendGrid, Mailgun or SES would require new verification, event handling and reputation work without evidence it fixes Yahoo. There is no defensible universal “best Yahoo provider.” SES is useful for AWS-oriented infrastructure, SendGrid/Mailgun offer established email operations tooling, while Resend is the smallest change for this Next.js/Workers application. Reassess using actual bounce/complaint data, not vendor claims.

## DNS and provider operations

1. In Resend Domains, compare every required record's name, type, value and verification status against DNS. DKIM public keys are account-specific; do not generate substitute keys locally. SPF must be a single TXT policy at each hostname.
2. Retain monitoring DMARC (`p=none`) while confirming all legitimate senders align. Confirm `dmarc@` is a working monitored mailbox before relying on aggregate reports. Move to quarantine/reject only after reviewing reports and every legitimate sending source.
3. PTR/forward DNS belongs to the sending infrastructure provider for shared API mail, not to the website IP. For dedicated/self-hosted SMTP, ask that provider to set forward-confirmed PTR.
4. Disable open/click tracking for authentication mail in the provider domain settings. Keep reset/verification links on the canonical HTTPS application domain, avoid URL shorteners, and keep OTPs out of subject lines/logs.
5. Send only requested messages, suppress hard bounces and complaints using provider suppression facilities, and review Resend delivery/bounce/complaint events. A provider “delivered” event means acceptance by the recipient server, not Inbox placement.

## Headers and content

OTP/password reset messages are transactional. No fake `List-Unsubscribe` endpoint is added. A marketing subscription system needs a real one-click unsubscribe endpoint and visible opt-out link; that is a separate flow. X-Mailer and Reply-To are useful metadata, not authentication or spam bypasses.

Use short factual subjects such as “NileLink — Email verification code”, simple HTML, an equivalent plain-text body, expiry and unsolicited-request guidance. There is no reliable universal forbidden-word list; avoid deceptive urgency, promotional language, excessive punctuation and image-only messages.

## Verification still required

- Obtain full headers of a recent Yahoo message that landed in Spam. Inspect `Authentication-Results`, From domain, DKIM `d=`, envelope/Return-Path domain and DMARC alignment; redact recipient/OTP/token values before sharing.
- Run controlled verification/reset checks to owned Yahoo and Gmail inboxes plus a mail-tester address. No test email was sent by this audit. Check MIME text+HTML, safe canonical links and expiration, provider receipt/events and actual folder placement.
- Watch hard bounces, complaints and deferrals daily. Yahoo requires low complaint rates (below 0.3%); investigate any complaint rather than approaching that ceiling.
- Ramp legitimate requested traffic gradually, with no purchased lists or artificial warm-up spam. DNS propagation depends on record TTL; reputation recovery has no guaranteed deadline.

No unauthenticated general-purpose send-email route was added: existing authenticated, rate-limited OTP/reset routes use the shared transport.

Sources: [Yahoo sender requirements](https://senders.yahooinc.com/best-practices/), [Yahoo FAQ](https://senders.yahooinc.com/faqs/), [Resend spam diagnostics](https://resend.com/guides/email/deliverability/why-emails-go-to-spam), [Resend custom headers](https://resend.com/changelog/custom-email-headers), [Google transactional unsubscribe exemption](https://support.google.com/mail/answer/14229414).

## Exact provider DNS records (read-only audit)

Obtained from the authenticated Resend domain configuration on 2026-11-16. These are public DNS values, not secret credentials. Existing verified records need no replacement.

| Name | Type | Value | Priority | Provider status |
|---|---|---|---|---|
| resend._domainkey | TXT | p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQD3oJOX1lDyLH2f4aj7ekOWoPiuBsSHbVxUVF+N5bKg7yZOk7B4+15BGQ92W1cqVwOGNfKVNpakTqbiRKDmADhG5UwDmkywYcAui3D1f16GfO3LgREQsci3CG8WgqaA1xI/6UKGHgLrgyF5h3liiVW4Y1q2Xyoggk4uGF2HNzudtwIDAQAB |  | verified |
| rsend | CNAME | rsend-euw1.forge.rmta.net |  | verified |
| send | CNAME | send.forge.rmta.net |  | verified |

The most recent Resend API page contained 17 messages, all marked delivered by the provider, including three addressed to Yahoo domains. This is a recent-page sample only and does not establish Inbox placement. Recipient addresses and security content were not saved in the audit report.
