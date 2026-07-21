// Test runner for CMA Engine with geocoding
import { SubjectProperty, CompRecord, MarketContext, MethodResult } from './lib/types.js';
import { selectComps } from './lib/comps.js';
import { salesComparison } from './lib/methods/salesComparison.js';
import { pricePerSqft } from './lib/methods/pricePerSqft.js';
import { hedonicRegression } from './lib/methods/hedonic.js';
import { repeatSales } from './lib/methods/repeatSales.js';
import { listToSale } from './lib/methods/listToSale.js';
import { domAbsorption } from './lib/methods/domAbsorption.js';
import { externalAvm } from './lib/methods/externalAvm.js';
import { medianTrend } from './lib/methods/medianTrend.js';
import { costApproach } from './lib/methods/costApproach.js';
import { incomeApproach } from './lib/methods/incomeApproach.js';
import { METHOD_REGISTRY, getAllMethods } from './lib/methods/index.js';
import { runOptimizer } from './lib/optimizer.js';
import { addressToSubjectProperty, geocodeCensus, geocodeGoogle, resolvePolygonId, getAdjacentPolygons } from './lib/geocode.js';

// Create test fixtures
function createTestSubject() {
  return new SubjectProperty({
    address: '123 Main St, Boston, MA 02118',
    polygonId: 'south-end',
    propertyType: 'single',
    sqft: 1800,
    beds: 3,
    baths: 2,
    yearBuilt: 1920,
    condition: 4,
    lotSqft: 2500,
    hoaFee: 0,
    latitude: 42.345,
    longitude: -71.072,
  });
}

function createTestComps() {
  const baseDate = new Date();
  return [
    new CompRecord({
      id: 'comp-1',
      address: '125 Main St, Boston, MA 02118',
      polygonId: 'south-end',
      propertyType: 'single',
      status: 'sold',
      sqft: 1750,
      beds: 3,
      baths: 2,
      yearBuilt: 1915,
      condition: 3,
      lotSqft: 2400,
      salePrice: 950000,
      saleDate: new Date(baseDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      latitude: 42.3445,
      longitude: -71.0715,
      source: 'mls',
    }),
    new CompRecord({
      id: 'comp-2',
      address: '130 Main St, Boston, MA 02118',
      polygonId: 'south-end',
      propertyType: 'single',
      status: 'sold',
      sqft: 1900,
      beds: 3,
      baths: 2,
      yearBuilt: 1925,
      condition: 4,
      lotSqft: 2600,
      salePrice: 985000,
      saleDate: new Date(baseDate.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString(),
      latitude: 42.3455,
      longitude: -71.0725,
      source: 'mls',
    }),
    new CompRecord({
      id: 'comp-3',
      address: '135 Main St, Boston, MA 02118',
      polygonId: 'south-end',
      propertyType: 'single',
      status: 'sold',
      sqft: 1650,
      beds: 3,
      baths: 1.5,
      yearBuilt: 1910,
      condition: 3,
      lotSqft: 2200,
      salePrice: 890000,
      saleDate: new Date(baseDate.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      latitude: 42.346,
      longitude: -71.073,
      source: 'mls',
    }),
    new CompRecord({
      id: 'comp-4',
      address: '140 Main St, Boston, MA 02118',
      polygonId: 'south-end',
      propertyType: 'single',
      status: 'sold',
      sqft: 2000,
      beds: 4,
      baths: 2.5,
      yearBuilt: 1930,
      condition: 4,
      lotSqft: 2800,
      salePrice: 1025000,
      saleDate: new Date(baseDate.getTime() - 75 * 24 * 60 * 60 * 1000).toISOString(),
      latitude: 42.344,
      longitude: -71.071,
      source: 'mls',
    }),
    new CompRecord({
      id: 'comp-5',
      address: '115 Main St, Boston, MA 02118',
      polygonId: 'south-end',
      propertyType: 'single',
      status: 'sold',
      sqft: 1700,
      beds: 3,
      baths: 2,
      yearBuilt: 1905,
      condition: 2,
      lotSqft: 2300,
      salePrice: 875000,
      saleDate: new Date(baseDate.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      latitude: 42.345,
      longitude: -71.072,
      source: 'mls',
    }),
    new CompRecord({
      id: 'comp-6',
      address: '110 Main St, Boston, MA 02118',
      polygonId: 'south-end',
      propertyType: 'single',
      status: 'sold',
      sqft: 1850,
      beds: 3,
      baths: 2,
      yearBuilt: 1922,
      condition: 4,
      lotSqft: 2500,
      salePrice: 965000,
      saleDate: new Date(baseDate.getTime() - 100 * 24 * 60 * 60 * 1000).toISOString(),
      latitude: 42.344,
      longitude: -71.070,
      source: 'mls',
    }),
  ];
}

function createTestMarketData() {
  return new MarketContext({
    activeListings: [],
    recentSolds: [],
    microMarketStats: {
      'south-end': {
        medianPrice: 950000,
        monthsOfInventory: 2.5,
        domTrend: -0.05,
        listToSaleRatio: 0.98,
        ppsf: 520,
        grm: 12.5,
        capRate: 0.055,
        landValue: 350000,
        replacementCostPerSqft: 180,
        rentPerSqft: 3.50,
      },
    },
    neighborhoodPolys: {},
    hpiIndex: [
      { date: '2024-01', value: 320.5 },
      { date: '2024-02', value: 322.1 },
      { date: '2024-03', value: 324.0 },
      { date: '2024-04', value: 325.5 },
      { date: '2024-05', value: 327.0 },
    ],
    medianHistory: [
      { date: '2024-01', polygonId: 'south-end', medianPrice: 920000 },
      { date: '2024-02', polygonId: 'south-end', medianPrice: 930000 },
      { date: '2024-03', polygonId: 'south-end', medianPrice: 940000 },
      { date: '2024-04', polygonId: 'south-end', medianPrice: 950000 },
      { date: '2024-05', polygonId: 'south-end', medianPrice: 955000 },
    ],
    ppsfiByPolygon: { 'south-end': 520 },
    grmByPolygon: { 'south-end': 12.5 },
    capRateByPolygon: { 'south-end': 0.055 },
    landValues: { 'south-end': 350000 },
    replacementCostPerSqft: { single: 180, condo: 200, multi: 170 },
    totalEconomicLife: { single: 60 },
    rentPerSqftByPolygon: { 'south-end': 3.50 },
    rentPerSqft: 3.50,
    listToSaleRatio: { 'south-end': 0.98, default: 0.97 },
    absorptionRate: 2.5,
    monthsOfInventory: 2.5,
    domTrend: -0.05,
    zestimate: 945000,
    redfinEstimate: 955000,
    hedonicCoefficients: {
      intercept: 200000,
      sqft: 350,
      beds: 15000,
      baths: 20000,
      age: -800,
      condition: 25000,
      lotSqft: 20,
      garage: 10000,
      hoaFee: -50,
      isCondo: -50000,
      isMulti: 30000,
    },
    hedonicResiduals: [10000, -5000, 15000, -8000, 12000, -3000, 7000, -11000, 9000, -6000],
    hedonicSampleSize: 1500,
    hedonicRSquared: 0.87,
    subjectPriorSale: { price: 750000, date: '2018-06-15' },
    dataAgeMonths: 0,
  });
}

async function testGeocoding() {
  console.log('=== Geocoding Tests ===\n');
  
  // Test address resolution
  const testAddresses = [
    '123 Main St, Boston, MA 02118',  // South End
    '500 Commonwealth Ave, Boston, MA 02215',  // Back Bay
    '25 Beacon St, Boston, MA 02108',  // Beacon Hill
    '100 Dorchester Ave, Boston, MA 02127',  // South Boston
  ];

  for (const addr of testAddresses) {
    try {
      // Use Census geocoder (free)
      const geo = await geocodeCensus(addr);
      const polygonId = resolvePolygonId(geo.lat, geo.lon);
      const adjacent = getAdjacentPolygons(polygonId);
      console.log(`  ${addr}`);
      console.log(`    → ${geo.formattedAddress}`);
      console.log(`    → lat: ${geo.lat.toFixed(4)}, lon: ${geo.lon.toFixed(4)}`);
      console.log(`    → polygon: ${polygonId}`);
      console.log(`    → adjacent: ${adjacent.join(', ') || 'none'}`);
      console.log();
    } catch (e) {
      console.log(`  ${addr}`);
      console.log(`    → ERROR: ${e.message}\n`);
    }
  }
}

async function runTests() {
  console.log('=== CMA Engine Test Suite ===\n');
  
  // Test geocoding
  await testGeocoding();
  
  const subject = createTestSubject();
  const comps = createTestComps();
  const marketData = createTestMarketData();
  
  // Add distance to comps
  comps.forEach(c => {
    const R = 3959;
    const dLat = (c.latitude - subject.latitude) * Math.PI / 180;
    const dLon = (c.longitude - subject.longitude) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(subject.latitude * Math.PI/180) * Math.cos(c.latitude * Math.PI/180) * Math.sin(dLon/2)**2;
    c.distanceMiles = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  });

  console.log(`Subject: ${subject.address}`);
  console.log(`  ${subject.sqft} sqft, ${subject.beds}bd/${subject.baths}ba, built ${subject.yearBuilt}, condition ${subject.condition}`);
  console.log(`  Polygon: ${subject.polygonId}\n`);

  console.log(`Comps: ${comps.length} available\n`);

  // Test 1: Comp Selection
  console.log('--- Test 1: Comp Selection ---');
  const compSelection = selectComps(subject, comps, { minComps: 5, lookbackDays: 180 });
  console.log(`Selected: ${compSelection.comps.length} comps (min 5: ${compSelection.explanation.minMet ? 'YES' : 'NO'})`);
  console.log(`Explanation: ${compSelection.explanation}\n`);

  // Test 2: Run all methods
  console.log('--- Test 2: All Valuation Methods ---');
  const methodResults = {};
  for (const method of getAllMethods()) {
    try {
      const result = method(subject, compSelection.comps, marketData);
      methodResults[method.name] = result;
      if (result.success) {
        console.log(`  ${method.name}: $${result.estimate.toLocaleString()} (${result.confidence*100}% conf) [${result.label}]`);
      } else {
        console.log(`  ${method.name}: FAILED - ${result.error}`);
      }
    } catch (e) {
      console.log(`  ${method.name}: ERROR - ${e.message}`);
    }
  }

  // Test 3: Optimizer
  console.log('\n--- Test 3: Optimizer ---');
  const optimizerResult = runOptimizer(methodResults, subject, compSelection.comps, marketData);
  console.log(`Point Estimate: $${optimizerResult.pointEstimate.toLocaleString()}`);
  console.log(`Range: $${optimizerResult.range.low.toLocaleString()} - $${optimizerResult.range.high.toLocaleString()}`);
  console.log(`Confidence: ${optimizerResult.confidence * 100}%`);
  console.log(`Method Weights:`, optimizerResult.methodWeights);
  if (optimizerResult.ambiguity) {
    console.log(`Ambiguity: ${optimizerResult.ambiguity.widenedRange ? 'Widened range' : 'Outliers trimmed'}`);
    console.log(`Conflicting: ${optimizerResult.ambiguity.conflictingMethods.join(', ')}`);
  }
  console.log(`\nExplanation:\n${optimizerResult.explanation}\n`);

  // Test 4: Individual method details
  console.log('--- Test 4: Method Details ---');
  for (const [name, result] of Object.entries(methodResults)) {
    if (result.success) {
      console.log(`\n${name}:`);
      console.log(`  Estimate: $${result.estimate.toLocaleString()}`);
      console.log(`  Range: $${result.range.low.toLocaleString()} - $${result.range.high.toLocaleString()}`);
      console.log(`  Confidence: ${result.confidence}`);
      console.log(`  Comps: ${result.compsUsed}`);
      console.log(`  Rationale: ${result.rationale}`);
      console.log(`  Strengths: ${result.strengths.join(', ')}`);
      console.log(`  Weaknesses: ${result.weaknesses.join(', ')}`);
    }
  }

  // Test 5: End-to-end address → CMA
  console.log('\n--- Test 5: Address → CMA Pipeline ---');
  const testAddr = '500 Commonwealth Ave, Boston, MA 02215';
  try {
    const subjectFromAddr = await addressToSubjectProperty(testAddr, { geocoder: 'census' });
    console.log(`  Input: ${testAddr}`);
    console.log(`  Resolved: ${subjectFromAddr.address}`);
    console.log(`  Polygon: ${subjectFromAddr.polygonId}`);
    console.log(`  Lat/Lon: ${subjectFromAddr.latitude.toFixed(4)}, ${subjectFromAddr.longitude.toFixed(4)}`);
    console.log(`  Property: ${subjectFromAddr.sqft} sqft, ${subjectFromAddr.beds}bd/${subjectFromAddr.baths}ba, built ~${subjectFromAddr.yearBuilt}, condition ${subjectFromAddr.condition}`);
    console.log('  ✓ End-to-end pipeline works!');
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }

  console.log('\n=== All Tests Complete ===');
}

runTests().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});