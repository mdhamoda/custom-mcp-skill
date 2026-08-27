# JWT Bearer self-callout ECA — example bundle

Deployable, **org-verified end to end**, five-file External Client App bundle for a tool that
needs to authenticate its **own outbound callout back into this same org**, running as the
**calling user** — not a human connecting to a hosted MCP server (that's `../README.md` /
`references/eca-and-testing.md` §1). Full narrative, every dead end included: **§5** of
`references/eca-and-testing.md`. Read that before reusing this bundle; this README is only the
mechanical "how to deploy it" companion.

## Files — deploy all five together

```text
certs/                       SelfCalloutJwtCert.crt-meta.xml   (+ a real .crt you generate, see step 1)
externalClientApps/          SelfCalloutClient.eca-meta.xml
extlClntAppGlobalOauthSets/  SelfCalloutClient.ecaGlblOauth-meta.xml
extlClntAppOauthSettings/    SelfCalloutClient.ecaOauth-meta.xml
extlClntAppOauthPolicies/    SelfCalloutClient_defaultPolicy.ecaOauthPlcy-meta.xml
extlClntAppPolicies/         SelfCalloutClient_defaultPolicy.ecaPlcy-meta.xml
```

Rename every `SelfCalloutClient` occurrence consistently across filenames and
`<externalClientApplication>` values, same rule as the human-consent bundle in `../`.

## Steps

1. **Generate any valid self-signed cert** (`openssl req -x509 -newkey rsa:2048 -nodes -keyout
   key.pem -out cert.crt -days 365 -subj "/CN=SelfCalloutJwtCert"`) and deploy it as the
   `Certificate` metadata component (`certs/`). The uploaded key material does **not** matter
   long-term — step 4 replaces it with the certificate Salesforce actually uses.
2. Deploy `externalClientApps/` + `extlClntAppGlobalOauthSets/` (with `certificate` left as
   whatever placeholder/first-pass value) + `extlClntAppOauthSettings/` together.
3. Retrieve the generated consumer key and put it in the calling Apex class:
   `sf project retrieve start --metadata ExtlClntAppGlobalOauthSettings:SelfCalloutClient -o <alias>`
4. **Retrieve the certificate Salesforce actually uses** (not the one from step 1) and paste its
   PEM body into `ecaGlblOauth-meta.xml`'s `<certificate>` field, then redeploy:
   `sf project retrieve start --metadata "Certificate:SelfCalloutJwtCert" -o <alias>`
   This step is the one that costs the most debugging time if skipped — see §5.4.
5. Deploy `extlClntAppOauthPolicies/` and `extlClntAppPolicies/` — fill in the real profile
   name(s) for whichever user(s) will actually trigger this tool (query
   `SELECT Username, Name, Profile.Name FROM User WHERE IsActive = true`, don't guess).
6. Wire the consumer key + certificate developer name into `JwtAuthHelper`-backed Apex (see
   `../../mcp-server/classes/JwtAuthHelper.cls` + `InvokeSalesforceApiAction.cls`).
7. Verify with a raw JWT + curl before trusting the Apex path — mint a JWT via anonymous Apex
   (`Auth.JWS(jwt, '<CertDeveloperName>').getCompactSerialization()`), then:
   ```bash
   curl -X POST "<org-domain>/services/oauth2/token" \
     -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" \
     --data-urlencode "assertion=<JWT>"
   ```
   Expect `invalid_client` if step 4 was skipped, `invalid_grant`/`invalid_request` if step 5 is
   incomplete, and a real `access_token` once both are done — see §5.5 for the exact two errors
   and fixes in order.

## Not the same bundle as `../` (the MCP-client-facing one)

| | This bundle (`jwt-bearer-self-callout/`) | `../` (human-consent) |
|---|---|---|
| Who authenticates | The tool's own outbound callout, as the calling user | A human/MCP client connecting to a hosted server |
| Flow | JWT Bearer, no browser | Authorization Code + PKCE, one browser consent |
| `permittedUsersPolicyType` | Must be `AdminApprovedPreAuthorized` (no human to self-authorize) | `AllSelfAuthorized` is fine (default) |
| Scopes | `Api, RefreshToken` (RefreshToken required even though unused — §5.5) | `MCP, RefreshToken` |
| File count | 5 (policies are required config, not optional defaults) | 3 (policies are optional hardening) |
