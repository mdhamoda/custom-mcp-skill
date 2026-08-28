(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useMemo = React.useMemo;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  // ---------------- Config ----------------
  // The assembler injects `window.__RECORD_WORKSPACE_CONFIG__` before this script runs. Shape:
  //
  // {
  //   homeObject: 'Opportunity',           // which object's list view is the entry point
  //   objects: {
  //     Opportunity: {
  //       objectLabel: 'Opportunities',
  //       workspaceLabel: 'Pipeline Desk', // optional, defaults to objectLabel; top-left brand text
  //       idField: 'id',                   // optional, defaults to 'id'
  //       primaryField: 'name',            // record-title field key
  //       recordLinkField: 'sfLink',       // optional; key holding a Salesforce record URL per row --
  //                                        // renders an "Open in Salesforce" affordance (external,
  //                                        // always alongside in-workspace navigation, never instead of it)
  //       statusField: {                   // optional; drives the Pill + status-mix bar
  //         key: 'stage', label: 'Stage',
  //         buckets: { 'Closed Won': 'good', 'Closed Lost': 'critical' },
  //         defaultBucket: 'neutral'
  //       },
  //       fieldSchema: [
  //         { key, label, type, section: 'info'|'additional', wide, options, bulkEditable, refObject }
  //         // type: 'text' | 'currency' | 'date' | 'percent' | 'number' | 'picklist' | 'textarea' | 'lookup'
  //         // 'lookup' fields hold another object's id as their value and `refObject` names which key
  //         // in `objects` that id resolves against -- rendered as an in-workspace navigation link,
  //         // in BOTH the list view and the record view, resolved and pushed via pure React state
  //         // (no page load, no href navigation).
  //       ],
  //       tableColumns: ['name', 'accountId', 'stage', 'amount', ...],
  //       summaryRollups: [                 // optional, up to 3 rendered as stat tiles (list view only)
  //         { field: 'amount', agg: 'sum', bucket: 'open', label: 'Open Pipeline' },
  //         { field: 'probability', agg: 'avg', label: 'Avg. Probability' }
  //       ],
  //       records: [ { id, name, ... } ]
  //     },
  //     Account: {
  //       objectLabel: 'Accounts', idField: 'id', primaryField: 'name', fieldSchema: [...], records: [...],
  //       sfWrite: {                       // optional; enables real writes back to Salesforce for this
  //                                        // object -- ANY editable field writes through by default
  //         sobjectType: 'Account'         // the real Salesforce sObject API name; that's all that's
  //                                        // required. Per-field API name comes from that field's own
  //                                        // `apiName` in fieldSchema (falls back to the field's `key`
  //                                        // if `apiName` is omitted -- so keeping config keys equal to
  //                                        // real Salesforce API names, e.g. 'StageName' not 'stage',
  //                                        // means zero extra config). Opt a field OUT with `noWrite:
  //                                        // true` on it. `lookup`-type fields never write unless they
  //                                        // set `apiName` explicitly (their value is a local synthetic
  //                                        // id, not a real Salesforce id, by default).
  //       },
  //       relatedLists: [                 // optional; 360-style child sections shown at the bottom of
  //                                       // this object's record view (NOT the list view)
  //         { label: 'Opportunities', refObject: 'Opportunity', foreignKey: 'account', columns: ['name','stage','amount','closeDate'] },
  //         { label: 'Contacts', refObject: 'Contact', foreignKey: 'account', columns: ['name','email','title'] }
  //         // foreignKey = the key on the CHILD object (refObject) that stores this parent's id --
  //         // i.e. the child's own 'lookup' field pointing back at this object. Rows are read-only
  //         // navigation links into the child's record view; editing still happens there, not here.
  //       ]
  //     }
  //     // objects reachable only via a lookup (not `homeObject`) don't need tableColumns/summaryRollups --
  //     // they're never shown as a top-level list in this workspace, only as a record view someone
  //     // navigated into (via a lookup link or a relatedLists row).
  //   }
  // }
  //
  // `sfMcpUrl` (top-level, sibling of homeObject/objects) -- the user's connected Salesforce MCP
  // server URL. Required for any object that declares `sfWrite`. Edits on objects without `sfWrite`
  // (or fields absent from that object's fieldMap) stay local-state-only, same as before.
  var WORKSPACE = window.__RECORD_WORKSPACE_CONFIG__ || null;

  // ---------------- Icons ----------------
  function IconSearch(p) {
    var size = (p && p.size) || 15;
    return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
      h('circle', { cx: 11, cy: 11, r: 7 }),
      h('line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 })
    );
  }
  function IconChevronRight(p) {
    var size = (p && p.size) || 16;
    return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
      h('polyline', { points: '9 6 15 12 9 18' })
    );
  }
  function IconArrowLeft(p) {
    var size = (p && p.size) || 16;
    return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
      h('line', { x1: 19, y1: 12, x2: 5, y2: 12 }),
      h('polyline', { points: '12 19 5 12 12 5' })
    );
  }
  function IconCheck(p) {
    var size = (p && p.size) || 12;
    return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' },
      h('polyline', { points: '20 6 9 17 4 12' })
    );
  }
  function IconX(p) {
    var size = (p && p.size) || 14;
    return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
      h('line', { x1: 18, y1: 6, x2: 6, y2: 18 }),
      h('line', { x1: 6, y1: 6, x2: 18, y2: 18 })
    );
  }
  function IconArrowUp(p) {
    var size = (p && p.size) || 11;
    return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
      h('line', { x1: 12, y1: 19, x2: 12, y2: 5 }),
      h('polyline', { points: '5 12 12 5 19 12' })
    );
  }
  function IconArrowDown(p) {
    var size = (p && p.size) || 11;
    return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
      h('line', { x1: 12, y1: 5, x2: 12, y2: 19 }),
      h('polyline', { points: '19 12 12 19 5 12' })
    );
  }
  function IconExternalLink(p) {
    var size = (p && p.size) || 14;
    return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
      h('path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }),
      h('polyline', { points: '15 3 21 3 21 9' }),
      h('line', { x1: 10, y1: 14, x2: 21, y2: 3 })
    );
  }

  // ---------------- Helpers ----------------
  function idFieldOf(objCfg) { return objCfg.idField || 'id'; }

  function statusBucket(objCfg, record) {
    if (!objCfg.statusField) return null;
    var value = record[objCfg.statusField.key];
    var buckets = objCfg.statusField.buckets || {};
    return buckets[value] || objCfg.statusField.defaultBucket || 'neutral';
  }

  function fieldByKey(objCfg, key) {
    var match = objCfg.fieldSchema.filter(function (f) { return f.key === key; });
    return match[0] || null;
  }

  function formatCurrency(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); }
  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso.indexOf('T') === -1 ? iso + 'T00:00:00' : iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function formatByType(field, value) {
    if (value === '' || value === null || value === undefined) return '';
    if (field.type === 'currency') return formatCurrency(value);
    if (field.type === 'percent') return value + '%';
    if (field.type === 'date') return formatDate(value);
    return String(value);
  }

  // Resolves a lookup field's value (a foreign id) against the live in-workspace data for the
  // target object, returning a display label -- or null if the target object/record isn't found
  // (e.g. the config didn't include that object, or the record was filtered out).
  function resolveLookup(workspace, dataByObject, field, record) {
    if (field.type !== 'lookup' || !field.refObject) return null;
    var targetId = record[field.key];
    if (!targetId) return null;
    var targetObjCfg = workspace.objects[field.refObject];
    if (!targetObjCfg) return null;
    var targetRows = dataByObject[field.refObject] || [];
    var targetKey = idFieldOf(targetObjCfg);
    var target = targetRows.filter(function (r) { return r[targetKey] === targetId; })[0];
    if (!target) return null;
    return { objectKey: field.refObject, id: targetId, label: target[targetObjCfg.primaryField] };
  }

  // ---------------- Small components ----------------
  function Pill(props) {
    var objCfg = props.objCfg, record = props.record;
    var bucket = statusBucket(objCfg, record);
    var label = objCfg.statusField ? record[objCfg.statusField.key] : null;
    if (!objCfg.statusField || label === undefined || label === null || label === '') return null;
    var cls = 'pill ' + (bucket === 'good' ? 'pill--won' : bucket === 'critical' ? 'pill--lost' : 'pill--open');
    return h('span', { className: cls }, h('span', { className: 'pill-dot' }), label);
  }

  function SalesforceLink(props) {
    var objCfg = props.objCfg, record = props.record, className = props.className;
    if (!objCfg.recordLinkField) return null;
    var url = record[objCfg.recordLinkField];
    if (!url) return null;
    return h('a', {
      href: url, target: '_blank', rel: 'noopener noreferrer',
      className: className, onClick: props.onClick,
      title: 'Open in Salesforce', 'aria-label': 'Open in Salesforce'
    }, props.children);
  }

  // A lookup value rendered as an in-workspace navigation link -- pure React state change via
  // onNavigate, never an <a href>/page load/redirect.
  function LookupLink(props) {
    var resolved = props.resolved;
    if (!resolved) return h('span', { className: 'field-row__value is-empty' }, props.emptyText || 'Empty');
    return h('button', {
      type: 'button',
      className: props.className || 'lookup-link',
      onClick: function (e) { if (props.stopPropagation) e.stopPropagation(); props.onNavigate(resolved.objectKey, resolved.id); }
    }, resolved.label);
  }

  function Checkbox(props) {
    var checked = props.checked;
    function onKeyDown(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); props.onClick(); }
    }
    return h('span', {
      className: 'checkbox' + (checked ? ' checked' : ''),
      role: 'checkbox', 'aria-checked': checked, tabIndex: 0, 'aria-label': props.ariaLabel,
      onClick: function (e) { e.stopPropagation(); props.onClick(); },
      onKeyDown: onKeyDown
    }, checked ? h(IconCheck, { size: 10 }) : null);
  }

  function TopBar(props) {
    var workspace = props.workspace, homeCfg = workspace.objects[workspace.homeObject];
    var brand = homeCfg.workspaceLabel || homeCfg.objectLabel;
    var mark = (brand || '?').trim().charAt(0).toUpperCase() || '?';
    var atHome = props.current.type === 'list';

    return h('div', { className: 'topbar' },
      h('button', {
        type: 'button', className: 'icon-btn', 'aria-label': 'Back', title: 'Back',
        disabled: !props.canGoBack, onClick: props.onBack,
        style: { visibility: props.canGoBack ? 'visible' : 'hidden' }
      }, h(IconArrowLeft, { size: 16 })),
      h('div', { className: 'topbar__brand' },
        h('div', { className: 'topbar__mark' }, mark),
        h('span', null, brand)
      ),
      h('div', { className: 'topbar__crumbs' },
        atHome
          ? h('b', null, homeCfg.objectLabel)
          : h(React.Fragment, null,
              h('a', {
                href: '#', style: { color: 'inherit', textDecoration: 'none' },
                onClick: function (e) { e.preventDefault(); props.onHome(); }
              }, homeCfg.objectLabel),
              h(IconChevronRight, { size: 14 }),
              props.currentObjCfg.objectLabel !== homeCfg.objectLabel
                ? h(React.Fragment, null, h('span', null, props.currentObjCfg.objectLabel), h(IconChevronRight, { size: 14 }))
                : null,
              h('span', { className: 'crumb-current' }, props.recordName)
            )
      ),
      h('div', { className: 'topbar__spacer' }),
      atHome
        ? h('div', { className: 'topbar__search' },
            h(IconSearch, { size: 15 }),
            h('input', {
              placeholder: 'Search ' + (homeCfg.objectLabel || 'records').toLowerCase(),
              value: props.search,
              onChange: function (e) { props.onSearchChange(e.target.value); },
              'aria-label': 'Search ' + (homeCfg.objectLabel || 'records')
            })
          )
        : null
    );
  }

  function computeRollup(objCfg, rows, rollup) {
    var field = fieldByKey(objCfg, rollup.field);
    var filtered = rollup.bucket
      ? rows.filter(function (r) { return statusBucket(objCfg, r) === rollup.bucket; })
      : rows;
    var nums = filtered.map(function (r) { return Number(r[rollup.field]) || 0; });
    var value;
    if (rollup.agg === 'avg') {
      value = nums.length ? Math.round(nums.reduce(function (a, b) { return a + b; }, 0) / nums.length) : 0;
    } else if (rollup.agg === 'count') {
      value = filtered.length;
    } else {
      value = nums.reduce(function (a, b) { return a + b; }, 0);
    }
    var display = field ? formatByType(field, value) : String(value);
    var meta = rollup.bucket
      ? filtered.length + ' record' + (filtered.length === 1 ? '' : 's')
      : 'across ' + rows.length + ' record' + (rows.length === 1 ? '' : 's');
    return { label: rollup.label || (field ? field.label : rollup.field), value: display, meta: meta };
  }

  function SummaryStrip(props) {
    var objCfg = props.objCfg, rows = props.rows;
    var total = rows.length;

    var statusValues = objCfg.statusField
      ? Array.from(new Set(rows.map(function (r) { return r[objCfg.statusField.key]; }).filter(function (v) { return v; })))
      : [];
    var breakdown = statusValues.map(function (val) {
      var count = rows.filter(function (r) { return r[objCfg.statusField.key] === val; }).length;
      var bucket = (objCfg.statusField.buckets || {})[val] || objCfg.statusField.defaultBucket || 'neutral';
      var color = bucket === 'good' ? 'var(--good)' : bucket === 'critical' ? 'var(--critical)' : bucket === 'warning' ? 'var(--warning)' : 'var(--accent)';
      return { val: val, count: count, color: color };
    });

    var rollupTiles = (objCfg.summaryRollups || []).slice(0, 3).map(function (r) { return computeRollup(objCfg, rows, r); });

    return h('div', { className: 'summary-strip' },
      h('div', { className: 'stat-tile' },
        h('div', { className: 'stat-tile__label' }, 'Records In View'),
        h('div', { className: 'stat-tile__value' }, String(total)),
        h('div', { className: 'stat-tile__meta' }, objCfg.statusField
          ? statusValues.length + ' distinct ' + (objCfg.statusField.label || objCfg.statusField.key) + ' value' + (statusValues.length === 1 ? '' : 's')
          : (objCfg.objectLabel || 'records')),
        breakdown.length
          ? h('div', { className: 'stage-breakdown' }, breakdown.map(function (s) {
              return h('div', { key: s.val, className: 'stage-seg', title: s.val + ': ' + s.count,
                style: { width: (total ? (s.count / total * 100) : 0) + '%', background: s.color } });
            }))
          : null
      ),
      rollupTiles.map(function (tile, i) {
        return h('div', { key: 'rollup-' + i, className: 'stat-tile' },
          h('div', { className: 'stat-tile__label' }, tile.label),
          h('div', { className: 'stat-tile__value' }, tile.value),
          h('div', { className: 'stat-tile__meta' }, tile.meta)
        );
      })
    );
  }

  function DataTable(props) {
    var workspace = props.workspace, objCfg = props.objCfg, dataByObject = props.dataByObject;
    var rows = props.rows, selected = props.selected, sort = props.sort;
    var allChecked = rows.length > 0 && selected.size === rows.length;
    var columns = (objCfg.tableColumns || []).map(function (key) { return fieldByKey(objCfg, key); }).filter(Boolean);

    if (rows.length === 0) {
      return h('div', { className: 'table-wrap' }, h('div', { className: 'empty-state' }, 'No ' + (objCfg.objectLabel || 'records').toLowerCase() + ' match your search.'));
    }

    var headCells = [h('th', { key: '_check', className: 'td-check' }, h(Checkbox, { checked: allChecked, onClick: props.onToggleAll, ariaLabel: 'Select all' }))]
      .concat(columns.map(function (field) {
        var isNum = field.type === 'currency' || field.type === 'percent' || field.type === 'number';
        var isSorted = sort.key === field.key;
        return h('th', {
          key: field.key,
          className: (isNum ? 'th-num ' : '') + (isSorted ? 'sorted' : ''),
          tabIndex: 0,
          onClick: function () { props.onSort(field.key); },
          onKeyDown: function (e) { if (e.key === 'Enter') props.onSort(field.key); }
        },
          field.label,
          h('span', { className: 'sort-caret' }, isSorted ? (sort.dir === 'asc' ? h(IconArrowUp, { size: 10 }) : h(IconArrowDown, { size: 10 })) : '')
        );
      }))
      .concat(objCfg.recordLinkField ? [h('th', { key: '_link', className: 'td-chevron' })] : [])
      .concat([h('th', { key: '_chev', className: 'td-chevron' })]);

    return h('div', { className: 'table-wrap' },
      h('table', { className: 'data-table' },
        h('thead', null, h('tr', null, headCells)),
        h('tbody', null, rows.map(function (r) {
          var isSelected = selected.has(r[idFieldOf(objCfg)]);
          var cells = [h('td', { key: '_check', className: 'td-check' }, h(Checkbox, { checked: isSelected, onClick: function () { props.onToggleRow(r[idFieldOf(objCfg)]); }, ariaLabel: 'Select ' + r[objCfg.primaryField] }))]
            .concat(columns.map(function (field) {
              var isNum = field.type === 'currency' || field.type === 'percent' || field.type === 'number';
              var isPrimary = field.key === objCfg.primaryField;
              var content;
              if (objCfg.statusField && field.key === objCfg.statusField.key) {
                content = h(Pill, { objCfg: objCfg, record: r });
              } else if (field.type === 'lookup') {
                content = h(LookupLink, { resolved: resolveLookup(workspace, dataByObject, field, r), onNavigate: props.onNavigate, stopPropagation: true });
              } else {
                content = formatByType(field, r[field.key]);
              }
              return h('td', { key: field.key, className: isNum ? 'cell-num' : '' },
                isPrimary ? h('div', { className: 'cell-primary' }, content) : content);
            }))
            .concat(objCfg.recordLinkField ? [h('td', { key: '_link', className: 'td-chevron' },
                h(SalesforceLink, { objCfg: objCfg, record: r, className: 'icon-btn', onClick: function (e) { e.stopPropagation(); } }, h(IconExternalLink, { size: 13 })))] : [])
            .concat([h('td', { key: '_chev', className: 'td-chevron' }, h(IconChevronRight, { size: 14 }))]);
          return h('tr', {
            key: r[idFieldOf(objCfg)],
            className: isSelected ? 'row-selected' : '',
            tabIndex: 0,
            onClick: function () { props.onOpenRecord(r[idFieldOf(objCfg)]); },
            onKeyDown: function (e) { if (e.key === 'Enter') props.onOpenRecord(r[idFieldOf(objCfg)]); }
          }, cells);
        }))
      )
    );
  }

  function BulkBar(props) {
    var objCfg = props.objCfg;
    var fields = (objCfg.fieldSchema || []).filter(function (f) { return f.bulkEditable; });
    return h('div', { className: 'bulk-bar' },
      h('span', { className: 'bulk-bar__count' }, props.count + ' selected'),
      fields.map(function (f) {
        return h('button', { key: f.key, className: 'btn btn--primary', onClick: function () { props.onEditField(f.key); } }, 'Edit ' + f.label);
      }),
      h('button', { className: 'btn btn--ghost', onClick: props.onClear }, 'Clear')
    );
  }

  function BulkEditModal(props) {
    var field = props.field;
    var stateVal = useState(field.type === 'picklist' && field.options ? field.options[0] : '');
    var value = stateVal[0], setValue = stateVal[1];

    var input;
    if (field.type === 'picklist') {
      input = h('select', { className: 'field-input', value: value, onChange: function (e) { setValue(e.target.value); } },
        (field.options || []).map(function (opt) { return h('option', { key: opt, value: opt }, opt); }));
    } else if (field.type === 'date') {
      input = h('input', { type: 'date', className: 'field-input', value: value, onChange: function (e) { setValue(e.target.value); } });
    } else if (field.type === 'currency' || field.type === 'percent' || field.type === 'number') {
      input = h('input', { type: 'number', className: 'field-input', value: value, onChange: function (e) { setValue(e.target.value); } });
    } else {
      input = h('input', { type: 'text', className: 'field-input', value: value, onChange: function (e) { setValue(e.target.value); } });
    }

    return h('div', { className: 'modal-overlay', onClick: props.onCancel },
      h('div', { className: 'modal', onClick: function (e) { e.stopPropagation(); } },
        h('div', { className: 'modal__header' },
          h('h2', null, 'Edit ' + field.label),
          h('button', { className: 'icon-btn', onClick: props.onCancel, 'aria-label': 'Close' }, h(IconX, { size: 16 }))
        ),
        h('div', { className: 'modal__body' },
          h('p', { style: { margin: 0, color: 'var(--ink-muted)', fontSize: '13px' } },
            'Applies to ' + props.count + ' selected record' + (props.count === 1 ? '' : 's') + '.'),
          h('div', null, h('label', { className: 'field-label' }, 'New ' + field.label), input)
        ),
        h('div', { className: 'modal__footer' },
          h('button', { className: 'btn btn--ghost', onClick: props.onCancel }, 'Cancel'),
          h('button', { className: 'btn btn--primary', disabled: value === '', onClick: function () { if (value !== '') props.onApply(value); } }, 'Apply to ' + props.count)
        )
      )
    );
  }

  function ConfirmModal(props) {
    return h('div', { className: 'modal-overlay', onClick: props.onCancel },
      h('div', { className: 'modal', onClick: function (e) { e.stopPropagation(); } },
        h('div', { className: 'modal__header' },
          h('h2', null, 'Confirm Salesforce write'),
          h('button', { className: 'icon-btn', onClick: props.onCancel, 'aria-label': 'Close' }, h(IconX, { size: 16 }))
        ),
        h('div', { className: 'modal__body' },
          h('p', { style: { margin: 0, fontSize: '13px' } }, props.message)
        ),
        h('div', { className: 'modal__footer' },
          h('button', { className: 'btn btn--ghost', onClick: props.onCancel }, 'Cancel'),
          h('button', { className: 'btn btn--primary', onClick: props.onConfirm }, 'Save to Salesforce')
        )
      )
    );
  }

  function FieldDisplay(props) {
    var workspace = props.workspace, dataByObject = props.dataByObject, objCfg = props.objCfg, field = props.field, value = props.value, record = props.record;
    var isEmpty = value === '' || value === null || value === undefined;
    var isNum = field.type === 'currency' || field.type === 'percent' || field.type === 'number';

    if (field.type === 'lookup') {
      return h(LookupLink, {
        resolved: resolveLookup(workspace, dataByObject, field, record),
        onNavigate: props.onNavigate,
        className: 'lookup-link lookup-link--field'
      });
    }

    var content;
    if (isEmpty) {
      content = 'Empty';
    } else if (objCfg.statusField && field.key === objCfg.statusField.key) {
      content = h(Pill, { objCfg: objCfg, record: record });
    } else {
      content = formatByType(field, value);
    }
    return h('div', {
      className: 'field-row__value' + (isNum ? ' is-num' : '') + (isEmpty ? ' is-empty' : ''),
      tabIndex: 0, role: 'button',
      onClick: props.onClick,
      onKeyDown: function (e) { if (e.key === 'Enter') props.onClick(); }
    }, content);
  }

  function FieldEditor(props) {
    var field = props.field;
    var ref = useRef(null);
    useEffect(function () { if (ref.current) ref.current.focus(); }, []);

    function handleKeyDown(e) {
      if (e.key === 'Enter' && field.type !== 'textarea') { e.preventDefault(); props.onCommit(); }
      if (e.key === 'Escape') { props.onCancel(); }
    }

    var common = {
      ref: ref, className: 'field-input', value: props.draft,
      onChange: function (e) { props.setDraft(e.target.value); },
      onBlur: props.onCommit, onKeyDown: handleKeyDown
    };

    if (field.type === 'picklist') {
      return h('select', common, (field.options || []).map(function (opt) { return h('option', { key: opt, value: opt }, opt); }));
    }
    if (field.type === 'textarea') return h('textarea', common);
    if (field.type === 'date') return h('input', Object.assign({ type: 'date' }, common));
    if (field.type === 'currency' || field.type === 'percent' || field.type === 'number') return h('input', Object.assign({ type: 'number' }, common));
    return h('input', Object.assign({ type: 'text' }, common));
  }

  function FieldSection(props) {
    var objCfg = props.objCfg;
    if (!props.fields.length) return null;
    return h('div', { className: 'field-section' },
      h('h3', { className: 'field-section__title' }, props.title),
      h('div', { className: 'field-grid' },
        props.fields.map(function (field) {
          var isEditing = props.editingKey === field.key;
          return h('div', { key: field.key, className: 'field-row' + (field.wide ? ' field-row--wide' : '') },
            h('div', { className: 'field-row__label' }, field.label),
            isEditing
              ? h(FieldEditor, { field: field, draft: props.draft, setDraft: props.setDraft, onCommit: function () { props.onCommit(field); }, onCancel: props.onCancel })
              : h(FieldDisplay, {
                  workspace: props.workspace, dataByObject: props.dataByObject, objCfg: objCfg, field: field,
                  value: props.record[field.key], record: props.record, onNavigate: props.onNavigate,
                  onClick: function () { props.onStartEdit(field); }
                })
          );
        })
      )
    );
  }

  // Auto-derives related lists for ANY object by scanning every other object's fieldSchema for a
  // `lookup` field whose refObject points back here -- e.g. Opportunity/Contact/Asset/Activity all
  // have a lookup field 'account' -> Account, so Account automatically gets those as related lists
  // with zero config. An object's own explicit `relatedLists` (if set) are prepended and take
  // precedence over an auto-detected entry pointing at the same refObject+foreignKey pair.
  function relatedListsFor(workspace, objectKey) {
    var explicit = workspace.objects[objectKey].relatedLists || [];
    var seen = {};
    explicit.forEach(function (rl) { seen[rl.refObject + '::' + rl.foreignKey] = true; });
    var auto = [];
    Object.keys(workspace.objects).forEach(function (candidateKey) {
      var candidate = workspace.objects[candidateKey];
      (candidate.fieldSchema || []).forEach(function (f) {
        if (f.type === 'lookup' && f.refObject === objectKey) {
          var dedupeKey = candidateKey + '::' + f.key;
          if (seen[dedupeKey]) return;
          seen[dedupeKey] = true;
          auto.push({
            label: candidate.objectLabel || candidateKey,
            refObject: candidateKey,
            foreignKey: f.key,
            columns: candidate.tableColumns
          });
        }
      });
    });
    return explicit.concat(auto);
  }

  function RecordView(props) {
    var workspace = props.workspace, dataByObject = props.dataByObject, objCfg = props.objCfg, record = props.record;
    var editingState = useState(null);
    var editingKey = editingState[0], setEditingKey = editingState[1];
    var draftState = useState('');
    var draft = draftState[0], setDraft = draftState[1];
    var tabState = useState('details');
    var activeTab = tabState[0], setActiveTab = tabState[1];
    // RecordView is NOT remounted when navigating between two different records (React reuses the
    // component instance across renders at the same tree position) -- so without this, a 'Related'
    // tab selection from a previous record can bleed into a new record that has no related lists at
    // all, leaving the view stuck on an empty pane with no visible way back to Details. Reset the
    // tab the instant the record identity changes, and use a ref (not state) to detect that change
    // within the same render so there's no one-frame flash of the stale tab's empty content.
    var recordIdentity = props.objectKey + '::' + (record ? record[idFieldOf(objCfg)] : '');
    var lastIdentityRef = useRef(recordIdentity);
    if (lastIdentityRef.current !== recordIdentity) {
      lastIdentityRef.current = recordIdentity;
      activeTab = 'details';
    }
    useEffect(function () { setActiveTab('details'); }, [recordIdentity]);

    if (!record) return h('div', { className: 'empty-state' }, 'This record is no longer available.');

    function startEdit(field) {
      setEditingKey(field.key);
      setDraft(record[field.key] === null || record[field.key] === undefined ? '' : String(record[field.key]));
    }
    function commit(field) {
      var value = draft;
      if (field.type === 'currency' || field.type === 'percent' || field.type === 'number') value = Number(draft) || 0;
      props.onChange(field.key, value);
      setEditingKey(null);
    }
    function cancelEdit() { setEditingKey(null); }

    var infoFields = objCfg.fieldSchema.filter(function (f) { return (f.section || 'info') === 'info'; });
    var additionalFields = objCfg.fieldSchema.filter(function (f) { return f.section === 'additional'; });
    var rollupFields = (objCfg.summaryRollups || []).slice(0, 3);
    var relatedLists = relatedListsFor(workspace, props.objectKey);
    var relatedCount = relatedLists.reduce(function (sum, rl) {
      var rows = (dataByObject[rl.refObject] || []).filter(function (r) { return r[rl.foreignKey] === record[idFieldOf(objCfg)]; });
      return sum + rows.length;
    }, 0);

    return h('div', null,
      h('div', { className: 'record-header' },
        h('div', { className: 'record-header__top' },
          h('div', null,
            h('h1', { className: 'record-header__title' }, record[objCfg.primaryField]),
            h(SalesforceLink, { objCfg: objCfg, record: record, className: 'btn btn--ghost' },
              h(IconExternalLink, { size: 13 }), ' Open in Salesforce')
          ),
          h(Pill, { objCfg: objCfg, record: record })
        ),
        rollupFields.length
          ? h('div', { className: 'record-stats' }, rollupFields.map(function (r, i) {
              var field = fieldByKey(objCfg, r.field);
              return h('div', { key: 'rs-' + i },
                h('div', { className: 'record-stat__label' }, r.label || (field ? field.label : r.field)),
                h('div', { className: 'record-stat__value' }, field ? formatByType(field, record[r.field]) : String(record[r.field])));
            }))
          : null
      ),
      h('div', { className: 'record-tabs', role: 'tablist' },
        h('button', {
          className: 'record-tab' + (activeTab === 'details' ? ' record-tab--active' : ''),
          role: 'tab', 'aria-selected': activeTab === 'details', onClick: function () { setActiveTab('details'); }
        }, 'Details'),
        relatedLists.length
          ? h('button', {
              className: 'record-tab' + (activeTab === 'related' ? ' record-tab--active' : ''),
              role: 'tab', 'aria-selected': activeTab === 'related', onClick: function () { setActiveTab('related'); }
            }, 'Related', h('span', { className: 'record-tab__count' }, relatedCount))
          : null
      ),
      activeTab === 'details'
        ? h('div', null,
            h(FieldSection, { workspace: workspace, dataByObject: dataByObject, objCfg: objCfg, title: 'Details', fields: infoFields, record: record, editingKey: editingKey, draft: draft, setDraft: setDraft, onStartEdit: startEdit, onCommit: commit, onCancel: cancelEdit, onNavigate: props.onNavigate }),
            h(FieldSection, { workspace: workspace, dataByObject: dataByObject, objCfg: objCfg, title: 'Additional Information', fields: additionalFields, record: record, editingKey: editingKey, draft: draft, setDraft: setDraft, onStartEdit: startEdit, onCommit: commit, onCancel: cancelEdit, onNavigate: props.onNavigate })
          )
        : h('div', null, relatedLists.map(function (rl, i) {
            return h(RelatedListSection, {
              key: 'rl-' + i, workspace: workspace, dataByObject: dataByObject, config: rl,
              parentId: record[idFieldOf(objCfg)], onNavigate: props.onNavigate
            });
          }))
    );
  }

  // Shows child records for a 360-style parent record view -- e.g. an Account's Opportunities,
  // Contacts, Assets, Activities. Config lives on the PARENT object's objCfg:
  //   relatedLists: [
  //     { label: 'Opportunities', refObject: 'Opportunity', foreignKey: 'account', columns: ['name','stage','amount','closeDate'] },
  //     ...
  //   ]
  // `foreignKey` is the field key on the CHILD object (refObject) whose value equals the parent's id
  // (i.e. the child's lookup field pointing back at this parent). Rows are read-only navigation links
  // into that child's own record view -- no editing here, this is a summary, not the source of truth.
  function RelatedListSection(props) {
    var workspace = props.workspace, dataByObject = props.dataByObject, config = props.config, parentId = props.parentId;
    var childObjCfg = workspace.objects[config.refObject];
    if (!childObjCfg) return null;
    var allRows = dataByObject[config.refObject] || [];
    var rows = allRows.filter(function (r) { return r[config.foreignKey] === parentId; });
    var columns = (config.columns || childObjCfg.tableColumns || []).map(function (key) { return fieldByKey(childObjCfg, key); }).filter(Boolean);
    var childIdField = idFieldOf(childObjCfg);

    return h('div', { className: 'field-section related-list' },
      h('div', { className: 'field-section__header' },
        h('h3', { className: 'field-section__title' }, config.label || childObjCfg.objectLabel),
        h('span', { className: 'related-list__count' }, rows.length)
      ),
      rows.length === 0
        ? h('div', { className: 'empty-state empty-state--compact' }, 'No related ' + (childObjCfg.objectLabel || 'records').toLowerCase() + '.')
        : h('div', { className: 'table-wrap' },
            h('table', { className: 'data-table' },
              h('thead', null, h('tr', null, columns.map(function (col) {
                return h('th', { key: col.key }, col.label);
              }))),
              h('tbody', null, rows.map(function (r) {
                return h('tr', {
                  key: r[childIdField], className: 'data-table__row', tabIndex: 0, role: 'button',
                  onClick: function () { props.onNavigate(config.refObject, r[childIdField]); },
                  onKeyDown: function (e) { if (e.key === 'Enter') props.onNavigate(config.refObject, r[childIdField]); }
                }, columns.map(function (col) {
                  return h('td', { key: col.key }, formatByType(col, r[col.key]));
                }));
              }))
            )
          )
    );
  }

  function Toast(props) {
    return h('div', { className: 'toast' }, h(IconCheck, { size: 14 }), props.message);
  }

  function ConfigMissing() {
    return h('div', { className: 'main' }, h('div', { className: 'empty-state' },
      'No workspace configuration was provided. Set window.__RECORD_WORKSPACE_CONFIG__ (with homeObject + objects) before this script runs -- see references/field-schema-guide.md.'));
  }

  // Pushes a single field's new value to the real Salesforce record via the Anthropic API's MCP
  // tool-use bridge (calls the connected server's updateSobjectRecordTool). Generic by default: any
  // editable field on an `sfWrite`-enabled object writes through automatically, using that field's
  // `apiName` (or its own `key` if `apiName` is omitted) as the real Salesforce field API name.
  // Two ways to opt a field OUT of writing: set `noWrite: true` on it, or type 'lookup' (a local
  // synthetic id, never safe to push as-is unless the field explicitly sets `apiName` itself).
  // Returns { ok, skipped, error }.
  function syncFieldToSalesforce(workspace, objCfg, recordId, fieldKey, value) {
    if (!objCfg.sfWrite || !workspace.sfMcpUrl) return Promise.resolve({ ok: true, skipped: true });
    var field = fieldByKey(objCfg, fieldKey);
    if (field && field.noWrite) return Promise.resolve({ ok: true, skipped: true });
    if (field && field.type === 'lookup' && !field.apiName) return Promise.resolve({ ok: true, skipped: true });
    var legacyMap = objCfg.sfWrite.fieldMap || {};
    var apiField = legacyMap[fieldKey] || (field && field.apiName) || fieldKey;
    var body = {}; body[apiField] = value;
    var prompt = 'Call the updateSobjectRecordTool tool with sobject-name="' + objCfg.sfWrite.sobjectType +
      '", id="' + recordId + '", body=' + JSON.stringify(body) +
      '. Then reply with exactly the text OK if the tool result shows success true, otherwise reply with exactly FAIL: <the real error message from the tool result>. No other text.';

    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
        mcp_servers: [{ type: 'url', url: workspace.sfMcpUrl, name: 'salesforce' }]
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var text = (data.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join(' ').trim();
        if (text.indexOf('OK') === 0) return { ok: true };
        return { ok: false, error: text || 'Unknown error' };
      })
      .catch(function (err) { return { ok: false, error: String(err && err.message || err) }; });
  }

  // ---------------- App ----------------
  function App(props) {
    var workspace = props.workspace;
    var objectKeys = Object.keys(workspace.objects);

    var dataState = useState(function () {
      var init = {};
      objectKeys.forEach(function (k) { init[k] = workspace.objects[k].records || []; });
      return init;
    });
    var dataByObject = dataState[0], setDataByObject = dataState[1];

    var navState = useState([{ type: 'list', object: workspace.homeObject }]);
    var navStack = navState[0], setNavStack = navState[1];
    var current = navStack[navStack.length - 1];
    var currentObjCfg = workspace.objects[current.object];

    var selState = useState(function () { return new Set(); }); var selected = selState[0], setSelected = selState[1];
    var searchState = useState(''); var search = searchState[0], setSearch = searchState[1];
    var homeCfg = workspace.objects[workspace.homeObject];
    var sortState = useState({ key: homeCfg.primaryField, dir: 'asc' }); var sort = sortState[0], setSort = sortState[1];
    var bulkState = useState(null); var bulkFieldKey = bulkState[0], setBulkFieldKey = bulkState[1];
    var toastState = useState(null); var toast = toastState[0], setToast = toastState[1];
    var toastTimer = useRef(null);
    var confirmState = useState(null); var confirmModal = confirmState[0], setConfirmModal = confirmState[1];

    // Native window.confirm()/alert() are unreliable inside a sandboxed artifact iframe (often
    // silently blocked, reading as an instant "cancel") -- this renders a real in-app modal instead
    // and resolves a promise with the user's actual choice.
    function confirmAction(message) {
      return new Promise(function (resolve) {
        setConfirmModal({ message: message, resolve: resolve });
      });
    }
    function resolveConfirm(value) {
      if (confirmModal) confirmModal.resolve(value);
      setConfirmModal(null);
    }

    function showToast(msg) {
      setToast(msg);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(function () { setToast(null); }, 2600);
    }

    // Pure client-side navigation: pushes/pops the nav stack, no href/page load/redirect ever.
    function navigateToRecord(objectKey, id) { setNavStack(function (prev) { return prev.concat([{ type: 'record', object: objectKey, id: id }]); }); }
    function goBack() { setNavStack(function (prev) { return prev.length > 1 ? prev.slice(0, -1) : prev; }); }
    function goHome() { setNavStack([{ type: 'list', object: workspace.homeObject }]); }

    var homeRows = dataByObject[workspace.homeObject];
    var searchableKeys = homeCfg.fieldSchema.filter(function (f) { return f.type === 'text'; }).map(function (f) { return f.key; });

    var filteredRows = useMemo(function () {
      var r = homeRows;
      var q = search.trim().toLowerCase();
      if (q) {
        r = r.filter(function (o) {
          return searchableKeys.some(function (k) { return String(o[k] || '').toLowerCase().indexOf(q) !== -1; });
        });
      }
      var sorted = r.slice().sort(function (a, b) {
        var av = a[sort.key], bv = b[sort.key];
        if (typeof av === 'string') { av = av.toLowerCase(); bv = (bv || '').toLowerCase(); }
        if (av < bv) return sort.dir === 'asc' ? -1 : 1;
        if (av > bv) return sort.dir === 'asc' ? 1 : -1;
        return 0;
      });
      return sorted;
    }, [homeRows, search, sort]);

    function toggleRow(id) {
      setSelected(function (prev) {
        var next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    }
    function toggleAll() {
      setSelected(function (prev) {
        if (prev.size === filteredRows.length && filteredRows.length > 0) return new Set();
        return new Set(filteredRows.map(function (r) { return r[idFieldOf(homeCfg)]; }));
      });
    }
    function openHomeRecord(id) { navigateToRecord(workspace.homeObject, id); }

    function applyFieldChange(objectKey, id, key, value) {
      var objCfg = workspace.objects[objectKey];
      var field = fieldByKey(objCfg, key);
      var willWrite = !!(objCfg.sfWrite && workspace.sfMcpUrl && !(field && field.noWrite) && !(field && field.type === 'lookup' && !field.apiName));

      function commitLocal() {
        setDataByObject(function (prev) {
          var next = Object.assign({}, prev);
          var idKey = idFieldOf(objCfg);
          next[objectKey] = prev[objectKey].map(function (r) {
            if (r[idKey] !== id) return r;
            var updated = Object.assign({}, r);
            updated[key] = value;
            return updated;
          });
          return next;
        });
      }

      if (!willWrite) { commitLocal(); showToast('Saved (local only)'); return; }

      confirmAction('Save ' + (field ? field.label : key) + ' = "' + value + '" to Salesforce? This writes directly to the live record.').then(function (ok) {
        if (!ok) { showToast('Change discarded'); return; }
        commitLocal();
        showToast('Saving to Salesforce\u2026');
        syncFieldToSalesforce(workspace, objCfg, id, key, value).then(function (res) {
          showToast(res.ok ? 'Saved to Salesforce' : 'Salesforce save failed: ' + res.error);
        });
      });
    }

    function applyBulkEdit(fieldKey, value) {
      var idKey = idFieldOf(homeCfg);
      var field = fieldByKey(homeCfg, fieldKey);
      var willWrite = !!(homeCfg.sfWrite && workspace.sfMcpUrl && !(field && field.noWrite) && !(field && field.type === 'lookup' && !field.apiName));
      var ids = homeRows.filter(function (r) { return selected.has(r[idKey]); }).map(function (r) { return r[idKey]; });

      function commitLocal() {
        setDataByObject(function (prev) {
          var next = Object.assign({}, prev);
          next[workspace.homeObject] = prev[workspace.homeObject].map(function (r) {
            if (!selected.has(r[idKey])) return r;
            var updated = Object.assign({}, r);
            updated[fieldKey] = value;
            return updated;
          });
          return next;
        });
        setSelected(new Set());
        setBulkFieldKey(null);
      }

      if (!willWrite) {
        commitLocal();
        showToast('Updated ' + ids.length + ' record' + (ids.length === 1 ? '' : 's') + ' (local only)');
        return;
      }

      confirmAction('Save ' + (field ? field.label : fieldKey) + ' = "' + value + '" to Salesforce for ' + ids.length + ' record' + (ids.length === 1 ? '' : 's') + '? This writes directly to the live records.').then(function (ok) {
        if (!ok) { setBulkFieldKey(null); return; }
        commitLocal();
        showToast('Saving ' + ids.length + ' record' + (ids.length === 1 ? '' : 's') + ' to Salesforce\u2026');
        Promise.all(ids.map(function (id) { return syncFieldToSalesforce(workspace, homeCfg, id, fieldKey, value); })).then(function (results) {
          var failed = results.filter(function (r) { return !r.ok; });
          showToast(failed.length === 0
            ? 'Saved ' + ids.length + ' record' + (ids.length === 1 ? '' : 's') + ' to Salesforce'
            : failed.length + ' of ' + ids.length + ' failed to save: ' + failed[0].error);
        });
      });
    }

    var currentRows = dataByObject[current.object] || [];
    var activeRecord = current.type === 'record' ? (currentRows.filter(function (r) { return r[idFieldOf(currentObjCfg)] === current.id; })[0] || null) : null;
    var bulkField = bulkFieldKey ? fieldByKey(homeCfg, bulkFieldKey) : null;

    return h('div', { className: 'app-shell' },
      h(TopBar, {
        workspace: workspace, current: current, currentObjCfg: currentObjCfg,
        recordName: activeRecord ? activeRecord[currentObjCfg.primaryField] : '',
        search: search, onSearchChange: setSearch,
        canGoBack: navStack.length > 1, onBack: goBack, onHome: goHome
      }),
      h('div', { className: 'main' },
        current.type === 'list'
          ? h(React.Fragment, null,
              h(SummaryStrip, { objCfg: homeCfg, rows: filteredRows }),
              h(DataTable, {
                workspace: workspace, objCfg: homeCfg, dataByObject: dataByObject,
                rows: filteredRows, selected: selected, onToggleRow: toggleRow, onToggleAll: toggleAll,
                onOpenRecord: openHomeRecord, onNavigate: navigateToRecord, sort: sort,
                onSort: function (key) { setSort(function (prev) { return { key: key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }; }); }
              })
            )
          : h(RecordView, {
              workspace: workspace, dataByObject: dataByObject, objCfg: currentObjCfg, record: activeRecord,
              objectKey: current.object,
              onNavigate: navigateToRecord,
              onChange: function (key, value) { applyFieldChange(current.object, current.id, key, value); }
            })
      ),
      (current.type === 'list' && selected.size > 0)
        ? h(BulkBar, { objCfg: homeCfg, count: selected.size, onEditField: setBulkFieldKey, onClear: function () { setSelected(new Set()); } })
        : null,
      bulkField
        ? h(BulkEditModal, { field: bulkField, count: selected.size, onApply: function (value) { applyBulkEdit(bulkFieldKey, value); }, onCancel: function () { setBulkFieldKey(null); } })
        : null,
      confirmModal
        ? h(ConfirmModal, { message: confirmModal.message, onConfirm: function () { resolveConfirm(true); }, onCancel: function () { resolveConfirm(false); } })
        : null,
      toast ? h(Toast, { message: toast }) : null
    );
  }

  if (!WORKSPACE || !WORKSPACE.objects || !WORKSPACE.homeObject || !WORKSPACE.objects[WORKSPACE.homeObject]) {
    ReactDOM.createRoot(document.getElementById('root')).render(h(ConfigMissing));
  } else {
    ReactDOM.createRoot(document.getElementById('root')).render(h(App, { workspace: WORKSPACE }));
  }
})();
