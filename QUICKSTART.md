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

## 🏗️ Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Address       │────▶│  Census Geocoder │────▶│  Polygon ID     │
│   (user input)  │     │  (free, no key)  │     │  (BPDA hood)    │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   CMA Report    │◀────│  Optimizer       │◀────│  10 Methods     │
│   (HTML/JSON)   │     │  (ensemble)      │     │  (parallel)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                          │
                                    ┌─────────────────────┼─────────────────────┐
                                    ▼                     ▼                     ▼
                            ┌───────────────┐     ┌───────────────┐     ┌───────────────┐
                            │ Sales Comp    │     │ $/sqft        │     │ Hedonic       │
                            │ (adjusted)    │     │ (weighted)    │     │ (regression)  │
                            └───────────────┘     └───────────────┘     └───────────────┘
                                    │                     │                     │
                            ┌───────────────┐     ┌───────────────┐     ┌───────────────┐
                            │ Repeat Sales  │     │ List-to-Sale  │     │ DOM/Absorp.   │
                            │ (HPI)         │     │ (ratio)       │     │ (velocity)    │
                            └───────────────┘     └───────────────┘     └───────────────┘
                                    │                     │                     │
                            ┌───────────────┐     ┌───────────────┐     ┌───────────────┐
                            │ External AVM  │     │ Median Trend  │     │ Cost Approach │
                            │ (Zillow/Redfin)│     │ (seasonal)    │     │ (land+cost)   │
                            └───────────────┘     └───────────────┘     └───────────────┘
                                    │                     │                     │
                            ┌───────────────┐
                            │ Income (GRM)  │
                            │ (multi-fam)   │
                            └───────────────┘
```

---

## 📁 Project Structure

```
cma-engine-v0/
├── api/
│   └── cma.js              # Vercel Function: GET /api/cma?address=...
├── lib/
│   ├── geocode.js          # Census geocoder + MassGIS polygons
│   ├── comps.js            # Progressive relaxation (min-5 rule)
│   ├── optimizer.js        # Applicability → weights → ambiguity
│   ├── types.js            # SubjectProperty, CompRecord, MarketContext
│   ├── methods/            # 10 valuation modules
│   │   ├── salesComparison.js
│   │   ├── pricePerSqft.js
│   │   ├── hedonic.js
│   │   ├── repeatSales.js
│   │   ├── listToSale.js
│   │   ├── domAbsorption.js
│   │   ├── externalAvm.js
│   │   ├── medianTrend.js
│   │   ├── costApproach.js
│   │   └── incomeApproach.js
│   ├── provider.js         # Provider abstraction (RentCast/MLS/Manual)
│   ├── rentcast.js         # RentCast API client
│   ├── attom.js            # ATTOM API client
│   ├── mock.js             # Boston fixtures for dev
│   └── data/
│       └── ma-neighborhoods.geojson  # 25 BPDA polygons
├── public/
│   └── index.html          # Single-file PWA (offline-ready)
├── test-runner.mjs         # Integration test suite
├── vercel.json             # Vercel config
└── package.json            # "type": "module"
```

---

## 🔧 Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `RENTCAST_API_KEY` | No* | RentCast API key for live comps |
| `ATTOM_API_KEY` | No* | ATTOM Data API key |
| `GOOGLE_GEOCODER_KEY` | No | Google Maps Geocoding (fallback) |

\* **Mock provider works out of the box** — add keys to swap live data.

**Local dev:** Create `.env` at repo root:
```bash
RENTCAST_API_KEY=rc_live_xxx
ATTOM_API_KEY=attom_xxx
```

**Vercel:** Add in Project Settings → Environment Variables.

---

## 📡 API Reference

### `GET /api/cma`

**Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `address` | string | **Yes** | — | Boston address (any format Census understands) |
| `geocoder` | string | No | `census` | `census` \| `google` |
| `googleApiKey` | string | No | — | Required if `geocoder=google` |

**Response (abridged):**
```json
{
  "address": "500 COMMONWEALTH AVE, BOSTON, MA, 02215",
  "polygonId": "fenway/kenmore",
  "coordinates": { "lat": 42.3487, "lon": -71.0950 },
  "property": { "type": "single", "sqft": 1800, "beds": 3, "baths": 2, "yearBuilt": 1950, "condition": 3 },
  "comps": { "selected": 7, "explanation": "Found 7 qualifying comps..." },
  "methods": {
    "salesComparison": { "estimate": 785000, "range": { "low": 745000, "high": 825000 }, "confidence": 0.78, "compsUsed": 7, "rationale": "..." },
    "pricePerSqft": { ... },
    "hedonic": { ... },
    ...
  },
  "estimate": {
    "point": 792000,
    "range": { "low": 750000, "high": 835000 },
    "confidence": 0.65,
    "explanation": "Optimizer combined 6 applicable methods...",
    "methodWeights": { "salesComparison": 0.17, "pricePerSqft": 0.17, ... }
  },
  "meta": { "timestamp": "2026-07-22T...", "version": "0.1.0" }
}
```

---

## 🧪 Running Tests

```bash
# Full integration test (engine + geocoding + optimizer)
node --experimental-specifier-resolution=node test-runner.mjs

# Expected: 6/10 methods succeed (4 need live data), optimizer produces point estimate + explanation
```

---

## 🔄 Swapping Mock → Live Data

Edit `api/cma.js`, replace `generateMockComps()`:

```javascript
// RentCast live comps
import { fetchSales } from '../lib/rentcast.js';
const comps = await fetchSales({
  latitude: subject.latitude,
  longitude: subject.longitude,
  radius: 0.5,
  limit: 50,
  status: 'sold',
  daysBack: 180
});

// Or MLS PIN (requires participant credentials)
// import { mlsPinProvider } from '../lib/provider.js';
// const comps = await mlsPinProvider.getComps(subject, { radius: 1, daysBack: 180 });
```

The rest of the pipeline (selection → methods → optimizer) stays identical.

---

## 📱 PWA Features

- **Offline-first** — Service Worker caches shell + API responses
- **Installable** — "Add to Home Screen" on iOS/Android
- **Responsive** — Works on mobile, tablet, desktop
- **Map** — Leaflet + Mapbox dark style (demo token included)

---

## 🐛 Troubleshooting

| Issue | Fix |
|-------|-----|
| `addressToSubjectProperty` returns `unknown` polygon | Address outside Boston metro — expand `ma-neighborhoods.geojson` |
| CORS error on API call | Ensure `vercel.json` routes `/api/*` to `@vercel/node` |
| Methods return `FAILED` | Expected for repeatSales/listToSale/domAbsorption/income without live data |
| Low confidence (<20%) | Cost approach outlier (old homes) — add renovation year to condition logic |

---

## 📄 License

MIT — see `LICENSE` file.

---

## 🔗 Links

- **Repo:** https://github.com/GibGitGib/cma-engine-v0
- **Deployed (when pushed):** `https://cma-engine-v0.vercel.app`
- **RentCast API:** https://rentcast.io/api
- **MassGIS BPDA Neighborhoods:** https://services.massgis.state.ma.us/arcgis/rest/services/Boundaries/BPDA_Neighborhoods/MapServer

---

*Generated for CoreTech pre-launch sprint — July 2026*