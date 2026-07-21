// Method registry - all ten valuation methods
import { salesComparison } from './salesComparison.js';
import { pricePerSqft } from './pricePerSqft.js';
import { hedonicRegression } from './hedonic.js';
import { repeatSales } from './repeatSales.js';
import { listToSale } from './listToSale.js';
import { domAbsorption } from './domAbsorption.js';
import { externalAvm } from './externalAvm.js';
import { medianTrend } from './medianTrend.js';
import { costApproach } from './costApproach.js';
import { incomeApproach } from './incomeApproach.js';

export const METHOD_REGISTRY = {
  sales_comparison: salesComparison,
  price_per_sqft: pricePerSqft,
  hedonic_regression: hedonicRegression,
  repeat_sales: repeatSales,
  list_to_sale: listToSale,
  dom_absorption: domAbsorption,
  external_avm: externalAvm,
  median_trend: medianTrend,
  cost_approach: costApproach,
  income_approach: incomeApproach,
};

export const METHOD_ORDER = [
  'sales_comparison',
  'price_per_sqft',
  'hedonic_regression',
  'repeat_sales',
  'list_to_sale',
  'dom_absorption',
  'external_avm',
  'median_trend',
  'cost_approach',
  'income_approach',
];

export function getMethod(name) {
  return METHOD_REGISTRY[name];
}

export function getAllMethods() {
  return METHOD_ORDER.map(name => METHOD_REGISTRY[name]);
}