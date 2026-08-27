/**
 * End-of-day digest for a sales rep: Account summary, today's Task/Call activity, a four-part
 * Opportunity summary, and rule-based next-step suggestions — for every account the rep owns.
 * As a final step, emails the digest directly to that rep.
 *
 * Exposed as a Salesforce Hosted MCP tool (getRepDailySummary) via an McpServerDefinition.
 * MUST be `global` — `public @InvocableMethod` is not eligible for MCP tool exposure.
 *
 * Runs `with sharing` as the calling (authenticated) rep — no system.runAs, no service-account
 * elevation. The rep defaults to the SESSION user (`UserInfo.getUserId()`, the OAuth-
 * authenticated caller) — this is what every scheduled, once-daily call uses, per rep, via a
 * per-rep OAuth refresh token. An optional `repEmail` override resolves a DIFFERENT rep by email
 * instead (e.g. "get Jane's digest" — an agent knows an email, not a Salesforce Id). The override
 * does not widen access: `with sharing` + `WITH USER_MODE` still gate every query on the CALLING
 * session's own visibility, so requesting another rep's email only returns data the calling user
 * could already see via sharing/role hierarchy.
 *
 * The @InvocableVariable `description` text becomes the agent-readable schema, so it is
 * written for a model to read, not a developer.
 */
global with sharing class RepDailySummaryService {
  private static final Integer OPPS_CHANGED_TODAY_CAP = 8;
  private static final Integer NO_ACTIVITY_DAYS = 14;
  private static final Integer STALE_OPP_DAYS = 30;
  private static final Integer RENEWAL_WINDOW_DAYS = 14;

  global class Request {
    @InvocableVariable(
      label='Rep Email (override)'
      description='Email of the sales rep to build the digest for. Optional — omit to default to the calling (authenticated) user, which is what the daily automated call uses. Set only when explicitly asked for a specific rep by email; sharing rules on the calling user still apply regardless.'
    )
    global String repEmail;

    @InvocableVariable(
      label='As Of Date'
      description='Start of the date range to build the summary for. Optional, defaults to today. Alone (no endDate), covers just this one day.'
    )
    global Date asOfDate;

    @InvocableVariable(
      label='End Date'
      description='End of the date range (inclusive). Optional, defaults to asOfDate itself -- a single-day digest. Set alongside asOfDate to cover a multi-day range instead of just one day.'
    )
    global Date endDate;
  }

  global class AccountSummaryLine {
    @InvocableVariable(description='Account record id.')
    global String accountId;
    @InvocableVariable(description='Account name.')
    global String accountName;
    @InvocableVariable(
      description='Count of this account\'s open opportunities.'
    )
    global Integer openOppCount;
    @InvocableVariable(
      description='Total amount of this account\'s open opportunities.'
    )
    global Decimal openPipelineAmount;
  }

  global class ActivityLine {
    @InvocableVariable(description='Task record id.')
    global String taskId;
    @InvocableVariable(
      description='Name of the account the task is logged against.'
    )
    global String accountName;
    @InvocableVariable(description='Task subject.')
    global String subject;
    @InvocableVariable(
      description='Call outcome or activity status, human readable.'
    )
    global String callOutcome;
    @InvocableVariable(description='Name of who the task is with, if set.')
    global String whoName;
  }

  global class OppLine {
    @InvocableVariable(description='Opportunity record id.')
    global String oppId;
    @InvocableVariable(description='Opportunity name.')
    global String name;
    @InvocableVariable(description='Name of the related account.')
    global String accountName;
    @InvocableVariable(description='Current stage name.')
    global String stageName;
    @InvocableVariable(description='Opportunity amount.')
    global Decimal amount;
    @InvocableVariable(description='What changed, in human readable terms.')
    global String changeDescription;
  }

  global class StatusRollup {
    @InvocableVariable(description='Stage name.')
    global String stageName;
    @InvocableVariable(description='Count of open opportunities in this stage.')
    global Integer oppCount;
    @InvocableVariable(
      description='Total amount of open opportunities in this stage.'
    )
    global Decimal totalAmount;
  }

  global class RenewalLine {
    @InvocableVariable(description='Asset record id.')
    global String assetId;
    @InvocableVariable(description='Name of the related account.')
    global String accountName;
    @InvocableVariable(description='Asset name.')
    global String assetName;
    @InvocableVariable(description='Current lifecycle end date for this asset.')
    global Date endDate;
    @InvocableVariable(
      description='Days remaining until the asset\'s lifecycle end date.'
    )
    global Integer daysUntilDue;
  }

  global class NextStepLine {
    @InvocableVariable(
      description='Id of the record this suggestion relates to.'
    )
    global String relatedRecordId;
    @InvocableVariable(
      description='Name of the record this suggestion relates to.'
    )
    global String relatedRecordName;
    @InvocableVariable(
      description='Category of the suggestion, e.g. Outreach, Escalation, WinLossFollowUp, Renewal.'
    )
    global String category;
    @InvocableVariable(
      description='The suggested next step, in plain language.'
    )
    global String suggestion;
    @InvocableVariable(
      description='Stable code identifying which rule produced this suggestion, for traceability.'
    )
    global String reasonCode;
  }

  global class Response {
    @InvocableVariable(description='Name of the rep this summary is for.')
    global String repName;
    @InvocableVariable(
      description='The date this summary covers, formatted as text.'
    )
    global String asOfDateStr;
    @InvocableVariable(description='Count of accounts this rep owns.')
    global Integer accountCount;
    @InvocableVariable(
      description='Per-account rollup for every account this rep owns.'
    )
    global List<AccountSummaryLine> accountSummaries;
    @InvocableVariable(
      description='Tasks and calls logged today across this rep\'s accounts.'
    )
    global List<ActivityLine> todaysActivity;
    @InvocableVariable(
      description='Opportunities that changed today, capped at 8.'
    )
    global List<OppLine> oppsChangedToday;
    @InvocableVariable(
      description='Rollup of every open opportunity by stage, across this rep\'s full pipeline.'
    )
    global List<StatusRollup> pipelineByStatus;
    @InvocableVariable(description='Opportunities won or lost today.')
    global List<OppLine> wonOrLostToday;
    @InvocableVariable(
      description='Assets/subscriptions due for renewal within the next 14 days that do not automatically renew.'
    )
    global List<RenewalLine> renewalsAtRisk;
    @InvocableVariable(
      description='Rule-based next-step suggestions, each traceable to the rule that produced it.'
    )
    global List<NextStepLine> nextSteps;

    global Response() {
      accountSummaries = new List<AccountSummaryLine>();
      todaysActivity = new List<ActivityLine>();
      oppsChangedToday = new List<OppLine>();
      pipelineByStatus = new List<StatusRollup>();
      wonOrLostToday = new List<OppLine>();
      renewalsAtRisk = new List<RenewalLine>();
      nextSteps = new List<NextStepLine>();
    }
  }

  @InvocableMethod(
    label='Get Rep Daily Summary'
    description='Builds an end-of-day digest for a sales rep: an account summary, today\'s call/task activity, a four-part opportunity summary (changed today, full pipeline by stage, won/lost today, renewals due within 14 days), and rule-based next-step suggestions — then emails the digest to that rep. Scoped strictly to the accounts the rep owns; defaults to the calling user, or a specific rep by email if given.'
  )
  global static List<Response> getRepDailySummary(List<Request> requests) {
    List<Response> responses = new List<Response>();
    List<Messaging.SingleEmailMessage> emailsToSend = new List<Messaging.SingleEmailMessage>();

    for (Request req : requests) {
      Response res = new Response();
      Id repId = String.isNotBlank(req.repEmail)
        ? resolveRepIdByEmail(req.repEmail)
        : UserInfo.getUserId();
      Date rangeStart = req.asOfDate == null ? Date.today() : req.asOfDate;
      Date rangeEnd = req.endDate == null ? rangeStart : req.endDate;
      res.asOfDateStr = rangeStart == rangeEnd
        ? String.valueOf(rangeStart)
        : (String.valueOf(rangeStart) + ' to ' + String.valueOf(rangeEnd));

      List<User> repUsers = repId == null
        ? new List<User>()
        : [
            SELECT Name, Email
            FROM User
            WHERE Id = :repId
            WITH USER_MODE
            LIMIT 1
          ];
      res.repName = repUsers.isEmpty() ? null : repUsers[0].Name;

      List<Account> accounts = [
        SELECT Id, Name
        FROM Account
        WHERE OwnerId = :repId
        WITH USER_MODE
      ];
      Map<Id, String> accountNames = new Map<Id, String>();
      for (Account a : accounts) {
        accountNames.put(a.Id, a.Name);
      }
      Set<Id> accountIds = accountNames.keySet();
      res.accountCount = accountIds.size();

      List<Opportunity> opps = accountIds.isEmpty()
        ? new List<Opportunity>()
        : [
            SELECT
              Id,
              Name,
              AccountId,
              StageName,
              Amount,
              CloseDate,
              IsClosed,
              IsWon,
              LastModifiedDate
            FROM Opportunity
            WHERE AccountId IN :accountIds
            WITH USER_MODE
          ];

      List<Task> tasksToday = accountIds.isEmpty()
        ? new List<Task>()
        : [
            SELECT Id, WhatId, Subject, TaskSubtype, Status, Who.Name
            FROM Task
            WHERE
              WhatId IN :accountIds
              AND ActivityDate >= :rangeStart
              AND ActivityDate <= :rangeEnd
            WITH USER_MODE
          ];

      List<Task> recentTasks = accountIds.isEmpty()
        ? new List<Task>()
        : [
            SELECT WhatId, ActivityDate
            FROM Task
            WHERE
              WhatId IN :accountIds
              AND ActivityDate >= :rangeEnd.addDays(-NO_ACTIVITY_DAYS)
              AND ActivityDate <= :rangeEnd
            WITH USER_MODE
          ];
      Set<Id> accountsWithRecentActivity = new Set<Id>();
      for (Task t : recentTasks) {
        accountsWithRecentActivity.add(t.WhatId);
      }

      Datetime windowStart = Datetime.newInstance(
        rangeEnd,
        Time.newInstance(0, 0, 0, 0)
      );
      Datetime windowEnd = Datetime.newInstance(
        rangeEnd.addDays(RENEWAL_WINDOW_DAYS),
        Time.newInstance(0, 0, 0, 0)
      );
      List<Asset> renewalAssets = accountIds.isEmpty()
        ? new List<Asset>()
        : [
            SELECT
              Id,
              Name,
              AccountId,
              CurrentLifecycleEndDate,
              DoesAutomaticallyRenew
            FROM Asset
            WHERE
              AccountId IN :accountIds
              AND DoesAutomaticallyRenew = FALSE
              AND CurrentLifecycleEndDate != NULL
              AND CurrentLifecycleEndDate >= :windowStart
              AND CurrentLifecycleEndDate <= :windowEnd
            WITH USER_MODE
          ];

      buildAccountSummaries(res, accountIds, accountNames, opps);
      buildTodaysActivity(res, tasksToday, accountNames);
      buildOppsChangedToday(res, opps, rangeStart, rangeEnd, accountNames);
      buildPipelineByStatus(res, opps);
      buildWonOrLostToday(res, opps, rangeStart, rangeEnd, accountNames);
      buildRenewalsAtRisk(res, renewalAssets, accountNames, rangeEnd);

      applyNextStepRules(
        res,
        opps,
        accountNames,
        accountsWithRecentActivity,
        rangeStart,
        rangeEnd
      );

      responses.add(res);

      if (!repUsers.isEmpty() && String.isNotBlank(repUsers[0].Email)) {
        emailsToSend.add(buildDigestEmail(res, repUsers[0].Email));
      }
    }

    if (!emailsToSend.isEmpty()) {
      try {
        Messaging.sendEmail(emailsToSend, false);
      } catch (Exception e) {
        // Digest data still returns to the caller even if the email dispatch fails.
      }
    }

    return responses;
  }

  /** Named lookup: resolve a User Id from an email address, under the calling user's own visibility. */
  private static Id resolveRepIdByEmail(String email) {
    List<User> matches = [
      SELECT Id
      FROM User
      WHERE Email = :email
      WITH USER_MODE
      LIMIT 1
    ];
    return matches.isEmpty() ? null : matches[0].Id;
  }

  private static Messaging.SingleEmailMessage buildDigestEmail(
    Response res,
    String toAddress
  ) {
    Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
    email.setToAddresses(new List<String>{ toAddress });
    email.setSubject('Your Daily Digest — ' + res.asOfDateStr);
    email.setHtmlBody(buildEmailBodyHtml(res));
    email.setPlainTextBody(buildEmailBody(res));
    email.setSaveAsActivity(false);
    return email;
  }

  private static String esc(String s) {
    return s == null ? '' : s.escapeHtml4();
  }

  // URL.getOrgDomainUrl() returns the my.salesforce.com API/auth domain, not the
  // lightning.force.com domain a browser actually needs for record links to redirect
  // correctly -- swap it so links in the email work when clicked, not just when
  // already sitting in an active Lightning session.
  private static String lightningDomain() {
    return URL.getOrgDomainUrl()
      .toExternalForm()
      .replace('.my.salesforce.com', '.lightning.force.com');
  }

  private static String buildEmailBodyHtml(Response res) {
    String domain = lightningDomain();
    String h = '<html><body style="font-family: sans-serif;">';
    h += '<h2>Your daily digest for ' + esc(res.asOfDateStr) + '</h2>';

    h += '<h3>Accounts (' + res.accountCount + ')</h3><ul>';
    for (AccountSummaryLine line : res.accountSummaries) {
      h +=
        '<li>' +
        esc(line.accountName) +
        ': ' +
        line.openOppCount +
        ' open opp(s), $' +
        line.openPipelineAmount +
        ' open pipeline' +
        ' -- <a href="' +
        domain +
        '/' +
        line.accountId +
        '" target="_blank">View</a></li>';
    }
    h += '</ul>';

    h += '<h3>Today\'s Activity (' + res.todaysActivity.size() + ')</h3><ul>';
    for (ActivityLine line : res.todaysActivity) {
      h +=
        '<li>' +
        esc(line.accountName) +
        ': ' +
        esc(line.subject) +
        ' (' +
        esc(line.callOutcome) +
        ')' +
        ' -- <a href="' +
        domain +
        '/' +
        line.taskId +
        '" target="_blank">View</a></li>';
    }
    h += '</ul>';

    h +=
      '<h3>Opportunities Changed Today (' +
      res.oppsChangedToday.size() +
      ')</h3><ul>';
    for (OppLine line : res.oppsChangedToday) {
      h +=
        '<li>' +
        esc(line.name) +
        ' (' +
        esc(line.accountName) +
        '): ' +
        esc(line.changeDescription) +
        ' -- <a href="' +
        domain +
        '/' +
        line.oppId +
        '" target="_blank">View</a></li>';
    }
    h += '</ul>';

    h += '<h3>Open Pipeline By Stage</h3><ul>';
    for (StatusRollup line : res.pipelineByStatus) {
      h +=
        '<li>' +
        esc(line.stageName) +
        ': ' +
        line.oppCount +
        ' opp(s), $' +
        line.totalAmount +
        '</li>';
    }
    h += '</ul>';

    h += '<h3>Won/Lost Today (' + res.wonOrLostToday.size() + ')</h3><ul>';
    for (OppLine line : res.wonOrLostToday) {
      h +=
        '<li>' +
        esc(line.name) +
        ' (' +
        esc(line.accountName) +
        '): ' +
        esc(line.changeDescription) +
        ' -- <a href="' +
        domain +
        '/' +
        line.oppId +
        '" target="_blank">View</a></li>';
    }
    h += '</ul>';

    h +=
      '<h3>Renewals Due Within 14 Days (' +
      res.renewalsAtRisk.size() +
      ')</h3><ul>';
    for (RenewalLine line : res.renewalsAtRisk) {
      h +=
        '<li>' +
        esc(line.assetName) +
        ' (' +
        esc(line.accountName) +
        '): due ' +
        line.endDate +
        ', ' +
        line.daysUntilDue +
        ' day(s)' +
        ' -- <a href="' +
        domain +
        '/' +
        line.assetId +
        '" target="_blank">View</a></li>';
    }
    h += '</ul>';

    h += '<h3>Suggested Next Steps (' + res.nextSteps.size() + ')</h3><ul>';
    for (NextStepLine line : res.nextSteps) {
      h +=
        '<li>[' +
        esc(line.category) +
        '] ' +
        esc(line.suggestion) +
        ' -- <a href="' +
        domain +
        '/' +
        line.relatedRecordId +
        '" target="_blank">View</a></li>';
    }
    h += '</ul>';

    h += '</body></html>';
    return h;
  }

  private static String buildEmailBody(Response res) {
    String nl = '\n';
    String domain = lightningDomain();
    String body = 'Your daily digest for ' + res.asOfDateStr + nl + nl;

    body += 'ACCOUNTS (' + res.accountCount + ')' + nl;
    for (AccountSummaryLine line : res.accountSummaries) {
      body +=
        '- ' +
        line.accountName +
        ': ' +
        line.openOppCount +
        ' open opp(s), $' +
        line.openPipelineAmount +
        ' open pipeline' +
        nl;
      body += '  ' + domain + '/' + line.accountId + nl;
    }
    body += nl;

    body += 'TODAY\'S ACTIVITY (' + res.todaysActivity.size() + ')' + nl;
    for (ActivityLine line : res.todaysActivity) {
      body +=
        '- ' +
        line.accountName +
        ': ' +
        line.subject +
        ' (' +
        line.callOutcome +
        ')' +
        nl;
      body += '  ' + domain + '/' + line.taskId + nl;
    }
    body += nl;

    body +=
      'OPPORTUNITIES CHANGED TODAY (' +
      res.oppsChangedToday.size() +
      ')' +
      nl;
    for (OppLine line : res.oppsChangedToday) {
      body +=
        '- ' +
        line.name +
        ' (' +
        line.accountName +
        '): ' +
        line.changeDescription +
        nl;
      body += '  ' + domain + '/' + line.oppId + nl;
    }
    body += nl;

    body += 'OPEN PIPELINE BY STAGE' + nl;
    for (StatusRollup line : res.pipelineByStatus) {
      body +=
        '- ' +
        line.stageName +
        ': ' +
        line.oppCount +
        ' opp(s), $' +
        line.totalAmount +
        nl;
    }
    body += nl;

    body += 'WON/LOST TODAY (' + res.wonOrLostToday.size() + ')' + nl;
    for (OppLine line : res.wonOrLostToday) {
      body +=
        '- ' +
        line.name +
        ' (' +
        line.accountName +
        '): ' +
        line.changeDescription +
        nl;
      body += '  ' + domain + '/' + line.oppId + nl;
    }
    body += nl;

    body +=
      'RENEWALS DUE WITHIN 14 DAYS (' +
      res.renewalsAtRisk.size() +
      ')' +
      nl;
    for (RenewalLine line : res.renewalsAtRisk) {
      body +=
        '- ' +
        line.assetName +
        ' (' +
        line.accountName +
        '): due ' +
        line.endDate +
        ', ' +
        line.daysUntilDue +
        ' day(s)' +
        nl;
      body += '  ' + domain + '/' + line.assetId + nl;
    }
    body += nl;

    body += 'SUGGESTED NEXT STEPS (' + res.nextSteps.size() + ')' + nl;
    for (NextStepLine line : res.nextSteps) {
      body += '- [' + line.category + '] ' + line.suggestion + nl;
      body += '  ' + domain + '/' + line.relatedRecordId + nl;
    }

    return body;
  }

  private static void buildAccountSummaries(
    Response res,
    Set<Id> accountIds,
    Map<Id, String> accountNames,
    List<Opportunity> opps
  ) {
    Map<Id, Integer> openCountByAcct = new Map<Id, Integer>();
    Map<Id, Decimal> openAmountByAcct = new Map<Id, Decimal>();
    for (Opportunity o : opps) {
      if (!o.IsClosed) {
        openCountByAcct.put(
          o.AccountId,
          (openCountByAcct.containsKey(o.AccountId)
            ? openCountByAcct.get(o.AccountId)
            : 0) + 1
        );
        Decimal amt = o.Amount == null ? 0 : o.Amount;
        openAmountByAcct.put(
          o.AccountId,
          (openAmountByAcct.containsKey(o.AccountId)
            ? openAmountByAcct.get(o.AccountId)
            : 0) + amt
        );
      }
    }
    for (Id acctId : accountIds) {
      AccountSummaryLine line = new AccountSummaryLine();
      line.accountId = acctId;
      line.accountName = accountNames.get(acctId);
      line.openOppCount = openCountByAcct.containsKey(acctId)
        ? openCountByAcct.get(acctId)
        : 0;
      line.openPipelineAmount = openAmountByAcct.containsKey(acctId)
        ? openAmountByAcct.get(acctId)
        : 0;
      res.accountSummaries.add(line);
    }
  }

  private static void buildTodaysActivity(
    Response res,
    List<Task> tasksToday,
    Map<Id, String> accountNames
  ) {
    for (Task t : tasksToday) {
      ActivityLine line = new ActivityLine();
      line.taskId = t.Id;
      line.accountName = accountNames.get(t.WhatId);
      line.subject = t.Subject;
      line.callOutcome = t.TaskSubtype == 'Call'
        ? ('Call - ' + t.Status)
        : t.Status;
      line.whoName = t.Who != null ? t.Who.Name : null;
      res.todaysActivity.add(line);
    }
  }

  private static void buildOppsChangedToday(
    Response res,
    List<Opportunity> opps,
    Date rangeStart,
    Date rangeEnd,
    Map<Id, String> accountNames
  ) {
    Integer added = 0;
    for (Opportunity o : opps) {
      if (added >= OPPS_CHANGED_TODAY_CAP) {
        break;
      }
      if (
        o.LastModifiedDate != null &&
        o.LastModifiedDate.date() >= rangeStart &&
        o.LastModifiedDate.date() <= rangeEnd
      ) {
        OppLine line = new OppLine();
        line.oppId = o.Id;
        line.name = o.Name;
        line.accountName = accountNames.get(o.AccountId);
        line.stageName = o.StageName;
        line.amount = o.Amount;
        line.changeDescription =
          'Modified in range, currently in stage "' +
          o.StageName +
          '"';
        res.oppsChangedToday.add(line);
        added++;
      }
    }
  }

  private static void buildPipelineByStatus(
    Response res,
    List<Opportunity> opps
  ) {
    Map<String, Integer> countByStage = new Map<String, Integer>();
    Map<String, Decimal> amountByStage = new Map<String, Decimal>();
    for (Opportunity o : opps) {
      if (!o.IsClosed) {
        countByStage.put(
          o.StageName,
          (countByStage.containsKey(o.StageName)
            ? countByStage.get(o.StageName)
            : 0) + 1
        );
        Decimal amt = o.Amount == null ? 0 : o.Amount;
        amountByStage.put(
          o.StageName,
          (amountByStage.containsKey(o.StageName)
            ? amountByStage.get(o.StageName)
            : 0) + amt
        );
      }
    }
    for (String stage : countByStage.keySet()) {
      StatusRollup line = new StatusRollup();
      line.stageName = stage;
      line.oppCount = countByStage.get(stage);
      line.totalAmount = amountByStage.get(stage);
      res.pipelineByStatus.add(line);
    }
  }

  private static void buildWonOrLostToday(
    Response res,
    List<Opportunity> opps,
    Date rangeStart,
    Date rangeEnd,
    Map<Id, String> accountNames
  ) {
    for (Opportunity o : opps) {
      if (
        o.IsClosed &&
        o.CloseDate != null &&
        o.CloseDate >= rangeStart &&
        o.CloseDate <= rangeEnd
      ) {
        OppLine line = new OppLine();
        line.oppId = o.Id;
        line.name = o.Name;
        line.accountName = accountNames.get(o.AccountId);
        line.stageName = o.StageName;
        line.amount = o.Amount;
        line.changeDescription = o.IsWon ? 'Closed won' : 'Closed lost';
        res.wonOrLostToday.add(line);
      }
    }
  }

  private static void buildRenewalsAtRisk(
    Response res,
    List<Asset> renewalAssets,
    Map<Id, String> accountNames,
    Date rangeEnd
  ) {
    for (Asset asst : renewalAssets) {
      RenewalLine line = new RenewalLine();
      line.assetId = asst.Id;
      line.accountName = accountNames.get(asst.AccountId);
      line.assetName = asst.Name;
      Date endDate = asst.CurrentLifecycleEndDate.date();
      line.endDate = endDate;
      line.daysUntilDue = rangeEnd.daysBetween(endDate);
      res.renewalsAtRisk.add(line);
    }
  }

  private static void applyNextStepRules(
    Response res,
    List<Opportunity> opps,
    Map<Id, String> accountNames,
    Set<Id> accountsWithRecentActivity,
    Date rangeStart,
    Date rangeEnd
  ) {
    // Rule 1: owned account, open opportunity, no task in the last N days -> suggest outreach
    Set<Id> accountsWithOpenOpp = new Set<Id>();
    for (Opportunity o : opps) {
      if (!o.IsClosed) {
        accountsWithOpenOpp.add(o.AccountId);
      }
    }
    for (Id acctId : accountsWithOpenOpp) {
      if (!accountsWithRecentActivity.contains(acctId)) {
        NextStepLine line = new NextStepLine();
        line.relatedRecordId = acctId;
        line.relatedRecordName = accountNames.get(acctId);
        line.category = 'Outreach';
        line.suggestion =
          'No activity logged with ' +
          accountNames.get(acctId) +
          ' in the last ' +
          NO_ACTIVITY_DAYS +
          ' days. Consider sending a follow-up email to re-engage.';
        line.reasonCode = 'NO_RECENT_ACTIVITY';
        res.nextSteps.add(line);
      }
    }

    for (Opportunity o : opps) {
      // Rule 2: stalled open opportunity (anchored to the end of the requested range)
      if (
        !o.IsClosed &&
        o.LastModifiedDate != null &&
        o.LastModifiedDate.date() <= rangeEnd.addDays(-STALE_OPP_DAYS)
      ) {
        NextStepLine line = new NextStepLine();
        line.relatedRecordId = o.Id;
        line.relatedRecordName = o.Name;
        line.category = 'Escalation';
        line.suggestion =
          'Opportunity "' +
          o.Name +
          '" has not moved in over ' +
          STALE_OPP_DAYS +
          ' days. Consider escalating or reviewing.';
        line.reasonCode = 'STALLED_OPPORTUNITY';
        res.nextSteps.add(line);
      }
      // Rule 3: closed within the requested range
      if (
        o.IsClosed &&
        o.CloseDate != null &&
        o.CloseDate >= rangeStart &&
        o.CloseDate <= rangeEnd
      ) {
        NextStepLine line = new NextStepLine();
        line.relatedRecordId = o.Id;
        line.relatedRecordName = o.Name;
        line.category = 'WinLossFollowUp';
        line.suggestion = o.IsWon
          ? 'Opportunity "' +
            o.Name +
            '" closed won. Consider sending a thank-you follow-up email or scheduling a kickoff.'
          : 'Opportunity "' +
            o.Name +
            '" closed lost. Consider an internal debrief to capture the loss reason -- not a customer email.';
        line.reasonCode = o.IsWon ? 'CLOSED_WON_TODAY' : 'CLOSED_LOST_TODAY';
        res.nextSteps.add(line);
      }
    }

    // Rule 4: renewal due soon
    for (RenewalLine r : res.renewalsAtRisk) {
      NextStepLine line = new NextStepLine();
      line.relatedRecordId = r.assetId;
      line.relatedRecordName = r.assetName;
      line.category = 'Renewal';
      line.suggestion =
        'Asset "' +
        r.assetName +
        '" for ' +
        r.accountName +
        ' does not auto-renew and is due in ' +
        r.daysUntilDue +
        ' day(s). Consider sending a renewal follow-up email.';
      line.reasonCode = 'RENEWAL_DUE_SOON';
      res.nextSteps.add(line);
    }
  }
}
