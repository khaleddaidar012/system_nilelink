# Dynamic prices within quotation items

In each service's item row, enable **Different rates by quantity or days**, choose the unit and quantity, then configure consecutive pricing ranges. The first range starts at 1. Leave the final upper bound empty for all remaining units. Each item has independent rules, so freight, detention and other fees can use different quantities and rates within the same service.

- Five shipments: first shipment 5,000; shipment 2 onwards 1,000 → 9,000.
- Four overnight stays: first night 200; night 2 onwards 50 → 350.
- Seven days: days 1–2 at 500, days 3–5 at 300, day 6 onwards at 100 → 2,100.

The backend recalculates prices from the stored rules using integer minor currency units. Submitted client totals cannot override the calculated result. Invalid ranges, overlaps, gaps, uncovered quantities and invalid prices are rejected. Approved quote rules remain associated with their item; active tier quantities are carried into the existing request-invoice workflow.

Customer service rows show their name, selection checkbox and a labeled **View details** button. Prices and tier breakdowns appear inside the details dialog, including quantities, unit rates and per-service subtotals. Future ranges remain visible in the quotation even if the current quantity does not reach them. The overall quotation total remains hidden on the customer side.

Validation: three domain tests plus a D1 workflow test covering authoritative recalculation, invalid ranges, customer quote reads, acceptance and invoice seeding.
