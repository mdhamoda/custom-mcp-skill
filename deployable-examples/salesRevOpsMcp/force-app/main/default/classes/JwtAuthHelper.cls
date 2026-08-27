/**
 * EXAMPLE ASSET -- hand-rolled JWT Bearer Flow token exchange, built entirely from native Apex
 * (Auth.JWT / Auth.JWS / Auth.JWTBearerTokenExchange). Ships with custom-sf-mcp;
 * org-verified end to end at API v67.0 -- see references/eca-and-testing.md §5 for the full
 * investigation, including why the declarative ExternalCredential `authenticationProtocol: Jwt`
 * route was NOT used (it's documented "Reserved for future use").
 *
 * Used by InvokeSalesforceApiAction.cls in this same asset folder. Requires the five-file ECA
 * bundle in assets/eca/jwt-bearer-self-callout/ to be deployed and correctly configured first --
 * in particular the ECA's `certificate` field must hold the certificate Salesforce actually
 * RETRIEVES for the Certificate developer name passed in, not the one originally uploaded
 * (§5.4 -- this is the step that costs the most debugging time if skipped).
 */
public with sharing class JwtAuthHelper {

    public class Claim {
        public String iss;   // ECA consumer key (ExtlClntAppGlobalOauthSettings.consumerKey)
        public String sub;   // target username -- set dynamically (e.g. UserInfo.getUsername()), not a fixed service account
        public String aud;   // https://login.salesforce.com (prod/DE) or https://test.salesforce.com (sandbox/scratch)
        public Integer exp;  // unix seconds; keep short-lived (e.g. now + 300)
        public String kid;   // optional
    }

    public static String getAccessToken(Claim claim, String certificateName, String tokenEndpoint) {
        Auth.JWT jwt = new Auth.JWT();
        jwt.setSub(claim.sub);
        jwt.setAud(claim.aud);
        jwt.setIss(claim.iss);

        Map<String, Object> additionalClaims = new Map<String, Object>();
        if (claim.kid != null) {
            additionalClaims.put('kid', claim.kid);
        }
        if (claim.exp != null) {
            additionalClaims.put('exp', claim.exp);
        }
        jwt.setAdditionalClaims(additionalClaims);

        Auth.JWS jws = new Auth.JWS(jwt, certificateName);
        Auth.JWTBearerTokenExchange bearer = new Auth.JWTBearerTokenExchange(tokenEndpoint, jws);
        return bearer.getAccessToken();
    }
}
