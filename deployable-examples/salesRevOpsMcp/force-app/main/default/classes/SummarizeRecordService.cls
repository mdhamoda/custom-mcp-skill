global with sharing class SummarizeRecordService {
  global class SummaryRequest {
    @InvocableVariable(required=true label='SObject Type')
    global String sObjectType;
    @InvocableVariable(required=true label='Record Id')
    global String recordId;
  }

  global class SummaryResponse {
    @InvocableVariable
    global String recordId;
    @InvocableVariable
    global String objectType;
    @InvocableVariable
    global String recordName;
    @InvocableVariable
    global String url;
    @InvocableVariable
    global List<FieldValue> fieldValues;
  }

  global class FieldValue {
    @InvocableVariable
    global String fieldLabel;
    @InvocableVariable
    global String fieldValue;
  }

  @InvocableMethod(
    label='Summarize Record'
    description='Gets a flat summary of the standard fields on any record, given its sObject type and Id -- no need to know the field list in advance.'
  )
  global static List<SummaryResponse> summarizeRecord(
    List<SummaryRequest> requests
  ) {
    List<SummaryResponse> results = new List<SummaryResponse>();
    String domain = URL.getOrgDomainUrl().toExternalForm();
    Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();

    for (SummaryRequest req : requests) {
      SummaryResponse res = new SummaryResponse();
      res.recordId = req.recordId;
      res.objectType = req.sObjectType;
      res.fieldValues = new List<FieldValue>();

      Schema.SObjectType targetType = req.sObjectType == null
        ? null
        : globalDescribe.get(req.sObjectType.toLowerCase());
      if (targetType == null) {
        res.recordName = 'Unknown object type: ' + req.sObjectType;
        results.add(res);
        continue;
      }

      try {
        Id recId = Id.valueOf(req.recordId);
        String safeType = targetType.getDescribe().getName();
        String query =
          'SELECT FIELDS(STANDARD) FROM ' +
          safeType +
          ' WHERE Id = :recId WITH USER_MODE LIMIT 1';
        List<SObject> recs = Database.query(query);

        if (recs.isEmpty()) {
          res.recordName = 'Record not found or not accessible';
        } else {
          SObject rec = recs[0];
          Map<String, Schema.SObjectField> fieldMap = targetType.getDescribe()
            .fields.getMap();
          Map<String, Object> populated = rec.getPopulatedFieldsAsMap();
          for (String fieldApiName : populated.keySet()) {
            if (fieldApiName == 'Id') {
              continue;
            }
            Object val = populated.get(fieldApiName);
            if (val == null) {
              continue;
            }
            Schema.SObjectField fieldToken = fieldMap.get(fieldApiName);
            if (
              fieldToken != null &&
              fieldToken.getDescribe().getType() == Schema.DisplayType.ADDRESS
            ) {
              continue;
            }
            FieldValue fv = new FieldValue();
            fv.fieldLabel = fieldToken != null
              ? fieldToken.getDescribe().getLabel()
              : fieldApiName;
            fv.fieldValue = String.valueOf(val);
            res.fieldValues.add(fv);
          }
          res.recordName = populated.containsKey('Name')
            ? String.valueOf(populated.get('Name'))
            : null;
          res.url = domain + '/' + req.recordId;
        }
      } catch (Exception e) {
        res.recordName = 'Error: ' + e.getMessage();
      }
      results.add(res);
    }
    return results;
  }
}
