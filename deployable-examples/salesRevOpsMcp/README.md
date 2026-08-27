# Sales Rev Ops MCP — deployable example

A complete, real, 17-tool custom MCP server, scrubbed and renamed from an actual org-verified
deployment (`scratchRC-Test`, API v67.0) built while developing the `custom-sf-mcp` skill. Unlike
the same files under `../../skills/custom-sf-mcp/assets/mcp-server/` (which exist for the skill to
read as reference), this folder is meant to be deployed as-is into a real org with `sf`.

Every backing type this skill covers appears at least once: `aa:` (Apex `@InvocableMethod`), `fa:`
(Autolaunched Flow), `nq:` (Named Query), and `psmcps:` (re-served standard tools, no custom backing
file needed at all).

## What's here

```
force-app/main/default/
  classes/              8 Apex classes -- see table below
  flows/                SendCustomerEmail.flow-meta.xml, ComposeAndSendEmail.flow-meta.xml
  apiNamedQueries/      AccountInfo, ContactsByAccount, EmailTemplateList, UserIdByEmail
  mcpServerDefinitions/ SalesRevOpsExample.mcpServerDefinition-meta.xml -- all 17 tools
```

| Class | Tool | Needs |
|---|---|---|
| `RepDailySummaryService` | `getRepDailySummary` | Account/Opportunity/Task/Asset data |
| `GetRecordLinkService` | `getRecordLink` | nothing extra |
| `SummarizeRecordService` | `summarizeRecord` | nothing extra |
| `GetComposeEmailLinkService` | `getComposeEmailLink` | the `ComposeAndSendEmail` flow |
| `RecordAccessService` | `getOrUpdateRecord` | nothing extra |
| `BizApiCatalogService` | `bizApiCatalogServiceTool` | JWT self-callout (see below) |
| `ProductCatalogStructureService` | `productCatalogStructureServiceTool` | JWT self-callout + Revenue Cloud/PCM |
| `InvokeSalesforceApiAction` | `invokeSalesforceApiActionTool` | JWT self-callout |

`soqlQuery` / `createSobjectRecordTool` / `updateSobjectRecordTool` / `updateRelatedRecordTool` need
no backing file here at all — they re-serve `platform.sobject-all`/`platform.sobject-mutations`
standard tools via `psmcps:`, verbatim.

## Deploy order — this matters

`McpServerDefinition` is **one file**. If any single tool entry inside it can't resolve, the **whole
file** fails to deploy — confirmed via `--dry-run` while building this example (one unresolved `nq:`
identifier failed the entire 17-tool definition, not just that one tool). Deploy in this order:

1. **Classes, Flows, Named Queries first** — everything except `mcpServerDefinitions/`:
   ```
   sf project deploy start -d force-app/main/default/classes -d force-app/main/default/flows -d force-app/main/default/apiNamedQueries --target-org <alias>
   ```
2. **Activate each Named Query** — Setup → API Catalog → find `AccountInfo` / `ContactsByAccount` /
   `EmailTemplateList` / `UserIdByEmail` → **Activate**, one at a time. This is what generates the
   real `ExternalServiceRegistration` (`<QueryName>_nquery`) the `nq:` tools point at — **there is no
   API path for this step**, and it is **not optional**: deploying a hand-authored or copied ESR for
   this backing type produces a permanently orphaned `Status: Incomplete` registration that's never
   selectable. Re-verify `Status: Complete` before continuing.
3. **Then deploy the server definition**:
   ```
   sf project deploy start -d force-app/main/default/mcpServerDefinitions --target-org <alias>
   ```
4. **Activate the custom server** — deploying `McpServerDefinition` does not activate it. Create the
   access row (see the skill's `references/setup-and-custom-servers.md`), or use Setup →
   Integration → Salesforce MCP Servers.

## Before the JWT self-callout tools will actually work

`BizApiCatalogService`, `ProductCatalogStructureService`, and `InvokeSalesforceApiAction` each mint
their own JWT Bearer self-callout token via `JwtAuthHelper`. Their `JWT_CONSUMER_KEY` and
`JWT_CERTIFICATE_NAME` constants are `{{PLACEHOLDER}}` values — fill them in for your org, and set up
the JWT Bearer self-callout ECA (External Client App + cert + Named/External Credential). That setup
is **not** included in this folder — see `../../skills/custom-sf-mcp/assets/eca/jwt-bearer-self-callout/`
for a complete, deployable example of that piece. Until then, those three tools deploy and register
fine, but fail at the token-mint step when actually called.

## Before `sendCustomerEmail`'s template picker works

`ComposeAndSendEmail.flow-meta.xml` filters `EmailTemplate` by `FolderName = "Customer Follow-Up"`.
This folder ships no email templates — create that folder and at least one active template in it, or
the picker screen returns an empty list. `listCustomerEmailTemplates` (the `nq:EmailTemplateList_nquery`
tool) has the same dependency.

## Not included, and why

- **Test classes** — kept out to keep this a minimal, focused example; add your own coverage.
- **The retrieved `ExternalServiceRegistration` files for the 4 named queries** — deliberately
  excluded. Deploying a pre-existing/retrieved ESR for an `nq:` query produces a dead orphan on a
  *different* org (the platform must generate its own per org, via the manual Activate step above)
  — including them here would invite exactly that mistake.
- **Auth plumbing** (ECA sets, Named/External Credential, JWT cert, permission sets) — covered by the
  skill's own separate, already-complete examples rather than duplicated here.
