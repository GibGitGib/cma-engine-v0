// Sales Comparison Approach (Adjusted Comps)
// Classic CMA: nearest sold comps with dollar adjustments for deltas

import { MethodResult } from '../types.js';

// Standard adjustment factors (per-sqft, per-bed, per-bath, condition)
const ADJUSTMENTS = {
  sqft: 100,           // $/sqft adjustment
  bed: 10000,          // per bedroom
  bath: 15000,         // per bathroom (full)
  halfBath: 5000,      // per half bath
  condition: 20000,    // per condition point (1-5)
  age: 500,            // per year effective age
  lotSqft: 2,          // per lot sqft
  garage: 15000,       // per garage space
};

export function salesComparison(subject, comps, marketData) {
  // Filter comps: sold, same polygon, within 180 days, similar property type
  let qualified = comps.filter(c => 
    c.status === 'sold' &&
    c.polygonId === subject.polygonId &&
    c.saleDate &&
    daysSince(c.saleDate) <= 180 &&
    c.sqft &&
    c.salePrice &&
    propertyTypeMatch(c.propertyType, subject.propertyType)
  );

  if (qualified.length < 3) {
    return MethodResult.failure(`Insufficient qualified comps (${qualified.length}/3 min)`);
  }

  // Sort by similarity score (composite of proximity, sqft, beds, recency)
  qualified = qualified.map(c => ({
    ...c,
    similarity: similarityScore(subject, c),
    adjustments: computeAdjustments(subject, c),
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
    rationale: `Top ${adjusted.length} sold comps with dollar adjustments for sqft, beds, baths, condition. Weighted by recency.`,
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
      adjustmentFactors: ADJUSTMENTS,
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
  return score;
}

function computeAdjustments(subject, comp) {
  const adj = { total: 0, items: [] };

  if (subject.sqft && comp.sqft) {
    const diff = subject.sqft - comp.sqft;
    const val = diff * ADJUSTMENTS.sqft;
    adj.total += val;
    adj.items.push({ field: 'sqft', diff, value: val });
  }

  if (subject.beds && comp.beds) {
    const diff = subject.beds - comp.beds;
    const val = diff * ADJUSTMENTS.bed;
    adj.total += val;
    adj.items.push({ field: 'beds', diff, value: val });
  }

  if (subject.baths && comp.baths) {
    const diff = subject.baths - comp.baths;
    const val = diff * ADJUSTMENTS.bath;
    adj.total += val;
    adj.items.push({ field: 'baths', diff, value: val });
  }

  if (subject.condition && comp.condition) {
    const diff = subject.condition - comp.condition;
    const val = diff * ADJUSTMENTS.condition;
    adj.total += val;
    adj.items.push({ field: 'condition', diff, value: val });
  }

  if (subject.yearBuilt && comp.yearBuilt) {
    const subjAge = new Date().getFullYear() - subject.yearBuilt;
    const compAge = new Date().getFullYear() - comp.yearBuilt;
    const diff = subjAge - compAge;
    const val = diff * ADJUSTMENTS.age;
    adj.total += val;
    adj.items.push({ field: 'age', diff, value: val });
  }

  return adj;
}