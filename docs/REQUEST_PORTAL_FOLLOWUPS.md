# Request and customer portal follow-ups

- Customer request summaries and trackers hide cancelled or unaccepted services and use readable service status labels.
- Staff request pages retain stage management, issued quotation and invoices; the duplicate service status editor and pricing suggestions are removed. Request attachments show customer shipment invoices, not company verification documents.
- Employee assignment is optional: administrators can operate requests; staff can operate unassigned requests or requests assigned to themselves. Requests assigned to other staff remain protected.
- UCR is available after quotation acceptance. Accepted customs clearance uses team-provided UCR. Without accepted customs clearance the team can optionally request the customer's UCR. Customer ownership, revision checks and notifications remain enforced.
- After saving a completed stage, the stage form selects the next incomplete stage with an unsaved in-progress choice. No subsequent stage is changed until another save.
- Detailed invoice pricing omits quantity input. Existing tier totals remain unchanged; editing a tier amount records one unit at that amount. New tiers use one unit. Monetary inputs display zero as placeholder, keeping decimal typing available and clearing an amount as numeric zero.
- Customer quotation lists retain accepted and partially accepted rows and refresh after decisions.
- The dashboard has request, invoice, quotation, notification and two document cards, with follow-up count badges. Service shortcuts are removed. Verified accounts do not see the quick upload widget.

Validation uses local D1 workflow fixtures, TypeScript, ESLint, an isolated production build and read-only deployed bundle checks. No production requests, quotes or invoices are created for testing.
