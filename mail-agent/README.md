# NileLink per-employee MailEnable connector

This independent Windows service connects the site's staff-only mailbox section to IMAP and SMTP. Each employee supplies their own mailbox credentials through the site after the connector is configured. The website encrypts the password per owner; this service keeps it only in memory for each authenticated request. No mailbox password belongs in this installation package.

## Install on the MailEnable server

1. Install official Node.js 24 LTS (22.15+ minimum).
2. Extract the private installation ZIP into an administrator-only folder. It contains a shared service key; do not publish or email it.
3. Run `Install-MailAgent.ps1` from an elevated PowerShell. The script installs `NileLink Mail Agent` in `C:\NileLink\MailAgent`, with permissions restricted to SYSTEM, administrators and the installing user. It does not change MailEnable, its mailboxes, SMTP relay settings, MongoDB, or the existing backup service.
4. Review `C:\NileLink\MailAgent\agent.config.json`. Defaults are IMAPS on 127.0.0.1:993 and SMTPS on 127.0.0.1:465. Set `tlsServerName` to the hostname in MailEnable's valid TLS certificate. A certificate installed only on IIS/webmail does not automatically enable TLS on IMAP/SMTP. If SMTP uses STARTTLS on 587, set `smtpPort: 587` and `smtpSecure: false`; TLS remains required. Do not disable certificate validation. Restart the service after configuration changes.
5. Using Cloudflare Tunnel on this **same server**, add the public hostname `mail-api.nilelinklogistics.com` to service `http://127.0.0.1:8791`. Do not open port 8791 in the public firewall. The connector binds only to loopback and all requests require a timestamped HMAC signature over the body and employee identity. Unsigned requests deliberately return 401/404, not mailbox details.
6. Provide the HTTPS connector hostname to the site administrator. Set `MAILBOX_AGENT_URL=https://mail-api.nilelinklogistics.com` in the Worker only after the tunnel is live. The matching `MAILBOX_AGENT_HMAC_KEY` and `MAILBOX_ENCRYPTION_KEY` are stored in the private deployment package and installed as Worker secrets by the site administrator. Never paste the keys into chat.
7. In the site, each active employee opens **Email**, enters the mailbox's actual `@nilelinklogistics.com` address and its own password, and selects **Test and connect**. Connecting checks IMAP login and SMTP authentication but sends no test email.

Official references: [Cloudflare Tunnel public-hostname routing](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/), [MailEnable documentation](https://www.mailenable.com/documentation/), [ImapFlow](https://imapflow.com/docs/), [Nodemailer SMTP](https://nodemailer.com/smtp).

## Behaviour and limits

- Account roles/status are re-read from D1 on every mailbox request. Customers and disabled employees are denied. The browser cannot select another employee's owner ID or stored credentials.
- 30 messages per page; sender, subject, folders, HTML or plain-text reading, reply threading, HTML and plain-text composition, and attachments. The site can add an opt-in employee signature using the sender's account name and mailbox address plus company website and Facebook links. Email scripts/forms do not execute in the site.
- Opening a successfully fetched message then explicitly sets its IMAP `\\Seen` flag. The unread count comes from the actual Inbox, including messages read using webmail. The sidebar refreshes once per minute while visible and immediately after the site's successful read operation. New-count increases show an in-app toast; no OS notification permission is requested.
- Source message size limit: 8 MB. Attachments: 5 MB combined, 5 files per outgoing message. Larger mail remains available through webmail.
- From is always the authenticated mailbox. The user cannot supply a different sender. SMTP acceptance is reported separately from Sent-copy success and is not a guarantee of inbox delivery.
- Send request IDs and outcomes are persisted under `state/` before SMTP. A failed or ambiguous response never causes automatic resending. Keep this directory across service updates. Do not manually retry an uncertain send before checking Sent/server logs with an administrator.
- No deletion of mail or mailboxes is implemented. Disconnecting removes only the website's encrypted connection profile, never messages on the mail server.
- No mailbox message content is stored in D1. Existing D1 backups automatically include the encrypted per-user connection profiles. Preserve `MAILBOX_ENCRYPTION_KEY` separately to recover those profiles; existing backup-encryption keys do not decrypt mailbox credentials.

## Readiness

Until the Windows service, TLS connection, tunnel and Worker settings are configured, the site's Email section displays **Server setup required**. It does not show sample messages or pretend that reading or sending is operational. No real test messages are sent by the automated test suite.

## Mailbox login name

The website connection form accepts the mailbox username (for example `info`) and adds `@nilelinklogistics.com` automatically. The connector can use `authUsernameFormat: "local-part"` in its restricted configuration when MailEnable expects `info` for IMAP and SMTP authentication. The default remains the full email address. This setting never changes the full sender address or the allowed domain. Restart the connector after changing it.
