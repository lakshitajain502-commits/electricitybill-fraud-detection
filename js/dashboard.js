/**
 * dashboard.js — BillGuard AI Dashboard Charts & Stats
 *
 * Renders:
 *  - 4 stat cards (total, normal, suspicious, billing)
 *  - Severity row
 *  - Consumption line chart (with anomaly highlighting)
 *  - Billing bar chart (with anomaly highlighting)
 *  - AI summary panel
 */

const DASHBOARD = (() => {

  let consumptionChartInst = null;
  let billingChartInst     = null;

  /**
   * Full dashboard render after analysis completes.
   * @param {object[]} records  - from DETECTOR.analyse()
   * @param {object}   stats    - from DETECTOR.analyse()
   */
  function render(records, stats) {
    _updateStatCards(stats);
    _updateSeverityRow(stats);
    _renderCharts(records);
    _renderAISummary(records, stats);
    _showDashboard();
  }

  /* ── Stat cards ─────────────────────────────────────────── */

  function _updateStatCards(stats) {
    _set('statRecords',   stats.total);
    _set('statNormal',    stats.normal);
    _set('statSuspicious', stats.suspicious);
    _set('statBilling',
      stats.totalBill != null
        ? `₹${stats.totalBill.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
        : '—'
    );
  }

  function _set(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val != null ? val : '—';
  }

  /* ── Severity row ───────────────────────────────────────── */

  function _updateSeverityRow(stats) {
    _set('sevHigh',   stats.highSeverity || 0);
    _set('sevMedium', stats.medSeverity  || 0);
    _set('sevLow',    stats.lowSeverity  || 0);

    const infoEl = document.getElementById('datasetInfo');
    if (infoEl && stats.datasetMean != null) {
      infoEl.textContent = `Dataset avg: ${stats.datasetMean.toFixed(0)} units · Rate: ₹${stats.datasetRate ? stats.datasetRate.toFixed(2) : '—'}/unit`;
    }
  }

  /* ── Charts ─────────────────────────────────────────────── */

  function _renderCharts(records) {
    // Destroy previous instances
    if (consumptionChartInst) { consumptionChartInst.destroy(); consumptionChartInst = null; }
    if (billingChartInst)     { billingChartInst.destroy();     billingChartInst = null; }

    if (!records || records.length === 0) return;

    const labels   = records.map((r, i) => r.billing_period || `#${i + 1}`);
    const units    = records.map(r => r._units  || 0);
    const bills    = records.map(r => r._bill   || 0);

    // Colors: red for suspicious, green for normal
    const pointColorsUnits = records.map(r =>
      r._isSuspicious
        ? (r._severity === 'High' ? '#dc2626' : '#d97706')
        : '#2563eb'
    );
    const barColorsBills = records.map(r =>
      r._isSuspicious
        ? (r._severity === 'High' ? 'rgba(220,38,38,0.7)' : 'rgba(217,119,6,0.7)')
        : 'rgba(37,99,235,0.6)'
    );

    const pointRadius = records.map(r => r._isSuspicious ? 7 : 4);

    // ── Consumption line chart ──────────────────────────
    const ctx1 = document.getElementById('consumptionChart');
    if (ctx1) {
      consumptionChartInst = new Chart(ctx1.getContext('2d'), {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Units (kWh)',
            data:  units,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37,99,235,0.07)',
            fill: true,
            tension: 0.3,
            pointBackgroundColor: pointColorsUnits,
            pointRadius:          pointRadius,
            pointHoverRadius:     9,
          }]
        },
        options: _chartOptions('kWh', records),
      });
    }

    // ── Billing bar chart ───────────────────────────────
    const ctx2 = document.getElementById('billingChart');
    if (ctx2) {
      billingChartInst = new Chart(ctx2.getContext('2d'), {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Bill (₹)',
            data:  bills,
            backgroundColor: barColorsBills,
            borderColor:     barColorsBills.map(c => c.replace('0.6', '1').replace('0.7', '1')),
            borderWidth: 1,
            borderRadius: 4,
          }]
        },
        options: _chartOptions('₹', records),
      });
    }
  }

  /**
   * Shared Chart.js options with tooltip showing anomaly reason.
   */
  function _chartOptions(unit, records) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const val = ctx.parsed.y != null ? ctx.parsed.y : ctx.parsed;
              return ` ${val.toLocaleString()} ${unit}`;
            },
            afterLabel: ctx => {
              const row = records[ctx.dataIndex];
              if (!row) return '';
              if (row._isSuspicious) return `⚠ ${row._categories}`;
              return '✓ Normal';
            },
            footer: ctx => {
              const row = records[ctx[0]?.dataIndex];
              if (row && row._isSuspicious) return row.consumer_id;
              return '';
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          grid: { color: '#e2e6ea' },
          ticks: { color: '#57606a' },
        },
        x: {
          grid: { display: false },
          ticks: {
            color: '#57606a',
            maxRotation: 45,
            font: { size: 11 },
          },
        },
      },
    };
  }

  /* ── AI Summary panel ───────────────────────────────────── */

  async function _renderAISummary(records, stats) {
    const card    = document.getElementById('aiSummaryCard');
    const content = document.getElementById('aiSummaryContent');
    const badge   = document.getElementById('aiBadgeInline');
    if (!card || !content) return;

    card.style.display = 'block';
    content.textContent = 'Generating AI analysis summary…';

    const result = await AI.summariseDataset(records, stats);
    content.textContent = result.text;
    if (badge) badge.textContent = result.mode === 'live' ? '🟢 IBM Granite' : '🟡 Demo Mode';
  }

  /* ── Show/hide dashboard elements ───────────────────────── */

  function _showDashboard() {
    // Hide hero; show data panels
    const hero   = document.getElementById('heroBanner');
    const grid   = document.getElementById('statsGrid');
    const sevRow = document.getElementById('severityRow');
    const charts = document.getElementById('chartsRow');
    const empty  = document.getElementById('emptyDashboard');

    if (hero)   hero.style.display   = 'none';
    if (grid)   grid.style.display   = 'grid';
    if (sevRow) sevRow.style.display = 'flex';
    if (charts) charts.style.display = 'grid';
    if (empty)  empty.style.display  = 'none';
  }

  /** Reset dashboard to initial state (for Reset button). */
  function reset() {
    if (consumptionChartInst) { consumptionChartInst.destroy(); consumptionChartInst = null; }
    if (billingChartInst)     { billingChartInst.destroy();     billingChartInst = null; }

    ['statRecords','statNormal','statSuspicious','statBilling',
     'sevHigh','sevMedium','sevLow'].forEach(id => _set(id, '—'));

    const show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v; };
    show('heroBanner',   'block');
    show('statsGrid',    'none');
    show('severityRow',  'none');
    show('chartsRow',    'none');
    show('aiSummaryCard','none');
    show('emptyDashboard','block');
  }

  return { render, reset };
})();
