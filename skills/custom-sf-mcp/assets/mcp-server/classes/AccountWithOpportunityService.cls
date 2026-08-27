/**
 * Creates an Account and, optionally, a related Opportunity — in one transaction.
 *
 * Exposed as a Salesforce Hosted MCP tool via an McpServerDefinition.
 * MUST be `global` — `public @InvocableMethod` is not eligible for MCP tool exposure.
 *
 * The @InvocableVariable `description` text becomes the agent-readable schema, so it is
 * written for a model to read, not a developer.
 */
global with sharing class AccountWithOpportunityService {
    global class Request {
        @InvocableVariable(
            label='Account Name'
            description='Name of the account to create. Required.'
            required=true)
        global String accountName;

        @InvocableVariable(
            label='Industry'
            description='Industry of the account, for example Technology or Manufacturing. Optional.')
        global String industry;

        @InvocableVariable(
            label='Billing City'
            description='City for the account billing address. Optional.')
        global String billingCity;

        @InvocableVariable(
            label='Create Opportunity'
            description='Set to true to also create an opportunity linked to the new account. Defaults to false.')
        global Boolean createOpportunity;

        @InvocableVariable(
            label='Opportunity Name'
            description='Name of the opportunity. Used only when Create Opportunity is true. Defaults to the account name plus " - New Business".')
        global String opportunityName;

        @InvocableVariable(
            label='Close Date'
            description='Expected close date of the opportunity. Used only when Create Opportunity is true. Defaults to 30 days from today.')
        global Date closeDate;

        @InvocableVariable(
            label='Stage Name'
            description='Sales stage of the opportunity, for example Prospecting. Used only when Create Opportunity is true. Defaults to Prospecting.')
        global String stageName;

        @InvocableVariable(
            label='Amount'
            description='Monetary value of the opportunity. Used only when Create Opportunity is true. Optional.')
        global Decimal amount;
    }

    global class Response {
        @InvocableVariable(
            label='Account Id'
            description='Record id of the account that was created.')
        global String accountId;

        @InvocableVariable(
            label='Opportunity Id'
            description='Record id of the opportunity that was created, or null when no opportunity was requested.')
        global String opportunityId;

        @InvocableVariable(
            label='Success'
            description='True when the records were created successfully.')
        global Boolean success;

        @InvocableVariable(
            label='Summary'
            description='Human readable summary of what was created, or the reason it failed.')
        global String summary;
    }

    @InvocableMethod(
        label='Create Account With Optional Opportunity'
        description='Creates a Salesforce account and, when requested, a related opportunity in the same transaction. If the opportunity fails, the account is rolled back so no partial data is left behind.')
    global static List<Response> createAccountWithOpportunity(List<Request> requests) {
        List<Response> responses = new List<Response>();

        for (Request req : requests) {
            Response res = new Response();
            // one savepoint per request: an opportunity failure must not leave an orphan account
            Savepoint sp = Database.setSavepoint();

            try {
                Account acct = new Account(
                    Name = req.accountName,
                    Industry = req.industry,
                    BillingCity = req.billingCity
                );
                insert acct;
                res.accountId = acct.Id;

                if (req.createOpportunity == true) {
                    Opportunity opp = new Opportunity(
                        AccountId = acct.Id,
                        Name = String.isBlank(req.opportunityName)
                            ? req.accountName + ' - New Business'
                            : req.opportunityName,
                        CloseDate = req.closeDate == null ? Date.today().addDays(30) : req.closeDate,
                        StageName = String.isBlank(req.stageName) ? 'Prospecting' : req.stageName,
                        Amount = req.amount
                    );
                    insert opp;
                    res.opportunityId = opp.Id;
                    res.summary = 'Created account "' + req.accountName + '" and opportunity "' + opp.Name + '".';
                } else {
                    res.summary = 'Created account "' + req.accountName + '". No opportunity requested.';
                }

                res.success = true;
            } catch (Exception e) {
                Database.rollback(sp);
                res.accountId = null;
                res.opportunityId = null;
                res.success = false;
                res.summary = 'Could not create the records: ' + e.getMessage();
            }

            responses.add(res);
        }

        return responses;
    }
}
