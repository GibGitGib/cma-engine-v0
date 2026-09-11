// Sales Comparison Approach (Adjusted Comps)
// Classic CMA: nearest sold comps with dollar adjustments for deltas

import { MethodResult } from '../types.js';

// Standard adjustment factors (per-bed, per-bath, condition, etc.)
// `sqft` is intentionally absent here — it is derived per micro-market by
// resolveAdjustments() below.
const ADJUSTMENTS = {
  bed: 10000,          // per bedroom
  bath: 15000,         // per bathroom (full)
  halfBath: 5000,      // per half bath
  condition: 20000,    // per condition point (1-5)
  age: 500,            // per year effective age
  lotSqft: 2,          // per lot sqft
  garage: 15000,       // per garage space
};

// Marginal square footage is worth less than average square footage — buyers
// don't pay the full market rate for incremental space — so appraisal practice
// puts the sqft adjustment near half of local $/sqft. Deriving it from the
// micro-market beats a hardcoded constant: the previous flat $100/sqft badly
// under-adjusted Boston, where $/sqft runs several times that, and the sqft
// delta is the single largest driver of the final number (and therefore of the
// 90%-within-tolerance KPI).
const SQFT_ADJUSTMENT_RATIO = 0.5;
const FALLBACK_PPSF = 400; // conservative floor when market data is unavailable

function resolveAdjustments(subject, marketData) {
  const ppsf =
    marketData?.ppsfiByPolygon?.[subject.polygonId] ??
    marketData?.microMarketStats?.[subject.polygonId]?.ppsf ??
    FALLBACK_PPSF;
  const sqft = Math.round((Number(ppsf) || FALLBACK_PPSF) * SQFT_ADJUSTMENT_RATIO);
  return { ...ADJUSTMENTS, sqft, _ppsfBasis: Number(ppsf) || FALLBACK_PPSF };
}

export function salesComparison(subject, comps, marketData) {
  // Filter comps: sold, usable attributes, similar property type.
  // NOTE: deliberately does NOT re-filter on polygonId. selectComps() runs a
  // progressive relaxation ladder that reaches into adjacent micro-markets on
  // purpose; re-excluding those here threw away the comps the ladder just found
  // and made this method fail in exactly the thin markets it was meant to cover.
  // Locality is applied as a preference in similarityScore() instead.
  const MAX_AGE_DAYS = 365; // sanity bound only — selectComps owns the lookback
  let qualified = comps.filter(c =>
    c.status === 'sold' &&
    c.saleDate &&
    daysSince(c.saleDate) <= MAX_AGE_DAYS &&
    c.sqft &&
    c.salePrice &&
    propertyTypeMatch(c.propertyType, subject.propertyType)
  );

  if (qualified.length < 3) {
    return MethodResult.failure(`Insufficient qualified comps (${qualified.length}/3 min)`);
  }

  // Sort by similarity score (composite of proximity, sqft, beds, recency)
  const adjustments = resolveAdjustments(subject, marketData);
  qualified = qualified.map(c => ({
    ...c,
    similarity: similarityScore(subject, c),
    adjustments: computeAdjustments(subject, c, adjustments),
  })).sort((a, b) => b.similarity - a.similarity);

  // Take top 5-7 comps
  const topComps = qualified.slice(0, 7);

  // Adjusted prices
  const adjusted = topComps.map(c => ({
    ...c,
    adjustedPrice: c.salePrice + c.adjustments.total,
    daysSinceSale: daysSince(c.saleDate),
  }));

  // Weighted median of adjusted prices (weight by recency)
  const weightedValues = [];
  adjusted.forEach(a => {
    const w = Math.max(1, Math.round(365 / (a.daysSinceSale + 1)));
    for (let i = 0; i < w; i++) weightedValues.push(a.adjustedPrice);
  });
  weightedValues.sort((x, y) => x - y);
  const estimate = weightedValues[Math.floor(weightedValues.length / 2)];

  // Range from adjusted price spread
  const prices = adjusted.map(a => a.adjustedPrice).sort((a, b) => a - b);
  const rangeLow = prices[Math.floor(prices.length * 0.25)];
  const rangeHigh = prices[Math.floor(prices.length * 0.75)];

  // Confidence: more comps, tighter spread, more recent = higher
  const spread = (rangeHigh - rangeLow) / estimate;
  const recencyAvg = adjusted.reduce((s, a) => s + a.daysSinceSale, 0) / adjusted.length;
  const confidence = Math.max(0, 1 - spread - recencyAvg / 365) * Math.min(1, adjusted.length / 5);

  return MethodResult.success({
    method: 'sales_comparison',
    label: 'Sales Comparison Approach (Adjusted Comps)',
    estimate: Math.round(estimate),
    range: { low: Math.round(rangeLow), high: Math.round(rangeHigh) },
    confidence: Math.round(confidence * 100) / 100,
    compsUsed: adjusted.length,
    rationale: `Top ${adjusted.length} sold comps with dollar adjustments for sqft, beds, baths, condition, age, lot and garage. Sqft adjusted at $${adjustments.sqft}/sqft (${Math.round(SQFT_ADJUSTMENT_RATIO*100)}% of the $${Math.round(adjustments._ppsfBasis)}/sqft micro-market rate). Weighted by recency.`,
    strengths: ['Industry standard', 'Defensible with sellers', 'Transparent adjustments'],
    weaknesses: ['Adjustment factors subjective', 'Fails in thin markets', 'Condition scoring variability'],
    details: {
      comps: adjusted.map(a => ({
        address: a.address,
        salePrice: a.salePrice,
        adjustedPrice: Math.round(a.adjustedPrice),
        adjustments: a.adjustments,
        similarity: Math.round(a.similarity * 100),
        daysAgo: a.daysSinceSale,
      })),
      adjustmentFactors: adjustments,
    },
  });
}

function daysSince(dateStr) {
  const d = new Date(dateStr);
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function propertyTypeMatch(a, b) {
  if (!a || !b) return true;
  return a === b || (a === 'condo' && b === 'condo') || (a.startsWith('multi') && b.startsWith('multi'));
}

function similarityScore(subject, comp) {
  let score = 1.0;
  // SQFT proximity
  if (subject.sqft && comp.sqft) {
    const diff = Math.abs(subject.sqft - comp.sqft) / subject.sqft;
    score *= Math.max(0.3, 1 - diff);
  }
  // Beds
  if (subject.beds && comp.beds) {
    score *= Math.max(0.5, 1 - Math.abs(subject.beds - comp.beds) * 0.15);
  }
  // Baths
  if (subject.baths && comp.baths) {
    score *= Math.max(0.5, 1 - Math.abs(subject.baths - comp.baths) * 0.1);
  }
  // Recency (closer = higher)
  const daysAgo = daysSince(comp.saleDate);
  score *= Math.max(0.4, 1 - daysAgo / 365);
  // Locality preference: same micro-market ranks higher, but out-of-polygon
  // comps stay eligible so the relaxation ladder's work is preserved.
  if (subject.polygonId && comp.polygonId) {
    score *= comp.polygonId === subject.polygonId ? 1.0 : 0.75;
  }
  return score;
}

function computeAdjustments(subject, comp, factors = ADJUSTMENTS) {
  const adj = { total: 0, items: [] };

  // Each adjustment moves the COMP's price toward what the SUBJECT would fetch:
  // positive when the subject is superior on that attribute.
  const apply = (field, diff, rate) => {
    if (!diff) return;
    const val = diff * rate;
    adj.total += val;
    adj.items.push({ field, diff, value: val });
  };

  if (subject.sqft && comp.sqft) apply('sqft', subject.sqft - comp.sqft, factors.sqft);
  if (subject.beds && comp.beds) apply('beds', subject.beds - comp.beds, factors.bed);
  if (subject.baths && comp.baths) apply('baths', subject.baths - comp.baths, factors.bath);

  // halfBaths, lot size and garage were declared in the factor table but never
  // applied, so the reported adjustmentFactors overstated what was modeled.
  if (subject.halfBaths != null && comp.halfBaths != null) {
    apply('halfBaths', subject.halfBaths - comp.halfBaths, factors.halfBath);
  }
  if (subject.lotSqft && comp.lotSqft) {
    apply('lotSqft', subject.lotSqft - comp.lotSqft, factors.lotSqft);
  }
  if (subject.garageSpaces != null && comp.garageSpaces != null) {
    apply('garage', subject.garageSpaces - comp.garageSpaces, factors.garage);
  }

  if (subject.condition && comp.condition) {
    apply('condition', subject.condition - comp.condition, factors.condition);
  }

  if (subject.yearBuilt && comp.yearBuilt) {
    // Sign fix: the original computed (subjectAge - compAge), which adjusted the
    // comp UPWARD when the subject was OLDER — backwards. Every other factor is
    // "positive when the subject is superior", so newer subject => positive.
    apply('age', subject.yearBuilt - comp.yearBuilt, factors.age);
  }

  return adj;
}