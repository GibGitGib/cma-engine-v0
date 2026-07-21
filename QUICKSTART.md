# Instant CMA — Quick Start Guide

**Boston Comparative Market Analysis Engine**  
*10-method valuation ensemble • Progressive comp selection • Explainable optimizer*

---

## 🚀 30-Second Deploy

```bash
# 1. Clone
git clone https://github.com/GibGitGib/cma-engine-v0.git
cd cma-engine-v0

# 2. Install (ES modules)
npm install

# 3. Run locally
npx vercel dev
# → http://localhost:3000

# 4. Test API
curl "http://localhost:3000/api/cma?address=500+Commonwealth+Ave,+Boston,+MA+02215"
```

---

## 🏗️ Architecture (60-Second Mental Model)

```
Address → Census Geocoder → BPDA Neighborhood Polygon → 10 Valuation Methods → Optimizer → Report
              (free)              (MassGIS, offline)          (parallel)          (ensemble)
```

| Layer | Tech | Purpose |
|-------|------|---------|
| **Geocode** | US Census Bureau API | Free, no key, address → lat/lon |
| **Polygon** | MassGIS BPDA (GeoJSON) | 23 Boston neighborhoods → micro-market ID |
| **Comps** | Mock/RentCast/MLS PIN | Progressive relaxation (min 5 comps) |
| **Methods** | 10 pure JS modules | Sales comp, $/sqft, hedonic, repeat sales, list/sale, DOM, AVM, median trend, cost, income |
| **Optimizer** | Weighted ensemble + ambiguity detection | Applicability gate → confidence weights → outlier trim → explanation |
| **Frontend** | Single-file PWA (HTML/CSS/JS) | Offline-ready, map, method breakdown, optimizer narrative |

---

## 🔌 API Reference

### `GET /api/cma`

**Query Parameters:**
| Param | Required | Default | Description |
|-------|----------|---------|-------------|
| `address` | ✅ | — | Full address (URL-encoded) |

**Response:**
```json
{
  "address": "500 COMMONWEALTH AVE, BOSTON, MA, 02215",
  "polygonId": "fenway-kenmore",
  "coordinates": { "lat": 42.3487, "lon": -71.0950 },
  "property": { "type": "single", "sqft": 1800, "beds": 3, "baths": 2, "yearBuilt": 1950, "condition": 4 },
  "comps": { "selected": 7, "explanation": "Found 7 qualifying comps... Minimum of 5 met. Constraints relaxed: none. Impact on confidence: minimal." },
  "methods": {
    "salesComparison": { "success": true, "estimate": 972500, "range": { "low": 927500, "high": 977500 }, "confidence": 0.78, "compsUsed": 5, "rationale": "Top 5 sold comps with dollar adjustments..." },
    "pricePerSqft": { "success": true, "estimate": 938720, "confidence": 0.98, "compsUsed": 5, "rationale": "Neighborhood $/sqft..." },
    "hedonicRegression": { "success": true, "estimate": 980200, "confidence": 0.99, "compsUsed": 1500, "rationale": "Multivariate regression on 1500 metro sales..." },
    "repeatSales": { "success": false, "error": "No prior sales for subject or comps" },
    "listToSale": { "success": false, "error": "No active listings in micro-market" },
    "domAbsorption": { "success": false, "error": "No base estimate to adjust" },
    "externalAvm": { "success": true, "estimate": 950000, "confidence": 0.99, "compsUsed": 0, "rationale": "Average of 2 AVM(s): Zillow $945,000, Redfin $955,000" },
    "medianTrend": { "success": true, "estimate": 1057822, "confidence": 0.75, "compsUsed": 0, "rationale": "Seasonally adjusted 5-month median trend..." },
    "costApproach": { "success": true, "estimate": 382400, "confidence": 0.4, "compsUsed": 0, "rationale": "Land value: $350,000. Replacement cost: 1800 sqft × $180 = $324,000. Depreciation: 90% (106 yr effective age)" },
    "incomeApproach": { "success": false, "error": "Income approach only for multi-family / investor properties" }
  },
  "estimate": {
    "point": 979848,
    "range": { "low": 938720, "high": 980200 },
    "confidence": 0.2,
    "explanation": "Optimizer combined 6 applicable methods... Ambiguity detected: 76.7% spread between methods. Outliers trimmed: salesComparison, pricePerSqft, hedonicRegression, externalAvm, medianTrend used for final estimate.",
    "methodWeights": { "salesComparison": 0.167, "pricePerSqft": 0.167, "hedonicRegression": 0.167, "repeatSales": 0, "listToSale": 0, "domAbsorption": 0, "externalAvm": 0.167, "medianTrend": 0.167, "costApproach": 0.167, "incomeApproach": 0 }
  },
  "meta": { "timestamp": "2026-07-21T15:30:00.000Z", "version": "0.1.0" }
}
```

---

## 🧪 Local Test (No Deploy)

```bash
node --experimental-specifier-resolution=node test-runner.mjs
```

**Expected output:**
```
=== CMA Engine Test Suite ===

Subject: 123 Main St, Boston, MA 02118
  1800 sqft, 3bd/2ba, built 1920, condition 4
  Polygon: south-end

Comps: 6 available

--- Test 1: Comp Selection ---
Selected: 5 comps (min 5: YES)
Explanation: Found 5 qualifying comps for 123 Main St, Boston, MA 02118. Minimum of 5 met. Constraints relaxed: none. Impact on confidence: minimal.

--- Test 2: All Valuation Methods ---
  salesComparison: $972,500 (78% conf) [Sales Comparison Approach (Adjusted Comps)]
  pricePerSqft: $938,720 (98% conf) [Price-per-Sqft Analysis]
  hedonicRegression: $980,200 (99% conf) [Hedonic Regression]
  repeatSales: FAILED - No prior sales for subject or comps
  listToSale: FAILED - No active listings in micro-market
  domAbsorption: FAILED - No base estimate to adjust
  externalAvm: $950,000 (99% conf) [External AVM Cross-Check]
  medianTrend: $1,057,822 (75% conf) [Neighborhood Median-Trend Model]
  costApproach: $382,400 (40% conf) [Cost Approach]
  incomeApproach: FAILED - Income approach only for multi-family / investor properties

--- Test 3: Optimizer ---
Point Estimate: $979,848
Range: $938,720 - $980,200
Confidence: 20%
...

=== All Tests Complete ===
```

---

## 🔑 Going Production: Real Data

Replace mock data in `api/cma.js` → `generateMockComps()` with:

### Option A: RentCast (easiest)
```bash
npm i node-fetch
```
```js
// api/cma.js
const RENTCAST_KEY = process.env.RENTCAST_API_KEY;
async function getRealComps(subject) {
  const res = await fetch(
    `https://api.rentcast.io/v1/sales?latitude=${subject.latitude}&longitude=${subject.longitude}&radius=0.5&limit=50`,
    { headers: { 'X-Api-Key': RENTCAST_KEY } }
  );
  return (await res.json()).map(toCompRecord);
}
```

### Option B: MLS PIN (RESO)
```js
// Requires RETS/RESO client + participant credentials
const mls = await resoClient.query({
  resource: 'Property',
  filter: `Latitude ge ${lat-0.01} and Latitude le ${lat+0.01} and Longitude ge ${lon-0.01} and Longitude le ${lon+0.01} and StandardStatus eq 'Sold' and CloseDate ge 2024-01-01`,
  select: 'ListPrice,ClosePrice,BedroomsTotal,BathroomsTotalInteger,BuildingAreaTotal,YearBuilt,Latitude,Longitude'
});
```

### Option C: ATTOM
```js
const ATTOM_KEY = process.env.ATTOM_API_KEY;
// Similar to RentCast but different endpoint/fields
```

**Environment variables (Vercel dashboard → Settings → Environment Variables):**
```
RENTCAST_API_KEY=rc_live_xxx
ATTOM_API_KEY=xxx
MLS_PIN_RESO_URL=https://reso.mlspin.com
MLS_PIN_USERNAME=xxx
MLS_PIN_PASSWORD=xxx
```

---

## 📁 Project Structure

```
cma-engine-v0/
├── public/
│   └── index.html          # Single-file PWA (offline-ready)
├── api/
│   └── cma.js              # Vercel Function (GET /api/cma)
├── lib/
│   ├── types.js            # SubjectProperty, CompRecord, MarketContext, MethodResult
│   ├── geocode.js          # Census geocoder + MassGIS BPDA polygons
│   ├── comps.js            # Progressive relaxation (5 steps, min-5 rule)
│   ├── optimizer.js        # Applicability gate → weights → ambiguity resolution
│   ├── provider.js         # Provider abstraction (rentcast, attom, mls_pin, manual, mock)
│   ├── rentcast.js         # RentCast API client
│   ├── attom.js            # ATTOM API client
│   ├── mock.js             # Boston fixtures for dev/backtest
│   ├── manual.js           # Browser localStorage manual entry
│   └── methods/
│       ├── index.js        # Registry + getAllMethods()
│       ├── salesComparison.js
│       ├── pricePerSqft.js
│       ├── hedonic.js
│       ├── repeatSales.js
│       ├── listToSale.js
│       ├── domAbsorption.js
│       ├── externalAvm.js
│       ├── medianTrend.js
│       ├── costApproach.js
│       └── incomeApproach.js
├── test-runner.mjs         # Full integration test
├── vercel.json             # Vercel config
└── package.json            # ES modules
```

---

## 🎯 Key Features

| Feature | Status |
|---------|--------|
| **Free geocoding** (Census) | ✅ |
| **Boston micro-markets** (23 BPDA neighborhoods) | ✅ |
| **Progressive comp relaxation** (5 steps) | ✅ |
| **Min-5 comp rule** with explanations | ✅ |
| **10 valuation methods** | ✅ |
| **Ensemble optimizer** (weights + ambiguity trim) | ✅ |
| **Natural-language explanations** | ✅ |
| **Single-file PWA** (offline, map, charts) | ✅ |
| **Vercel-ready** (API + static) | ✅ |
| **Provider abstraction** (swap mock→real) | ✅ |
| **Manual entry fallback** | ✅ |

---

## 🛣️ Roadmap

- [ ] Accuracy ledger (SQLite → prediction vs actual → weight updates)
- [ ] RentCast/ATTOM/MLS PIN provider implementations
- [ ] PDF report generation
- [ ] Multi-family / condo specific comp selectors
- [ ] Renovation / effective age handling
- [ ] CI/CD + backtest suite

---

## 📄 License

MIT — use freely, attribute if you can.

---

*Built for the Boston pilot. Questions? Open an issue or ping the team.*