// Hedonic Regression
// Multivariate model over attributes fit on metro sold data

import { MethodResult } from '../types.js';

export function hedonicRegression(subject, comps, marketData) {
  if (!marketData?.hedonicCoefficients) {
    return MethodResult.failure('No hedonic coefficients available');
  }

  const coeffs = marketData.hedonicCoefficients;
  const subjectFeatures = buildFeatureVector(subject, coeffs);

  // Apply coefficients
  let estimate = coeffs.intercept || 0;
  for (const [feature, value] of Object.entries(subjectFeatures)) {
    if (coeffs[feature] !== undefined) {
      estimate += coeffs[feature] * value;
    }
  }

  // Use comps to calculate prediction interval (residual std error)
  const residuals = marketData.hedonicResiduals || [];
  const rmse = residuals.length
    ? Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length)
    : estimate * 0.1;

  const confidence = Math.max(0, 1 - rmse / estimate);
  const rangeLow = Math.round(estimate - 1.96 * rmse);
  const rangeHigh = Math.round(estimate + 1.96 * rmse);

  return MethodResult.success({
    method: 'hedonic_regression',
    label: 'Hedonic Regression',
    estimate: Math.round(estimate),
    range: { low: rangeLow, high: rangeHigh },
    confidence: Math.round(confidence * 100) / 100,
    compsUsed: marketData.hedonicSampleSize || 0,
    rationale: `Multivariate regression on ${marketData.hedonicSampleSize || 'N/A'} metro sales. Features: ${Object.keys(coeffs).filter(k => k !== 'intercept').join(', ')}.`,
    strengths: ['Uses all available data', 'Quantifies each feature value', 'Statistical rigor'],
    weaknesses: ['Needs volume for stable coefficients', 'Opaque to lay clients', 'Assumes linear relationships'],
    details: {
      coefficients: coeffs,
      subjectFeatures,
      rmse: Math.round(rmse),
      rSquared: marketData.hedonicRSquared || null,
    },
  });
}

function buildFeatureVector(subject, coeffs) {
  const features = {
    sqft: subject.sqft || 0,
    beds: subject.beds || 0,
    baths: subject.baths || 0,
    age: subject.yearBuilt ? new Date().getFullYear() - subject.yearBuilt : 0,
    condition: subject.condition || 3,
    lotSqft: subject.lotSqft || 0,
    garage: subject.garageSpaces || 0,
    hoaFee: subject.hoaFee || 0,
    // Dummy variables for property type
    isCondo: subject.propertyType === 'condo' ? 1 : 0,
    isMulti: ['multi', 'multi_family_2', 'multi_family_3', 'multi_family_4plus'].includes(subject.propertyType) ? 1 : 0,
  };

  // Only return features that have coefficients
  const result = {};
  for (const key of Object.keys(features)) {
    if (coeffs[key] !== undefined) {
      result[key] = features[key];
    }
  }
  return result;
}