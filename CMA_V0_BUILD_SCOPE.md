# CMA Engine — V0 Build Scope (Build-Ready)

> **Goal:** Ship a working CMA tool in 3-4 days that generates first revenue.
> **Constraint:** No new repos until current apps launch. This is a spec document only.

---

## What V0 Does

A listing agent enters a property address → the engine pulls comps from RentCast API → runs 3 valuation methods → displays an estimate + range + comp table on a web page.

**That's it.** No optimizer, no monitoring, no PDF, no MLS credentials, no PostGIS.

---

## User Flow (3 screens)

```
Screen 1: Input
  → Address input (text, geocoded via RentCast)
  → Price range (min/max, optional — engine can infer)
  → Property status (default: Sold, 6-month lookback)
  → Submit

Screen 2: Processing
  → "Pulling comps..." spinner
  → Shows steps: fetching comps → running methods → computing estimate

Screen 3: Results
  → Estimated value (point + range)
  → Confidence indicator (low/medium/high based on comp count)
  → Comp table (address, sold price, $/sqft, beds/baths, sqft, distance, sold date)
  → Per-method breakdown (3 rows, each showing estimate + 1-line explanation)
  → "Download as PDF" (browser print-to-PDF, not custom gen)
  → Lead capture: "Want monitoring alerts? Enter your email."
```

---

## Tech Stack (Minimal)

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | Single-file HTML PWA | Your home turf, fastest path, deployable to Vercel |
| Backend | Vercel serverless functions | Already have Vercel, no new infra |
| Database | Supabase (existing) | Store CMAs, lead captures, accuracy ledger seed |
| Data API | RentCast (free tier: 50 calls/mo) | No MLS credentials, covers Boston, has sold comps |
| Geocoding | RentCast (address → lat/lon) | Included in API, no second service |
| PDF | Browser print CSS | Zero implementation cost |

---

## The 3 Methods (V0)

### Method 1: Sales Comparison (Adjusted Comps)
- Pull 5-10 nearest sold comps from RentCast
- Average sold price, adjusted by $/sqft differential
- Output: point estimate + comp list

### Method 2: Price-per-Square-Foot
- Compute median $/sqft from comps
- Multiply by subject property sqft
- Output: $/sqft-based estimate

### Method 3: Neighborhood Median Trend
- Compute median sold price of all comps
- Apply ±5% band for range
- Output: median-based estimate + range

### Combined Output
- Simple weighted average: 50% Method 1, 30% Method 2, 20% Method 3
- Range = min-max of all 3 estimates
- Confidence = high (≥7 comps), medium (4-6 comps), low (<4 comps)

---

## Data Model (Supabase)

```sql
-- cma_reports table
CREATE TABLE cma_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP DEFAULT NOW(),
  subject_address TEXT NOT NULL,
  subject_lat FLOAT,
  subject_lon FLOAT,
  subject_price_min FLOAT,
  subject_price_max FLOAT,
  status_filter TEXT DEFAULT 'sold',
  lookback_days INT DEFAULT 180,
  comps JSONB NOT NULL,           -- array of comp objects from RentCast
  method_results JSONB NOT NULL,  -- { method1: {...}, method2: {...}, method3: {...} }
  final_estimate FLOAT,
  final_range_low FLOAT,
  final_range_high FLOAT,
  confidence TEXT,                -- high | medium | low
  comp_count INT,
  lead_email TEXT,                -- null until captured
  created_by TEXT                 -- agent email or anonymous
);

-- accuracy_ledger table (seed for V2)
CREATE TABLE accuracy_ledger (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cma_report_id UUID REFERENCES cma_reports(id),
  predicted_price FLOAT NOT NULL,
  actual_price FLOAT,             -- null until sold
  error_pct FLOAT,                -- computed when actual populated
  within_5pct BOOLEAN,
  within_10pct BOOLEAN,
  resolved_at TIMESTAMP
);
```

---

## API Endpoints (Vercel Serverless)

```
POST /api/cma
  Body: { address, price_min?, price_max?, status?, lookback_days? }
  → Geocodes address via RentCast
  → Fetches comps (sold properties within radius + filters)
  → Runs 3 methods
  → Stores result in Supabase
  → Returns: { estimate, range_low, range_high, confidence, comps, methods }

POST /api/lead
  Body: { cma_id, email }
  → Updates cma_reports.lead_email
  → Returns: { success: true }

GET /api/cma/:id
  → Returns stored CMA report by ID
```

---

## File Structure

```
cma-engine-v0/
├── index.html              # Single-file PWA (input → results → PDF)
├── api/
│   ├── cma.js              # POST handler (RentCast + methods + Supabase)
│   └── lead.js             # Lead capture handler
├── lib/
│   ├── rentcast.js         # RentCast API client
│   ├── methods.js          # 3 valuation methods
│   └── supabase.js         # Supabase client (anon key)
├── .env.example            # RENTCAST_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
├── vercel.json            # Rewrites + function config
└── package.json           # Minimal deps
```

---

## RentCast API (What to Call)

```
GET https://api.rentcast.io/v1/properties/sale
  ?address={address}
  → Returns: property details + avm estimate

GET https://api.rentcast.io/v1/properties
  ?city={city}&state={MA}&status=sold&limit=50
  → Returns: array of sold properties in area

GET https://api.rentcast.io/v1/properties/sale/comparables
  ?address={address}&radius=2&limit=10
  → Returns: comparable sold properties (THIS IS THE KEY ENDPOINT)
```

## Dependencies (package.json)

```json
{
  "name": "cma-engine-v0",
  "dependencies": {
    "@supabase/supabase-js": "^2.0.0"
  }
}
```

That's it. One dependency. RentCast calls are plain fetch().

---

## .env.example

```env
# RentCast (free tier: 50 calls/mo — https://app.rentcast.io/apiaccess)
RENTCAST_API_KEY=

# Supabase (existing project)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

---

## Build Order (3-4 Days)

### Day 1: Data Layer + Methods
- [ ] RentCast API key (free signup, 5 min)
- [ ] Test comparables endpoint with Boston address
- [ ] Write `lib/rentcast.js` — fetch comps, normalize to common shape
- [ ] Write `lib/methods.js` — 3 methods, each takes comps + subject → returns estimate
- [ ] Write `api/cma.js` — orchestrates: geocode → comps → methods → store
- [ ] Test: curl POST /api/cma with a Boston address → get JSON back

### Day 2: Frontend
- [ ] `index.html` — input form (address, price range, status)
- [ ] Loading state ("Pulling comps...")
- [ ] Results view (estimate, range, confidence badge, comp table)
- [ ] Per-method breakdown accordion
- [ ] Mobile-responsive, clean design

### Day 3: Polish + Deploy
- [ ] Print CSS for PDF export (browser print-to-PDF)
- [ ] Lead capture form (email → /api/lead)
- [ ] Deploy to Vercel
- [ ] Run SQL migration in Supabase (cma_reports + accuracy_ledger)
- [ ] End-to-end test: live address → CMA → PDF → lead capture

### Day 4 (Buffer): Fixes + Gumroad
- [ ] Fix any edge cases (thin comps, weird addresses)
- [ ] Create Gumroad product ($29 one-time or $9/mo)
- [ ] Wire license key validation (HES- prefix, same pattern as Hestia)
- [ ] Test purchase flow

---

## V0 Acceptance Criteria

1. ✅ Enter a Boston address → get a CMA with ≥5 comps
2. ✅ See 3 method estimates + combined range
3. ✅ Confidence indicator based on comp count
4. ✅ Print to PDF (clean layout)
5. ✅ Lead email capture works
6. ✅ Deployed to Vercel, accessible via URL
7. ✅ RentCast calls cached (avoid burning 50/mo limit)

---

## What V0 Deliberately Excludes

| Feature | Phase | Why |
|---------|-------|-----|
| Optimizer engine (applicability gate, learned weights) | V3 | Needs historical data to calibrate |
| Monitoring + alerts | V2 | Subscription upsell, not V0 |
| MLS PIN data | V1 | Credentials needed, paperwork takes weeks |
| PostGIS / micro-market polygons | V1 | RentCast radius is good enough for V0 |
| Vision condition scoring | V4 | Claude API cost, not needed for comps |
| Remaining 7 methods | V2-V4 | Methods 1-3 cover 80% of value |
| Backtesting harness | V2 | Needs historical solds dataset |
| Agent login / multi-tenant | V1 | Lead capture first, accounts later |
| Branded PDF | V1 | Print-to-PDF works for V0 |

---

## Phase Sequencing (Revenue-First)

| Phase | What | Days | Revenue |
|-------|------|------|---------|
| **V0** | 3 methods, RentCast, lead capture, print PDF | 3-4 | Free → lead gen |
| **V1** | Add agent login, MLS PIN data, branded PDF, 4th method | 10-12 | $29-49/mo per agent |
| **V2** | Monitoring + alerts, backtest harness, 2 more methods | 15-20 | $99/mo per agent |
| **V3** | Optimizer engine (applicability gate, learned weights, ambiguity resolution) | 20-25 | $199/mo or enterprise |
| **V4** | Vision scoring, remaining methods, multi-metro, white-label | 30-40 | Enterprise pricing |

**V0 → first revenue in under a week. Full platform in V3-V4.**
