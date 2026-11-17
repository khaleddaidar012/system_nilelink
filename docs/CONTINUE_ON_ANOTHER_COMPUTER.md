# Continue on another computer

Clone this repository, checkout main, and run npm ci with a current Node.js LTS release. Copy .env.example to .env.local and supply your own environment settings. Run npm run dev for local development.

The source includes the current invoice, quotation, customer portal, shipment tracking, backup and mail agent work, migrations and tests. Progressive quotation pricing and the revised customer details button are included.

Private credentials, customer uploads, database snapshots, dependencies and generated builds are intentionally excluded. Retrieve secrets through your existing secure configuration process; do not commit them. Existing production data remains in Cloudflare D1/R2.

Production is deployed through the scripts in scripts/d1; local private deployment receipts and credentials are not transferable through Git. See the deployment documentation before deploying from a new computer. The root wrangler.jsonc is a legacy template and contains no authentication/database secrets.
