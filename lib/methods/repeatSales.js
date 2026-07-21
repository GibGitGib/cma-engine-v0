// Repeat Sales / Time Adjustment (HPI)
// Index prior sales of the subject or comps forward to today

import { MethodResult } from '../types.js';

export function repeatSales(subject, comps, marketData) {
  if (!marketData?.hpiIndex?.length) {
    return MethodResult.failure('No HPI index data available');
  }

  // Try subject's prior sale first
  const subjectPrior = marketData.subjectPriorSale;
  if (subjectPrior && subjectPrior.price && subjectPrior.date) {
    const monthsElapsed = monthsBetween(subjectPrior.date, new Date());
    const indexRatio = getHPIRatio(marketData.hpiIndex, subjectPrior.date, new Date());
    
    if (indexRatio) {
      const estimate = Math.round(subjectPrior.price * indexRatio);
      const confidence = Math.max(0.3, 1 - monthsElapsed / 120); // decays over 10 years
      
      return MethodResult.success({
        method: 'repeat_sales',
        label: 'Repeat Sales (HPI Time Adjustment)',
        estimate,
        range: {
          low: Math.round(estimate * 0.92),
          high: Math.round(estimate * 1.08),
        },
        confidence: Math.round(confidence * 100) / 100,
        compsUsed: 1,
        rationale: `Subject prior sale: ${formatDate(subjectPrior.date)} at $${subjectPrior.price.toLocaleString()}. Adjusted via ${marketData.hpiIndex[0]?.name || 'Boston HPI'} (${monthsElapsed} months).`,
        strengths: ['Controls for property quality', 'Boston deep sales history', 'Objective index-based'],
        weaknesses: ['Useless without prior sale', 'Ignores renovations', 'Assumes average maintenance'],
        details: {
          priorPrice: subjectPrior.price,
          priorDate: subjectPrior.date,
          monthsElapsed,
          indexRatio,
          hpiSource: marketData.hpiIndex[0]?.name,
        },
      });
    }
  }

  // Fallback: use comps with prior sales
  const compsWithPriors = comps.filter(c => c.priorSalePrice && c.priorSaleDate);
  if (!compsWithPriors.length) {
    return MethodResult.failure('No prior sales for subject or comps');
  }

  const estimates = compsWithPriors.map(c => {
    const ratio = getHPIRatio(marketData.hpiIndex, c.priorSaleDate, new Date());
    return ratio ? c.priorSalePrice * ratio : null;
  }).filter(e => e !== null);

  if (!estimates.length) {
    return MethodResult.failure('Could not compute HPI ratios');
  }

  const estimate = Math.round(estimates.reduce((a, b) => a + b, 0) / estimates.length);
  const spread = Math.max(...estimates) - Math.min(...estimates);
  const confidence = Math.max(0, 1 - spread / estimate);

  return MethodResult.success({
    method: 'repeat_sales',
    label: 'Repeat Sales / HPI Adjustment',
    estimate,
    range: {
      low: Math.round(Math.min(...estimates)),
      high: Math.round(Math.max(...estimates)),
    },
    confidence: Math.round(confidence * 100) / 100,
    compsUsed: estimates.length,
    rationale: `Average of ${estimates.length} comp prior sales indexed forward via HPI.`,
    strengths: ['Controls for property quality', 'Boston deep sales history'],
    weaknesses: ['Requires prior sales', 'Ignores renovations', 'Index lag'],
    details: { individualEstimates: estimates.map(e => Math.round(e)) },
  });
}

function monthsBetween(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
}

function getHPIRatio(hpiData, fromDate, toDate) {
  // hpiData: [{ date: '2024-01', value: 320.5 }, ...]
  const from = findHPI(hpiData, fromDate);
  const to = findHPI(hpiData, toDate);
  if (!from || !to) return null;
  return to.value / from.value;
}

function findHPI(hpiData, date) {
  const target = new Date(date);
  const targetStr = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
  
  // Exact match
  let match = hpiData.find(h => h.date === targetStr);
  if (match) return match;
  
  // Closest prior
  const prior = hpiData.filter(h => h.date <= targetStr).pop();
  return prior;
}

function formatDate(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}