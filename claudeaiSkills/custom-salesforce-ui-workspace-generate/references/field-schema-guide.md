# The workspace config — shape and assembly

The engine (`assets/engine/record-workspace.js`) is generic: it renders whatever
`window.__RECORD_WORKSPACE_CONFIG__` describes. There is nothing object-specific in the engine
itself — no "Opportunity", no hardcoded field names. Every run supplies its own config.

## Assembling the artifact

The published page is four pieces concatenated in this order, exactly like a normal Claude
Artifact publish (write one file, call the `Artifact` tool on it):

1. `assets/engine/shell.html` — design tokens, CSS, `<div id="root">`. No JS.
2. `assets/engine/react.production.min.js` and `assets/engine/react-dom.production.min.js`,
   each wrapped in its own `<script>...</script>` — unmodified React 18 UMD builds, inlined
   because the Artifact CSP blocks external script `src`s.
3. **A config script** — a `<script>window.__RECORD_WORKSPACE_CONFIG__ = { ... };</script>`
   block built for the current request (real schema/data, or `assets/samples/sample-config.js`
   verbatim for a quick demo).
4. `assets/engine/record-workspace.js`, wrapped in its own `<script>...</script>` — the engine
   itself. Must come AFTER the config script; it reads the global at load time.

Concatenate these into one file (a `cat`/`Get-Content` join works fine — no build step, no
bundler) and publish it with the `Artifact` tool. Read `artifact-design` first if you're touching
`shell.html`'s tokens or adding new component classes — the token rationale is in
`design-notes.md`, but the skill itself doesn't repeat `artifact-design`'s guidance.

## Config shape

```js
window.__RECORD_WORKSPACE_CONFIG__ = {
  homeObject: 'Opportunity',      // key into `objects` — this object's list view is the entry point
  objects: {
    Opportunity: {
      objectLabel: 'Opportunities',    // plural label -- breadcrumbs, search placeholder, empty state
      workspaceLabel: 'Pipeline Desk', // optional -- top-left brand text; defaults to objectLabel
      idField: 'id',                   // optional, defaults to 'id'
      primaryField: 'name',            // which field is the record's display title
      recordLinkField: 'sfLink',       // optional -- key holding a real Salesforce record URL
      statusField: { ... },            // optional -- see below
      fieldSchema: [ ... ],            // see below
      tableColumns: ['name', 'stage', 'amount'],  // ordered subset of fieldSchema keys shown in the table
      summaryRollups: [ ... ],         // optional, up to 3 -- see below
      records: [ { id: 'opp-1', name: '...', ... }, ... ]
    },
    Account: {
      objectLabel: 'Accounts', idField: 'id', primaryField: 'name',
      fieldSchema: [ ... ], records: [ ... ]
      // objects that are never `homeObject` don't need tableColumns/summaryRollups --
      // they're reached only by following a lookup, never shown as their own list.
    }
  }
};
```

### `fieldSchema` entries

| key | required | meaning |
|---|---|---|
| `key` | yes | property name on each record object |
| `label` | yes | column header / field label |
| `type` | yes | `text`, `currency`, `date`, `percent`, `number`, `picklist`, `textarea`, or `lookup` |
| `section` | no | `'info'` (default) or `'additional'` -- which record-view section it lands in |
| `wide` | no | spans both columns of the record-view field grid |
| `options` | `picklist` only | array of selectable strings |
| `bulkEditable` | no | shows an "Edit {label}" button in the bulk-action bar when rows are selected |
| `refObject` | `lookup` only | which key in `objects` this field's value (a foreign id) resolves against |

A `lookup` field's raw value is the **id** of a record in another (or the same) object. The
engine resolves it against that object's live `records` (including any in-session edits) and
renders it as an in-workspace navigation link -- in both the list-view table and the record
view -- never a real `<a href>`, always a pure React state push (see `design-notes.md` for why
that matters). If the target id doesn't resolve (wrong id, object missing from config, or the
target record was filtered out of that object's dataset), it renders as empty rather than a
broken link.

### `statusField`

Drives the colored pill (in the table's status column and the record header) and the list
view's status-mix bar. `buckets` maps a picklist value to a semantic bucket -- `'good'`,
`'critical'`, or omit for neutral/informational (`'open'`-style) styling. Semantic color is
separate from the workspace's accent color by design.

### `summaryRollups`

Up to three stat tiles beyond the always-present "Records In View" count. Each entry:
`{ field, agg: 'sum' | 'avg' | 'count', bucket, label }`. `bucket` is optional and, when set,
filters to only the rows whose `statusField` bucket matches (e.g. sum `amount` only where the
bucket is `'good'`, to get a "Closed Won" style tile) -- omit it to aggregate across every row in
view. The same rollups also render as a small stats row in the record header.

### `relatedLists` (360-style child sections) -- now automatic for every object

Related lists are **auto-detected for every object**, not just one you manually configure. The
engine scans every object's `fieldSchema` for `lookup`-type fields and, for whichever object each
lookup points at, automatically adds a related list back to the object that owns that lookup. So
if `Opportunity`, `Contact`, `Asset`, and `Activity` each have a `lookup` field pointing at
`Account`, `Account`'s record view automatically gets Opportunities, Contacts, Assets, and
Activities as related-list tabs -- zero `relatedLists` config needed. Applies to any object, not
only whichever one is `homeObject`.

Record views show a Salesforce-style tab bar: **Details** | **Related** (with a live count badge),
matching native Lightning record pages. The Related tab only appears when at least one related
list resolves to something (i.e. some other object has a lookup pointing here).

You can still set an explicit `relatedLists` array on an object to override the label,
restrict/reorder which related objects show, or add a relationship the data doesn't literally
model as `type: 'lookup'`. Explicit entries take precedence over an auto-detected entry for the
same `refObject`+`foreignKey` pair; otherwise they're prepended before the auto-detected ones.

```
{ label: 'Opportunities', refObject: 'Opportunity', foreignKey: 'account',
  columns: ['name', 'stage', 'amount', 'closeDate'] }
```

- `refObject` -- the child object's key under `objects`.
- `foreignKey` -- the field key **on the child object** that stores the parent's id (i.e. the
  child's own `lookup`-type field pointing back at this parent).
- `columns` -- optional; defaults to the child's own `tableColumns` if omitted.

Rows are click-to-navigate into that child's full record view -- this section is a summary, not
an inline editor.

### `sfWrite` (real writes back to Salesforce, generic per object)

Optional, per object. When set, **every** editable field on that object writes through to the
live Salesforce record via the connected MCP server's `updateSobjectRecordTool`, not just a
hand-picked subset -- no per-field whitelist needed.

```
sfWrite: { sobjectType: 'Opportunity' }
```

- `sobjectType` -- the real Salesforce sObject API name. That's the only required key.
- Each field's real Salesforce API name comes from that field's own `apiName` in `fieldSchema`,
  falling back to the field's `key` if `apiName` is omitted. **The simplest setup: make config
  field keys the actual Salesforce API names** (`StageName`, `Amount`, `CloseDate`, not `stage`,
  `amount`, `closeDate`) -- then `sfWrite` needs nothing beyond `sobjectType` and every field just
  works, present or future.
- To exclude a specific field from writing (e.g. a derived/display-only value), set `noWrite: true`
  on that field.
- `lookup`-type fields never write by default -- their stored value is a local synthetic id used
  for in-workspace navigation, not a real Salesforce id, so pushing it as-is would corrupt the
  record. Only give a lookup field `apiName` if you've deliberately resolved it to a real id.
- (Legacy) an explicit `fieldMap: { configKey: 'ApiName' }` on `sfWrite` still works and takes
  priority over a field's own `apiName` -- kept for configs written before this became automatic.

Also requires a top-level `sfMcpUrl` on the workspace config (sibling of `homeObject`/`objects`) --
the user's connected Salesforce MCP server URL. Without it, every edit stays local no matter what
`sfWrite` says.

Every write shows an in-app confirm modal (not `window.confirm` -- native browser dialogs are
often blocked inside a sandboxed artifact iframe and silently read as "cancelled") naming the
exact field, new value, and (for bulk edits) record count before anything is sent. The record id
used is whatever's in the config's `id`/`idField` for that row, so it must be the real Salesforce
record Id, not a synthetic key, for `sfWrite`-enabled objects.

### `recordLinkField`

Optional. When a record has a non-empty value here, an "Open in Salesforce" affordance appears
--- a compact external-link icon in the table row, and a labeled link next to the title in the
record view. This is always a real external `<a target="_blank">`, independent of and
complementary to the in-workspace `lookup` navigation above: a rep can hop between related
records without leaving the artifact, and still jump out to the real Salesforce record whenever
they want it. See `wiring-live-mcp-data.md` for where this URL comes from live.
