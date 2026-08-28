// Minimal, deliberately generic demonstration of the workspace config shape -- two objects,
// one lookup between them, one status field, one rollup, one bulk-editable field, one Salesforce
// deep link. Swap this whole assignment for real (or MCP-sourced) schema + data; nothing in
// assets/engine/record-workspace.js is specific to the object names or fields used here.
window.__RECORD_WORKSPACE_CONFIG__ = {
  homeObject: 'SampleRecord',
  objects: {
    SampleRecord: {
      objectLabel: 'Sample Records',
      workspaceLabel: 'Sample Workspace',
      idField: 'id',
      primaryField: 'title',
      recordLinkField: 'sfLink',
      statusField: {
        key: 'status', label: 'Status',
        buckets: { 'Complete': 'good', 'Blocked': 'critical' },
        defaultBucket: 'neutral'
      },
      fieldSchema: [
        { key: 'title', label: 'Title', type: 'text', section: 'info', wide: true },
        { key: 'relatedId', label: 'Related Record', type: 'lookup', refObject: 'RelatedRecord', section: 'info' },
        { key: 'status', label: 'Status', type: 'picklist', options: ['Not Started', 'In Progress', 'Blocked', 'Complete'], section: 'info', bulkEditable: true },
        { key: 'value', label: 'Value', type: 'currency', section: 'info' },
        { key: 'dueDate', label: 'Due Date', type: 'date', section: 'info', bulkEditable: true },
        { key: 'completion', label: 'Completion', type: 'percent', section: 'info' },
        { key: 'owner', label: 'Owner', type: 'text', section: 'info' },
        { key: 'notes', label: 'Notes', type: 'textarea', section: 'additional', wide: true }
      ],
      tableColumns: ['title', 'relatedId', 'status', 'value', 'dueDate', 'owner'],
      summaryRollups: [
        { field: 'value', agg: 'sum', label: 'Total Value' },
        { field: 'completion', agg: 'avg', label: 'Avg. Completion' }
      ],
      records: [
        { id: 'sr-1', title: 'Sample Record One', relatedId: 'rr-1', status: 'In Progress', value: 12000, dueDate: '2026-09-01T00:00:00Z', completion: 40, owner: 'Jordan Lee', notes: 'Waiting on the related record’s review.', sfLink: 'https://example.my.salesforce.com/sr-1' },
        { id: 'sr-2', title: 'Sample Record Two', relatedId: 'rr-2', status: 'Complete', value: 8000, dueDate: '2026-08-10T00:00:00Z', completion: 100, owner: 'Priya Shah', notes: 'Closed out ahead of schedule.', sfLink: 'https://example.my.salesforce.com/sr-2' },
        { id: 'sr-3', title: 'Sample Record Three', relatedId: 'rr-1', status: 'Blocked', value: 21000, dueDate: '2026-09-20T00:00:00Z', completion: 15, owner: 'Jordan Lee', notes: 'Blocked on budget sign-off.', sfLink: 'https://example.my.salesforce.com/sr-3' },
        { id: 'sr-4', title: 'Sample Record Four', relatedId: 'rr-2', status: 'Not Started', value: 5000, dueDate: '2026-10-05T00:00:00Z', completion: 0, owner: 'Priya Shah', notes: '', sfLink: 'https://example.my.salesforce.com/sr-4' }
      ]
    },
    RelatedRecord: {
      objectLabel: 'Related Records',
      idField: 'id',
      primaryField: 'name',
      recordLinkField: 'sfLink',
      fieldSchema: [
        { key: 'name', label: 'Name', type: 'text', section: 'info', wide: true },
        { key: 'region', label: 'Region', type: 'text', section: 'info' },
        { key: 'tier', label: 'Tier', type: 'picklist', options: ['Standard', 'Priority'], section: 'info' }
      ],
      records: [
        { id: 'rr-1', name: 'Related A', region: 'West', tier: 'Priority', sfLink: 'https://example.my.salesforce.com/rr-1' },
        { id: 'rr-2', name: 'Related B', region: 'East', tier: 'Standard', sfLink: 'https://example.my.salesforce.com/rr-2' }
      ]
    }
  }
};
