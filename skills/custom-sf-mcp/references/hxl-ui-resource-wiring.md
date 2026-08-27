# Wiring a tool to an HXL widget in `McpServerDefinition`

**Scope: the MCP-definition wiring only** — connecting an *already-built* widget/CLT trio to an
*already-defined* tool. Not widget authoring (component schema, `tile/*` composition, rendering
behavior) — that's `platform-mcp-tool-widget-coordinate` / `platform-widget-generate` /
`platform-custom-lightning-type-generate`, or the parked skill proposal
`custom-sf-headless-experience` for org enablement.

`[org]` verified: REV-000019 `getOrUpdateRecord`, `scratchRC-Test`, 2026-08-23 — deployed, redeployed,
and reproduced through `mcpserverdef-toolkit.mjs`'s `--ui-resource-name`/`--ui-envelope-clt` flags
(dry-run validated against the live org schema).

## The three metadata types involved

| Type | Folder | Role |
|---|---|---|
| `McpServerDefinition` | `mcpServerDefinitions/` | The tool's `<uiResource>` tag + a sibling `<resources>` entry point at the widget. |
| `LightningTypeBundle` (envelope) | `lightningTypes/<EnvelopeName>/` | The Apex-Invocable action's result envelope (`actionName`, `isSuccess`, `outputValues`). **This is what `resourceUri` points at.** |
| `LightningTypeBundle` (response) | `lightningTypes/<ResponseName>/` | Referenced from inside the envelope's `outputValues` (`"lightning:type": "c__<ResponseName>"`) — carries the actual field data the widget renders. |
| `UiWidgetBundle` | `uiWidgets/<WidgetName>/` | The widget itself — `renderer.json` on the envelope CLT points at it (`@widget/c/<WidgetName>`). |

Three separate bundle names, three separate roles — don't conflate them when wiring:
- `<uiResource>` / `<resourceName>` → an arbitrary identifier for the resource entry (convention:
  reuse the `UiWidgetBundle` name).
- `resourceUri`'s `c__<Name>` → the **envelope** `LightningTypeBundle` name, not the widget name.

## The confirmed XML shape

```xml
<tools>
    <apiDefinition>...</apiDefinition>
    <toolName>getOrUpdateRecord</toolName>
    ...
    <uiResource>getOrUpdateRecordWidget</uiResource>
</tools>
<resources>
    <resourceName>getOrUpdateRecordWidget</resourceName>
    <resourceUri>ui://widget/lightningType/c__getOrUpdateRecord</resourceUri>
    <resourceTitle>Get Or Update Record Widget Resource</resourceTitle>
    <description>...</description>
</resources>
```

`<uiResource>` lives inside the `<tools>` entry it belongs to. `<resources>` is a **sibling** of
`<tools>` at the `McpServerDefinition` root, not nested inside it.

## Preconditions this wiring step assumes are already true

1. **HXL is enabled on the target org.** Setup → Feature Settings → Headless Experience Layer, backed
   by deployable `Settings:UiWidget` (`<hxlEnabled>`). Not an API-version gate — a separate Beta
   feature toggle. (Full enablement procedure: the parked `custom-sf-headless-experience` proposal.)
2. **The envelope CLT, response CLT, and widget already exist and deploy cleanly together.**
   Cross-referencing `LightningTypeBundle`/`UiWidgetBundle` components only resolve within the **same**
   `sf project deploy start` transaction — deploying them sequentially produces `"Invalid Property type
   c__<Name>"` even when each individually reports success. When this wiring step changes a
   `McpServerDefinition`, deploy it together with any CLT/widget files that changed alongside it, not
   as a separate follow-up call.

## Script support

`scripts/mcpserverdef-toolkit.mjs`'s `add-tool` accepts optional `--ui-resource-name <Name>
--ui-envelope-clt <BundleName> [--ui-resource-title <Title>]` — verifies the envelope CLT bundle
exists locally under `lightningTypes/` before wiring (a dead reference otherwise), then emits both the
`<uiResource>` tag and the `<resources>` block above. It does not create the CLT/widget files
themselves — only wires an already-built trio onto a tool.

## Reference documentation

- **HXL Developer Guide — MCP wiring**: `developer.salesforce.com/docs/platform/hxl/guide/hxl-mcp-server.html`
  (the exact pattern above), and its sibling pages `hxl-mcp-channels.html` (using widgets on MCP),
  `hxl-mcp-apex.html` (the Apex action side), `hxl-widget-composition.html` (the widget's own
  component-tree JSON, `meta.forEach`/`meta.if`), `hxl-widget-schema.html` (the widget's
  attribute-contract `schema.json`).
- **Lightning Types Developer Guide**: `developer.salesforce.com/docs/platform/lightning-types/guide/lightning-types.html`
  (overview + the 12 standard types), `.../guide/lightning-types-core.html` (Custom Lightning Type
  concepts: editor/renderer/schema, Collection Renderer), `.../guide/lightning-types-apex.html`
  (Apex-class-backed CLTs), `.../references/lightning-types/lightning-types-reference.html` (the
  authoritative type list — no list/array type exists here, despite some search results implying
  otherwise), `.../references/lightning-types/lightning-types-glossary.html` (terminology).
