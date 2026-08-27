/**
 * Reads or edits any Salesforce record by Id -- one generic tool for both. No sObject type
 * input needed: the type is resolved from the Id itself (recId.getSObjectType()), same idiom
 * already proven in GetRecordLinkService. When fieldsToUpdateJson is blank this is a
 * read; when present, it applies the update (DML user-mode -- the write-side counterpart to the
 * WITH USER_MODE read below) then returns the post-update record.
 *
 * Known limitation: fieldsToUpdateJson values are put() as their raw JSON-deserialized type
 * (String/Double/Boolean) -- this covers text, number, currency, checkbox, and picklist fields.
 * Date/DateTime fields are not supported in this version (a raw JSON string does not coerce into
 * a Date-typed field via dynamic put()).
 *
 * Known limitation: the response's field1Label/field1Value..field8Label/field8Value carry the
 * record's first 8 populated fields (Id and compound address fields excluded) as fixed label/value
 * slot pairs, not a true list -- Custom Lightning Types have no array/list Lightning type in the
 * official reference, so this is the widest generic field list a CLT-backed response can carry.
 */
global with sharing class RecordAccessService {
  global class RecordAccessRequest {
    @InvocableVariable(required=true label='Record Id')
    global String recordId;
    @InvocableVariable(
      label='Fields To Update (JSON)'
      description='Optional. A JSON object of field API name -> new value, e.g. {"Industry":"Technology"}. Omit for a read-only call. Date/DateTime fields are not supported.'
    )
    global String fieldsToUpdateJson;
  }

  global class RecordAccessResponse {
    @InvocableVariable
    global Boolean isSuccess;
    @InvocableVariable
    global String recordId;
    @InvocableVariable
    global String objectType;
    @InvocableVariable
    global String recordJson;
    @InvocableVariable
    global String field1Label;
    @InvocableVariable
    global String field1Value;
    @InvocableVariable
    global String field2Label;
    @InvocableVariable
    global String field2Value;
    @InvocableVariable
    global String field3Label;
    @InvocableVariable
    global String field3Value;
    @InvocableVariable
    global String field4Label;
    @InvocableVariable
    global String field4Value;
    @InvocableVariable
    global String field5Label;
    @InvocableVariable
    global String field5Value;
    @InvocableVariable
    global String field6Label;
    @InvocableVariable
    global String field6Value;
    @InvocableVariable
    global String field7Label;
    @InvocableVariable
    global String field7Value;
    @InvocableVariable
    global String field8Label;
    @InvocableVariable
    global String field8Value;
    @InvocableVariable
    global String message;
  }

  private class FieldEntry {
    String label;
    String value;
  }

  @InvocableMethod(
    label='Get Or Update Record'
    description='Reads or edits any Salesforce record by Id -- no need to know the object type in advance. Omit fieldsToUpdateJson for a read; pass it (a JSON object of field API name -> new value) to update the record first, then return the post-update state. Respects the calling user\'s own CRUD/FLS/sharing on both paths. Date/DateTime fields are not supported for update in this version.'
  )
  global static List<RecordAccessResponse> getOrUpdateRecord(
    List<RecordAccessRequest> requests
  ) {
    List<RecordAccessResponse> results = new List<RecordAccessResponse>();

    for (RecordAccessRequest req : requests) {
      RecordAccessResponse res = new RecordAccessResponse();
      res.recordId = req.recordId;

      try {
        Id recId = Id.valueOf(req.recordId);
        Schema.SObjectType targetType = recId.getSObjectType();
        String safeType = targetType.getDescribe().getName();
        res.objectType = safeType;

        if (String.isNotBlank(req.fieldsToUpdateJson)) {
          Map<String, Object> fieldValues = (Map<String, Object>) JSON.deserializeUntyped(
            req.fieldsToUpdateJson
          );
          SObject toUpdate = targetType.newSObject(recId);
          for (String fieldApiName : fieldValues.keySet()) {
            toUpdate.put(fieldApiName, fieldValues.get(fieldApiName));
          }
          update as user toUpdate;
        }

        String query =
          'SELECT FIELDS(STANDARD) FROM ' + safeType + ' WHERE Id = :recId WITH USER_MODE LIMIT 1';
        List<SObject> recs = Database.query(query);

        if (recs.isEmpty()) {
          res.isSuccess = false;
          res.message = 'Record not found or not accessible.';
        } else {
          SObject rec = recs[0];
          res.isSuccess = true;
          res.recordJson = JSON.serialize(rec);
          assignFieldSlots(res, toFieldEntries(rec, targetType));
          res.message = String.isNotBlank(req.fieldsToUpdateJson)
            ? 'Record updated.'
            : 'Record read.';
        }
      } catch (Exception e) {
        res.isSuccess = false;
        res.message = 'Exception occurred: ' + e.getMessage();
      }

      results.add(res);
    }

    return results;
  }

  private static List<FieldEntry> toFieldEntries(SObject rec, Schema.SObjectType targetType) {
    List<FieldEntry> entries = new List<FieldEntry>();
    Map<String, Schema.SObjectField> fieldMap = targetType.getDescribe().fields.getMap();
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
      if (fieldToken != null && fieldToken.getDescribe().getType() == Schema.DisplayType.ADDRESS) {
        continue;
      }
      FieldEntry entry = new FieldEntry();
      entry.label = fieldToken != null ? fieldToken.getDescribe().getLabel() : fieldApiName;
      entry.value = String.valueOf(val);
      entries.add(entry);
    }

    return entries;
  }

  // CLTs have no array/list Lightning type -- confirmed against the official Lightning Types
  // Reference (only scalar/object types exist), so up to the first 8 populated fields are
  // carried through as fixed label/value slot pairs instead of a real list. Records with more
  // than 8 populated (non-Id, non-address) fields show only the first 8; sparser records leave
  // trailing slots blank.
  private static final Integer MAX_FIELD_SLOTS = 8;

  private static void assignFieldSlots(RecordAccessResponse res, List<FieldEntry> entries) {
    List<String> labels = new List<String>{ null, null, null, null, null, null, null, null };
    List<String> values = new List<String>{ null, null, null, null, null, null, null, null };
    for (Integer i = 0; i < entries.size() && i < MAX_FIELD_SLOTS; i++) {
      labels[i] = entries[i].label;
      values[i] = entries[i].value;
    }
    res.field1Label = labels[0];
    res.field1Value = values[0];
    res.field2Label = labels[1];
    res.field2Value = values[1];
    res.field3Label = labels[2];
    res.field3Value = values[2];
    res.field4Label = labels[3];
    res.field4Value = values[3];
    res.field5Label = labels[4];
    res.field5Value = values[4];
    res.field6Label = labels[5];
    res.field6Value = values[5];
    res.field7Label = labels[6];
    res.field7Value = values[6];
    res.field8Label = labels[7];
    res.field8Value = values[7];
  }
}
