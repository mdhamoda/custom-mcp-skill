/**
 * EXAMPLE ASSET -- extends access to OOTB / standard / Salesforce-managed internal APIs via one
 * generic invocable Apex action instead of a fixed, single-purpose wrapper. Ships with
 * custom-platform-mcp; org-verified at API v67.0.
 *
 * MUST be declared `global with sharing` -- see tool-backing-specs.md's hard rule right above
 * the §1a decision matrix. A `public with sharing` class can deploy cleanly and still silently
 * fail to register in /actions/custom/apex, which means it can never be wired as an `aa:` tool
 * even though nothing about the deploy itself complained.
 *
 * AUTH: mints its own JWT Bearer token per call via JwtAuthHelper (Auth.JWT/Auth.JWS/
 * Auth.JWTBearerTokenExchange), NOT UserInfo.getSessionId() -- see references/eca-and-testing.md
 * §5 for why: getSessionId() throws when this tool is invoked via a real MCP tools/call (the
 * mcp_api-scoped token backing that context can't produce a session ID), org-confirmed three
 * independent ways. `sub` is set to UserInfo.getUsername() dynamically, so the resulting access
 * token -- and therefore this callout's CRUD/FLS/sharing -- reflects the ACTUAL calling user, not
 * one fixed service account. Requires the five-file ECA bundle in assets/eca/jwt-bearer-self-
 * callout/ (AdminApprovedPreAuthorized + the calling user's profile pre-authorized, RefreshToken
 * scope, and -- the step that costs the most debugging time if missed -- the ECA's `certificate`
 * field must hold the certificate Salesforce actually RETRIEVES for that developer name, not the
 * one originally uploaded; see §5.4).
 *
 * A single generic tool can reach any internal endpoint the calling user has access to, with no
 * per-endpoint allowlist -- deliberate here (isolate this pattern on its own MCP server, separate
 * from narrower read/write tools, rather than an allowlist) but re-decide that trade-off per
 * project; it is not free to skip.
 *
 * PREFER a Named-Credential-bound callout (see the ConnectApiIntegration.cls asset in
 * custom-rev-managing-asset-lifecycle) for a FIXED target -- this generic, any-endpoint,
 * runs-as-the-calling-user version is for when the caller genuinely needs both runtime
 * flexibility over the target AND per-user attribution, not the default.
 */
global with sharing class InvokeSalesforceApiAction {

    private static final String JWT_CONSUMER_KEY = '{{ECA_CONSUMER_KEY}}';
    private static final String JWT_CERTIFICATE_NAME = '{{CERTIFICATE_DEVELOPER_NAME}}';
    private static final String JWT_AUDIENCE = 'https://test.salesforce.com'; // sandbox/scratch; use https://login.salesforce.com for prod/DE

    @InvocableMethod(label='Invoke Salesforce API' description='Calls any standard, OOTB Salesforce REST/Connect API endpoint on this org given a path, HTTP method, and optional JSON body -- authenticates by minting its own JWT Bearer token in Apex, with sub set dynamically to the calling user so the resulting access token reflects the calling user, not a fixed service account. Call ONLY after the user has explicitly confirmed the endpoint, method, and payload -- never speculatively, especially for non-GET calls.')
    global static List<InvokeResult> invoke(List<InvokeRequest> requests) {
        List<InvokeResult> results = new List<InvokeResult>();

        for (InvokeRequest request : requests) {
            InvokeResult result = new InvokeResult();

            try {
                String myDomainUrl = URL.getOrgDomainUrl().toExternalForm();

                JwtAuthHelper.Claim claim = new JwtAuthHelper.Claim();
                claim.iss = JWT_CONSUMER_KEY;
                claim.sub = UserInfo.getUsername();
                claim.aud = JWT_AUDIENCE;
                claim.exp = (Integer) ((Datetime.now().getTime() / 1000) + 300);

                String accessToken = JwtAuthHelper.getAccessToken(
                    claim, JWT_CERTIFICATE_NAME, myDomainUrl + '/services/oauth2/token'
                );

                HttpRequest httpReq = new HttpRequest();
                String path = request.endpointPath.startsWith('/') ? request.endpointPath : '/' + request.endpointPath;
                httpReq.setEndpoint(myDomainUrl + path);
                httpReq.setMethod(request.httpMethod);
                httpReq.setHeader('Content-Type', 'application/json');
                httpReq.setHeader('Authorization', 'Bearer ' + accessToken);

                if (String.isNotBlank(request.requestBody)) {
                    httpReq.setBody(request.requestBody);
                }

                Http http = new Http();
                HttpResponse httpRes = http.send(httpReq);

                result.statusCode = String.valueOf(httpRes.getStatusCode());
                result.responseBody = httpRes.getBody();

                if (httpRes.getStatusCode() >= 200 && httpRes.getStatusCode() < 300) {
                    result.isSuccess = true;
                    result.message = 'API call succeeded.';
                } else {
                    result.isSuccess = false;
                    result.message = 'API call failed: ' + httpRes.getStatus() + ' - ' + httpRes.getBody();
                }

            } catch (Exception e) {
                result.isSuccess = false;
                result.message = 'Exception occurred: ' + e.getMessage();
                System.debug('InvokeSalesforceApiAction Error: ' + e.getMessage());
            }

            results.add(result);
        }

        return results;
    }

    global class InvokeRequest {
        @InvocableVariable(label='Endpoint Path' description='The API path on this org, e.g. /services/data/v67.0/connect/pcm/index/deploy -- do not include the domain.' required=true)
        global String endpointPath;

        @InvocableVariable(label='HTTP Method' description='GET, POST, PATCH, PUT, or DELETE.' required=true)
        global String httpMethod;

        @InvocableVariable(label='Request Body' description='Optional JSON string sent as the request body. Omit for GET/DELETE calls with no body.')
        global String requestBody;
    }

    global class InvokeResult {
        @InvocableVariable(label='Success' description='Indicates if the API call returned a 2xx status.')
        global Boolean isSuccess;

        @InvocableVariable(label='Status Code' description='HTTP status code of the API response.')
        global String statusCode;

        @InvocableVariable(label='Response Body' description='The raw response body, as returned by the API (JSON string).')
        global String responseBody;

        @InvocableVariable(label='Message' description='Success or error message.')
        global String message;
    }
}
