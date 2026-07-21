// Price-per-Square-Foot Analysis
// Neighborhood $/sqft distribution applied to subject

import { MethodResult } from '../types.js';

export function pricePerSqft(subject, comps, marketData) {
  if (!comps?.length) {
    return MethodResult.failure('No comps provided');
  }

  // Calculate $/sqft for each comp
  const sqftValues = comps
    .filter(c => c.sqft && c.sqft > 200)
    .map(c => ({
      compId: c.id,
      address: c.address,
      pricePerSqft: c.salePrice / c.sqft,
      salePrice: c.salePrice,
      sqft: c.sqft,
      distanceMiles: c.distanceMiles,
    }));

  if (!sqftValues.length) {
    return MethodResult.failure('No valid sqft data in comps');
  }

  // Weight by inverse distance
  const weights = sqftValues.map(c => 1 / (c.distanceMiles + 0.1));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const weightedPpsf = sqftValues.reduce((sum, c, i) => sum + c.pricePerSqft * (weights[i] / weightSum), 0);

  // Also compute median for robustness
  const sorted = sqftValues.map(c => c.pricePerSqft).sort((a, b) => a - b);
  const medianPpsf = sorted[Math.floor(sorted.length / 2)];

  // Blend weighted mean and median
  const blendedPpsf = (weightedPpsf + medianPpsf) / 2;
  const subjectSqft = subject.sqft || 0;
  const estimate = Math.round(blendedPpsf * subjectSqft);

  // Range from 25th/75th percentiles
  const p25 = sorted[Math.floor(sorted.length * 0.25)];
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  const rangeLow = Math.round(p25 * subjectSqft);
  const rangeHigh = Math.round(p75 * subjectSqft);

  // Confidence based on coefficient of variation
  const meanPpsf = sqftValues.reduce((s, c) => s + c.pricePerSqft, 0) / sqftValues.length;
  const stdPpsf = Math.sqrt(sqftValues.reduce((s, c) => s + Math.pow(c.pricePerSqft - meanPpsf, 2), 0) / sqftValues.length);
  const cv = stdPpsf / meanPpsf;
  const confidence = Math.max(0, 1 - cv);

  return MethodResult.success({
    method: 'price_per_sqft',
    label: 'Price-per-Sqft Analysis',
    estimate,
    range: { low: rangeLow, high: rangeHigh },
    confidence: Math.round(confidence * 100) / 100,
    compsUsed: sqftValues.length,
    rationale: `Neighborhood $/sqft (blended weighted mean + median) × subject sqft. ${sqftValues.length} comps with valid sqft.`,
    strengths: ['Simple, robust to small samples', 'Minimal adjustments needed', 'Good baseline'],
    weaknesses: ['Ignores lot size, condition, layout', 'Sqft measurement inconsistencies', 'Weak for unique properties'],
    details: {
      weightedMeanPpsf: Math.round(weightedPpsf),
      medianPpsf: Math.round(medianPpsf),
      blendedPpsf: Math.round(blendedPpsf),
      subjectSqft,
      comps: sqftValues.map(c => ({
        id: c.compId,
        address: c.address,
        ppsf: Math.round(c.pricePerSqft),
        distance: c.distanceMiles,
      })),
    },
  });
}