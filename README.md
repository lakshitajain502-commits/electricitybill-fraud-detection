# ⚡ BillGuard AI
### AI-powered Electricity Bill Fraud Detection
*Hackathon MVP — Problem Statement #18*

---

## 🚀 Run It Right Now (No Installation)

```
1. Open  billguard-ai/index.html  in Chrome, Firefox, or Edge
2. Click "Get Started — Upload CSV"
3. Upload  data/sample.csv
4. Click "🔍 Analyze Records"
5. Explore the Dashboard, Suspicious Records, and All Records views
```

**That's it.** No npm, no Node.js, no server required for the core application.

---

## 📂 Final Project Structure

```
billguard-ai/
├── index.html              ← Single-page app (5 views)
├── css/
│   └── styles.css          ← Complete responsive stylesheet
├── js/
│   ├── ui.js               ← Toast, modal, table builder, CSV download
│   ├── detector.js         ← Anomaly detection engine (6 check types)
│   ├── ai.js               ← IBM Granite integration + demo fallback
│   ├── dashboard.js        ← Charts (Chart.js) + stat cards
│   ├── upload.js           ← CSV upload, validation, analyze flow
│   └── app.js              ← View router, filters, modal, reset, export
├── data/
│   └── sample.csv          ← 41 records across 5 consumers (planted anomalies)
├── backend/
│   ├── server.js           ← Node.js/Express IBM Granite API proxy
│   ├── package.json
│   └── .env.example        ← IBM Cloud credential template
└── README.md
```

---

## ✅ Features Implemented

| Feature | Status |
|---|---|
| CSV upload (browse + drag-drop) | ✅ |
| Column name normalisation (aliases) | ✅ |
| File validation (type, size, columns) | ✅ |
| Data preview table | ✅ |
| Analyze Records button | ✅ |
| 6-type anomaly detection engine | ✅ |
| Per-consumer historical analysis | ✅ |
| Dataset-level Z-score analysis | ✅ |
| Severity levels (High / Medium / Low) | ✅ |
| Dashboard stat cards (4 metrics) | ✅ |
| Severity breakdown row | ✅ |
| Consumption line chart | ✅ |
| Billing bar chart | ✅ |
| Suspicious Records view | ✅ |
| Filter by severity | ✅ |
| Search by consumer / period | ✅ |
| All Records view | ✅ |
| Row-click detail modal | ✅ |
| Issue-by-issue explanation in modal | ✅ |
| AI explanation per record (modal) | ✅ |
| AI dataset summary (dashboard) | ✅ |
| IBM Granite backend proxy | ✅ |
| Auto-detect backend / demo fallback | ✅ |
| Export anomaly report as CSV | ✅ |
| Reset dashboard | ✅ |
| Responsive (desktop + mobile) | ✅ |
| Loading overlay | ✅ |
| Toast notifications | ✅ |

---

## 🔍 Anomaly Detection — 6 Check Types

| Check | Method | Threshold |
|---|---|---|
| Consumption Spike | Z-score > 1.8σ above dataset mean | Configurable |
| Consumption Drop | Z-score < 1.8σ below dataset mean | Configurable |
| Billing Mismatch | Bill deviates > 20% from tariff × units | Configurable |
| Meter Reading Error | Current < Previous reading, or gap > 5 units | Configurable |
| Personal Drop | Consumer's own consumption drops > 60% month-over-month | Configurable |
| Faulty Meter Status | Meter status is not "Active" or "OK" | Rule-based |

All thresholds are defined at the top of [`js/detector.js`](js/detector.js) and can be tuned.

---

## 📊 Sample CSV — Planted Anomalies

The file `data/sample.csv` contains **41 records** across **5 consumers** with these intentional anomalies:

| Consumer | Period | Anomaly Type |
|---|---|---|
| C001 Ravi Kumar | Aug-2024 | Sudden personal drop (52 units, 87% drop) |
| C001 Ravi Kumar | Nov-2024 | Consumption spike (610 units) |
| C001 Ravi Kumar | Dec-2024 | Billing inconsistency (₹5,900 for 305 units) |
| C002 Priya Sharma | Apr-2024 | Extreme consumption drop (10 units) |
| C003 Anil Mehta | May-2024 | Personal drop (150 units) |
| C003 Anil Mehta | Jun-2024 | Consumption spike (830 units) |
| C004 Sunita Patel | Jun-2024 | Faulty meter + consumption drop |
| C005 Deepak Verma | Apr-2024 | Extreme consumption spike (920 units) |
| C005 Deepak Verma | Jun-2024 | Billing inconsistency (₹9,000 for 300 units) |

---

## 🤖 IBM Granite AI Integration

### Without credentials (Demo Mode — works out of the box)
- Local detection engine runs fully
- AI explanation panels are populated from detection data
- All features work normally
- Labelled clearly as "Demo Mode"

### With IBM credentials (Live Mode)
1. Install backend dependencies:
   ```
   cd billguard-ai/backend
   npm install
   ```

2. Create your `.env` file:
   ```
   cp .env.example .env
   ```

3. Edit `backend/.env` and fill in:
   ```
   IBM_API_KEY=your_actual_api_key
   IBM_PROJECT_ID=your_actual_project_id
   IBM_REGION=us-south
   GRANITE_MODEL=ibm/granite-13b-instruct-v2
   ```

4. Start the backend:
   ```
   node server.js
   ```

5. Open `index.html` in your browser — the AI mode badge will turn green.

### IBM Cloud Values You Need

| Value | Where to Get It |
|---|---|
| `IBM_API_KEY` | [cloud.ibm.com/iam/apikeys](https://cloud.ibm.com/iam/apikeys) → Create API key |
| `IBM_PROJECT_ID` | watsonx.ai → Your project → Manage → General → Project ID |
| `IBM_REGION` | Region of your watsonx.ai instance (e.g. `us-south`) |

---

## ⚠️ Disclaimer

BillGuard AI surfaces patterns that **require verification**. It does not confirm, conclude, or allege any fraud. All flagged records should be reviewed by a qualified human inspector before any action is taken. The tool uses language such as *"Suspicious Pattern"*, *"Possible Billing Anomaly"*, and *"Requires Verification"* throughout.

---

## 🛠️ Tech Stack

| Component | Technology |
|---|---|
| Frontend | HTML5 + CSS3 + Vanilla JavaScript |
| Charts | [Chart.js 4](https://www.chartjs.org/) via CDN |
| CSV parsing | [PapaParse 5](https://www.papaparse.com/) via CDN |
| AI integration | IBM watsonx.ai (Granite model) |
| Backend proxy | Node.js + Express (optional — only for IBM AI) |
| No build step | Open `index.html` directly |
