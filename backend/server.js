/**
 * BillGuard AI — Backend Server
 *
 * A lightweight Node.js/Express proxy that:
 *   1. Accepts summarised detection results from the frontend
 *   2. Calls IBM watsonx.ai (Granite model) to generate explanations
 *   3. Returns the AI response to the frontend
 *
 * CREDENTIALS:
 *   Copy backend/.env.example → backend/.env
 *   Fill in your IBM Cloud values.
 *   NEVER commit .env to source control.
 *
 * HOW TO RUN:
 *   cd billguard-ai/backend
 *   npm install
 *   node server.js
 *
 * PORT: 3001 (configurable via PORT env var)
 */

'use strict';

const express    = require('express');
const cors       = require('cors');
const dotenv     = require('dotenv');
const https      = require('https');

// Load .env from the backend directory
dotenv.config({ path: __dirname + '/.env' });

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──────────────────────────────────────────────
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:5500', 'null', '*'],
}));
app.use(express.json({ limit: '1mb' }));

// ── IBM watsonx.ai configuration ───────────────────────────
// These MUST be set in backend/.env — never hardcode here.
const IBM_API_KEY     = process.env.IBM_API_KEY    || '';
const IBM_PROJECT_ID  = process.env.IBM_PROJECT_ID || '';
const IBM_REGION      = process.env.IBM_REGION     || 'us-south';
const GRANITE_MODEL   = process.env.GRANITE_MODEL  || 'ibm/granite-13b-instruct-v2';

const WATSONX_URL = `https://${IBM_REGION}.ml.cloud.ibm.com/ml/v1/text/generation?version=2023-05-29`;

// ── IBM IAM Token Cache ─────────────────────────────────────
let _iamToken    = null;
let _tokenExpiry = 0;

/**
 * Fetch a new IBM IAM access token using the API key.
 * Token is cached and refreshed automatically when expired.
 */
async function getIAMToken() {
  if (_iamToken && Date.now() < _tokenExpiry) return _iamToken;
  if (!IBM_API_KEY) throw new Error('IBM_API_KEY is not set in backend/.env');

  const body = `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${encodeURIComponent(IBM_API_KEY)}`;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'iam.cloud.ibm.com',
      path:     '/identity/token',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json.access_token) return reject(new Error('IAM token response missing access_token'));
          _iamToken    = json.access_token;
          _tokenExpiry = Date.now() + (json.expires_in - 60) * 1000;  // 60s buffer
          resolve(_iamToken);
        } catch (e) {
          reject(new Error('Failed to parse IAM token response'));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Call the IBM watsonx.ai text generation endpoint.
 * @param {string} prompt
 * @returns {Promise<string>}  Generated text
 */
async function callGranite(prompt) {
  const token = await getIAMToken();

  const payload = JSON.stringify({
    model_id: GRANITE_MODEL,
    input:    prompt,
    parameters: {
      max_new_tokens: 400,
      temperature:    0.3,
      top_p:          0.9,
      repetition_penalty: 1.1,
    },
    project_id: IBM_PROJECT_ID,
  });

  return new Promise((resolve, reject) => {
    const url = new URL(WATSONX_URL);
    const options = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   'POST',
      headers:  {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.results && json.results[0]) {
            resolve(json.results[0].generated_text.trim());
          } else if (json.error) {
            reject(new Error(`watsonx.ai error: ${json.error}`));
          } else {
            reject(new Error('Unexpected watsonx.ai response format'));
          }
        } catch (e) {
          reject(new Error('Failed to parse watsonx.ai response'));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Helper: build an explain prompt ────────────────────────
function buildExplainPrompt(data) {
  const issueLines = (data.issues || []).map((iss, i) =>
    `${i + 1}. [${iss.severity}] ${iss.category}: ${iss.reason}`
  ).join('\n');

  return `You are an electricity billing auditor. Review the following flagged billing record and provide a clear, concise explanation.

Consumer: ${data.consumer_id}
Period: ${data.billing_period}
Units consumed: ${data.units_consumed}
Billed amount: ${data.current_bill}
Severity: ${data.severity}
Anomaly types: ${data.categories}

Detected issues:
${issueLines || 'None'}

Write a brief, plain-language explanation (3-5 sentences) of:
1. Why this record was flagged
2. What the suspicious pattern suggests (do not claim confirmed fraud)
3. What verification steps are recommended

Use professional language suitable for a utility company auditor.`;
}

// ── Helper: build a summary prompt ─────────────────────────
function buildSummaryPrompt(data) {
  const topIssues = Object.entries(data.topIssues || {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  - ${k}: ${v} occurrence(s)`)
    .join('\n');

  return `You are an electricity fraud detection analyst. Summarise the following dataset analysis results in 4-6 sentences.

Total records: ${data.stats.total}
Normal: ${data.stats.normal}
Suspicious: ${data.stats.suspicious}
Total billing: ₹${data.stats.totalBill ? data.stats.totalBill.toLocaleString() : 'N/A'}
High severity: ${data.stats.highSeverity || 0}
Medium severity: ${data.stats.medSeverity || 0}
Low severity: ${data.stats.lowSeverity || 0}

Most common anomaly types:
${topIssues || '  None'}

Write an executive summary suitable for a billing department manager. Do not claim confirmed fraud. Recommend next steps.`;
}

// ── API Routes ──────────────────────────────────────────────

/** Health check — frontend uses this to detect if backend is available */
app.get('/api/status', (req, res) => {
  const configured = !!(IBM_API_KEY && IBM_PROJECT_ID);
  res.json({
    status:      'ok',
    configured,
    model:       GRANITE_MODEL,
    message:     configured
                   ? 'IBM Granite backend is ready'
                   : 'Backend running but IBM credentials not configured — set IBM_API_KEY and IBM_PROJECT_ID in .env',
  });
});

/** Explain a single suspicious record */
app.post('/api/explain', async (req, res) => {
  if (!IBM_API_KEY || !IBM_PROJECT_ID) {
    return res.status(503).json({
      error: 'IBM credentials not configured. Set IBM_API_KEY and IBM_PROJECT_ID in backend/.env',
    });
  }

  const { consumer_id, billing_period, issues } = req.body;
  if (!consumer_id || !billing_period) {
    return res.status(400).json({ error: 'consumer_id and billing_period are required' });
  }
  if (!issues || !Array.isArray(issues)) {
    return res.status(400).json({ error: 'issues array is required' });
  }

  try {
    const prompt      = buildExplainPrompt(req.body);
    const explanation = await callGranite(prompt);
    res.json({ explanation, model: GRANITE_MODEL });
  } catch (err) {
    console.error('[/api/explain] Error:', err.message);
    res.status(500).json({ error: `AI generation failed: ${err.message}` });
  }
});

/** Summarise an entire dataset's analysis results */
app.post('/api/summarise', async (req, res) => {
  if (!IBM_API_KEY || !IBM_PROJECT_ID) {
    return res.status(503).json({
      error: 'IBM credentials not configured.',
    });
  }

  const { stats } = req.body;
  if (!stats || stats.total == null) {
    return res.status(400).json({ error: 'stats object with total is required' });
  }

  try {
    const prompt  = buildSummaryPrompt(req.body);
    const summary = await callGranite(prompt);
    res.json({ summary, model: GRANITE_MODEL });
  } catch (err) {
    console.error('[/api/summarise] Error:', err.message);
    res.status(500).json({ error: `AI generation failed: ${err.message}` });
  }
});

// ── 404 fallback ────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Start server ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 BillGuard AI backend running at http://localhost:${PORT}`);
  console.log(`   Status:  http://localhost:${PORT}/api/status`);
  if (!IBM_API_KEY || !IBM_PROJECT_ID) {
    console.log('\n⚠️  IBM credentials not configured. Set IBM_API_KEY and IBM_PROJECT_ID in backend/.env');
    console.log('   The frontend will run in Demo Mode without AI explanations.');
  } else {
    console.log(`\n✅ IBM Granite model: ${GRANITE_MODEL}`);
  }
  console.log('');
});
