 # MCP Tool Backing Types — Specification Table

Destined for `custom-sf-mcp/references/`. One row per backing type: what to build, how it
is identified in `McpServerDefinition`, and what is verified vs pending.

`[org]` = observed in a live org · `[doc]` = documented, unverified · `??` = unknown, must be
generated via Setup and captured.

---

## -1. MCP primitives — which ones this doc covers, and which Salesforce doesn't expose

MCP defines more top-level primitives than just Tools. Before diving into backing types, know
where each one stands for a Salesforce `McpServerDefinition`:

| Primitive | Salesforce support | Where it's covered |
|---|---|---|
| **Tools** (`<tools>`) | ✅ Full — 8 backing types | This whole document |
| **Prompts** (`<prompts>`) | ✅ Full — `GenAiPromptTemplate` | §1c below |
| **Resources** (the `ui://` mechanism, MCP Apps / SEP-1865 — lets a server declare an interactive UI a client renders inline) | ❌ **Not supported** for a custom `McpServerDefinition` as of this writing — checked directly against the primary `forcedotcom/mcp-hosted` source, no mention of MCP Apps, `createUIResource`, or any UI-resource declaration mechanism. Claude *does* support MCP Apps as a client; Salesforce's hosted MCP platform doesn't expose the server-side half yet for custom servers. This is what backs true in-chat rendered widgets — not currently buildable here, and not a Setup-click-away gap like the `psmcps:`/`ct:` cases above; it needs Salesforce to ship the capability | `[doc]`/`[org]` — re-verify before relying on this being permanent; it's a fast-moving spec area |
| **Sampling** (server asks the client's LLM to generate something, nested inside another server feature) | Not applicable — **deprecated in the MCP protocol itself** as of the spec version released July 28, 2026. The spec states new implementations should not adopt it, independent of what any given platform supports | N/A |

If someone asks for an in-chat rendered widget (not a deep-link, not a published Artifact page —
an actual inline interactive UI in the conversation), the honest answer is Resources/MCP Apps, and
the honest status is "not yet possible from a custom Salesforce MCP server." Don't reach for Tools
or Prompts to fake it — a tool returning HTML in its output does not trigger UI rendering; the
finalized MCP Apps spec explicitly excludes tool-result-embedded UI in favor of the predeclared
`ui://` resource pathway, so there's no workaround available at the Tools layer.

---

## 0. Quick reference — which backings self-register vs. need a manual Setup step

Read this table **before** the full per-backing detail below. Several individually-correct facts
about registration live scattered across different rows/sections further down — without a
side-by-side view up front it's easy to over-generalize one backing's rule onto another mid-build.

| Backing | Registration | Why |
|---|---|---|
| `aa:` (Apex `@InvocableMethod`) | Automatic on deploy | The class itself IS the registration — no separate artifact to activate |
| `fa:` (Autolaunched Flow) | Automatic on deploy | Same — the Flow itself is the invocable action |
| `nq:` (Named Query) | Manual: Setup → API Catalog → Activate, **every time content changes** | A declarative `ApiNamedQuery` isn't self-executing code; the API Catalog entry is a separate, platform-generated artifact. Genuinely needs an `ExternalServiceRegistration` — see `external-service-registration.md` §6.0. |
| `psmcps:` (standard-server tool re-exposure) | ✅ **CONFIRMED, isolated test — Setup's Add Tools click is NOT required.** **No `ExternalServiceRegistration`, no activation gate** — categorically different from the row above. An earlier revision of this doc claimed a mandatory Setup → API Catalog → Add Tools click here, treating it as equivalent to `nq:`'s genuine activation gate; that was never tested and generalized from real failures caused by wrong identifier strings, not a platform gate. `[org]`-confirmed, isolated test (`scripts/mcpserverdef-toolkit.mjs add-tool psmcps --construct`): three identifiers built purely from the documented pattern (`psmcps:platform.sobject-mutations:createSobjectRecord`/`updateSobjectRecord`/`updateRelatedRecord`) — no prior Setup interaction of any kind — deployed clean, and their `McpServerToolApiDefinition` rows carry `CreatedDate` **identical to the second** of the deploy's own completion timestamp. Deploying a correctly-formed `psmcps:` identifier is what mints the catalog row; construct-then-deploy is now a fully sanctioned path via `add-tool psmcps --construct --standard-server <ns.server>`, alongside (and no less valid than) adopt-mode. `ct:`'s encoded-version identifier form (`_V_67x2e0`-style) has no confirmed derivation rule and stays adopt-only — this finding does not extend to it. | Re-pointing at an existing standard tool, not authoring a new one. |

A reader scanning this one table before diving into any specific backing has the mental model up
front, instead of reconstructing it from four separate rows/sections mid-build.

---

## 1. Identifier and source matrix `[org]`

**Eight prefixes observed.** All captured by adding tools through Setup and retrieving the
metadata — none were guessed correctly on the first try. **Hard rule, solidly proven for the
`ExternalServiceRegistration`-backed types (`ae:`/`ar:`/`nq:`, and — see the correction below —
`ct:` too):** never hand-write, derive, or transform their `apiIdentifier` or `operation` — the
platform generates these, and Setup Activation is a genuine, non-scriptable gate (see
`external-service-registration.md` §6.0).

⚠️ **`psmcps:` and `ct:` are NOT the same mechanism — an earlier revision of this doc bundled
them together and that was wrong, caught twice now (once here, once in
`external-service-registration.md` §6.0's own summary table, which still needs the same fix).**
Per §1c below, `ct:` tools **are** `ExternalServiceRegistration`-backed, same underlying concept
as `ae:`/`ar:`/`nq:` — the ESR just ships inside a managed package for the 19 native
Connect-sourced rows this org has, so it doesn't surface in a plain customer-side
`ExternalServiceRegistration` query, but the mechanism is real. **`psmcps:` alone is confirmed to
have no `ExternalServiceRegistration` at all** — the isolated construct-then-deploy test (§0
table) only demonstrated this for `psmcps:`; nothing about that test says anything about `ct:`,
whose identifier also has an unconfirmed derivation rule (the `_V_67x2e0`-style encoded version
suffix). **`ct:` stays adopt-only for two independent reasons — an ESR-shaped registration
mechanism that isn't hand-write-safe, AND an identifier format with no confirmed construction
rule — either one alone would be enough.** The **sanctioned, lowest-risk source for `ct:`**: add
the tool once in Setup, then retrieve the definition or query `McpServerToolApiDefinition`
directly — see §1b. `psmcps:` may also construct-then-deploy per the §0 table.

🔴 **Naming rule that applies to EVERY custom-tool-backing metadata type in this skill, not just
one:** the API/developer name must be plain alphanumeric, starting with a letter — **no
underscores.** `[org]`-confirmed on `ApiNamedQuery`: `Acme_UserIdByEmail` failed deploy with
*"API Name must contain only letters and numbers, start with a letter … and cannot be empty."*;
renaming to `AcmeUserIdByEmail` deployed clean. This is the same constraint already known for
`McpServerDefinition` server names — stated once here so it isn't rediscovered per metadata type.

🔎 **A custom `McpServerDefinition`'s `DeveloperName` case is preserved verbatim in the real
runtime `serverUrl` — undocumented elsewhere.** `[org]`-confirmed: renaming a server's
`DeveloperName` to a mixed-case value (e.g. `salesRepMcp`) deployed and activated cleanly, and the
real runtime endpoint carried the mixed case through **exactly**, no lowercasing:
`https://api.salesforce.com/platform/mcp/v1/sandbox/custom/salesRepMcp`. The naming rule elsewhere
in this skill (`DeveloperName = <namespace>_<name with - -> _>`) documents *standard*-server
activation naming only — nothing states this case-preservation fact for *custom*
`McpServerDefinition`s. Worth checking the exact case a client will need before a rename.

🔴 **Mandatory authoring path: every tool addition, of every backing type (`aa`/`fa`/`nq`/`pr`/
`ct`/`psmcps`), goes through `scripts/mcpserverdef-toolkit.mjs add-tool <type> ...` — never a
hand-authored `<tools>` block, even when the identifier shape is well understood.** This isn't
about the identifier alone: the script encodes the verification each type actually needs
(`aa`/`fa` confirm the action is really registered via `/actions/custom/apex`|`/flow` before
wiring it; `nq` derives the `_nquery` convention; `ct`/`psmcps` search `McpServerToolApiDefinition`
for an adoptable row instead of assuming a Setup click is needed) — checks a hand-authored edit
skips even when the author knows the correct shape. Org-verified the hard way in one session: the
script correctly re-confirmed a hand-authored `psmcps:` identifier as right, immediately followed
by the script surfacing its *own* real path-resolution bug (`REPO` was computed two directory
levels short of the actual project root) that had never been caught because the script had never
actually been run — every tool that session had been added by hand instead. Prefer the script even
when you're confident; confidence isn't verification. (Note this is evidence the hand-typed
identifier was *string-correct*, not evidence that a Setup click was *required* to make it
work — see the §0/§1 correction above; the two are different claims.)

| # | Backing | `apiIdentifier` | `apiSource` | `operation` | Status |
|---|---|---|---|---|---|
| 1 | **Apex `@InvocableMethod`** | **`aa:apex-<ClassName>`** | `API_CATALOG` | **`<ClassName>`** (not the method) | ✅ `[org]` |
| 2 | **Autolaunched Flow** | **`fa:flow-<FlowName>`** | `API_CATALOG` | **`<FlowName>`** | ✅ `[org]` |
| 3 | **Platform Standard MCP tool** (`psmcps`) — a standard server's tool re-served on a custom server | **`psmcps:<ns>.<server>:<operation>`**<br>e.g. `psmcps:platform.metadata-experts:executeMetadataAction` | `API_CATALOG` | **the tool's API NAME — NOT the runtime MCP tool name from `tools/list`.** Those are unrelated strings (e.g. `grid_list_workbooks` → `getAllWorkbooks`); no transformation bridges them | ✅ `[org]` |
| 4 | **Connect Tool** (`ct`) — a Connect API-backed tool | **`ct:<ns>-<server>_V_<ver>`**<br>e.g. `ct:platform-metadata-experts_V_67x2e0` | `API_CATALOG` | the tool name | ✅ `[org]` |
| 5 | **Prompt Tool** (`pr`) — a **prompt template exposed as an agent-callable TOOL** | **`pr:<namespace>__<name>`**<br>e.g. `pr:industries_hls_einstein__rlmPricing` | `API_CATALOG` | same as identifier | ✅ `[org]` |
| 6 | **Apex `@AuraEnabled`** | **`ae:<ClassName>`** | `API_CATALOG` | the real method name, case-preserved | ⚠️ identifier confirmed `[org]`, but **live invocation is currently broken** — see [`external-service-registration.md` §4](external-service-registration.md) before building on this backing |
| 7 | **Apex REST `@RestResource`** | **`ar:<ClassName>`** | `API_CATALOG` | the real method name, case-preserved | ✅ `[org]` — confirmed working end-to-end including live invocation |
| 8 | **Named Query API** | **`nq:<QueryName>_nquery`** (identifier body includes the platform's own auto-added `_nquery` suffix) | `API_CATALOG` | the bare query name, unchanged | ✅ `[org]` — confirmed working end-to-end |
| 9 | **Agentforce agent** | `??` | `??` — **do not assume `AGENT`**, see §1e | `??` | ⏳ untested |
| 10 | **Prompt Builder template** | — | — | — | ✅ **`<prompts>` element, not `<tools>`** — see §1c |

> 🔴 **Calling an `aa:` tool over MCP: the real `inputSchema` wraps arguments in an `inputs`
> array, not flat top-level properties** `[org]`-confirmed by dumping the tool's actual advertised
> `inputSchema` from a live `tools/list` response, not guessed. Because `@InvocableMethod` always
> takes `List<T>`, the platform-generated MCP schema is `{"inputs": [{...one InvokeRequest...}]}` —
> sending the fields flat (`{"endpointPath": "...", "httpMethod": "GET"}`) passes local JSON
> validation fine but gets rejected server-side with a misleading, unrelated-looking error:
> `"The HTTP entity body is required, but this request has no entity body."` (`JSON_PARSER_ERROR`).
> Always call `tools/list` first and read the real `inputSchema` for the specific tool rather than
> assuming a flat shape from the Apex `@InvocableVariable` field names alone.

**Full authoring procedure for rows 6–8** — deploying the backing, the two required org-level
Beta settings, the mandatory re-activate-in-API-Catalog-after-every-change rule, runbooks, and the
complete `ae:` investigation — lives in
[`external-service-registration.md`](external-service-registration.md).

🔴 **Hard rule, easy to violate by skimming: every `@InvocableMethod` class MUST be declared
`global`, never `public`.** This was already stated in the `aa:` row of the table below ("Write
`global @InvocableMethod`") but as prose inside a dense cell, not a standalone rule — and it got
violated anyway this session: three classes were authored `public with sharing`, one of them
(coincidentally) still registered in `/actions/custom/apex` and could be wired as a tool, the
other two silently did not (a separate rollback issue masked this for a while, but the visibility
mismatch was real and had to be fixed regardless once found). `global` is Salesforce's documented,
supported requirement for `@InvocableMethod` reliability — `public` may occasionally appear to work
in an unpackaged scratch org, but is not the supported contract and should never be relied on.
**Always author `global with sharing class ...` — never a bare `public with sharing class` —
regardless of whether the individual method is `public static` or `global static` underneath.**

⚠️ **A second, more subtle symptom of the same mistake, `[org]`-confirmed separately**: a class
can be correctly `global with sharing` at the OUTER level, register fine (tool appears, `Tools: N`
count is right, invocation works), and **still** have the `@InvocableMethod` itself declared
`public static` instead of `global static`, with its `Request`/`Response` inner classes (and
their fields) also left `public` instead of `global`. This doesn't break registration or
invocation — it breaks **schema introspection**: Setup's MCP Server tool-detail page shows
"We couldn't load the information. Please try again later." / "Nothing to see here" when trying
to render that tool's Input Schema / Output Schema panels, even though the tool itself is Active
and callable. Fix is the same rule applied all the way down — the method AND every inner
class AND every `@InvocableVariable` field must be `global`, not just the outer class:

```apex
global with sharing class MyAction {
    global static List<Response> invoke(List<Request> requests) { ... }   // global, not public
    global class Request  { global String someField; }                    // global class, global field
    global class Response { global String someOutput; }
}
```

Confirmed by comparing a working tool (all-`global` top to bottom) against a broken one
(`global` class, `public` everything inside) side by side — fixing the inner `public`→`global`
on the broken one immediately restored the schema panel with no other change.

### 1a. Decision matrix — which prefix, and how it gets built

| Prefix | Pick it when… | How it's authored | Script support |
|---|---|---|---|
| **`aa:`** | You need custom Apex logic and full control, and can write a fresh class. **The reliable default for custom Apex** — `[org]`-confirmed to work with zero extra registration (§1b). **Also the confirmed path for wrapping a genuinely external API**: bind a `Custom`-type `ExternalServiceRegistration` to a Named Credential, then write a `global @InvocableMethod` calling the generated `ExternalService.*` wrapper — see `external-service-registration.md` §6. No new identifier prefix needed; mechanically identical to any other `aa:` tool once the wrapper class exists. | Write `global @InvocableMethod`, deploy, add via Setup picker, retrieve real identifier. | ✅ `add-tool aa` |
| **`fa:`** | The logic is better expressed declaratively (admin-maintainable, no code), or you're reusing an existing Flow. | Build/have an Autolaunched Flow, add via Setup picker, retrieve real identifier. | ✅ `add-tool fa` — same derivation + live-verification treatment as `aa:` (mechanically derives `fa:flow-<FlowName>`, confirms it's a registered invocable Flow action via `/actions/custom/flow` before wiring it) |
| **`ar:`** | You need REST-style custom Apex logic — especially if the class is *already* a `@RestResource` serving other integrations and you want to reuse it as an MCP tool too. **Confirmed working end-to-end, including live invocation.** | Write `@RestResource`, deploy, register/activate in API Catalog (see `external-service-registration.md`). | ✅ `add-tool ar` |
| **`nq:`** | A simple, direct SOQL-only lookup — no Apex logic needed, purely declarative "give me record X's field Y." Least code of any option. | `ApiNamedQuery` + manual Activate in API Catalog (unautomatable step — see `external-service-registration.md` §9c). | ✅ `add-tool nq` (auto-derives the `_nquery` identifier convention) |
| **`pr:`** | The "tool" *is* the LLM generation itself — a summary, draft, or briefing, not a data lookup. Requires `type: einstein_gpt__flex` on the template. | Author a `GenAiPromptTemplate` (see the sibling `custom-prompt-template` skill), publish + activate it, then wire it on. | ✅ `add-tool pr` |
| **`ae:`** | Avoid for now unless you already have an `@AuraEnabled` method you can't easily convert to `aa:`/`ar:`. Identifier is `[org]`-confirmed to register correctly, but **live invocation is currently broken** — a real, unresolved platform issue after ~19 independent variants tested (see `external-service-registration.md` §4). | Same registration path as `ar:`. | ✅ `add-tool ae` (still writes a working `<tools>` block — the gap is at invocation time, not authoring time) |
| **`psmcps:`** | The **out-of-the-box, default** way a standard server's own tool gets re-served on a custom server. This is the one to expect when bundling any standard server's capability alongside your own custom tools on one URL. | 🔴 **Check before assuming a Setup click is needed**: `SELECT ApiIdentifier, Operation FROM McpServerToolApiDefinition WHERE ApiIdentifier LIKE '%<target>%'` (Tooling API). If that standard tool was **ever** wired onto *any* custom server in this org before — by anyone, for any feature — its identifier is already there and can be copied straight into the new `<tools>` block, zero clicks. Only fall back to "add via Setup picker on the target standard-server tool, retrieve the generated identifier" if the query comes back empty. Hand-constructing from the documented `psmcps:<ns>.<server>:<operation>` pattern (row 3 above) is **untested but plausible** — no `ExternalServiceRegistration` or activation gate exists for this prefix (§0), so a correctly-formed identifier may just work on deploy; adopt-first is the verified-safe default, not proof hand-construction fails. | ✅ `add-tool psmcps` runs the adopt-first check automatically (adopt mode — see below) — **prefer running the script over hand-rolling the query and the XML**, it does both steps and fails loudly (not silently) when nothing's adoptable yet |
| **`ct:`** | A **distinct** category (Connect Tool), not simply an alternate spelling of `psmcps:` for the same tool — earlier revisions of this doc conflated the two as "the same underlying tool, ambiguous which the picker chooses," which was wrong. Use whichever Setup's picker actually generates for the given tool. | Same check-first sequence as `psmcps:` above — query `McpServerToolApiDefinition` before assuming a Setup click is needed; same open question on hand-construction. | ✅ `add-tool ct` (adopt mode — see below) — same preference: run the script, don't hand-roll |

### 1a-i. Designing tool inputs for the caller, not the platform

An MCP tool's input schema should be designed around what the **CALLER** (a person typing a
request, or an agent reasoning from conversational context) would already know — email, name, an
external reference number, a record's own visible name — **not** Salesforce-internal Ids, unless
the calling agent is itself one that already deals in Ids (e.g. chained after a tool that just
returned one). A tool whose sole input is a bare `Id` only works for a caller who already has that
internal platform Id in hand — a real trap: a "my daily digest" tool that required a Salesforce
`Id` as input worked for nobody asking in natural language. The fix was defaulting to the calling
(authenticated) session user with no input needed for the common case, plus an optional override
keyed on an identifier a human/agent would actually know (email), resolved internally.

This interacts directly with the **backing-type choice** above. Once an input needs resolving from
a human-known identifier, the resolution can live in three different places — pick deliberately,
don't default to whichever backing type was chosen first for unrelated reasons:

| Where the resolution lives | Right when… |
|---|---|
| **Inline, inside the same Apex invocable transaction** (e.g. `repEmail` → inline SOQL) | the resolved value feeds straight into that one tool's own logic and nothing else needs it independently |
| **Its own standalone tool** — a Named Query `nq:`, or `aa:`/`ar:` if the lookup needs logic a Named Query can't express | a calling agent might want the identity-resolution step on its own, independent of the main tool |
| **A Prompt tool (`pr:`)**, not a lookup at all | the input isn't resolvable by a `WHERE` clause but needs interpretation first (e.g. "the rep who covers the west region" needs reasoning before any lookup can run) |

These three aren't interchangeable. An Apex-only design forces every resolution into one
transaction even when a standalone tool would be more reusable for the calling agent; a
Named-Query-only design can't express resolution logic beyond one typed SOQL `WHERE`; a
Prompt-tool-only design adds LLM generation cost/latency to what's actually a deterministic lookup.

### 🔑 Every standard server has two access paths — except one

Every standard MCP server can be reached **two independent ways**:

1. **Directly** — connect a client straight to the standard server's own URL (`.../platform/mcp/v1/<env>/<ns>/<server>`), activated via `McpServerAccess` per §3.
2. **Re-exposed as a tool** on a **custom** server — the standard server's individual tools get
   copied on, via `psmcps:`/`ct:`, alongside your own custom `aa:`/`ar:`/`nq:`/`pr:` tools under one URL (the "buffet and plate" model, §7b).

**`headless-360` is the one exception** — its tools cannot be re-exposed this way; it's reachable
directly only. Every other standard server (`sobject-*`, `agentforce-grid`,
`salesforce-api-context`, `metadata-experts`, `engagement-interaction`, `data-cloud-queries`)
supports both paths.

**Toolkit coverage:** `mcpserverdef-toolkit.mjs`'s `add-tool` command automates `ae`/`ar`/`nq`/`pr`
by construction, and `aa`/`fa` by derivation + live verification against the actions registry
(plus `add-prompt` for the `<prompts>` element). `ct`/`psmcps` run in **adopt mode**: since these
identifiers are minted by Setup's picker, not constructed, the script queries
`McpServerToolApiDefinition` for an existing `ct:`/`psmcps:` row already containing the given match
text and copies it verbatim onto the target server — it fails loudly (not silently) if no such row
exists yet anywhere in the org, with instructions to add it once via Setup first.

### 🔑 A prompt can be exposed TWO ways — and they are different primitives

| As | Element | Who invokes it | Annotations |
|---|---|---|---|
| **Prompt Tool** (`pr:` under `<tools>`) | `<tools>` | **the agent**, programmatically, like any tool | yes — `readOnly` etc. apply |
| **MCP Prompt** (`<prompts>`) | `<prompts>` | **the user**, via slash command / picker | none — tool-only |

Same underlying Prompt Builder template, two exposure models. **`<prompts>` is the MCP *prompt*
primitive; `pr:` in `<tools>` makes the template agent-callable.** Choose by who should trigger
it. Client support differs too — ChatGPT does not surface MCP prompts, but a `pr:` **tool** is
just a tool and works anywhere.

**Official constraints on both exposure models** `[user]` — supplied directly, presumably official
Salesforce doc text on the MCP Prompts capability, quoted verbatim:

> Only Flex templates are supported. Other Prompt Builder template types (Sales Emails, Field
> Generation, etc.) cannot be exposed as MCP prompts.
>
> Only published templates are available for selection. Draft or inactive templates do not appear
> in the Setup UI.
>
> Client support is not universal. MCP prompts are only surfaced in clients that implement the MCP
> Prompts primitive. Verify support in your target client before relying on this capability.
>
> Template variable data is pulled using the authenticated user's permissions. If the template
> references a field the user cannot access, that field will be blank or the call will fail
> depending on the template's error handling configuration.
>
> The use of Prompt Builder templates consumes credits at invocation time, the same as if the
> template were triggered from the Salesforce UI.

This confirms the `type: einstein_gpt__flex` requirement stated in the spec table above with
official text, not just this session's single worked example, and adds three constraints not
otherwise captured here: (1) `Published`-only, matching the `[org]`-tested activation mechanics
in the sibling `custom-prompt-template` skill's `activating-prompt-templates.md` §1; (2) FLS
applies at invocation — a template input can silently blank out or error for a caller lacking
field access, not yet independently org-tested; (3) credits are metered per call, same as a
UI-triggered generation — relevant for any client doing repeated/looped calls. **Type-level
detail (all 5 Prompt-Builder types, plus a 6th internal-only `einstein_gpt__global` value found on
this org's own managed templates) lives in the sibling skill's
`custom-prompt-template/references/prompt-template-types.md`** — this file only covers the MCP
exposure mechanics, not template authoring.

**Prefix decoding** (now confirmed, previously mis-inferred):
- `aa:` **a**pex **a**ction · `fa:` **f**low **a**ction — both point at *invocable* actions
- `psmcps:` **p**latform **s**tandard **MCP** **s**erver — the colon-delimited
  `namespace.server:operation` form
- `ct:` **c**onnect **t**ool — carries an **encoded version suffix**: `_V_67x2e0`
  where **`x2e` = `.`**, i.e. **V 67.0**
- `pr:` **pr**ompt tool — a Prompt Builder template exposed as an agent-callable tool
  (here from a managed namespace, `industries_hls_einstein__`)

### 🧭 The prefix and `apiSource` are two INDEPENDENT axes — do not read one from the other

This is the easiest mistake to make in this file, so it is stated once, plainly:

| Axis | Field | Answers |
|---|---|---|
| **What the artifact is** | `apiIdentifier` **prefix** | apex action · flow action · connect tool · prompt tool · platform standard MCP |
| **Which registry resolves it** | `apiSource` | `API_CATALOG` in every observed case |

**In Setup, MCP Servers live *under* API Catalog.** That is why every tool on every MCP server
observed here carries `apiSource: API_CATALOG` — *regardless of prefix*. A Connect-backed tool is
`ct:` **and** `API_CATALOG` simultaneously; that is not a contradiction, it is the two axes doing
their separate jobs.

> 🔴 **Do not infer the prefix from `apiSource`, or `apiSource` from the prefix.** Seeing
> `API_CATALOG` is **not** evidence that `ct:` means "catalog tool" — an earlier revision of this
> file made exactly that inference and was wrong.

> ⚠️ **Superseded claim, corrected:** an earlier revision of this file said `ct:` and `psmcps:`
> "both referenced the same underlying tool... presumably different UI pickers... do not assume
> the mapping is one-to-one." That was wrong — see §1a above: `ct:` and `psmcps:` are genuinely
> distinct categories, not two identifier forms for one capability.

### 1c. Enumerating `ct:` candidates — Setup's **API Catalog** page, not ESR, not `McpServerToolApiDefinition` `[org]`

`ct:` tools **are** ExternalServiceRegistration-backed as a mechanism — same underlying
registration concept as `ar:`/`ae:`/`nq:` — but for the 19 native Connect-sourced rows in this
org's API Catalog, that ESR record itself ships **inside a managed package**, not as a
customer-visible row `[user]`. A direct SOQL check confirms the visible side of this: this org's
queryable `ExternalServiceRegistration` table (Tooling API) has exactly **4** rows, all four of
them this session's own hand-authored `ar:`/`ae:`/`nq:` tools — none of the 19 Connect rows
(Platform Records, Platform Metadata Experts, etc.) appear there. That's consistent with "the ESR
exists but is packaged/managed, so it doesn't surface via a normal query," the same pattern as the
managed `PROMPTS_REST` prompt templates having no customer-queryable ESR match — **not** evidence
that no ESR exists at all for these. Whether a hidden/system ESR record is independently
inspectable in this org wasn't tested; take the managed-packaging explanation as the reason a
`ct:` candidate can be real and pickable in Setup while showing zero rows in a plain
`ExternalServiceRegistration` query.

**`Connect API` and `ConnectApi` are the same underlying surface, not two different things** `[user]`
— the REST resources under `/services/data/v<VER>/connect/...` and the Apex `ConnectApi.*` namespace
classes are two access forms of one capability set (REST for external/cross-language callers, Apex
for in-org code). This matters here because a `ct:` candidate's Setup label (e.g. "Platform Metadata
Experts") and its documented Apex `ConnectApi` method name (if a `custom-rev-*` skill happens to
reference one) describe the *same* thing — don't treat a REST-path mention and a `ConnectApi.*`
Apex-method mention as evidence of two unrelated APIs when checking whether something is already
documented elsewhere.

`McpServerToolApiDefinition` doesn't help enumerate candidates either — it
only lists tools **already wired onto some `McpServerDefinition`** (this org has exactly 4 rows
total, none of them `ct:`), so it's a record of what's been adopted, not a catalog of what's
available to adopt.

**The real enumeration surface is Setup → API Catalog** (`All Sources` view; same page reachable
via `GET /services/data/v<VER>/api-catalog/apis`, the `dispatch_readonly`/headless-360 path
already used elsewhere in this doc). It groups every API the org exposes by `Source`, and the
`Source` column **is** the prefix map:

| Source (Setup UI) | Prefix | This org's example rows |
|---|---|---|
| Apex REST | `ar:` | `AccountHealthRestResource` |
| AuraEnabled | `ae:` | `AccountHealthController` |
| Named Query API | `nq:` | `Account Health Lookup` |
| **Connect** | `ct:` | everything else — see below |

**The `Connect`-sourced rows are the full `ct:` candidate pool, and it is large** — this session's
org showed 19 of them, none custom-built, all native platform Connect REST API surface (the user's
own words: *"its practically exposing OPEN API specs for all standard connect apis"*), each with an
operation count (the number of individual `ct:` tools that API group can yield once picked):
`Platform Records` (29 ops), `Platform Data Resilience` (27), `Platform Connectivity` (26),
`Analytics Reports` (19), `Integration Platform` (14), `Industries Revenue` (12), `Data Data
Streams` (6), `Commerce Oms` (6), `Platform Files` (5), `Data Semantic` (5), `Industries Sample
Management` (3), `Semantic Authoring Gen Ai` (3), `Commerce Order Management` (3), `Platform Mcp
Context` (2), `Platform Metadata Experts` (1, the `executeMetadataAction` example used throughout
this doc), `Analytics Dqa` (1), `Data Mds` (1), plus two zero-operation rows
(`Sfdc.unified.analytics.connect.api`, `Sfdc.cdp.connect.api`).

A row's operation count is **not** itself a list of `ct:` identifiers — those are only minted (and
retrievable) once a specific operation is picked onto an `McpServerDefinition` via Setup's tool
picker, per the "never hand-construct" rule in §1a.

### 1b. ⚠️ `@AuraEnabled` and `@RestResource` are NOT selectable as deployed `[org]`

Both classes deployed successfully (`global with sharing`, correct annotations) yet **neither
appears in the Setup tool picker, and neither is listed by the action registries**:

```
GET /services/data/v<VER>/actions/custom/apex   -> only the @InvocableMethod class
GET /services/data/v<VER>/actions/custom/flow   -> flows only
   (there is no  .../actions/custom/apexRest  category)
```

**The picker offers invocable actions.** The docs list `@AuraEnabled` and Apex REST as valid
backings, so they require **registration in a source registry** first — being `global` and
deployed is **not** sufficient. The likely home is the **`CLASSIC`** source, which the validator
resolves internally to **`CLASSIC_REST`** (§1e) — but nothing has been observed in it, so
**capture the real identifier rather than constructing one.**

> **Practical rule:** if you want Apex reachable as an MCP tool, **write it as a
> `global @InvocableMethod`.** That is the path that works with no extra registration.

### 1c. Prompts use their own `<prompts>` element `[org]`

Not a tool, not an `apiDefinition` — a separate element with four fields:

```xml
<prompts>
    <descriptionOverride>Search and filter order summaries by account, status, date, product, or process exceptions.</descriptionOverride>
    <promptName>OrderManagementIntelligence__searchOrderSummary</promptName>
    <promptTemplateName>OrderManagementIntelligence__searchOrderSummary</promptTemplateName>
    <promptTitle>Search Order Summaries</promptTitle>
</prompts>
```

- `promptName` and `promptTemplateName` were **identical** here — namespaced Prompt Builder template
- **No annotations** — the `readOnly`/`destructive`/… hints are tool-only
- Custom prompts are creatable: **`GenAiPromptTemplate`** (`genAiPromptTemplates/`) is a deployable
  metadata type. **Activation of a template you author is fully metadata-deployable, but is
  two fields, not one:** `templateVersions[].status = Published` is necessary but not
  sufficient — the top-level `activeVersionIdentifier` must also be explicitly set (it is
  *not* auto-populated by `Published` alone; `[org]`-confirmed via a real
  deploy/deactivate/reactivate cycle). Until it's set, both MCP exposure surfaces report
  empty input schemas, which looks like a dropped-inputs bug but isn't. `GenAiPromptTemplateActv`
  is a *different*, narrower mechanism: the org's own Metadata API schema says verbatim
  "Represents the activation status of **a Salesforce-provided** prompt template" — it toggles
  visibility of a managed-package/OOTB template, never applies to one you author. Full
  creation/activation/MCP-wiring detail, including a real worked example and the exact
  argument-naming rule (key by the input's `apiName`, not its `referenceName`): the sibling
  **`custom-prompt-template`** skill.
- Only **Flex** templates, only **published** ones, can be exposed
- `pr:` identifier form: **managed/namespaced** template → `pr:<namespace>__<name>`; **unnamespaced
  custom** template (e.g. a scratch org with no package namespace) → just `pr:<DeveloperName>`,
  `[org]`-confirmed via `custom-prompt-template`

### 1d. ✅ V7 RESOLVED — standard **and** custom tools coexist in one server `[org]`

One `McpServerDefinition` observed carrying, simultaneously: a custom Apex invocable, a custom
Flow, **two references to a standard server's tool** (`metadata-experts`), a packaged managed
asset, and a **prompt**. This is the documented "buffet and plate" curation model, org-proven:
**a custom server is a curated plate that may re-serve standard tools alongside your own.**

> 🔴 **Never hand-write an `apiIdentifier`.** `aa:apex-` and `fa:flow-` are not derivable from one
> another, and a wrong prefix fails **silently**: `Valid operations for this identifier are []`,
> which reads as "nothing registered" and misdirects the investigation.
> **Add the tool once in Setup → retrieve the metadata → copy the generated value.**

### 1e. `apiSource` is a REGISTRY SELECTOR — probed with check-only deploys `[org]`

`apiSource` enum (Tooling describe): **`CONNECT` · `CLASSIC` · `API_CATALOG` · `AGENT`**. The
picklist **labels are identical to the values** — no decode available there. So the values were
probed directly with `sf project deploy start --dry-run` (validation only, nothing saved):

| `apiIdentifier` | `apiSource` | Validator result |
|---|---|---|
| `ct:platform-metadata-experts_V_67x2e0` | `API_CATALOG` | ✅ **validates** |
| `ct:platform-metadata-experts_V_67x2e0` | `CONNECT` | ❌ `No "ct:…" identifier found for source "CONNECT"` |
| `aa:apex-<Class>` | `CONNECT` | ❌ `No "aa:apex-…" identifier found for source "CONNECT"` |
| `aa:apex-<Class>` | `CLASSIC` | ❌ `No "aa:apex-…" identifier found for source "CLASSIC_REST"` — **note the expansion** |
| *(any bogus id)* | `AGENT` | ❌ **`Unsupported API source: AGENT`** |

**Three things this proves:**

1. **`apiSource` names a registry that is then searched for the identifier.** The error is
   *"no identifier X **for source** Y"* — the two fields are validated **as a pair**. They are
   independent axes, but not a free combination: the identifier must actually be registered in
   that source.
2. **`CLASSIC` resolves internally to `CLASSIC_REST`** — the validator echoes the expanded name.
   That is the classic REST surface, the plausible home for Apex REST once registered (§1b).
3. **`AGENT` is rejected outright at v67.0** — *"Unsupported API source"*, a different error class
   from the others. The enum value exists ahead of the capability. **Do not author it.**

> 🔎 **The dry-run is the cheapest verification tool in this whole skill.** It exercises the real
> server-side validator, returns the real error text, and changes nothing. Reach for it before
> guessing any identifier or source.

#### On decoding the prefix letters — where the evidence stops

The **registry** facts above are org-verified. The **letters** are not derivable from them:
`ct:` validates only under `API_CATALOG`, so "ct = catalog" and "ct = connect" are *both*
consistent with the metadata, and the platform never spells either out. The prefix names come from
the **Setup UI tool picker**, which is the naming authority — record what the UI calls the
category, and treat any expansion as `[ui]`, not `[org]`. **Nothing depends on the expansion**:
you never construct these identifiers, you copy them (§1d).

## 2. Tool element reference — `<tools>` `[org]`

| Element | Notes |
|---|---|
| `apiDefinition/apiIdentifier` | see matrix |
| `apiDefinition/apiSource` | see matrix |
| `apiDefinition/operation` | verify against `/actions/custom/apex` or `/actions/custom/flow` |
| `descriptionOverride` | **what the model reads to choose the tool** — the highest-leverage field in the file |
| `toolName` | the callable name. UI auto-generates poor ones (truncated at ~60 chars) — **always correct it** |
| `toolTitle` | human label. UI defaults to the API name |
| `readOnly` · `destructive` · `idempotent` · `openWorld` | surface over MCP as `readOnlyHint`/`destructiveHint`/`idempotentHint`/`openWorldHint`. **Absent ⇒ spec default = destructive + open-world** — see §2a for definitions and a real toolkit bug this caused |
| `returnDirect` | added by the platform on retrieve |

`<tools>` **is repeatable** — one server, many tools (the "buffet and plate" model). ✅ `[org]`

### 2a. Annotation definitions — the org's own Setup UI text `[org]`

Get these right per tool — a wrong `readOnly`/`destructive` reads as a lie to the calling agent
(and to any human reviewing what an agent is allowed to do unsupervised):

| Annotation | Definition (verbatim, Setup UI) |
|---|---|
| **Read-only** | "This tool only reads data — it doesn't create, update, or delete records. Clients may run it without asking for confirmation." |
| **Destructive** | "This tool may permanently delete or irreversibly modify data. Clients should ask the user to confirm before running it." |
| **Idempotent** | "Running this tool multiple times with the same input produces the same result. Clients may safely retry on failure." |
| **Open world** (calls external services) | "This tool may send data to systems outside Salesforce (e.g., external APIs, email services)." |

Quick calibration: a pure read/query (`ar:`, `nq:`, a read-only `pr:`) is `readOnly: true`,
`destructive: false`, `idempotent: true`, `openWorld: false`. A delete is `readOnly: false`,
`destructive: true`, but typically still `idempotent: true` (deleting an already-deleted record
ends the same way). A plain create with no natural key is `idempotent: false` — calling it twice
makes two records. An upsert (create-or-update by external key) is `idempotent: true`.

**Real bug this caused, `[org]`-confirmed:** `mcpserverdef-toolkit.mjs` used to hardcode
`readOnly=true, destructive=false, idempotent=true, openWorld=false` for **every** tool it added,
regardless of what the tool actually did — a future write/delete-capable or external-calling tool
added through it would have shipped with incorrect, reassuring-sounding annotations. Fixed: all
four are now required, explicit `--read-only`/`--destructive`/`--idempotent`/`--open-world` flags
(literally `"true"`/`"false"`) on every `add-tool` call — the script refuses to run without them.
Also caught a live example of the same mistake made by hand: `nq:AccountHealthLookup` (a pure SOQL
lookup, added via Setup's own UI, not this script) had shipped with `readOnly: false`,
`idempotent: false` — corrected once found.

## 3. Choosing a backing

| Need | Use |
|---|---|
| transactional guarantee across records; complex computation; callouts with custom error handling | **Apex `@InvocableMethod`** |
| admin-owned process, changeable without a deployment; declarative branching | **Autolaunched Flow** |
| the logic already exists as an LWC/Aura controller | **`@AuraEnabled`** — zero new code |
| an existing custom REST API on the platform | **Apex REST** |
| a Salesforce REST endpoint not covered by a standard server (Billing, CPQ, Field Service) | **API Catalog** |
| delegate reasoning to a domain agent rather than exposing primitives | **Agentforce agent** |
| user-initiated, governed prompt with live org data + Trust Layer | **Prompt Builder** (prompt, not tool) |

Salesforce's own guidance: use Apex/Flow when the operation is a **deterministic business
process**; reserve agent/prompt backings for generation and reasoning.

## 4. Invocation contract `[org]`

**Arguments are wrapped in an `inputs` array** — the invocable bulk shape leaks into the tool
schema, and is documented nowhere:

```jsonc
{"name":"<toolName>","arguments":{"inputs":[{ /* fields */ }]}}
```

Flat arguments return **HTTP 200 with `isError:true`** and
`JSON_PARSER_ERROR: The HTTP entity body is required` — a transport-sounding error for a schema
mistake.

**The response is the invocable-action result envelope**, wrapped again by MCP:

```jsonc
{"content":[{"type":"text","text":"[{ \"actionName\":…, \"isSuccess\":true, \"outputValues\":{…} }]"}],
 "isError":false, "structuredContent":{…}}
```

⚠️ **Always read the live `inputSchema` from `tools/list`** — documented parameter names are
unreliable (`soqlQuery` takes **`q`**, not `query`).

## 5. Worked example in this repo

| Artifact | Backing | File |
|---|---|---|
| `AccountWithOpportunityService` | `@InvocableMethod` | `classes/AccountWithOpportunityService.cls` |
| `Create_Account_With_Opportunity` | Autolaunched Flow | `flows/Create_Account_With_Opportunity.flow-meta.xml` |
| `AccountAuraService.getAccountSummary` | `@AuraEnabled` | `classes/AccountAuraService.cls` |
| `AccountRestService` | Apex REST | `classes/AccountRestService.cls` |
| server | — | `mcpServerDefinitions/AccountWithOpportunity.mcpServerDefinition-meta.xml` |
| `VatComplyApi` | Named Credential for a `Custom`-type ESR | `namedCredentials/VatComplyApi.namedCredential-meta.xml` |
| `VatComplyGeolocate` | `Custom` ESR (genuine external API) | `externalServiceRegistrations/VatComplyGeolocate.externalServiceRegistration-meta.xml` |
| `VatComplyGeolocateProbe.getGeolocation` | `@InvocableMethod` wrapping the ESR's generated `ExternalService.*` class | `classes/VatComplyGeolocateProbe.cls` |

All four original backings are **deployed**; tools 1–2 are wired and verified, 3–4 await identifier
capture. The `VatComply*` trio is a complete, **`[org]`-confirmed end-to-end** worked example of the
`Custom`-type/external-integration path (`external-service-registration.md` §6) — Named Credential →
ESR → Invocable Apex → `aa:` tool, real live callout data confirmed.
