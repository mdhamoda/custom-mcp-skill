global with sharing class GetComposeEmailLinkService {
  global class LinkRequest {
    @InvocableVariable(required=true label='Contact Id')
    global String contactId;
    @InvocableVariable(
      label='Email Template Id (optional -- pre-fills the template choice)'
    )
    global String emailTemplateId;
  }

  global class LinkResponse {
    @InvocableVariable
    global String url;
  }

  @InvocableMethod(
    label='Get Compose Email Link'
    description='Builds a link to the Compose And Send Email screen flow, so the rep can review/edit the content and send it themselves in Salesforce instead of Claude sending it directly. Pass emailTemplateId if a template was already chosen in the conversation, to skip straight to the compose screen.'
  )
  global static List<LinkResponse> getComposeEmailLink(
    List<LinkRequest> requests
  ) {
    List<LinkResponse> results = new List<LinkResponse>();
    // my.salesforce.com (what getOrgDomainUrl returns) is the API/auth domain -- the /flow
    // launch path needs the Lightning domain to actually open the flow when clicked.
    String domain = URL.getOrgDomainUrl()
      .toExternalForm()
      .replace('.my.salesforce.com', '.lightning.force.com');
    for (LinkRequest req : requests) {
      LinkResponse res = new LinkResponse();
      String url =
        domain +
        '/flow/ComposeAndSendEmail?contactId=' +
        EncodingUtil.urlEncode(req.contactId, 'UTF-8');
      if (String.isNotBlank(req.emailTemplateId)) {
        url +=
          '&emailTemplateId=' +
          EncodingUtil.urlEncode(req.emailTemplateId, 'UTF-8');
      }
      res.url = url;
      results.add(res);
    }
    return results;
  }
}
