# Instant CMA — User Manual

**Boston Comparative Market Analysis Engine**  
Version 0.1.0 | July 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Running a CMA](#running-a-cma)
4. [Understanding the Report](#understanding-the-report)
5. [Valuation Methods Explained](#valuation-methods-explained)
6. [The Optimizer](#the-optimizer)
7. [Comp Selection & Relaxation](#comp-selection--relaxation)
8. [Data Sources & Coverage](#data-sources--coverage)
9. [Configuration](#configuration)
10. [Troubleshooting](#troubleshooting)
11. [API Reference](#api-reference)
12. [Development](#development)

---

## Overview

**Instant CMA** is a Boston-focused Comparative Market Analysis engine that combines 10 valuation methodologies into a single, explainable estimate. Designed for agents, investors, and lenders who need instant, defensible property valuations with full transparency.

### What Makes It Different

| Traditional CMA | Instant CMA |
|-----------------|-------------|
| 3-5 comps, manual adjustments | 10 methods, algorithmic ensemble |
| Single "best guess" | Point estimate + range + confidence |
| Black-box adjustments | Full audit trail per method |
| Agent-dependent quality | Consistent, auditable, explainable |
| Hours to produce | Seconds |

### Core Philosophy

> **"Every estimate should be explainable. Every adjustment should be traceable. Every assumption should be visible."**

---

## Getting Started

### Prerequisites

- Node.js 18+ (for local development)
- Vercel account (for deployment)
- Modern browser (Chrome, Firefox, Safari, Edge)

### Quick Access

| Environment | URL |
|-------------|-----|
| **Production PWA** | `https://cma-deploy-tau.vercel.app` |
| **API Endpoint** | `https://cma-deploy-tau.vercel.app/api/cma?address=...` |
| **Local Dev** | `http://localhost:3000` (after `npx vercel dev`) |

### Installation (Local)

```bash
git clone https://github.com/GibGitGib/cma-engine-v0.git
cd cma-engine-v0
npm install
npx vercel dev
```

Open `http://localhost:3000` — the PWA loads instantly, works offline after first visit.

---

## Running a CMA

### Web Interface (PWA)

1. Open the PWA URL
2. Enter a **Boston address** (e.g., `500 Commonwealth Ave, Boston, MA 02215`)
3. Click **Generate CMA**
4. Wait 2-4 seconds for the full report

**Optional fields** (auto-filled from public records if omitted):
- Property Type: Single Family / Condo / 2-Family / 3-Family / 4+ Family
- Square Feet
- Bedrooms / Bathrooms

### API (Programmatic)

```bash
# Basic
curl "https://cma-deploy-tau.vercel.app/api/cma?address=500+Commonwealth+Ave,+Boston,+MA+02215"

# With property type hint
curl "https://cma-deploy-tau.vercel.app/api/cma?address=123+Main+St,+Boston,+MA+02118&propertyType=condo"
```

**Response:** Full JSON report (see [API Reference](#api-reference))

### Supported Address Formats

| Format | Example |
|--------|---------|
| Street + City + State + ZIP | `123 Main St, Boston, MA 02118` |
| Street + City + State | `500 Commonwealth Ave, Boston, MA` |
| Street + ZIP | `25 Beacon St, 02108` |

**Coverage:** All Boston neighborhoods (23 BPDA planning districts). Addresses outside Boston proper return the nearest district or `unknown`.

---

## Understanding the Report

### Report Sections

```
┌─────────────────────────────────────────────────────────────┐
│  SUBJECT PROPERTY                                           │
│  500 Commonwealth Ave, Boston, MA 02215                     │
│  Fenway/Kenmore • 42.3487, -71.0950 • Single • 1,800 sqft  │
│  3 bed / 2 bath • Built ~1950 • Condition: 4/5             │
├─────────────────────────────────────────────────────────────┤
│  ESTIMATED MARKET VALUE                                     │
│  $979,848                                                    │
│  Range: $938,720 – $980,200    Confidence: 20%             │
├─────────────────────────────────────────────────────────────┤
│  METHOD BREAKDOWN                                           │
│  ✅ Sales Comparison     $972,500  (78%)  5 comps           │
│  ✅ Price/SqFt           $938,720  (98%)  5 comps           │
│  ✅ Hedonic Regression   $980,200  (99%)  1,500 sales       │
│  ❌ Repeat Sales         N/A       —       No prior sales   │
│  ❌ List-to-Sale         N/A       —       No actives       │
│  ❌ DOM/Absorption       N/A       —       No base estimate │
│  ✅ External AVM         $950,000  (99%)  Zillow + Redfin   │
│  ✅ Median Trend         $1,057,822 (75%)  Seasonal 5-mo    │
│  ✅ Cost Approach        $382,400  (40%)  Land + depreciation│
│  ❌ Income Approach      N/A       —       Not multi-family │
├─────────────────────────────────────────────────────────────┤
│  OPTIMIZER EXPLANATION                                      │
│  "Optimizer combined 6 applicable methods... Ambiguity      │
│  detected: 76.7% spread. Outliers trimmed: costApproach..." │
├─────────────────────────────────────────────────────────────┤
│  COMP SELECTION                                             │
│  "Found 7 qualifying comps... Minimum of 5 met.            │
│  Constraints relaxed: none. Impact on confidence: minimal." │
└─────────────────────────────────────────────────────────────┘
```

### Key Fields Explained

| Field | Meaning |
|-------|---------|
| **Polygon ID** | Boston micro-market (BPDA neighborhood). E.g., `fenway-kenmore`, `south-end`, `beacon-hill` |
| **Point Estimate** | Optimizer's single best number |
| **Range** | Low/high bounds from applicable methods |
| **Confidence** | 0-100% — how tightly methods agree (lower = more spread) |
| **Method Weights** | % influence each method had on final estimate |
| **Ambiguity** | Whether methods disagreed significantly (>15% spread triggers trim) |

---

## Valuation Methods Explained

### 1. Sales Comparison (Adjusted Comps) — *Industry Standard*
**What it does:** Finds 5 closest sold comps, applies dollar adjustments for sqft, beds, baths, condition, lot size, age.
**When it works:** Adequate recent sales in same micro-market.
**Strengths:** Defensible, transparent, familiar to agents/sellers.
**Weaknesses:** Subjective adjustment factors; fails in thin markets.

### 2. Price-per-Square-Foot — *Robust Baseline*
**What it does:** Neighborhood $/sqft (weighted mean + median) × subject sqft.
**When it works:** Almost always — needs only sqft on comps.
**Strengths:** Minimal adjustments, stable in small samples.
**Weaknesses:** Ignores layout, condition, lot, view.

### 3. Hedonic Regression — *Statistical Rigor*
**What it does:** Multivariate regression on 1,500+ metro sales: `Price = β₀ + β₁×sqft + β₂×beds + β₃×baths + β₄×age + β₅×condition + ...`
**When it works:** High-volume areas with stable coefficients.
**Strengths:** Quantifies each feature's value, uses all data.
**Weaknesses:** Opaque to lay users, assumes linear relationships.

### 4. Repeat Sales / HPI — *Time-Adjusted*
**What it does:** Indexes prior sales of subject or comps forward using FHFA/Case-Shiller HPI.
**When it works:** Subject has prior sale; or comps have multiple sales.
**Strengths:** Pure market movement, no physical adjustments.
**Weaknesses:** Rarely enough repeat transactions.

### 5. List-to-Sale Ratio — *Forward-Looking*
**What it does:** Current actives × neighborhood sale/list ratio (typically 0.97-0.99).
**When it works:** Active inventory in micro-market.
**Strengths:** Captures current buyer sentiment.
**Weaknesses:** Actives may be overpriced; ratio varies.

### 6. DOM / Absorption — *Velocity Adjustment*
**What it does:** Adjusts base estimate for days-on-market trend and months of inventory.
**When it works:** Sufficient active + sold data for DOM stats.
**Strengths:** Captures market momentum.
**Weaknesses:** Lagging indicator.

### 7. External AVM Cross-Check — *Independent Signal*
**What it does:** Averages Zillow Zestimate + Redfin Estimate (when available).
**When it works:** Property in AVM coverage area.
**Strengths:** Free second opinion, independent methodology.
**Weaknesses:** Black box, ToS restrictions, known error tails.

### 8. Median Trend — *Market Baseline*
**What it does:** Seasonally-adjusted 5-month rolling median for the micro-market, projected forward.
**When it works:** Always — uses all micro-market sales.
**Strengths:** Stable, uses all data, seasonal adjustment.
**Weaknesses:** Blind to subject specifics, lags turning points.

### 9. Cost Approach — *Floor Value*
**What it does:** Land value + (sqft × replacement cost × (1 - depreciation)).
**When it works:** Unique/low-comp properties; new construction.
**Strengths:** Objective components, works when comps don't exist.
**Weaknesses:** Poor proxy for market behavior in hot metros, land value estimation error, depreciation subjective.

### 10. Income Approach (GRM/Cap Rate) — *Investor Lens*
**What it does:** `Price = Monthly Rent × GRM` or `NOI / Cap Rate`.
**When it works:** Multi-family, investor-owned, rental comps available.
**Strengths:** Directly relevant to buyer pool for income properties.
**Weaknesses:** Requires rent data; GRM/Cap Rate vary by submarket.

---

## The Optimizer

### Pipeline

```
10 Methods → Applicability Gate → Weighted Ensemble → Ambiguity Check → Final Estimate
```

### Applicability Gate

Each method declares `success: true/false`. Failed methods get **zero weight**.

### Weighting

| Factor | Weight |
|--------|--------|
| Base | Equal (1/n) |
| Confidence | × method.confidence |
| Comps used | × log(compsUsed + 1) |
| Recency | × exponential decay on comp sale dates |

### Ambiguity Resolution

- **Spread > 15%:** Trim outliers (methods >2σ from median)
- **Conflicting methods flagged:** Named in explanation
- **Final confidence:** Reduced proportionally to remaining spread

### Explanation Generation

Natural-language narrative covering:
- Number of applicable methods
- Top 3 methods by weight
- Any outliers trimmed
- Ambiguity level
- Final confidence rationale

---

## Comp Selection & Relaxation

### Progressive Relaxation Ladder (5 Steps)

| Step | Criteria | Typical Yield |
|------|----------|---------------|
| 1 | Same polygon, same type, ±20% sqft, 90 days | 0-3 |
| 2 | Same polygon, same type, ±20% sqft, 180 days | +2-5 |
| 3 | Adjacent polygons, same type, ±20% sqft, 180 days | +3-8 |
| 4 | Same type, ±30% sqft, 180 days, any polygon | +5-15 |
| 5 | Radius fallback (1-5 miles), same type, 180 days | +10-25 |

### Min-5 Rule

- **≥5 comps:** High confidence, minimal relaxation explanation
- **<5 comps:** Full relaxation trace, confidence penalty, range widened

### Comp Quality Filters

- Status = `sold`
- Sale date ≤ 180 days ago
- Same property type
- Valid coordinates for distance calc
- Valid sale price > $0

---

## Data Sources & Coverage

| Source | Coverage | Status | Key |
|--------|----------|--------|-----|
| **US Census Geocoder** | Nationwide | ✅ Free, no key | Geocoding |
| **MassGIS BPDA Neighborhoods** | Boston (23 districts) | ✅ Bundled GeoJSON | Polygons |
| **Mock Provider** | Boston fixtures | ✅ Dev/backtest | 10 comps, 3 subjects |
| **RentCast API** | National | ⏳ Needs key | Sales, rent, property data |
| **ATTOM Data** | National | ⏳ Needs key | Sales, assessment, property |
| **MLS PIN (RESO)** | Greater Boston | ⏳ Needs creds | Gold-standard MLS |
| **Manual Entry** | Any | ✅ Browser localStorage | Agent-entered comps |

### Neighborhood Coverage (Boston)

| Polygon ID | Name | Typical Base Price |
|------------|------|-------------------|
| `back-bay` | Back Bay | $1.3M |
| `beacon-hill` | Beacon Hill | $1.35M |
| `south-end` | South End | $950K |
| `fenway-kenmore` | Fenway/Kenmore | $850K |
| `charlestown` | Charlestown | $900K |
| `south-boston` | South Boston | $800K |
| `jamaica-plain` | Jamaica Plain | $750K |
| `brighton` | Brighton | $650K |
| `dorchester` | Dorchester | $550K |
| `roxbury` | Roxbury | $650K |
| `east-boston` | East Boston | $550K |
| `west-roxbury` | West Roxbury | $550K |
| `hyde-park` | Hyde Park | $450K |
| `mattapan` | Mattapan | $450K |
| ... | +9 more | ... |

---

## Configuration

### Environment Variables (Vercel)

| Variable | Required | Description |
|----------|----------|-------------|
| `RENTCAST_API_KEY` | No | RentCast production key |
| `ATTOM_API_KEY` | No | ATTOM Data API key |
| `MLS_PIN_RESO_URL` | No | RESO endpoint URL |
| `MLS_PIN_USERNAME` | No | MLS participant ID |
| `MLS_PIN_PASSWORD` | No | MLS password |

### Feature Flags (in `api/cma.js`)

```js
const USE_MOCK = true;           // Set false when real keys configured
const MIN_COMPS = 5;             // Min comp threshold
const LOOKBACK_DAYS = 180;       // Sale recency window
const MAX_RELAXATION_STEPS = 5;  // Ladder depth
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `"Address not found"` | Typo, outside Census coverage | Verify address; try street + ZIP only |
| `polygonId: "unknown"` | Address outside Boston | Tool limited to Boston proper |
| All methods fail | No mock comps for polygon | Check `mock.js` has fixtures for that polygon |
| Low confidence (<20%) | Wide method spread | Normal for unique properties; cost approach often outlier |
| Cost approach << others | Old property (high depreciation) | Expected for 100+ yr homes; cost is floor, not market |
| API 500 | Missing module in Vercel | Ensure `vercel.json` includes `includeFiles: "lib/**"` |
| PWA won't load offline | Service worker not registered | Visit once online, then refresh offline |

---

## API Reference

### `GET /api/cma`

**Parameters:**
- `address` (required, string) — URL-encoded address
- `geocoder` (optional, `census` | `google`) — Default `census`
- `googleApiKey` (optional) — Required if `geocoder=google`

**Response:** JSON object (see [Quick Start](#api-reference) for full schema)

**Rate Limits:** 100 req/min per IP (Vercel default)

**CORS:** Enabled for all origins

---

## Development

### Run Tests

```bash
node --experimental-specifier-resolution=node test-runner.mjs
```

### Add a Valuation Method

1. Create `lib/methods/myMethod.js`:
```js
import { MethodResult } from '../types.js';

export function myMethod(subject, comps, marketData) {
  // ... logic
  return new MethodResult({ success: true, estimate, range, confidence, ... });
}
```

2. Register in `lib/methods/index.js`:
```js
import { myMethod } from './myMethod.js';
export const METHOD_REGISTRY = { ..., myMethod };
export function getAllMethods() { return Object.values(METHOD_REGISTRY); }
```

### Add a Data Provider

1. Implement `provider.js` interface:
```js
export const myProvider = {
  name: 'myprovider',
  requiresCredentials: true,
  async getComps(subject, criteria) { ... },
  async getMarketData(polygonId) { ... }
};
```

2. Register in `lib/provider.js`:
```js
export const PROVIDERS = { ..., myProvider };
```

---

## License

MIT — Free for commercial use. Attribution appreciated.

---

*Built for the Boston pilot. For questions, feature requests, or production deployment support, open an issue or contact the CoreTech team.*