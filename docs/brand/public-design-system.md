# Public design system — Task 22

The reusable marketing foundation lives in `components/public-brand/`. It is ready for tasks 23–30 to assemble the public pages. Existing application layouts have not been wrapped or replaced by this foundation commit.

## Scope and theme policy

`BrandScope` is an explicit opt-in boundary. Its CSS Module owns prefixed `--nl-public-*` variables; it does not rewrite `:root`, `html`, `body`, Tailwind primary colors or the existing `ThemeProvider`. The font-face declarations use the unique family `NileLink Public Arabic`.

The marketing palette is fixed: paper/sand sections plus intentional Steel, Corten, photographic and gradient surfaces. It remains the same when the application's global `.dark` class changes. `color-scheme: light` belongs to this boundary only. Portal, admin and invoice routes retain their own preferences and styles. Do not wrap the shared locale layout indiscriminately: integration should opt in on the public marketing routes.

## Components

| Export | Use |
|---|---|
| `BrandScope` | Locale, RTL/LTR, local palette and typography boundary |
| `BrandContainer` | Responsive 20–64px gutters and a maximum 1280px content width |
| `BrandSection` | `quay`, `paper`, `steel`, `corten`, `oxidation`, `photo` surfaces |
| `BrandStack`, `BrandGrid`, `BrandActions` | Vertical spacing, responsive cards/fields, wrapping actions |
| `BrandHeading` | Semantic h1/h2/h3 with display, section or card scale |
| `BrandText` | Body, small or eyebrow text |
| `BrandCard` | Chalk surface with readable local colors even inside a dark section |
| `BrandButton` | Native button; primary, secondary or Steel; defaults to `type="button"` |
| `BrandLink` | Native anchor styled as an action; caller supplies a real href |
| `BrandInput`, `BrandSelect`, `BrandTextarea` | Visible labels, hint/error IDs, native attributes and accessible validation |
| `BrandNotice` | Error/success text with icon and alert/status semantics |
| `BrandShowcase` | Development review content only, with no submission or public route |

```tsx
import {
  BrandScope, BrandSection, BrandContainer, BrandStack,
  BrandHeading, BrandInput, BrandButton,
} from "@/components/public-brand"

<BrandScope locale="ar">
  <BrandSection tone="oxidation">
    <BrandContainer>
      <BrandStack>
        <BrandHeading>اطلب عرض سعر كامل</BrandHeading>
        <BrandInput id="quote-phone" label="رقم الموبايل" type="tel" dir="ltr" required />
        <BrandButton variant="steel" type="submit">ابعت الطلب</BrandButton>
      </BrandStack>
    </BrandContainer>
  </BrandSection>
</BrandScope>
```

Form submission, field state and backend integration remain the caller's responsibility (task 26). Give fields stable unique IDs. Existing native input/select/textarea props are forwarded. Supply `error` and `hint` as readable text; their DOM IDs are linked automatically. Disabled controls remain native disabled controls. Links are not given fake disabled behavior.

## Tokens and visual rules

- Source colors: Corten `#A4492A`, Steel `#161616`, Chalk `#F2EEE6`, Patina `#3B2A22`, Ember `#DF7B4F`, Quay `#E5DFD3`.
- Rib Shadow stays in the corrugation asset; it is not an action color.
- Spacing follows a 4px base with 4/8/12/16/24/32/48px tokens. Cards and controls use a quiet 2px corner radius; the distinctive mark/chip geometry comes from the approved SVG assets.
- Display type scales from 2.4rem to 5.5rem, section type 1.8–3rem, card type 1.15–1.5rem. Arabic uses natural letter spacing and a taller heading line height.
- Body text and hierarchy follow the Medium typography direction. Arabic uses the prepared variable Noto Kufi Arabic, with a temporary bold heading weight.
- Single-line controls are 60px tall so native selects and text inputs align with the Arabic font's metrics. Textareas retain row-based height and native resizing.
- Actions have 48px minimum targets, visible focus outlines, hover and disabled states. Reduced motion removes action transitions.
- The gradient is Patina→Corten at 160°. Small text on its brighter end stays Chalk to retain contrast. Photo text defaults to Chalk over a conservative 65–90% Steel scrim. Final hero positioning is task 23's responsibility and must preserve readable contrast.
- Semantic error/success colors are separate from service identity and are paired with text/icons. All public service card chips remain Corten; the internal service-color system is not reused here.

## Font dependency

Arabic is self-hosted through the prepared WOFF2 subsets. English requests `Safiro Medium` and deliberately falls back to Arial/Helvetica/system sans-serif while the licensed webfont is pending. There is no fake Safiro file, failing font URL or substitution presented as the approved font. `publicBrandFontReadiness` records this limitation.

The user approved beginning the foundation with the ready assets while Safiro is completed later. This makes task 22's component/layout work usable; it does not close task 21's missing-font dependency or claim final typography fidelity.

## Review preview

```text
node scripts/brand/preview-design-system.mjs
```

Open `http://127.0.0.1:43122?locale=ar&theme=light`, or use `locale=en` / `theme=dark`. Stop it with Ctrl+C. The server binds loopback only and serves the generated review plus `/brand/nilelink/` assets. It has no business API or submission handler.

The preview server renders the real React components, mirrors CSS Module isolation with a preview prefix, and compiles the existing global CSS alongside an unscoped legacy sample. The `baseline=1` query omits the new stylesheet for before/after isolation checks. This is a local component review, not a production-route smoke test or a published homepage.

## Validation

See [public-design-validation.json](public-design-validation.json).

- TypeScript and ESLint passed for the components and preview tool.
- Eight browser cases: Arabic/English × light/dark global theme × 1280/390px.
- Unscoped legacy panel/button/input computed styles were identical before/after adding the public stylesheet.
- Public scope/card/control colors and fonts stayed identical across the global theme toggle.
- Visible text contrast was at least **4.8155:1** in the sampled component states. Photographic contrast uses the conservative worst-case scrim background; this is not a full-page WCAG conformance claim.
- Field labels and descriptions resolve to existing elements. Keyboard focus is visible, disabled states are native, reduced motion is respected, images/font load, and no horizontal page overflow occurs.
- Arabic first-row controls align at 60px height. Light desktop and Arabic mobile/form previews were visually reviewed.

The foundation is delivered on the public-brand development branch. No live redesign has been declared: homepage assembly and release remain tasks 23–30.
