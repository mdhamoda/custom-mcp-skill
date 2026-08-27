#!/usr/bin/env node
// pkce-mcp-test.mjs — the reusable PKCE-to-MCP-call test harness eca-and-testing.md §2.4 documents.
// Runs the ORG SIDE (already deployed) end-to-end against a real Salesforce-hosted MCP server:
//   1. Generate PKCE verifier/challenge + a random state.
//   2. Start a local callback listener on http://localhost:1717/OauthRedirect (must already be
//      registered on the ECA's callbackUrl — see eca-and-testing.md §1.2, now the default for
//      every ECA this skill builds, specifically so this script always has somewhere to land).
//   3. Open the org's authorize URL in the default browser. This is the ONE human step (log in,
//      click Allow) — eca-and-testing.md §2.2 rule 3, not automatable, and this script does not
//      try to be. Everything before and after that click is scripted.
//   4. Exchange the returned code + verifier for tokens, persist them locally.
//   5. Drive the MCP JSON-RPC handshake: initialize -> notifications/initialized -> tools/list ->
//      optional tools/call, per eca-and-testing.md §2.1.
//
// On a rerun with a saved token file present, steps 2-4 are skipped entirely (refreshed via the
// refresh_token if needed) — "no re-consent", per §2.4.
//
// Usage:
//   node pkce-mcp-test.mjs --server <mcp-gateway-url> --instance <org-domain> --client-id <consumerKey>
//   node pkce-mcp-test.mjs --server <url> --instance <domain> --client-id <key> --tool <toolName> [--args '{"k":"v"}']
//   node pkce-mcp-test.mjs --server <url> --instance <domain> --client-id <key> --tool toolA --tool toolB
//
// --instance and --client-id can also come from env vars SF_INSTANCE_URL / SF_CONSUMER_KEY, so
// they don't have to be pasted on the command line every time.
//
// Token file: .pkce-mcp-token.<server-basename>.json in the current working directory.
// 🔐 Holds a LIVE access + refresh token. Not written by this script into any tracked directory,
// but make sure your project's .gitignore covers `.pkce-mcp-token.*.json` before running this
// anywhere near a repo. Delete the file when you're done testing.

import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { exec } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { URL } from 'node:url';

const CALLBACK_PORT = 1717;
const CALLBACK_PATH = '/OauthRedirect';
const CALLBACK_URL = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;

function parseArgs(argv) {
    const args = { tools: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--server') args.server = argv[++i];
        else if (a === '--instance') args.instance = argv[++i];
        else if (a === '--client-id') args.clientId = argv[++i];
        else if (a === '--tool') args.tools.push(argv[++i]);
        else if (a === '--args') args.toolArgs = argv[++i];
        else if (a === '--list-only') args.listOnly = true;
    }
    args.instance ??= process.env.SF_INSTANCE_URL;
    args.clientId ??= process.env.SF_CONSUMER_KEY;
    if (!args.server || !args.instance || !args.clientId) {
        console.error(
            'Usage: node pkce-mcp-test.mjs --server <mcp-gateway-url> --instance <org-domain> ' +
                '--client-id <consumerKey> [--tool <name> [--args \'{"k":"v"}\']]... [--list-only]\n' +
                '(--instance / --client-id may come from SF_INSTANCE_URL / SF_CONSUMER_KEY instead)'
        );
        process.exit(1);
    }
    return args;
}

function base64url(buf) {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function tokenFilePath(serverUrl) {
    const base = serverUrl.replace(/[^a-zA-Z0-9]+/g, '_').slice(-60);
    return `.pkce-mcp-token.${base}.json`;
}

function openBrowser(url) {
    const cmd =
        process.platform === 'win32'
            ? `start "" "${url}"`
            : process.platform === 'darwin'
              ? `open "${url}"`
              : `xdg-open "${url}"`;
    exec(cmd, (err) => {
        if (err) {
            console.log('Could not auto-open a browser. Open this URL manually:\n' + url);
        }
    });
}

async function authorizeAndGetToken(instance, clientId) {
    const verifier = base64url(randomBytes(64)).slice(0, 128);
    const challenge = base64url(createHash('sha256').update(verifier).digest());
    const state = base64url(randomBytes(16));

    const authorizeUrl =
        `${instance}/services/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&scope=${encodeURIComponent('mcp_api refresh_token')}` +
        `&code_challenge=${challenge}&code_challenge_method=S256&state=${state}`;

    const code = await new Promise((resolve, reject) => {
        const server = createServer((req, res) => {
            const url = new URL(req.url, CALLBACK_URL);
            if (url.pathname !== CALLBACK_PATH) {
                res.writeHead(404).end();
                return;
            }
            const returnedState = url.searchParams.get('state');
            const returnedCode = url.searchParams.get('code');
            const error = url.searchParams.get('error');
            res.writeHead(200, { 'Content-Type': 'text/html' });
            if (error) {
                res.end(`<html><body>Authorization failed: ${error}. You can close this window.</body></html>`);
                server.close();
                reject(new Error(`Authorization error: ${error} — ${url.searchParams.get('error_description') ?? ''}`));
                return;
            }
            if (returnedState !== state) {
                res.end('<html><body>State mismatch — possible CSRF. You can close this window.</body></html>');
                server.close();
                reject(new Error('OAuth state mismatch — aborting.'));
                return;
            }
            res.end('<html><body>Authorized. You can close this window and return to the terminal.</body></html>');
            server.close();
            resolve(returnedCode);
        });
        server.listen(CALLBACK_PORT, () => {
            console.log(`Listening on ${CALLBACK_URL} — opening browser for the one-time consent step...`);
            openBrowser(authorizeUrl);
        });
        server.on('error', reject);
    });

    const tokenResp = await fetch(`${instance}/services/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: clientId,
            redirect_uri: CALLBACK_URL,
            code_verifier: verifier
        })
    });
    if (!tokenResp.ok) {
        throw new Error(`Token exchange failed: ${tokenResp.status} ${await tokenResp.text()}`);
    }
    return tokenResp.json();
}

async function refreshToken(instance, clientId, refresh_token) {
    const resp = await fetch(`${instance}/services/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token })
    });
    if (!resp.ok) return null;
    const fresh = await resp.json();
    return { ...fresh, refresh_token: fresh.refresh_token ?? refresh_token };
}

async function getAccessToken(instance, clientId, serverUrl) {
    const path = tokenFilePath(serverUrl);
    if (existsSync(path)) {
        const saved = JSON.parse(readFileSync(path, 'utf8'));
        const refreshed = await refreshToken(instance, clientId, saved.refresh_token);
        if (refreshed) {
            writeFileSync(path, JSON.stringify(refreshed, null, 2));
            console.log('Reused saved refresh token — no browser consent needed this run.');
            return refreshed.access_token;
        }
        console.log('Saved token could not be refreshed — falling back to a fresh authorization.');
    }
    const token = await authorizeAndGetToken(instance, clientId);
    writeFileSync(path, JSON.stringify(token, null, 2));
    return token.access_token;
}

function parseMaybeSse(text) {
    const line = text
        .split('\n')
        .find((l) => l.startsWith('data:'));
    return JSON.parse(line ? line.slice(5).trim() : text);
}

async function mcpCall(serverUrl, accessToken, sessionId, method, params, isNotification = false) {
    const body = { jsonrpc: '2.0', method, params: params ?? {} };
    if (!isNotification) body.id = Math.floor(Math.random() * 1e9);

    const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${accessToken}`
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;

    const resp = await fetch(serverUrl, { method: 'POST', headers, body: JSON.stringify(body) });
    const newSessionId = resp.headers.get('mcp-session-id') ?? sessionId;

    if (isNotification) {
        return { status: resp.status, sessionId: newSessionId };
    }
    const text = await resp.text();
    return { status: resp.status, sessionId: newSessionId, json: text ? parseMaybeSse(text) : null };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const accessToken = await getAccessToken(args.instance, args.clientId, args.server);

    const init = await mcpCall(args.server, accessToken, undefined, 'initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'pkce-mcp-test', version: '1.0.0' }
    });
    if (init.status !== 200) {
        throw new Error(`initialize failed: ${init.status} ${JSON.stringify(init.json)}`);
    }
    console.log('initialize OK — serverInfo:', JSON.stringify(init.json?.result?.serverInfo ?? init.json));
    const sessionId = init.sessionId;
    if (!sessionId) throw new Error('No Mcp-Session-Id header returned from initialize.');

    await mcpCall(args.server, accessToken, sessionId, 'notifications/initialized', {}, true);

    const list = await mcpCall(args.server, accessToken, sessionId, 'tools/list', {});
    const tools = list.json?.result?.tools ?? [];
    console.log(`tools/list OK — ${tools.length} tool(s): ${tools.map((t) => t.name).join(', ')}`);

    if (args.listOnly || args.tools.length === 0) return;

    const toolArgs = args.toolArgs ? JSON.parse(args.toolArgs) : {};
    for (const toolName of args.tools) {
        const call = await mcpCall(args.server, accessToken, sessionId, 'tools/call', {
            name: toolName,
            arguments: toolArgs
        });
        console.log(`\ntools/call ${toolName} -> status ${call.status}`);
        console.log(JSON.stringify(call.json?.result ?? call.json, null, 2));
    }
}

main().catch((err) => {
    console.error('FAILED:', err.message);
    process.exit(1);
});
