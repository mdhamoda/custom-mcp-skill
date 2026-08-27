# ECA Creation, Testing, and Client Setup — Verified Specs

Everything here was **executed successfully** against a live Revenue Cloud org at API v67.0:
ECA deployed by Metadata API, full PKCE authorization, and live tool calls against all
activated standard servers. `[org]` = observed, not documented.

---

## 0. Metadata type map — everything an ECA can be made of `[org]`

All 13 ECA metadata types are deployable (confirmed via `sf org list metadata-types`).
**Only the first three are required**; the two policy types auto-create; the rest are for
non-MCP surfaces.

| # | Metadata type | Directory | Suffix | For MCP |
|---|---|---|---|---|
| 1 | `ExternalClientApplication` | `externalClientApps/` | `.eca-meta.xml` | ✅ **required** |
| 2 | `ExtlClntAppGlobalOauthSettings` | `extlClntAppGlobalOauthSets/` | `.ecaGlblOauth-meta.xml` | ✅ **required** |
| 3 | `ExtlClntAppOauthSettings` | `extlClntAppOauthSettings/` | `.ecaOauth-meta.xml` | ✅ **required** |
| 4 | `ExtlClntAppConfigurablePolicies` | `extlClntAppPolicies/` | `.ecaPlcy-meta.xml` | auto-created; deploy to harden |
| 5 | `ExtlClntAppOauthConfigurablePolicies` | `extlClntAppOauthPolicies/` | `.ecaOauthPlcy-meta.xml` | auto-created; deploy to harden |
| 6 | `ExtlClntAppOauthSecuritySettings` | `extlClntAppOauthSecuritySettings/` | `.ecaOauthSecurity-meta.xml` | **retrieve-only**, not auto-created |
| 7–13 | `ExtlClntAppMobileSettings` · `ExtlClntAppMobileConfigurablePolicies` · `ExtlClntAppCanvasSettings` · `ExtlClntAppSamlConfigurablePolicies` · `ExtlClntAppPushSettings` · `ExtlClntAppPushConfigurablePolicies` · `ExtlClntAppNotificationSettings` | — | — | ❌ not needed |

> ⚠️ **Suffix abbreviations are non-obvious and break deploys silently:**
> `.ecaGlblOauth` **not** `.ecaGlobalOauth` · `.ecaPlcy` **not** `.ecaPolicy` ·
> `.ecaOauthPlcy` **not** `.ecaOauthPolicy` · `.ecaOauthSecurity` **not** `.ecaSecurity`.

**Filename = API name.** `<NAME>.eca-meta.xml` defines API name `<NAME>`, and every sibling
file's `<externalClientApplication>` element must match it **exactly** — a mismatch throws
`INVALID_CROSS_REFERENCE_KEY`.

**Layout** — under your package directory (read `sfdx-project.json → packageDirectories`;
don't assume `force-app/main/default/`):

```
<packageDir>/
├── externalClientApps/            <NAME>.eca-meta.xml
├── extlClntAppGlobalOauthSets/    <NAME>.ecaGlblOauth-meta.xml
├── extlClntAppOauthSettings/      <NAME>.ecaOauth-meta.xml
├── extlClntAppPolicies/           <NAME>_defaultPolicy.ecaPlcy-meta.xml        (optional)
└── extlClntAppOauthPolicies/      <NAME>_defaultPolicy.ecaOauthPlcy-meta.xml   (optional)
```

Deploying from a scratch staging folder outside the package dir works fine:
`sf project deploy start --source-dir <dir>` resolves the type from the folder names.

## 1. ECA creation spec — the three-file bundle

> **Ask first which route the user wants** (see
> [`setup-and-custom-servers.md §1`](setup-and-custom-servers.md)): direct Metadata API deploy,
> or build-in-dev-hub → package → install. Both are valid; the packaged route is usually right
> for anything promoted through an environment ladder.

Deploy all three **together**. The global OAuth file alone fails with *"The external client app
configured in your global OAuth Settings doesn't have a valid OAuth settings configuration."*

### 1.1 `externalClientApps/<Name>.eca-meta.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExternalClientApplication xmlns="http://soap.sforce.com/2006/04/metadata">
    <contactEmail>{{ADMIN_EMAIL}}</contactEmail>
    <description>{{PURPOSE}}</description>
    <distributionState>Local</distributionState>
    <isProtected>false</isProtected>
    <label>{{DISPLAY_LABEL}}</label>
</ExternalClientApplication>
```

`distributionState`: `Local` (this org) or `Packageable` (2GP distribution).

**Full `ExternalClientApplication` field reference `[doc]`** — the minimal shape above only uses
five; the rest exist but are cosmetic/optional for an MCP-purposed ECA (none are required by any
procedure in this skill):

| Field | Type | Notes |
|---|---|---|
| `contactEmail` | string | admin contact Salesforce uses for this app |
| `contactPhone` | string | admin contact phone — not used anywhere in this skill's flows |
| `description` | string | shown in Setup |
| `distributionState` | enum | `Local` \| `Packaged` (`AutoInstalled`/`Managed` are internal-only) |
| `iconUrl` | string | Setup-display icon image URL — cosmetic |
| `infoUrl` | string | **"Reserved for future use"** per the official field reference — do not author expecting an effect |
| `isProtected` | boolean | package-visibility control; default `false` |
| `label` | string | display label |
| `logoUrl` | string | Setup-display logo image URL — cosmetic |
| `managedType` | enum | **internal use only** per the official reference — never author |
| `orgScopedExternalApp` | string | `[Org_ID]:[App_Name]` — either hand-set or auto-generated on first deploy; not something this skill's procedures need to set explicitly |

Requires the **"Opt in to External Client Apps"** permission enabled in Setup before any ECA of
this type can be created at all — a prerequisite above and beyond the three-file bundle itself.

### 1.2 `extlClntAppGlobalOauthSets/<Name>.ecaGlblOauth-meta.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtlClntAppGlobalOauthSettings xmlns="http://soap.sforce.com/2006/04/metadata">
    <callbackUrl>{{CLIENT_CALLBACK}}
http://localhost:1717/OauthRedirect</callbackUrl>
    <externalClientApplication>{{NAME}}</externalClientApplication>
    <isConsumerSecretOptional>true</isConsumerSecretOptional>
    <isIntrospectAllTokens>false</isIntrospectAllTokens>
    <isNamedUserJwtEnabled>true</isNamedUserJwtEnabled>
    <isPkceRequired>true</isPkceRequired>
    <isSecretRequiredForRefreshToken>false</isSecretRequiredForRefreshToken>
    <label>{{NAME}} OAuth</label>
    <shouldRotateConsumerKey>false</shouldRotateConsumerKey>
    <shouldRotateConsumerSecret>false</shouldRotateConsumerSecret>
</ExtlClntAppGlobalOauthSettings>
```

- **Multiple callback URLs go in ONE element, newline-separated** `[org]`. Verified working.
- 🔴 **Always include `http://localhost:1717/OauthRedirect` alongside the client's own callback(s)
  — every ECA this skill builds, by default, not just when a problem comes up.** Reasoning: it's the
  fixed redirect the harness script (`assets/scripts/pkce-mcp-test.mjs`, §2.4) listens on, and that
  script is the only way to (a) validate an ECA end-to-end without depending on a specific external
  client's own OAuth UI, and (b) give **Claude Code itself** (as opposed to claude.ai's web connector
  — see `runbook-connect-claude-code.md`) a working, scriptable connection path. Adding it costs
  nothing (unused callbacks are simply never hit) and means the harness is always available on any
  ECA this skill creates, instead of needing a follow-up deploy discovered only after a client
  integration has already failed once — which is exactly what happened before this line existed.
- `isNamedUserJwtEnabled` — **defaults `false`; the setup guide says to enable it. Set it explicitly.**
  `[org]` Verified effect (§5.2 revisits this for the self-callout case): with it `true`, the access
  token this ECA issues comes back **`token_format: "jwt"`** — a real 3-segment, decodable,
  `RS256`-signed JWT (`typ:"JWT"`, real `sub`/`iss`/`aud`/`client_id` claims) — instead of an opaque
  string. Confirmed on both a PKCE-issued token and a JWT-Bearer-issued token; it governs the
  **issued token's shape**, unrelated to which grant type produced it.
- `isConsumerSecretOptional: true` + `isPkceRequired: true` = public-client PKCE, no secret. Verified.
- 🔴 **`isPkceRequired` is platform-enforced `true` on this org — a deploy setting it `false`
  succeeds but does not stick.** `[org]`-confirmed twice: deployed `false` directly (succeeded,
  `isPkceRequired` read back `true` minutes later with no other change in between), then repeated
  the full disable-app → deploy `false` → re-enable-app sequence (succeeded at every step, same
  silent revert to `true` afterward). Whatever mechanism resets it, it isn't source-tracking
  staleness — each attempt started from a fresh `--ignore-conflicts` retrieve of the live value.
  **Practical consequence: treat `isPkceRequired: true` as a fixed platform baseline for this org,
  not a configurable toggle** — don't spend time trying to turn it off, including on an
  ECA that only ever uses JWT Bearer (§5.7 covers why the flag is inert there anyway, so this
  doesn't block anything).
- Fields the platform adds on retrieve (do not need authoring): `isClientCredentialsFlowEnabled`,
  `isCodeCredFlowEnabled`, `isDPopEnabled`, `isDeviceFlowEnabled`, `isEnforceRefreshTokenTTL`,
  `isRefreshTokenRotationEnabled`, `isTokenExchangeEnabled`, `isSecretRequiredForTokenExchange`.

### 1.3 `extlClntAppOauthSettings/<Name>.ecaOauth-meta.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtlClntAppOauthSettings xmlns="http://soap.sforce.com/2006/04/metadata">
    <commaSeparatedOauthScopes>MCP, RefreshToken</commaSeparatedOauthScopes>
    <externalClientApplication>{{NAME}}</externalClientApplication>
    <label>{{NAME}} Scopes</label>
</ExtlClntAppOauthSettings>
```

> 🔑 **The metadata scope value is `MCP` — not `mcp_api`.** `mcp_api` is the *OAuth scope string*
> a client sends; metadata wants `MCP`. Wrong values fail with the full valid list:
> `Basic, OfflineAccess, DataCloudUserClaims, Email, Address, CDPSegment, Chatbot,
> CustomApplications, Full, Profile, CDP, CDPProfile, RefreshToken, Phone, PwdlessLogin,
> Interaction, Pardot, CDPIngest, CDPIdentityResolution, CustomPermissions, ForgotPassword,
> UserRegistration, OpenID, Chatter, Wave, SFApiPlatform, SCRT, Web, EinsteinGPT, Lightning,
> Content, CDPCalculatedInsight, Eclair, Api, MCP, CDPQuery`

### 1.4 Deploy, then harvest the consumer key

```bash
sf project deploy start --source-dir <dir> --target-org <alias>
# expect: Succeeded 3/3

# consumer key is generated server-side - retrieve it
sf project retrieve start --metadata ExtlClntAppGlobalOauthSettings:<Name> -o <alias>
#   -> <consumerKey>3MVG9...</consumerKey>
```

Verify scopes actually landed:

```bash
sf data query --query "SELECT DeveloperName, OauthScopesMCP_API, OauthScopesREFRESH_TOKEN FROM ExtlClntAppOauthSettings" --target-org <alias> --use-tooling-api
```

Policies (`ExtlClntAppOauthConfigurablePolicies`, `ExtlClntAppConfigurablePolicies`) are
**auto-created** as `<Name>_defaultPolicy` — no authoring needed. `ExtlClntAppOauthSecuritySettings`
is retrieve-only and is not created by default.

### 1.5 Policies — auto-created, and the defaults are permissive `[org]`

Deploying the three-file bundle **auto-creates two policy records** named
`<Name>_defaultPolicy`. You do **not** author them to get a working app — but you should
**read them**, because two defaults are looser than Salesforce's own hardening advice.

#### `extlClntAppPolicies/<Name>_defaultPolicy.ecaPlcy-meta.xml` — app enablement

```xml
<ExtlClntAppConfigurablePolicies xmlns="http://soap.sforce.com/2006/04/metadata">
    <externalClientApplication>{{NAME}}</externalClientApplication>
    <isEnabled>true</isEnabled>
    <isOauthPluginEnabled>true</isOauthPluginEnabled>
    <label>{{NAME}}_defaultPolicy</label>
    <startPage>None</startPage>
</ExtlClntAppConfigurablePolicies>
```

> **`isOauthPluginEnabled` is the metadata equivalent of the UI's "API (Enable OAuth Settings)
> → Enable OAuth" checkbox**, and `isEnabled` turns the app on. Both default **`true`** on a
> metadata deploy — which is why no explicit "enable OAuth" step is needed via this route.
> If a deployed ECA appears dead, check these two first.

#### `extlClntAppOauthPolicies/<Name>_defaultPolicy.ecaOauthPlcy-meta.xml` — OAuth runtime policy

```xml
<ExtlClntAppOauthConfigurablePolicies xmlns="http://soap.sforce.com/2006/04/metadata">
    <externalClientApplication>{{NAME}}</externalClientApplication>
    <ipRelaxationPolicyType>Enforce</ipRelaxationPolicyType>
    <isClientCredentialsFlowEnabled>false</isClientCredentialsFlowEnabled>
    <isGuestCodeCredFlowEnabled>false</isGuestCodeCredFlowEnabled>
    <isTokenExchangeFlowEnabled>false</isTokenExchangeFlowEnabled>
    <label>{{NAME}}_defaultPolicy</label>
    <permittedUsersPolicyType>AllSelfAuthorized</permittedUsersPolicyType>
    <refreshTokenPolicyType>SpecificLifetime</refreshTokenPolicyType>
    <refreshTokenValidityPeriod>365</refreshTokenValidityPeriod>
    <refreshTokenValidityUnit>Days</refreshTokenValidityUnit>
    <requiredSessionLevel>STANDARD</requiredSessionLevel>
</ExtlClntAppOauthConfigurablePolicies>
```

| Field | Default | Meaning / hardening |
|---|---|---|
| **`permittedUsersPolicyType`** | **`AllSelfAuthorized`** | ⚠️ **Any user in the org may self-authorize.** Set **`AdminApprovedPreAuthorized`** (⚠️ not `AdminApproved` — that value is rejected by the API with `'AdminApproved' is not a valid value for the enum 'PermittedUsersPolicyType'`; confirmed `[org]` against the local Metadata API XSD) to require pre-authorization via `commaSeparatedProfile` / `commaSeparatedPermissionSet` — the documented way to restrict who can connect. Required (not optional) for any flow with no human in the loop to click Allow, e.g. JWT Bearer — see §5 |
| **`refreshTokenValidityPeriod`** | **`365` Days** | ⚠️ Salesforce's own production guidance is **≤30 days**. The default is **12× that.** Shorten for anything beyond a scratch org |
| `refreshTokenPolicyType` | `SpecificLifetime` | alternatives include immediate expiry / expire-on-inactivity |
| `ipRelaxationPolicyType` | `Enforce` | IP restrictions enforced (not relaxed) — good default |
| `requiredSessionLevel` | `STANDARD` | raise to high-assurance to force MFA-backed sessions |
| `isClientCredentialsFlowEnabled` · `isGuestCodeCredFlowEnabled` · `isTokenExchangeFlowEnabled` | all `false` | **Correct for MCP** — hosted MCP is authorization-code only. Leave off |

**Hardening a non-scratch ECA** means deploying these two files with
`permittedUsersPolicyType: AdminApproved` and a shorter refresh-token lifetime, alongside the
other three.

### 1.6 End-to-end sequence — what actually has to happen

```
ORG SIDE
 1. Activate the server(s)          McpServerAccess.Active = true      [automatable]
 2. Create the ECA                  3 metadata files, scope MCP+RefreshToken  [automatable]
 3. (harden) deploy policies        AdminApproved + shorter token TTL  [automatable]
 4. Retrieve the consumer key       from ExtlClntAppGlobalOauthSettings [automatable]
      ...wait: server ~2 min, ECA up to 30 min

CLIENT SIDE
 5. Register the client's callback  in the ECA (per-client URL)
 6. Configure the client            server URL + consumer key
 7. Authorize                       browser OAuth, named human        [NOT automatable, once]

VERIFY
 8. authorize-URL curl              302 to consent page = ECA valid
 9. initialize / tools/list         handshake + inventory
10. tools/call getUserInfo          real data returned
```

Steps 1–4 and 8–10 can be scripted. **Only step 7 needs a person, and only once** — a refresh
token persists afterwards.

### 1.7 Non-interactive config check — no browser needed `[org]`

`GET` the authorize URL and read the response:

Build the URL as one unbroken string (no line continuations — they are shell-specific):

```
<INSTANCE>/services/oauth2/authorize?response_type=code&client_id=<KEY>&redirect_uri=<CB>&scope=mcp_api%20refresh_token&code_challenge=<C>&code_challenge_method=S256
```

```bash
# macOS / Linux / Git Bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" --max-redirs 0 "<URL>"
```

```powershell
# PowerShell - curl is an ALIAS for Invoke-WebRequest; call curl.exe, and NUL not /dev/null
curl.exe -s -o NUL -w "%{http_code} %{redirect_url}`n" --max-redirs 0 "<URL>"
```

```bat
:: cmd.exe
curl -s -o NUL -w "%%{http_code} %%{redirect_url}" --max-redirs 0 "<URL>"
```

Pure-PowerShell alternative (no curl at all):

```powershell
try { (Invoke-WebRequest "<URL>" -MaximumRedirection 0 -UseBasicParsing).StatusCode }
catch { $_.Exception.Response.StatusCode.value__; $_.Exception.Response.Headers['Location'] }
```

- **`302` → `RemoteAccessAuthorizationPage.apexp`** = ECA is correct; consent screen reached.
- Any `error=invalid_client_id` / `redirect_uri_mismatch` / `unsupported_scope` = config fault.

**Use this before blaming the ECA.** It isolates configuration from consent in one call.

---

## 2. Testing spec

### 2.1 ⚠️ The MCP handshake — undocumented by Salesforce, required `[org]`

```
1. POST initialize                  -> 200; response header  mcp-session-id: <uuid>
2. POST notifications/initialized   -> 202   (a notification: NO "id" field)
3. POST tools/list                  -> 200
4. POST tools/call                  -> 200
```

**Every request after `initialize` must echo the `Mcp-Session-Id` header.** Omitting it:

```json
{"error":{"code":400,"message":"Invalid JSON-RPC message: Session Key missing, but it's not an initialize request"}}
```

Step 2 is a JSON-RPC **notification** — omit `id` entirely, expect `202` with no body.

Send `Accept: application/json, text/event-stream`; responses may arrive SSE-framed
(`data: {...}`), so strip the prefix before parsing.

### 2.2 Auth ladder — three cumulative requirements

| # | Requirement | Automatable? |
|---|---|---|
| 1 | Server activated (`McpServerAccess.Active = true`) | ✅ fully |
| 2 | ECA with `MCP` + `RefreshToken` scopes | ✅ fully (Metadata API) |
| 3 | **Interactive browser consent by a named human** | ❌ **once**, then a refresh token persists |

The `sf` CLI token **cannot** substitute — it belongs to `PlatformCLI` and has no `mcp_api`
scope. Verified: hosted MCP returns **401**. After the one-time consent, subsequent runs are
fully headless.

### 2.3 Smoke-test sequence

```
1. curl the authorize URL          -> 302 to consent page       (ECA valid)
2. complete PKCE once in a browser -> token, scope "refresh_token mcp_api"
3. initialize                      -> 200, serverInfo.name matches the server
4. tools/list                      -> tool count matches expectation
5. tools/call getUserInfo          -> real identity JSON, isError:false
```

`getUserInfo` is the ideal probe — no parameters, no data dependency, works on an empty org.

> A brand-new scratch org has **no Accounts**, so record-oriented prompts return nothing. That
> is not a connection failure. Use `getUserInfo` to prove the link.

### 2.4 Reusable harnesses

`tmp/pkce-mcp-test2.mjs` — PKCE → token (persisted to `mcp-token.json`) → handshake →
`tools/list` → `tools/call`. Reuses a saved token on later runs; **no re-consent**.

`tmp/mcp-all-servers.mjs` — drives every activated server with one token and prints a
tool/prompt inventory plus a match table against expected counts.

> 🔐 The persisted token file holds **live access + refresh tokens**. Gitignored, but real
> credentials — delete it when finished.

🔴 **Refresh-token rotation footgun — `[org]`-hit this session.** The default ECA policy
(`isRefreshTokenRotationEnabled: true`, §1.5) means **every** redemption of a refresh token issues a
**new** one and invalidates the old — so the saved token file is only ever valid if *every* script
that touches it writes the rotated refresh token straight back. Hand-rolling a quick one-off script
mid-test-session to redeem the same saved token (e.g. to inspect a schema, or just to poke the org)
and NOT persisting what comes back silently orphans the real harness's saved token — the next harness
run fails to refresh and falls back to a full re-authorization, burning the "only once" browser click
for no functional reason. **Keep and reuse one single script/token file for an entire test session
until testing is complete** — don't write parallel throwaway scripts that redeem the same refresh
token without saving its rotated replacement. If you need a quick one-off check, run it through the
harness script itself (or extend it), not a separate hand-written redemption.

---

## 3. Client setup

### 3.1 Capability matrix

| Client | Tools | **Prompts** | ECA needed | Callback to register |
|---|:-:|:-:|:-:|---|
| **Claude** | ✅ | ✅ | yes | `https://claude.ai/api/mcp/auth_callback` |
| **Cursor** | ✅ | ✅ | yes | `http://localhost:8787/callback` (older: `cursor://anysphere.cursor-mcp/oauth/callback`) |
| **ChatGPT** | ✅ | ❌ | yes | generated by ChatGPT — copy from its Advanced settings |
| **Postman** | ✅ | ✅ | yes | `https://oauth.pstmn.io/v1/callback` (web: `/v1/browser-callback`) |
| **Vibes** | ✅ | ? | **no** | n/a |
| Custom script | ✅ | ✅ | yes | any registered URL (e.g. `http://localhost:1717/OauthRedirect`) |

**ChatGPT cannot surface MCP prompts** — don't design a prompt-template workflow for it.
**Vibes needs no ECA**, which matters most in scratch orgs.

### 3.2 One connector = one server ⚠️

A client connection targets **one server URL**. To give one agent SObject reads *and* Tableau
analytics, either register **two connectors**, or build a **custom server** combining both
tools under a single `custom/` URL. This is the practical reason custom servers exist.

### 3.3 URL grammar

```
production/dev-edition, standard   .../mcp/v1/<ns>/<server>
sandbox or scratch,     standard   .../mcp/v1/sandbox/<ns>/<server>
production/dev-edition, custom     .../mcp/v1/custom/<server>
sandbox or scratch,     custom     .../mcp/v1/sandbox/custom/<server>
```

Base `https://api.salesforce.com/platform/mcp/v1/`. **Developer Edition uses the production
form** — only sandboxes and scratch orgs take `sandbox/`. Data 360 documents an exception
(`/v1/data/sandbox/data360`).

### 3.4 Claude — concrete steps

1. Register `https://claude.ai/api/mcp/auth_callback` in the ECA
2. Log out of all other Salesforce orgs; log into the target org in your default browser
3. claude.ai → **Customize → Connectors → + → Add custom connector**
4. Server URL per §3.3
5. **Advanced settings → OAuth Client ID** = the ECA consumer key → **Add**
6. **Connect** → authorize → optionally **Configure** per-tool permissions
7. Test: *"tell me some basic information about the {account} account"*

### 3.5 Postman OAuth values that catch people out

Auth/token URLs are **`test.salesforce.com`** for sandbox **and scratch** orgs
(`login.salesforce.com` for production). Grant type **Authorization Code (With PKCE)**,
challenge **SHA-256**, **client secret blank**, scope **`mcp_api refresh_token`**
(space-separated), client auth **send credentials in body**.

---

## 4. Operations — promotion, teardown, access

### 4.1 🔴 Activation does NOT promote between orgs `[org]`

| Artifact | Type | Moves with a deploy? |
|---|---|---|
| External Client App (3 files) | **metadata** | ✅ yes |
| Custom server (`McpServerDefinition`) | **metadata** | ✅ yes |
| **Server activation (`McpServerAccess`)** | **runtime record** | ❌ **NO** |

**Every org needs its own activation step.** A release validated in a sandbox arrives in
production with the ECA present and **every server switched off** — clients fail to connect
with correct credentials. Make activation an explicit, per-org release task, not an assumed
side effect of deployment.

### 4.2 Teardown

```bash
# deactivate (row is KEPT, Active flips false)
echo '{"Active":false}' | sf api request rest "/services/data/v<VER>/tooling/sobjects/McpServerAccess/<Id>" --method PATCH --body - -o <alias>
```

`McpServerAccess` is also `deletable=true` if a row must be removed outright. Removing the ECA
is a destructive metadata delete — **revokes every issued token**; confirm with the user first.

### 4.3 Who can connect

- By default **any user in the org** can authenticate through the ECA. Restrict via **OAuth
  Policies → permission-set pre-authorization**.
- Tools run as the authenticated user — CRUD/FLS/sharing apply. An over-broad server is still
  bounded by permissions, but the reachable surface is wider than needed.
- Users also need object access to `McpServerAccess` / `McpServerDefinition` to administer.
  Some Revenue Cloud permission sets already grant this.

### 4.4 Consumption

- **Data 360** — MCP calls count against the underlying Connect API limits **and Flex Credits**.
- **Prompt Builder templates** — consume credits per invocation, same as from the UI.
- **Context cost** — clients degrade "beyond a few dozen tools"; `agentforce-grid` alone is 51.

### 4.5 Audit

- Activation writes **nothing** to `SetupAuditTrail` `[org]`.
- Runtime traffic **is** auditable: filter API logs for
  **`APICLIENTCATEGORY = SALESFORCE_HOSTED_MCP`** — per-user operations, objects, timestamps.

## 5. JWT Bearer Flow — authenticating an `aa:` tool's OWN outbound callout `[org]`

Different problem from §1–4 above. Those sections are about a human/client authenticating **to**
a hosted MCP server. This section is about an **Apex-backed `aa:` tool that itself needs to make
an authenticated HTTP callout back into the org** (e.g. a generic "call any REST/Connect API"
action) while running **inside an MCP `tools/call` invocation**. Org-verified end to end this
session, after an extended, multi-day investigation — every dead end below is real and is kept
deliberately, not trimmed, per this skill's own rule to capture findings whether or not they
worked.

### 5.1 `UserInfo.getSessionId()` does not work here — confirmed three independent ways

The obvious approach — mint the outbound `Authorization: Bearer` header from
`UserInfo.getSessionId()` — **throws inside an MCP-invoked `aa:` tool**, even though the exact
same code works fine from anonymous Apex or a `sf` CLI-authenticated session. `RestContext.request`
is also `null` in this context — there is no inbound session to read a token from at all. This was
confirmed three ways before being accepted as a hard platform limitation, not a code bug: a real
tool call through `tools/call`, a purpose-built diagnostic class isolating just the
`getSessionId()` call, and a side-by-side comparison calling the identical endpoint with the `sf`
CLI's own session token (which succeeds). **Root cause, stated as the general rule**: session ID
is a **UI/browser-session-scoped artifact** — it only exists for auth mechanisms that create a
session (a logged-in UI session, `sf`'s own CLI session). `UserInfo.getUserId()`/`getUsername()`
are different: they're properties of the **resolved running user**, available in any Apex
execution context regardless of what authenticated it — an MCP `tools/call`'s `mcp_api`-scoped
OAuth token resolves a running user just fine (proof: `RepDailySummaryService.cls`'s
`UserInfo.getUserId()` works correctly when called via MCP), it just never had a session to hand
back through `getSessionId()`. Don't reach for session ID as a generic "who is this and can I
prove it" credential — it's narrower than that.

**Do not "fix" this by accepting a caller-supplied bearer token as a tool input.** It's
mechanically easy and was tested working, but it's a real anti-pattern: no genuine external MCP
client can supply one (only a side-channel-authenticated test harness can), and accepting an
arbitrary caller-supplied credential defeats the point of the tool authenticating anything.

#### 5.1a `try/catch` does NOT stop this — and fixing one class doesn't fix its siblings `[org]`

Two more real classes hit the identical bug after `InvokeSalesforceApiAction` was
already fixed — both made their OWN internal HTTP callout (a live-schema reflection call, a
Connect API product-detail call) authenticated the same broken way, and neither had been
touched during the original fix because the original investigation was scoped to one class, not
"grep the codebase for every other `UserInfo.getSessionId()` call." Two findings, both
`[org]`-reconfirmed by fixing these two real classes:

1. **The failure is uncatchable, not just untried.** Both classes already wrapped the
   `getSessionId()`-authenticated callout in a `try/catch` — the kind of defensive code that
   would normally turn a thrown exception into a graceful `isSuccess: false` response. It didn't.
   The exception still surfaced to the MCP caller as an **uncaught** `UNKNOWN_EXCEPTION` /
   `System.UnexpectedException: Script-thrown exception`, exactly as if no try/catch were present
   at all. This matches (and re-confirms) the "uncatchable exception" finding from the original
   `AuthDiagnostic` investigation in §5.1 above — don't expect a try/catch to contain this.
2. **Schema/registration verification is not the same as invocation verification.** Both broken
   classes had already passed `tools/list` checks and even a Setup UI schema-panel check (§8's
   `global`-vs-`public` finding) — neither of those exercises the runtime callout path where
   `getSessionId()` actually gets called. The bug was only caught by a real `tools/call`
   invocation, in production-like use, after the fix to the *other* class had already shipped and
   been declared done. **Checklist for any future JWT Bearer migration in this pattern**: (a)
   `grep -rn "getSessionId" force-app/main/default/classes/` across the WHOLE project, not just
   the class under active investigation — every match making its own callout needs the same fix;
   (b) verify with a genuine `tools/call` for every affected tool individually, not just a
   `tools/list` schema check, before declaring the migration complete.

**Performance note for a fix that calls out in a loop**: if the broken class makes multiple
callouts per invocation (e.g. `BizApiCatalogService` looping over ~44 curated action names), mint
the JWT Bearer access token **once per invocation and reuse it**, not once per callout — minting
per-callout multiplies the transaction's callout count by roughly 2x for no benefit and risks the
100-callouts-per-transaction governor limit.

### 5.2 What doesn't work: the declarative `ExternalCredential` JWT route

The newer, declarative Named Credential model (`ExternalCredential` + `NamedCredential` of type
`SecuredEndpoint`) looks like the right tool — `ExternalCredential.authenticationProtocol` even
has a `Jwt` enum value, with `PerUserPrincipal` / `SigningCertificate` / `JwtBodyClaim` parameter
types that look purpose-built for exactly this. **It is not usable today**: Salesforce's own
Metadata API Developer Guide documents `authenticationProtocol: Jwt` as **"Reserved for future
use."** Confirmed directly from the official field reference, not inferred from a failure — don't
attempt this route, and don't let a plausible-looking enum value suggest otherwise.

A related, easy-to-get-wrong field along the way: **`isNamedUserJwtEnabled`** (on both
`ExtlClntAppGlobalOauthSettings` and `ExtlClntAppOauthConfigurablePolicies`) sounds like it toggles
JWT Bearer *inbound* support, but it does not — it governs whether **issued access tokens** come
back JWT-formatted instead of opaque. It has no bearing on whether an ECA can *accept* an inbound
JWT bearer assertion. Confirmed from the official field description; don't set this expecting it
to enable JWT Bearer.

Also encountered and abandoned along the way: `PermissionSetExternalCredentialPrincipalAccess`
schema guesses from web search were all wrong four times in a row (`externalCredentialName` /
`principalName` / `accessLevel` do not exist on this type). The real shape, found only via the
local, authoritative Metadata API XSD (`salesforce_metadata_api_common.xsd`, shipped with the
VS Code Salesforce extension) is `enabled` (boolean) + `externalCredentialPrincipal` (one string,
format `CredentialName-PrincipalName`). Moot once the `ExternalCredential` route was abandoned,
but recorded because it cost real time and the local XSD is a better source than web search for
exact field shapes generally — reach for it before searching.

### 5.3 What works: hand-rolled JWT Bearer via `Auth.JWT` / `Auth.JWS` / `Auth.JWTBearerTokenExchange`

Apex ships native classes for this exact flow — build, sign, and exchange a JWT entirely inside
Apex, no declarative Named Credential involved:

```apex
public with sharing class JwtAuthHelper {
    public class Claim {
        public String iss;   // ECA consumer key
        public String sub;   // target username -- set dynamically, NOT a fixed service account
        public String aud;   // https://login.salesforce.com (prod/DE) or https://test.salesforce.com (sandbox/scratch)
        public Integer exp;
        public String kid;
    }
    public static String getAccessToken(Claim claim, String certificateName, String tokenEndpoint) {
        Auth.JWT jwt = new Auth.JWT();
        jwt.setSub(claim.sub);
        jwt.setAud(claim.aud);
        jwt.setIss(claim.iss);
        Map<String, Object> additionalClaims = new Map<String, Object>();
        if (claim.kid != null) { additionalClaims.put('kid', claim.kid); }
        if (claim.exp != null) { additionalClaims.put('exp', claim.exp); }
        jwt.setAdditionalClaims(additionalClaims);
        Auth.JWS jws = new Auth.JWS(jwt, certificateName);
        Auth.JWTBearerTokenExchange bearer = new Auth.JWTBearerTokenExchange(tokenEndpoint, jws);
        return bearer.getAccessToken();
    }
}
```

Setting `claim.sub = UserInfo.getUsername()` (not a hardcoded service account) is what makes the
resulting access token — and therefore the outbound callout's CRUD/FLS/sharing — reflect the
**actual calling rep**, not one fixed identity. This is the key property that ruled out a simpler
Client-Credentials-flow ECA (which would always run as one fixed user).

⚠️ **`Crypto.signWithCertificate(...)`, not `Crypto.sign(...)`** — the latter doesn't exist
(`Method does not exist: void sign(String, Blob, String) from System.Crypto`); `Auth.JWS`'s
constructor calls the correct one internally, so this only bites if signing is done manually.

**`tokenEndpoint` should be the org's own domain** (`URL.getOrgDomainUrl() + '/services/oauth2/token'`),
not a literal `https://test.salesforce.com` URL — the latter is the correct value for the `aud`
*claim*, but using it as the actual callout *endpoint* throws `Unauthorized endpoint... Remote site
settings` (it's not this org's domain, so no implicit Remote Site Setting covers it). Keep the two
uses of the login-domain string separate: `aud` claim vs. token endpoint URL.

### 5.4 The certificate gotcha that caused most of the debugging time

**The single biggest time sink**: a `Certificate` metadata component deployed with just a public
`.crt` file does **NOT** use that uploaded certificate's key material for Salesforce's own internal
signing. Salesforce silently **auto-generates its own separate internal certificate/key pair** for
that `Certificate` record (subject `CN=<name>, OU=<orgId>, O=Salesforce.com, L=San Francisco`) and
signs with that — not with the cert whose `.crt` was uploaded. The externally-uploaded cert and the
internally-used signing cert are **two different certificates that happen to share a developer
name.**

Symptom: pasting the *originally-uploaded* `.crt` content into the ECA's
`ExtlClntAppGlobalOauthSettings.certificate` field (the field the JWT's signature is verified
against) produces `invalid_client: invalid client credentials` — a signature-mismatch error,
misleadingly generic. It looks like a wrong-consumer-key or wrong-cert-reference problem; it is
neither. Ruled out execution context (anonymous Apex vs. compiled class), additional JWT claims,
and Apex-SDK-level explanations via three independent isolated tests (including a raw `curl`
completely outside Apex) before the actual cause was found.

**Fix**: retrieve the certificate Salesforce is *actually* using for that developer name, and use
**that** PEM content in the ECA's `certificate` field:

```bash
sf project retrieve start --metadata "Certificate:<DeveloperName>" -o <alias>
```

Then read the `.crt` file that comes back (NOT the one originally deployed) and paste **that** PEM
body into `ExtlClntAppGlobalOauthSettings.certificate`. This single fix turned every `invalid_client`
attempt into a validating signature — the very next error (§5.5) was real forward progress, not
another symptom of the same bug.

### 5.5 The two remaining errors, in the order they actually appear, and their fixes

Once the certificate is correct, two more errors are expected, in this order — both are
pre-authorization/scope configuration, not signature problems:

1. **`invalid_grant: "user hasn't approved this consumer"`** — happens under the ECA default
   `permittedUsersPolicyType: AllSelfAuthorized`. Self-authorize mode needs a **prior interactive
   approval** to already exist for that user/app pair; JWT Bearer has no human in the loop to
   produce one, so this mode can never succeed for a pure server-to-server flow. **Fix**: set
   `permittedUsersPolicyType: AdminApprovedPreAuthorized` and pre-authorize via
   `commaSeparatedProfile` and/or `commaSeparatedPermissionSet` in
   `ExtlClntAppOauthConfigurablePolicies` — see the corrected §1.5 table entry above. Add every
   profile that a calling user might run under, not just the admin's own — an org typically has an
   internal service/integration user profile distinct from `System Administrator` (e.g. an
   `Internal_User`-type profile backing a "Sales Rep" service account); find it with
   `SELECT Username, Name, Profile.Name FROM User WHERE IsActive = true` rather than guessing a
   profile name, since standard-sounding names like "Sales Rep" are rarely real profile names.

2. **`invalid_request: "refresh_token scope is required and the connected app should be installed
   and preauthorized."`** — happens even with `AdminApprovedPreAuthorized` correctly set, if the
   ECA's `ExtlClntAppOauthSettings.commaSeparatedOauthScopes` is just `Api`. **Fix**: add
   `RefreshToken` to the scope list (`Api, RefreshToken`) — required even though this flow never
   actually uses a refresh token (JWT Bearer re-mints a fresh assertion every call instead of
   refreshing), apparently as a platform-side precondition of the pre-authorization mechanism
   itself.

After both fixes, `POST /services/oauth2/token` with `grant_type=urn:ietf:params:oauth:grant-
type:jwt-bearer` returns a real `access_token` — confirmed via raw `curl`, via a compiled Apex
class, and via the actual tool through a genuine MCP `tools/call` round-trip (§2.1's handshake),
all three giving `isSuccess: true` end to end.

### 5.6 Bundle shape — five files, not three

This ECA needs **all five** ExtlClntApp* files (vs. the three-file bundle in §1 for a
human-consent, MCP-client-facing ECA) — the two extra are the policy files, which for THIS use
case are not optional defaults to leave alone (per §1.5's "you do not need to author them"), they
are required, non-default settings:

```text
externalClientApps/         <Name>.eca-meta.xml
extlClntAppGlobalOauthSets/  <Name>.ecaGlblOauth-meta.xml   -- certificate = the RETRIEVED cert (§5.4), not the uploaded one
extlClntAppOauthSettings/    <Name>.ecaOauth-meta.xml       -- scopes = Api, RefreshToken (§5.5)
extlClntAppOauthPolicies/    <Name>_defaultPolicy.ecaOauthPlcy-meta.xml  -- AdminApprovedPreAuthorized + profiles (§5.5)
extlClntAppPolicies/         <Name>_defaultPolicy.ecaPlcy-meta.xml       -- app enablement (defaults are fine, §1.5)
```

No `callbackUrl` browser round-trip ever happens for JWT Bearer itself (unlike §1's PKCE flow) —
the field is still structurally required on `ExtlClntAppGlobalOauthSettings`, a placeholder value
is fine.

**Working assets shipped alongside this skill**, proven via the full chain above (raw curl → Apex
class → real MCP `tools/call`), not before: `assets/eca/jwt-bearer-self-callout/` (the five-file
ECA bundle, placeholder-named) and `assets/mcp-server/classes/JwtAuthHelper.cls` +
`InvokeSalesforceApiAction.cls` (the updated tool, no more `getSessionId()`).

### 5.7 `isPkceRequired` and `isNamedUserJwtEnabled` on a JWT-Bearer-only ECA `[org]`

Two fields on `ExtlClntAppGlobalOauthSettings` are easy to assume matter here, in opposite
directions — one genuinely doesn't, one genuinely does, confirmed by manually reconstructing the
token request byte-for-byte (bypassing `Auth.JWTBearerTokenExchange` entirely) rather than trusting
the SDK's black box.

**`isPkceRequired` is inert for this grant type, regardless of its value.** JWT Bearer never sends
a request to `/oauth2/authorize` at all — the manually-built request that proved this was a single
`POST /oauth2/token` with exactly two form parameters, `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`
and `assertion=<signed JWT>`. No `client_id`, `redirect_uri`, or `code_verifier` anywhere. PKCE's
rules simply have no code path to apply to here. This held true — self-callout kept succeeding —
whether the field read `true` or the (unsuccessful) `false` deploy attempt from §1.2's finding.
Leave it alone; it isn't worth fighting the platform over on this ECA.

**`isNamedUserJwtEnabled` genuinely changes this ECA's own behavior:** the token this ECA issues
(from the JWT Bearer exchange itself) becomes a real, decodable JWT — `token_format: "jwt"` in the
raw token response, `alg: RS256`, a real `sub`/`iss`/`aud`/`client_id` payload — instead of an
opaque string. Confirmed by decoding the actual `access_token` returned from a manually-built raw
request, not by reading the field's description.

**No separate "Enable JWT Bearer Flow" field exists anywhere in this schema.** Checked exhaustively
across every ECA-related object this org exposes — `ExtlClntAppGlobalOauthSettings`,
`ExtlClntAppOauthSettings` (scopes only), `ExtlClntAppOauthConfigurablePolicies` (flow-enablement
fields present: `IsClientCredentialsFlowEnabled`, `IsGuestCodeCredFlowEnabled`,
`IsTokenExchangeFlowEnabled` — no JWT-Bearer equivalent), `ExtlClntAppConfigurablePolicies` (app
enablement only), and `ExtlClntAppOauthSecuritySettings` (no record exists for either ECA this
skill tested against — retrieve returns "cannot be found", matching §0's "retrieve-only, not
auto-created" note). A Setup page section labeled "Enable JWT Bearer Flow" almost certainly renders
`isNamedUserJwtEnabled` under a different heading than its own field description uses — Setup has
already done this once in this same investigation (§ above). JWT Bearer *inbound* support itself
needs no toggle at all: it's available to any ECA that's `IsEnabled`, correctly scoped
(`Api, RefreshToken`), and pre-authorized (§5.5) — there's nothing further to switch on.
