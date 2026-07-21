// Cost Approach
// Land value + depreciated replacement cost

import { MethodResult } from '../types.js';

export function costApproach(subject, comps, marketData) {
  const landValues = marketData?.landValues || {};
  const replacementCostPerSqft = marketData?.replacementCostPerSqft || { single: 180, condo: 200, multi: 170 };
  const economicLife = marketData?.totalEconomicLife || { single: 60, condo: 55, multi: 60 };

  const landValue = landValues[subject.polygonId] || marketData?.defaultLandValue || 300000;
  const costPerSqft = replacementCostPerSqft[subject.propertyType] || replacementCostPerSqft.single || 180;
  const subjectSqft = subject.sqft || 0;
  const life = economicLife[subject.propertyType] || economicLife.single || 60;
  const effectiveAge = subject.yearBuilt ? new Date().getFullYear() - subject.yearBuilt : 30;
  const depreciation = Math.min(0.9, effectiveAge / life);

  const replacementCost = subjectSqft * costPerSqft;
  const depreciatedCost = replacementCost * (1 - depreciation);
  const estimate = Math.round(landValue + depreciatedCost);

  // Range based on land value variance ±15% and cost variance ±10%
  const rangeLow = Math.round(landValue * 0.85 + depreciatedCost * 0.9);
  const rangeHigh = Math.round(landValue * 1.15 + depreciatedCost * 1.1);

  return MethodResult.success({
    method: 'cost_approach',
    label: 'Cost Approach',
    estimate,
    range: { low: rangeLow, high: rangeHigh },
    confidence: 0.4, // Low confidence as primary method, higher as fallback
    compsUsed: 0,
    rationale: `Land value: $${landValue.toLocaleString()}. Replacement cost: ${subjectSqft} sqft × $${costPerSqft} = $${Math.round(replacementCost).toLocaleString()}. Depreciation: ${(depreciation * 100).toFixed(0)}% (${effectiveAge} yr effective age).`,
    strengths: ['Only sane method for unique/low-comp properties', 'Objective components', 'Min-5 fallback'],
    weaknesses: ['Poor proxy for market behavior in hot metros', 'Land value estimation error', 'Depreciation subjective'],
    details: { landValue, replacementCostPerSqft: costPerSqft, depreciatedCost, depreciation, effectiveAge },
  });
}