// List-to-Sale Ratio Analysis
// Current actives × neighborhood sale/list ratio

import { MethodResult } from '../types.js';

export function listToSale(subject, comps, marketData) {
  const actives = marketData?.activeListings?.filter(l => l.polygonId === subject.polygonId);
  if (!actives?.length) {
    return MethodResult.failure('No active listings in micro-market');
  }

  const ratios = marketData?.listToSaleRatios?.[subject.polygonId];
  if (!ratios?.length) {
    return MethodResult.failure('No sale/list ratio history for micro-market');
  }

  // Average sale/list ratio (recent 6 months)
  const recent = ratios.slice(-6);
  const avgRatio = recent.reduce((a, b) => a + b, 0) / recent.length;

  // Median active list price
  const activePrices = actives.map(a => a.listPrice).sort((a, b) => a - b);
  const medianActive = activePrices[Math.floor(activePrices.length / 2)];

  // Adjust for subject quality (condition, sqft vs median active)
  const qualityAdj = (subject.sqft / (marketData.medianActiveSqft?.[subject.polygonId] || subject.sqft)) * (subject.condition / 3);
  const adjusted = medianActive * avgRatio * qualityAdj;

  const estimate = Math.round(adjusted);
  const confidence = Math.min(0.6, actives.length / 20); // max 60% confidence

  return MethodResult.success({
    method: 'list_to_sale',
    label: 'List-to-Sale Ratio Analysis',
    estimate,
    range: { low: Math.round(estimate * 0.93), high: Math.round(estimate * 1.07) },
    confidence: Math.round(confidence * 100) / 100,
    compsUsed: actives.length,
    rationale: `${actives.length} actives × ${(avgRatio * 100).toFixed(1)}% avg sale/list ratio × quality adj.`,
    strengths: ['Captures live negotiation climate', 'Forward-looking signal'],
    weaknesses: ['Actives may be mispriced en masse', 'Ratio lag', 'Quality adjustment crude'],
    details: { avgRatio, medianActive, actives: actives.length, qualityAdj: Math.round(qualityAdj * 100) / 100 },
  });
}