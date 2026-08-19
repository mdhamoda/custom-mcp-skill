# Setup, Security, and Custom MCP Servers

`[doc]` developer.salesforce.com → Platform → Hosted MCP Servers → Guides & Best Practices.
Companion to [`standard-servers.md`](standard-servers.md).

---

## 1. Scratch orgs and the ECA — the doc is narrower than it reads `[org]`

The doc says:

> *"You can't create External Client Apps directly in scratch orgs using the **Setup UI**.
> To test in a scratch org, create the External Client App in a developer hub org, add it
> to a package, and install the package in the target scratch org."*

> ✅ **Verified against a live org — the restriction is Setup-UI-only. Metadata API deploy works.**
> A three-file ECA source bundle deployed cleanly into a Revenue Cloud scratch org
> (`Succeeded 3/3`), the consumer key was retrievable immediately after, and the resulting
> ECA completed a full PKCE flow to a live hosted MCP server (§ below).

### ⚖️ Two valid routes — **ask the user, don't assume**

The packaging route is not obsolete. Both are legitimate and the choice is the user's:

| Route | Choose when |
|---|---|
| **Metadata API deploy** (direct to the target org) | one-off testing, a disposable scratch org, fastest path, ECA config lives in this repo |
| **Build in dev hub → package → install** | the same ECA must be **shared across many orgs**, promoted through an environment ladder, versioned as a release artifact, governed centrally, or the target org restricts metadata deploys |

**Always ask which the user wants** before building. Do not present the direct deploy as
"the" answer — it is the quicker one, not the universally correct one. For anything heading
toward SIT/QA/PROD, the packaged route is usually right.

### Minimum deployable ECA — three files

| Directory | Type | Suffix |
|---|---|---|
| `externalClientApps/` | `ExternalClientApplication` | `.eca-meta.xml` |
| `extlClntAppGlobalOauthSets/` | `ExtlClntAppGlobalOauthSettings` | `.ecaGlblOauth-meta.xml` |
| `extlClntAppOauthSettings/` | `ExtlClntAppOauthSettings` | `.ecaOauth-meta.xml` |

Deploy all three **together** — the global OAuth file fails alone with *"The external client
app configured in your global OAuth Settings doesn't have a valid OAuth settings
configuration."*

### 🔑 The scope value is `MCP` — not `mcp_api` `[org]`

`mcp_api` is the **OAuth scope string** used by clients. In **metadata**,
`commaSeparatedOauthScopes` takes **`MCP`**. Using `McpApi` fails, and the error helpfully
enumerates every valid value:

```
Basic, OfflineAccess, DataCloudUserClaims, Email, Address, CDPSegment, Chatbot,
CustomApplications, Full, Profile, CDP, CDPProfile, RefreshToken, Phone, PwdlessLogin,
Interaction, Pardot, CDPIngest, CDPIdentityResolution, CustomPermissions, ForgotPassword,
UserRegistration, OpenID, Chatter, Wave, SFApiPlatform, SCRT, Web, EinsteinGPT, Lightning,
Content, CDPCalculatedInsight, Eclair, Api, MCP, CDPQuery
```

For MCP use: **`MCP, RefreshToken`**. Verify after deploy via tooling —
`SELECT OauthScopesMCP_API, OauthScopesREFRESH_TOKEN FROM ExtlClntAppOauthSettings`.

### Two more deploy gotchas `[org]`

- **`isNamedUserJwtEnabled` defaults to `false`.** The setup guide tells you to select
  *"Issue JWT-based access tokens for named users"*, but the skill template omits the field
  and the platform default is off. **Set it explicitly.**
- **Consumer key is generated server-side.** Retrieve it after deploy:
  `sf project retrieve start --metadata ExtlClntAppGlobalOauthSettings:<Name> -o <alias>` —
  it comes back as `<consumerKey>` in the retrieved file. The round-trip also reveals fields
  the template omits (`isRefreshTokenRotationEnabled`, `isDPopEnabled`,
  `isTokenExchangeEnabled`, `isEnforceRefreshTokenTTL`, …).

### What an ECA still does *not* buy you `[org]`

Creating the ECA **does not** let a script or agent connect. Re-tested immediately after a
successful deploy: the hosted MCP endpoint still returns **401** to the `sf` CLI token,
because that token belongs to `PlatformCLI`, not the new ECA. Obtaining a token *from* the
ECA requires the interactive authorization-code + PKCE browser flow with a named human.
See [`clients-and-troubleshooting.md §2b`](clients-and-troubleshooting.md).

Also: **Connected Apps are not supported.** External Client App only.

---

## 2. Two different Setup paths ⚠️

| Task | Setup path |
|---|---|
| Activate/deactivate **standard** servers | Setup → Quick Find **MCP Servers** → *under **API Catalog*** |
| Configure **custom** servers | Setup → **Integration → Salesforce MCP Servers** |
| Create the ECA | Setup → Quick Find **external client** → **External Client App Manager** |

### Timing — build these waits into any verification step

| Action | Delay before it works |
|---|---|
| Enabling a server | **up to 2 minutes** |
| New External Client App | **up to 30 minutes** ("similar to registering a new domain with DNS") |

A verification that fails immediately after activation may simply be early. Do not report
failure without accounting for these.

---

## 3. External Client App — the procedure

1. Setup → **External Client App Manager** → **New External Client App**
2. Fill Basic Information
3. Expand **API (Enable OAuth Settings)** → check **Enable OAuth**
4. **Callback URL** — per client:

   | Client | Callback URL |
   |---|---|
   | **Claude** | `https://claude.ai/api/mcp/auth_callback` |
   | **Cursor** | `http://localhost:8787/callback` (older: `cursor://anysphere.cursor-mcp/oauth/callback` — add both if allowed) |
   | **Postman** | `https://oauth.pstmn.io/v1/callback` (web version: `.../v1/browser-callback`) |
   | **ChatGPT** | copy from ChatGPT Advanced settings |

5. **OAuth Scopes** — exactly two:
   - `mcp_api` — Access MCP servers
   - `refresh_token` — Perform requests at any time
6. **Security** — select **Issue JSON Web Token (JWT)-based access tokens for named users**;
   deselect everything else that doesn't require Salesforce support to change
7. **Create**, wait up to 30 min, then Settings → **Consumer Key and Secret** → store the key

### Production hardening (each independent)

| Control | Detail |
|---|---|
| **Require Secret for Web Server Flow** | Web clients only. **Avoid for desktop apps** — embedded secrets are recoverable by decompilation |
| **Permission-set pre-authorization** | OAuth Policies → require a custom perm set. Default is *any user in the org can authenticate* |
| **IP restrictions** | OAuth Policies → allowed ranges. ⚠️ Some MCP clients exceed Salesforce's allowlist capacity — verify with the vendor first |
| **Token lifecycle** | Refresh Token Validity **≤30 days** + enable **Refresh Token Rotation** (default is indefinite) |
| **Single Logout** | Session Settings → revoking the Salesforce session kills the MCP session. For departures/offboarding |

### Login prerequisite (multi-tenant gotcha)

The MCP spec doesn't support multitenant systems. Before authorizing:
**log out of all other Salesforce orgs**, log into *only* the target org in your default
browser, and leave that browser open — the client opens a new tab in it.

---

## 4. Permission model — standard servers vs. custom Apex/Flow tools `[doc]` `[org]`

**Lead distinction, stated up front because it is the single most consequential fact in this
file:** the "runs as the authenticated user, so the platform's permission model always applies"
guarantee is **automatic and verified for the standard, Salesforce-shipped hosted servers** — their
own backing enforces it, and it's true to say "if the user can't do it in Lightning, the agent
can't do it via MCP" for them. **It is NOT automatically true for a custom server's own
Apex/Flow-backed tools.** Nothing about being "an MCP tool" makes a Flow or an Apex method enforce
sharing/FLS on its own — enforcement there is **opt-in and entirely the tool author's
responsibility**, and the platform's *default* leans permissive, not restrictive. Framed plainly:
**custom servers and custom MCP tools must respect the same permission model too — they can't run
in system mode, only through user mode and permissions — but getting there requires the author to
actively opt in.**

### 4.1 Standard hosted servers — enforcement is automatic and verified

Every transaction through a **standard** server runs as the authenticated user, scoped through an
External Client App with the `mcp_api` scope. Object CRUD, field-level security, sharing rules,
profile permissions, and permission sets all apply, and the audit trail attributes every action to
that user. **If the user can't do it in Lightning, the agent can't do it through a standard MCP
server.** This is Salesforce's own guarantee for these servers, and it holds — their backing
implementation is what enforces it, not anything the tool author configures.

- **OAuth authorization code flow only** — browser-based. **No service accounts, no
  machine-to-machine flows, no autonomous operation outside user context.**
- **PKCE mandatory.**
- **Servers disabled by default** — activation is a deliberate admin act.
- **Dynamic client registration not supported** — admins must create each ECA.

### 4.2 Custom Apex tools (`aa:`/`ar:`/`ae:`) — sharing + FLS require BOTH halves, not either alone

A custom Apex-backed tool "runs as the authenticated user" only in the OAuth/session sense —
**whether it actually enforces that user's object/field permissions and sharing rules depends
entirely on how the class is written.** Two things are required together; **neither alone is
sufficient**:

1. **`with sharing`** on the class itself.
2. **`WITH USER_MODE`** on the actual SOQL/DML statements the method runs.

`without sharing`, or `with sharing` **without** `WITH USER_MODE` on the queries, silently
reopens system-level access even though the tool still looks correct from the outside — same
OAuth flow, same session context, same "runs as the authenticated user" appearance. There is no
warning at deploy time for this gap on the Apex side; it just quietly under-enforces. (The
`REV000015RepDailySummaryService`-style pattern — `global with sharing` **+** `WITH USER_MODE`
throughout every query — is the correct shape; either half missing breaks the guarantee.)

### 4.3 Custom Flow tools (`fa:`) — the default is the OPPOSITE of safe

Flow security context is controlled by **`runInMode`**, and this is a genuine, permanent platform
trap, not a config value away from being safe by default:

- **An Autolaunched Flow with `runInMode` left unset defaults to system-context-without-sharing
  behavior** — full, unrestricted access to view and edit all data in the org — for a flow
  invoked programmatically (Flow REST API / an MCP `fa:` tool call). This is the **opposite** of
  "runs as the authenticated user."
- The only way to move toward user-context behavior is setting `runInMode` explicitly to
  **`SystemModeWithSharing`** — the most restrictive real value that exists — which enforces
  **sharing rules only**.
- **There is no Flow-native equivalent to Apex's `WITH USER_MODE`.** Field-level security and
  object-permission enforcement do not exist for Flow at all, at any `runInMode` setting — only
  sharing-rule enforcement does. This is a real, permanent gap to accept and call out, not
  something a different value closes.

`[org]`-verified, ground truth for the above: a real deployed Autolaunched Flow with no
`runInMode` set produced zero restriction. When `runInMode` was later set explicitly to
`SystemModeWithSharing`, Salesforce's own deploy-time platform warning read, quoted verbatim:

> *"This system context grants all running users the permission to view and edit all data in your
> org... can lead to unsafe data access."*

That warning fires *because* `SystemModeWithSharing` was set — the unset default is the same
unrestricted access **without even that warning appearing**, which is what makes the unset
default a trap rather than a merely-weaker option.

### 4.4 Checklist — before wiring a custom Apex/Flow tool onto any MCP server

- [ ] **Apex**: class is `with sharing` **and** every SOQL/DML statement the tool's code path runs
      uses `WITH USER_MODE` (or an equivalent FLS-enforcing pattern) — confirm both, not just one.
- [ ] **Flow**: an explicit `<runInMode>SystemModeWithSharing</runInMode>` is set — never leave it
      unset — and the residual FLS/object-permission gap (§4.3) is accepted knowingly, not assumed
      away.

This is exactly the kind of gap that deploys clean, passes tests, and only ever surfaces as a
platform warning if the author happens to set the field at all — treat the checklist as mandatory
review, not optional hardening.

### 4.5 Auditing — the API-log path ✅

> Filter API logs for **`APICLIENTCATEGORY = SALESFORCE_HOSTED_MCP`** to isolate MCP traffic.
> Downloadable daily as CSV or retrievable programmatically: operations performed per user,
> objects accessed, timestamps and access patterns.

> **Nuance:** MCP *traffic* is auditable through API logs, but the **activation event itself
> writes nothing to `SetupAuditTrail`** (`[org]`-verified — an activate/deactivate cycle left
> no audit entry). Runtime use is traceable; the config change is not.

### 4.6 Incremental permission strategy — start restrictive

1. **Read-only servers** — `platform.sobject-reads` eliminates modification risk entirely
2. **Named Queries** — admins define specific SOQL as reusable APIs; controlled access to a
   slice of the model without exposing the full query surface
3. **Custom tools with embedded logic** — Apex/Flow/REST enforcing conditional access rules
   beyond what permissions can express
4. **ECA restrictions** — link the app to specific profiles/permission sets

---

## 5. Custom MCP servers — the "buffet and plate" model

> Every available MCP tool across the platform is a **buffet** — Salesforce product teams,
> ISVs, and internal developers all contribute dishes. **A custom MCP server is the plate**
> curated for a persona.

**Standard servers are immutable.** Custom servers are the only way to add your own tools.

Custom servers can:
- **Combine tools from multiple standard servers under one URL** (e.g. SObject reads + a
  Tableau Next analytics tool for a reporting persona)
- Include **custom tools** backed by org logic (§6)
- Be **scoped per persona** — sales rep, support agent, data steward
- **Deploy via Metadata API** between sandboxes and production

The URL is unique per custom server, so different teams get different tool sets **without
multiple OAuth apps or separate orgs**.

### Why curate — the hard constraint

> "MCP clients have practical limits on how many tools they can work with effectively.
> **Beyond a few dozen tools, an AI client struggles to select the right one.**"

This is the quantitative case for least-privilege activation. It also reframes
`agentforce-grid` (51 tools) — that single server may exceed a client's practical budget on
its own.

### Example plates `[doc]`

| Persona | Composition |
|---|---|
| **Sales rep** | SObject read/write + custom Flow logging meeting notes as Activities + Apex Action enriching a Lead from an external source |
| **Data hygiene** | SObject query (find dupes) + delete tools + dedup Flow — pointed at a profile only data stewards can authenticate as |
| **Reporting** | `soqlQuery` from sobject-reads + Tableau Next tools + a Data 360 SQL tool — broad read, no writes |

---

## 6. Custom tool backing types

| Backing | Use when | Notes |
|---|---|---|
| **Autolaunched Flow** | admin-owned declarative process; reuse existing automation | needs defined input/output variables — these become the tool schema. Changes need no code deploy |
| **Apex `@InvocableMethod`** | logic beyond Flow: complex calculation, custom integration, performance-sensitive | faster than Flow for compute-heavy work; fine-grained bulkification/transaction/exception control |
| **Apex `@AuraEnabled`** | already exists as an LWC/Aura controller | **zero additional code** — existing controllers become agent tools |
| **Apex `@RestResource`** | you already have custom REST endpoints | |
| **API Catalog endpoint** | a Salesforce REST endpoint not covered by standard servers; product-specific Connect APIs (Billing, CPQ, Field Service, Health Cloud) | one tool = one endpoint. Fixed params set at config time can't be overridden at runtime. **Catalog coverage is incomplete at GA** |
| **Agentforce agent** | delegate to a domain-specific agent instead of primitive tools | ⚠️ **only agents built with the new Agent Script Builder**; legacy agents must be upgraded |
| **Prompt Builder template** | server-side execution with Salesforce data + **Einstein Trust Layer** (grounding, toxicity detection) | runs via the Generations API |

**Use Apex/Flow instead of agent/prompt tools** when the operation is a deterministic business
process (update records, validate, trigger approvals) rather than generation or reasoning.

### 6.1 Flows — detail and limits `[doc]`

**Autolaunched flows only** — screen flows and scheduled flows cannot be exposed. The flow
**must have defined input and output variables**; those become the tool schema.

Full platform access at runtime: query/update records, callouts via Named Credentials, email,
subflows, approval processes.

| Limitation | Consequence |
|---|---|
| ⚠️ **Security context is controlled by `runInMode`, NOT automatically "the authenticated user"** — see §4.3 for the full detail | An **unset** `runInMode` on an Autolaunched Flow defaults to system-context-**without**-sharing (full, unrestricted access) — the **opposite** of user context. Set `runInMode` explicitly to `SystemModeWithSharing` on every Flow backing an MCP tool, and note that even then there is **no** Flow-native equivalent to Apex's `WITH USER_MODE` — FLS/object-permission enforcement doesn't exist for Flow at all, only sharing-rule enforcement |
| **Governor limits apply** | Same Apex/DML limits as UI- or Apex-triggered flows. Bulk work should use Batch Apex / Bulk API instead |
| **No streaming or progress reporting** | The agent blocks until completion. For anything beyond a few seconds, design the flow to **return a job ID** the agent polls later |
| Descriptions set at config time | Changing flow behaviour requires manually updating the tool description in Setup |

### 6.2 Apex Actions (Invocable) — detail and limits `[doc]`

> ⚠️ The method must be **`global`** and annotated `@InvocableMethod`. `public
> @InvocableMethod` is **not** eligible for this backing type — an easy miss when adapting
> existing Apex.

Input/output variables define the tool's parameter schema.

| Limitation | Consequence |
|---|---|
| ⚠️ **"Runs as the authenticated user" is conditional, not automatic — see §4.2** | Sharing/FLS enforcement requires **both** `with sharing` on the class **and** `WITH USER_MODE` (or equivalent) on the actual SOQL/DML — neither alone is sufficient. `without sharing`, or `with sharing` with plain SOQL and no user-mode clause, silently reopens system-level access even though the tool still "runs as the authenticated user" for OAuth/session purposes |
| **Complex or nested types** | Make the tool harder for agents to call correctly — flatten where practical |
| Signature drift | Adding parameters or changing types requires **updating the tool config in Setup** to stay in sync |

**Choosing Flow vs Apex Action:** Flow when the process is admin-owned and maintained in Flow
Builder (no code deploy to change) or is straightforwardly declarative. Apex when the work
needs complex computation, external callouts with custom error handling, performance, or
fine-grained bulkification/transaction/exception control.

> 🎯 **Revenue Cloud relevance — Salesforce's own headline example is a quoting one:**
> *"Quote generation: An agent reviewing an opportunity invokes an Apex Action that runs the
> quoting logic — applying product rules, pricing tiers, and approval thresholds — and returns
> a draft quote ID, rather than requiring the agent to replicate that logic itself."*
> This is the sanctioned route for exposing Revenue Cloud logic to agents: wrap the RC
> operation in a `global @InvocableMethod` and publish it on a custom server. It also matches
> the repo's own design rule — keep the logic in the platform, expose a thin tool.

### 6.3 Prompt Builder templates — a *different MCP primitive* ⚠️

**MCP prompts are not tools.** Tools are invoked programmatically by the agent; **prompts are
user-initiated** — surfaced in the client as a slash command or picker, and the user chooses
them.

> **The recipe analogy `[doc]`:** individual tools are *ingredients* — useful but carrying no
> instructions for combining them. A prompt template is the *recipe*: call this tool first,
> pass its output to the next, interpret the result this way. Especially valuable when tools
> are granular primitives lacking business context. **It encodes sequencing knowledge
> explicitly instead of hoping the client infers it.**

That makes prompts a genuine answer to the "too granular" failure mode in §7 — where you
can't coarsen a tool, a prompt template can supply the ordering.

| Limitation | Consequence |
|---|---|
| **Flex templates only** | Sales Emails, Field Generation, etc. cannot be exposed |
| **Published only** | Draft/inactive templates don't appear in Setup |
| **Client support varies** | **Claude and Cursor support MCP prompts; ChatGPT does not.** Verify before designing a workflow around them |
| Data pulled as the authenticated user | Inaccessible fields come back blank or fail, per the template's error handling |
| **Consumes credits at invocation** | Same as triggering the template from the Salesforce UI |

Also: prompts let you **select the model** used for the agentic work — the only backing type
that does.

### 6.3b UIBundle — a richer *destination*, not an embedding mechanism `[doc]`

**UIBundle** is a real, deployable metadata type (`force-app/main/default/uiBundles/`) for React
apps authored via Salesforce's **Multi-Framework** tooling (Salesforce Multi-Framework, GA 2026).
It's worth knowing about wherever a tool result or agent response needs to hand the user off to a
richer UI than a plain record page or a Screen Flow can offer — think of it as a **richer
alternative deep-link target**, the same category of thing as Lightning Out, just with a modern
React front end instead of an Aura/LWC one.

The one fact that matters most here: **UIBundle apps are still Salesforce-hosted and
session-authenticated**, exactly like any other Lightning-adjacent surface. Writing the UI in
React does **not** make it portable into a third-party embedding context (e.g. a Claude Artifact,
an external SPA) on its own — it's a destination you deep-link or navigate *to* from within an
authenticated Salesforce session, not a mechanism for embedding Salesforce UI *into* something
else. UIBundle apps are built against **Headless 360**'s backend (§4.3 of `standard-servers.md`),
so the two are related but serve different roles: Headless 360 is the *data/operation* surface a
UIBundle app calls into; UIBundle is the *rendered UI* a user is sent to.

### 6.4 ISVs

Managed packages **cannot yet include MCP server configurations**. But ISVs can ship
`@InvocableMethod` / `@AuraEnabled` / `@RestResource` classes and **Autolaunched** Flows —
a subscriber admin then composes a custom server from them. Guidance for ISVs: add those
annotations and keep Flows autolaunched, and the capability becomes MCP-reachable with no
extra integration surface.

---

## 7. Tool design — the part that decides whether any of this works

### Granularity: two failure modes `[doc]`

**Too granular (subatomic).** Mapping existing APIs 1:1 to tools. Internal APIs often expect a
specific call sequence where each call returns a partial result. *"An AI client doesn't know
this sequence. It sees a flat list of tools, tries to use them independently, and produces
incorrect or incomplete results."* **Test: if the agent must call tools in a prescribed order
to accomplish anything, it's too granular.**

**Too coarse (bundled workflows).** One tool that creates a lead, scores it, and routes it.
The agent can't intervene between steps, adapt to intermediate results, or reuse a part.
**If a tool encodes a multi-step process with its own decision logic, make it a Flow the agent
invokes.**

**The Goldilocks zone.** *"A good tool returns something an AI client can reason about on its
own, without needing to know what to call next."* Sometimes atomic (create a record); sometimes
molecular (an opportunity **with** its contacts and recent activity — the natural unit for
reasoning about a deal). **Test: does one call produce a self-contained, useful result?**

> **When in doubt, start slightly coarser and split later** — rather than starting subatomic
> and composing upward.

### Annotations — set them explicitly on custom tools

Four boolean hints: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`.
Clients use them to auto-execute reads and gate destructive calls.

> ⚠️ **The spec defaults are conservative: a tool with no annotations is assumed potentially
> destructive and open-world.** A custom query tool omitting `readOnlyHint: true` triggers
> needless "are you sure?" prompts.

Minimum: `readOnlyHint: true` + `destructiveHint: false` on read-only tools;
`destructiveHint: true` on anything that deletes or irreversibly modifies.
Platform tools already ship accurate values. **Annotations are hints, not enforcement** —
not all clients honor them; they complement, never replace, access control.

### Naming and descriptions decide invocation

> *"External AI models select which tool to call based **entirely** on the tool's name and
> description. If the name or description is vague or generic, the external model skips over
> it"* — even when your tool was the right choice.

- **Create task-specific tools, not agent-shaped ones.** One agent handling scheduling *and*
  forecasting should be exposed as **two** tools ("Schedule Customer Meeting", "Forecast Deal
  Close") both pointing at the same agent. Far more reliable selection than a generic
  "Sales Agent".
- **Keep descriptions synchronized** with the underlying agent/flow. Stale descriptions cause
  wrong tool selection.
- Complex or ambiguous input schemas make a tool harder to invoke correctly.

### Don't wrap the APIs yourself

> *"Building a custom proxy layer around the Salesforce REST APIs instead of using the hosted
> server … bypasses the platform's security controls, removes request-level telemetry, and
> creates a maintenance burden that grows as the API surface evolves."*

---

## 8. Beta → GA migration `[doc]`

| Changed | From → To |
|---|---|
| **Server URL** | `v1-beta.2` path → GA format (`…/mcp/v1/…`) |
| **OAuth scopes** | `api`, `sfap_api`, `refresh_token`, `einstein_gpt_api` → **`mcp_api` + `refresh_token`** |
| **Activation** | implicitly available → **disabled by default, admin must enable** |

Unchanged: the ECA connection model, per-user permissions, and every tool's behavior. The
**existing ECA can be reused** — just update its scopes. All users must **reauthorize**; beta
tokens are invalid at GA.

If a client that "worked before" now fails, check these three before anything else.
