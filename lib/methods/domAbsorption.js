// DOM / Absorption-Rate Pricing
// Adjusts estimate for market velocity (months of inventory, DOM trend)

import { MethodResult } from '../types.js';

export function domAbsorption(subject, comps, marketData) {
  if (!marketData?.absorptionRate && !marketData?.monthsOfInventory) {
    return MethodResult.failure('No absorption/DOM data available');
  }

  // Get base estimate from another method (e.g., sales_comparison)
  const baseEstimate = marketData.baseEstimate || subject.suggestedValue;
  if (!baseEstimate) {
    return MethodResult.failure('No base estimate to adjust');
  }

  const moi = marketData.monthsOfInventory || marketData.absorptionRate;
  const domTrend = marketData.domTrend || 0; // % change in DOM MoM

  // Adjustment logic
  let adjustment = 0;
  let rationale = '';

  if (moi <= 2) {
    // Seller's market - premium
    adjustment = 0.03; // +3%
    rationale = `Extreme seller's market (${moi} months inventory)`;
  } else if (moi <= 4) {
    // Balanced-to-seller
    adjustment = 0.015;
    rationale = `Seller's market (${moi} months inventory)`;
  } else if (moi >= 7) {
    // Buyer's market - discount
    adjustment = -0.03;
    rationale = `Buyer's market (${moi} months inventory)`;
  } else if (moi >= 5) {
    adjustment = -0.015;
    rationale = `Balanced-to-buyer (${moi} months inventory)`;
  }

  // DOM trend modifier
  if (domTrend > 0.1) {
    adjustment -= 0.01; // DOM rising = softening
    rationale += `; DOM rising ${(domTrend * 100).toFixed(0)}%`;
  } else if (domTrend < -0.1) {
    adjustment += 0.01; // DOM falling = tightening
    rationale += `; DOM falling ${(Math.abs(domTrend) * 100).toFixed(0)}%`;
  }

  const estimate = Math.round(baseEstimate * (1 + adjustment));
  const confidence = Math.max(0.2, 0.7 - Math.abs(adjustment)); // modifier has lower confidence

  return MethodResult.success({
    method: 'dom_absorption',
    label: 'DOM / Absorption Rate Pricing',
    estimate,
    range: {
      low: Math.round(estimate * 0.95),
      high: Math.round(estimate * 1.05),
    },
    confidence: Math.round(confidence * 100) / 100,
    compsUsed: 0,
    rationale: `Base estimate adjusted: ${rationale}. Adjustment: ${(adjustment * 100).toFixed(1)}%.`,
    strengths: ['Catches shifting markets early', 'Uses live velocity data', 'Good modifier'],
    weaknesses: ['A modifier, not standalone', 'Inventory lagging indicator', 'DOM noisy'],
    details: { baseEstimate, monthsOfInventory: moi, domTrend, adjustment: Math.round(adjustment * 10000) / 100 },
  });
}