# Design notes — why the tokens look like this

Read `artifact-design` before changing anything in `assets/engine/shell.html` — this doc records
the choices already made for this specific artifact so an edit stays consistent with them; it
doesn't restate that skill's general guidance.

## Palette

Four named roles, light-first, with a full dark redefinition (`@media (prefers-color-scheme:
dark)` guarded by `:root:not([data-theme="light"])`, plus `:root[data-theme="dark"]` for an
explicit toggle):

- `--canvas` / `--surface` / `--surface-sunken` — a cool blue-grey neutral (`#F4F6FA` light,
  `#12141A` dark), not pure grey — biased toward the accent hue so it reads as chosen, not
  inherited.
- `--accent` — `#0B5FD9` light / `#5B9DFF` dark, a considered Lightning-blue variant rather than
  a literal copy of SLDS's brand blue.
- `--good` / `--warning` / `--critical` — semantic status colors, deliberately **separate** from
  `--accent`. A status pill or breakdown-bar segment never borrows the accent hue for meaning.

## Type

No embedded webfont. Two roles, both system-native:

- `--font-ui` — the OS's own UI font stack (`-apple-system`, `Segoe UI Variable`, etc.). The
  subject here **is** system chrome — an enterprise record workspace standing in for native
  Lightning UI — so leaning on the platform's own UI font is a grounded choice, not a shortcut.
- `--font-data` — a monospace stack (`Cascadia Code`, `SF Mono`, `Consolas`) reserved for anything
  tabular: currency/percent values, the stat-tile numbers. Paired with
  `font-variant-numeric: tabular-nums` wherever digits stack in a column.

## Layout

List view: a rollup summary strip above a sortable/searchable table. Record view: a header (title,
status pill, Salesforce deep-link, rollup stats) followed by field sections laid out as a
two-column grid (`.field-grid`), collapsing to one column under 760px. Bulk actions live in a
fixed bottom bar rather than a sidebar — it only exists when something is selected, and disappears
cleanly rather than reserving permanent space.

## Interaction

- Every actionable element is a real `<button>` (or has `role="button"` + `tabIndex` + `Enter`
  handling) — checkboxes, sortable headers, editable field values, lookup links. Nothing depends
  on hover alone.
- In-workspace navigation (`lookup` fields, the back action) is **pure React state** — a
  `<button onClick>` that pushes/pops a nav stack, never an `<a href>`, `window.location`, or
  reload. The "Open in Salesforce" affordance is the one deliberate exception: it's a real
  external link by design, because it's meant to leave the artifact.
- `prefers-reduced-motion: reduce` zeroes out transition/animation durations globally.
