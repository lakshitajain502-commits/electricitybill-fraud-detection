/**
 * ui.js — BillGuard AI Shared UI Utilities
 *
 * Provides:
 *  - showToast()           : bottom-right toast notifications
 *  - setStatus()           : sidebar footer status dot + text
 *  - setAnomalyBadge()     : top-bar badge + sidebar nav badge
 *  - showLoading()         : full-screen loading overlay
 *  - hideLoading()
 *  - buildTableHTML()      : generic HTML table builder
 *  - openDetailModal()     : show record detail modal
 *  - closeModal()
 *  - severityBadge()       : return a severity badge HTML string
 */

/* ── Toast notifications ─────────────────────────────────── */

/**
 * @param {string} message
 * @param {'success'|'error'|'warn'} type
 * @param {number} duration  ms (default 3500)
 */
function showToast(message, type = 'success', duration = 3500) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.remove(); }, duration);
}

/* ── Status dot ──────────────────────────────────────────── */

/**
 * @param {string} text
 * @param {boolean} ready   true = green dot
 */
function setStatus(text, ready = false) {
  const el = document.getElementById('statusText');
  const dot = document.getElementById('statusDot');
  if (el)  el.textContent = text;
  if (dot) dot.classList.toggle('ready', ready);
}

/* ── Badges ──────────────────────────────────────────────── */

/**
 * Update the topbar anomaly badge and sidebar nav badge.
 * @param {number} count
 */
function setAnomalyBadge(count) {
  const topBadge = document.getElementById('anomalyBadge');
  const navBadge = document.getElementById('navBadge');

  if (count > 0) {
    const text = `${count} suspicious`;
    if (topBadge) { topBadge.textContent = text; topBadge.style.display = 'inline-flex'; }
    if (navBadge) { navBadge.textContent = count; navBadge.style.display = 'inline-block'; }
  } else {
    if (topBadge) topBadge.style.display = 'none';
    if (navBadge) navBadge.style.display = 'none';
  }
}

/**
 * Return an HTML severity badge string.
 * @param {'High'|'Medium'|'Low'|null} severity
 */
function severityBadge(severity) {
  if (!severity) return `<span class="badge badge-ok">✓ Normal</span>`;
  const map = {
    High:   ['badge-high',   '🔴 High'],
    Medium: ['badge-medium', '🟡 Medium'],
    Low:    ['badge-low',    '🟢 Low'],
  };
  const [cls, label] = map[severity] || ['badge-ok', severity];
  return `<span class="badge ${cls}">${label}</span>`;
}

/* ── Loading overlay ─────────────────────────────────────── */

function showLoading(text = 'Analysing records…') {
  const overlay = document.getElementById('loadingOverlay');
  const textEl  = document.getElementById('loadingText');
  if (textEl)  textEl.textContent = text;
  if (overlay) overlay.style.display = 'flex';
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.style.display = 'none';
}

/* ── Generic table builder ───────────────────────────────── */

/**
 * Build an HTML table string from an array of row objects.
 * Columns that start with '_' are skipped unless explicitly listed.
 *
 * @param {object[]} rows
 * @param {string[]} columns      - explicit column keys to show (optional)
 * @param {Function} [rowCallback]- optional fn(row, tr) called per <tr> for event binding
 * @returns {string}  Complete <thead><tbody> HTML string
 */
function buildTableHTML(rows, columns, rowCallback) {
  if (!rows || rows.length === 0) {
    return '<tbody><tr><td class="empty-state" style="padding:40px;text-align:center;color:var(--text-muted)">No records found.</td></tr></tbody>';
  }

  // Determine columns: use provided list or auto-detect non-private keys
  const cols = columns || Object.keys(rows[0]).filter(k => !k.startsWith('_'));

  // Human-readable header labels
  const headerLabel = c => c.replace(/^_/, '').replace(/_/g, ' ');

  const header = `<thead><tr>${cols.map(c => `<th>${headerLabel(c)}</th>`).join('')}</tr></thead>`;
  const body = `<tbody>${rows.map((row, idx) => {
    const cls  = row._flagClass  ? ` class="${row._flagClass} row-clickable"` : ' class="row-clickable"';
    const dataAttr = ` data-idx="${idx}"`;
    const cells = cols.map(c => {
      const val = row[c];
      return `<td>${val !== undefined && val !== null ? val : '—'}</td>`;
    }).join('');
    return `<tr${cls}${dataAttr}>${cells}</tr>`;
  }).join('')}</tbody>`;

  return header + body;
}

/* ── Detail Modal ────────────────────────────────────────── */

/**
 * Open the detail modal for a specific record.
 * @param {object} record   - analysed record from DETECTOR.analyse()
 */
function openDetailModal(record) {
  const overlay = document.getElementById('modalOverlay');
  const title   = document.getElementById('modalTitle');
  const body    = document.getElementById('modalBody');
  if (!overlay || !title || !body) return;

  title.textContent = `${record._isSuspicious ? '⚠ Suspicious Pattern' : '✓ Normal Record'} — ${record.consumer_id} · ${record.billing_period}`;

  // Build modal content
  let html = '';

  // ── Consumer details ────────────────────────────────
  html += `
    <div class="modal-section">
      <div class="modal-section-title">Consumer &amp; Billing Details</div>
      <div class="modal-kv-grid">
        <div class="modal-kv"><div class="modal-kv-key">Consumer ID</div><div class="modal-kv-val">${record.consumer_id}</div></div>
        <div class="modal-kv"><div class="modal-kv-key">Name</div><div class="modal-kv-val">${record.consumer_name}</div></div>
        <div class="modal-kv"><div class="modal-kv-key">Billing Period</div><div class="modal-kv-val">${record.billing_period}</div></div>
        <div class="modal-kv"><div class="modal-kv-key">Area</div><div class="modal-kv-val">${record.area}</div></div>
        <div class="modal-kv"><div class="modal-kv-key">Units Consumed</div><div class="modal-kv-val">${record.units_consumed} kWh</div></div>
        <div class="modal-kv"><div class="modal-kv-key">Billed Amount</div><div class="modal-kv-val">${record.current_bill}</div></div>
        <div class="modal-kv"><div class="modal-kv-key">Tariff Rate</div><div class="modal-kv-val">${record.tariff_rate}</div></div>
        <div class="modal-kv"><div class="modal-kv-key">Meter Status</div><div class="modal-kv-val">${record.meter_status}</div></div>
        <div class="modal-kv"><div class="modal-kv-key">Overall Status</div><div class="modal-kv-val">${severityBadge(record._severity)}</div></div>
        <div class="modal-kv"><div class="modal-kv-key">Issues Found</div><div class="modal-kv-val">${record._issueCount}</div></div>
      </div>
    </div>`;

  // ── Detection issues ────────────────────────────────
  if (record._isSuspicious && record._issues && record._issues.length) {
    html += `<div class="modal-section"><div class="modal-section-title">Detected Issues (${record._issues.length})</div>`;
    for (const issue of record._issues) {
      html += `
        <div class="issue-item sev-${issue.sev}">
          <div class="issue-header">
            <span class="issue-category">${issue.category}</span>
            ${severityBadge(issue.sev)}
          </div>
          <div class="issue-reason">${issue.reason}</div>
          <div class="issue-suggestion">${issue.suggestion}</div>
        </div>`;
    }
    html += `</div>`;
  } else {
    html += `<div class="modal-section"><div class="modal-section-title">Detection Result</div><p style="color:var(--success);font-size:13px;">✓ No suspicious patterns detected for this record.</p></div>`;
  }

  // ── AI explanation (populated asynchronously) ───────
  html += `
    <div class="modal-section" id="modalAiSection">
      <div class="modal-section-title">🤖 AI Explanation</div>
      <div class="ai-explanation-label" id="modalAiLabel">Loading…</div>
      <div class="ai-explanation-box" id="modalAiBox">Fetching AI explanation…</div>
    </div>`;

  body.innerHTML = html;
  overlay.style.display = 'flex';

  // Fill AI explanation
  AI.explainRecord(record).then(explanation => {
    const box   = document.getElementById('modalAiBox');
    const label = document.getElementById('modalAiLabel');
    if (box)   box.textContent   = explanation.text;
    if (label) label.textContent = explanation.mode === 'live' ? '🟢 IBM Granite (Live)' : '🟡 Demo Mode (Local)';
  }).catch(() => {
    const box = document.getElementById('modalAiBox');
    if (box) box.textContent = 'AI explanation unavailable.';
  });
}

/** Close the detail modal. */
function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  if (overlay) overlay.style.display = 'none';
}

/* ── CSV Download ────────────────────────────────────────── */

/**
 * Trigger a browser download of a CSV string.
 * @param {string} csvString
 * @param {string} filename
 */
function downloadCSV(csvString, filename = 'billguard_report.csv') {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Convert an array of record objects to a CSV string.
 * Strips private (_-prefixed) keys except severity/categories/reasons.
 * @param {object[]} records
 * @returns {string}
 */
function recordsToCSV(records) {
  if (!records || !records.length) return '';

  const exportCols = [
    'consumer_id', 'consumer_name', 'billing_period',
    'units_consumed', 'current_bill', 'tariff_rate',
    'meter_status', 'area',
    '_isSuspicious', '_severity', '_categories', '_reasons', '_suggestions',
  ];

  const header = exportCols.map(c => c.replace(/^_/, '')).join(',');
  const rows = records.map(r => {
    return exportCols.map(c => {
      let val = r[c];
      if (val === undefined || val === null) val = '';
      // Escape commas and quotes
      val = String(val).replace(/"/g, '""');
      if (val.includes(',') || val.includes('"') || val.includes('\n')) val = `"${val}"`;
      return val;
    }).join(',');
  });

  return [header, ...rows].join('\n');
}
