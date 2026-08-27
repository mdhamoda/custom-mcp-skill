/**
 * Returns the full Product Catalog Management (PCM) structure for one product: attributes,
 * classification, category, catalog, component group / bundle structure, selling models, and
 * pricebook entries, with every record Id preserved at every level. Ramp segments and usage
 * grants are a separate opt-in call (they are not part of the base product-detail payload).
 *
 * Backed by the org's own Connect API (GET /connect/pcm/products/{productId}), not a hand-rolled
 * multi-object SOQL aggregation -- one call already returns attributes/hierarchy/classification/
 * category/catalog/selling-model/price together.
 *
 * Mints its own JWT Bearer self-callout token via JwtAuthHelper -- same pattern as
 * InvokeSalesforceApiAction/BizApiCatalogService on this same server. Needs the JWT Bearer
 * self-callout ECA set up first (see assets/eca/jwt-bearer-self-callout/), or the constants below
 * filled in for your org -- see references/eca-and-testing.md.
 */
global with sharing class ProductCatalogStructureService {
  private static final String JWT_CONSUMER_KEY = '{{ECA_CONSUMER_KEY}}';
  private static final String JWT_CERTIFICATE_NAME = '{{CERTIFICATE_DEVELOPER_NAME}}';
  private static final String JWT_AUDIENCE = 'https://test.salesforce.com';

  @InvocableMethod(
    label='Get Product Catalog Structure'
    description='Gets the full PCM structure for one product by Id or ProductCode -- attributes, classification, category, catalog, bundle/component structure, selling models, and pricebook entries, with every record Id included. Pass includeRampAndUsage=true to also fetch ramp segments and usage entitlement grants (a separate call, not part of the base structure).'
  )
  global static List<Response> getProductStructure(List<Request> requests) {
    List<Response> responses = new List<Response>();

    for (Request req : requests) {
      Response res = new Response();
      String myDomainUrl = URL.getOrgDomainUrl().toExternalForm();

      try {
        Id productId = resolveProductId(req.productId, req.productCode);
        if (productId == null) {
          res.isSuccess = false;
          res.message = 'No matching Product2 found for the given productId/productCode.';
          responses.add(res);
          continue;
        }

        String accessToken = mintAccessToken(myDomainUrl);

        HttpRequest detailReq = new HttpRequest();
        String detailPath =
          '/services/data/v67.0/connect/pcm/products/' +
          productId +
          '?enablePricing=true&enableQualification=true';
        detailReq.setEndpoint(myDomainUrl + detailPath);
        detailReq.setMethod('GET');
        detailReq.setHeader('Authorization', 'Bearer ' + accessToken);

        HttpResponse detailRes = new Http().send(detailReq);
        if (detailRes.getStatusCode() != 200) {
          res.isSuccess = false;
          res.message =
            'Product detail call failed: ' +
            detailRes.getStatus() +
            ' - ' +
            detailRes.getBody();
          responses.add(res);
          continue;
        }

        res.productId = productId;
        res.productStructureJson = detailRes.getBody();
        res.isSuccess = true;
        res.message = 'Product structure retrieved.';

        if (req.includeRampAndUsage == true) {
          res.rampAndUsageJson = fetchRampAndUsage(
            myDomainUrl,
            productId,
            accessToken
          );
        }
      } catch (Exception e) {
        res.isSuccess = false;
        res.message = 'Exception occurred: ' + e.getMessage();
        System.debug('ProductCatalogStructureService Error: ' + e.getMessage());
      }

      responses.add(res);
    }

    return responses;
  }

  private static Id resolveProductId(String productId, String productCode) {
    if (String.isNotBlank(productId)) {
      return (Id) productId;
    }
    if (String.isNotBlank(productCode)) {
      List<Product2> matches = [
        SELECT Id
        FROM Product2
        WHERE ProductCode = :productCode
        WITH USER_MODE
        LIMIT 1
      ];
      if (!matches.isEmpty()) {
        return matches[0].Id;
      }
    }
    return null;
  }

  private static String mintAccessToken(String myDomainUrl) {
    JwtAuthHelper.Claim claim = new JwtAuthHelper.Claim();
    claim.iss = JWT_CONSUMER_KEY;
    claim.sub = UserInfo.getUsername();
    claim.aud = JWT_AUDIENCE;
    claim.exp = (Integer) ((Datetime.now().getTime() / 1000) + 300);
    return JwtAuthHelper.getAccessToken(
      claim,
      JWT_CERTIFICATE_NAME,
      myDomainUrl + '/services/oauth2/token'
    );
  }

  private static String fetchRampAndUsage(
    String myDomainUrl,
    Id productId,
    String accessToken
  ) {
    try {
      Map<String, Object> body = new Map<String, Object>{
        'relatedEntities' => new List<Object>{
          new Map<String, Object>{ 'entityName' => 'ProductRampSegment' },
          new Map<String, Object>{ 'entityName' => 'ProductUsageGrant' }
        }
      };

      HttpRequest relatedReq = new HttpRequest();
      relatedReq.setEndpoint(
        myDomainUrl +
          '/services/data/v67.0/connect/pcm/relatedRecords/Product2/' +
          productId
      );
      relatedReq.setMethod('POST');
      relatedReq.setHeader('Content-Type', 'application/json');
      relatedReq.setHeader('Authorization', 'Bearer ' + accessToken);
      relatedReq.setBody(JSON.serialize(body));

      HttpResponse relatedRes = new Http().send(relatedReq);
      if (relatedRes.getStatusCode() != 200) {
        return JSON.serialize(
          new Map<String, Object>{
            'error' => 'Ramp/usage call failed: ' +
            relatedRes.getStatus() +
            ' - ' +
            relatedRes.getBody()
          }
        );
      }
      return relatedRes.getBody();
    } catch (Exception e) {
      return JSON.serialize(
        new Map<String, Object>{ 'error' => e.getMessage() }
      );
    }
  }

  global class Request {
    @InvocableVariable(
      label='Product Id'
      description='The Product2 record Id. Provide this or productCode.'
    )
    global String productId;

    @InvocableVariable(
      label='Product Code'
      description='The Product2.ProductCode, resolved to an Id if productId is not given.'
    )
    global String productCode;

    @InvocableVariable(
      label='Include Ramp And Usage'
      description='When true, also fetches ProductRampSegment and ProductUsageGrant related records in a second call.'
    )
    global Boolean includeRampAndUsage;
  }

  global class Response {
    @InvocableVariable(
      label='Success'
      description='Indicates if the product structure was retrieved successfully.'
    )
    global Boolean isSuccess;

    @InvocableVariable(
      label='Product Id'
      description='The resolved Product2 Id.'
    )
    global Id productId;

    @InvocableVariable(
      label='Product Structure (JSON)'
      description='The full PCM product structure -- attributes, classification, category, catalog, component group/bundle structure, selling models, and pricebook entries -- as returned by the Connect API, with every record Id included.'
    )
    global String productStructureJson;

    @InvocableVariable(
      label='Ramp And Usage (JSON)'
      description='ProductRampSegment and ProductUsageGrant related records, only populated when includeRampAndUsage was true.'
    )
    global String rampAndUsageJson;

    @InvocableVariable(label='Message' description='Success or error message.')
    global String message;
  }
}
