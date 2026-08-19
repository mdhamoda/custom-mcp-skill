# Connect Salesforce MCPs to Claude Code

**Not to be confused with the Salesforce DX MCP** (`sf-<alias>` servers, one per org alias, used for
org tooling / coding operations under this project's Gatekeeper 3, machine-local `.mcp.json`,
unrelated mechanism). This runbook is about connecting Claude Code to **custom Salesforce-hosted MCP
servers** — `salesRepMcp`, `revenueManagementMcp`, anything built as `McpServerDefinition` metadata via
this skill. Same word "MCP", two unrelated systems — say which one you mean.

Also distinct from [`runbook-connect-client.md`](runbook-connect-client.md), which covers **external**
clients generically (claude.ai's own web Connectors UI, Cursor, ChatGPT, Postman). Claude Code is its
own client with its own local config and its own auth flow — treat it separately.

## Two ways to connect

### A. Interactive — `/mcp` in a live terminal

```bash
claude mcp add --transport http <name> <server-url>   # URL grammar: eca-and-testing.md §3.3
```

Then, in an **interactive** Claude Code session (a real terminal, not a background/agent context),
run `/mcp`. It lists configured-but-unauthenticated servers and offers to open your browser for the
one-time consent step (`eca-and-testing.md` §2.2 rule 3 — not automatable, by design). This is the
right path when a person is at the keyboard.

**`/mcp` run through a non-interactive command wrapper will not prompt** — it needs a genuine live
terminal to walk its auth menu. If `/mcp` reports "0 connected" with no prompt, that's usually why,
not a broken config.

### B. Scripted / headless — the PKCE harness

For background/agent sessions, or to verify org-side setup independent of any specific client's own
OAuth UI: [`assets/scripts/pkce-mcp-test.mjs`](../assets/scripts/pkce-mcp-test.mjs).

```bash
node pkce-mcp-test.mjs --server <mcp-gateway-url> --instance <org-domain> --client-id <consumerKey> --list-only
node pkce-mcp-test.mjs --server <url> --instance <domain> --client-id <key> --tool <toolName> --args '{"k":"v"}'
```

It opens the browser itself for the one human click, then is fully scripted: PKCE generation, a local
callback listener on `http://localhost:1717/OauthRedirect` (must be registered on the ECA — the
default for every ECA this skill builds now, see `eca-and-testing.md` §1.2), token exchange, the full
`initialize` → `notifications/initialized` → `tools/list` → `tools/call` handshake. Reruns reuse the
saved token via `.pkce-mcp-token.<server>.json` (gitignore this pattern) — no second browser click.

`--instance`/`--client-id` may come from `SF_INSTANCE_URL`/`SF_CONSUMER_KEY` env vars instead of flags.

🔴 **Keep and reuse the same token file for an entire test session — don't hand-roll a separate
one-off script that redeems the same refresh token without persisting its rotated replacement.**
Refresh-token rotation is on by default (`isRefreshTokenRotationEnabled: true`); a throwaway script
that reads the saved refresh token, exchanges it, and discards the new one silently orphans the
harness's saved token, forcing a needless full re-authorization on the next real run. See
`eca-and-testing.md`'s "Refresh-token rotation footgun" note (org-hit building this runbook).

## 🔴 `tools/call` argument shape differs by tool backing type — read the real schema, don't guess it

`[org]`-hit building this runbook: calling an `aa:`-backed tool (Apex `@InvocableMethod`) with the
Apex class's field names flattened directly into `arguments` — e.g. `{"endpointPath": "...",
"httpMethod": "GET"}` — fails every time with `200` + `isError: true`:

```json
{"message":"The HTTP entity body is required, but this request has no entity body.","errorCode":"JSON_PARSER_ERROR"}
```

This is **not** a platform bug and **not tool-specific** — it reproduced identically across two
different `aa:` tools with completely different input shapes (one all-optional, one with required
fields). The actual cause: **`aa:` tools' registered `inputSchema` wraps everything in an `inputs`
array**, mirroring the underlying Apex signature `List<Request> -> List<Response>` (batch-shaped,
since Apex invocable methods always process a list):

```json
{"type":"object","properties":{"inputs":{"type":"array","items":{"type":"object","properties":{...}}}}}
```

So the correct call is `arguments: {"inputs": [{"endpointPath": "...", "httpMethod": "GET"}]}` — a
one-element array wrapping the fields, not the fields directly. Once wrapped correctly, the
`JSON_PARSER_ERROR` disappears entirely.

**`psmcps:`-backed tools are flat, not array-wrapped**, and their field names are **not guaranteed to
match the Apex/Flow-side name you'd expect** — `soqlQuery` on `platform.sobject-all` takes `{"q":
"..."}`, not `{"query": "..."}`. `[org]`-confirmed via the real registered schema, not the Apex source.

**The rule, for both backing types: read the actual `inputSchema` from a live `tools/list` call before
constructing a `tools/call` request. Never assume the argument shape from the Apex class or from
another tool's convention** — it varies by backing type and isn't documented as a fixed contract
anywhere else in this skill. `tool-backing-specs.md` documents identifier construction per backing
type; it does not (yet) document call-argument shape — this is the gap that caused the confusion.

## `[org]`-verified against `revenueManagementMcp` (scratchRC-Test, v67.0)

```
initialize OK — serverInfo: {"name":"revenueManagementMcp","version":"1.0.0"}
tools/list OK — 3 tool(s): REV000016_BizApiCatalogServiceTool, REV000016_ProductCatalogStructureServiceTool, REV000016_InvokeSalesforceApiActionTool
```

Rerun with a saved token: `Reused saved refresh token — no browser consent needed this run.` — the
"only step 7 needs a person, and only once" claim in `eca-and-testing.md` §1.6 holds in practice, as
long as the rotation footgun above is respected.

With the `inputs`-array fix, `tools/call REV000016_InvokeSalesforceApiActionTool` with
`{"inputs":[{"endpointPath":"/services/data/v67.0/limits","httpMethod":"GET"}]}` cleared the
`JSON_PARSER_ERROR` and reached real Apex execution — a separate `System.UnexpectedException:
Script-thrown exception` surfaced there (no `ApexLog` was captured for it — no `TraceFlag` was active
for the MCP-invoked context). Not yet root-caused; flagged as open, not folded into the argument-shape
finding above, since it's a distinct failure mode reached only after the schema fix.

## Troubleshooting

Shares the auth ladder and error table with `eca-and-testing.md` §2.2/§1.7 — check there first. Two
Claude-Code-specific additions:

| Symptom | Cause | Fix |
|---|---|---|
| `/mcp` shows "0 connected", no browser prompt | Run non-interactively (piped/background) | Run `/mcp` in a genuine interactive terminal, or use the harness script (route B) instead |
| `tools/call` returns `200` + `isError: true`, `JSON_PARSER_ERROR: "...no entity body"` | Arguments sent flat instead of wrapped in `inputs: [...]` for an `aa:` tool | Read the real `inputSchema` from `tools/list` first; wrap accordingly |
