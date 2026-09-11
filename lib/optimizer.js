// Optimizer Engine v1
// Applicability gate → weighted ensemble → ambiguity resolution → explanation

import { MethodResult, SubjectProperty, CompRecord, MarketContext } from './types.js';

export class OptimizerResult {
  constructor(data = {}) {
    this.pointEstimate = data.pointEstimate || 0;
    this.range = data.range || { low: 0, high: 0 };
    this.confidence = data.confidence || 0;
    this.methodWeights = data.methodWeights || {};
    this.methodContributions = data.methodContributions || {};
    this.ambiguity = data.ambiguity || null;
    this.explanation = data.explanation || '';
    this.inputAuditTrail = data.inputAuditTrail || [];
  }
}

/**
 * Run the optimizer over method results
 * @param {Object} methodResults - Map of method name -> MethodResult
 * @param {SubjectProperty} subject - Subject property
 * @param {CompRecord[]} comps - Selected comps
 * @param {MarketContext} marketData - Market context
 * @returns {OptimizerResult}
 */
export function runOptimizer(methodResults, subject, comps, marketData) {
  // 1. Applicability gate: score each method 0-1
  const applicability = scoreApplicability(methodResults, subject, comps, marketData);
  
  // 2. Historical accuracy weights (from ledger, or static defaults)
  const historicalWeights = getHistoricalWeights(marketData);
  
  // 3. Combined weight = applicability × historical accuracy
  const combinedWeights = {};
  for (const [method, score] of Object.entries(applicability)) {
    const hist = historicalWeights[method] || 1.0;
    combinedWeights[method] = score * hist;
  }
  
  // Normalize weights
  const weightSum = Object.values(combinedWeights).reduce((a, b) => a + b, 0);
  if (weightSum === 0) {
    return new OptimizerResult({
      pointEstimate: 0,
      range: { low: 0, high: 0 },
      confidence: 0,
      explanation: 'No applicable methods',
      methodWeights: {},
      methodContributions: {},
    });
  }
  
  const normalizedWeights = {};
  for (const [method, w] of Object.entries(combinedWeights)) {
    normalizedWeights[method] = w / weightSum;
  }
  
  // 4. Weighted ensemble estimate
  const contributingMethods = Object.keys(normalizedWeights).filter(m => normalizedWeights[m] > 0.05);
  const estimates = contributingMethods.map(m => ({
    method: m,
    estimate: methodResults[m]?.estimate || 0,
    weight: normalizedWeights[m],
    confidence: methodResults[m]?.confidence || 0,
    rationale: methodResults[m]?.rationale || '',
  }));
  
  const weightedEstimate = estimates.reduce((sum, e) => sum + e.estimate * e.weight, 0);
  
  // 5. Ambiguity resolution
  const spread = Math.max(...estimates.map(e => e.estimate)) - Math.min(...estimates.map(e => e.estimate));
  const relativeSpread = weightedEstimate > 0 ? spread / weightedEstimate : 0;
  
  let ambiguity = null;
  if (relativeSpread > 0.15) { // >15% spread = ambiguous
    ambiguity = resolveAmbiguity(estimates, relativeSpread);
    if (ambiguity.widenedRange) {
      estimates.forEach(e => e.weight = ambiguity.adjustedWeights[e.method] || e.weight);
    }
  }
  
  // 6. Final range and confidence
  const finalEstimate = ambiguity?.adjustedEstimate || weightedEstimate;
  const confidence = calculateConfidence(estimates, ambiguity);
  const range = calculateRange(estimates, finalEstimate, ambiguity);
  
  // 7. Build explanation
  const explanation = buildExplanation(estimates, ambiguity, subject, comps, finalEstimate, confidence);
  
  return new OptimizerResult({
    pointEstimate: Math.round(finalEstimate),
    range,
    confidence: Math.round(confidence * 100) / 100,
    methodWeights: normalizedWeights,
    methodContributions: Object.fromEntries(
      estimates.map(e => [e.method, { estimate: e.estimate, weight: e.weight, rationale: e.rationale }])
    ),
    ambiguity,
    explanation,
    inputAuditTrail: buildAuditTrail(subject, comps, marketData),
  });
}

/**
 * Score method applicability 0-1 based on property type, comp count, data freshness
 */
function scoreApplicability(methodResults, subject, comps, marketData) {
  const scores = {};
  
  for (const [method, result] of Object.entries(methodResults)) {
    if (!result?.success) {
      scores[method] = 0;
      continue;
    }
    
    let score = 1.0;
    
    // Property type gates
    if (method === 'income_approach' && !['multi', 'multi_family_2', 'multi_family_3', 'multi_family_4plus'].includes(subject.propertyType)) {
      score = 0;
    }
    if (method === 'cost_approach' && result.compsUsed >= 5) {
      score *= 0.3; // Cost approach less relevant when comps abundant
    }
    if (method === 'repeat_sales' && !result.compsUsed) {
      score = 0;
    }
    if (method === 'external_avm' && !marketData?.zestimate && !marketData?.redfinEstimate) {
      score = 0;
    }
    
    // Comp count penalty for comp-dependent methods
    const compDependent = ['sales_comparison', 'price_per_sqft', 'list_to_sale', 'dom_absorption'];
    if (compDependent.includes(method) && comps.length < 5) {
      score *= Math.min(1, comps.length / 5);
    }
    
    // Data freshness
    if (marketData?.dataAgeMonths > 6) {
      score *= 0.8;
    }
    
    scores[method] = Math.max(0, Math.min(1, score));
  }
  
  return scores;
}

/**
 * Get historical accuracy weights from ledger (or defaults)
 */
function getHistoricalWeights(marketData) {
  const defaults = {
    sales_comparison: 1.0,
    price_per_sqft: 0.8,
    hedonic_regression: 0.9,
    repeat_sales: 0.85,
    list_to_sale: 0.7,
    dom_absorption: 0.6,
    external_avm: 0.65,
    median_trend: 0.75,
    cost_approach: 0.5,
    income_approach: 0.7,
  };
  
  if (marketData?.historicalWeights) {
    return { ...defaults, ...marketData.historicalWeights };
  }
  return defaults;
}

/**
 * Resolve ambiguity when methods disagree beyond threshold
 */
function resolveAmbiguity(estimates, relativeSpread) {
  const sorted = [...estimates].sort((a, b) => a.estimate - b.estimate);
  const median = sorted[Math.floor(sorted.length / 2)].estimate;

  // Guard: a zero median would make every ratio below NaN.
  if (!median) {
    return {
      spread: relativeSpread,
      conflictingMethods: [],
      trimmedMethods: estimates.map(e => e.method),
      adjustedWeights: Object.fromEntries(estimates.map(e => [e.method, e.weight])),
      adjustedEstimate: 0,
      widenedRange: true,
    };
  }

  // Outlier trimming: remove methods >25% from median
  const trimmed = estimates.filter(e => Math.abs(e.estimate - median) / median <= 0.25);
  
  let adjustedWeights = {};
  let adjustedEstimate = median;
  let widenedRange = false;
  
  if (trimmed.length < estimates.length) {
    // Recalculate with trimmed set
    const weightSum = trimmed.reduce((s, e) => s + e.weight, 0);
    adjustedWeights = Object.fromEntries(trimmed.map(e => [e.method, e.weight / weightSum]));
    adjustedEstimate = trimmed.reduce((s, e) => s + e.estimate * adjustedWeights[e.method], 0);
  } else {
    // No clean outliers - widen range, lower confidence
    widenedRange = true;
    adjustedWeights = Object.fromEntries(estimates.map(e => [e.method, e.weight]));
  }
  
  return {
    spread: relativeSpread,
    conflictingMethods: estimates.filter(e => Math.abs(e.estimate - median) / median > 0.15).map(e => e.method),
    trimmedMethods: trimmed.map(e => e.method),
    adjustedWeights,
    adjustedEstimate,
    widenedRange,
  };
}

function calculateConfidence(estimates, ambiguity) {
  if (!estimates.length) return 0;
  
  const weightConfidence = estimates.reduce((s, e) => s + e.weight * e.confidence, 0);

  // Measure agreement across the methods that actually survived ambiguity
  // resolution. Using the full set meant trimming an outlier could never
  // improve confidence — the discarded estimate still drove the spread.
  const surviving = ambiguity?.trimmedMethods?.length
    ? estimates.filter(e => ambiguity.trimmedMethods.includes(e.method))
    : estimates;
  const pool = surviving.length ? surviving : estimates;

  const spread = Math.max(...pool.map(e => e.estimate)) - Math.min(...pool.map(e => e.estimate));
  // Normalize against the weighted mean, not estimates[0] — array position 0 is
  // arbitrary, so a low-estimate method there inflated the ratio past 1.
  const weightTotal = pool.reduce((s, e) => s + e.weight, 0);
  const weightedMean = weightTotal > 0
    ? pool.reduce((s, e) => s + e.estimate * e.weight, 0) / weightTotal
    : 0;
  const relativeSpread = weightedMean > 0 ? spread / weightedMean : 1;

  // Smooth bounded decay rather than (1 - spread): the linear form went
  // negative whenever methods disagreed by more than the mean, clamping every
  // such CMA to the same floor and destroying the signal. 1/(1+x) stays in
  // (0,1] and keeps degrading monotonically as disagreement widens.
  let confidence = weightConfidence / (1 + relativeSpread);
  
  if (ambiguity?.widenedRange) confidence *= 0.7;
  if (ambiguity?.conflictingMethods?.length) confidence *= 0.8;
  
  return Math.max(0.1, Math.min(0.95, confidence));
}

function calculateRange(estimates, finalEstimate, ambiguity) {
  if (!estimates.length) return { low: 0, high: 0 };
  
  const sorted = [...estimates].sort((a, b) => a.estimate - b.estimate);
  const p25 = sorted[Math.floor(sorted.length * 0.25)]?.estimate || finalEstimate;
  const p75 = sorted[Math.floor(sorted.length * 0.75)]?.estimate || finalEstimate;
  
  let low = Math.round(p25);
  let high = Math.round(p75);
  
  if (ambiguity?.widenedRange) {
    low = Math.round(finalEstimate * 0.85);
    high = Math.round(finalEstimate * 1.15);
  }
  
  return { low, high };
}

function buildExplanation(estimates, ambiguity, subject, comps, finalEstimate, confidence) {
  const lines = [];
  
  lines.push(`Optimizer combined ${estimates.length} applicable methods for ${subject.address}.`);
  
  // Per-method explanation
  for (const e of estimates) {
    const pct = Math.round(e.weight * 100);
    lines.push(`${e.method} (${pct}%): ${e.rationale}`);
  }
  
  if (ambiguity) {
    lines.push(`\nAmbiguity detected: ${(ambiguity.spread * 100).toFixed(1)}% spread between methods.`);
    if (ambiguity.widenedRange) {
      lines.push('Methods conflicted beyond clean outlier trimming. Range widened, confidence lowered.');
      lines.push(`Conflicting methods: ${ambiguity.conflictingMethods.join(', ')}`);
    } else {
      lines.push(`Outliers trimmed: ${ambiguity.trimmedMethods.join(', ')} used for final estimate.`);
    }
  }
  
  lines.push(`\nFinal: $${finalEstimate.toLocaleString()} (${Math.round(confidence * 100)}% confidence)`);
  
  return lines.join('\n');
}

function buildAuditTrail(subject, comps, marketData) {
  const trail = [];
  trail.push({ input: 'subject', fields: Object.keys(subject).filter(k => subject[k] !== undefined && subject[k] !== null) });
  trail.push({ input: 'comps', count: comps.length, sources: [...new Set(comps.map(c => c.source))] });
  trail.push({ input: 'market_data', hasHpi: !!marketData?.hpiIndex, hasHedonic: !!marketData?.hedonicCoefficients, hasLandValues: !!marketData?.landValues });
  return trail;
}