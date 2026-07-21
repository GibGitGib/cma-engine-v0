// Income Approach (GRM / Cap Rate)
// Rent-based valuation for investor properties

import { MethodResult } from '../types.js';

export function incomeApproach(subject, comps, marketData) {
  // Only applicable for multi-family and investor properties
  const investorTypes = ['multi', 'multi_family_2', 'multi_family_3', 'multi_family_4plus'];
  if (!investorTypes.includes(subject.propertyType)) {
    return MethodResult.failure('Income approach only for multi-family / investor properties');
  }

  const grm = marketData?.grmByPolygon?.[subject.polygonId] || marketData?.grm;
  const capRate = marketData?.capRateByPolygon?.[subject.polygonId] || marketData?.capRate;

  if (!grm && !capRate) {
    return MethodResult.failure('No GRM or cap rate data for micro-market');
  }

  const annualRent = subject.annualRent || estimateRent(subject, marketData);
  if (!annualRent) {
    return MethodResult.failure('No rent data available');
  }

  let estimate = 0;
  let rationale = '';

  if (grm) {
    estimate = annualRent * grm;
    rationale = `GRM ${grm} × annual rent $${annualRent.toLocaleString()}`;
  } else if (capRate) {
    const noi = annualRent * 0.6; // Assume 40% expense ratio
    estimate = noi / capRate;
    rationale = `Cap rate ${(capRate * 100).toFixed(1)}% × NOI $${noi.toLocaleString()} (60% of rent)`;
  }

  estimate = Math.round(estimate);
  const rangeLow = Math.round(estimate * 0.88);
  const rangeHigh = Math.round(estimate * 1.12);

  return MethodResult.success({
    method: 'income_approach',
    label: 'Income Approach (GRM / Cap Rate)',
    estimate,
    range: { low: rangeLow, high: rangeHigh },
    confidence: 0.5,
    compsUsed: 0,
    rationale,
    strengths: ['Essential for multi-family / triple-deckers', 'Investor-aligned', 'Market-based'],
    weaknesses: ['Irrelevant for owner-occupied singles', 'Rent data quality varies', 'Expense ratio assumptions'],
    details: { annualRent, grm, capRate, noi: annualRent * 0.6 },
  });
}

function estimateRent(subject, marketData) {
  // Fallback: use micro-market rent/sqft
  const rentPerSqft = marketData?.rentPerSqftByPolygon?.[subject.polygonId];
  if (rentPerSqft && subject.sqft) {
    return subject.sqft * rentPerSqft * 12;
  }
  return null;
}