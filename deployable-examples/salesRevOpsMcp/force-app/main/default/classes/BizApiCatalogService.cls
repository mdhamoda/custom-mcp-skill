/**
 * Lists Revenue Cloud's business-process APIs -- sales transaction/DRO, asset lifecycle,
 * billing/invoicing/payments, usage/entitlements, and pricing -- each with its real endpoint,
 * description, and (where the platform exposes it) live input/output schema.
 *
 * Two source types, returned side by side so a caller can tell them apart (see `sourceType`):
 *   - 'liveSchema'  -- discovered AND schema-fetched live, both fully dynamic. Which action names
 *                      exist is read from this org's own /services/data/vXX.0/actions/standard
 *                      directory (no name suffix -- returns every action in the org, ~230+
 *                      confirmed [org]), filtered by RELEVANCE_KEYWORDS; each match's full schema
 *                      then comes from the per-name /actions/standard/{name} reflection endpoint.
 *                      No hardcoded name list -- self-corrects if Salesforce adds/renames/removes
 *                      an action, with zero maintenance.
 *   - 'documented'  -- pure Connect REST resources that do NOT appear in the standard actions
 *                      registry at all, and have NO live discovery of any kind -- [org]-confirmed
 *                      this session two ways: nested Connect paths (e.g. /connect/rev/sales-
 *                      transaction) 404, and the org's own top-level /connect self-describing
 *                      directory (45 real entries) does not list this domain's resource groups at
 *                      all. This is a genuine platform limitation, not a research gap -- these
 *                      entries' endpoint/schema are hand-maintained from Salesforce's Revenue Cloud
 *                      developer documentation and CANNOT be made dynamic.
 *
 * DISCOVER-THEN-INVOKE: this tool only lists APIs, it does not call them. To actually call one,
 * take its `endpoint`, `httpMethod`, and input schema from this tool's response and pass them to
 * InvokeSalesforceApiAction (the generic invoker) on this same MCP server.
 */
global with sharing class BizApiCatalogService {
  private static final String JWT_CONSUMER_KEY = '{{ECA_CONSUMER_KEY}}';
  private static final String JWT_CERTIFICATE_NAME = '{{CERTIFICATE_DEVELOPER_NAME}}';
  private static final String JWT_AUDIENCE = 'https://test.salesforce.com';

  // Lowercase substrings matched against each live action's `name` -- deliberately compound
  // phrases ("createorderfromquote", "initiaterollback") rather than bare single words
  // ("order", "cancel", "transfer") to avoid pulling in unrelated Order Management Cloud noise
  // (createFulfillmentOrder, cancelOrderItemSummariesPreview, etc.) that also lives in this same
  // ~230-action directory. [org]-validated against the live action list this session: 62 matches,
  // zero OM Cloud false positives, and surfaced real actions the old hand-curated list had missed
  // (invokeRatingService, contract-document actions, payment/credit summary actions).
  private static final List<String> RELEVANCE_KEYWORDS = new List<String>{
    // Sales transaction / DRO
    'salestransaction',
    'createorderfromquote',
    'createordersfromquote',
    'decompose',
    'orchestrat',
    'freeze',
    // Asset lifecycle
    'asset',
    'amend',
    'initiaterollback',
    'renewableassets',
    'initiatetransfer',
    'initiaterenewal',
    'initiatecancellation',
    // Contracts (shared by sales transaction + asset lifecycle)
    'contract',
    // Billing / invoicing / payments
    'invoice',
    'billing',
    'blng',
    'payment',
    'credit',
    'refund',
    'dunning',
    'sequence',
    // Usage / entitlements
    'usage',
    'entitlement',
    'consumption',
    // Pricing / rating
    'pricing',
    'rating',
    // Decision tables (rules that back pricing/rating/eligibility)
    'decisiontable'
  };

  @InvocableMethod(
    label='List Revenue Cloud Business APIs'
    description='Lists Revenue Cloud business-process APIs -- sales transaction/DRO, asset lifecycle, billing/invoicing/payments, usage/entitlements, and pricing -- with real endpoints and descriptions. Both WHICH actions exist and their schema are discovered live from this org, self-correcting with no maintenance; a small set of pure Connect REST resources are hand-documented since the platform exposes no discovery of any kind for that category. This tool only lists APIs -- to call one, take its endpoint/httpMethod/schema from the response and pass them to InvokeSalesforceApiAction on this same server.'
  )
  global static List<Response> listBusinessApis(List<Request> requests) {
    List<Response> responses = new List<Response>();

    for (Request req : requests) {
      Response res = new Response();
      res.apis = new List<ApiEntry>();

      String myDomainUrl = URL.getOrgDomainUrl().toExternalForm();
      String apiVersion = String.isNotBlank(req.apiVersion)
        ? req.apiVersion
        : '67.0';

      // Mint one JWT Bearer token for this whole invocation -- reused across the directory
      // fetch AND every per-action schema lookup below, not re-minted each time (that would
      // add dozens of extra token-exchange callouts for no benefit).
      String accessToken = mintAccessToken(myDomainUrl);

      List<String> relevantActionNames = discoverRelevantActionNames(
        myDomainUrl,
        apiVersion,
        accessToken
      );

      for (String actionName : relevantActionNames) {
        ApiEntry entry = fetchLiveActionSchema(
          myDomainUrl,
          apiVersion,
          actionName,
          accessToken
        );
        if (entry != null) {
          res.apis.add(entry);
        }
      }

      for (ApiEntry documented : documentedConnectResources()) {
        res.apis.add(documented);
      }

      res.totalCount = res.apis.size();
      responses.add(res);
    }

    return responses;
  }

  // Dynamic discovery, no hardcoded name list: fetches the org's own live action directory
  // (every standard action, name + label, no schema at this level) and keeps only the ones
  // whose name matches a RELEVANCE_KEYWORDS substring. [org]-confirmed this endpoint exists and
  // returns ~230+ real entries; falls back to an empty list (not an error) if the directory
  // fetch itself fails, so a transient callout issue degrades to "no live entries" rather than
  // crashing the whole tool.
  private static List<String> discoverRelevantActionNames(
    String myDomainUrl,
    String apiVersion,
    String accessToken
  ) {
    List<String> matched = new List<String>();
    try {
      HttpRequest req = new HttpRequest();
      req.setEndpoint(
        myDomainUrl + '/services/data/v' + apiVersion + '/actions/standard'
      );
      req.setMethod('GET');
      req.setHeader('Authorization', 'Bearer ' + accessToken);

      HttpResponse res = new Http().send(req);
      if (res.getStatusCode() != 200) {
        return matched;
      }

      Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(
        res.getBody()
      );
      List<Object> actions = (List<Object>) body.get('actions');
      if (actions == null) {
        return matched;
      }

      for (Object a : actions) {
        Map<String, Object> actionMap = (Map<String, Object>) a;
        String actionName = (String) actionMap.get('name');
        if (String.isBlank(actionName)) {
          continue;
        }
        String lowerName = actionName.toLowerCase();
        for (String keyword : RELEVANCE_KEYWORDS) {
          if (lowerName.contains(keyword)) {
            matched.add(actionName);
            break;
          }
        }
      }
    } catch (Exception e) {
      System.debug(
        'BizApiCatalogService: action directory discovery failed -- ' +
        e.getMessage()
      );
    }
    return matched;
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

  private static ApiEntry fetchLiveActionSchema(
    String myDomainUrl,
    String apiVersion,
    String actionName,
    String accessToken
  ) {
    try {
      String relativePath =
        '/services/data/v' +
        apiVersion +
        '/actions/standard/' +
        actionName;
      HttpRequest httpReq = new HttpRequest();
      httpReq.setEndpoint(myDomainUrl + relativePath);
      httpReq.setMethod('GET');
      httpReq.setHeader('Authorization', 'Bearer ' + accessToken);

      HttpResponse httpRes = new Http().send(httpReq);
      if (httpRes.getStatusCode() != 200) {
        return null; // action not present in this org/edition -- skip, not an error
      }

      Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(
        httpRes.getBody()
      );

      ApiEntry entry = new ApiEntry();
      entry.name = (String) body.get('name');
      entry.label = (String) body.get('label');
      entry.description = enrichDescription(
        actionName,
        (String) body.get('description')
      );
      entry.category = (String) body.get('category');
      entry.endpoint = relativePath; // the detail payload itself carries no 'url' field -- only the list endpoint does
      entry.httpMethod = 'POST';
      entry.sourceType = 'liveSchema';
      entry.inputsJson = JSON.serialize(body.get('inputs'));
      entry.outputsJson = JSON.serialize(body.get('outputs'));
      return entry;
    } catch (Exception e) {
      System.debug(
        'BizApiCatalogService: could not fetch ' +
          actionName +
          ' -- ' +
          e.getMessage()
      );
      return null;
    }
  }

  // The live reflection endpoint only ever returns a flat field list (type/name/label/description) --
  // it cannot describe the NESTED shape expected inside a JSON-string field like `pricingData`. For a
  // small set of actions where that nested shape is genuinely non-obvious and has already cost real
  // debugging time once, append a proven-working example to the description text rather than leaving
  // the caller to rediscover it. Deliberately NOT touching inputsJson's shape here -- every entry's
  // inputsJson stays the same flat reflected-schema array regardless of whether it's enriched, so a
  // caller never has to special-case one entry's shape vs. every other one's. See custom-rev-
  // configuring-pricing-procedure/references/api-bodies.md for the full story (§ "Pricing -- create
  // context + price in one call").
  private static String enrichDescription(
    String actionName,
    String liveDescription
  ) {
    String extra = WORKED_EXAMPLE_NOTES.get(actionName);
    if (extra == null) {
      return liveDescription;
    }
    return liveDescription + ' ' + extra;
  }

  private static final Map<String, String> WORKED_EXAMPLE_NOTES = new Map<String, String>{
    'runSalesforceHeadlessPricing' => '[org] IMPORTANT: pricingData is reflected as a plain STRING -- the schema above cannot show ' +
    'what belongs INSIDE it. The #1 cause of SF-Pricing-00008 "output tags aren\'t valid": pricingData ' +
    'must be keyed by CONTEXT NODE names (SalesTransaction, SalesTransactionItem, each with ' +
    'businessObjectType), NOT raw sObject names (Quote, QuoteLineItem) -- sObject-shaped data does ' +
    'not error, it silently fails to hydrate, producing that exact misleading message. Also pass the ' +
    'DEFAULT context mapping (isDefault:true from GET /connect/context-definitions/{id}) -- a ' +
    'correctly-NAMED but non-default mapping fails the identical way. Proven-working example: ' +
    '{"contextDefinitionId":"<id>","contextMappingId":"<the isDefault:true mapping id>",' +
    '"pricingProcedureId":"<ExpressionSetDefinition DeveloperName>","isDeveloperName":true,' +
    '"displayContext":true,"isSkipWaterfall":false,"useSessionScopedContext":false,' +
    '"pricingData":"{\\"SalesTransaction\\":{\\"businessObjectType\\":\\"SalesTransaction\\",' +
    '\\"Pricebook\\":\\"<Pricebook2 Id>\\",\\"CurrencyIsoCode\\":\\"USD\\",' +
    '\\"SalesTransactionItem\\":[{\\"businessObjectType\\":\\"SalesTransactionItem\\",' +
    '\\"Product\\":\\"<Product2 Id>\\",\\"Quantity\\":1,' +
    '\\"SalesTransactionItemSource\\":\\"LINE_ITEM1\\"}]}}"}. Known open issue: this shape prices ' +
    'successfully (no error) but can still return ListPrice:null/NetUnitPrice:0 if the line lacks a ' +
    'price-seeding attribute -- a separate, later problem from SF-Pricing-00008.'
  };

  private static List<ApiEntry> documentedConnectResources() {
    List<ApiEntry> entries = new List<ApiEntry>();

    entries.add(
      makeDocumented(
        'placeSalesTransaction',
        'Place Sales Transaction',
        'Creates OR updates a Quote/Order and its lines/groups/attributes in one composite-graph call -- integrated pricing, configuration, and tax. Also the API for adding a bundle component, editing a line\'s configuration attributes, and grouping lines. Does NOT support amendment, renewal, or cancellation -- use the dedicated APIs for those.',
        '/connect/rev/sales-transaction/actions/place',
        'POST',
        new Map<String, Object>{
          'requiredFields' => new List<String>{
            'contextDetails OR graph (at least one required)'
          },
          'properties' => new List<Object>{
            new Map<String, Object>{
              'name' => 'catalogRatesPref',
              'type' => 'String',
              'required' => false,
              'description' => '"Fetch" (retrieve rate-card entries for usage-based sales items) or "Skip" (default). Only meaningful when Usage-Based Selling is enabled.'
            },
            new Map<String, Object>{
              'name' => 'configurationPref',
              'type' => 'ConfiguratorPreferenceInput',
              'required' => false,
              'description' => 'configurationMethod ("Skip"/"Force"/"System") + configurationOptions (validateProductCatalog, validateAmendRenewCancel, executeConfigurationRules, addDefaultConfiguration). executeConfigurationRules+addDefaultConfiguration=true runs CRE inline and auto-adds a bundle\'s defaulted [1..1] component with no extra call.'
            },
            new Map<String, Object>{
              'name' => 'contextDetails',
              'type' => 'ContextInput',
              'required' => 'required if graph is not specified',
              'description' => '{contextId, scope?} -- reuse an existing context instance (e.g. one returned by a prior call, or a Ramp Deal Create response).'
            },
            new Map<String, Object>{
              'name' => 'graph',
              'type' => 'ObjectGraphInput',
              'required' => 'required if contextDetails is not specified',
              'description' => 'The composite sObject graph -- {graphId, records:[{referenceId, record:{attributes:{type, method, id?}, ...fields}}]}. method is POST/PATCH/DELETE per record. Custom objects at grandchild level+ need the FULL hierarchy present in the same request, and context mapping\'s parentReference must point at the immediate parent field or the API fails (delta processing can\'t reconcile).'
            },
            new Map<String, Object>{
              'name' => 'groupRampAction',
              'type' => 'String',
              'required' => false,
              'description' => 'v65.0+. AddProducts | DeleteProducts | EditGroup | EditRampSchedule | DeleteSegment | ConvertToNonRampedGroup -- operates on group ramp segments, or converts a non-ramped group into one.'
            },
            new Map<String, Object>{
              'name' => 'pricingPref',
              'type' => 'String',
              'required' => false,
              'description' => '"Force" | "Skip" | "System" (default) -- whether/how pricing runs.'
            },
            new Map<String, Object>{
              'name' => 'taxPref',
              'type' => 'String',
              'required' => false,
              'description' => 'v65.0+. Only valid value is "Skip" -- tax calculation runs by default if this is omitted entirely.'
            }
          },
          'operationVariants' => new Map<String, Object>{
            'create' => 'graphId createQuote/createOrder -- POST the Quote/Order header + POST QuoteLineItem/OrderItem records referencing it via @{refX.id}.',
            'update' => 'graphId updateQuote/updateOrder -- PATCH with attributes.id set on the record(s) to change; omit fields you are not changing.',
            'insertUpdateDeleteLinesTogether' => 'Mix POST (insert), PATCH (update), and DELETE line-item records in ONE graph to do all three in the same call.',
            'addBundleComponent' => 'Add a QuoteLineRelationship (OrderItemRelationship for orders) record alongside the parent + component QuoteLineItem records: ProductRelationshipTypeId, ProductRelatedComponentId (ties the pair back to the catalog bundle definition), MainQuoteLineId, AssociatedQuoteLineId, AssociatedQuoteLinePricing ("NotIncludedInBundlePrice" = priced as its own line). Set AssociatedQuantScaleMethod explicitly ("Proportional" = child qty = parent x child, e.g. 10x2=20) -- omitting it lets the API enforce quantity/cardinality restrictions and reject the request.',
            'editLineConfigurationAttribute' => 'Add a QuoteLineItemAttribute record: QuoteLineItemId (@{refLine.id}), AttributeDefinitionId, AttributeValue. Picklist-backed attributes ALSO need AttributePicklistValueId (query AttributePicklistValue by Value) -- AttributeValue alone fails with INVALID_API_INPUT on those.',
            'assignTransactionProcessingType' => 'Set TransactionType on the Quote/Order record to a TransactionProcessingType developer name (e.g. "SkipPricingAndRunTax").',
            'defineLineGrouping' => 'graphId groupQuoteLines -- PATCH each QuoteLineItem with QuoteLineGroupId set to the target group.',
            'initialGroupAll' => 'graphId groupQuote -- POST a QuoteLineGroup record with attributes.action "GroupAll" to assign every existing line to the first group.',
            'ungroup' => 'graphId ungroupQuote -- DELETE the QuoteLineGroup with attributes.action "Ungroup" (lines are retained, just ungrouped).',
            'createGroup' => 'graphId createGroup -- POST a QuoteLineGroup record, no action attribute needed.',
            'deleteGroup' => 'graphId deleteGroup -- DELETE the QuoteLineGroup with attributes.action "DeleteGroup".',
            'groupOrderItemsByCriteria' => 'graphId groupOrderItems -- POST OrderItemGroup record(s) with attributes.action "GroupBy" + attributes.criteria (a field->value map, e.g. {"BillingFrequency2":"Monthly"}) to auto-bucket order items.',
            'updateRampDealViaContext' => 'Reuse the contextId returned by the Ramp Deal Create API (a separate endpoint), graphId updateQuote, PATCH the Quote record -- saves changes back through the same ramp context.'
          },
          'notes' => 'Limits: up to 1000 quote/order line items, up to 3000 line-item attributes, per transaction. No amendment/renewal/cancellation through this API -- use the dedicated amend/renew/cancel APIs/invocable actions instead. Runs async -- the response is a poll envelope, not final saved state. The header (Quote/Order) is committed FIRST, then configuration/pricing/persistence runs for lines/groups -- a later failure does NOT roll back the header, leaving an orphan; clean it up before retrying. Create/update quote lines with a group ID if the sales-transaction line editor will be used afterward.',
          'exampleRequestBody' => new Map<String, Object>{
            'pricingPref' => 'System',
            'catalogRatesPref' => 'Skip',
            'taxPref' => 'Skip',
            'configurationPref' => new Map<String, Object>{
              'configurationMethod' => 'Skip',
              'configurationOptions' => new Map<String, Object>{
                'validateProductCatalog' => true,
                'validateAmendRenewCancel' => true,
                'executeConfigurationRules' => true,
                'addDefaultConfiguration' => true
              }
            },
            'graph' => new Map<String, Object>{
              'graphId' => 'createQuote',
              'records' => new List<Object>{
                new Map<String, Object>{
                  'referenceId' => 'refQuote',
                  'record' => new Map<String, Object>{
                    'attributes' => new Map<String, Object>{
                      'type' => 'Quote',
                      'method' => 'POST'
                    },
                    'Name' => 'Quote_Acme',
                    'Pricebook2Id' => '01sDU000000JvhbYAC'
                  }
                },
                new Map<String, Object>{
                  'referenceId' => 'refQuoteLine0',
                  'record' => new Map<String, Object>{
                    'attributes' => new Map<String, Object>{
                      'type' => 'QuoteLineItem',
                      'method' => 'POST'
                    },
                    'QuoteId' => '@{refQuote.id}',
                    'Product2Id' => '01tDU000000F7b8YAC',
                    'PricebookEntryId' => '01uDU000000fxt2YAA',
                    'UnitPrice' => 100,
                    'Quantity' => '1',
                    'StartDate' => '2024-10-29',
                    'EndDate' => '2025-03-01',
                    'PeriodBoundary' => 'Anniversary'
                  }
                },
                new Map<String, Object>{
                  'referenceId' => 'refQuoteLine1',
                  'record' => new Map<String, Object>{
                    'attributes' => new Map<String, Object>{
                      'type' => 'QuoteLineItem',
                      'method' => 'POST'
                    },
                    'QuoteId' => '@{refQuote.id}',
                    'Product2Id' => '01tLT00000AA2M9YAL',
                    'PricebookEntryId' => '01uLT000007PTafYAG',
                    'Quantity' => '1'
                  }
                },
                new Map<String, Object>{
                  'referenceId' => 'refQuoteLineItemAttribute1',
                  'record' => new Map<String, Object>{
                    'attributes' => new Map<String, Object>{
                      'type' => 'QuoteLineItemAttribute',
                      'method' => 'POST'
                    },
                    'QuoteLineItemId' => '@{refQuoteLine0.id}',
                    'AttributeDefinitionId' => '0tjRT0000000XbtYAE',
                    'AttributeValue' => 'True'
                  }
                },
                new Map<String, Object>{
                  'referenceId' => 'refQuoteLineRelationship1',
                  'record' => new Map<String, Object>{
                    'attributes' => new Map<String, Object>{
                      'type' => 'QuoteLineRelationship',
                      'method' => 'POST'
                    },
                    'ProductRelationshipTypeId' => '0yoLT000000wHq6YAE',
                    'ProductRelatedComponentId' => '0dSLT00000076IP2AY',
                    'MainQuoteLineId' => '@{refQuoteLine0.id}',
                    'AssociatedQuoteLineId' => '@{refQuoteLine1.id}',
                    'AssociatedQuoteLinePricing' => 'NotIncludedInBundlePrice',
                    'AssociatedQuantScaleMethod' => 'Proportional'
                  }
                }
              }
            }
          }
        },
        new Map<String, Object>{
          'notes' => 'Async envelope -- created record Ids come back keyed by referenceId, not immediately in this response. Place Quote returns quoteId + requestIdentifier instead of orderId. Fetch async errors from .../place/{trackerId}/errors.',
          'exampleResponseBody' => new Map<String, Object>{
            'requestId' => '16PRM0000004DBq',
            'orderId' => '801S70000001VKgIAM',
            'success' => true,
            'errors' => new List<Object>(),
            'statusURL' => '/services/data/vXX.X/sobjects/AsyncOperationTracker/16PRM0000004DBq'
          }
        }
      )
    );
    entries.add(
      makeDocumented(
        'cloneSalesTransaction',
        'Clone Sales Transaction',
        'Clones an existing Quote or Order into a new draft transaction.',
        '/connect/rev/sales-transaction/actions/clone',
        'POST',
        new Map<String, Object>{
          'requiredFields' => new List<String>{
            'salesTransactionId',
            'recordIds'
          },
          'notes' => 'recordIds takes a SINGLE record Id only (the one line/group to clone), not a batch list. Requires Clone Quotes and Orders enabled.',
          'exampleRequestBody' => new Map<String, Object>{
            'salesTransactionId' => '0Q0xx0000004CE0CAM',
            'recordIds' => new List<Object>{ '0QLxx0000004CBYGA2' }
          }
        },
        new Map<String, Object>{
          'notes' => 'Same async poll envelope as Place Sales Transaction.'
        }
      )
    );
    entries.add(
      makeDocumented(
        'placeSupplementalTransaction',
        'Place Supplemental Transaction',
        'Creates a supplemental Order against an existing Account/Contract without a new Quote.',
        '/connect/rev/sales-transaction/actions/place-supplemental-transaction',
        'POST',
        new Map<String, Object>{
          'requiredFields' => new List<String>{
            'relatedSalesTransactionId',
            'supplementalGraph'
          },
          'notes' => 'supplementalGraph is the same referenceId-linked composite-graph shape as Place Sales Transaction\'s graph.',
          'exampleRequestBody' => new Map<String, Object>{
            'relatedSalesTransactionId' => '801S70000001VKgIAM',
            'pricingPref' => 'System',
            'supplementalGraph' => new Map<String, Object>{
              'graphId' => '1',
              'records' => new List<Object>()
            }
          }
        },
        new Map<String, Object>{
          'notes' => 'Same async poll envelope as Place Sales Transaction.'
        }
      )
    );
    entries.add(
      makeDocumented(
        'decisionTableLookup',
        'Decision Table Lookup (Verify)',
        'Looks up and verifies a decision table row match -- useful for confirming pricing/rating logic before or after a refresh.',
        '/connect/business-rules/decision-table/lookup/{id}',
        'POST',
        new Map<String, Object>{
          'requiredFields' => new List<String>{ 'conditions' },
          'notes' => '{id} in the endpoint path is the DecisionTable\'s Id, substitute it before calling. Each condition\'s operator is one of Matches/GreaterThan/Equals/etc.',
          'exampleRequestBody' => new Map<String, Object>{
            'conditions' => new List<Object>{
              new Map<String, Object>{
                'conditionsList' => new List<Object>{
                  new Map<String, Object>{
                    'fieldName' => 'Product__c',
                    'value' => 'Nike',
                    'operator' => 'Matches'
                  },
                  new Map<String, Object>{
                    'fieldName' => 'Price__c',
                    'value' => 1000,
                    'operator' => 'GreaterThan'
                  }
                }
              }
            }
          }
        },
        new Map<String, Object>{
          'notes' => 'Returns the matched output row(s) per the table\'s configured hit policy.'
        }
      )
    );
    entries.add(
      makeDocumented(
        'swapAsset',
        'Swap Asset',
        'Product-exchange: swap one asset for a different product on the same account. No /actions/standard reflection -- Connect REST only.',
        '/revenue/transaction-management/assets/actions/swap',
        'POST',
        productExchangeInputExample('SWAP'),
        new Map<String, Object>{
          'exampleResponseBody' => new Map<String, Object>{
            'salesTransactionId' => '0Q09Q000005IkEPSA0'
          }
        }
      )
    );
    entries.add(
      makeDocumented(
        'upgradeAsset',
        'Upgrade Asset',
        'Product-exchange: upgrade an asset to a higher-tier product. No /actions/standard reflection -- Connect REST only.',
        '/revenue/transaction-management/assets/actions/upgrade',
        'POST',
        productExchangeInputExample('UPGRADE'),
        new Map<String, Object>{
          'exampleResponseBody' => new Map<String, Object>{
            'salesTransactionId' => '0Q09Q000005IkEPSA0'
          }
        }
      )
    );
    entries.add(
      makeDocumented(
        'downgradeAsset',
        'Downgrade Asset',
        'Product-exchange: downgrade an asset to a lower-tier product. No /actions/standard reflection -- Connect REST only.',
        '/revenue/transaction-management/assets/actions/downgrade',
        'POST',
        productExchangeInputExample('DOWNGRADE'),
        new Map<String, Object>{
          'exampleResponseBody' => new Map<String, Object>{
            'salesTransactionId' => '0Q09Q000005IkEPSA0'
          }
        }
      )
    );
    entries.add(
      makeDocumented(
        'createContextDefinition',
        'Create Context Definition',
        'Creates a new context definition -- CLONE (self-contained copy) or EXTENSION (inherits + syncs from a base) depending on which body field is set. POST always creates it INACTIVE regardless of any isActive value sent.',
        '/connect/context-definitions',
        'POST',
        new Map<String, Object>{
          'requiredFields' => new List<String>{
            'developerName',
            'sourceDefinitionId (clone mode) OR baseReference (extension mode)'
          },
          'notes' => 'sourceDefinitionId=<base> makes a CLONE (ClonedFrom set, no inheritance, self-contained). baseReference=<base> makes a true EXTENSION (InheritedFrom+InheritedFromVersion set, inherits and can sync). A DefaultPricing procedure requiring "an extension of ...__stdctx" rejects a clone -- use extension mode for that case. Extension mode inherits the full node/mapping tree with no payload needed, but the inherited default mapping comes back isDefault=false (true on the base) -- PATCH {isActive:true} fails DATA_MAPPING_NOT_FOUND until you fix that via setDefaultContextMapping (this same catalog) first.',
          'exampleRequestBody' => new Map<String, Object>{
            'clone' => new Map<String, Object>{
              'name' => 'MyClone',
              'developerName' => 'MyClone',
              'startDate' => '2026-04-26T00:00:00.000Z',
              'contextTtl' => 10,
              'sourceDefinitionId' => 'SalesTransactionContext__stdctx'
            },
            'extension' => new Map<String, Object>{
              'name' => 'MyExtension',
              'developerName' => 'MyExtension',
              'startDate' => '2026-04-26T00:00:00.000Z',
              'contextTtl' => 10,
              'baseReference' => 'SalesTransactionContext__stdctx'
            }
          }
        },
        new Map<String, Object>{
          'notes' => 'Returns the created definition with its Id. Always isActive:false regardless of input.'
        }
      )
    );
    entries.add(
      makeDocumented(
        'getContextDefinition',
        'Get Context Definition',
        'Reads one context definition by Id -- nodes, attributes, mappings, and version list. Standard *__stdctx definitions do not appear in SELECT FROM ContextDefinition; this is how you reach them.',
        '/connect/context-definitions/{id}',
        'GET',
        new Map<String, Object>{
          'requiredFields' => new List<String>{
            '{id} path segment -- the ContextDefinition Id, substitute before calling, no request body'
          },
          'notes' => 'The single GET has no top-level isActive -- read version-level isActive from contextDefinitionVersionList[]. activeVersionId is set even when the definition is inactive, so check isActive explicitly, not just whether activeVersionId is populated. GET (read) field names differ from POST payload (write) field names -- do not paste a GET response back into a POST payload (e.g. mappings key is contextMappings on read, contextMapping singular on write).'
        },
        null
      )
    );
    entries.add(
      makeDocumented(
        'activateContextDefinition',
        'Activate / Deactivate Context Definition',
        'Flips a context definition\'s active state. This IS the activation mechanism -- deploying <isActive>true</isActive> via Metadata API does NOT activate it, this Connect API call is required.',
        '/connect/context-definitions/{id}',
        'PATCH',
        new Map<String, Object>{
          'requiredFields' => new List<String>{
            '{id} path segment',
            'isActive'
          },
          'notes' => 'This resource serves double duty: {isActive} toggles activation (this entry); a separate "Context Definition Upgrade" body on the SAME resource instead syncs base-standard changes into an extension -- different body, not covered here. Common failure: PATCH {isActive:true} on a freshly-created extension fails DATA_MAPPING_NOT_FOUND -- fix via setDefaultContextMapping first, not by rebuilding the payload.',
          'exampleRequestBody' => new Map<String, Object>{ 'isActive' => true }
        },
        new Map<String, Object>{
          'exampleResponseBody' => new Map<String, Object>{
            'isSuccess' => true,
            'contextDefinitionId' => 'YOUR_CONTEXT_DEFINITION_ID',
            'developerName' => 'YourCustomContextExt',
            'isEditable' => true,
            'isUpgradeAvailable' => false
          }
        }
      )
    );
    entries.add(
      makeDocumented(
        'setDefaultContextMapping',
        'Set Default Context Mapping',
        'Flips isDefault on an inherited context mapping without a full-definition payload -- the verified, headless fix for DATA_MAPPING_NOT_FOUND when activating a freshly-created context-definition extension.',
        '/connect/context-definitions/{id}/context-mappings',
        'POST',
        new Map<String, Object>{
          'requiredFields' => new List<String>{
            '{id} path segment',
            'contextMappings[].contextMappingId'
          },
          'notes' => 'contextMappingId is re-minted per create -- read it fresh from GET .../{id} -> contextDefinitionVersionList[0].contextMappings[], never assume/reuse an old value. Default mapping name is context-type-specific and must be verified per org, not assumed: ProductDiscoveryMapping for Product Discovery contexts, QuoteEntitiesMapping for SalesTransaction contexts. Also accepts PATCH on the same resource. Part of a 3-call sequence: createContextDefinition (extension mode) -> this call -> activateContextDefinition.',
          'exampleRequestBody' => new Map<String, Object>{
            'contextMappings' => new List<Object>{
              new Map<String, Object>{
                'contextMappingId' => '<from GET>',
                'name' => 'ProductDiscoveryMapping',
                'isDefault' => true,
                'intents' => new List<Object>{
                  'ASSOCIATION',
                  'HYDRATION',
                  'PERSISTENCE',
                  'TRANSLATION'
                }
              }
            },
            'generateInputMappings' => false,
            'generateSObjectMappings' => false
          }
        },
        new Map<String, Object>{
          'notes' => 'Returns the updated Context Mapping List Output (the full updated mapping graph).'
        }
      )
    );

    return entries;
  }

  // Swap/upgrade/downgrade share one request shape -- only the referenceId/graphId label differs.
  private static Map<String, Object> productExchangeInputExample(
    String actionLabel
  ) {
    return new Map<String, Object>{
      'requiredFields' => new List<String>{
        'swapStartDate',
        'outputRecordType',
        'swapGroups.groups[].outGroup.swapAssets',
        'swapGroups.groups[].inGroup'
      },
      'notes' => 'Same request/response shape for swap, upgrade, and downgrade -- only the referenceId/graphId label convention differs (' +
      actionLabel +
      '-.../' +
      actionLabel.toLowerCase() +
      'Request here). outGroup.swapAssets is what leaves (existing assetId + quantity); inGroup is a composite graph of what comes in, same record shape as Place Sales Transaction.',
      'exampleRequestBody' => new Map<String, Object>{
        'swapStartDate' => '2025-12-01T00:00:00Z',
        'outputRecordType' => 'Quote',
        'swapGroups' => new Map<String, Object>{
          'groups' => new List<Object>{
            new Map<String, Object>{
              'referenceId' => actionLabel + '-001',
              'outGroup' => new Map<String, Object>{
                'swapAssets' => new List<Object>{
                  new Map<String, Object>{
                    'assetId' => '02ixx0000004HOAAA2',
                    'quantity' => 1
                  }
                }
              },
              'inGroup' => new Map<String, Object>{
                'graphId' => actionLabel.toLowerCase() + 'Request',
                'records' => new List<Object>{
                  new Map<String, Object>{
                    'referenceId' => 'refQuoteLine0',
                    'record' => new Map<String, Object>{
                      'attributes' => new Map<String, Object>{
                        'type' => 'QuoteLineItem',
                        'method' => 'POST'
                      },
                      'Product2Id' => '01txx0000006iVlAAI',
                      'PricebookEntryId' => '01uxx0000008ym4AAA',
                      'Quantity' => '1'
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
  }

  private static ApiEntry makeDocumented(
    String name,
    String label,
    String description,
    String endpoint,
    String httpMethod,
    Object inputsExample,
    Object outputsExample
  ) {
    ApiEntry entry = new ApiEntry();
    entry.name = name;
    entry.label = label;
    entry.description = description;
    entry.category = 'Revenue Cloud';
    entry.endpoint = endpoint;
    entry.httpMethod = httpMethod;
    entry.sourceType = 'documented';
    entry.inputsJson = inputsExample != null
      ? JSON.serialize(inputsExample)
      : null;
    entry.outputsJson = outputsExample != null
      ? JSON.serialize(outputsExample)
      : null;
    return entry;
  }

  global class Request {
    @InvocableVariable(
      label='API Version'
      description='Optional. Defaults to 67.0.'
    )
    global String apiVersion;
  }

  global class Response {
    @InvocableVariable(
      label='APIs'
      description='The full list of Revenue Cloud business APIs found.'
    )
    global List<ApiEntry> apis;

    @InvocableVariable(
      label='Total Count'
      description='Number of API entries returned.'
    )
    global Integer totalCount;
  }

  global class ApiEntry {
    @InvocableVariable(label='Name' description='The action or resource name.')
    global String name;

    @InvocableVariable(label='Label' description='Human-readable label.')
    global String label;

    @InvocableVariable(label='Description' description='What this API does.')
    global String description;

    @InvocableVariable(
      label='Category'
      description='Salesforce category, e.g. Revenue Cloud.'
    )
    global String category;

    @InvocableVariable(label='Endpoint' description='The real API path.')
    global String endpoint;

    @InvocableVariable(
      label='HTTP Method'
      description='The HTTP method used to call this endpoint.'
    )
    global String httpMethod;

    @InvocableVariable(
      label='Source Type'
      description='"liveSchema" if fetched live from this org just now, "documented" if hand-maintained because the platform does not expose it via reflection.'
    )
    global String sourceType;

    @InvocableVariable(
      label='Inputs (JSON)'
      description='Input parameter schema as a JSON string, when available from liveSchema.'
    )
    global String inputsJson;

    @InvocableVariable(
      label='Outputs (JSON)'
      description='Output schema as a JSON string, when available from liveSchema.'
    )
    global String outputsJson;
  }
}
