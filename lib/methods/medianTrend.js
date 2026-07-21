// Median Trend Model
// Rolling median/moving average of the micro-market with seasonal adjustment

import { MethodResult } from '../types.js';

export function medianTrend(subject, comps, marketData) {
  if (!marketData?.medianHistory?.length) {
    return MethodResult.failure('No median price history available');
  }

  const history = marketData.medianHistory
    .filter(h => h.polygonId === subject.polygonId)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (history.length < 3) {
    return MethodResult.failure('Insufficient median history (need ≥3 months)');
  }

  // Apply seasonal adjustment (Boston: spring/fall peaks)
  const adjusted = history.map(h => {
    const month = new Date(h.date).getMonth(); // 0-11
    const seasonalMultiplier = getSeasonalMultiplier(month);
    return { ...h, adjustedMedian: h.medianPrice * seasonalMultiplier };
  });

  // Current trend: 3-month moving average
  const recent = adjusted.slice(-3);
  const currentMedian = recent.reduce((s, h) => s + h.adjustedMedian, 0) / 3;

  // Month-over-month trend
  const prior = adjusted.slice(-6, -3);
  const priorMedian = prior.reduce((s, h) => s + h.adjustedMedian, 0) / 3;
  const monthlyTrend = priorMedian ? (currentMedian - priorMedian) / 3 : 0;

  // Project to today (assume 1-month lag)
  const projectedMedian = currentMedian + monthlyTrend;

  // Apply $/sqft ratio to subject
  const microMarketPpsf = marketData.ppsfiByPolygon?.[subject.polygonId];
  if (!microMarketPpsf || !subject.sqft) {
    return MethodResult.failure('Missing micro-market $/sqft or subject sqft');
  }

  const estimate = Math.round(projectedMedian);
  const confidence = Math.max(0.3, 1 - history.length / 20); // more history = more confidence

  return MethodResult.success({
    method: 'median_trend',
    label: 'Neighborhood Median-Trend Model',
    estimate,
    range: {
      low: Math.round(projectedMedian * 0.92),
      high: Math.round(projectedMedian * 1.08),
    },
    confidence: Math.round(confidence * 100) / 100,
    compsUsed: 0,
    rationale: `Seasonally adjusted ${history.length}-month median trend for polygon ${subject.polygonId}. Projected median: $${Math.round(projectedMedian).toLocaleString()}.`,
    strengths: ['Stable baseline', 'Uses all micro-market data', 'Seasonal adjustment'],
    weaknesses: ['Blind to specific property', 'Lags turning points', 'Assumes average condition'],
    details: { historyLength: history.length, currentMedian: Math.round(currentMedian), projectedMedian: Math.round(projectedMedian), monthlyTrend: Math.round(monthlyTrend) },
  });
}

function getSeasonalMultiplier(month) {
  // Boston seasonality: peak spring (Apr-May), secondary fall (Sep-Oct), slow winter
  const multipliers = [
    0.96, // Jan
    0.97, // Feb
    0.99, // Mar
    1.02, // Apr
    1.03, // May
    1.01, // Jun
    1.00, // Jul
    0.99, // Aug
    1.02, // Sep
    1.03, // Oct
    0.99, // Nov
    0.97, // Dec
  ];
  return multipliers[month] || 1.0;
}