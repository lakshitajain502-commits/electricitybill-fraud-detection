/**
 * app.js — BillGuard AI Entry Point & Orchestration
 *
 * Responsibilities:
 *  - SPA view routing (5 views)
 *  - Mobile sidebar toggle
 *  - Anomaly view: filter by severity, search, row click → modal
 *  - All-records view: render + row click → modal
 *  - Reset button
 *  - Download/export button
 *  - Modal close (overlay click + X button)
 *  - Bootstrap all modules
 */

const APP = (() => {

  // Currently active severity filter in anomaly view
  let _currentSeverityFilter = 'all';
  let _currentSearchQuery    = '';

  /* ═══════════════════════════════════════════════════════════
     VIEW ROUTING
  ════════════════════════════════════════════════════════════ */

  const VIEW_TITLES = {
    dashboard:   'Dashboard',
    upload:      'Upload Data',
    anomalies:   'Suspicious Records',
    'all-records': 'All Records',
    about:       'How It Works',
  };

  function navigateTo(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const target  = document.getElementById(`view-${viewId}`);
    const navItem = document.querySelector(`[data-view="${viewId}"]`);
    if (target)  target.classList.add('active');
    if (navItem) navItem.classList.add('active');

    const title = document.getElementById('topbarTitle');
    if (title) title.textContent = VIEW_TITLES[viewId] || 'BillGuard AI';
  }

  function _initRouter() {
    document.querySelectorAll('.nav-item[data-view]').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        navigateTo(link.dataset.view);
        // Close mobile sidebar after nav
        if (window.innerWidth <= 768) {
          document.getElementById('sidebar')?.classList.remove('open');
        }
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════
     MOBILE SIDEBAR
  ════════════════════════════════════════════════════════════ */

  function _initSidebarToggle() {
    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.toggle('open');
    });
    // Close sidebar on click outside (mobile)
    document.addEventListener('click', e => {
      const sidebar = document.getElementById('sidebar');
      const toggle  = document.getElementById('sidebarToggle');
      if (window.innerWidth <= 768 && sidebar && sidebar.classList.contains('open')) {
        if (!sidebar.contains(e.target) && e.target !== toggle) {
          sidebar.classList.remove('open');
        }
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════
     ANOMALY VIEW
  ════════════════════════════════════════════════════════════ */

  /**
   * Render the suspicious records view.
   * @param {object[]} records  - full analysed records array
   */
  function refreshAnomalyView(records) {
    const empty   = document.getElementById('anomalyEmpty');
    const wrapper = document.getElementById('anomalyTableWrapper');
    const table   = document.getElementById('anomalyTable');
    const filterBar = document.getElementById('anomalyFilterBar');

    const suspicious = records.filter(r => r._isSuspicious);

    if (suspicious.length === 0) {
      if (empty) {
        empty.textContent = '✓ No suspicious patterns detected in the uploaded data.';
        empty.style.display = 'block';
      }
      if (wrapper) wrapper.style.display = 'none';
      if (filterBar) filterBar.style.display = 'none';
      return;
    }

    if (empty)    empty.style.display   = 'none';
    if (wrapper)  wrapper.style.display = 'block';
    if (filterBar) filterBar.style.display = 'flex';

    _renderAnomalyTable(suspicious, table);
  }

  function _renderAnomalyTable(records, tableEl) {
    if (!tableEl) return;

    // Apply severity filter
    let filtered = records;
    if (_currentSeverityFilter !== 'all') {
      filtered = filtered.filter(r => r._severity === _currentSeverityFilter);
    }
    // Apply search filter
    if (_currentSearchQuery.trim()) {
      const q = _currentSearchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        (r.consumer_id   || '').toLowerCase().includes(q) ||
        (r.consumer_name || '').toLowerCase().includes(q) ||
        (r.billing_period|| '').toLowerCase().includes(q)
      );
    }

    const cols = [
      'consumer_id', 'consumer_name', 'billing_period',
      'units_consumed', 'current_bill', 'meter_status',
      '_severity', '_categories',
    ];

    // Replace _severity with badge HTML inline
    const displayRows = filtered.map(r => ({
      ...r,
      _severity:   severityBadge(r._severity),
      _categories: r._categories || '—',
    }));

    tableEl.innerHTML = buildTableHTML(displayRows, cols);

    // Attach click handlers — open modal with original record
    tableEl.querySelectorAll('tr[data-idx]').forEach(tr => {
      tr.addEventListener('click', () => {
        // data-idx is the index in the filtered array
        const idx = parseInt(tr.dataset.idx, 10);
        if (!isNaN(idx) && filtered[idx]) {
          openDetailModal(filtered[idx]);
        }
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════
     ANOMALY FILTERS
  ════════════════════════════════════════════════════════════ */

  function _initAnomalyFilters() {
    // Severity filter buttons
    document.querySelectorAll('.filter-btn[data-sev]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _currentSeverityFilter = btn.dataset.sev;
        _applyFilters();
      });
    });

    // Search input
    const searchInput = document.getElementById('anomalySearch');
    if (searchInput) {
      searchInput.addEventListener('input', e => {
        _currentSearchQuery = e.target.value;
        _applyFilters();
      });
    }
  }

  function _applyFilters() {
    const data = window.APP_DATA;
    if (!data) return;
    const suspicious = data.records.filter(r => r._isSuspicious);
    const tableEl = document.getElementById('anomalyTable');
    _renderAnomalyTable(suspicious, tableEl);
  }

  /* ═══════════════════════════════════════════════════════════
     ALL RECORDS VIEW
  ════════════════════════════════════════════════════════════ */

  function refreshAllRecordsView(records) {
    const empty   = document.getElementById('allRecordsEmpty');
    const wrapper = document.getElementById('allRecordsWrapper');
    const table   = document.getElementById('allRecordsTable');

    if (!records || records.length === 0) {
      if (empty)   empty.style.display   = 'block';
      if (wrapper) wrapper.style.display = 'none';
      return;
    }

    if (empty)   empty.style.display   = 'none';
    if (wrapper) wrapper.style.display = 'block';

    const cols = [
      'consumer_id', 'consumer_name', 'billing_period',
      'units_consumed', 'current_bill', 'meter_status', '_severity',
    ];

    const displayRows = records.map(r => ({
      ...r,
      _severity: severityBadge(r._severity),
    }));

    table.innerHTML = buildTableHTML(displayRows, cols);

    // Click to open modal
    table.querySelectorAll('tr[data-idx]').forEach(tr => {
      tr.addEventListener('click', () => {
        const idx = parseInt(tr.dataset.idx, 10);
        if (!isNaN(idx) && records[idx]) openDetailModal(records[idx]);
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════
     MODAL
  ════════════════════════════════════════════════════════════ */

  function _initModal() {
    // X close button
    document.getElementById('modalClose')?.addEventListener('click', closeModal);
    // Click outside modal
    document.getElementById('modalOverlay')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeModal();
    });
    // Escape key
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
    });
  }

  /* ═══════════════════════════════════════════════════════════
     RESET
  ════════════════════════════════════════════════════════════ */

  function _initReset() {
    document.getElementById('btnReset')?.addEventListener('click', () => {
      if (!confirm('Reset the dashboard and clear loaded data?')) return;
      window.APP_DATA = null;

      // Reset all modules
      UPLOAD.reset();
      DASHBOARD.reset();

      // Reset anomaly view
      const anomalyEmpty   = document.getElementById('anomalyEmpty');
      const anomalyWrapper = document.getElementById('anomalyTableWrapper');
      const filterBar      = document.getElementById('anomalyFilterBar');
      if (anomalyEmpty)   { anomalyEmpty.textContent = 'No data loaded yet. Upload a CSV file to run anomaly detection.'; anomalyEmpty.style.display = 'block'; }
      if (anomalyWrapper) anomalyWrapper.style.display = 'none';
      if (filterBar)      filterBar.style.display = 'none';

      // Reset all-records view
      const allEmpty   = document.getElementById('allRecordsEmpty');
      const allWrapper = document.getElementById('allRecordsWrapper');
      if (allEmpty)   { allEmpty.style.display = 'block'; }
      if (allWrapper) allWrapper.style.display = 'none';

      // Reset topbar buttons and badges
      document.getElementById('btnReset')?.style && (document.getElementById('btnReset').style.display = 'none');
      document.getElementById('btnDownload')?.style && (document.getElementById('btnDownload').style.display = 'none');
      setAnomalyBadge(0);
      setStatus('No data loaded', false);

      // Reset filters
      _currentSeverityFilter = 'all';
      _currentSearchQuery    = '';
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.filter-btn[data-sev="all"]')?.classList.add('active');

      navigateTo('upload');
      showToast('Dashboard reset. Upload a new file to begin.', 'success');
    });
  }

  /* ═══════════════════════════════════════════════════════════
     DOWNLOAD / EXPORT
  ════════════════════════════════════════════════════════════ */

  function _initDownload() {
    document.getElementById('btnDownload')?.addEventListener('click', () => {
      const data = window.APP_DATA;
      if (!data || !data.records || data.records.length === 0) {
        showToast('No data to export.', 'warn');
        return;
      }
      const csv = recordsToCSV(data.records);
      const ts  = new Date().toISOString().slice(0, 10);
      downloadCSV(csv, `billguard_report_${ts}.csv`);
      showToast(`Exported ${data.records.length} records as CSV.`, 'success');
    });
  }

  /* ═══════════════════════════════════════════════════════════
     BOOTSTRAP
  ════════════════════════════════════════════════════════════ */

  function init() {
    _initRouter();
    _initSidebarToggle();
    _initModal();
    _initAnomalyFilters();
    _initReset();
    _initDownload();
    UPLOAD.init();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { navigateTo, refreshAnomalyView, refreshAllRecordsView };
})();
