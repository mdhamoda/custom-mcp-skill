# claudeaiSkills

Skills in this folder are packaged for **claude.ai** (the consumer/web product), not for a
Claude Code project's `.claude/skills/` directory — see the top-level [`skills/`](../skills/) and
[`skills-packaged/`](../skills-packaged/) folders for that form instead.

## What's in the box

| Path | What |
|---|---|
| [`custom-salesforce-ui-workspace-generate/`](custom-salesforce-ui-workspace-generate/) | Source form — `SKILL.md`, `assets/`, `references/` |
| [`custom-salesforce-ui-workspace-generate.skill`](custom-salesforce-ui-workspace-generate.skill) | The same skill, zipped and ready to upload to claude.ai |

**What it does:** generates a Lightning-styled record workspace — sortable list, bulk field
edit, automatic Details/Related tabs (related lists auto-detected from lookup fields), and
optional real writes back to Salesforce — as a self-contained, interactive Claude Artifact
(React rendered inline in chat) for any Salesforce SObject. Schema-driven, no object-specific
field names baked in; wired to live data through whichever Salesforce MCP connector the account
has connected. Full detail in [`custom-salesforce-ui-workspace-generate/SKILL.md`](custom-salesforce-ui-workspace-generate/SKILL.md).

---

## How to add this skill to claude.ai

1. **Enable the capability the skill needs.** In claude.ai, click your initials (bottom-left) →
   **Settings** → **Capabilities**, and turn on **"Code execution and file creation"**. Skills
   won't run without it.
2. **Upload the skill.** Go to **Settings** → **Customize** → **Skills**, click **+**, then
   **"+ Create skill"**, and upload [`custom-salesforce-ui-workspace-generate.skill`](custom-salesforce-ui-workspace-generate.skill)
   directly — it's already zipped with the skill folder at its root (the required shape: the zip
   must contain the skill folder itself, not loose files and not an extra wrapper directory).
3. **Turn it on.** Uploaded skills are private to your account and **off by default** — find
   `custom-salesforce-ui-workspace-generate` in your skills list and toggle it on, or Claude won't
   use it.
4. **Connect the Salesforce MCP connector.** This skill only draws the UI — it reads and writes
   Salesforce data through whichever Salesforce MCP server/connector your claude.ai account has
   connected (e.g. a "Salesforce Sales and RevOps" custom connector exposing tools like
   `soqlQuery`, `updateSobjectRecord`, the `REV000016_*` Revenue Cloud business-API tools, etc.).
   Connect it under **Settings** → **Connectors** if it isn't already. Without a connected
   connector the skill can still render an artifact from data you paste in, but it can't read or
   write live Salesforce records — see [`references/wiring-live-mcp-data.md`](custom-salesforce-ui-workspace-generate/references/wiring-live-mcp-data.md)
   for exactly which tool calls it expects.

## Step 5 — add the operating instructions

**Memory is not turned on for this account**, so claude.ai won't remember these operating rules
on its own between conversations — they need to be pasted in once as standing instructions so
they apply automatically to every new chat.

Click your initials (bottom-left) → **Settings** → find the box labeled **"What preferences
should Claude consider in responses?"** (also shown as **"Instructions for Claude"**) → paste the
block below → **Save**. Whatever is saved there loads into every new conversation from then on,
with no need to re-paste it per chat.

```text
For any Salesforce data — opportunities, orders, quotes, accounts, contacts, or any other
object — always present results using the interactive workspace artifact
(custom-salesforce-ui-workspace-generate skill), never a plain chat table or list. This applies
to reads, summaries, and lists alike, including simple requests like "list my opportunities" or
"show me orders." Only skip the workspace artifact if I explicitly ask for a plain text answer
instead.

- Summaries should include key information in context to make decisions, and drive business
  operations.
- Account summaries or view give a 360 view of the customer: related list, details, activities,
  opportunities, contacts, and assets.
- Edits made in artifacts for Salesforce get saved to Salesforce using the UpdateSobjectRecord
  tool, for non-Revenue-Cloud objects.
- Do not save the artifacts used to display or render results in chat, unless asked explicitly.
- Always use Revenue Cloud (business) APIs, not sObject APIs, for CPQ, Order, assets, or
  product/quote-to-cash operations. First check Business APIs and prioritize them with the help
  of REV000016_BizApiCatalogService / REV000016_InvokeSalesforceApiAction — Salesforce exposes
  business APIs to create and update a quote or order with line items.
- Product configuration can be saved on a quote through the business APIs, to place a sales
  transaction (quote or order).
- pricingPref is set to "skip" on Salesforce placeSalesTransaction — every placeSalesTransaction
  call is followed by a corePricing/pricing API call.
```

## Verify it works

Open a new chat and ask something like *"list my opportunities"* or *"show me my open orders."*
If the setup above is correct, Claude should render an interactive record-workspace Artifact
(list, sortable, with Details/Related tabs) instead of a plain chat table — and for Revenue Cloud
objects (quotes, orders with line items), tool calls should route through the `REV000016_*`
business APIs rather than a raw `soqlQuery`/`updateSobjectRecord` on the sObject.

## License

Apache License 2.0 — see the repo root [`LICENSE`](../LICENSE) and [`NOTICE`](../NOTICE). Authored
by Manigandan Dhamodaran; retain the NOTICE file and author attribution in any redistribution, per
License §4.
