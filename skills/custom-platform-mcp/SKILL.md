---
name: custom-platform-mcp
description: "Administer MCP servers inside a Salesforce org — list standard MCP servers and their activation state, activate/deactivate them, register custom and external MCP servers, and pick the right MCP surface for a task. TRIGGER when the user says 'MCP server', 'activate MCP', 'standard MCP', 'headless-360', 'sobject-all', 'MCP servers in the org', asks which MCP tools an agent can reach, or asks to turn an org MCP server on/off. DO NOT TRIGGER for the local Salesforce DX MCP Server (@salesforce/mcp dev tooling), for rendering an Apex-invocable MCP tool's output (use platform-mcp-tool-widget-coordinate), or for agent/subagent authoring (use agentforce-generate)."
license: Proprietary
metadata:
  author: Manigandan Dhamodaran <Manigandan.dhamodaran@outlook.com>
  version: 1.4.2
  source: Salesforce Hosted MCP Servers documentation (Overview, Guides, Best Practices, Standard Servers reference) at API v67.0; org-verified against a live Revenue Cloud org — server activation via McpServerAccess, External Client App creation by Metadata API, full OAuth authorization-code + PKCE flow, and live tool invocation across all standard servers. Custom MCP server authoring is now org-verified end to end — server definition deployed, activated, and invoked over MCP with Apex-backed and Flow-backed tools. `Custom`-type ExternalServiceRegistration (genuine external API/integration via a Named Credential) is now org-verified end to end too — real callout, real Apex naming rules, wired and deployed as an `aa:` MCP tool. JWT Bearer Flow self-callout auth (an `aa:` tool authenticating its own outbound callout as the calling user, since UserInfo.getSessionId() does not work inside an MCP tools/call context) is now org-verified end to end too — five-file ECA, certificate-retrieval gotcha, scope/pre-authorization requirements, real access token confirmed via raw curl, compiled Apex, and a genuine MCP tools/call round-trip (`references/eca-and-testing.md` §5).
  relatedSkills:
    - "custom-prompt-template"
    - "agentforce-generate"
    - "platform-mcp-tool-widget-coordinate"
    - "integration-connectivity-connected-app-configure"
    - "automation-flow-generate"
---
<!-- Copyright (c) 2026 Manigandan Dhamodaran <Manigandan.dhamodaran@outlook.com>. All rights reserved. This skill and its contents are the intellectual property of the author. -->

# Administering MCP Servers in a Salesforce Org

Turn standard MCP servers on and off, register custom and external ones, and route
to the right surface. **Org is ground truth** — everything below was verified by
live API calls, not documentation.

---

## 0. Router — four things are called "Salesforce MCP"

Disambiguate **before** acting. Getting this wrong is the single most common failure.

| Surface | Direction | Owner |
|---|---|---|
| **Org MCP servers** (standard / custom) | org **hosts** tools for agents | **this skill** |
| External MCP servers in the API Catalog | org **consumes** a third-party server | `agentforce-generate` → `references/mcp-management-reference.md` |
| Rendering an Apex-invocable MCP tool's output | UI concern | `platform-mcp-tool-widget-coordinate` (needs API **68.0**) |
| Salesforce DX MCP Server (`@salesforce/mcp`) | local dev tooling, agent → org | **not an org feature.** Say so and stop. |
| "expose any internal API as an `aa:` tool, not a fixed one" | agent → org, generic endpoint | `assets/mcp-server/classes/InvokeSalesforceApiAction.cls` — a generic invocable, `references/tool-backing-specs.md`'s hard rule right above §1a (`global`, not `public` — violating this silently breaks tool registration) |

The DX MCP Server is *not* a second window into the org — it wraps the same
Data/Tooling/Metadata APIs and cannot see anything `sf` cannot.

### ⚠️ "Headless" (the architecture layer) ≠ `headless-360` (the specific server)

A second disambiguation, easy to conflate with the one above. Salesforce's own platform-level
**"System of X"** model (`salesforce.com/headless`, doc'd in this project's own
`.claude/architecture/ANY/architecture.md` §A.1) names a whole layer **"Headless Access Plane"** —
MCP + plain REST/Connect APIs + the Experience Layer + Identity/Auth/Governance, all of it. That
layer is how *any* external system (Agentforce, a third-party LLM, Slack, a custom MCP client)
reaches Salesforce as a UI-decoupled backend.

**`headless-360` is one specific standard MCP server** (`platform/headless-360`, §4.3 of
`standard-servers.md`) that happens to be named after that pattern — its 4 tools
(`discover`/`describe`/`dispatch`/`dispatch_readonly`) are one *instance* of headless access, not
the architectural concept itself. An agent reaching Revenue Cloud through `psmcps:`/`ct:` tools on
a custom server, a direct standard-server connection, or plain REST is *also* "headless" in the
platform-architecture sense — it doesn't have to go through `headless-360` specifically. Don't use
"headless" and "`headless-360`" interchangeably in a conversation; ask which one is meant if it's
ambiguous.

---

## 0b. Task router — answer the question that was asked

> **Do NOT walk the runbook unless the user asked for end-to-end setup.** Most requests are a
> single task. Jump straight to the entry point, do that one thing, and stop.

| The user asks… | Go to | Runbook needed? |
|---|---|---|
| "turn on / activate `<server>`" | **§3** below — one POST or PATCH | ❌ no |
| "turn off / deactivate `<server>`" | **§3.4** — one PATCH | ❌ no |
| "what servers are available / what's active?" | **§3.1** query, reconciled against [`standard-servers.md §4`](references/standard-servers.md) | ❌ no |
| "what tools does `<server>` have?" | [`standard-servers.md §4.9`](references/standard-servers.md) — runtime-verified inventory | ❌ no |
| "which server should I use?" | **§5** CRUD ladder + [`standard-servers.md §4.2`](references/standard-servers.md) | ❌ no |
| "create an External Client App" | [`eca-and-testing.md §0–1`](references/eca-and-testing.md) — metadata specs | ❌ no |
| "what policies does an ECA get?" | [`eca-and-testing.md §1.5`](references/eca-and-testing.md) | ❌ no |
| "is my ECA configured right?" | [`eca-and-testing.md §1.7`](references/eca-and-testing.md) — curl the authorize URL, no browser | ❌ no |
| "connect Claude / ChatGPT / Cursor / Postman" | [`runbook Phase 6`](references/runbook-connect-client.md) + client matrix | phase only |
| "test / verify the connection" | [`eca-and-testing.md §2`](references/eca-and-testing.md) — handshake + smoke sequence | phase only |
| "it's broken / 401 / 400 / no tools" | [`runbook Phase 8`](references/runbook-connect-client.md) — real-error table | phase only |
| "how do I secure this / who can connect?" | [`eca-and-testing.md §1.5`](references/eca-and-testing.md) policies + [`setup-and-custom-servers.md §4`](references/setup-and-custom-servers.md) | ❌ no |
| "promote this to SIT/QA/PROD" | **§4.1 warning** + [`runbook`](references/runbook-connect-client.md) promotion section | ❌ no |
| "build a custom MCP server" | [`tool-backing-specs.md`](references/tool-backing-specs.md) + [`assets/mcp-server/`](assets/mcp-server/) — **org-verified**. Run the discovery gate (§7c) first | ❌ no |
| "give me a starting point / example" | [`assets/eca/`](assets/eca/) and [`assets/mcp-server/`](assets/mcp-server/) — deployable bundles | ❌ no |
| "set it all up" / "connect an agent from scratch" | ✅ [**the full runbook**](references/runbook-connect-client.md) | ✅ **yes** |
| "what even is Salesforce MCP?" | **§0** four-surface router | ❌ no |

**Rules for using this table**

1. **Match the narrowest entry.** "Activate sobject-reads" is one API call — don't turn it into
   an ECA discussion.
2. **Volunteer the blocking dependency, don't act on it.** If they activate a server in an org
   with no ECA, finish the activation, then note in one line that a client also needs an ECA
   (§7b of the runbook). Do not start building one uninvited.
3. **Escalate to the runbook only when the goal is genuinely end-to-end**, or when a
   single-task attempt fails for a reason earlier phases would have caught.
4. **State confidence honestly** — anything touching custom servers is 🚧 doc-derived, not
   verified.
5. **Testing is OPTIONAL — offer it, never impose it.** Verifying a live connection requires a
   human to complete a browser authorization (the one step that cannot be automated). Config
   work stands on its own: activation, ECA creation, hardening and promotion are all complete
   and verifiable **without** connecting a client. When the org-side work is done, say so, then
   **ask** whether they want to run the connection test — and if they decline, finish cleanly.
   Do not treat an untested connection as a failure or leave the task hanging on it.
   Use the browser-free check ([`eca-and-testing.md §1.7`](references/eca-and-testing.md)) to
   confirm configuration without involving anyone.

## 1. The data model `[org]`

Nine MCP entities exist at 67.0. Only two matter for administration:

| Entity | Role |
|---|---|
| **`McpServerAccess`** | **the activation record.** Holds `Active`. This is the whole state for standard servers. |
| `McpServerDefinition` | the **custom** server definition. Also a deployable metadata type (`mcpServerDefinitions/`). |
| `McpServerToolDefinition` / `PromptDefinition` / `ResourceDefinition` / `ToolApiDefinition` | assets of **custom** servers |
| `McpServerAccess.McpServerId` | `null` for standard; **required** for custom |
| `McpRegistrationHealth*`, `McpTaskProgressEvent` | health / progress telemetry |

`McpServerAccess` fields: `Id, IsDeleted, DeveloperName, Language, MasterLabel,
Active, McpServerId` + audit. Entity is `createable=true, updateable=true,
deletable=true`; `Active`, `DeveloperName`, `MasterLabel` are all writable.

### ⚠️ Inactive standard servers are invisible to every API

Verified across Metadata API, Tooling API, Data API, Connect/REST, and `sf agent mcp`:
an inactive standard server returns **nothing** until an `McpServerAccess` row exists.
Only the Setup UI lists them.

**Consequence:** this skill cannot discover standard servers at runtime. It ships a
**catalog** (§2) and reconciles it against `McpServerAccess` for live state — the same
pattern `custom-scratch-org-creation` uses for scratch-def templates.

---

## 2. Standard server catalog `[org]` `[doc]`

> **Full catalog — descriptions, per-server tool inventories, request schemas, security
> model, and the doc-vs-org differences — lives in
> [`references/standard-servers.md`](references/standard-servers.md).** Load it whenever
> the task involves choosing, describing, or activating a specific server.

**Universal prerequisites** (all hosted servers): **API v67.0+**, an **External Client App**
with the **`mcp_api`** scope, and an MCP client using **OAuth**. Verify these before
activating anything — activation without them yields a server nothing can connect to.

Observed in a Revenue Cloud org. **Availability varies by org.**

| UI label | API Name | `DeveloperName` | `MasterLabel` | Tools | Notes |
|---|---|---|---|---:|---|
| SObject All | `platform.sobject-all` | `platform_sobject_all` | `sobject-all` | 11 (+2 prompts) | ⚠️ includes **deletes** |
| SObject Mutations | `platform.sobject-mutations` | `platform_sobject_mutations` | `sobject-mutations` | 9 | create/update, no delete |
| SObject Reads | `platform.sobject-reads` | `platform_sobject_reads` | `sobject-reads` | 6 | read-only — safest |
| SObject Deletes | `platform.sobject-deletes` | `platform_sobject_deletes` | `sobject-deletes` | 8 | ⚠️ **deletes** |
| Agentforce Grid | `platform.agentforce-grid` | `platform_agentforce_grid` | `agentforce-grid` | 51 | large context cost |
| headless-360 | `platform.headless-360` | `platform_headless_360` | `headless-360` | 5 | ⚠️ **Beta Services terms** |
| salesforce-api-context | `platform.salesforce-api-context` | `platform_salesforce_api_context` | `salesforce-api-context` | 6 | |
| metadata-experts | `platform.metadata-experts` | `platform_metadata_experts` | `metadata-experts` | 1 | smallest blast radius |
| engagement-interaction | `industries.engagement-interaction` | `industries_engagement_interaction` | `engagement-interaction` | 3 | `industries` namespace |
| Data Cloud SQL | `data.data-cloud-queries` | `data_data_cloud_queries` | `data-cloud-queries` | 2 | `data` namespace |

**Naming rule:**
```
DeveloperName = <namespace>_<name with - replaced by _>
MasterLabel   = <name>          (hyphens preserved, namespace dropped)
Server URL    = https://api.salesforce.com/platform/mcp/v1/<env>/<namespace>/<name>
```

### Namespaces vary by org — skip what isn't there

`platform.*` will almost always exist. `industries.*`, `data.*` and any others depend
on which products the org has. **Do not fail the run when one is missing — skip it and
report which were skipped.** Never silently drop: always list what was skipped and why.

Detection is free, because the API validates (§3.3).

---

## 3. Activating a standard server

### 3.1 Read current state first — always

```bash
sf data query --query "SELECT Id, DeveloperName, MasterLabel, Active, McpServerId FROM McpServerAccess ORDER BY DeveloperName" --target-org <alias> --use-tooling-api --json
```

Rows exist only for servers that have been touched (via UI or API). No row = never
activated. Reconcile against the §2 catalog to render the full picture.

### 3.2 Activate — create the row

```bash
echo '{"DeveloperName":"platform_metadata_experts","MasterLabel":"metadata-experts","Active":true}' | sf api request rest "/services/data/v<VER>/tooling/sobjects/McpServerAccess" --method POST --body - -o <alias>
```

Success: `{"id":"1fz...","success":true}`.

If a row **already exists**, do not POST again — `PATCH` it (§3.4). Creating a duplicate
`DeveloperName` is not a supported state.

### 3.3 The validation behaviour — this is the skip signal

Posting an unknown `DeveloperName` fails:

```json
{ "message": "McpServerId is required for custom server access records",
  "errorCode": "FIELD_INTEGRITY_EXCEPTION" }
```

The platform reclassifies any unrecognised name as a **custom** server and demands
`McpServerId`. Two consequences:

1. A clean POST (no `McpServerId`) **proves** the name is a real standard server.
2. `FIELD_INTEGRITY_EXCEPTION` on a catalog entry = **not available in this org → skip it.**

Catch that error per server, continue the loop, and report skips at the end.

### 3.4 Deactivate / re-activate — PATCH the row

```bash
echo '{"Active":false}' | sf api request rest "/services/data/v<VER>/tooling/sobjects/McpServerAccess/<Id>" --method PATCH --body - -o <alias>
```

Deactivation **keeps the row** and flips `Active` to `false` — it does not delete.
Fully reversible in both directions.

### 3.4b Validation record `[org]`

The full create-or-update loop was run against all 10 catalog entries in a Revenue Cloud
scratch org: **10/10 active**, no failures.

- **Naming rule verified on 10/10**, including the non-`platform` namespaces
  (`industries_engagement_interaction`, `data_data_cloud_queries`) — previously derived, now proven.
- All three paths exercised: **POST** (new), **PATCH** (existing inactive), **skip** (already active — idempotent).
- `McpServerId` returned `null` on all ten → standard servers never populate it.

> **Not yet proven:** the `FIELD_INTEGRITY_EXCEPTION` **skip path** did not fire — every entry
> existed in that org. Its only evidence is a deliberate bogus-name test. Verify against an org
> lacking `industries.*`/`data.*` (e.g. a plain Developer org) before relying on it.

### 3.5 Verify

Re-query §3.1 and confirm `Active`. **Also ask the user to confirm in Setup → MCP
Servers**, because Connection Health is a UI-side signal not exposed by the API.

> ⚠️ **Activation is not audited — runtime use is.** An activate/deactivate cycle writes
> **nothing** to `SetupAuditTrail` (`[org]`-verified); the `McpServerAccess` audit fields
> (`CreatedById`/`LastModifiedDate`) are the only trail for the *config change*. MCP
> **traffic**, however, is fully auditable: filter API logs for
> **`APICLIENTCATEGORY = SALESFORCE_HOSTED_MCP`** (daily CSV or programmatic) for
> per-user operations, objects accessed, and access patterns.

> ⏱️ **Wait before declaring failure.** Enabling a server takes **up to 2 minutes**; a new
> External Client App takes **up to 30 minutes**. An immediate verification miss may just
> be early.

> 🔴 **Scratch orgs cannot create External Client Apps via the Setup UI.** The ECA must be
> built in a dev hub org, packaged, and installed. **Activating a server in a scratch org
> therefore does not make it connectable** — say this out loud before activating there.
> **Exception:** the **Vibes** client requires no ECA, so ask which client is in play before
> declaring a scratch org unusable.

**Reference files** — load the one that matches the task:

| File | Load when |
|---|---|
| [`runbook-connect-client.md`](references/runbook-connect-client.md) | **START HERE for any "connect a client / set this up" task** — 9 sequential phases, zero to a working agent, every command and every real error |
| [`standard-servers.md`](references/standard-servers.md) | choosing/describing a server; runtime-verified catalog + tool inventories |
| [`tool-backing-specs.md`](references/tool-backing-specs.md) | **building a custom MCP server** — identifier prefixes, `<tools>` elements, which backing to choose, invocation contract |
| [`external-service-registration.md`](references/external-service-registration.md) | authoring `ae:`/`ar:`/`nq:`/`Custom` backings (`ExternalServiceRegistration`/`ApiNamedQuery`) — full procedure, required org settings, runbooks, the `ae:` known issue, and (§6) wrapping a **genuinely external API/integration** via `Custom` + a Named Credential, reaching MCP through `aa:` |
| [`eca-and-testing.md`](references/eca-and-testing.md) | the **specs** for an MCP-purposed ECA — which scopes (`MCP, RefreshToken`), which policy values, PKCE required. **Mechanical ECA/OAuth authoring itself is `integration-connectivity-connected-app-configure`'s job, not this skill's** — hand the authoring to that skill, but source the actual field values from here |
| [`setup-and-custom-servers.md`](references/setup-and-custom-servers.md) | permission model (standard-server automatic enforcement vs. custom Apex/Flow opt-in — §4), custom servers, UIBundle deep-link destinations, tool-design guidance |
| [`clients-and-troubleshooting.md`](references/clients-and-troubleshooting.md) | URL grammar, troubleshooting trees, support escalation |

> 🔴 **Activation does not promote between orgs.** `McpServerAccess` is a **runtime record**,
> not metadata — deploying the ECA to the next environment carries **none** of the server
> activation. Every org needs its own activation step, or clients fail to connect with
> perfectly valid credentials. See [`eca-and-testing.md §4.1`](references/eca-and-testing.md).

---

## 4. Interaction pattern — how to ask the user

**Default: list, then confirm.** Never prompt for a bare API name with no list — the
org cannot help the user discover it (§1).

1. Read `McpServerAccess` (§3.1), reconcile against the catalog (§2).
2. Render **every** server with: label, API name, tool count, prompt count, current state.
3. Mark the risk tier (§5) inline.
4. Ask which to activate/deactivate. Accept multiple.
5. Echo the exact list back and get a yes before writing.

**Fast path:** if the user already named a server ("activate headless-360"), resolve it
from the catalog and skip straight to step 5. Still show the tool count and risk tier.

**Never** activate the full catalog on a bare "activate MCP servers" — that hands an
agent record-delete capability. Force an explicit choice.

---

## 5. Safety — the CRUD slicing is the point

The SObject family is deliberately sliced so you can grant least privilege by
**server selection**:

| Server | Grants | Use when |
|---|---|---|
| `sobject-reads` | read/search only | default for most agents |
| `sobject-mutations` | create/update | agent must write, never delete |
| `sobject-deletes` | delete | rarely — deletion is the ask |
| `sobject-all` | all of the above | you genuinely want full CRUD |

Activating `sobject-all` when `sobject-reads` would do is the most likely real-world
mistake this skill exists to prevent. **Say the tool count and the delete capability out
loud before activating.**

Tools run under the **running user's permissions** — MCP composes with the org's
permission model, it does not bypass it. So an over-broad MCP grant is still bounded by
profile/permission sets, but the agent surface is wider than it needs to be.

`agentforce-grid` (51 tools) consumes substantial agent context; `headless-360` deliberately
inverts this with 5 meta-tools (Discover / Describe / Dispatch / Dispatch Read Only)
fronting a growing operation library — prefer it when breadth is needed cheaply, subject
to its **Beta Services terms**.

---

## 6. Custom MCP servers — the "plate"

> **Full detail: [`references/setup-and-custom-servers.md`](references/setup-and-custom-servers.md)**
> — External Client App procedure, security model, custom-tool backing types, tool-design
> guidance, and beta→GA migration.

**Standard servers are immutable.** A custom server is the only way to add your own tools —
and the only way to **combine tools from several standard servers under one URL**. Configured
at Setup → **Integration → Salesforce MCP Servers** (note: a *different* path from standard
server activation, which lives under **API Catalog**).

Backing types for custom tools: **Autolaunched Flow · Apex `@InvocableMethod` ·
Apex `@AuraEnabled` · Apex `@RestResource` · API Catalog endpoint · Agentforce agent
(new Agent Script Builder only) · Prompt Builder template**.

Storage: an `McpServerDefinition` record, whose access row **requires** `McpServerId`
(§3.3) — which is exactly why a bogus standard name fails with
`"McpServerId is required for custom server access records"`. `McpServerDefinition` is a
**deployable metadata type** (`mcpServerDefinitions/`), so custom servers are
source-controllable and promotable between sandboxes and production.

> **Curation is a hard constraint, not a style preference:** *"Beyond a few dozen tools, an
> AI client struggles to select the right one."* That is the quantitative argument for
> least-privilege activation — and it reframes `agentforce-grid` (51 tools), which may exceed
> a client's practical budget on its own.

---

## 7. External MCP servers

Registered in the **API Catalog** via `sf agent mcp` (developer preview), `type: EXTERNAL`,
requiring a reachable HTTPS `--server-url`. **Delegate to
`agentforce-generate` → `references/mcp-management-reference.md`** — do not duplicate it.

Key distinction: external servers require remote HTTP transport, so a local **stdio**
MCP server cannot be registered this way.

---

## 7b. Custom MCP servers — `[org]` verified

Full specs: [`tool-backing-specs.md`](references/tool-backing-specs.md) ·
deployable example: [`assets/mcp-server/`](assets/mcp-server/)

A custom server is **one nested metadata file** — `McpServerDefinition` with `<tools>` and
`<prompts>` inside. It is **not** three records; `McpServerToolDefinition` /
`McpServerToolApiDefinition` are the runtime projection of that file.

```
1. build the backing        Apex `global @InvocableMethod`  or  Autolaunched Flow
2. verify it registered     GET /actions/custom/apex   |   /actions/custom/flow
3. deploy McpServerDefinition
4. ACTIVATE                 POST McpServerAccess {..., Active:true, McpServerId:"<defId>"}
5. call it                  .../mcp/v1/sandbox/custom/<NAME>
```

**Deploying does NOT activate** — and a custom server's access row **requires `McpServerId`**,
which is why an unknown standard name errors `McpServerId is required for custom server access
records`.

**Identifier rule:** *known* forms (`aa:apex-<Class>`, `fa:flow-<Flow>`) — hand-write from the
spec table. *Unknown* backing type — **add it once in Setup, retrieve, copy the generated value**,
then record the new row. A wrong prefix fails **silently**: `Valid operations for this identifier
are []`.

**A custom server may re-serve standard tools** alongside your own (`psmcps:` / `ct:` / `pr:`) —
one connector instead of several.

**`@AuraEnabled` (`ae:`) and Apex REST (`ar:`) — now `[org]`-confirmed selectable**, via
`ExternalServiceRegistration`, not the invocable-action registries this section originally
checked. Full authoring procedure, the required org-level Beta settings, and a known open issue
(`ae:` is selectable but live invocation currently fails — see below) are in
[`external-service-registration.md`](references/external-service-registration.md). The
`global @InvocableMethod` path (`aa:`) remains the simplest, most reliable Apex backing when the
choice is open. **`apiSource` probed via `--dry-run`** (see `tool-backing-specs.md` §1e):
`CLASSIC` resolves to `CLASSIC_REST`; `AGENT` is flatly rejected at v67.0
(`Unsupported API source: AGENT`) — do not author it; `CONNECT` rejects every identifier tried so
far.

> ⚠️ **`ae:` identifier is real, but live invocation is currently broken** — confirmed across many
> structural variants, not fixable by anything in the Apex/metadata/settings layer available to a
> skill author. See [`external-service-registration.md` §4](references/external-service-registration.md#4--ae-identifier-confirmed-but-live-invocation-is-currently-broken-org)
> before committing to this backing for a new build; prefer `ar:` for equivalent functionality.

**Wrapping a genuinely external API/integration (not a same-org Apex class) — `[org]`-confirmed
end-to-end.** `registrationProviderType: Custom` + a Named Credential is the correct backing for a
real third-party REST API. It does **not** get its own `apiIdentifier` prefix and is not itself
`@InvocableMethod`-annotated — reach MCP by wrapping the platform-generated `ExternalService.*` Apex
class in an ordinary `global @InvocableMethod`, then wire it as a standard `aa:` tool. Full authoring
procedure, the real (non-obvious) Apex naming rules, and a deployable worked example:
[`external-service-registration.md` §6](references/external-service-registration.md#6-custom-type--genuine-external-apiintegration-org).

## 7c. 🔴 Discovery gate — run BEFORE building anything

Building is the last step, not the first.

**1 · Does a tool already exist?** Search the activated servers before writing code. The single
highest-value check is **`headless-360` → `discover`** — semantic search over a growing library of
Salesforce operations. Standard `sobject-*` already covers CRUD, SOQL/SOSL, schema and
relationship traversal.
*Only build custom for:* multi-step logic · a transactional guarantee · computed insight ·
org-specific process · a deliberately narrower tool surface. **Record why standard was insufficient.**

**2 · Study an existing definition.** Retrieve a real `McpServerDefinition` before authoring one —
it is the schema of record for element order and identifier shapes.

**3 · Inventory the org.** Existing definitions · existing `McpServerAccess` rows and their
`Active` state · the action registries.
⚠️ **A same-named deploy OVERWRITES — `<tools>` is replaced wholesale**, so a one-tool file
silently drops a tool from a two-tool server.

## 7d. Wiring a tool to an HXL widget `[org]` verified

**MCP-definition wiring only** — this skill doesn't author widgets. Full metadata-type breakdown
and doc links: [`hxl-ui-resource-wiring.md`](references/hxl-ui-resource-wiring.md).

A tool with an already-built companion widget needs a `<uiResource>` tag inside its `<tools>` entry
plus a **sibling** `<resources>` block whose `resourceUri` points at the **envelope**
`LightningTypeBundle` (not the widget bundle): `ui://widget/lightningType/c__<EnvelopeCLTName>`.
`mcpserverdef-toolkit.mjs add-tool` supports this via optional `--ui-resource-name <Name>
--ui-envelope-clt <BundleName>` — verifies the envelope CLT exists locally before wiring a dead
reference. Deploy the `McpServerDefinition` change together with any changed CLT/widget files in one
`sf project deploy start` call — cross-referencing `LightningTypeBundle`/`UiWidgetBundle` components
only resolve within the same transaction.

## 8. Known gaps — do not bluff these

1. **Server/tool discovery for inactive servers** — no API path found at 67.0. Catalog-driven only.
2. **Tool-level inspection** — the per-server tool lists (11, 9, 51 …) are UI-only; no API enumerated them.
3. **Connection Health** — UI-only signal; not in `McpServerAccess`.
4. **Custom server authoring** (§6) — inferred from schema, not exercised.
5. **Catalog freshness** — §2 is a point-in-time snapshot of one org. Re-verify per release.
6. **`[org]` Editing a custom server's `<tools>`/`<prompts>` list flips `McpServerAccess.Active`
   back to `false`** — observed twice independently (a script-driven `<tools>` deploy, and a
   Setup-UI-driven `<prompts>` addition), both against the same custom server. **Re-activate after
   every structural edit, not just the first deploy** — a re-query of §3.1 after any redeploy is
   not optional. Confirmed for `<tools>`/`<prompts>` additions specifically; not yet checked
   whether a no-op redeploy (same content) also resets it. **`[user]` Two practical consequences
   in real use, easy to forget:** (a) changing an existing tool isn't a safe in-place edit — remove
   the entry and add a corrected one back, rather than editing its fields in place; (b) every
   remove-and-re-add cycle re-triggers the same `Active` reset, so re-activation has to be repeated
   after **every** tool change, not just the first one — nothing in the deploy output warns you
   that the server just went inactive. Full detail:
   `custom-prompt-template`'s `references/using-prompt-templates.md` §4.
7. **`[org]` Windows-specific: `sf ... --query "<multi-word SOQL>"` silently word-splits before
   reaching the CLI** when run via Node's `execFileSync(cmd, args, { shell: true })` — every
   payload variant fails identically (`Unexpected arguments: ...`), including the simplest
   `SELECT X FROM Y` with no special characters, so it isn't a wildcard/comma-escaping issue.
   `mcpserverdef-toolkit.mjs`'s `sfQuery()` helper works around it by writing the SOQL to a temp
   file and using `sf data query --file <path>` instead of inline `--query` — reuse that helper
   (or the pattern) for any new SOQL call in this script rather than inline `--query` on Windows.
8. **`[org]` 🔴 A `Certificate` metadata component deployed with just a `.crt` file is NOT the
   certificate Salesforce signs with.** Salesforce silently auto-generates its own internal
   signing cert for that developer name; the externally-uploaded `.crt` and the cert actually used
   for JWT signature verification are two different certificates sharing a name. If an ECA's
   `certificate` field holds the originally-uploaded PEM, JWT Bearer fails with a misleading
   `invalid_client: invalid client credentials` — reads like a wrong-consumer-key problem, isn't.
   **Fix**: `sf project retrieve start --metadata "Certificate:<DeveloperName>"` and use THAT
   PEM in the ECA's `certificate` field, not the original. This one cost the most debugging time
   of anything in this skill — check it FIRST on any `invalid_client` from a JWT Bearer ECA, before
   re-checking consumer key, scopes, or pre-authorization. Full writeup: §5.4 of
   `references/eca-and-testing.md`.
