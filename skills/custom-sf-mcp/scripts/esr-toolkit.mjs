// esr-toolkit.mjs — the complete, reusable, VS-Code-free path from an Apex class, a SOQL query,
// or a genuine external API to a working MCP-server-exposable ExternalServiceRegistration, for
// ANY future project.
//
// Covers all FOUR ExternalServiceRegistration/related backing types this investigation
// established, not just the two the salesforcedx-vscode-apex-oas extension itself implements:
//   aura       - real org endpoint GET /specifications/oas3/apex/{Class} (deterministic, no LLM)
//   apexrest   - deterministic reflection (urlMapping + @Http* methods) + placeholder content,
//                because the real tool's content step is LLM-driven and that LLM is not always
//                available - never silently invented; every placeholder is marked x-PLACEHOLDER
//   namedquery - NOT part of the apex-oas extension at all (confirmed absent from its bundle).
//                Named Query API is a separate Setup-native feature (docs-capture 22) with its
//                own metadata type (ApiNamedQuery). CONFIRMED [org], this project: do NOT hand-author
//                an ExternalServiceRegistration for this type - the real one is generated
//                server-side when you click "Activate" on the query in Setup > API Catalog, and
//                its schema (live org domain in servers[].url, a /named/query/{Name} path, and a
//                response schema reflected field-by-field off the query's actual SELECT list
//                against live object describes) is not something a script can replicate offline.
//                A hand-authored attempt was tried and left permanently Status:Incomplete - the
//                DeveloperName even collided oddly with the real one (both get a "_nquery" suffix
//                off the label). This mode now deploys ONLY the ApiNamedQuery and tells you to
//                activate it manually - that IS the correct, complete procedure for this type.
//   custom     - registrationProviderType Custom: a GENUINE external API (not a same-org Apex
//                class), bound via a NamedCredential. Unlike the other three, this type is
//                platform-generated for NOTHING - the doc's own table (external-service-
//                registration.md §6.0) calls it "Yes, hand-authored" - so this mode authors both
//                the NamedCredential (no-auth only; anything else needs hand-editing, auth is out
//                of scope for a script) and the ExternalServiceRegistration, and deploys them
//                TOGETHER (Status only reaches Complete once both are valid and bound - §6.1).
//                Schema comes from EITHER a real spec file (--openapi-file, embedded verbatim,
//                never parsed - keep --op-id in sync with it yourself) OR synthesized placeholder
//                operations (--op id:verb:path, same x-PLACEHOLDER discipline as apexrest mode).
//                This mode still stops short of the Apex wrapper: the generated
//                ExternalService.<Label> method/type names are minted by the platform AFTER
//                deploy and must be captured from Setup's Apex Class Viewer, never guessed (§6.2)
//                - hand-write the @InvocableMethod wrapper, then wire it with mcpserverdef-toolkit
//                like any other aa: tool.
//
// There is no VS Code fallback: this environment cannot drive the VS Code command palette or UI.
// Where a step is genuinely LLM-authored in the real tool (apexrest content), the honest fallback
// is a clearly-marked placeholder, not a fabricated extension call.
//
// SOURCE-FIRST, ALWAYS: every mode writes real files under force-app/main/default/ and dry-run
// validates them. Nothing is ever created directly via Tooling API create/PATCH by this script -
// that was last session's mistake and is exactly what this script exists to stop repeating.
// Real deploy only happens with --deploy, and only after the dry-run succeeds.
//
// IF THIS SCRIPT STARTS FAILING (Salesforce changes required fields, changes an endpoint's
// response shape, adds a new validation rule, etc.): the platform's own deploy validator error
// text is the first source of truth (it names the missing/wrong field directly, as it did
// repeatedly during this script's own development). If that's not enough, RE-INSPECT the current
// salesforcedx-vscode-apex-oas extension bundle - it is not obfuscated, only minified, so string
// search against its dist/index.js remains a legitimate diagnostic technique:
//   ~/.vscode/extensions/salesforce.salesforcedx-vscode-apex-oas-<version>/dist/index.js
// Check the installed version first (a newer one may already reflect whatever changed) and treat
// every finding as a HYPOTHESIS to cross-verify against a real dry-run - reading the bundle alone,
// without that verification step, produced at least one wrong conclusion during this script's own
// development (a misattributed Spectral validation rule). Don't skip the verification step.
//
// Usage:
//   node esr-toolkit.mjs esr aura <ClassName> [--org <alias>] [--deploy]
//   node esr-toolkit.mjs esr apexrest <ClassName> --cls-file <path> [--org <alias>] [--deploy]
//   node esr-toolkit.mjs esr namedquery <QueryApiName> --soql "<SOQL>" --label "<label>"
//        --description "<desc>" [--param name:label:description ...] [--org <alias>] [--deploy]
//   node esr-toolkit.mjs esr custom <Label> (--nc-name <existing NC> | --endpoint <url> [--new-nc-name <name>])
//        (--openapi-file <path> --op-id <operationId> [--op-id ...] | --op <operationId>:<verb>:<path> [--op ...])
//        [--title <title>] [--description "<desc>"] [--org <alias>] [--deploy]
//
// This script only builds the BACKING (ExternalServiceRegistration/ApiNamedQuery/NamedCredential)
// - it never touches McpServerDefinition, and for custom it never touches the post-deploy Apex
// wrapper either. Once a backing is built (and, for namedquery, manually Activated in Setup ->
// API Catalog - see that mode's own notes below; for custom, once the ExternalService.* wrapper
// is hand-written per §6.2-6.3), wire it onto a server's tool list with the sibling script:
// node mcpserverdef-toolkit.mjs add-tool ae|ar|nq|aa ...

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const HERE = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
// HERE = .../.claude/skills/custom-sf-mcp/scripts/ -- reaching the actual project root
// needs 4 directory levels up (scripts -> custom-sf-mcp -> skills -> .claude -> repo root),
// not 2. A 2-level `${HERE}/../..` silently lands inside .claude/skills/ instead of erroring -
// mkdirSync's recursive:true creates the wrong nested folder without complaint, so every file
// this script writes ends up at .claude/skills/force-app/... unless this is exactly right. Same
// bug, same fix, as the sibling script (mcpserverdef-toolkit.mjs) already documents for itself -
// this file just hadn't received it. Re-check this constant first if paths look wrong again.
const REPO = `${HERE}/../../../..`;
const ESR_DIR = `${REPO}/force-app/main/default/externalServiceRegistrations`;
const NQ_DIR = `${REPO}/force-app/main/default/apiNamedQueries`;
const NC_DIR = `${REPO}/force-app/main/default/namedCredentials`;

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
function argAll(flag) {
  const out = [];
  process.argv.forEach((a, i) => { if (a === flag) out.push(process.argv[i + 1]); });
  return out;
}
const has = (flag) => process.argv.includes(flag);

const org = arg("--org");
if (!org) { console.error("Missing required flag: --org <alias>"); process.exit(1); }
const sf = (args) => execFileSync("sf", args, { encoding: "utf8", shell: process.platform === "win32" });
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function computeOperations(oasDoc) {
  const ops = [], seen = new Set();
  for (const pathItem of Object.values(oasDoc.paths ?? {})) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const op of Object.values(pathItem)) {
      const id = op?.operationId;
      if (id && !seen.has(id)) { seen.add(id); ops.push({ name: id.toLowerCase(), active: true }); }
    }
  }
  return ops;
}

function toYaml(v, indent = 0) {
  const pad = "  ".repeat(indent);
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    return v.map((x) => `${pad}- ${toYaml(x, indent + 1).replace(/^\s+/, "")}`).join("\n");
  }
  if (v && typeof v === "object") {
    const keys = Object.keys(v);
    if (!keys.length) return "{}";
    return keys.map((k) => {
      const val = v[k];
      const keyStr = /^\d+$/.test(k) || /^[@"]|:/.test(k) ? JSON.stringify(k) : k;
      if (val && typeof val === "object" && Object.keys(val).length) return `${pad}${keyStr}:\n${toYaml(val, indent + 1)}`;
      return `${pad}${keyStr}: ${toYaml(val, indent + 1)}`;
    }).join("\n");
  }
  if (typeof v === "string") return /[:#{}\[\],&*!|>'"%@`]/.test(v) || v === "" ? JSON.stringify(v) : v;
  return String(v);
}

// `assetName` is the ACTUAL API/DeveloperName of the thing being registered (ApexClass name, or
// ApiNamedQuery API name) - `registrationProviderAsset` must match it exactly `[org]` ("no
// ApiNamedQuery named <X> found" when a display label was passed instead). `label` is purely
// cosmetic (Setup UI display). They coincide for ae:/ar: (the class name serves as both) but
// MUST be kept distinct for namedquery, where a human label and an API name commonly differ.
function buildEsrXml({ label, assetName, namedCredential, oasYaml, operations, registrationProviderType, description, includeSchema = true, includeOperations = true, includeServiceBinding = true, includeAsset = true }) {
  // includeOperations/includeServiceBinding default true (ApexRest/NamedQuery's real generated
  // shapes have both) but AuraEnabled's real VS-Code-generated file (this project, user-provided,
  // compared directly against a live org) has NEITHER - confirmed [org] via byte-for-byte diff
  // against force-app/main/default/externalServiceRegistrations/auto/*. Pass both false for aura.
  // includeAsset is false for custom: a Custom-type ESR isn't backed by a same-org Apex/Flow
  // asset, so it carries no <registrationProviderAsset> at all - confirmed [org] against the
  // VatComplyGeolocate worked example (assets/mcp-server/externalServiceRegistrations/).
  const opsXml = includeOperations ? operations.map((o) =>
    `    <operations>\n        <active>${o.active}</active>\n        <name>${esc(o.name)}</name>\n    </operations>`
  ).join("\n") : "";
  const ncXml = namedCredential ? `\n    <namedCredential>${esc(namedCredential)}</namedCredential>` : "";
  const assetXml = includeAsset ? `\n    <registrationProviderAsset>${esc(assetName)}</registrationProviderAsset>` : "";
  const schemaBlock = includeSchema ? `
    <schema>${esc(oasYaml).trimEnd()}
</schema>
    <schemaType>OpenApi3</schemaType>
    <schemaUploadFileExtension>yaml</schemaUploadFileExtension>
    <schemaUploadFileName>${assetName.toLowerCase()}_openapi</schemaUploadFileName>` : "";
  const serviceBindingXml = includeServiceBinding
    ? `\n    <serviceBinding>${esc('{"host":"","basePath":"/","allowedSchemes":[],"requestMediaTypes":[],"responseMediaTypes":[],"compatibleMediaTypes":{},"integrationFlags":null,"extensions":{}}')}</serviceBinding>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by scripts/esr-toolkit.mjs (${registrationProviderType} mode). -->
<ExternalServiceRegistration xmlns="http://soap.sforce.com/2006/04/metadata">
    <description>${esc(description)}</description>
    <label>${esc(label)}</label>${ncXml}
${opsXml}${assetXml}
    <registrationProviderType>${registrationProviderType}</registrationProviderType>${schemaBlock}${serviceBindingXml}
</ExternalServiceRegistration>
`;
}

// Accepts a single path (existing callers) or an array of paths (custom mode, which must deploy
// the NamedCredential and the ExternalServiceRegistration TOGETHER - Status only reaches Complete
// once both are valid and bound, per external-service-registration.md §6.1).
function toSourceDirArgs(paths) {
  return (Array.isArray(paths) ? paths : [paths]).flatMap((p) => ["--source-dir", p]);
}
function dryRunValidate(paths) {
  console.log(`\nValidating (dry-run, no deploy) ...`);
  try {
    sf(["project", "deploy", "start", "--dry-run", "-l", "NoTestRun", ...toSourceDirArgs(paths), "--target-org", org]);
    console.log("Dry-run: Succeeded.");
    return true;
  } catch (e) {
    console.log("Dry-run: FAILED —");
    console.log((e.stdout ?? e.message).toString().slice(0, 2000));
    return false;
  }
}
function realDeploy(paths) {
  console.log(`\nDeploying for real ...`);
  sf(["project", "deploy", "start", "-l", "NoTestRun", ...toSourceDirArgs(paths), "--target-org", org]);
  console.log("Deployed.");
}

const [, , cmd, sub, name] = process.argv;

if (cmd === "esr" && sub === "aura") {
  const className = name;
  console.log(`[esr aura] fetching real org-generated spec for ${className} from ${org} ...`);
  const accessToken = JSON.parse(sf(["org", "auth", "show-access-token", "--target-org", org, "--json"])).result.accessToken;
  const orgInfo = JSON.parse(sf(["org", "display", "--target-org", org, "--json"])).result;
  const res = await fetch(`${orgInfo.instanceUrl}/services/data/v${orgInfo.apiVersion ?? "67.0"}/specifications/oas3/apex/${className}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) { console.error(`FAILED: HTTP ${res.status}. Is ${className} deployed and @AuraEnabled?`); console.error(await res.text()); process.exit(1); }
  const oasDoc = await res.json();
  oasDoc.info = { ...oasDoc.info, version: "1.0.0" }; // real extension force-sets this after fetch (aOr)

  const operations = computeOperations(oasDoc);
  const yaml = toYaml(oasDoc);
  mkdirSync(ESR_DIR, { recursive: true });
  writeFileSync(`${ESR_DIR}/${className}.yaml`, yaml + "\n");
  writeFileSync(`${ESR_DIR}/${className}.externalServiceRegistration-meta.xml`, buildEsrXml({
    label: className, assetName: className, oasYaml: yaml, operations, registrationProviderType: "AuraEnabled",
    description: oasDoc.info?.description ?? `Generated from live org endpoint for ${className}`,
    includeOperations: false, includeServiceBinding: false,
  }));
  console.log(`OK - wrote ${className}.yaml + .externalServiceRegistration-meta.xml (org-authoritative, ${operations.length} op(s))`);
  const ok = dryRunValidate(`${ESR_DIR}/${className}.externalServiceRegistration-meta.xml`);
  if (ok && has("--deploy")) realDeploy(`${ESR_DIR}/${className}.externalServiceRegistration-meta.xml`);

} else if (cmd === "esr" && sub === "apexrest") {
  const className = name;
  const clsFile = arg("--cls-file");
  if (!clsFile) { console.error("esr apexrest requires --cls-file <path>"); process.exit(1); }
  console.log(`[esr apexrest] FALLBACK MODE - no LLM available. Deterministic extraction only; schemas are placeholders.`);

  const src = readFileSync(clsFile, "utf8");
  const urlMapping = src.match(/@RestResource\s*\(\s*urlMapping\s*=\s*['"]([^'"]+)['"]\s*\)/)?.[1] ?? `/${className}/`;
  const verbRe = /@Http(Get|Post|Put|Patch|Delete)\b[\s\S]*?\bstatic\s+[\w<>.\[\]]+\s+(\w+)\s*\(/g;
  const methods = [];
  let m;
  while ((m = verbRe.exec(src))) methods.push({ verb: m[1].toUpperCase(), name: m[2] });
  if (!methods.length) { console.error(`No @Http* annotated methods found in ${clsFile}`); process.exit(1); }

  const pathKey = "/" + urlMapping.replace(/^\/+|\/+$/g, "").replace(/\*$/, "{id}");
  const paths = {};
  for (const { verb, name: mName } of methods) {
    paths[pathKey] ??= {};
    paths[pathKey][verb.toLowerCase()] = {
      operationId: mName,
      description: "Default description for the operation.",
      requestBody: { description: "Default description for the requestBody.", required: false,
        content: { "application/json": { schema: { type: "object", "x-PLACEHOLDER": "LLM unavailable - fill in real parameter shape" } } } },
      responses: { "200": { description: "Default description for the response.",
        content: { "application/json": { schema: { type: "object", "x-PLACEHOLDER": "LLM unavailable - fill in real return shape" } } } } },
    };
  }
  const oasDoc = { openapi: "3.0.0", info: { title: className, description: `Fallback skeleton for ${className} - schemas need manual completion`, version: "1.0.0" },
    servers: [{ url: "/services/apexrest" }], paths };
  const operations = computeOperations(oasDoc);
  const yaml = toYaml(oasDoc);
  mkdirSync(ESR_DIR, { recursive: true });
  writeFileSync(`${ESR_DIR}/${className}.yaml`, yaml + "\n");
  writeFileSync(`${ESR_DIR}/${className}.externalServiceRegistration-meta.xml`, buildEsrXml({
    label: className, assetName: className, oasYaml: yaml, operations, registrationProviderType: "ApexRest",
    description: `Fallback-generated (no LLM) from ${clsFile}`,
  }));
  console.log(`OK - wrote ${className}.yaml + .externalServiceRegistration-meta.xml`);
  console.log(`⚠️  ${methods.length} method(s) found; ALL request/response schemas are placeholders - review before deploying.`);
  const ok = dryRunValidate(`${ESR_DIR}/${className}.externalServiceRegistration-meta.xml`);
  if (ok && has("--deploy")) realDeploy(`${ESR_DIR}/${className}.externalServiceRegistration-meta.xml`);

} else if (cmd === "esr" && sub === "namedquery") {
  const queryName = name;
  const soql = arg("--soql");
  const label = arg("--label", queryName);
  const description = arg("--description", `Named Query API: ${queryName}`);
  const paramSpecs = argAll("--param"); // name:label:description
  if (!soql) { console.error("esr namedquery requires --soql \"<SOQL with :param binds>\""); process.exit(1); }
  console.log(`[esr namedquery] authoring ApiNamedQuery + ExternalServiceRegistration for ${queryName}`);

  // 1. The ApiNamedQuery itself - doc-verified shape (docs-capture 22), not guessed.
  const params = paramSpecs.map((p) => {
    const [pName, pLabel, pDesc] = p.split(":");
    return `    <apiNamedQueryParameters>
        <description>${esc(pDesc ?? pName)}</description>
        <parameterLabel>${esc(pLabel ?? pName)}</parameterLabel>
        <parameterName>${esc(pName)}</parameterName>
    </apiNamedQueryParameters>`;
  }).join("\n");
  const nqXml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by scripts/esr-toolkit.mjs (namedquery mode). Shape from official docs
     (developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_named_query_vscode.htm),
     not reverse-engineered - this is the one backing type with a fully documented deploy path. -->
<ApiNamedQuery xmlns="http://soap.sforce.com/2006/04/metadata">
${params}
    <apiVersion>67.0</apiVersion>
    <body2>${esc(soql)}</body2>
    <description>${esc(description)}</description>
    <masterLabel>${esc(label)}</masterLabel>
</ApiNamedQuery>
`;
  mkdirSync(NQ_DIR, { recursive: true });
  writeFileSync(`${NQ_DIR}/${queryName}.apiNamedQuery-meta.xml`, nqXml);
  console.log(`OK - wrote ${queryName}.apiNamedQuery-meta.xml`);
  const nqOk = dryRunValidate(`${NQ_DIR}/${queryName}.apiNamedQuery-meta.xml`);
  if (nqOk && has("--deploy")) realDeploy(`${NQ_DIR}/${queryName}.apiNamedQuery-meta.xml`);

  // 2. The ExternalServiceRegistration wrapper - no OpenAPI schema needed for this type `[org]`.
  //    NOTE `[org]`: a raw Tooling API create of this shape returned DeveloperName suffixed
  //    "_nquery" automatically and Status stayed Incomplete even after adding schema fields -
  //    both UNRESOLVED. This script still authors it as real source (never as a Tooling API
  //    poke) so whatever the platform does with it is reproducible and diffable, not a one-off.
  const esrXml = buildEsrXml({
    label, assetName: queryName, oasYaml: "", operations: [], registrationProviderType: "NamedQuery",
    description: `ExternalServiceRegistration for Named Query ${queryName}`, includeSchema: false,
  });
  mkdirSync(ESR_DIR, { recursive: true });
  writeFileSync(`${ESR_DIR}/${queryName}.externalServiceRegistration-meta.xml`, esrXml);
  console.log(`OK - wrote ${queryName}.externalServiceRegistration-meta.xml`);
  console.log(`⚠️  KNOWN OPEN ISSUE: this registration type reached Status:Incomplete in this project's`);
  console.log(`   research and the DeveloperName may come back suffixed "_nquery" - both unresolved,`);
  console.log(`   see the skill proposal §9. Deploying it is still useful as a reproducible artifact.`);
  const esrOk = dryRunValidate(`${ESR_DIR}/${queryName}.externalServiceRegistration-meta.xml`);
  if (esrOk && has("--deploy")) realDeploy(`${ESR_DIR}/${queryName}.externalServiceRegistration-meta.xml`);

} else if (cmd === "esr" && sub === "custom") {
  const label = name;
  if (!label) { console.error("esr custom requires <Label>"); process.exit(1); }
  const endpoint = arg("--endpoint");
  const existingNc = arg("--nc-name");
  const newNcName = arg("--new-nc-name", label.replace(/[^A-Za-z0-9_]/g, ""));
  const description = arg("--description", `Custom ExternalServiceRegistration for ${label}`);
  const openapiFile = arg("--openapi-file");
  const opSpecs = argAll("--op");     // operationId:verb:path -> synthesized placeholder schema
  const opIdsRaw = argAll("--op-id"); // operationId only -> paired with a real --openapi-file

  if (!existingNc && !endpoint) {
    console.error("esr custom requires --nc-name <existing NamedCredential> or --endpoint <url> (to author a new no-auth one)");
    process.exit(1);
  }
  if (!openapiFile && !opSpecs.length) {
    console.error(`esr custom requires either:
  --openapi-file <path to a real OAS3 yaml/json> + --op-id <operationId> (repeatable)
  --op <operationId>:<verb>:<path> (repeatable) to synthesize a placeholder spec`);
    process.exit(1);
  }
  if (openapiFile && !opIdsRaw.length) {
    console.error("esr custom --openapi-file requires at least one --op-id <operationId> (the file is embedded verbatim, never parsed, so operationIds can't be derived from it)");
    process.exit(1);
  }

  console.log(`[esr custom] authoring Custom-type ExternalServiceRegistration '${label}' ${
    existingNc ? `(reusing Named Credential ${existingNc})`
               : `(authoring a new no-auth Named Credential ${newNcName} - hand-edit for real auth before pointing this at a non-public API)`}`);

  const filesToDeploy = [];
  const ncName = existingNc ?? newNcName;

  if (!existingNc) {
    // Minimal no-auth shape only (references/external-service-registration.md §6.1). Authenticated
    // APIs (OAuth, API key, Basic, ...) need a hand-authored NamedCredential - deliberately not
    // fabricated here; pass --nc-name to point this at one you've already deployed instead.
    mkdirSync(NC_DIR, { recursive: true });
    const ncPath = `${NC_DIR}/${newNcName}.namedCredential-meta.xml`;
    writeFileSync(ncPath, `<?xml version="1.0" encoding="UTF-8"?>
<NamedCredential xmlns="http://soap.sforce.com/2006/04/metadata">
    <label>${esc(newNcName)}</label>
    <namedCredentialType>Legacy</namedCredentialType>
    <endpoint>${esc(endpoint)}</endpoint>
    <principalType>Anonymous</principalType>
    <protocol>NoAuthentication</protocol>
</NamedCredential>
`);
    filesToDeploy.push(ncPath);
    console.log(`OK - wrote ${newNcName}.namedCredential-meta.xml (NoAuthentication/Anonymous)`);
  }

  let oasYaml, operations;
  if (openapiFile) {
    // Embedded verbatim (works for either YAML or JSON, since the XML <schema> field is just
    // escaped text) - never parsed, so keep --op-id in sync with the file's real operationIds
    // yourself. No servers: block requirement here either way - see the 🔴 warning below.
    oasYaml = readFileSync(openapiFile, "utf8");
    operations = opIdsRaw.map((id) => ({ name: id.toLowerCase(), active: true }));
    console.log(`[esr custom] embedding ${openapiFile} verbatim as the schema (not parsed).`);
  } else {
    const title = arg("--title", label);
    const paths = {};
    const opIds = [];
    for (const spec of opSpecs) {
      const [opId, verbRaw, pathRaw] = spec.split(":");
      if (!opId || !verbRaw || !pathRaw) { console.error(`--op must be <operationId>:<verb>:<path>, got "${spec}"`); process.exit(1); }
      paths[pathRaw] ??= {};
      paths[pathRaw][verbRaw.toLowerCase()] = {
        operationId: opId,
        description: "Default description for the operation.",
        responses: { "200": { description: "Successful response.",
          content: { "application/json": { schema: { type: "object", "x-PLACEHOLDER": "fill in the real response shape from the API's own docs" } } } } },
      };
      opIds.push(opId);
    }
    // No servers: block - matches the confirmed-working VatComplyGeolocate shape. Adding one with
    // callout:<Name> alongside <namedCredential> causes a real, reproducible double-resolved-URL
    // CalloutException at runtime (§6.1's 🔴 warning) - omit it entirely.
    const oasDoc = { openapi: "3.0.0", info: { title, description: `Placeholder spec for ${label} - schemas need manual completion from the real API's own docs`, version: "1.0.0" }, paths };
    oasYaml = toYaml(oasDoc);
    operations = opIds.map((id) => ({ name: id.toLowerCase(), active: true }));
    console.log(`⚠️  ${opIds.length} operation(s) synthesized as PLACEHOLDERS - review/replace request+response schemas before deploying for real use.`);
  }

  const assetName = label.replace(/[^A-Za-z0-9_]/g, "");
  mkdirSync(ESR_DIR, { recursive: true });
  const esrPath = `${ESR_DIR}/${assetName}.externalServiceRegistration-meta.xml`;
  writeFileSync(esrPath, buildEsrXml({
    label, assetName, namedCredential: ncName, oasYaml, operations, registrationProviderType: "Custom",
    description, includeAsset: false,
  }));
  filesToDeploy.push(esrPath);
  console.log(`OK - wrote ${assetName}.externalServiceRegistration-meta.xml`);

  console.log(`\n🔴 Status only reaches Complete once this ESR deploys TOGETHER with a valid, bound`);
  console.log(`   Named Credential (§6.1) - both files deploy together below, in one dry-run/deploy call.`);
  console.log(`   This script stops here: the ExternalService.${assetName} Apex wrapper method/type names`);
  console.log(`   are minted by the platform AFTER this deploy and must be captured from Setup's Apex`);
  console.log(`   Class Viewer, never guessed (§6.2) - hand-write the @InvocableMethod wrapper around it,`);
  console.log(`   then: node mcpserverdef-toolkit.mjs add-tool aa <WrapperClassName> ... --server <ServerName> --deploy`);

  const ok = dryRunValidate(filesToDeploy);
  if (ok && has("--deploy")) realDeploy(filesToDeploy);

} else {
  console.error(`usage:
  node esr-toolkit.mjs esr aura <ClassName> [--org <alias>] [--deploy]
  node esr-toolkit.mjs esr apexrest <ClassName> --cls-file <path> [--org <alias>] [--deploy]
  node esr-toolkit.mjs esr namedquery <QueryApiName> --soql "<SOQL>" --label "<label>" --description "<desc>" [--param name:label:desc ...] [--org <alias>] [--deploy]
  node esr-toolkit.mjs esr custom <Label> (--nc-name <existing NC> | --endpoint <url> [--new-nc-name <name>])
       (--openapi-file <path> --op-id <operationId> [--op-id ...] | --op <operationId>:<verb>:<path> [--op ...])
       [--title <title>] [--description "<desc>"] [--org <alias>] [--deploy]

For wiring a built/Activated backing onto an McpServerDefinition's tool list, see the sibling
script: node mcpserverdef-toolkit.mjs add-tool ae|ar|nq|aa ...`);
  process.exit(1);
}
