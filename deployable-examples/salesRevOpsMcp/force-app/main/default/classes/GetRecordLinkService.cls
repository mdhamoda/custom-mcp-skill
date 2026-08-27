global with sharing class GetRecordLinkService {
  global class LinkRequest {
    @InvocableVariable(required=true label='Record Id')
    global String recordId;
  }

  global class LinkResponse {
    @InvocableVariable
    global String recordId;
    @InvocableVariable
    global String objectType;
    @InvocableVariable
    global String url;
  }

  @InvocableMethod(
    label='Get Record Link'
    description='Builds a Salesforce record link for any object type from its Id -- works for any object, no need to know the type in advance.'
  )
  global static List<LinkResponse> getRecordLink(List<LinkRequest> requests) {
    List<LinkResponse> results = new List<LinkResponse>();
    // my.salesforce.com (what getOrgDomainUrl returns) is the API/auth domain, not the
    // browser-navigable Lightning domain -- swap it so the link actually resolves when clicked.
    String domain = URL.getOrgDomainUrl()
      .toExternalForm()
      .replace('.my.salesforce.com', '.lightning.force.com');
    for (LinkRequest req : requests) {
      LinkResponse res = new LinkResponse();
      res.recordId = req.recordId;
      try {
        Id recId = Id.valueOf(req.recordId);
        res.objectType = recId.getSObjectType().getDescribe().getLabel();
        res.url = domain + '/' + req.recordId;
      } catch (Exception e) {
        res.objectType = null;
        res.url = null;
      }
      results.add(res);
    }
    return results;
  }
}
