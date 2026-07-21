// External AVM Cross-Check
// Pull Zestimate/Redfin Estimate as independent signals

import { MethodResult } from '../types.js';

export function externalAvm(subject, comps, marketData) {
  const zestimate = marketData?.zestimate;
  const redfin = marketData?.redfinEstimate;

  if (!zestimate && !redfin) {
    return MethodResult.failure('No AVM data available');
  }

  const estimates = [];
  if (zestimate) estimates.push({ source: 'Zillow', value: zestimate });
  if (redfin) estimates.push({ source: 'Redfin', value: redfin });

  if (!estimates.length) {
    return MethodResult.failure('Could not parse AVM data');
  }

  const values = estimates.map(e => e.value);
  const estimate = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const spread = Math.max(...values) - Math.min(...values);
  const confidence = Math.max(0.1, 1 - spread / estimate);

  return MethodResult.success({
    method: 'external_avm',
    label: 'External AVM Cross-Check',
    estimate,
    range: {
      low: Math.round(Math.min(...values)),
      high: Math.round(Math.max(...values)),
    },
    confidence: Math.round(confidence * 100) / 100,
    compsUsed: 0,
    rationale: `Average of ${estimates.length} AVM(s): ${estimates.map(e => `${e.source} $${e.value.toLocaleString()}`).join(', ')}.`,
    strengths: ['Free second opinion', 'Wide coverage', 'Independent methodology'],
    weaknesses: ['Black box', 'Portal ToS constraints', 'Known error tails'],
    details: { sources: estimates },
  });
}