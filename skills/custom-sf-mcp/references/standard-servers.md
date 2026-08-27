# Standard Hosted MCP Servers — Catalog Reference

Salesforce **Hosted MCP Servers**: Salesforce-hosted MCP endpoints that expose org
capability to any MCP-aware agent. Auth, discovery, and routing are managed by Salesforce.

**Sources:** `[doc]` developer.salesforce.com → Platform → Hosted MCP Servers → Reference →
Standard Servers · `[org]` verified against a live Revenue Cloud org at API v67.0.

---

## 1. Universal prerequisites `[doc]`

| Requirement | Detail |
|---|---|
| **API version** | **v67.0 or later** |
| **External Client App** | configured with the **`mcp_api`** scope (+ `refresh_token` for external agents) |
| **MCP client** | installed and configured with **OAuth** authentication |
| **Activation** | Setup → Quick Find → **MCP Servers** → find server → **Activate** |

Some servers add their own (e.g. Archive Connect needs an **Archive license** and the
**Archive Admin** permission set).

## 2. Server URL pattern `[doc]` `[org]`

```
Production        https://api.salesforce.com/platform/mcp/v1/<namespace>/<name>
Sandbox / Scratch https://api.salesforce.com/platform/mcp/v1/sandbox/<namespace>/<name>
```

⚠️ **`platform` appears TWICE in most real URLs and they are different things** — the first is
part of the fixed base path, the second is the server's *namespace*. Easy to drop one by mistake:

```
https://api.salesforce.com/platform/mcp/v1/sandbox/platform/headless-360
                           ^^^^^^^^ base path        ^^^^^^^^ namespace   ^^^^^^^^^^^^ name
```

So `platform.headless-360` → `.../v1/platform/headless-360` (prod) or
`.../v1/sandbox/platform/headless-360` (sandbox/scratch). Servers in another namespace resolve
with that namespace instead — e.g. `data.data360` → `.../v1/data/data360`.

The org's Setup UI shows the environment-correct URL. A scratch org shows the `sandbox`
form — confirmed on all 10 servers observed.

## 3. Security model `[doc]` — applies to every hosted server

> Every transaction runs **as the authenticated user**, scoped through an External Client
> App with the `mcp_api` scope. Object permissions (CRUD), field-level security, sharing
> rules, profile permissions, and permission sets all apply. **If you can't perform an
> action in Salesforce, your agent can't perform it through the MCP server.** The audit
> trail attributes every action to you.

Consequences to state out loud whenever activating:

- MCP **does not bypass** the permission model — but it does widen the *surface* reachable
  under those permissions.
- Admin/developer users carry wide permissions, so an agent acting as them is
  correspondingly powerful. Salesforce's own guidance: **make config changes in a sandbox
  or Developer org first.**
- Most MCP clients support **tool-level restrictions** — require human approval before any
  tool that changes org configuration or alters/deletes data.

---

## 4. Catalog

### 4.1 Observed in-org `[org]` vs published `[doc]`

**The two lists differ** — the org is authoritative for what can be activated *there*.

| Server (org UI) | API name | In docs? |
|---|---|---|
| SObject All | `platform.sobject-all` | ✅ |
| SObject Reads | `platform.sobject-reads` | ✅ |
| SObject Mutations | `platform.sobject-mutations` | ✅ |
| SObject Deletes | `platform.sobject-deletes` | ✅ |
| headless-360 | `platform.headless-360` | ✅ (Beta) |
| Data Cloud SQL | `data.data-cloud-queries` | ~ (docs list "Data 360" / "Data 360 Legacy") |
| Agentforce Grid | `platform.agentforce-grid` | ❌ not in the Standard Servers nav |
| salesforce-api-context | `platform.salesforce-api-context` | ❌ |
| metadata-experts | `platform.metadata-experts` | ❌ |
| engagement-interaction | `industries.engagement-interaction` | ❌ |
| — | Archive Connect (`archive/archive-connect`) | ✅ doc-only — **not in this org** |
| — | Tableau Next | ✅ doc-only — **not in this org** |

**Rule: never derive the activation list from the docs.** Availability is
license/namespace dependent. Try the catalog entry, and treat
`FIELD_INTEGRITY_EXCEPTION` as "not in this org → skip".

### 4.2 SObject family — the least-privilege ladder

The four SObject servers are deliberate CRUD slices. **Pick the narrowest that works.**

| Server | Tools `[org]` | Adds | Never does |
|---|---:|---|---|
| `sobject-reads` | 6 | query, search, schema, traversal | any write |
| `sobject-mutations` | 9 | + create, update | **delete** |
| `sobject-deletes` | 8 | + delete (with query to identify targets) | create, update |
| `sobject-all` | 11 (+2 prompts) | everything | — |

> **Doc/org tool-count reconciliation.** The doc pages list fewer tools than the org
> reports (e.g. Mutations: 6 documented vs 9 in-org). The gap is the three shared
> read helpers — `getUserInfo`, `listRecentSobjectRecords`, `getRelatedRecords` — which
> the doc pages omit from some servers. **6+3 = 9 ✓, 5+3 = 8 ✓.** Trust the org count.

**Tool inventory**

| Tool | reads | mutations | deletes | all |
|---|:-:|:-:|:-:|:-:|
| `getObjectSchema` — index mode (no params) = compact object list; detail mode (object name) = full field schema **plus admin-authored guidance** (e.g. "use `Calculated_ACV__c` not `Amount` for forecasting") | ✅ | ✅ | ✅ | ✅ |
| `soqlQuery` — SOQL read. Always `WHERE` + `LIMIT`; filter on indexed fields; max 50,000 records/transaction | ✅ | ✅ | ✅ | ✅ |
| `find` — SOSL across objects, max 2,000 records. Use when the object is unknown; cannot traverse relationships or sort | ✅ | ✅ | ✅ | ✅ |
| `getUserInfo` — authenticated user's ID, name, email, role, profile, manager, local time, timezone | ✅ | ✅ | ✅ | ✅ |
| `listRecentSobjectRecords` — recently viewed/modified, for "my accounts" / "that opportunity" | ✅ | ✅ | ✅ | ✅ |
| `getRelatedRecords` — child records via relationship path; multi-level | ✅ | ✅ | ✅ | ✅ |
| `createSobjectRecord` | | ✅ | | ✅ |
| `updateSobjectRecord` — omitted fields keep values | | ✅ | | ✅ |
| `updateRelatedRecord` — update child via parent + relationship path | | ✅ | | ✅ |
| `deleteSobjectRecord` — Recycle Bin, recoverable ~15 days in UI; **no undelete tool over MCP** | | | ✅ | ✅ |
| `deleteRelatedRecord` | | | ✅ | ✅ |

**Choosing `[doc]`:**
- **`sobject-reads`** — "the safest of the family." Right default and the right place to
  start: enough for Q&A, summaries, reports, meeting prep. Satisfies human-in-the-loop
  requirements for data modification.
- **`sobject-mutations`** — data entry / enrichment: log a note, create a task, update a
  stage. Write without deletion risk.
- **`sobject-deletes`** — data hygiene only: dedup, archival, purging test records.
  "Because deletion is the highest-risk mutation, deploy with extra care."
- **`sobject-all`** — full access "matching the permissions of the human-in-the-loop and
  trusting them to prompt appropriately. This provides maximum productivity gains."

### 4.3 `platform.headless-360` — Beta ⚠️

> ⚠️ **Beta Service** (from July 2026), subject to Beta Services Terms. Get explicit
> acknowledgement before activating in any org that matters.

The breadth play: rather than exposing thousands of features as individual tools, it ships
**four** tools over a continuously growing operation library. The agent's tool surface stays
small and stable while capability scales per release. Discovery happens **at runtime**.

Covers: query/create/update records · user management (create, deactivate, freeze, assign
perm sets and PSLs) · read/write/deploy Apex triggers · platform events, CDC, event relays ·
named credentials (auth, endpoints, certs) · Commerce Cloud Orders. At beta launch, "dozens
of operations, most focused on Setup tasks for admins."

| Tool | Internal name | Purpose |
|---|---|---|
| **Discover** | `discover` | Semantic + keyword search over the API corpus. `query` (required), `limit` (1–50, default 10), `domain` (AIP-103, e.g. `platform`/`commerce`/`service`), `resultType` (`endpoint` \| `sor`) |
| **Describe** | `describe` | Full spec for an operation: APIs, parameters, dependencies, ordered steps. `id` = qualified operation ID (e.g. `setup.platform.named-credentials.getNamedCredentials`) or SOR ID |
| **Dispatch** | `dispatch` | Runs the operation. `url` + `method` (GET/POST/PUT/DELETE/PATCH) required; optional `headers`, `body`, `queryParams`. Enforces the access guard before running |
| **Dispatch Read-Only** | `dispatch_readonly` | Same but `method` restricted to **GET**. Never changes data or config |

**Intended order: Discover → Describe → Dispatch.**

> **Not the same as Data 360 MCP.** Data 360 works only with Data 360 data; Headless 360
> works across all of Salesforce.

**`SOR` = Setup Operation Recipe** — a multi-step setup procedure, distinct from a single
endpoint. `resultType` filters between them.

### 4.4 The meta-tool pattern — recognise it `[doc]`

**Three servers deliberately expose 2–4 "meta-tools" instead of their full operation set**,
discovering the real operation at runtime. This keeps the agent's tool surface small and
stable while capability scales per release.

| Server | Meta-tools | Flow |
|---|---|---|
| `platform.headless-360` | `discover` → `describe` → `dispatch` / `dispatch_readonly` | search corpus → get spec → run |
| `data.data360` | `search` → `payload_examples` → `execute` | score tool families → get schema+example → run by name |
| Archive Connect | *(fronted by headless-360's `discover`)* | — |

**Why it matters for advice:** when an agent needs breadth cheaply, a meta-tool server beats
activating several concrete ones. Compare `agentforce-grid` at **51 tools** against
`headless-360` at **4** covering far more surface. Token cost per activated server is a real
design input, not a footnote.

### 4.5 `data.data-cloud-queries` — Data 360 **Legacy** ✅ this is your org's "Data Cloud SQL"

`[org]` The org's "Data Cloud SQL" (2 tools) **is the Data 360 Legacy server** — API name
and tool count both match exactly.

- Query-only access to Data 360. Superseded by `data.data360` but still shipped.
- **Tools (2):** `get_dc_metadata` (lists objects in the data space; `readOnlyHint: true`)
  and `post_dc_query_sql` (Query SQL; be specific in `WHERE`, use `LIMIT`; returns first
  chunk + pagination metadata)
- **Prereqs:** Data 360 license · **View Data 360** permission · OAuth MCP client
- Production `…/v1/data/data-cloud-queries` · Sandbox `…/v1/sandbox/data/data-cloud-queries`

### 4.6 `data.data360` — Data 360 (current) — **not in this org**

Full Connect API access, replacing the Legacy server. Three meta-tools: **`search`**
(natural-language → ranked tool families, e.g. `d360_segment_*`, `d360_activation_*`),
**`payload_examples`** (`toolName` → input JSON Schema + example + description), **`execute`**
(`toolName` + `paramsJson` string).

Manages DLOs, DMOs, data streams, transforms, calculated insights, segments, activations and
targets, data actions, data spaces, data kits, RAG retrievers, semantic search indexes, SDMs
and SDM entities, and DLO→DMO field mappings.

> ⚠️ **Two anomalies worth carrying:**
> 1. **API floor is v66.0**, not v67.0 — the only server observed below the v67.0 baseline.
>    **Version floors are per-server; never assume the universal 67.0.**
> 2. **Its sandbox URL breaks the pattern.** Every other server is
>    `…/v1/sandbox/<ns>/<name>`; Data 360 documents `…/v1/data/sandbox/data360`
>    (namespace *before* `sandbox`). Treat the documented URL as authoritative per server
>    rather than composing it from the pattern.
>
> Also: **MCP calls count against the underlying Connect API limits and Flex Credit usage.**
> The only server with a documented consumption/billing implication.

**Data 360 ≠ Headless 360** — Data 360 works only with Data 360 data; Headless 360 works
across all of Salesforce.

### 4.7 `analytics.tableau-next` — semantic layer — **not in this org**

New namespace: **`analytics`**. Exposes Tableau Next's semantic models (SDMs), dashboards,
visualizations, metrics/KPIs, and the **Concierge Analytics Q&A** engine. Agents operate at
the level of *business concepts* ("revenue by region", "churn rate") rather than raw SQL —
so answers reflect how the data team defined the metric.

~19 tools, all `readOnlyHint: true`, in four groups:

| Group | Tools |
|---|---|
| **Analysis** | `analyze_data` (NL question → Analytics Agent against an SDM; `target_entity_type` must be `sdm`), `list_dashboards`, `get_dashboard`, `list_visualizations`, `get_visualization` |
| **SDM structure** | `list_semantic_models`, `get_semantic_model`, `list_semantic_model_data_objects`, `list_semantic_model_relationships`, `get_semantic_model_logical_view` |
| **Business logic** | `list_semantic_model_measures`, `list_semantic_model_dimensions`, `list_semantic_model_metrics`, `get_semantic_model_metric`, `list_semantic_model_calculated_dimensions`, `list_semantic_model_calculated_measures` |
| **Discovery** | `list_workspaces`, `list_workspace_assets`, `search_assets` |

Notes: requires **Concierge enabled** or the Q&A tools are absent · needs **Node.js** locally
for the client connect step · "Unavailable for you at the moment" = a **permissions** problem,
not an outage · Agentforce-native is reportedly **10–20× faster** than desktop MCP clients.

### 4.8 Archive Connect — routed *through* Headless 360 ⚠️ structural

Archive Connect has **no server of its own**. Its **13 tools** are reached via the
**headless-360** URL and found at runtime via `discover`. New namespace in the docs
(`archive/archive-connect`) that is **not** separately activatable.

**Prereqs:** API v67.0+ · **Archive license** · **Archive Admin** perm set (or granular) ·
ECA with `mcp_api` · OAuth client.

| # | Tool | Notes |
|---:|---|---|
| 1 | `run-archive-global-search` | 1–6 filters (AND), date ranges (`archive_date` special field), `pageSize` ≤1000 (default 25). `scroll_id == "-1"` ⇒ no more pages |
| 2 | `get-archive-global-search-next-page` | paginate via `scrollId` |
| 3 | `run-archive-global-search-with-sharing-rules` | Agentforce-optimised; **enforces sharing rules**; rich-text summary + HTML-entity-encoded JSON |
| 4 | `get-organization-archive-storage-used` | `usedStorage[4]`/`availableStorage[4]` — indices 0/1 general, 2/3 archive tier. **Per-index; never sum** |
| 5 | `run-analyzer` | idempotent, non-destructive write. `isRunning` is always `null` — read `message` |
| 6 | `get-analyzer-report` | `topRecords`/`topFiles`, storage stats, date as `DD/MM/YYYY HH:MM:SS` |
| 7 | `run-unarchive` | ⚠️ restores the **entire hierarchy**. ≤1000 records/request, **≤50 requests/hour/org** |
| 8 | `run-rtbf` | 🔴 **irreversible.** ≤10 criteria (one per object), exact matches only, root records only |
| 9 | `get-rtbf-status` | poll by `requestId` UUID |
| 10 | `run-masking` | 🔴 **irreversible.** PII auto-detected (cannot choose fields), one-time per record, cascades to children, legal-hold/retention-lock excluded, needs org entitlement |
| 11 | `get-masking-status` | `"HANDLED"` = complete |
| 12 | `get-archive-execution-details-streaming-url` | presigned log URL; `null` = none resolved |
| 13 | `get-archive-failed-records-streaming-url` | presigned failed-records URL |

**Limits:** unarchive 50/hr/org (≤1000 records each) · RTBF **+** masking share a combined
**10,000 root records/org/day** · 6 search filters max · 10 RTBF/masking criteria max.

> 🔴 **`run-rtbf` and `run-masking` are permanently destructive.** Salesforce's own guidance:
> configure the MCP client to require explicit approval before either runs. Any skill
> touching these must gate them behind human confirmation — no exceptions.

> ⚠️ **Error-handling gotcha:** `run-archive-global-search-with-sharing-rules` returns
> **HTTP 201 with `isSuccess: false`** on validation failure. **Check `isSuccess`, not the
> HTTP status.** Assume other Archive tools may behave the same way.

**Design implication:** a doc page is *not* necessarily an activatable server. Some capability
sets are fronted by another server. Never map doc page ⇒ `McpServerAccess` row.

### 4.9 ✅ Runtime-verified tool inventory `[org]`

All 10 activated servers were driven live over MCP (`initialize` →
`notifications/initialized` → `tools/list` → `prompts/list`) using **one ECA token**.
A single `mcp_api` token reaches **every** server — the token is scoped to the ECA, not per-server.

| Server | tools (live) | prompts | UI said | match |
|---|---:|---:|---|---|
| `platform/sobject-all` | 11 | 2 | 11/2 | ✅ |
| `platform/sobject-reads` | 6 | 0 | 6/0 | ✅ |
| `platform/sobject-mutations` | 9 | 0 | 9/0 | ✅ |
| `platform/sobject-deletes` | 8 | 0 | 8/0 | ✅ |
| `platform/agentforce-grid` | 51 | 0 | 51/0 | ✅ |
| **`platform/headless-360`** | **4** | 0 | 5/0 | ❌ |
| `platform/salesforce-api-context` | 6 | 0 | 6/0 | ✅ |
| `platform/metadata-experts` | 1 | 0 | 1/0 | ✅ |
| `industries/engagement-interaction` | 3 | 0 | 3/0 | ✅ |
| `data/data-cloud-queries` | 2 | 0 | 2/0 | ✅ |

> ✅ **`headless-360` really does have 5 tools — the Setup UI was correct, an earlier probe was
> wrong.** A probe that declared no MCP client capabilities in `initialize` saw only 4
> (`discover`, `describe`, `dispatch`, `dispatch_readonly`) — the 5th, **`display_widget`**, is
> **conditionally withheld from `tools/list`** for any client that doesn't negotiate **MCP Apps UI
> extension** support. This is a capability-negotiation gate, a different mechanism from
> `headless-360`'s own separate Beta status — both facts are true, don't conflate them.
> `display_widget` renders a Salesforce widget via the native renderer (two modes: `dynamic` —
> author a `widgetDefinition` renderer envelope directly; `salesforce_widget` — name a
> pre-registered widget by `widget_resource_uri` + `props`, resolved via the Lightning Types
> Connect API) and only functions in a host that negotiates MCP Apps UI support — in a client that
> doesn't, per the tool's own description, "the widget will not render."

**Verified tool names:**

| Server | Tools |
|---|---|
| `sobject-all` | `getObjectSchema, soqlQuery, find, getUserInfo, listRecentSobjectRecords, getRelatedRecords, createSobjectRecord, updateSobjectRecord, updateRelatedRecord, deleteSobjectRecord, deleteRelatedRecord` |
| `sobject-reads` | the 6 read tools only (`getObjectSchema, soqlQuery, find, getUserInfo, listRecentSobjectRecords, getRelatedRecords`) |
| `sobject-mutations` | the 6 reads **+** `createSobjectRecord, updateSobjectRecord, updateRelatedRecord` |
| `sobject-deletes` | the 6 reads **+** `deleteSobjectRecord, deleteRelatedRecord` |
| `headless-360` | `discover, describe, dispatch, dispatch_readonly, display_widget` (5th tool needs MCP Apps UI capability negotiation to appear — see above) |
| `salesforce-api-context` | `get_data_and_tooling_api_context, get_metadata_type_sections, get_metadata_type_context, get_metadata_type_fields, get_metadata_type_fields_properties, search_metadata_types` — full apiName↔runtime-name↔description mapping in §4.9b |
| **`metadata-experts`** | **`execute_metadata_action`** (single tool) |
| `engagement-interaction` | `fetch_engagement_interaction, create_engagement_interaction, delete_engagement_interaction` |
| `data-cloud-queries` | `post_dc_query_sql, get_dc_metadata` |
| `agentforce-grid` | 51 `grid_*` tools — workbook/worksheet/column CRUD, `grid_discover_*` (sobjects, fields, agents, prompt templates, dataspaces, invocable actions, formula funcs), `grid_generate_soql`, `grid_run_worksheet`, `grid_apply_grid` — full apiName↔runtime-name↔description mapping in §4.9b |

**Prompts on `sobject-all` (2), confirmed live:** `accountReviewBriefing`,
`revenueReconciliationAnalysis`. Note the runtime names **drop** the `einstein_gpt__` prefix
the docs show. Retrieved via `prompts/list` — a **separate primitive**, not in `tools/list`.
Only `sobject-all` advertises a `prompts` capability.

> 🔗 **Cross-skill dependency:** `metadata-experts`'s only tool is **`execute_metadata_action`**
> — the exact tool the **`automation-flow-generate`** skill is built on ("Generate Salesforce
> Flows using the MCP tool `execute_metadata_action`"). **That skill therefore requires the
> `platform.metadata-experts` server to be activated and an MCP client connected.** If flow
> generation fails with a missing-tool error, activation is the first thing to check.

The four servers with **no public doc page** (`agentforce-grid`, `salesforce-api-context`,
`metadata-experts`, `engagement-interaction`) are now inventoried above from runtime — tool
*names* are verified, but their parameter schemas and semantics remain unverified.

### 4.9b Full apiName ↔ runtime-name ↔ description mapping — Agentforce Grid (51) and salesforce-api-context (6)

**Why this matters for authoring, not just documentation:** a `psmcps:` identifier
(`psmcps:<ns>.<server>:<operation>`) requires the real **apiName**, never the runtime `tools/list`
name — already the hard rule in `tool-backing-specs.md` (`grid_list_workbooks` → `getAllWorkbooks`,
a different word, not a spelling variant). The documented procedure to get an apiName is a manual
Setup-add-then-retrieve round-trip, per tool. **The tables below eliminate that round-trip for all
57 tools they cover** — ready to hand-author directly into a `McpServerDefinition`.

**Also reuse the descriptions verbatim as `descriptionOverride`** if any of these tools are ever
wired onto a custom server — §7 of `setup-and-custom-servers.md` states description quality
decides tool selection; these are the platform's own, not a thinner rewrite.

**Agentforce Grid — read-only tools:**

- **`getAllWorkbooks`** (`grid_list_workbooks`) — List all Agentforce Grid workbooks the calling user can access. Returns: items[] with workbook id, name, owner, lastModifiedDate. Use when: the user asks to see their workbooks or wants to pick one to inspect.
- **`getWorkbook`** (`grid_get_workbook`) — Retrieve metadata for a single workbook by id. Returns: id, name, description, owner, created/lastModified timestamps, count of worksheets. Use when: the user references a specific workbook and you need its metadata before acting on its worksheets.
- **`getWorksheetsByWorkbookId`** (`grid_get_worksheets_by_workbook`) — List all worksheets in a workbook. Returns: items[] with worksheet id, name, type, timestamps. Use when: discovering worksheets before fetching data or running.
- **`getWorksheetById`** (`grid_get_worksheet`) — Retrieve metadata for a single worksheet by id. Returns: id, name, parent workbook id, columns[] (id, name, type, dependsOn[]), row count, lastRunStatus. Use when: understanding column structure before reading data or starting a run.
- **`getWorksheetData`** (`grid_get_worksheet_data`) — Retrieve rendered cell data (typed values, status per cell). Returns: rows[] with rowId, cells{columnId: {value, status, displayValue}}. Use when: the user wants to see actual results. Prefer `grid_get_worksheet_data_generic` for raw/untyped output.
- **`getWorksheetDataGeneric`** (`grid_get_worksheet_data_generic`) — Retrieve worksheet data in raw generic format, no type coercion, full cell metadata. Returns: rows[] with raw value, status, errors, processing timestamps. Use when: cell-level diagnostic detail needed (e.g. why a cell failed).
- **`getColumnData`** (`grid_get_column_data`) — Retrieve cell data for a single column across all rows. Returns: cells[] with rowId, value, status. Use when: only one column's results are needed (e.g. reading `AGENT_RESPONSE` after a test run).
- **`getRunWorksheetJob`** (`grid_get_run_worksheet_job`) — Poll status of a previously-started run. Returns: jobId, status (PENDING/RUNNING/COMPLETED/FAILED/CANCELLED), progress, startedAt, finishedAt, error if failed. **Do not poll faster than every 5 seconds — rapid polling does not advance the run.**
- **`getColumnTypes`** (`grid_get_column_types`) — List all column types in this org (TEXT, AI, AGENT, OBJECT, FORMULA, REFERENCE, INVOCABLE_ACTION, etc.). Returns: types[] with name, label, description, requiredConfig fields.
- **`getSObjectsList`** (`grid_discover_sobjects`) — List all queryable sObjects. Returns: sobjects[] with apiName, label, pluralLabel.
- **`getFieldInfoForObjectsDisplay`** (`grid_discover_fields_display`) — Resolve field metadata scoped to display-suitable fields, per sObject.
- **`getFieldInfoForObjectsFilter`** (`grid_discover_fields_filter`) — Resolve field metadata scoped to filterable fields, per sObject.
- **`getFieldInfoForObjectsRecordUpdate`** (`grid_discover_fields_record_update`) — Resolve field metadata scoped to update-writable fields, per sObject.
- **`getLLMModels`** (`grid_discover_llm_models`) — List LLM models available for AI columns. Returns: models[] with name, label, encodingType, maxContentLength.
- **`getAIWorkbenchSupportedTypes`** (`grid_discover_supported_types`) — List formula return types and column data types supported in worksheets.
- **`getAgents`** (`grid_discover_agents`) — List Agentforce agents available for AGENT columns. Returns: agents[] with id, name, label, description, draft flag.
- **`getAgentVariables`** (`grid_discover_agent_variables`) — List input variables a specific agent version expects. Returns: variables[] with name, type, required flag, description.
- **`getEvaluationTypes`** (`grid_discover_evaluation_types`) — List evaluation types for eval columns (e.g. exact-match, llm-judge).
- **`getDataspaces`** (`grid_discover_dataspaces`) — List Data Cloud dataspaces available in this org.
- **`getFormulaFunctions`** (`grid_discover_formula_functions`) — List formula functions available in worksheet formulas.
- **`getFormulaOperators`** (`grid_discover_formula_operators`) — List operators available in worksheet formulas.
- **`getAllInvocableActions`** (`grid_discover_invocable_actions`) — List invocable actions available for INVOCABLE_ACTION columns. Returns: actions[] with actionName, actionType, label, url, inputs.
- **`getPromptTemplateList`** (`grid_discover_prompt_templates`) — List prompt templates in this org. Returns: templates[] with id, name, developerName.
- **`loadPromptTemplate`** (`grid_discover_prompt_template_details`) — Load a specific template's full body + input variables. Returns: developerName, label, body, inputs[], outputs.
- **`getListViews`** (`grid_discover_list_views`) — List available list views (saved sObject queries).
- **`generateSOQL`** (`grid_generate_soql`) — Generate a SOQL query from a natural-language utterance + sObject context. Returns: soql query string, explanation, fields used.
- **`generateJsonPath`** (`grid_generate_json_path`) — Generate a JSON path expression for extracting a field from a column's JSON output. Returns: jsonPath string + extracted sample value.
- **`validateFormula`** (`grid_validate_formula`) — Validate a formula expression against a worksheet's column context (syntax, function/operator usage, field references). Read-only, does not save. Returns: isValid flag, errorMessage.
- **`generateIAInput`** (`grid_generate_ia_input`) — Generate a suggested input config for an INVOCABLE_ACTION column given the action's metadata + worksheet context. Returns: JSON-encoded config string.
- **`getDataModelObjects`** (`grid_discover_data_model_objects`) — Get data model objects (DMOs) for a specific Data Cloud dataspace.
- **`getDataModelObjectFields`** (`grid_discover_data_model_object_fields`) — Get fields for a specific DMO within a dataspace.

**Agentforce Grid — write/mutating tools:**

- **`createWorkbook`** (`grid_create_workbook`) — Create a new workbook. Returns: workbook id and name.
- **`deleteWorkbook`** (`grid_delete_workbook`) — 🔴 Destructive. Permanently delete a workbook and all its worksheets, cascading. Returns: 204.
- **`createWorksheet`** (`grid_create_worksheet`) — Create a new worksheet inside an existing workbook. Returns: worksheet id, name, parent workbookId, updateMode, columns, columnData.
- **`updateWorksheet`** (`grid_update_worksheet`) — Update worksheet metadata (rename, description). Does not modify columns or cells.
- **`deleteWorksheet`** (`grid_delete_worksheet`) — 🔴 Destructive. Permanently delete a worksheet and all rows/columns/cells, including run results. Returns: 204.
- **`addRowsRelative`** (`grid_add_rows`) — Add one or more rows, optionally relative to an existing row. Returns: rowIds[], rowsAdded count, success flag.
- **`deleteRows`** (`grid_delete_rows`) — 🔴 Destructive. Delete specific rows by rowId. Returns: 204. Use `deleteWorksheet` to clear a whole sheet instead.
- **`createColumnsFromCSV`** (`grid_import_csv`) — Bulk-load a CSV into a worksheet — one column per header, one row per data line. Returns: 204. For row-only growth on existing schema use `addRowsRelative` instead.
- **`runWorksheet`** (`grid_run_worksheet`) — Start an async run of a worksheet (processes all rows through their column DAG). Returns: jobId — poll via `getRunWorksheetJob` at ≥5s intervals.
- **`generateTestColumns`** (`grid_generate_test_columns`) — Generate an AI-driven agent-test workbook (new workbook + worksheet + suggested test columns) for a given agent. One-shot bootstrap; use `addColumnToWorksheet` for incremental adds.
- **`addColumnToWorksheet`** (`grid_add_column`) — Add a new column with a typed config (TEXT/AI/AGENT/FORMULA/OBJECT/REFERENCE/INVOCABLE_ACTION/etc). Use `getColumnTypes` first if unsure of type.
- **`editColumn`** (`grid_edit_column`) — Partial update to a column's config (e.g. rename, tweak prompt). Does not require resending full config. For a type change use `saveColumn`.
- **`saveColumn`** (`grid_save_column`) — Full column config replacement (PUT-style). Required when changing column type or restructuring config.
- **`deleteColumn`** (`grid_delete_column`) — 🔴 Destructive. Permanently delete a column and its cell data. Downstream dependent columns error until re-wired.
- **`reprocessColumnData`** (`grid_reprocess_column`) — Re-execute a column's cells (e.g. after editing an AI prompt or fixing a stale formula), without running the whole worksheet.
- **`createColumnFromUtterance`** (`grid_create_column_from_utterance`) — Generate + add a column from a natural-language utterance (LLM-driven). Currently SObject/SOQL columns only; other utterances error.
- **`paste`** (`grid_paste`) — Paste a tabular (CSV-like) payload into a worksheet at a position. Less structured than `createColumnsFromCSV` — for small batches into an existing worksheet.
- **`updateCells`** (`grid_update_cells`) — Update one or more individual cells by cellId + new value. For full-column/worksheet updates use `saveColumn`/`runWorksheet`.
- **`triggerRowExecution`** (`grid_trigger_row_execution`) — Re-execute the column DAG for a specific subset of rows. Fire-and-forget, **no jobId** — re-fetch via `getWorksheetData` to observe progress. Targeted alternative to `runWorksheet`.
- **`applyGrid`** (`grid_apply_grid`) — Apply a complete grid spec (workbook + worksheet + columns + references) from one YAML string, one-shot. **🔴 Skeleton only, returns 501 NotImplemented — do not invoke.**

**`salesforce-api-context` — all 6 tools, complete:**

- **`getContextToolingAndDataObject`** (`get_data_and_tooling_api_context`) — Provides contextual information about Salesforce tooling objects to help generate accurate Salesforce tooling object files. Gives complete field definitions, valid values, constraints, and examples for tooling objects. Useful for creating valid Salesforce tooling object files programmatically, or to ensure accuracy.
- **`getMetadataTypeSections`** (`get_metadata_type_sections`) — Returns the list of available section keys for a given metadata type. Use this to discover which sections can be requested from `getMetadataTypeContext`.
- **`getMetadataTypeContext`** (`get_metadata_type_context`) — Returns concatenated contextual information for a given metadata type and a set of requested sections (comma-separated). Use `getMetadataTypeSections` first to discover valid section keys.
- **`getMetadataTypeFields`** (`get_metadata_type_fields`) — Returns the list of fields for a metadata type along with the available field property columns.
- **`getMetadataTypeFieldsProperties`** (`get_metadata_type_fields_properties`) — Returns values for multiple requested properties across multiple fields for a metadata type.
- **`searchMetadataTypes`** (`search_metadata_types`) — Searches metadata types by substring. Returns a JSON array of matching type names.

No R/D/I/O annotation badges on `salesforce-api-context`'s tools (consistent with the live harvest —
no `annotations` object on any of its 6 tools).

> ⚠️ **`applyGrid` — do not wire up as callable.** Own description: *"STATUS: Skeleton only —
> currently returns 501 NotImplemented. Do NOT invoke from production; wait for Phase C Chunk 1b
> orchestration impl."*

> ⚠️ **A fourth, stale naming layer exists in SObject-family tool descriptions** — backticked
> snake_case names that are neither the apiName nor the runtime name (e.g. `describe_sobject`
> inside `createSobjectRecord`'s description, `soql_query` inside `find`'s, `delete_sobject_record`
> inside `deleteRelatedRecord`'s). These are prose references only, never callable identifiers —
> don't try to call them.

> ⚠️ **Setup only shows 2 of the 4 annotation checkboxes for standard-server tools — a real gap for
> `add-tool psmcps` specifically.** The captures above show `Read-only`/`Destructive` per tool, but
> **no `Idempotent` or `Open World` indicator appears anywhere in the Setup UI** for these tools.
> `mcpserverdef-toolkit.mjs` requires all four flags explicitly on every `add-tool` call — for a
> `psmcps:`-adopted standard tool there's no documented source for `idempotent`/`openWorld` at all.
> **Infer them from the tool's own behavior**, same judgment §2a already teaches for custom tools
> (e.g. `deleteWorkbook` — destructive, but idempotent since deleting an already-deleted workbook
> ends the same way; `createWorkbook` — not idempotent, calling twice makes two workbooks).

> **Not captured anywhere:** the Label/Display Name — the third thing Setup shows alongside apiName
> and runtime name. Only the apiName↔runtime-name pair is captured above. Worth checking whether a
> live `tools/list` response carries a `title` field distinct from `name` (the MCP spec supports
> this) before assuming another Setup UI capture is needed.

### 4.10 Namespaces seen so far

`platform` · `industries` · `data` · `archive` · `analytics`

Only `platform.*` should be assumed present. Everything else is license-gated — probe, don't assume.

---

## 5. Relevance to Revenue Cloud / Industry Cloud

`industries.*` and `data.*` are the hook for RC/Industry work: `industries.engagement-interaction`
and `data.data-cloud-queries` exist in this Revenue Cloud org and would likely be **absent from a
plain Developer org**. When advising on an RC or Industry Cloud org, **probe for those namespaces
rather than assuming the platform-only set.**

For Commerce/Order operations, `headless-360`'s `discover` accepts a `domain` filter with values
like `commerce` — reaching Order operations without activating a dedicated server. Its documented
coverage already includes **Commerce Cloud Orders**, which is the closest thing to an RC-adjacent
capability in the standard set.

**No Revenue Cloud-specific hosted MCP server exists** in the observed catalog. RC-specific
capability reaches agents either through `sobject-*` (RC objects are standard/custom sObjects),
through `headless-360` discovery, or via a **custom** MCP server wrapping RC Apex invocables
(§6 of SKILL.md).

### 5.1 API Catalog also lists native `Source: Connect` capability groups — mostly not MCP-reachable

Beyond the activatable standard MCP servers, Setup → API Catalog lists native, platform-authored
`Source: Connect` capability groups (customers cannot create their own — *"Connect APIs are
authored by Salesforce"*). These are **not themselves MCP servers**. Checked directly against the
real `tools/list` output of all activated standard servers (§4.9): of 19 such groups observed in one
org, **only one had a confirmed matching tool** — `Platform Metadata Experts` (1 op) →
`platform.metadata-experts` → `execute_metadata_action` (name/count match only — the two are
structurally separate catalog entries, not proven to be the same object at the metadata level). The
other 18 (including `Industries Revenue`, 12 ops, "the entire domain of managing product information
and catalogs" — squarely Revenue Cloud territory despite no dedicated RC server existing) had no
matching tool on any activated server. Treat these groups as an indicator of licensed Connect-API
surface, not as MCP-reachable capability, unless independently confirmed per group.

### 5.2 `headless-360`'s SOR corpus — a documented discovery technique, not a universal reach

`headless-360`'s `discover`/`describe` (§4.3) can surface real endpoint detail for many platform
capabilities beyond its own 5 tools — e.g. the full `shared-api-catalog-connect-api` (17 endpoints,
`/services/data/v67.0/api-catalog/...`) and `externalservices-connect-api` (21 endpoints,
`/services/data/v67.0/external-connectivity/...` and `/externalservices/...`) Setup Operation Recipes
were both found this way. **But `discover`/`describe` knowing about an operation doesn't mean
`dispatch`/`dispatch_readonly` can reach it** — confirmed `[org]`: the `ExternalServices` SOR
documents `get-actions`/`set-active-service-operations` (the real mechanism behind ESR operation
activation — see `external-service-registration.md` §3), but calling either through `headless-360`'s
`dispatch` returns `ROUTE_NOT_FOUND` — outside its routable domain. A direct authenticated REST call
to the same Aura-controller path also fails (`404 URL No Longer Exists`) — these are real Aura
framework actions requiring a full Aura protocol envelope and browser session, not plain REST, and
neither MCP dispatch nor a bearer-token call can reach them. **Use the SOR corpus for discovery and
endpoint documentation; verify separately whether `dispatch` can actually execute what it finds.**
