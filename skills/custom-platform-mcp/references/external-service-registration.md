# Authoring ExternalServiceRegistration / ApiNamedQuery — the `ae:`/`ar:`/`nq:` backing types

Full authoring procedure for the three custom-tool backing types built on `ExternalServiceRegistration`
(the metadata behind Setup → API Catalog) and `ApiNamedQuery`. `[org]` = observed in a live org ·
`[doc]` = documented, unverified.

---

## 0. What this is, and what it isn't

`ExternalServiceRegistration` registers a REST endpoint (via an embedded OpenAPI 3 spec) into the
org's **API Catalog**. It backs the `ae:`/`ar:` MCP custom-tool identifiers (see
[`tool-backing-specs.md`](tool-backing-specs.md) §1). `ApiNamedQuery` is a separate, simpler
metadata type (a saved SOQL query exposed as a REST endpoint) that backs `nq:`.

## 1. The sanctioned authoring tool

Salesforce's documented workflow (`[doc]`, Agentforce Developer Guide → Agentforce Actions →
Create Actions with Apex REST Agent Actions → Generate Files) is a **VS Code Command Palette
action**, not a CLI command: **`SFDX: Create OpenAPI Document from this Class`**. Requires the
Salesforce VS Code Extension Pack — no `sf` CLI equivalent exists.

It introspects an already-deployed `global`/`public` Apex class and generates two files together:

```
<ApexClass>.yaml                                    — the OpenAPI 3 document (companion, not itself deployable)
<ApexClass>.externalServiceRegistration-meta.xml     — the deployable metadata (only this deploys)
```

> 🔴 **Naming is strict and load-bearing: both files must be named for the Apex class, not a
> descriptive label.** `AccountHealthRestResource.cls` → `AccountHealthRestResource.yaml` +
> `AccountHealthRestResource.externalServiceRegistration-meta.xml`.

`[doc]` The description shown in the API Catalog comes from the YAML's top-level
`info.description`, not the XML's `<description>` element. Keep both in sync anyway.

### 1b. This environment's equivalent — no VS Code available

There is no VS Code Command Palette in this environment, so §1's documented workflow cannot be
driven directly here. **Use
[`scripts/esr-toolkit.mjs`](../scripts/esr-toolkit.mjs) instead** — it reproduces the same
outcome (a deployable `ExternalServiceRegistration`, or `ApiNamedQuery` for the `nq:` type)
through the org's own APIs rather than the extension's UI:

```
node .claude/skills/custom-platform-mcp/scripts/esr-toolkit.mjs esr aura <ClassName> [--org <alias>] [--deploy]
node .claude/skills/custom-platform-mcp/scripts/esr-toolkit.mjs esr apexrest <ClassName> --cls-file <path> [--org <alias>] [--deploy]
node .claude/skills/custom-platform-mcp/scripts/esr-toolkit.mjs esr namedquery <QueryApiName> --soql "<SOQL>" --label "<label>" --description "<desc>" [--param name:label:description ...] [--org <alias>] [--deploy]
```

- **`aura`** pulls the real OAS3 spec straight from the org (`GET /specifications/oas3/apex/{Class}`) — deterministic, no LLM involved.
- **`apexrest`** derives the spec by reflection (`urlMapping` + `@Http*` methods); content is `x-PLACEHOLDER`-marked where the real tool's step is LLM-authored, since that step isn't available here and nothing is fabricated in its place.
- **`namedquery`** deploys only the `ApiNamedQuery` — the real `ExternalServiceRegistration` for this type is server-generated when you click Activate in Setup → API Catalog, so the script stops there by design (see the script's own header for why hand-authoring this one is a dead end).

It builds the **backing only**. Wire the result onto an MCP server's tool list with the sibling
script, `add-tool ae|ar|nq` on
[`mcpserverdef-toolkit.mjs`](../scripts/mcpserverdef-toolkit.mjs) (§3 below covers `nq` specifically).

## 2. The real field shape `[org]`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExternalServiceRegistration xmlns="http://soap.sforce.com/2006/04/metadata">
    <description>...</description>
    <label>...</label>
    <operations>
        <active>true</active>
        <name>getaccounthealth</name>   <!-- lowercased operationId -->
    </operations>
    <registrationProviderAsset>AccountHealthRestResource</registrationProviderAsset>
    <registrationProviderType>ApexRest</registrationProviderType>  <!-- or AuraEnabled -->
    <schema>
        <!-- the full OpenAPI 3 YAML, inline, XML-entity-escaped -->
    </schema>
    <schemaType>OpenApi3</schemaType>
    <schemaUploadFileExtension>yaml</schemaUploadFileExtension>
    <schemaUploadFileName>accounthealthrestresource_openapi</schemaUploadFileName>
    <serviceBinding>{"host":"","basePath":"/","allowedSchemes":[],"requestMediaTypes":[],"responseMediaTypes":[],"compatibleMediaTypes":{},"integrationFlags":null,"extensions":{}}</serviceBinding>
</ExternalServiceRegistration>
```

**Fields that are platform-computed on save — do not author:** `<status>` (recomputed regardless
of what's submitted) and `<systemVersion>` (auto-assigned).

**Type-specific base path, enforced by validation, undocumented on the Metadata Reference page:**

| `registrationProviderType` | Required `servers[].url` |
|---|---|
| `ApexRest` | `/services/apexrest` |
| `AuraEnabled` | `/services/aura-controllers/custom` |

`registrationProviderAsset` is a plain **string** holding the Apex class name — not the
`reference`-typed `RegistrationProviderAssetId` visible in the Tooling API describe (that field is
platform-computed, not author-facing; setting it directly throws `XML_PARSER_ERROR`).

**Deployable at `force-app/main/default/externalServiceRegistrations/`** (plural — matches the
Metadata API type folder).

## 3. `ae:`/`ar:` — the generalizable recipe

1. Write the Apex class as `global` or `public` (both worked for the identifier/selection step;
   whether `public` suffices for `@AuraEnabled` **runtime dispatch** specifically is unresolved —
   see §4).
2. **For `@AuraEnabled` return/parameter types that are custom Apex classes: annotate every
   exposed field with `@AuraEnabled` individually, not just the method.** `[org]` — a general
   Apex/LWC serialization rule, not MCP-specific, and the single most common reason this path
   silently fails to expose data.
3. Author and deploy the `ExternalServiceRegistration` (§2) — or, for `AuraEnabled` specifically,
   call the real org reflection endpoint instead of hand-authoring:
   `GET {instanceUrl}/services/data/v<VER>/specifications/oas3/apex/{ClassName}` — deterministic,
   no LLM required. Confirm `Status: Complete` before proceeding.
4. In Setup → the target custom `McpServerDefinition` → Add Tool → pick the class's method under
   the AuraEnabled/Apex REST category (Setup-UI-only — no CLI/API path exists for this pick).
5. **Retrieve and capture the real identifier — never hand-construct it:**
   `sf project retrieve start --metadata McpServerDefinition:<ServerName>`, then read
   `<apiIdentifier>` and `<operation>` from the retrieved XML, or query
   `McpServerToolApiDefinition` directly.

**Apex REST content generation is LLM-gated and may be unavailable** — the real VS Code
generator's REST path (`resources/templates/methodByMethod.ejs`) is LLM-driven and disabled by
default (`enableRestOASGen: false`); the `AuraEnabled` path is fully deterministic (reflection
only, no AI). If the LLM dependency is down, extract `urlMapping` + `@Http*` methods
deterministically and hand-complete the request/response schemas — never fabricate a shape
silently; mark placeholders explicitly.

## 4. 🔴 `ae:` — identifier confirmed, but live invocation is currently broken `[org]`

**The `ae:<ClassName>` identifier is real and selectable** — a class reaches `Status: Complete`,
appears in the Setup Add Tool picker, and the resulting `McpServerToolApiDefinition` row is
correct. **But calling the tool fails with a `404` ("URL No Longer Exists")** on the underlying
`/services/aura-controllers/custom/{ClassName}/{methodName}` REST route, in every variant tested:

- Confirmed **not** an MCP-layer bug — calling the raw endpoint directly (bypassing MCP entirely,
  with a valid bearer token) fails identically.
- Confirmed **not** a class/deployment problem — `Active`, `IsValid: true`, and the method's own
  logic verified correct via anonymous Apex (real computed results, matching seeded data exactly).
- Confirmed **not** a permissions problem — tested as `System Administrator`, which has implicit
  access to all Apex classes.
- **Two org-level Beta settings exist and were confirmed required-but-not-sufficient:**
  - `EnterpriseApiSettings.enableOpenApiSpecGenBeta` — **deployable via metadata**
    (`force-app/.../settings/EnterpriseApi.settings-meta.xml`). Corresponds to Setup → User
    Interface → "Enable Salesforce Platform REST API, OpenAPI Spec Generation (Beta)".
  - "Enable MCP Service (Beta)" — **confirmed via an exhaustive before/after diff of every
    retrievable Settings file (150+) and the full 306-type metadata catalog: this toggle has zero
    representation in the Metadata API.** UI-only, no deploy path exists. Toggling it does not
    require any local metadata change to record.
  - Enabling both did **not** resolve the invocation failure.
- Schema variants tested and ruled out (all produce the identical `404`): base path correctness,
  `<operations>`/`<serviceBinding>` presence or absence, `cacheable` on/off, inline vs cross-class
  DTO, single-object vs `List<T>` return type, `GET` vs `POST` verb, class-name-prefixed vs
  bare-method path, and a byte-for-byte replica of a separately-authored, independently-generated
  working reference class.

**🔑 Mandatory operational rule, discovered mid-investigation and confirmed for all three backing
types (not just `nq:`):** every time a tool specification or `ExternalServiceRegistration` changes
(redeploy), **the registration must be manually deactivated and reactivated in Setup → API
Catalog** before it's reliably usable again — a plain redeploy does not implicitly refresh
activation state. This is a separate, additional manual step from reaching `Status: Complete`.
Skipping it after any change is a strong candidate root cause for the `ae:` failure above being
under-isolated — every retest should reconfirm this cycle was actually performed for the specific
deployment being tested.

**Practical guidance:** treat `ae:` as **not currently usable for live invocation** in an org
exhibiting this behavior, regardless of how correctly it's authored. Prefer `ar:` (`@RestResource`)
for equivalent Apex-backed functionality — it is fully confirmed working end-to-end. Before relying
on `ae:` in a new org, run the same isolation sequence (raw-endpoint test bypassing MCP, anonymous
Apex to confirm the method itself, both Beta settings, and the reactivate-after-change cycle) and
treat a repeat `404` as a genuine platform-state issue to escalate, not a metadata/schema authoring
problem to keep iterating on.

## 5. `nq:` — Named Query API

**Do not hand-author an `ExternalServiceRegistration` for this type.** `[org]`, confirmed: the
platform maintains its own canonical registration per `ApiNamedQuery`, generated **only** when the
query is manually **Activated** in Setup → API Catalog — a genuine server-side create, not a flag
flip. A hand-authored registration for the same query is an orphaned duplicate that permanently
stays `Status: Incomplete` and is never selectable.

**The platform-generated registration's schema cannot be hand-replicated** — `servers[].url` is
the org's own live domain (not a static path), the path is `/named/query/{QueryName}`, and the
response schema is field-reflected against the real target object's describe (real field
descriptions included). This is by design — treat it as a black box.

**What "manual, required, no API path exists" actually means, confirmed `[org]`.** The real
mechanism behind Setup's Activate button is two Aura-controller endpoints, documented in the
`ExternalServices` Setup Operation Recipe (reachable via `headless-360`'s `discover`/`describe` —
see `standard-servers.md` §5.2): `get-actions` (lists a registration's operations, each with a
**1XO-prefixed `ExternalServiceOperation` Id**) and `set-active-service-operations` (`PATCH`,
**SET semantics — operations omitted from the list get deactivated**, and it requires the 1XO Id,
not the operation-name string; passing the string silently fails to persist while still returning
`success:true`). **Both are confirmed unreachable by any method available to an agent** — neither
MCP `dispatch` (`ROUTE_NOT_FOUND`) nor a direct bearer-token REST call (`404 URL No Longer Exists`)
can invoke them; they require a real Aura protocol envelope and browser session. This is why "no API
path exists" is accurate, not just under-researched — it's a genuine platform Beta-surface gap, not
a tooling gap.

### Runbook

🔴 **Prefer `add-tool nq` (`scripts/mcpserverdef-toolkit.mjs`) over hand-authoring** — it derives
the `_nquery` convention, runs the `Status:Complete` safety check step 3 below does by hand, and
is the mandatory authoring path per `tool-backing-specs.md` §1's top-of-file rule. The manual
sequence below is what the script automates; read it to understand what's being checked, but run
the script.

1. Author and deploy **only** the `ApiNamedQuery` — real, field-order-correct shape, `[org]`-
   confirmed after two failed deploys against a guessed field shape. **Element order is
   alphabetical and load-bearing** (`apiNamedQueryParameters`, `apiVersion`, `body2`,
   `description`, `masterLabel`) — putting a field out of this order (e.g. a guessed `<label>`
   placed last) fails with *"Element … label invalid at this location in type ApiNamedQuery"*,
   which reads like a namespace/file-location bug but is really just wrong field order/names:

   | Guessed (wrong — field purpose only) | Actual (org-confirmed) |
   |---|---|
   | `<label>` | `<masterLabel>` |
   | `<query>` | `<body2>` |
   | `<namedQueryParameters>` with `<apiName>`/`<dataType>` children | `<apiNamedQueryParameters>` with `<description>`/`<parameterLabel>`/`<parameterName>` children (no data-type field) |

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <ApiNamedQuery xmlns="http://soap.sforce.com/2006/04/metadata">
       <apiNamedQueryParameters>
           <description>The user's email address to look up.</description>
           <parameterLabel>Email</parameterLabel>
           <parameterName>email</parameterName>
       </apiNamedQueryParameters>
       <apiVersion>67.0</apiVersion>
       <body2>SELECT Id, Name FROM User WHERE Email = :email</body2>
       <description>Looks up a User Id by email address.</description>
       <masterLabel>User Id By Email</masterLabel>
   </ApiNamedQuery>
   ```

   Deployable at `force-app/main/default/apiNamedQueries/`.

   🔴 **Same no-underscore naming rule that applies to every custom-tool-backing metadata type**
   (`tool-backing-specs.md` §1) applies to the `ApiNamedQuery` DeveloperName too — `[org]`-
   confirmed: `REV000015_UserIdByEmail` failed deploy with *"API Name must contain only letters
   and numbers, start with a letter … and cannot be empty."*; `REV000015UserIdByEmail` (no
   underscore) deployed clean.
2. **Manual, required, no API path exists:** Setup → API Catalog → find the query → **Activate**.
   The platform creates its own `<QueryName>_nquery` `ExternalServiceRegistration`,
   `Status: Complete`, automatically.

   🔴 **This recurs on every future content edit to an already-Activated query — it is not a
   one-time step — and "Deactivate" is NOT a toggle.** `[org]`-confirmed: redeploying an
   Activated `ApiNamedQuery`'s content fails outright: *"Cannot update Named Query: <Name>. It is
   activated as agent action. Please de-activate it and retry."* No API workaround exists — a
   Tooling API `PATCH` of `ExternalServiceRegistration.Status` fails
   (`REQUIRED_FIELD_MISSING: You must provide a valid Metadata field`; this sObject is
   metadata-container-backed, like `ApexClass`, not flat-field-patchable), and no Tooling field
   flips the "activated as agent action" state directly. The fix is Setup UI-only: Setup → API
   Catalog → find the query → **Deactivate** → redeploy the metadata change → Setup → API Catalog
   → **Activate** again. **Deactivate fully DELETES the `ExternalServiceRegistration` record**
   (confirmed: a follow-up `SELECT Id FROM ExternalServiceRegistration WHERE DeveloperName =
   '<name>_nquery'` returns zero rows immediately after Deactivate) — so the step after
   redeploying isn't "reactivate" (misleading — implies flipping a flag back), it's a genuinely
   fresh **Activate**, identical clicks to building the API Catalog entry the first time, because
   the old entry no longer exists to flip. **Always instruct "Activate," never "reactivate," for
   this step** — the wrong word here has caused real confusion when a subsequent `nq:` lookup
   failed and looked like a new bug rather than the expected consequence of the old registration
   being gone.

   ⚠️ **Don't bundle this redeploy with anything else in the same deploy call.** A
   multi-component deploy where the `ApiNamedQuery` update is still locked (per the above) fails
   the whole transaction — `rollbackOnError: true` is the default, so **every** component rolls
   back, even ones whose own `componentSuccesses` entry claims `success: true, changed: true`
   with a real new version Id. This is the same transactional-rollback trap already documented in
   `custom-rev-authoring-expression-sets`' README for pricing-procedure deploys ("mdapi deploys
   are TRANSACTIONAL — verify by re-query/retrieve, not by per-component success") — it applies
   here for the identical reason (one locked component poisons the whole multi-component deploy).
   When a Named Query fails to redeploy for the reason above, deploy everything else
   **separately**, then re-verify by retrieve, not by trusting `componentSuccesses`.
3. Confirm catalog-visible: SOQL `Status = 'Complete'` on `ExternalServiceRegistration`, or the
   real API Catalog Connect REST API (§6) `GET /services/data/v<VER>/api-catalog/apis?source=NAMED_QUERY`.
4. Setup → the target custom `McpServerDefinition` → Add Tool → pick the query under the Named
   Query category.
5. Retrieve/capture the real identifier: expect `nq:<QueryName>_nquery` with `Operation` = the
   bare query name — but capture it, don't assume it matches this pattern exactly for a
   differently-named query. **Mechanically derivable convention, confirmed on one example** — the
   identifier body is `<QueryName>_nquery`, `Operation` is `<QueryName>` unchanged — but still
   verify against the live org (`Status: Complete` on the derived `DeveloperName`) before trusting
   it for an automation.

## 6. Reference — API Catalog Connect REST API `[doc]` `[org]`

Salesforce Developers → Platform → "API Catalog Connect REST API".

> **🔑 The base path has no `/connect/` segment — differs from every other Connect resource:**
> `/services/data/v<VER>/api-catalog/...`, **not** `.../connect/api-catalog/...`. Verify the base
> path per resource family; don't assume `/connect/`.

| Operation | Method | Path |
|---|---|---|
| `getApi` | GET | `/api-catalog/sources/{sourceId}/apis/{apiId}` |
| `getApis` | GET | `/api-catalog/apis` (query: `schemaType`=`REST`\|`MCP`, `source`) |
| `getApiVersions` / `getApiVersionOperations` | GET | `.../versions[/{apiVersionId}/operations]` |
| `getSources` | GET | `/api-catalog/sources` — **not a reliable enumeration of valid `source` filter values** for `getApis`; use real `providerType` values observed on actual entries instead |
| `createMcpServer` / `updateMcpServer` / `deleteMcpServer` / `replaceMcpServerAssets` | POST/PUT/DELETE | `/api-catalog/mcp-servers[/{id}[/assets]]` — **scoped to `type: EXTERNAL` MCP servers only** (registering a remote MCP endpoint *into* this org) — does **not** touch internal `ExternalServiceRegistration`/`ApiNamedQuery` at all |

**Every mutating operation in this API is server-registration-scoped.** There is no create/update
for individual cataloged APIs — confirms activation of `ae:`/`ar:`/`nq:` backings has **no
scriptable path**; manual Setup activation is the only mechanism, by design, not a tooling gap.

**`properties.isActive` exists only on server-type `getApis` entries** (`providerType:
PLATFORM_CUSTOM_MCP_SERVER`/`PLATFORM_STANDARD_MCP_SERVER`) — never on tool-type entries
(`APEX_REST`/`AURA_ENABLED`/`NAMED_QUERY`), which always show `properties: {}`. For tool-type
entries, catalog visibility is gated purely by `ExternalServiceRegistration.Status = Complete`. An
MCP *server* and an MCP *tool* are different kinds of catalog entry — don't conflate them.

## 6. `Custom` type — genuine external API/integration `[org]`

**What this is, and what it isn't.** `ApexRest`/`AuraEnabled`/`NamedQuery` (§§1–5) all reflect an
org-local artifact — no Named Credential needed. `Custom` is the opposite case: a real third-party
REST API (weather, VAT validation, a partner system — anything outside the org), authenticated via a
**Named Credential**. Confirmed end-to-end against a genuine external API (vatcomply.com, public,
no-auth).

### 6.0 Where this sits in the full picture — one table, all backing types

| Backing | `registrationProviderType` | ESR needed? | Manual activation needed? | Reaches MCP as |
|---|---|:-:|:-:|---|
| Apex `@InvocableMethod` | — (no ESR at all) | No | No | `aa:` — direct |
| Autolaunched Flow | — (no ESR at all) | No | No | `fa:` — direct |
| Prompt Builder template | — (no ESR at all) | No | No (Published required) | `pr:` — direct |
| Standard MCP server tool, re-served | — (no ESR at all) | No | No — `[org]`-confirmed via an isolated construct-then-deploy test, see `tool-backing-specs.md` §0 | `psmcps:` — direct or construct (adopt mode preferred) |
| Connect-sourced tool, re-served | `ExternalServiceRegistration`-backed as a mechanism (managed-package-hidden — doesn't surface in a plain customer-side ESR query, per `tool-backing-specs.md` §1c) | Effectively yes — the ESR exists even though it's not directly inspectable/hand-authorable | Not scriptable the same way `ae:`/`ar:` are (no customer-visible ESR to activate) — Setup's own Add Tools picker is the only path | `ct:` — adopt mode only, never construct (identifier's encoded version suffix has no confirmed derivation rule either) |
| `@AuraEnabled` | `AuraEnabled` | Yes (platform-generated) | **Yes** (Setup → API Catalog) | `ae:` — but live invocation currently broken, see §4 |
| `@RestResource` | `ApexRest` | Yes (platform-generated) | **Yes** (Setup → API Catalog) | `ar:` |
| Named Query | `NamedQuery` | Yes (platform-generated **only** on Activate — never hand-author) | **Yes**, and it's what *creates* the ESR | `nq:` |
| **Genuine external API** | **`Custom`** | **Yes, hand-authored**, + a Named Credential | **No** (`Status: Complete` auto, once schema + NC valid) | **`aa:` — indirectly**, via a hand-written `@InvocableMethod` wrapping the generated `ExternalService.*` class (§6.3) |

The bottom row is the odd one out in two ways: it's the only type where *you* author the ESR by
hand (the other three are platform-generated), and it's the only type that needs an **extra Apex
wrapper** to reach MCP at all — `aa:`/`fa:`/`pr:`/`psmcps:` need no such wrapper, and `ae:`/`ar:`
reach MCP directly via their own prefix once activated.

### 6.1 The minimal working shape

1. **Create the Named Credential first.** For a simple no-auth public API:
   ```xml
   <NamedCredential xmlns="http://soap.sforce.com/2006/04/metadata">
       <label>MyApi</label>
       <namedCredentialType>Legacy</namedCredentialType>
       <endpoint>https://api.example.com</endpoint>
       <principalType>Anonymous</principalType>
       <protocol>NoAuthentication</protocol>
   </NamedCredential>
   ```
2. **Author the `Custom`-type ESR**, referencing it via the top-level `<namedCredential>` field —
   **the only place the credential is referenced:**
   ```xml
   <ExternalServiceRegistration xmlns="http://soap.sforce.com/2006/04/metadata">
       <label>MyApi</label>
       <namedCredential>MyApi</namedCredential>
       <operations>
           <active>true</active>
           <name>my_operation</name>
       </operations>
       <registrationProviderType>Custom</registrationProviderType>
       <schema>openapi: 3.0.0
   info:
     title: MyApi
     version: 1.0.0
   paths:
     /endpoint:
       get:
         operationId: my_operation
         responses:
           '200':
             description: Successful response.
             content:
               application/json:
                 schema: { type: object, properties: { ... } }
   </schema>
       <schemaType>OpenApi3</schemaType>
   </ExternalServiceRegistration>
   ```
3. **Deploy both together.** `Status` transitions to `Complete` automatically once the schema is
   valid and the Named Credential is bound — no manual Setup activation step, unlike `nq:` (§5).

> 🔴 **Do not put a `servers:` block referencing the Named Credential via `callout:<Name>` in the
> schema when `<namedCredential>` is also set.** `[org]` Using both causes a real, reproducible
> runtime failure: `System.CalloutException: ... The named callout URL:
> 'callout:<garbled>:<Name>/<path>' is malformed` — the platform double-resolves the credential.
> **Omit `servers:` entirely** (only `paths:` with relative paths is needed), or use a plain
> real-looking URL if a `servers:` block is required for validation — never `callout:`. Not tested:
> whether `callout:` syntax works if used *alone*, without `<namedCredential>` also set.

### 6.2 Reaching it from Apex — capture names, never guess

Every `Custom`-type ESR operation gets an auto-generated Apex wrapper method under
`ExternalService.<Label>`. **Capture the real method/type names from Setup's Apex Class Viewer** —
never guess them; naming here is genuinely non-derivable from the OpenAPI schema alone. If the
viewer isn't available, the Actions REST API's describe response also carries the real generated
type name:
```
GET /services/data/v<VER>/actions/custom/externalService/<Label>.<operationId>
```
returns `outputs[].apexClass` with the real response type name.

**Confirmed naming rules** `[org]`:
- The operationId's `_` is translated to `x5f` in **both** the generated method name and response
  field names: `get_geolocate` → method `getx5fgeolocate()`; response field `country_code` →
  `countryx5fcode`.
- Reserved words get a `z0` prefix (e.g. a field named `currency` → `z0currency`).
- **An operation with no parameters generates a zero-argument method and no `_Request` type at
  all** — don't assume every operation has one, even though the doc's own examples all show
  operations that do.

**Worked example**, confirmed live:
```apex
ExternalService.VatComplyGeolocate service = new ExternalService.VatComplyGeolocate();
Object rawResponse = service.getx5fgeolocate();
ExternalService.VatComplyGeolocate.getx5fgeolocate_Response response =
    (ExternalService.VatComplyGeolocate.getx5fgeolocate_Response) rawResponse;
// response.Code200.countryx5fcode, .name, .capital, .latitude, .longitude, .ip
```

### 6.2b Full Apex naming/typing conventions `[doc]` — Salesforce Help, "External Service Registrations in Apex"

Official reference, not yet independently verified beyond §6.2's confirmed subset (underscore/`z0`
translation, zero-arg no-param methods). Recorded here in full since the doc covers many shapes this
project's single worked example didn't exercise.

**OpenAPI → Apex data type mapping:**

| OpenAPI 2/3 type, format | Apex type |
|---|---|
| `integer` | `Integer` |
| `integer`, `int32` | `Integer` |
| `integer`, `int64` | `Long` |
| `number`, `float` | `Double` |
| `number`, `double` | `Double` |
| `string` | `String` |
| `string`, `byte` | `Blob` |
| `string`, `binary` | `Blob` |
| `string`, `date` | `Date` |
| `string`, `date-time` | `Datetime` |
| `boolean` | `Boolean` |
| `array` | `List<>` |
| `object` | Apex property class, or `Map<>` (for `additionalProperties`) |

**Object naming** — a *named* schema reference (OAS 2 `definitions` / OAS 3 `components/schemas`)
maps to `ExternalService.<ServiceName>_<ReferenceName>` (e.g. `ExternalService.CreditScore_creditRating`).
An *anonymous inline* schema (no `$ref`) gets an auto-derived name instead — this is what produced
`VatComplyGeolocate_getx5fgeolocate_OUT_200` in this session's own test, since the response schema
was inline, not a named component:

| Anonymous schema location | Derived Apex name |
|---|---|
| Operation request body | `ExternalService.<Service>_<Operation>_IN` |
| Operation response, success (`< 300`) | `ExternalService.<Service>_<Operation>_OUT_<Code>` |
| Operation response, error (`>= 300`) | `ExternalService.<Service>_<Operation>_EXC_<Code>` |
| Object schema as a property of another object | `ExternalService.<Service>_<Parent>_<Property>` |
| Polymorphic (`allOf` + discriminator) | `ExternalService.<Service>_<CompositionRef>_KT_PT` |
| Array item, named reference | `ExternalService.<Service>_VT_<ArrayRef>` |
| Array item, anonymous | follows the object-schema naming scheme above |
| `additionalProperties` map value, named reference | `ExternalService.<Service>_KT_VN_<Ref>` |
| `additionalProperties` map value, anonymous | `<AnonymousObjectName>_KT_V` |

> ⚠️ **255-character limit.** Derived names longer than 255 characters break Apex/Flow Builder usage.
> Fixes: shorten the external service name, add an explicit `operationId` to shorten the
> operation-derived portion, shorten the parent object property name, or declare the nested object
> as a top-level named schema instead of inline.

**Variable/character naming translation** — confirmed empirically in this session (§6.2) for the
first row; the other two are documented but untested here:

| Schema character/word | Apex translation | Example |
|---|---|---|
| `_` (underscore) | `x5f` | `account_type` → `accountx5ftype` |
| `-` (hyphen) | `x2d` | `account-status` → `accountx2dstatus` |
| reserved keyword | prepended `z0` | `User` → `z0User` |

### 6.3 Reaching MCP — `aa:`, indirectly, no new prefix

`Custom`-type ESR does **not** get its own `apiIdentifier` prefix and is **not** directly selectable
in the MCP "Add Tool" picker (unverified either way — not yet checked in Setup). The confirmed,
working path: wrap the generated `ExternalService.*` call in an ordinary `global @InvocableMethod`
Apex class, then wire it as a standard `aa:` tool exactly like any other Apex Invocable Action (§1a)
— no special handling needed.

> ⚠️ **A separate, platform-auto-generated `EXTERNAL_SERVICE`-type action already exists for every
> `Custom`-type ESR operation** (visible in the API Catalog UI as `Invocable Actions: 1` /
> `Activated`, and via `GET /services/data/v<VER>/actions/custom/externalService/<Label>.<op>`).
> **This is a different, independent mechanism from `@InvocableMethod`** — it is not itself
> annotated `@InvocableMethod` (confirmed by its calling convention: an instance method requiring
> `new ExternalService.<Label>()`, not the static `List<T>`-based shape `@InvocableMethod` requires)
> and does not make the operation reachable via `aa:` on its own. Don't conflate the two.

**Worked example**, confirmed live end-to-end (real external callout, real MCP tool registration):
```apex
global with sharing class MyApiProbe {
    global class Result {
        @InvocableVariable public String someField;
    }
    @InvocableMethod(label='My Api Call')
    global static List<Result> callMyApi() {
        ExternalService.MyApi service = new ExternalService.MyApi();
        Object raw = service.myx5foperation();  // real name captured, not guessed
        ExternalService.MyApi.myx5foperation_Response response =
            (ExternalService.MyApi.myx5foperation_Response) raw;
        Result r = new Result();
        r.someField = response.Code200.someField;
        return new List<Result>{ r };
    }
}
```
Then: `mcpserverdef-toolkit.mjs add-tool aa MyApiProbe --description ... --returns ... --read-only ... --destructive ... --idempotent ... --open-world ... --server <ServerName> --deploy`.

### 6.4 Full runbook

1. Create the Named Credential (§6.1 step 1).
2. Author and deploy the `Custom`-type ESR (§6.1 steps 2–3), respecting the `servers:`/`callout:`
   warning.
3. Confirm `Status: Complete`: `SELECT Status FROM ExternalServiceRegistration WHERE DeveloperName = '<Label>'`.
4. Capture the real Apex names (§6.2) — Apex Class Viewer, or the Actions REST API describe response.
5. Write and deploy a `global @InvocableMethod` class wrapping the call (§6.3).
6. Verify with a real anonymous-Apex call before wiring to MCP.
7. `mcpserverdef-toolkit.mjs add-tool aa <ClassName> ... --deploy` — see the script's known path bug
   below if run from inside the skill's own `scripts/` folder.
8. Verify with a live `tools/call`.
