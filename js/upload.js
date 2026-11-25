/**
 * upload.js — BillGuard AI CSV Upload & Validation
 *
 * Flow:
 *   1. User selects file (browse or drag-drop)
 *   2. File is previewed (first 10 rows shown in table)
 *   3. User clicks "Analyze Records" button
 *   4. DETECTOR.analyse() runs → results passed to APP
 *
 * Validates:
 *   - File must be .csv
 *   - File must not be empty
 *   - Required columns must be present
 *   - Row count must be > 0 after parsing
 */

const UPLOAD = (() => {

  let _pendingRawRows = null;   // raw PapaParse rows waiting for analysis
  let _pendingFilename = '';

  /* ── Initialise event listeners ─────────────────────────── */

  function init() {
    const fileInput  = document.getElementById('csvFileInput');
    const dropZone   = document.getElementById('dropZone');
    const analyzeBtn = document.getElementById('btnAnalyze');
    const clearBtn   = document.getElementById('btnClearFile');

    if (!fileInput || !dropZone) return;

    // Click-to-browse
    fileInput.addEventListener('change', e => {
      if (e.target.files[0]) _handleFile(e.target.files[0]);
    });

    // Drag-and-drop
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) {
        _handleFile(file);
      }
    });

    // Analyze button
    if (analyzeBtn) analyzeBtn.addEventListener('click', _runAnalysis);

    // Clear button
    if (clearBtn) clearBtn.addEventListener('click', _clearFile);
  }

  /* ── File handling ───────────────────────────────────────── */

  function _handleFile(file) {
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      _showErrors([`Invalid file type: "${file.name}". Please upload a .csv file.`]);
      return;
    }

    // Validate file size (< 10 MB)
    if (file.size > 10 * 1024 * 1024) {
      _showErrors([`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Please upload a file under 10 MB.`]);
      return;
    }

    _hideErrors();
    _pendingFilename = file.name;
    showLoading(`Parsing "${file.name}"…`);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: results => {
        hideLoading();

        if (!results.data || results.data.length === 0) {
          _showErrors(['The uploaded file is empty or contains no valid rows.']);
          return;
        }

        // Check for required columns
        const missingCols = DETECTOR.checkRequiredColumns(results.data);
        if (missingCols.length > 0) {
          _showErrors([
            `Missing required columns: ${missingCols.join(', ')}.`,
            'The file must contain at least: units_consumed (or consumption_kwh) and current_bill (or billed_amount).',
            'Download the sample CSV for the correct format.',
          ]);
          return;
        }

        _pendingRawRows = results.data;
        _showPreview(results.data);
        _showAnalyzeButton(file.name, results.data.length);
        showToast(`Loaded ${results.data.length} rows from "${file.name}". Click Analyze to run detection.`, 'success');
      },
      error: err => {
        hideLoading();
        _showErrors([`CSV parse error: ${err.message}. Please check the file format.`]);
      }
    });
  }

  /* ── Analysis ────────────────────────────────────────────── */

  function _runAnalysis() {
    if (!_pendingRawRows || _pendingRawRows.length === 0) {
      showToast('No data to analyse. Please upload a CSV file first.', 'warn');
      return;
    }

    showLoading('Running anomaly detection…');

    // Small timeout to allow loading overlay to render
    setTimeout(() => {
      const { records, stats, missingCols } = DETECTOR.analyse(_pendingRawRows);

      hideLoading();

      if (missingCols.length > 0) {
        showToast(`Warning: some columns were not found — ${missingCols.join(', ')}. Results may be incomplete.`, 'warn', 5000);
      }

      // Store globally
      window.APP_DATA = { records, stats };

      // Update status indicator
      setStatus(`${records.length} records loaded`, true);
      setAnomalyBadge(stats.suspicious);

      // Show reset + download buttons
      const btnReset    = document.getElementById('btnReset');
      const btnDownload = document.getElementById('btnDownload');
      if (btnReset)    btnReset.style.display    = 'inline-flex';
      if (btnDownload) btnDownload.style.display = 'inline-flex';

      // Render all views
      DASHBOARD.render(records, stats);
      APP.refreshAnomalyView(records);
      APP.refreshAllRecordsView(records);

      // Navigate to dashboard
      APP.navigateTo('dashboard');

      const msg = stats.suspicious > 0
        ? `Analysis complete: ${stats.suspicious} suspicious record(s) found out of ${stats.total}.`
        : `Analysis complete: No suspicious patterns detected in ${stats.total} records.`;
      showToast(msg, stats.suspicious > 0 ? 'warn' : 'success', 5000);

      // Update AI mode badge
      AI.updateAIModeBadge();
    }, 50);
  }

  /* ── Reset ───────────────────────────────────────────────── */

  function reset() {
    _pendingRawRows  = null;
    _pendingFilename = '';

    // Reset file input
    const fileInput = document.getElementById('csvFileInput');
    if (fileInput) fileInput.value = '';

    _hideErrors();
    _hidePreview();
    _hideAnalyzeButton();
  }

  /* ── UI helpers ──────────────────────────────────────────── */

  function _showPreview(rawRows) {
    const card    = document.getElementById('previewCard');
    const table   = document.getElementById('previewTable');
    const count   = document.getElementById('previewCount');
    if (!card || !table) return;

    const previewRows = rawRows.slice(0, 10);
    // Show all CSV columns as-is for preview
    const cols = Object.keys(rawRows[0]).filter(k => !k.startsWith('_'));
    table.innerHTML = buildTableHTML(previewRows, cols);
    if (count) count.textContent = `Showing ${previewRows.length} of ${rawRows.length} rows`;
    card.style.display = 'block';
  }

  function _hidePreview() {
    const card = document.getElementById('previewCard');
    if (card) card.style.display = 'none';
  }

  function _showAnalyzeButton(filename, rowCount) {
    const actions   = document.getElementById('uploadActions');
    const fileLabel = document.getElementById('dropFilename');
    if (actions)   actions.style.display   = 'flex';
    if (fileLabel) {
      fileLabel.textContent = `✓ ${filename} (${rowCount} rows)`;
      fileLabel.style.display = 'inline-block';
    }
  }

  function _hideAnalyzeButton() {
    const actions   = document.getElementById('uploadActions');
    const fileLabel = document.getElementById('dropFilename');
    if (actions)   actions.style.display   = 'none';
    if (fileLabel) fileLabel.style.display = 'none';
  }

  function _clearFile() {
    reset();
    showToast('File cleared.', 'success', 2000);
  }

  function _showErrors(errorMessages) {
    const card = document.getElementById('uploadErrorCard');
    const list = document.getElementById('uploadErrorList');
    if (!card || !list) return;
    list.innerHTML = errorMessages.map(msg => `<div class="error-item">⚠ ${msg}</div>`).join('');
    card.style.display = 'block';
  }

  function _hideErrors() {
    const card = document.getElementById('uploadErrorCard');
    if (card) card.style.display = 'none';
  }

  return { init, reset };
})();
