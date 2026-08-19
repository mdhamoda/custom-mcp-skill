# RUNBOOK — Connect an external AI client to Salesforce MCP

Zero → an external agent (Claude / ChatGPT / Cursor / Postman / custom) calling live Salesforce
tools. **Every step below was executed successfully**; every error in Phase 8 was actually hit,
not anticipated. `<alias>` `<VER>` `<INSTANCE>` `<NAME>` are placeholders.

**Time:** ~15 min of work, plus up to 30 min waiting for ECA propagation.

```
PHASE 0  decide route + servers          PHASE 5  validate config (no browser)
PHASE 1  activate server(s)              PHASE 6  connect the client
PHASE 2  create the ECA                  PHASE 7  verify end-to-end
PHASE 3  harden policies (non-scratch)   PHASE 8  troubleshoot
PHASE 4  retrieve the consumer key       PHASE 9  teardown
```

---

## Cross-platform command forms — read before copying anything

Commands below are shown in **bash**. Every one of them is `sf` CLI or `curl` — both
cross-platform — but **shell quoting is not.** Translate before running on Windows.

### JSON on stdin (`--body -`)

```bash
# bash / zsh / Git Bash
echo '{"Active":true}' | sf api request rest "<path>" --method PATCH --body - -o <alias>
```

```powershell
# PowerShell - no echo, single-quoted string pipes directly
'{"Active":true}' | sf api request rest "<path>" --method PATCH --body - -o <alias>
```

```bat
:: cmd.exe - inline quoting is unreliable; write a file and pipe it
type body.json | sf api request rest "<path>" --method PATCH --body - -o <alias>
```

**Most portable option, works everywhere:** write the JSON to a file and pipe that file. Do
this in scripts rather than fighting per-shell quoting.

### ⚠️ `curl` in PowerShell is not curl

In Windows PowerShell, `curl` is an **alias for `Invoke-WebRequest`** — different flags,
different behaviour, and `-w`/`-o` mean something else entirely.

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" "<url>"    # force the real binary
```

Or use the native cmdlet and read `.StatusCode` / catch the exception for non-2xx.

### Other portability traps met in practice

| Trap | Detail |
|---|---|
| `2>&1` on a native exe in PowerShell | wraps stderr lines in `ErrorRecord`, sets `$?` false even on exit 0. `sf` writes warnings to stderr constantly — **don't redirect**, just parse stdout |
| Git Bash + Windows paths | an unquoted `C:\Program Files\...` fails as `'C:\Program' is not recognized`. Quote paths, or prefer forward slashes |
| SOQL quoting | `--query "SELECT ... WHERE X='y'"` — double outside, single inside. The reverse breaks in cmd |
| `sf` JSON + warnings | Node deprecation warnings can precede the JSON on stdout. Slice from the first `{` before parsing |
| Line endings | metadata XML written on Windows gets CRLF; harmless to deploy, noisy in diffs |

**None of this is MCP-specific** — it applies to any `sf`-based procedure — but it is where
copy-pasted runbooks fail on a different machine than the one they were written on.

---

## PHASE 0 — Decide before you build

**0.1 Which servers?** Least privilege by *server selection* — this is the highest-stakes
choice in the whole runbook.

| Need | Activate | Grants |
|---|---|---|
| Q&A, reports, summaries | `sobject-reads` | read only — **the default recommendation** |
| Agent writes data | `sobject-mutations` | + create/update, **no delete** |
| Data hygiene | `sobject-deletes` | + delete |
| Full CRUD | `sobject-all` | ⚠️ includes delete |
| Broad capability, small tool surface | `headless-360` | 4 meta-tools ⚠️ Beta terms |

Don't activate everything "to be safe" — the opposite is true. Clients degrade beyond a few
dozen tools, and `agentforce-grid` alone is 51.

**0.2 Which ECA route?** **Ask the user — both are valid.**

| Route | When |
|---|---|
| Metadata API deploy straight to the org | one-off, disposable/scratch org, fastest |
| Build in dev hub → package → install | shared across orgs, promoted up an environment ladder, versioned, or the org restricts metadata deploys |

**0.3 Which client?** Determines the callback URL and whether prompts work at all
(ChatGPT has no MCP prompt support; **Vibes needs no ECA** — if it's Vibes, skip Phases 2–5).

---

## PHASE 1 — Activate the server(s)

Servers ship **inactive**. Inactive servers are invisible to every API — `McpServerAccess` is
an activation ledger, not a catalog, so a fresh org returns **zero rows** while Setup lists ten.

```bash
# current state (rows exist only for servers touched at least once)
sf data query --query "SELECT Id, DeveloperName, MasterLabel, Active FROM McpServerAccess" --target-org <alias> --use-tooling-api

# activate: no row yet -> POST
echo '{"DeveloperName":"platform_sobject_reads","MasterLabel":"sobject-reads","Active":true}' | sf api request rest "/services/data/v<VER>/tooling/sobjects/McpServerAccess" --method POST --body - -o <alias>

# row exists but inactive -> PATCH
echo '{"Active":true}' | sf api request rest "/services/data/v<VER>/tooling/sobjects/McpServerAccess/<Id>" --method PATCH --body - -o <alias>
```

**Naming rule:** `DeveloperName = <namespace>_<name with - → _>`, `MasterLabel = <name>`.
So `platform.sobject-reads` → `platform_sobject_reads` / `sobject-reads`. Verified on 10/10
servers across the `platform`, `industries`, and `data` namespaces.

**Namespace not in this org?** The POST fails with
`FIELD_INTEGRITY_EXCEPTION: McpServerId is required for custom server access records`.
That is the **skip signal** — catch it, move on, and report which were skipped. `platform.*`
almost always exists; `industries.*` and `data.*` are license-gated.

⏱ **Allow ~2 minutes** for a server to become active.

---

## PHASE 2 — Create the External Client App

**Connected Apps are not supported.** ECA only. Three files, deployed **together** — the
global OAuth file alone fails.

```
<dir>/externalClientApps/<NAME>.eca-meta.xml
<dir>/extlClntAppGlobalOauthSets/<NAME>.ecaGlblOauth-meta.xml
<dir>/extlClntAppOauthSettings/<NAME>.ecaOauth-meta.xml
```

Full XML in [`eca-and-testing.md §1`](eca-and-testing.md). The three things that break deploys:

1. **Scope is `MCP`, not `mcp_api`** — `mcp_api` is what the *client* sends; metadata wants
   `MCP`. Use `MCP, RefreshToken`.
2. **Multiple callbacks go in ONE element, newline-separated.**
3. **`isNamedUserJwtEnabled` defaults `false`** though the setup guide says to enable it —
   set it explicitly.

```bash
sf project deploy start --source-dir <dir> --target-org <alias>
# expect: Succeeded 3/3
```

> Scratch orgs **can't** create an ECA in the Setup UI — but **Metadata API deploy works**.
> Verified. The "package it from your dev hub" instruction is a UI workaround, not a platform
> limit.

⏱ **Allow up to 30 minutes** for a new ECA to become operational — "similar to registering a
new domain with DNS." A failure inside that window means nothing.

---

## PHASE 3 — Harden the policies (skip for scratch/demo)

Two policy records auto-create as `<NAME>_defaultPolicy`. They work as-is, but two defaults are
looser than Salesforce's own guidance:

| Default | Risk | Fix |
|---|---|---|
| `permittedUsersPolicyType: AllSelfAuthorized` | **any org user can self-authorize** | `AdminApproved` + assign a permission set |
| `refreshTokenValidityPeriod: 365 Days` | guidance is **≤30 days** | shorten; enable rotation |

Deploy `extlClntAppOauthPolicies/<NAME>_defaultPolicy.ecaOauthPlcy-meta.xml` with the corrected
values. Leave the three flow toggles (`clientCredentials`, `guestCodeCred`, `tokenExchange`)
`false` — MCP is authorization-code only.

---

## PHASE 4 — Retrieve the consumer key

Generated server-side; you cannot set it in metadata.

```bash
sf project retrieve start --metadata ExtlClntAppGlobalOauthSettings:<NAME> -o <alias>
#  -> <consumerKey>3MVG9...</consumerKey>
```

Confirm the scopes actually landed:

```bash
sf data query --query "SELECT DeveloperName, OauthScopesMCP_API, OauthScopesREFRESH_TOKEN FROM ExtlClntAppOauthSettings" --target-org <alias> --use-tooling-api
# expect both true
```

---

## PHASE 5 — Validate the config without a browser

**Do this before involving a human.** It separates "ECA is wrong" from "nobody has consented."

Assemble the URL as one unbroken string — line continuations are shell-specific
(`\` bash · `` ` `` PowerShell · `^` cmd) and are the usual reason a pasted command fails:

```
<INSTANCE>/services/oauth2/authorize?response_type=code&client_id=<KEY>&redirect_uri=<CALLBACK>&scope=mcp_api%20refresh_token&code_challenge=<CHALLENGE>&code_challenge_method=S256
```

```bash
# macOS / Linux / Git Bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" --max-redirs 0 "<URL>"
```

```powershell
# PowerShell - curl.exe (plain `curl` is Invoke-WebRequest) and NUL, not /dev/null
curl.exe -s -o NUL -w "%{http_code} %{redirect_url}`n" --max-redirs 0 "<URL>"
```

Full detail and a pure-PowerShell variant: [`eca-and-testing.md §1.7`](eca-and-testing.md).

| Result | Meaning |
|---|---|
| **`302` → `RemoteAccessAuthorizationPage.apexp`** | ✅ ECA is correct — consent screen reached |
| `error=invalid_client_id` | wrong consumer key, or ECA still propagating |
| `error=redirect_uri_mismatch` | callback not registered on the ECA |
| `error=unsupported_scope` | scopes missing — recheck Phase 4 |

---

## PHASE 6 — Connect the client

Register the client's callback on the ECA **first**, then configure the client.

| Client | Callback to register | Prompts? |
|---|---|:-:|
| Claude | `https://claude.ai/api/mcp/auth_callback` | ✅ |
| Cursor | `http://localhost:8787/callback` | ✅ |
| ChatGPT | generated by ChatGPT — copy from Advanced settings | ❌ |
| Postman | `https://oauth.pstmn.io/v1/callback` | ✅ |
| custom script | any registered URL, e.g. `http://localhost:1717/OauthRedirect` | ✅ |

**Server URL:**
```
prod / Developer Edition   https://api.salesforce.com/platform/mcp/v1/<ns>/<server>
sandbox / scratch          https://api.salesforce.com/platform/mcp/v1/sandbox/<ns>/<server>
custom server              .../v1/custom/<name>   |   .../v1/sandbox/custom/<name>
```
Developer Edition uses the **production** form. Only sandboxes and scratch orgs take `sandbox/`.

**Claude:** Customize → Connectors → **+** → Add custom connector → server URL →
Advanced settings → **OAuth Client ID = consumer key** → Add → **Connect**.

**Before authorizing: log out of all other Salesforce orgs**, then log into the target org in
your default browser and leave it open. The MCP spec doesn't handle multitenancy; this is the
single most common auth failure. Using the org's **My Domain** URL instead of
`login/test.salesforce.com` largely avoids it.

**⚠️ One connector = one server.** To reach two servers, register two connectors — or build a
custom server that combines their tools under one URL.

---

## PHASE 7 — Verify end-to-end ⚠️ OPTIONAL — requires a human

> **This phase is optional. Ask; don't impose.** It is the **only** step needing a person, and
> it exists to *confirm* work that is already complete. Phases 1–5 stand on their own — a
> correctly activated server and a correctly deployed ECA are finished and independently
> checkable via the browser-free config check (Phase 5).
>
> **Say the org-side work is done, then ask whether they want to run the live test.** If they
> decline, close the task cleanly — an untested connection is *not* a failed one. Never leave
> a request hanging because nobody clicked Allow.
>
> Skip it when: the org is a scratch/demo org nobody will connect to · the goal was
> configuration or promotion · no MCP client is set up yet · the user says so.
> Run it when: they explicitly ask · a client is already failing · you are proving a fix.

The MCP handshake has **two requirements Salesforce does not document**:

```
1. POST initialize                → 200, response header  mcp-session-id: <uuid>
2. POST notifications/initialized → 202   (notification: NO "id" field)
3. POST tools/list                → 200
4. POST tools/call getUserInfo    → 200
```

**Every request after `initialize` must echo back `Mcp-Session-Id`.** Omit it and you get:

```json
{"error":{"code":400,"message":"Invalid JSON-RPC message: Session Key missing, but it's not an initialize request"}}
```

Send `Accept: application/json, text/event-stream`; responses may be SSE-framed (`data: {...}`).

**Success looks like:**
```
scope granted : refresh_token mcp_api
initialize    : serverInfo {"name":"sobject-all","version":"1.0.0"}
tools/list    : 11 tools
getUserInfo   : real identity JSON, isError:false
```

`getUserInfo` is the ideal probe — no parameters, no data dependency. **A new scratch org has
no Accounts**, so record-oriented prompts return nothing; that is not a connection failure.

---

## PHASE 8 — Troubleshoot (errors actually encountered)

| Symptom | Cause | Fix |
|---|---|---|
| `HTTP 401` from the MCP endpoint using an `sf` CLI token | CLI token belongs to `PlatformCLI` and has **no `mcp_api` scope** | There is **no token shortcut.** Complete the PKCE flow |
| `400 Session Key missing, but it's not an initialize request` | client dropped the session header | Echo `Mcp-Session-Id` on every post-initialize request |
| Deploy: `There's a problem with your scope(s): McpApi` | wrong scope literal | Use **`MCP`**; the error lists all valid values |
| Deploy: `The external client app configured in your global OAuth Settings doesn't have a valid OAuth settings configuration` | global OAuth file deployed **without** its OAuth settings sibling | Deploy all three files together |
| `FIELD_INTEGRITY_EXCEPTION: McpServerId is required for custom server access records` | `DeveloperName` isn't a known standard server in this org | Typo, or that namespace isn't licensed → skip it |
| Client connects but sees no tools | server not activated, or still within the ~2 min window | Check `Active`, wait, retry |
| `invalid_client_id` right after creating the ECA | still propagating | Wait up to **30 minutes** |
| Auth redirects to the wrong org | logged into several orgs | Log out of all, use the org's My Domain URL |
| Flow generation fails on a missing tool | `automation-flow-generate` needs `execute_metadata_action` — the only tool on `metadata-experts` | Activate `platform.metadata-experts` |

**Escalation packet:** server URL · sandbox-or-scratch · client name **and version** · exact
error · time **with timezone** · reproduces in Postman/MCP Inspector? · steps already tried.

---

## PHASE 9 — Teardown

```bash
# deactivate a server (row is KEPT; Active flips false)
echo '{"Active":false}' | sf api request rest "/services/data/v<VER>/tooling/sobjects/McpServerAccess/<Id>" --method PATCH --body - -o <alias>
```

`McpServerAccess` rows are also deletable. **Deleting the ECA revokes every issued token** —
destructive, confirm with the user first.

---

## 🔴 Promoting to the next environment

| Artifact | Travels with a deploy? |
|---|---|
| ECA (3 files) + policies | ✅ metadata |
| Custom server (`McpServerDefinition`) | ✅ metadata |
| **Server activation (`McpServerAccess`)** | ❌ **runtime record — does NOT travel** |

**Re-run Phase 1 in every environment.** A release validated in SIT arrives in production with
a perfectly good ECA and every server switched off — and the failure presents as an auth
problem, which sends people hunting in the wrong place. Make activation an explicit release
task.

## What is and isn't automatable

| Phase | Automatable |
|---|---|
| 1 activate · 2 ECA · 3 policies · 4 key · 5 validate | ✅ fully |
| 6 client config | partly — registration is manual per client |
| **7 first authorization** | ❌ **human + browser, ONCE** |
| 7 subsequent calls · 8 diagnostics · 9 teardown | ✅ fully (refresh token persists) |

Hosted MCP is authorization-code only: **no service accounts, no machine-to-machine flows, no
autonomous operation outside user context.** Design around that one human step rather than
looking for a way past it.
