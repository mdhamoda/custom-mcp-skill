# Connecting Clients, Testing, and Troubleshooting

`[doc]` developer.salesforce.com → Platform → Hosted MCP Servers → Overview, Connect MCP
Clients, Test MCP Clients, Troubleshooting. Companion to
[`standard-servers.md`](standard-servers.md) and
[`setup-and-custom-servers.md`](setup-and-custom-servers.md).

---

## 1. Server URL — the complete grammar ✅

The troubleshooting page gives all four forms, including the previously unknown **custom**
namespace:

| Org type | Server type | URL |
|---|---|---|
| Production / Developer / Enterprise | standard | `…/mcp/v1/platform/sobject-all` |
| **Sandbox or scratch** | standard | `…/mcp/v1/sandbox/platform/sobject-all` |
| Production / Developer / Enterprise | **custom** | `…/mcp/v1/custom/myserver` |
| **Sandbox or scratch** | **custom** | `…/mcp/v1/sandbox/custom/myserver` |

Base: `https://api.salesforce.com/platform/mcp/v1/`

**Custom servers live under a `custom/` namespace** — they are not addressed by the
namespace of the tools they compose. Note also that a **Developer Edition org uses the
production form**, not the sandbox form; only sandboxes and scratch orgs take `sandbox/`.

> Data 360 remains the documented exception (`…/v1/data/sandbox/data360`). Use the
> per-server documented URL when one exists.

---

## 2. ⚠️ The ECA requirement has an exception — Vibes

> *"If you are using **Vibes** as your MCP client, an external client app is **not**
> required."*

This partially relieves the scratch-org blocker in
[`setup-and-custom-servers.md §1`](setup-and-custom-servers.md): scratch orgs can't create an
ECA through the Setup UI, but a client that needs no ECA sidesteps that. **Before telling a
user their scratch org can't connect, ask which client they're using.**

---

## 2b. 🔴 You cannot shortcut the ECA with a CLI access token `[org]`

**Tested and rejected.** With all 10 standard servers **confirmed Active** (UI + API), a direct
JSON-RPC `initialize` POST to
`https://api.salesforce.com/platform/mcp/v1/sandbox/platform/sobject-all`
carrying the **`sf` CLI's own org access token** as `Bearer` returns:

```
HTTP 401
```

The CLI token is issued to the `PlatformCLI` connected app and does **not** carry the
**`mcp_api`** scope, so the hosted MCP gateway rejects it. Server activation state is
irrelevant to this — the request never gets that far.

**Consequence:** there is **no headless path** to a hosted MCP server. Not via `sf`, not via
a script, not via a stored token. The documented model is explicit — *authorization code flow
only, PKCE mandatory, no service accounts, no machine-to-machine flows, no autonomous
operation outside user context.* An agent or CI job **cannot** self-serve a connection.

Do not attempt or promise a token-based shortcut. The three requirements are cumulative:

1. an **External Client App** with `mcp_api` + `refresh_token`
   (**not creatable in a scratch org via Setup UI** — package it from the dev hub), **and**
2. an **interactive browser OAuth** authorization by a named human, **and**
3. the **server activated** (`McpServerAccess.Active = true`)

Activation alone — the part that *is* automatable — delivers none of the connectivity.

## 3. Client configuration

### Claude

1. Left sidebar → **Customize** → **Connectors** → **+** → **Add custom connector**
2. Name (+ optional description)
3. **Server URL** per §1
4. **Advanced settings** → **OAuth Client ID** = the ECA consumer key → **Add**
5. **Connect** → redirects to the org holding the ECA; if already logged in the challenge is
   skipped
6. Optional: **Configure** → per-tool permission settings

Callback URL to register in the ECA: `https://claude.ai/api/mcp/auth_callback`

### Postman — the fullest OAuth reference

New request → click the icon beside *Untitled Request* → **MCP** → switch **STDIO → HTTP** →
paste the server URL. Then **Authorization** tab:

| Field | Value |
|---|---|
| Auth Type | OAuth 2.0 |
| Add authorization data to | **Request Headers** |
| Header Prefix | `Bearer` |
| Grant Type | **Authorization Code (With PKCE)** |
| Callback URL | `https://oauth.pstmn.io/v1/callback` (desktop) · `…/v1/browser-callback` (web) — must match the ECA |
| Authorize using browser | ✅ checked |
| **Auth URL** | `https://login.salesforce.com/services/oauth2/authorize` (prod) · **`https://test.salesforce.com/services/oauth2/authorize`** (sandbox/scratch) |
| **Access Token URL** | `https://login.salesforce.com/services/oauth2/token` · **`https://test.salesforce.com/services/oauth2/token`** |
| Client ID | ECA consumer key |
| **Client Secret** | **blank** — PKCE removes the need |
| Code Challenge Method | **SHA-256** |
| Code Verifier | blank (auto) |
| **Scope** | `mcp_api refresh_token` (space-separated) |
| State | blank |
| Client Authentication | **Send client credentials in body** |

→ **Get New Access Token** (allow pop-ups) → **Use Token**.

> **`test.salesforce.com` for scratch orgs** — an easy and common misconfiguration.

### ChatGPT

**Settings → Apps → Create App** → name → server URL → **Authentication → Advanced settings**
→ Registration Method = **User-defined OAuth client** → OAuth Client ID = consumer key.
Copy ChatGPT's **Callback URL** from Advanced settings and register *that* in the ECA
(the one URL you can't know in advance). In chat, explicitly select Salesforce under **+**.

### Cursor

Callback: `http://localhost:8787/callback`; older builds use
`cursor://anysphere.cursor-mcp/oauth/callback`. Register **both** if the ECA allows multiple.

---

## 4. Prompt templates — the "2 prompts" on SObject All ✅

`[org]` The org shows **SObject All: 11 tools, 2 prompts**. These are those two, and they
ship with `platform/sobject-all`:

| Template | API name |
|---|---|
| Create Executive Briefing for Account Review Meeting | `einstein_gpt__accountReviewBriefing` |
| **Revenue Reconciliation Analysis** | `einstein_gpt__revenueReconciliationAnalysis` |

Requires **Prompt Builder enabled**. In Claude: **+** in chat → *Add from &lt;connector&gt;* →
select the template → supply the input (e.g. account name) → **Add Prompt**.

> **Revenue relevance:** `revenueReconciliationAnalysis` — "finds discrepancies between
> financial accounting records and closed deals" — is the only standard MCP asset with a
> revenue-shaped purpose. Worth flagging in Revenue Cloud conversations, though it is a
> Prompt Builder template over standard CRM data, not a Revenue Cloud feature.

---

## 5. Testing

**Simplest smoke test — a tool with no parameters:**

```json
{ "method": "tools/call", "params": { "name": "getUserInfo", "arguments": {} } }
```

**With parameters:**

```json
{ "method": "tools/call",
  "params": { "name": "soqlQuery",
              "arguments": { "query": "SELECT Id, Name FROM Account WHERE Name = 'Acme'" } } }
```

Natural-language smoke test for any SObject server:
`tell me some basic information about the {ACCOUNT NAME} account`

> **The MCP server is deterministic — no LLM is involved in tool calls.** Calling a tool in
> Postman is a direct API call returning a structured response. Any "intelligence" lives in
> the client. Useful when diagnosing whether odd behaviour is the server or the model.

---

## 6. Troubleshooting

### Connection failures

1. **Verify the URL** against the §1 grammar — wrong `sandbox/` placement is the usual cause
2. **Confirm the server is activated** (off by default; up to 2 min to take effect)
3. **Test `sobject-all`** — if it works, the original server name/config is wrong; if it also
   fails, the problem is org- or client-level
4. **Check org API eligibility** — Developer/Enterprise, or Professional **with API access enabled**
5. **Isolate locally** — can you log into Salesforce from the same machine/network? Retry in
   **Postman or MCP Inspector**

### Authentication failures

1. ECA config must match the requirements exactly
2. **Vibes needs no ECA** (§2)
3. **Callback URL must match exactly** between client and ECA
4. Client must support a compatible OAuth flow
5. Reproduce in Postman/MCP Inspector — if it works there, it's the client's auth setup

### Prompt / tool-run failures

Permissions for the operation · the underlying **feature is enabled** in the org · the target
**data exists and is accessible to that user** · parameters are correct and complete.

### Escalation packet

Server URL · sandbox-or-scratch · client name **and version** · exact error text ·
time **with time zone** · whether it reproduces in Postman/MCP Inspector · troubleshooting
steps already tried.

---

## 7. Positioning `[doc]`

> A **universal connector**: configure a server once in Salesforce and any MCP-compatible
> client connects over standard OAuth — instead of building a custom API integration per AI
> tool.

Use Hosted MCP when the client already supports MCP, you want **per-user authentication**
so agent actions respect existing permissions, and you want an **admin-configurable,
auditable** integration rather than custom-coded API glue.

The Overview also lists **Named Queries** among custom tool types (admin-defined SOQL exposed
as reusable APIs) — see `setup-and-custom-servers.md §4`.

> ⚠️ **A "Hosted MCP Servers End-of-Life" page exists** in the Get Started nav, and Release
> Notes say "changelog coming soon." Check both before treating any of this as durable —
> some servers already have a retirement path (Data 360 Legacy is superseded).
