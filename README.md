# custom-mcp-skill

**The `custom-platform-mcp` Agent Skill**, standalone — administers MCP servers inside a
Salesforce org: list standard MCP servers and their activation state, activate/deactivate them,
register custom and external MCP servers, and pick the right MCP surface for a task.

Extracted from the [`revSkills`](../revSkills) community distribution (34 `custom-rev-*` skills +
`custom-platform-mcp` + friends) so this one skill can be versioned, installed, and shared on its
own.

## What's in the box

| Path | What |
|---|---|
| [`skills/custom-platform-mcp/`](skills/custom-platform-mcp/) | Source form — `SKILL.md`, `scripts/`, `references/`, `assets/` |
| [`skills-packaged/custom-platform-mcp.skill`](skills-packaged/custom-platform-mcp.skill) | The same skill, zipped and ready to install |

## Install

Drop [`skills-packaged/custom-platform-mcp.skill`](skills-packaged/custom-platform-mcp.skill)
wherever your Claude Code setup loads packaged skills from, or copy
[`skills/custom-platform-mcp/`](skills/custom-platform-mcp/) directly into a project's
`.claude/skills/` directory.

## What it covers

- Activating/deactivating standard Salesforce-hosted MCP servers (`sobject-reads`,
  `sobject-mutations`, `headless-360`, `agentforce-grid`, ...) via `McpServerAccess`.
- Registering custom MCP servers (`McpServerDefinition`) backed by Apex, Flow, or a genuine
  external API via `ExternalServiceRegistration` + a Named Credential.
- `scripts/esr-toolkit.mjs` — a VS-Code-free path to author `ExternalServiceRegistration`/
  `ApiNamedQuery` backings (`aa:`/`ar:`/`nq:`/Custom types), including the `esr custom` mode for
  wrapping a real third-party REST API.
- `scripts/mcpserverdef-toolkit.mjs` — wires a built backing onto an `McpServerDefinition`'s tool
  list.
- External Client App (ECA) setup and OAuth/JWT-Bearer testing for MCP clients.

Full detail lives in [`skills/custom-platform-mcp/SKILL.md`](skills/custom-platform-mcp/SKILL.md)
and its `references/` files.

## License

Apache License 2.0 — see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE). Authored by Manigandan
Dhamodaran; retain the NOTICE file and author attribution in any redistribution, per License §4.
