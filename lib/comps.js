// Comp Selection & Progressive Relaxation
// Micro-market geography, min-5 rule, structured explanations

import { CompRecord } from './types.js';

export class CompSelectionExplanation {
  constructor(data = {}) {
    this.subject = data.subject;
    this.steps = data.steps || [];
    this.finalCount = data.finalCount || 0;
    this.minMet = data.minMet || false;
    this.explanation = data.explanation || '';
  }

  toString() {
    return this.explanation;
  }
}

/**
 * Select comps with progressive relaxation ladder
 * @param {SubjectProperty} subject - Subject property
 * @param {CompRecord[]} allComps - All available comps
 * @param {Object} criteria - Selection criteria
 * @returns {{ comps: CompRecord[], explanation: CompSelectionExplanation }}
 */
export function selectComps(subject, allComps, criteria = {}) {
  const {
    minComps = 5,
    lookbackDays = 180,
    maxDistanceMiles = 5,
    statusFilter = ['sold'],
  } = criteria;

  const steps = [];
  let currentComps = [];

  // Step 1: STRICT - Same micro-market, same type, ±20% sqft, 90 days
  currentComps = allComps.filter(c =>
    c.status === 'sold' &&
    c.saleDate &&
    daysAgo(c.saleDate) <= 90 &&
    c.propertyType === subject.propertyType &&
    c.polygonId === subject.polygonId &&
    sqftRatio(c.sqft, subject.sqft) >= 0.8 && sqftRatio(c.sqft, subject.sqft) <= 1.2
  );

  steps.push({
    step: 1,
    criteria: 'Same micro-market (polygon), same type, ±20% sqft, 90 days',
    count: currentComps.length,
    relaxed: false,
  });

  // Step 2: Same micro-market, same type, ±20% sqft, full lookback
  if (currentComps.length < minComps) {
    currentComps = allComps.filter(c =>
      c.status === 'sold' &&
      c.saleDate &&
      daysAgo(c.saleDate) <= lookbackDays &&
      c.propertyType === subject.propertyType &&
      c.polygonId === subject.polygonId &&
      sqftRatio(c.sqft, subject.sqft) >= 0.8 && sqftRatio(c.sqft, subject.sqft) <= 1.2
    );
    steps.push({
      step: 2,
      criteria: 'Same micro-market, same type, ±20% sqft, full lookback',
      count: currentComps.length,
      relaxed: true,
    });
  }

  // Step 3: Adjacent comparable micro-markets
  if (currentComps.length < minComps) {
    const adjacentPolys = getAdjacentPolygons(subject.polygonId);
    currentComps = allComps.filter(c =>
      c.status === 'sold' &&
      c.saleDate &&
      daysAgo(c.saleDate) <= lookbackDays &&
      c.propertyType === subject.propertyType &&
      (c.polygonId === subject.polygonId || adjacentPolys.includes(c.polygonId)) &&
      sqftRatio(c.sqft, subject.sqft) >= 0.8 && sqftRatio(c.sqft, subject.sqft) <= 1.2
    );
    steps.push({
      step: 3,
      criteria: 'Adjacent comparable micro-markets added',
      count: currentComps.length,
      relaxed: true,
    });
  }

  // Step 4: Expand attribute windows (±30% sqft, same type)
  if (currentComps.length < minComps) {
    currentComps = allComps.filter(c =>
      c.status === 'sold' &&
      c.saleDate &&
      daysAgo(c.saleDate) <= lookbackDays &&
      c.propertyType === subject.propertyType &&
      sqftRatio(c.sqft, subject.sqft) >= 0.7 && sqftRatio(c.sqft, subject.sqft) <= 1.3
    );
    steps.push({
      step: 4,
      criteria: 'Expanded attribute windows (±30% sqft, same type)',
      count: currentComps.length,
      relaxed: true,
    });
  }

  // Step 5: Radius fallback
  if (currentComps.length < minComps) {
    currentComps = allComps.filter(c =>
      c.status === 'sold' &&
      c.saleDate &&
      daysAgo(c.saleDate) <= lookbackDays &&
      c.propertyType === subject.propertyType &&
      c.distanceMiles <= maxDistanceMiles
    );
    steps.push({
      step: 5,
      criteria: `Radius fallback (${maxDistanceMiles} miles, same type)`,
      count: currentComps.length,
      relaxed: true,
    });
  }

  // Add distance to each comp
  for (const comp of currentComps) {
    comp.distanceMiles = calculateDistance(subject, comp);
  }

  // Sort by distance
  currentComps.sort((a, b) => a.distanceMiles - b.distanceMiles);

  // Build explanation
  const finalCount = currentComps.length;
  const minMet = finalCount >= minComps;

  let explanation = `Found ${finalCount} qualifying comps for ${subject.address}. `;
  if (minMet) {
    explanation += `Minimum of ${minComps} met. `;
  } else {
    explanation += `Minimum of ${minComps} NOT met after full relaxation. `;
    explanation += `Market is thin: ${getThinMarketReason(steps)}. `;
  }
  explanation += `Constraints relaxed: ${steps.filter(s => s.relaxed).map(s => s.step).join(', ') || 'none'}. `;
  explanation += `Impact on confidence: ${minMet ? 'minimal' : 'significant - range widened'}.`;

  return {
    comps: currentComps.slice(0, 20), // Cap at 20
    explanation: new CompSelectionExplanation({
      subject: subject.address,
      steps,
      finalCount,
      minMet,
      explanation,
    }),
  };
}

function daysAgo(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - d) / (1000 * 60 * 60 * 24));
}

function sqftRatio(compSqft, subjectSqft) {
  if (!subjectSqft || !compSqft) return 1;
  return compSqft / subjectSqft;
}

function calculateDistance(subject, comp) {
  if (!subject.latitude || !comp.latitude) return 0;
  const R = 3959; // miles
  const dLat = toRad(comp.latitude - subject.latitude);
  const dLon = toRad(comp.longitude - subject.longitude);
  const lat1 = toRad(subject.latitude);
  const lat2 = toRad(comp.latitude);
  const a = Math.sin(dLat/2)**2 + Math.sin(dLon/2)**2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function toRad(deg) { return deg * Math.PI / 180; }

function getAdjacentPolygons(polygonId) {
  // In production, this queries the neighborhood adjacency graph
  // For now, return empty - real impl loads from micro-market polygons
  return [];
}

function getThinMarketReason(steps) {
  const lastStep = steps[steps.length - 1];
  if (lastStep.step === 5) return 'even radius fallback insufficient';
  if (lastStep.step === 4) return 'attribute expansion insufficient';
  if (lastStep.step === 3) return 'adjacent micro-markets insufficient';
  return 'initial criteria too restrictive';
}

// Condo & multi-family specific selection
export function selectCondoComps(subject, allComps, criteria = {}) {
  // Prefer same building, then same association
  let comps = allComps.filter(c =>
    c.status === 'sold' &&
    c.propertyType === 'condo' &&
    c.buildingId === subject.buildingId
  );

  if (comps.length < criteria.minComps) {
    // Same association
    const assocComps = allComps.filter(c =>
      c.status === 'sold' &&
      c.propertyType === 'condo' &&
      c.hoaFee === subject.hoaFee
    );
    comps = [...new Set([...comps, ...assocComps])];
  }

  if (comps.length < criteria.minComps) {
    // Fallback to regular selection
    return selectComps(subject, allComps, criteria);
  }

  return { comps: comps.slice(0, 20), explanation: null };
}

export function selectMultiFamilyComps(subject, allComps, criteria = {}) {
  // Weight income approach comps higher, prefer similar unit count
  let comps = allComps.filter(c =>
    c.status === 'sold' &&
    c.propertyType.startsWith('multi') &&
    c.units === subject.units
  );

  if (comps.length < criteria.minComps) {
    // Expand to nearby multi-family
    comps = allComps.filter(c =>
      c.status === 'sold' &&
      c.propertyType.startsWith('multi') &&
      Math.abs((c.units || 0) - (subject.units || 0)) <= 2
    );
  }

  return { comps: comps.slice(0, 20), explanation: null };
}