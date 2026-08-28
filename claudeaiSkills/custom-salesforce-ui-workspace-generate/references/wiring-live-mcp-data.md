# Wiring the workspace to live MCP data

`[inferred]` — this runbook is designed against this project's own `custom-platform-mcp`
reference material and a working prototype's UI behavior; it has not itself been exercised
end-to-end against a live org's MCP connection in a session. Treat the shape as sound, verify the
specific tool identifiers against the target org before relying on them (per `custom-platform-mcp`'s
own hard rule — never hand-write an `apiIdentifier`).

## What this skill does and doesn't own

This skill produces the **UI only** — the artifact that displays and locally edits a
`window.__RECORD_WORKSPACE_CONFIG__`. It does not itself:
- add or configure MCP tools on an org's `McpServerDefinition` (that's `custom-platform-mcp`),
- grant the Artifact live network access (that's the `artifact-capabilities` skill's
  connected-data mechanism),
- persist anything back to Salesforce.

Wiring live data is composing these three: `custom-platform-mcp` (server-side tool availability),
`artifact-capabilities` (client-side permission for the published page to call those tools), and
this skill (the UI that calls them and renders the result).

## Reads — populating `records`

The standard `sobject-reads`/`sobject-all` server's `soqlQuery` tool (already used generically in
this project's `salesRepMcp` server, `apiIdentifier` `psmcps:platform.sobject-all:soqlQuery`) is
the default source for both the list view's `records` array and a `lookup` field's target object
data:

- List view: one `soqlQuery` call per `homeObject`, respecting the calling user's own CRUD/FLS/
  sharing (same enforcement the standard server always applies — not something this skill adds).
- Lookup targets: either a **relationship query** in the same `soqlQuery` call (e.g.
  `SELECT Id, Name, Account.Id, Account.Name FROM Opportunity`, flattened into `accountId`/an
  `Account` object's `records` array), or a **second `soqlQuery`** scoped to the ids actually
  referenced (`SELECT Id, Name FROM Account WHERE Id IN (...)`) if the lookup targets aren't
  already covered by the first query's relationship fields. Prefer the relationship-query approach
  when the object graph is small (as in `field-schema-guide.md`'s two-object example) — one round
  trip instead of N.
- `recordLinkField`: this project's `salesRepMcp` server already ships a generic
  `getRecordLink` Apex-backed tool ("Builds a Salesforce record link for any object type from its
  Id — works for Accounts, Opportunities, Tasks, Contacts, or anything else"). Call it once per
  record (or reuse its URL-construction pattern client-side, if the calling agent already has the
  org's base URL) to populate `sfLink`. This is read-only and low-risk — safe to populate
  unconditionally, unlike the write path below.

## Writes — bulk edit and inline field edit

The standard `sobject-mutations`/`sobject-all` server ships `updateSobjectRecord` (and
`createSobjectRecord`, not needed by this UI's edit-in-place model) as the generic write
counterpart to `soqlQuery` — same enforcement model (CRUD/FLS/sharing per the acting user), no
custom Apex required for a plain field update. Per `custom-platform-mcp`'s hard rule, its
`apiIdentifier` must be captured from the target org (Setup → API Catalog → Add Tools, or the
`mcpserverdef-toolkit.mjs add-tool psmcps` script) — never hand-written — and it may not yet be
adopted onto a given org's `McpServerDefinition`.

**This UI does not call a write tool automatically.** The engine's inline field edit and bulk
edit already commit to *local React state* the instant you blur a field or apply a bulk change —
that's what makes the prototype feel responsive with no backend at all. Wiring a live write tool
means adding an explicit confirm step **before** that local commit becomes a real `updateSobjectRecord`
call, mirroring the guardrail pattern this project already uses for `sendCustomerEmail` in
`salesRepMcp`: never fire a mutating tool call speculatively or as a default path — only after
the user has explicitly confirmed the specific field, value, and record. A reasonable shape:

1. Local edit commits to UI state immediately (as it does today) — the workspace stays responsive.
2. A visible "unsaved" affordance (not shipped in the base engine — an extension point) shows
   which records have local-only changes.
3. A separate, explicit "Save to Salesforce" action — per-record or per-bulk-batch — is what
   actually calls `updateSobjectRecord`, one call per changed record, and only after that
   explicit trigger.
4. On failure, surface the tool's real error (object CRUD/FLS/sharing denial, validation rule,
   etc.) rather than silently reverting — the local state and Salesforce's state are allowed to
   diverge until the explicit save succeeds.

This is a deliberate design choice, not a gap: it keeps "editing in the workspace" and "writing to
Salesforce" as two separate, both user-visible steps, the same separation this project already
enforces for outbound email.
