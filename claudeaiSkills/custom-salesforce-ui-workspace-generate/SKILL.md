---
name: custom-salesforce-ui-workspace-generate
description: "Generate a Lightning-styled record workspace as a self-contained, interactive Claude Artifact (React rendered inline in chat) for any Salesforce SObject: sortable list, bulk field edit, automatic Details/Related tabs (related lists auto-detected from lookup fields, no config needed), and real writes to Salesforce via a direct in-browser Anthropic API call with the user's connected MCP server, behind an in-app confirm modal. React inlined UMD, no build step. Lookup fields navigate client-side to another object's record, alongside an 'Open in Salesforce' link. Schema-driven; wire real records via live query results, sfWrite/sfMcpUrl for write-enabled objects. TRIGGER only for an interactive UI artifact to keep working in -- custom record/list-view UI, bulk-edit tool, Lightning-like workspace, 360 customer view, or cross-object nav. DO NOT TRIGGER for a plain 'list/show my records' request a chat table already satisfies."
license: Proprietary
metadata:
  author: Manigandan Dhamodaran <Manigandan.dhamodaran@outlook.com>
  version: 1.1.0
  source: "React 18 (MIT, Meta) UMD builds, unmodified upstream. Live-write mechanism uses the Anthropic Messages API's mcp_servers parameter, called directly from the published artifact in-browser, against whichever Salesforce MCP server the user has connected -- see references/wiring-live-mcp-data.md for the exact request shape. UI engine, related-lists auto-detection, Details/Related tabs, and the in-app ConfirmModal were built and verified (including a headless jsdom regression test for a tab-state-bleed bug across cross-object navigation) in this session."
  relatedSkills: []
---
<!-- Copyright (c) 2026 Manigandan Dhamodaran <Manigandan.dhamodaran@outlook.com>. All rights reserved. This skill and its contents are the intellectual property of the author. -->

# Salesforce UI Workspace Generator

Generates a Lightning-styled record workspace -- list view, record detail with automatic
Details/Related tabs, bulk edit, cross-object navigation, and optional real writes back to
Salesforce -- as a self-contained **Claude Artifact**, not Salesforce metadata. The engine
(`assets/engine/record-workspace.js`) is schema-driven and genuinely generic: it has no
object-specific field names baked in. Every run supplies its own config describing which
object(s), which fields, and which records.

`references/design-notes.md` records the visual/interaction choices already made for this
artifact -- read it before adding new component classes or changing `assets/engine/shell.html`'s
CSS tokens.

---

## 0. Router — answer the question that was asked

| The user asks… | Go to |
|---|---|
| "build a record/list-view UI for [object]" | §1 below -- assemble the four pieces, publish |
| "what fields/config does the workspace need" | [`references/field-schema-guide.md`](references/field-schema-guide.md) |
| "give me a starting point / a demo" | [`assets/samples/sample-config.js`](assets/samples/sample-config.js) -- a working two-object, one-lookup example |
| "make it work with real/live data" / "save edits back to Salesforce" | §3 below and [`references/wiring-live-mcp-data.md`](references/wiring-live-mcp-data.md) |
| "give me a 360 view" / "show related records" | §2 below -- related lists are automatic, no extra config needed |
| "why does it look like this" / "add a new visual pattern" | [`references/design-notes.md`](references/design-notes.md) |

---

## 1. Assemble and publish

The published artifact is four pieces concatenated in order into one standalone HTML file (with a
proper `<!DOCTYPE html><html><head>...</head><body>...</body></html>` wrapper -- assembling as a
bare fragment has caused real rendering failures, don't skip this):

1. `assets/engine/shell.html`, split at `</style>` -- everything before that (incl. `</style>`)
   goes in `<head>`, everything after (the `<div id="root">`) goes in `<body>`
2. `assets/engine/react.production.min.js`, wrapped in `<script>...</script>`
3. `assets/engine/react-dom.production.min.js`, wrapped in `<script>...</script>`
4. A config script — `<script>window.__RECORD_WORKSPACE_CONFIG__ = { ... };</script>` — built for
   the request, or `assets/samples/sample-config.js`'s content verbatim for a quick demo
5. `assets/engine/record-workspace.js`, wrapped in `<script>...</script>` (must come after #4,
   since it reads the config global at load time)

Full config shape, field types (including `lookup` and its cross-object navigation), `statusField`,
`summaryRollups`, `relatedLists`, `sfWrite`, and `recordLinkField` are documented in
[`references/field-schema-guide.md`](references/field-schema-guide.md) — read it before hand-writing
a config rather than guessing the shape from the sample.

**Assembly gotcha (learned the hard way):** if you're concatenating these pieces with shell
commands, prefer a single Python (or similar) script that reads and writes files directly.
Chaining many `echo`/`printf`/`cat` calls into one shell redirect has silently truncated output
mid-write in practice, producing a file that looks fine by size at a glance but is missing its
closing tags and simply renders blank. Always sanity-check the assembled file afterward: script
tag counts should be balanced, and it should end with `</html>`.

## 2. Multi-object / cross-object navigation, and related lists

A `fieldSchema` entry with `type: 'lookup'` and a `refObject` naming another key in `objects` reads
as a foreign id and renders as an in-workspace navigation link — in both the list-view table and
the record view. Following it is a pure client-side nav-stack push, never a page load or `<a href>`
— the record you land on can itself have lookups back the other way, and a dedicated Back control
(top-left, always pure React state) steps back one hop at a time. This is independent of, and
always alongside, the per-record "Open in Salesforce" deep link (`recordLinkField`) — one navigates
within the artifact, the other always leaves it.

**Related lists (360-style views) are automatic.** The engine scans every object's `fieldSchema`
for `lookup` fields and, for whichever object each one points at, wires a related-list section back
onto that target object's record view automatically -- e.g. if `Opportunity`, `Contact`, `Asset`,
and `Activity` all have a `lookup` field pointing at `Account`, `Account`'s record view gets all
four as related-list tabs with zero extra config. Every record view shows a Details/Related tab bar
(styled like native Lightning record pages); Related only appears when something resolves. You can
still set an explicit `relatedLists` array on an object to override labels/columns or add a
relationship the data doesn't literally model as `type: 'lookup'`. See `field-schema-guide.md` for
the exact shape of both `lookup` fields and explicit `relatedLists` entries.

## 3. Live data: reads and writes

This skill's engine can operate on real records directly, with no separate capability-granting
step needed beyond what's described here.

**Reads:** populate the config's `records` arrays with real Salesforce data (e.g. from a `soqlQuery`
tool call made before assembling the artifact) rather than placeholders.

**Writes:** set `sfWrite: { sobjectType: 'Opportunity' }` on an object and a top-level `sfMcpUrl`
(the user's connected Salesforce MCP server URL) on the workspace config, and every editable field
on that object writes through to the live record automatically — no per-field whitelist required.
Each field's real Salesforce API name comes from its own `apiName` (falls back to the field's `key`
if omitted), so the simplest setup uses real API names as config keys directly. `lookup`-type
fields and any field marked `noWrite: true` are excluded automatically. Full details, including how
to exclude fields and how id/`idField` must be a real Salesforce Id (not a synthetic local key) for
`sfWrite`-enabled objects, are in `field-schema-guide.md`.

Mechanically, this works by having the published artifact call the Anthropic Messages API
(`https://api.anthropic.com/v1/messages`) directly from inside the browser, passing the user's
connected Salesforce MCP server via `mcp_servers`, and instructing that inline call to invoke
`updateSobjectRecordTool`. See `references/wiring-live-mcp-data.md` for the exact request shape.

Every write shows an **in-app confirm modal** before anything is sent — naming the exact field,
new value, and (for bulk edits) record count. This is a real component (`ConfirmModal` in
`record-workspace.js`), not `window.confirm()`/`window.alert()` — native browser dialogs are
unreliable inside a sandboxed artifact iframe (often silently blocked, reading as an instant
"cancel"), so don't reintroduce them if you're extending this.
