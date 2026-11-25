/**
 * detector.js — BillGuard AI Anomaly Detection Engine
 *
 * Performs 6 types of checks on electricity billing records:
 *   1. Consumption spike (vs consumer's own history + dataset)
 *   2. Consumption drop  (vs consumer's own history + dataset)
 *   3. Billing amount mismatch (billed vs tariff × units)
 *   4. Meter reading inconsistency (reading gap ≠ reported units)
 *   5. Sudden per-consumer drop vs their own previous month
 *   6. Faulty/suspicious meter status flagging
 *
 * Each flagged record gets:
 *   - category   : short anomaly type label
 *   - severity   : 'Low' | 'Medium' | 'High'
 *   - reason     : human-readable explanation
 *   - suggestion : verification action
 *
 * IMPORTANT: Results use language like "Suspicious Pattern" or
 * "Requires Verification" — never "confirmed fraud".
 */

const DETECTOR = (() => {

  // ── Thresholds (easy to tune) ────────────────────────────────
  const Z_SPIKE_THRESHOLD  = 1.8;   // σ above dataset mean = spike
  const Z_DROP_THRESHOLD   = 1.8;   // σ below dataset mean = drop
  const BILL_TOLERANCE     = 0.20;  // ±20% billing vs tariff × units
  const READING_TOLERANCE  = 5;     // ±5 units reading rounding
  const PERSONAL_DROP_PCT  = 0.60;  // >60% drop vs own previous = suspicious
  const PERSONAL_SPIKE_PCT = 2.50;  // >250% vs own previous = suspicious

  // ── Statistics helpers ──────────────────────────────────────
  function mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  function stddev(arr) {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / arr.length);
  }

  // ── Column name aliases ─────────────────────────────────────
  // Maps our internal field names to possible CSV column names.
  const ALIASES = {
    consumer_id:      ['consumer_id', 'Consumer ID', 'ConsumerID', 'id', 'account_no'],
    consumer_name:    ['consumer_name', 'Consumer Name', 'name', 'Name'],
    billing_period:   ['billing_period', 'Billing Period', 'month', 'Month', 'period'],
    previous_reading: ['previous_reading', 'Previous Reading', 'prev_reading', 'PreviousReading'],
    current_reading:  ['current_reading',  'Current Reading',  'curr_reading', 'CurrentReading'],
    units_consumed:   ['units_consumed',   'Units Consumed',   'consumption_kwh', 'Consumption (kWh)', 'units', 'kwh'],
    previous_bill:    ['previous_bill',    'Previous Bill',    'prev_bill', 'PreviousBill'],
    current_bill:     ['current_bill',     'Current Bill',     'billed_amount', 'Billed Amount', 'bill'],
    tariff_rate:      ['tariff_rate',      'Tariff Rate',      'rate', 'Rate', 'tariff'],
    meter_status:     ['meter_status',     'Meter Status',     'status', 'Status'],
    area:             ['area',             'Area',             'zone',  'Zone'],
  };

  /**
   * Resolve a raw CSV row object to our internal field names.
   * Returns an object with normalised keys; missing fields default to ''.
   */
  function normalise(raw) {
    const out = {};
    for (const [field, aliases] of Object.entries(ALIASES)) {
      let val = '';
      for (const alias of aliases) {
        if (raw[alias] !== undefined && raw[alias] !== null && raw[alias] !== '') {
          val = raw[alias];
          break;
        }
      }
      out[field] = val;
    }
    return out;
  }

  /**
   * Check which required columns are missing from a CSV row sample.
   * Returns an array of missing field names (empty = all present).
   */
  function checkRequiredColumns(rawRows) {
    if (!rawRows || rawRows.length === 0) return ['(no data rows)'];
    const sample = rawRows[0];
    const required = ['units_consumed', 'current_bill'];
    const missing = [];
    for (const field of required) {
      const found = ALIASES[field].some(alias => sample[alias] !== undefined);
      if (!found) missing.push(field);
    }
    return missing;
  }

  /**
   * Determine severity based on number of issues and their type.
   */
  function calcSeverity(issues) {
    if (!issues.length) return null;
    if (issues.some(i => i.sev === 'High'))   return 'High';
    if (issues.some(i => i.sev === 'Medium')) return 'Medium';
    return 'Low';
  }

  /**
   * Main entry point.
   * @param {object[]} rawRows  - rows directly from PapaParse
   * @returns {{ records: object[], stats: object, missingCols: string[] }}
   */
  function analyse(rawRows) {
    if (!rawRows || rawRows.length === 0) {
      return { records: [], stats: {}, missingCols: [] };
    }

    // Check required columns
    const missingCols = checkRequiredColumns(rawRows);

    // Normalise all rows
    const rows = rawRows.map(r => {
      const n = normalise(r);
      return {
        ...n,
        _units:    parseFloat(n.units_consumed)   || 0,
        _bill:     parseFloat(n.current_bill)     || 0,
        _prevBill: parseFloat(n.previous_bill)    || 0,
        _prevRead: parseFloat(n.previous_reading) || 0,
        _currRead: parseFloat(n.current_reading)  || 0,
        _rate:     parseFloat(n.tariff_rate)       || 0,
      };
    });

    // ── Dataset-level statistics ────────────────────────────
    const allUnits = rows.map(r => r._units).filter(v => v > 0);
    const datasetMean  = mean(allUnits);
    const datasetStdev = stddev(allUnits);

    // Derive implied rate across all records for billing check
    // (use dataset tariff if available, else derive from bills)
    const impliedRates = rows
      .filter(r => r._units > 0 && r._bill > 0)
      .map(r => r._rate > 0 ? r._rate : r._bill / r._units);
    const datasetRate = mean(impliedRates);

    // ── Per-consumer historical lookup ─────────────────────
    // Build map: consumer_id → sorted array of their rows (by index)
    const consumerMap = {};
    rows.forEach((row, idx) => {
      const cid = row.consumer_id || 'UNKNOWN';
      if (!consumerMap[cid]) consumerMap[cid] = [];
      consumerMap[cid].push({ row, idx });
    });

    // ── Analyse each row ───────────────────────────────────
    const analysedRows = rows.map((row, idx) => {
      const issues = [];
      const cid    = row.consumer_id || 'UNKNOWN';
      const period = row.billing_period || `Row ${idx + 1}`;
      const units  = row._units;
      const bill   = row._bill;
      const rate   = row._rate > 0 ? row._rate : datasetRate;

      // ── Check 1: Dataset-level spike ──────────────────
      if (datasetStdev > 0) {
        const z = (units - datasetMean) / datasetStdev;
        if (z > Z_SPIKE_THRESHOLD) {
          issues.push({
            category: 'Consumption Spike',
            sev: z > 3 ? 'High' : 'Medium',
            reason: `Units consumed (${units}) is ${z.toFixed(1)}σ above the dataset average (${datasetMean.toFixed(0)} units). Unusually high consumption detected.`,
            suggestion: 'Conduct on-site meter inspection. Verify if usage matches reported consumer type.',
          });
        }
        // ── Check 2: Dataset-level drop ───────────────
        if (z < -Z_DROP_THRESHOLD && units > 0) {
          issues.push({
            category: 'Consumption Drop',
            sev: Math.abs(z) > 3 ? 'High' : 'Medium',
            reason: `Units consumed (${units}) is ${Math.abs(z).toFixed(1)}σ below the dataset average (${datasetMean.toFixed(0)} units). Unusually low consumption detected.`,
            suggestion: 'Check for meter bypass, tampering, or meter malfunction. Cross-verify with on-site reading.',
          });
        }
      }

      // ── Check 3: Billing mismatch ──────────────────────
      if (units > 0 && bill > 0 && rate > 0) {
        const expectedBill = units * rate;
        const deviation = Math.abs(bill - expectedBill) / expectedBill;
        if (deviation > BILL_TOLERANCE) {
          const diff = bill - expectedBill;
          issues.push({
            category: 'Billing Inconsistency',
            sev: deviation > 0.5 ? 'High' : 'Medium',
            reason: `Billed amount (₹${bill.toFixed(2)}) deviates ${(deviation * 100).toFixed(0)}% from expected (₹${expectedBill.toFixed(2)}) at tariff ₹${rate}/unit. Difference: ₹${diff > 0 ? '+' : ''}${diff.toFixed(2)}.`,
            suggestion: 'Verify billing computation manually. Check if correct tariff slab was applied.',
          });
        }
      }

      // ── Check 4: Meter reading inconsistency ───────────
      if (row._prevRead > 0 && row._currRead > 0 && units > 0) {
        const readingDiff = row._currRead - row._prevRead;
        if (readingDiff < 0) {
          issues.push({
            category: 'Meter Reading Error',
            sev: 'High',
            reason: `Current reading (${row._currRead}) is less than previous reading (${row._prevRead}). Meter may have been reset, tampered with, or readings entered incorrectly.`,
            suggestion: 'Immediately verify physical meter readings on-site. Check for meter replacement records.',
          });
        } else {
          const gap = Math.abs(readingDiff - units);
          if (gap > READING_TOLERANCE) {
            issues.push({
              category: 'Reading vs Consumption Gap',
              sev: gap > 50 ? 'High' : 'Medium',
              reason: `Reading difference (${readingDiff.toFixed(0)} units) does not match reported consumption (${units} units). Gap of ${gap.toFixed(0)} units cannot be explained by rounding.`,
              suggestion: 'Cross-check meter reading records. Inspect for data entry errors or meter tampering.',
            });
          }
        }
      }

      // ── Check 5: Per-consumer month-over-month change ──
      const consumerHistory = consumerMap[cid];
      if (consumerHistory && consumerHistory.length > 1) {
        const myPos = consumerHistory.findIndex(e => e.idx === idx);
        if (myPos > 0) {
          const prevUnits = consumerHistory[myPos - 1].row._units;
          if (prevUnits > 0 && units > 0) {
            const changePct = units / prevUnits;
            if (changePct < (1 - PERSONAL_DROP_PCT)) {
              issues.push({
                category: 'Sudden Personal Drop',
                sev: changePct < 0.3 ? 'High' : 'Medium',
                reason: `Consumption dropped ${((1 - changePct) * 100).toFixed(0)}% vs this consumer's previous period (${prevUnits} → ${units} units). Sudden personal consumption drop is suspicious.`,
                suggestion: 'Check if premises were vacant, or if meter was bypassed during this period.',
              });
            } else if (changePct > PERSONAL_SPIKE_PCT) {
              issues.push({
                category: 'Sudden Personal Spike',
                sev: changePct > 4 ? 'High' : 'Medium',
                reason: `Consumption increased ${((changePct - 1) * 100).toFixed(0)}% vs this consumer's previous period (${prevUnits} → ${units} units). Sudden personal consumption spike detected.`,
                suggestion: 'Verify if new high-load appliances were installed or if meter was tampered with.',
              });
            }
          }
        }
      }

      // ── Check 6: Faulty meter status ──────────────────
      const statusRaw = (row.meter_status || '').toLowerCase();
      if (statusRaw && statusRaw !== 'active' && statusRaw !== 'ok' && statusRaw !== '') {
        issues.push({
          category: 'Meter Status Alert',
          sev: 'Medium',
          reason: `Meter is marked as "${row.meter_status}" (not Active). Faulty or non-standard meter status may indicate tampering or malfunction.`,
          suggestion: 'Inspect physical meter. Replace or recalibrate if faulty. Audit prior bills during faulty period.',
        });
      }

      // ── Compose output ────────────────────────────────
      const isSuspicious = issues.length > 0;
      const severity     = calcSeverity(issues);
      const categories   = [...new Set(issues.map(i => i.category))].join(', ');
      const reasons      = issues.map(i => i.reason).join(' | ');
      const suggestions  = [...new Set(issues.map(i => i.suggestion))].join(' | ');

      return {
        // display-ready fields
        consumer_id:     row.consumer_id    || '—',
        consumer_name:   row.consumer_name  || '—',
        billing_period:  row.billing_period || '—',
        units_consumed:  units,
        current_bill:    `₹${bill.toFixed(2)}`,
        tariff_rate:     rate > 0 ? `₹${rate.toFixed(2)}` : '—',
        meter_status:    row.meter_status   || '—',
        area:            row.area           || '—',
        // anomaly meta
        _isSuspicious:   isSuspicious,
        _severity:       severity,
        _categories:     categories,
        _reasons:        reasons   || 'No anomaly detected',
        _suggestions:    suggestions || '—',
        _issueCount:     issues.length,
        _issues:         issues,            // full issue objects for modal
        // raw numeric (kept for charts)
        _units:          units,
        _bill:           bill,
        _prevBill:       row._prevBill,
        _flagClass:      isSuspicious
                           ? (severity === 'High' ? 'row-spike' : 'row-drop')
                           : '',
      };
    });

    // ── Dataset summary stats ─────────────────────────────
    const suspicious = analysedRows.filter(r => r._isSuspicious);
    const totalBill  = analysedRows.reduce((s, r) => s + r._bill, 0);
    const stats = {
      total:        analysedRows.length,
      normal:       analysedRows.length - suspicious.length,
      suspicious:   suspicious.length,
      totalBill:    totalBill,
      datasetMean:  datasetMean,
      datasetRate:  datasetRate,
      highSeverity: suspicious.filter(r => r._severity === 'High').length,
      medSeverity:  suspicious.filter(r => r._severity === 'Medium').length,
      lowSeverity:  suspicious.filter(r => r._severity === 'Low').length,
    };

    return { records: analysedRows, stats, missingCols };
  }

  return { analyse, checkRequiredColumns };
})();
