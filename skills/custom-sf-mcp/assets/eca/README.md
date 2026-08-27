# External Client App for Salesforce Hosted MCP — example bundle

Deployable ECA that lets an MCP client (Claude, Cursor, Postman, a script) connect to
**Salesforce Hosted MCP Servers**.

> ⚠️ **This is NOT the Agentforce Registry stack.** Registering a *third-party* MCP server so
> **Agentforce** can consume it uses four different types — `ExternalCredential`,
> `ExternalServiceRegistration`, `NamedCredential`, `PermissionSet`. Opposite direction,
> different files. See `custom-agentforce-extension`.

## Provenance — read before trusting this

| Aspect | Source |
|---|---|
| **Which settings to choose** | ✅ **Salesforce guidelines** — *Set Up Your Org → Create an External Client App* |
| **The XML shape itself** | ⚠️ **`[org]`-verified, not documented.** Salesforce documents the ECA only as a **Setup UI procedure**; no ECA metadata example is published for MCP. This bundle was authored, deployed (`Succeeded 3/3`), and driven through a full PKCE flow to a live hosted server |

So: **documented configuration, org-verified serialization.**

## Mapping — documented UI step → element here

| Salesforce step | Element |
|---|---|
| Basic Information | `label`, `description`, `contactEmail` in `.eca-meta.xml` |
| API (Enable OAuth Settings) → **Enable OAuth** | implicit — `isOauthPluginEnabled` defaults `true` on a metadata deploy (see `.ecaPlcy` in the hardened set) |
| **Callback URL** | `callbackUrl` — **multiple URLs go in ONE element, newline-separated** |
| **OAuth Scopes: `mcp_api`, `refresh_token`** | `commaSeparatedOauthScopes` = **`MCP, RefreshToken`** ⚠️ metadata uses `MCP`, **not** `mcp_api` |
| Security → **Issue JWT-based access tokens for named users** | `isNamedUserJwtEnabled` — ⚠️ **defaults `false`; set it explicitly** |
| Security → *deselect all other options* | left unset; the platform adds its own defaults on retrieve |
| PKCE required | `isPkceRequired` + `isConsumerSecretOptional` (public-client PKCE, no secret) |

## Files — deploy all three together

```
externalClientApps/        McpClientApp.eca-meta.xml
extlClntAppGlobalOauthSets/McpClientApp.ecaGlblOauth-meta.xml
extlClntAppOauthSettings/  McpClientApp.ecaOauth-meta.xml
```

⚠️ **Suffixes are abbreviated and fail silently if spelled out:** `.ecaGlblOauth` not
`.ecaGlobalOauth`. The global-OAuth file **cannot deploy alone** — it errors with *"The external
client app configured in your global OAuth Settings doesn't have a valid OAuth settings
configuration."*

**Filename = API name**, and every sibling's `<externalClientApplication>` must match it exactly
or you get `INVALID_CROSS_REFERENCE_KEY`.

## Use

1. Rename all three files and every `McpClientApp` reference to your app name.
2. Set `contactEmail`, and the `callbackUrl` for your client
   (Claude `https://claude.ai/api/mcp/auth_callback` · Cursor `http://localhost:8787/callback` ·
   Postman `https://oauth.pstmn.io/v1/callback` · ChatGPT copies one from its Advanced settings).
3. Deploy, then wait — **an ECA can take up to 30 minutes to become operational.**
4. Harvest the generated consumer key:
   `sf project retrieve start --metadata ExtlClntAppGlobalOauthSettings:McpClientApp -o <alias>`
5. Confirm before involving a human — `curl` the authorize URL; a **302 to
   `RemoteAccessAuthorizationPage.apexp`** means the config is right.

## ⚠️ This bundle is NOT hardened

It reproduces the **platform defaults**, which are looser than Salesforce's own production advice:

| Default | Salesforce guidance |
|---|---|
| `permittedUsersPolicyType: AllSelfAuthorized` — **any org user can self-authorize** | restrict via `AdminApproved` + a permission set |
| `refreshTokenValidityPeriod: 365 Days` | **≤30 days**, with rotation |
| no IP restriction, no client secret, no single logout | consider each for production |

Fine for a scratch/demo org. **For anything else, also deploy the policy files** in
`hardened/` — see `references/eca-and-testing.md §1.5`.

## Scratch orgs

Salesforce says an ECA can't be created in a scratch org **through the Setup UI**, and advises
packaging one from a dev hub. **The Metadata API route works directly** — `[org]`-verified. Both
are valid; the packaged route is still right when the ECA must be shared across orgs or promoted
up an environment ladder.
