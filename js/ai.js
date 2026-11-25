/**
 * ai.js — IBM Granite AI Integration Module
 *
 * This module provides AI-powered explanations for suspicious records.
 *
 * TWO MODES:
 *   - Live mode:  POST to backend /api/explain (which calls IBM watsonx.ai)
 *   - Demo mode:  Local fallback — generates explanations from detection data
 *                 (used when backend is not running or credentials are missing)
 *
 * To switch to live mode:
 *   1. Start the backend: `node backend/server.js`
 *   2. Set IBM credentials in backend/.env
 *   3. The module auto-detects the backend on startup.
 *
 * IMPORTANT: Never expose API keys in this file.
 * All IBM Cloud credentials live in backend/.env (server-side only).
 */

const AI = (() => {

  // Backend URL — change port if needed
  const BACKEND_URL = 'http://localhost:3001';

  // Module state
  let _backendAvailable = false;
  let _checkedBackend   = false;

  /**
   * Check if the backend is reachable.
   * Called once on first use; result is cached.
   */
  async function _checkBackend() {
    if (_checkedBackend) return _backendAvailable;
    _checkedBackend = true;
    try {
      const res = await fetch(`${BACKEND_URL}/api/status`, { signal: AbortSignal.timeout(2000) });
      _backendAvailable = res.ok;
    } catch {
      _backendAvailable = false;
    }
    return _backendAvailable;
  }

  /**
   * Generate a local (demo mode) explanation from detection data.
   * No API call — entirely local logic.
   * @param {object} record - analysed record from DETECTOR.analyse()
   * @returns {string}
   */
  function _demoExplain(record) {
    if (!record._isSuspicious) {
      return `No suspicious patterns were detected for consumer ${record.consumer_id} during ${record.billing_period}.\n\nConsumption of ${record.units_consumed} units and billing of ${record.current_bill} appear consistent with dataset norms and this consumer's history.\n\n[Demo Mode — connect backend for IBM Granite explanations]`;
    }

    const issues = record._issues || [];
    const lines  = [];

    lines.push(`⚠ Suspicious Pattern Detected — ${record.consumer_id} (${record.billing_period})\n`);
    lines.push(`Overall Severity: ${record._severity}\n`);
    lines.push(`The following ${issues.length} issue(s) were identified:\n`);

    issues.forEach((issue, i) => {
      lines.push(`${i + 1}. ${issue.category} [${issue.sev} severity]`);
      lines.push(`   ${issue.reason}`);
      lines.push(`   Recommended action: ${issue.suggestion}\n`);
    });

    lines.push(`Summary: This record requires manual verification by a field inspector or billing officer. The patterns identified do not constitute confirmed evidence of fraud — they are anomalies that deviate from expected values and warrant investigation.\n`);
    lines.push(`[Demo Mode — connect IBM Granite backend for AI-generated explanations]`);

    return lines.join('\n');
  }

  /**
   * Request an AI explanation from the IBM Granite backend.
   * @param {object} record
   * @returns {Promise<{text: string, mode: 'live'|'demo'}>}
   */
  async function explainRecord(record) {
    const backendOk = await _checkBackend();

    if (backendOk) {
      try {
        const payload = {
          consumer_id:    record.consumer_id,
          billing_period: record.billing_period,
          units_consumed: record.units_consumed,
          current_bill:   record.current_bill,
          severity:       record._severity,
          categories:     record._categories,
          issues:         (record._issues || []).map(i => ({
            category:   i.category,
            severity:   i.sev,
            reason:     i.reason,
            suggestion: i.suggestion,
          })),
        };

        const res = await fetch(`${BACKEND_URL}/api/explain`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
          signal:  AbortSignal.timeout(15000),
        });

        if (!res.ok) throw new Error(`Backend error: ${res.status}`);
        const data = await res.json();
        return { text: data.explanation, mode: 'live' };
      } catch (err) {
        console.warn('[AI] Backend request failed, falling back to demo mode:', err.message);
        _backendAvailable = false;  // stop retrying
      }
    }

    // Fallback
    return { text: _demoExplain(record), mode: 'demo' };
  }

  /**
   * Generate an overall dataset summary from all analysed records.
   * @param {object[]} records
   * @param {object}   stats     - from DETECTOR.analyse()
   * @returns {Promise<{text: string, mode: 'live'|'demo'}>}
   */
  async function summariseDataset(records, stats) {
    const backendOk = await _checkBackend();

    if (backendOk) {
      try {
        const suspicious = records.filter(r => r._isSuspicious);
        const topIssues  = {};
        suspicious.forEach(r => {
          (r._issues || []).forEach(i => {
            topIssues[i.category] = (topIssues[i.category] || 0) + 1;
          });
        });

        const payload = { stats, topIssues };
        const res = await fetch(`${BACKEND_URL}/api/summarise`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
          signal:  AbortSignal.timeout(15000),
        });

        if (!res.ok) throw new Error(`Backend error: ${res.status}`);
        const data = await res.json();
        return { text: data.summary, mode: 'live' };
      } catch (err) {
        console.warn('[AI] Summary backend request failed:', err.message);
        _backendAvailable = false;
      }
    }

    // Local demo summary
    return { text: _demoSummary(records, stats), mode: 'demo' };
  }

  function _demoSummary(records, stats) {
    const pct = stats.total > 0 ? ((stats.suspicious / stats.total) * 100).toFixed(0) : 0;
    const lines = [
      `📊 BillGuard AI — Dataset Analysis Summary`,
      ``,
      `Total records analysed: ${stats.total}`,
      `Normal records: ${stats.normal} (${100 - Number(pct)}%)`,
      `Suspicious records: ${stats.suspicious} (${pct}%)`,
      `Total billing amount: ₹${stats.totalBill ? stats.totalBill.toLocaleString('en-IN', {maximumFractionDigits: 2}) : '—'}`,
      ``,
      `Severity breakdown:`,
      `  🔴 High: ${stats.highSeverity || 0}`,
      `  🟡 Medium: ${stats.medSeverity || 0}`,
      `  🟢 Low: ${stats.lowSeverity || 0}`,
      ``,
    ];

    if (stats.suspicious > 0) {
      // Top anomaly categories
      const catCount = {};
      records.filter(r => r._isSuspicious).forEach(r => {
        (r._issues || []).forEach(i => {
          catCount[i.category] = (catCount[i.category] || 0) + 1;
        });
      });
      const sorted = Object.entries(catCount).sort((a, b) => b[1] - a[1]);
      lines.push(`Most common anomaly types:`);
      sorted.forEach(([cat, n]) => lines.push(`  • ${cat}: ${n} occurrence(s)`));
      lines.push(``);
      lines.push(`Recommendation: Review all High-severity records immediately. Medium-severity records should be verified within the next billing cycle. Low-severity records should be noted and monitored.`);
    } else {
      lines.push(`No suspicious patterns were detected in this dataset.`);
    }

    lines.push(``, `[Demo Mode — connect IBM Granite backend for AI-generated summaries]`);
    return lines.join('\n');
  }

  /**
   * Update the AI mode badge in the topbar.
   */
  async function updateAIModeBadge() {
    const badge = document.getElementById('aiModeBadge');
    if (!badge) return;
    const ok = await _checkBackend();
    if (ok) {
      badge.textContent = '🟢 IBM Granite Active';
      badge.style.background  = 'var(--success-bg)';
      badge.style.color       = 'var(--success)';
    }
    badge.style.display = 'inline-flex';
  }

  return { explainRecord, summariseDataset, updateAIModeBadge };
})();
