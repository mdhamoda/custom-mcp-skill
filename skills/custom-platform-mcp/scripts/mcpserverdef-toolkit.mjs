// mcpserverdef-toolkit.mjs — appends a real, org-confirmed tool <apiDefinition> block to an
// existing McpServerDefinition source file. Split out from esr-toolkit.mjs because this operates
// on a DIFFERENT metadata type: McpServerDefinition, not ExternalServiceRegistration/ApiNamedQuery.
// esr-toolkit.mjs builds the BACKING (the thing being exposed); this script wires an
// already-Complete/Activated backing onto a server's tool list. Run esr-toolkit.mjs first.
//
// PATH FIX (previously a known bug, now fixed): REPO must resolve to the actual project root from
// this script's shipped location (.claude/skills/custom-platform-mcp/scripts/), which needs 4
// directory levels up (scripts -> custom-platform-mcp -> skills -> .claude -> repo root), not 2 -
// a 2-level `${HERE}/../..` silently lands inside .claude/skills/ and fails with "Server definition
// not found locally". If you see that error after copying this script elsewhere, re-check the
// REPO constant's level count for the new location.
//
// ae:/ar:/aa:/fa:/nq:/pr:/ct:/psmcps: are all [org]-CONFIRMED prefixes (verified against
// McpServerToolApiDefinition) - all eight are now covered by add-tool.
//
// ae:/ar: - the identifier body is the Apex class name, but Operation is the METHOD name, which
//   cannot be derived from the class name in general (a class can expose any method name) - so
//   --operation is REQUIRED for these two, always captured from Setup, never guessed.
//
// aa:/fa: - BOTH halves ARE mechanically derivable, [doc]-confirmed in tool-backing-specs.md:
//   aa:apex-<ClassName>, Operation=<ClassName> (not the method - an @InvocableMethod class exposes
//   itself, not an arbitrary method name); fa:flow-<FlowName>, Operation=<FlowName>. Verified before
//   wiring by checking the class/flow is actually a real invocable action in this org
//   (GET /actions/custom/apex or /actions/custom/flow) - the formula is trusted, but existence isn't
//   assumed, same "verify, don't blind-construct" discipline as nq:/pr:.
//
// ct:/psmcps: - these RE-SERVE a STANDARD server's own tool. add-tool ct|psmcps runs in ADOPT mode
//   by default: it queries McpServerToolApiDefinition for an EXISTING row whose ApiIdentifier
//   already matches the given prefix and contains <target>, and copies its real
//   ApiIdentifier/Operation verbatim onto the new server - the verified-safe path, since Setup's
//   picker has already minted a real, org-confirmed value somewhere.
//
//   ct: format is "ct:<ns>-<server>_V_<ver>" with an encoded version suffix (_V_67x2e0 where
//   x2e=.) that has no confirmed derivation rule - adopt-only, no construct fallback for this
//   prefix.
//
//   psmcps: format is "psmcps:<ns>.<server>:<operation>", DOCUMENTED and derivable (see
//   tool-backing-specs.md §1 row 3) - operation is the tool's real API name, NOT the runtime MCP
//   tool name from tools/list (those are unrelated strings - no transformation bridges them).
//   Whether a hand-constructed psmcps: identifier actually works with zero prior Setup interaction
//   is, per this project's own doc correction, an OPEN QUESTION - earlier revisions asserted a
//   mandatory Setup click as settled fact; that was never isolated-tested and conflated a real
//   ExternalServiceRegistration-activation gate (genuine, for ae:/ar:/nq:) with a caution about not
//   guessing the identifier string wrong (also real, but a different claim). psmcps: has NO ESR at
//   all (external-service-registration.md §6.0), so there's no activation gate of that kind to
//   satisfy in the first place. `--construct --standard-server <ns.server>` opts into building the
//   identifier from the documented pattern when adopt-mode finds nothing, instead of failing - this
//   is the test that resolves the open question, run through sanctioned tooling instead of a
//   hand-edit. It is explicitly NOT the default: adopt stays first-choice whenever a row already
//   exists, and construct-mode says so loudly in its own output every time it's used.
//
// nq: - BOTH halves ARE mechanically derivable from the query's own ApiNamedQuery name, per an
//   [org]-confirmed, documented convention: the platform's own auto-generated
//   ExternalServiceRegistration is always named "<QueryName>_nquery", and Operation is always the
//   bare "<QueryName>" unchanged. So for nq:, <IdentifierBody> is the bare query name and this
//   script appends "_nquery"/derives Operation automatically - no manual capture step needed for
//   naming (the ONE step that stays manual is the Activate click in Setup - see esr-toolkit.mjs's
//   `esr namedquery` mode and the skill proposal §3/§9c). --operation still works as an override if
//   a future query is ever observed to break this convention - don't assume it's bulletproof
//   forever, just don't re-derive it by hand every time when it has held so far.
//
// pr: - a GenAiPromptTemplate exposed as an agent-callable tool. NOT ESR-backed at all (confirmed
//   [org]: the ten pre-existing PROMPTS_REST api-catalog entries in this org have zero matching
//   ExternalServiceRegistration rows) - so there is no Status:Complete gate to check here, only
//   "does the template exist and is it Published". Identifier body: for a MANAGED/namespaced
//   template it's "<namespace>__<name>" (doc-confirmed, tool-backing-specs.md); for an UNNAMESPACED
//   custom template in a scratch/dev org it's just the bare DeveloperName - [org]-confirmed by
//   deploying AccountHealthBriefing and finding it in GET /api-catalog/apis as
//   id:"AccountHealthBriefing" with NO "__" prefix. Operation = same as the identifier body (doc,
//   tool-backing-specs.md - a prompt template has one generation operation, not multiple methods).
//   --operation still works as an override for the rare case this doesn't hold.
//
// SOURCE-FIRST, ALWAYS: writes the real McpServerDefinition source file and dry-run validates it.
// Real deploy only happens with --deploy, and only after the dry-run succeeds.
//
// --description and --returns are BOTH required for every add-tool/add-prompt call. There is no
// dedicated "output schema" field anywhere in McpServerDefinition - descriptionOverride is the
// ONLY place a calling agent (Claude, GPT, any MCP client) learns what a tool returns, so --returns
// gets appended structurally rather than left to be remembered. [org]-confirmed real gaps this
// exists to prevent: a placeholder descriptionOverride ("Added via mcpserverdef-toolkit.mjs
// add-tool.") shipped silently until caught by a live external-agent test failing on the wrong
// input format; a GenAiPromptTemplateInput's own <description> field does NOT propagate into
// either MCP exposure model's schema (tools/list still showed the bare apiName, "Account", even
// after the field was set and the version activated) - so for pr:/<prompts> especially,
// descriptionOverride is the ONLY surface that can carry input-format guidance (e.g. "record Id,
// not Name") to a calling agent at all.
//
// --read-only/--destructive/--idempotent/--open-world (add-tool only - <prompts> has no
// annotations at all) are ALSO required, must be literally "true"/"false". Real bug this replaces:
// the script used to hardcode readOnly=true/destructive=false/idempotent=true/openWorld=false for
// every tool regardless of behavior - a future write/delete-capable or external-calling tool added
// that way would have shipped with incorrect, reassuring-sounding annotations. Definitions are the
// org's own Setup UI text for these annotations:
//   read-only    "This tool only reads data - it doesn't create, update, or delete records. Clients
//                may run it without asking for confirmation."
//   destructive  "This tool may permanently delete or irreversibly modify data. Clients should ask
//                the user to confirm before running it."
//   idempotent   "Running this tool multiple times with the same input produces the same result.
//                Clients may safely retry on failure."
//   open-world   "This tool may send data to systems outside Salesforce (e.g., external APIs,
//                email services)."
//
// --ui-resource-name/--ui-envelope-clt (add-tool only, OPTIONAL) - binds the tool to an HXL widget.
// [org]-confirmed pattern (deployed and verified live, REV-000019 getOrUpdateRecord,
// scratchRC-Test, 2026-08-23; official doc:
// developer.salesforce.com/docs/platform/hxl/guide/hxl-mcp-server.html): a tool with a companion
// widget needs a <uiResource> tag INSIDE its <tools> block, plus a SIBLING <resources> block whose
// resourceUri points at the ENVELOPE LightningTypeBundle (not the widget bundle, not the response
// CLT bundle) as "ui://widget/lightningType/c__<EnvelopeCLTName>". Full metadata-type breakdown
// and doc links: references/hxl-ui-resource-wiring.md - MCP wiring only, not widget authoring
// (that's platform-mcp-tool-widget-coordinate's job, or the still-parked custom-sf-headless-
// experience skill proposal for org enablement). This flag pair only wires an ALREADY-BUILT
// widget/CLT trio onto an already-defined tool; it does not create them.
//   --ui-resource-name <Name>       becomes both <uiResource> on the tool AND <resourceName> on
//                                   the <resources> entry (this session used the widget bundle's
//                                   own name, e.g. getOrUpdateRecordWidget - a convention, not a
//                                   platform requirement).
//   --ui-envelope-clt <BundleName>  the envelope LightningTypeBundle's directory name under
//                                   force-app/main/default/lightningTypes/ - verified to exist
//                                   locally before wiring (dead reference otherwise). Builds
//                                   resourceUri as ui://widget/lightningType/c__<BundleName>.
//   --ui-resource-title <Title>     optional, defaults to "<Name> Resource".
//   Reminder (not enforced by this script): deploy the envelope CLT + response CLT + widget +
//   this McpServerDefinition change TOGETHER in one `sf project deploy start` call - cross-
//   referencing LightningTypeBundle/UiWidgetBundle components only resolve within the same
//   transaction (see references/hxl-ui-resource-wiring.md).
//
// Usage:
//   node mcpserverdef-toolkit.mjs add-tool ae|ar <ClassName> --operation <RealMethodName> --description <...> --returns <...> --read-only true|false --destructive true|false --idempotent true|false --open-world true|false --server <McpServerDefName> [--ui-resource-name <Name> --ui-envelope-clt <BundleName> [--ui-resource-title <Title>]] [--org <alias>] [--deploy]
//   node mcpserverdef-toolkit.mjs add-tool aa <ClassName> --description <...> --returns <...> --read-only true|false --destructive true|false --idempotent true|false --open-world true|false --server <McpServerDefName> [--org <alias>] [--deploy]
//   node mcpserverdef-toolkit.mjs add-tool fa <FlowName> --description <...> --returns <...> --read-only true|false --destructive true|false --idempotent true|false --open-world true|false --server <McpServerDefName> [--org <alias>] [--deploy]
//   node mcpserverdef-toolkit.mjs add-tool nq <QueryName> --description <...> --returns <...> --read-only true|false --destructive true|false --idempotent true|false --open-world true|false --server <McpServerDefName> [--operation <override>] [--org <alias>] [--deploy]
//   node mcpserverdef-toolkit.mjs add-tool pr <TemplateDeveloperName> --description <...> --returns <...> --read-only true|false --destructive true|false --idempotent true|false --open-world true|false --server <McpServerDefName> [--operation <override>] [--org <alias>] [--deploy]
//   node mcpserverdef-toolkit.mjs add-tool ct|psmcps <MatchText> --description <...> --returns <...> --read-only true|false --destructive true|false --idempotent true|false --open-world true|false --server <McpServerDefName> [--org <alias>] [--deploy]
//   node mcpserverdef-toolkit.mjs add-prompt <TemplateDeveloperName> --description <...> --returns <...> --server <McpServerDefName> [--prompt-title <title>] [--org <alias>] [--deploy]

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LIGHTNING_TYPES_DIR_NAME = "lightningTypes";

const HERE = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
// HERE = .../.claude/skills/custom-platform-mcp/scripts/ -- reaching the actual project root
// (where force-app/ lives) needs 4 levels up (scripts -> custom-platform-mcp -> skills -> .claude
// -> ROOT), not 2. The previous `${HERE}/../..` landed inside .claude/skills/ and silently pointed
// at a non-existent force-app/ there -- [org]-confirmed real bug, caught when this script was
// finally run instead of hand-rolling the equivalent API calls.
const REPO = `${HERE}/../../../..`;
const MCP_DIR = `${REPO}/force-app/main/default/mcpServerDefinitions`;

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const has = (flag) => process.argv.includes(flag);

const sf = (args) => execFileSync("sf", args, { encoding: "utf8", shell: process.platform === "win32" });

function resolveOrg() {
  const explicit = arg("--org");
  if (explicit) return explicit;
  // No --org passed: fall back to the CLI's own configured default -- but never SILENTLY. Print
  // exactly what was resolved so a wrong default is visible immediately, not discovered later
  // after acting against the wrong org.
  try {
    const cfg = JSON.parse(sf(["config", "get", "target-org", "--json"]));
    const value = cfg?.result?.[0]?.value;
    if (value) {
      console.log(`No --org passed -- using the CLI's configured default org: ${value}`);
      console.log(`(pass --org <alias> explicitly to target a different org)`);
      return value;
    }
  } catch (e) {
    // fall through to the hard error below
  }
  console.error("Missing --org <alias>, and no default org is configured (`sf config get");
  console.error("target-org` returned nothing). Pass --org <alias> explicitly, or run");
  console.error("`sf config set target-org <alias>` first.");
  process.exit(1);
}
const org = resolveOrg();
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// [org]-confirmed real bug: passing a multi-word SOQL string via "sf ... --query <string>" through
// execFileSync's Windows shell:true path gets silently word-split before reaching sf, regardless of
// content (not specific to "%" or commas - even the simplest "SELECT X FROM Y" with no WHERE clause
// fails identically: "Unexpected arguments: X, FROM, Y"). Writing the query to a temp file and using
// --file sidesteps the shell re-tokenizing entirely. Use this for ANY SOQL query, not just the ones
// that happen to contain wildcards.
function sfQuery(soql, useToolingApi = true) {
  const tmpFile = join(tmpdir(), `mcpserverdef-toolkit-query-${Date.now()}.soql`);
  writeFileSync(tmpFile, soql);
  try {
    const args = ["data", "query", "--json", "--target-org", org, "--file", tmpFile];
    if (useToolingApi) args.splice(2, 0, "--use-tooling-api");
    return JSON.parse(sf(args));
  } finally {
    try { unlinkSync(tmpFile); } catch { /* best-effort cleanup */ }
  }
}

function dryRunValidate(path) {
  console.log(`\nValidating (dry-run, no deploy) ...`);
  try {
    sf(["project", "deploy", "start", "--dry-run", "-l", "NoTestRun", "--source-dir", path, "--target-org", org]);
    console.log("Dry-run: Succeeded.");
    return true;
  } catch (e) {
    console.log("Dry-run: FAILED —");
    console.log((e.stdout ?? e.message).toString().slice(0, 2000));
    return false;
  }
}
function realDeploy(path) {
  console.log(`\nDeploying for real ...`);
  sf(["project", "deploy", "start", "-l", "NoTestRun", "--source-dir", path, "--target-org", org, "--ignore-conflicts"]);
  console.log("Deployed.");
}

const [, , cmd, sub, name] = process.argv;

if (cmd === "add-tool") {
  const prefix = sub; // ae | ar | aa | fa | nq | pr | ct | psmcps
  const target = name;
  const serverName = arg("--server");
  const description = arg("--description");
  const returns = arg("--returns");
  const readOnlyArg = arg("--read-only");
  const destructiveArg = arg("--destructive");
  const idempotentArg = arg("--idempotent");
  const openWorldArg = arg("--open-world");
  let operation = arg("--operation");
  let identifierBody = target;
  if (prefix === "nq") {
    identifierBody = `${target}_nquery`;
    operation ??= target;
  }
  if (prefix === "pr") {
    operation ??= target;
  }
  if (prefix === "aa") {
    identifierBody = `apex-${target}`;
    operation ??= target;
  }
  if (prefix === "fa") {
    identifierBody = `flow-${target}`;
    operation ??= target;
  }
  const boolFlagsOk = ["true", "false"].includes(readOnlyArg) && ["true", "false"].includes(destructiveArg) && ["true", "false"].includes(idempotentArg) && ["true", "false"].includes(openWorldArg);
  const validPrefixes = ["ae", "ar", "aa", "fa", "nq", "pr", "ct", "psmcps"];
  const needsOperation = !["ct", "psmcps"].includes(prefix); // ct:/psmcps: adopt their own Operation
  if (!validPrefixes.includes(prefix) || !target || !serverName || (needsOperation && !operation) || !description || !returns || !boolFlagsOk) {
    console.error("usage:");
    console.error("  node mcpserverdef-toolkit.mjs add-tool ae|ar <ClassName> --operation <RealMethodName> --description <...> --returns <...> --read-only true|false --destructive true|false --idempotent true|false --open-world true|false --server <McpServerDefName> [--org <alias>] [--deploy]");
    console.error("  node mcpserverdef-toolkit.mjs add-tool aa <ClassName> --description <...> --returns <...> --read-only true|false --destructive true|false --idempotent true|false --open-world true|false --server <McpServerDefName> [--org <alias>] [--deploy]");
    console.error("  node mcpserverdef-toolkit.mjs add-tool fa <FlowName> --description <...> --returns <...> --read-only true|false --destructive true|false --idempotent true|false --open-world true|false --server <McpServerDefName> [--org <alias>] [--deploy]");
    console.error("  node mcpserverdef-toolkit.mjs add-tool nq <QueryName> --description <...> --returns <...> --read-only true|false --destructive true|false --idempotent true|false --open-world true|false --server <McpServerDefName> [--operation <override>] [--org <alias>] [--deploy]");
    console.error("  node mcpserverdef-toolkit.mjs add-tool pr <TemplateDeveloperName> --description <...> --returns <...> --read-only true|false --destructive true|false --idempotent true|false --open-world true|false --server <McpServerDefName> [--operation <override>] [--org <alias>] [--deploy]");
    console.error("  node mcpserverdef-toolkit.mjs add-tool ct|psmcps <MatchText> --description <...> --returns <...> --read-only true|false --destructive true|false --idempotent true|false --open-world true|false --server <McpServerDefName> [--org <alias>] [--deploy]");
    console.error("      psmcps only: [--construct --standard-server <ns.server>] builds the identifier from");
    console.error("      the documented pattern when adopt-mode finds no existing row, instead of failing.");
    console.error("      Not the default -- adopt-first stays the verified-safe path whenever a row exists.");
    console.error("");
    console.error("OPTIONAL, any add-tool prefix: [--ui-resource-name <Name> --ui-envelope-clt <BundleName>");
    console.error("  [--ui-resource-title <Title>]] wires this tool to an ALREADY-BUILT HXL widget --");
    console.error("  <BundleName> must be an existing LightningTypeBundle dir under");
    console.error("  force-app/main/default/lightningTypes/ (verified before wiring). See");
    console.error("  references/hxl-ui-resource-wiring.md for the metadata types and the doc links.");
    console.error("");
    console.error("--description and --returns are BOTH REQUIRED and get combined into <descriptionOverride>");
    console.error("- the ONLY text a calling agent (Claude, GPT, any MCP client) has to decide whether/how to");
    console.error("call this tool AND to know what it gets back (McpServerDefinition has no separate output-");
    console.error("schema field). --description: what the tool does, plus input-format notes for anything not");
    console.error("obvious from the field name (e.g. a record Id vs a display name - [org]-confirmed real");
    console.error("failure mode: an external agent guessed an Account Name where an Id was required, because");
    console.error("nothing said otherwise). --returns: the shape of the result, in plain language.");
    console.error("");
    console.error("--read-only/--destructive/--idempotent/--open-world are ALSO REQUIRED (must be literally");
    console.error("'true' or 'false') - [org]-confirmed real bug this replaces: this script used to hardcode");
    console.error("readOnly=true, destructive=false, idempotent=true, openWorld=false for every tool");
    console.error("regardless of what it actually does. A write/delete-capable or external-calling tool added");
    console.error("that way would ship with incorrect, reassuring-sounding annotations. Decide deliberately,");
    console.error("per tool - definitions are the org's own Setup UI text for these annotations:");
    console.error("  --read-only    'This tool only reads data - it doesn't create, update, or delete records.");
    console.error("                 Clients may run it without asking for confirmation.'");
    console.error("  --destructive  'This tool may permanently delete or irreversibly modify data. Clients");
    console.error("                 should ask the user to confirm before running it.'");
    console.error("  --idempotent   'Running this tool multiple times with the same input produces the same");
    console.error("                 result. Clients may safely retry on failure.' (reads/deletes/upserts");
    console.error("                 typically qualify; a plain create with no natural key typically doesn't)");
    console.error("  --open-world   'This tool may send data to systems outside Salesforce (e.g., external");
    console.error("                 APIs, email services).'");
    process.exit(1);
  }
  const fullDescription = `${description} Returns: ${returns}`;
  if (prefix === "pr") {
    // No ESR/Status:Complete gate for prompt templates (confirmed - see header comment). The only
    // real check available without a Tooling API sObject for this type is org list metadata.
    console.log(`[add-tool pr] verifying GenAiPromptTemplate "${target}" exists in ${org} ...`);
    let listOut;
    try {
      listOut = JSON.parse(sf(["org", "list", "metadata", "--metadata-type", "GenAiPromptTemplate", "--json", "--target-org", org]));
    } catch (e) { console.error(`Metadata list failed: ${(e.stdout ?? e.message).toString().slice(0, 500)}`); process.exit(1); }
    const found = (listOut.result ?? []).some((r) => r.fullName === target);
    if (!found) {
      console.error(`FAILED: no GenAiPromptTemplate named "${target}" found in ${org}.`);
      console.error(`  Deploy it first (force-app/main/default/genAiPromptTemplates/).`);
      process.exit(1);
    }
    console.log(`OK - ${target} exists. (Publish status isn't checkable via a Tooling sObject for`);
    console.log(`  this type - retrieve the file and confirm <status>Published</status> manually`);
    console.log(`  if this wasn't just deployed.)`);
  }
  if (prefix === "nq") {
    // The <QueryName>_nquery / bare-name-as-Operation convention is [org]-confirmed on exactly ONE
    // example - a strong default, not a guarantee. Verify against the real org before
    // trusting it: the platform-generated ExternalServiceRegistration must actually exist and be
    // Status:Complete, or the tool being added would be dead on arrival (silently unusable, per the
    // "Valid operations for this identifier are []" failure mode this whole toolkit exists to avoid).
    console.log(`[add-tool nq] verifying ${identifierBody} exists and is Status:Complete before proceeding ...`);
    let statusCheck;
    try {
      statusCheck = sfQuery(`SELECT Status FROM ExternalServiceRegistration WHERE DeveloperName = '${identifierBody}'`);
    } catch (e) { console.error(`Query failed: ${(e.stdout ?? e.message).toString().slice(0, 500)}`); process.exit(1); }
    const rec = statusCheck.result?.records?.[0];
    if (!rec) {
      console.error(`FAILED: no ExternalServiceRegistration named "${identifierBody}" found in ${org}.`);
      console.error(`  Either the convention broke for this query, or it hasn't been Activated yet in`);
      console.error(`  Setup -> API Catalog (esr-toolkit.mjs esr namedquery only deploys the ApiNamedQuery -`);
      console.error(`  Activate is the separate, manual, unautomatable step - see the skill proposal §3/§9c).`);
      process.exit(1);
    }
    if (rec.Status !== "Complete") {
      console.error(`FAILED: ${identifierBody} exists but Status is "${rec.Status}", not "Complete".`);
      console.error(`  Adding it as a tool now would produce a dead identifier. Activate it in Setup`);
      console.error(`  -> API Catalog first, then re-run.`);
      process.exit(1);
    }
    console.log(`OK - ${identifierBody} is Status:Complete. Convention verified for this record.`);
  }
  if (prefix === "aa" || prefix === "fa") {
    // Format IS mechanically derivable (doc-confirmed), but existence isn't assumed - verify the
    // class/flow is actually registered as an invocable action before wiring a dead identifier.
    const registry = prefix === "aa" ? "apex" : "flow";
    console.log(`[add-tool ${prefix}] verifying "${target}" is a registered invocable ${registry} action ...`);
    let actionsOut;
    try {
      actionsOut = JSON.parse(sf(["api", "request", "rest", `/services/data/v${arg("--api-version", "67.0")}/actions/custom/${registry}`, "--target-org", org]));
    } catch (e) { console.error(`Actions registry query failed: ${(e.stdout ?? e.message).toString().slice(0, 500)}`); process.exit(1); }
    const actions = actionsOut?.actions ?? actionsOut ?? [];
    const found = Array.isArray(actions) && actions.some((a) => (a.name ?? a.label ?? "").toLowerCase() === target.toLowerCase());
    if (!found) {
      console.error(`FAILED: "${target}" not found in /actions/custom/${registry} for ${org}.`);
      console.error(`  ${prefix === "aa" ? "Deploy it as a global @InvocableMethod class" : "Confirm the Flow is Active and Autolaunched"} first, then re-run.`);
      process.exit(1);
    }
    console.log(`OK - ${target} is a registered invocable ${registry} action.`);
  }
  let identifier, adoptedOperation;
  if (prefix === "ct" || prefix === "psmcps") {
    // ADOPT mode: this identifier belongs to a standard server's own tool and was already minted by
    // Setup's picker somewhere in the org - find and copy it verbatim, never construct it by hand.
    console.log(`[add-tool ${prefix}] searching McpServerToolApiDefinition for an existing "${prefix}:" identifier matching "${target}" ...`);
    // Pull all rows (this object only ever has as many rows as tools added across all custom
    // servers in the org - small) and filter client-side instead of a LIKE %...% - see sfQuery()'s
    // own comment for why any multi-word --query value, wildcards or not, was unreliable here.
    let matchOut;
    try {
      matchOut = sfQuery(`SELECT ApiIdentifier, Operation FROM McpServerToolApiDefinition`);
    } catch (e) { console.error(`Query failed: ${(e.stdout ?? e.message).toString().slice(0, 500)}`); process.exit(1); }
    const allRows = matchOut.result?.records ?? [];
    const matches = allRows.filter((r) => r.ApiIdentifier?.startsWith(`${prefix}:`) && r.ApiIdentifier.includes(target));
    if (matches.length === 0) {
      const wantsConstruct = has("--construct");
      const standardServer = arg("--standard-server");
      if (prefix === "psmcps" && wantsConstruct) {
        // CONSTRUCT mode - psmcps only. The pattern (psmcps:<ns>.<server>:<operation>) is
        // documented and derivable (tool-backing-specs.md §1 row 3), and this project's own
        // [org]-confirmed timestamps (McpServerToolApiDefinition.CreatedDate landing 6 seconds
        // after the deploying McpServerDefinition's LastModifiedDate, for the existing soqlQuery
        // row) point at deploy itself minting the catalog row, not a prior manual Setup click.
        // Still an open question, not a proven guarantee - say so loudly, every time, so the
        // operator knows this identifier hasn't been adopted from a known-good row.
        if (!standardServer) {
          console.error(`FAILED: --construct requires --standard-server <ns.server>, e.g. platform.sobject-mutations.`);
          console.error(`  (${target} alone is just the operation name - construct mode needs the server too.)`);
          process.exit(1);
        }
        identifier = `psmcps:${standardServer}:${target}`;
        adoptedOperation = target;
        console.log(`CONSTRUCTED (not adopted): ${identifier}`);
        console.log(`  No existing McpServerToolApiDefinition row matched "${target}" - this identifier was`);
        console.log(`  built from the documented pattern, not copied from a known-good row. Unconfirmed until`);
        console.log(`  this deploy succeeds AND the tool is actually callable - verify both, don't assume.`);
      } else {
        console.error(`FAILED: no existing "${prefix}:" identifier containing "${target}" found anywhere in ${org}.`);
        if (prefix === "psmcps") {
          console.error(`  Two ways forward: add this standard-server tool to ANY custom server once via Setup's`);
          console.error(`  tool picker first, then re-run to adopt it (verified-safe) - OR pass`);
          console.error(`  --construct --standard-server <ns.server> to build the identifier from the documented`);
          console.error(`  pattern directly and let the deploy itself be the test (see script header comment).`);
        } else {
          console.error(`  ${prefix}: identifiers can't be hand-constructed - add this standard-server tool to ANY`);
          console.error(`  custom server once via Setup's tool picker first (that mints the real identifier),`);
          console.error(`  then re-run this command to adopt it onto ${serverName || "<McpServerDefName>"}.`);
        }
        process.exit(1);
      }
    } else if (matches.length > 1) {
      console.error(`FAILED: ${matches.length} existing "${prefix}:" identifiers match "${target}" - ambiguous:`);
      matches.forEach((m) => console.error(`  ${m.ApiIdentifier}  (Operation: ${m.Operation})`));
      console.error(`  Narrow --match-text to a substring unique to the one you want, then re-run.`);
      process.exit(1);
    } else {
      identifier = matches[0].ApiIdentifier;
      adoptedOperation = matches[0].Operation;
      console.log(`OK - adopted ${identifier} (Operation: ${adoptedOperation})`);
    }

    if (prefix === "psmcps") {
      // psmcps:<ns>.<server>:<operation> re-serves a PLATFORM_STANDARD_MCP_SERVER tool - and per the
      // shipped example asset (AccountWithOpportunity.mcpServerDefinition-meta.xml), "the standard
      // server must be activated in its own right." That's a real, checkable precondition here:
      // GET /api-catalog/apis lists every PLATFORM_STANDARD_MCP_SERVER entry with a real
      // properties.isActive flag (McpServerAccess.Active, surfaced through this endpoint) - <ns>.<server>
      // (the middle segment of the identifier) IS that entry's "id" verbatim, so no guessing is needed.
      // NOTE: this check does NOT apply to "ct" - Connect-sourced api-catalog entries carry
      // providerType: CONNECT with an empty properties: {} (no isActive at all, [org]-confirmed) -
      // ct: tools are backed by managed/native Connect resources, not by a togglable standard MCP
      // server, so there's nothing here to check for that prefix.
      const nsServer = identifier.split(":")[1];
      try {
        const catalogOut = JSON.parse(sf(["api", "request", "rest", `/services/data/v${arg("--api-version", "67.0")}/api-catalog/apis`, "--target-org", org]));
        const apis = catalogOut?.body?.apis ?? catalogOut?.apis ?? [];
        const srcEntry = apis.find((a) => a.id === nsServer && a.providerType === "PLATFORM_STANDARD_MCP_SERVER");
        if (srcEntry && srcEntry.properties?.isActive === false) {
          console.error(`FAILED: source standard server "${nsServer}" is NOT active (McpServerAccess.Active = false).`);
          console.error(`  Activate it first: Setup -> Quick Find "MCP Servers" -> ${nsServer.split(".")[1] ?? nsServer} -> Activate.`);
          console.error(`  A psmcps: tool re-serving an inactive standard server will not function even though this identifier exists.`);
          process.exit(1);
        }
        if (!srcEntry) {
          console.log(`NOTE - could not find "${nsServer}" as a PLATFORM_STANDARD_MCP_SERVER row in api-catalog/apis; skipping the activation check (proceeding on the adopted identifier as-is).`);
        } else {
          console.log(`OK - source standard server "${nsServer}" is active.`);
        }
      } catch (e) {
        console.log(`NOTE - activation check against api-catalog/apis failed (${(e.stdout ?? e.message).toString().slice(0, 200)}); proceeding without it.`);
      }
    }
  } else {
    identifier = `${prefix}:${identifierBody}`;
    adoptedOperation = operation;
  }
  const finalOperation = adoptedOperation;
  const serverPath = `${MCP_DIR}/${serverName}.mcpServerDefinition-meta.xml`;
  if (!existsSync(serverPath)) { console.error(`Server definition not found locally: ${serverPath} - retrieve it first.`); process.exit(1); }

  // --ui-resource-name/--ui-envelope-clt: OPTIONAL HXL widget binding. See the script header
  // comment for the full pattern and references/hxl-ui-resource-wiring.md for the metadata-type
  // breakdown. This only WIRES an already-built widget/CLT trio - it never authors them.
  const uiResourceName = arg("--ui-resource-name");
  const uiEnvelopeClt = arg("--ui-envelope-clt");
  const uiResourceTitle = arg("--ui-resource-title", uiResourceName ? `${uiResourceName} Resource` : undefined);
  let uiResourceBlock = "";
  let uiResourceTag = "";
  if (uiResourceName || uiEnvelopeClt) {
    if (!uiResourceName || !uiEnvelopeClt) {
      console.error("FAILED: --ui-resource-name and --ui-envelope-clt must be passed together (both or neither).");
      process.exit(1);
    }
    const envelopeCltPath = `${REPO}/force-app/main/default/${LIGHTNING_TYPES_DIR_NAME}/${uiEnvelopeClt}/schema.json`;
    if (!existsSync(envelopeCltPath)) {
      console.error(`FAILED: envelope LightningTypeBundle "${uiEnvelopeClt}" not found locally at ${envelopeCltPath}.`);
      console.error(`  --ui-envelope-clt must name an EXISTING envelope CLT bundle directory (deploy it first) -`);
      console.error(`  this script wires an already-built widget, it doesn't create one. See`);
      console.error(`  references/hxl-ui-resource-wiring.md.`);
      process.exit(1);
    }
    console.log(`OK - envelope LightningTypeBundle "${uiEnvelopeClt}" found locally.`);
    uiResourceTag = `        <uiResource>${esc(uiResourceName)}</uiResource>\n`;
    uiResourceBlock = `    <resources>
        <resourceName>${esc(uiResourceName)}</resourceName>
        <resourceUri>ui://widget/lightningType/c__${esc(uiEnvelopeClt)}</resourceUri>
        <resourceTitle>${esc(uiResourceTitle)}</resourceTitle>
        <description>Backs the widget-referencing CLT (c__${esc(uiEnvelopeClt)}) for the ${esc(target)} tool.</description>
    </resources>
`;
  }

  const existing = readFileSync(serverPath, "utf8");
  const toolBlock = `    <tools>
        <apiDefinition>
            <apiIdentifier>${esc(identifier)}</apiIdentifier>
            <apiSource>API_CATALOG</apiSource>
            <operation>${esc(finalOperation)}</operation>
        </apiDefinition>
        <descriptionOverride>${esc(fullDescription)}</descriptionOverride>
        <destructive>${destructiveArg}</destructive>
        <idempotent>${idempotentArg}</idempotent>
        <openWorld>${openWorldArg}</openWorld>
        <readOnly>${readOnlyArg}</readOnly>
        <returnDirect>false</returnDirect>
        <toolName>${esc(target)}Tool</toolName>
        <toolTitle>${esc(target)}</toolTitle>
${uiResourceTag}    </tools>
${uiResourceBlock}</McpServerDefinition>`;
  const updated = existing.replace(/<\/McpServerDefinition>\s*$/, toolBlock + "\n");
  writeFileSync(serverPath, updated);
  console.log(`OK - appended ${identifier} to ${serverName}${uiResourceName ? ` (wired to widget resource "${uiResourceName}")` : ""}`);
  const ok = dryRunValidate(serverPath);
  if (ok && has("--deploy")) realDeploy(serverPath);

} else if (cmd === "add-prompt") {
  // The <prompts> element is a DIFFERENT primitive from <tools> - no apiDefinition, no annotations
  // (readOnly/destructive/etc. are tool-only, per tool-backing-specs.md's "two exposure models").
  // It has no per-argument description field at all: the arguments[] schema an MCP client sees is
  // auto-derived from the GenAiPromptTemplate's own inputs[] (apiName only - the description field
  // does NOT surface here either, same gap as the <tools> path). descriptionOverride is therefore
  // the ONLY place to put input-format guidance for this exposure model too.
  const target = sub; // TemplateDeveloperName (add-prompt has no ae|ar|nq|pr sub-selector)
  const serverName = arg("--server");
  const description = arg("--description");
  const returns = arg("--returns");
  const promptTitle = arg("--prompt-title", target);
  if (!target || !serverName || !description || !returns) {
    console.error("usage:");
    console.error("  node mcpserverdef-toolkit.mjs add-prompt <TemplateDeveloperName> --description <what it does + input format notes> --returns <what it returns> --server <McpServerDefName> [--prompt-title <title>] [--org <alias>] [--deploy]");
    console.error("");
    console.error("--description and --returns are BOTH REQUIRED, same rationale as add-tool - see that");
    console.error("command's usage text. <prompts> entries have NO annotations and NO per-argument");
    console.error("description field, so descriptionOverride carries even more weight here.");
    process.exit(1);
  }
  console.log(`[add-prompt] verifying GenAiPromptTemplate "${target}" exists in ${org} ...`);
  let listOut;
  try {
    listOut = JSON.parse(sf(["org", "list", "metadata", "--metadata-type", "GenAiPromptTemplate", "--json", "--target-org", org]));
  } catch (e) { console.error(`Metadata list failed: ${(e.stdout ?? e.message).toString().slice(0, 500)}`); process.exit(1); }
  const found = (listOut.result ?? []).some((r) => r.fullName === target);
  if (!found) {
    console.error(`FAILED: no GenAiPromptTemplate named "${target}" found in ${org}.`);
    console.error(`  Deploy it first (force-app/main/default/genAiPromptTemplates/).`);
    process.exit(1);
  }
  console.log(`OK - ${target} exists. (Publish/active status isn't checkable via a Tooling sObject for`);
  console.log(`  this type - retrieve the file and confirm <status>Published</status> and a real`);
  console.log(`  <activeVersionIdentifier> manually if this wasn't just deployed/activated.)`);

  const fullDescription = `${description} Returns: ${returns}`;
  const serverPath = `${MCP_DIR}/${serverName}.mcpServerDefinition-meta.xml`;
  if (!existsSync(serverPath)) { console.error(`Server definition not found locally: ${serverPath} - retrieve it first.`); process.exit(1); }

  const existing = readFileSync(serverPath, "utf8");
  const promptBlock = `    <prompts>
        <descriptionOverride>${esc(fullDescription)}</descriptionOverride>
        <promptName>${esc(target)}</promptName>
        <promptTemplateName>${esc(target)}</promptTemplateName>
        <promptTitle>${esc(promptTitle)}</promptTitle>
    </prompts>
</McpServerDefinition>`;
  const updated = existing.replace(/<\/McpServerDefinition>\s*$/, promptBlock + "\n");
  writeFileSync(serverPath, updated);
  console.log(`OK - appended <prompts> entry for ${target} to ${serverName}`);
  const ok = dryRunValidate(serverPath);
  if (ok && has("--deploy")) realDeploy(serverPath);

} else {
  console.error(`usage:
  node mcpserverdef-toolkit.mjs add-tool ae|ar <ClassName> --operation <RealMethodName> --description <...> --returns <...> --server <McpServerDefName> [--org <alias>] [--deploy]
  node mcpserverdef-toolkit.mjs add-tool nq <QueryName> --description <...> --returns <...> --server <McpServerDefName> [--operation <override>] [--org <alias>] [--deploy]
  node mcpserverdef-toolkit.mjs add-tool pr <TemplateDeveloperName> --description <...> --returns <...> --server <McpServerDefName> [--operation <override>] [--org <alias>] [--deploy]
  node mcpserverdef-toolkit.mjs add-prompt <TemplateDeveloperName> --description <...> --returns <...> --server <McpServerDefName> [--prompt-title <title>] [--org <alias>] [--deploy]`);
  process.exit(1);
}
