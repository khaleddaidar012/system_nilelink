# Shipment invoice line pricing

The editor saves `pricingMode: per-item-v1`. Each line has an internal `amount` (cost), `saleEqualsCost` (defaults to true), and an optional `sellingPrice`. Both prices use the line currency and the recorded exchange rate. Conversion rounds each line once to the invoice currency, using integer minor units.

When linked, the sale entry is disabled and follows the current cost. Unchecking “Cost equals selling price” enables an independent sale entry. The server requires this price when unlinked, ignores stale manual values when linked, and recalculates the total instead of trusting an aggregate supplied by the browser.

Customer items and grouped subtotals contain only converted selling amounts and descriptions. Costs, staff notes, the pricing switch and profit stay in internal accounting. Flat invoice items, grouped previews, customer JSON and PDFs use the same saved publication values.

Older drafts without this pricing mode keep their previous aggregate semantics until reviewed and saved in the new editor. The editor requires that save before preview/publication, rather than distributing a historic aggregate price across lines automatically. Existing publications and payment restrictions remain unchanged. No database schema migration is required.
