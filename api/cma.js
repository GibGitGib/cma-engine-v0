// Vercel API endpoint for CMA generation
// GET /api/cma?address=500+Commonwealth+Ave,+Boston,+MA+02215

import { addressToSubjectProperty, geocodeCensus, resolvePolygonId } from '../lib/geocode.js';
import { selectComps } from '../lib/comps.js';
import { runOptimizer } from '../lib/optimizer.js';
import { getAllMethods } from '../lib/methods/index.js';
import { CompRecord, MarketContext } from '../lib/types.js';
import * as rentcast from '../lib/providers/rentcast.js';

const HAS_RENTCAST = !!process.env.RENTCAST_API_KEY;

const basePrices = {
  'back-bay': 1300000, 'beacon-hill': 1350000, 'south-end': 950000,
  'fenway-kenmore': 850000, 'mission-hill': 800000, 'roxbury': 650000,
  'dorchester': 550000, 'mattapan': 450000, 'hyde-park': 450000,
  'west-roxbury': 550000, 'roslindale': 500000, 'jamaica-plain': 750000,
  'brighton': 650000, 'allston': 650000, 'charlestown': 900000,
  'east-boston': 550000, 'south-boston': 800000, 'south-boston-waterfront': 1100000,
  'downtown': 850000, 'chinatown': 800000, 'leather-district': 850000,
  'bay-village': 900000, 'north-end': 850000, 'west-end': 750000,
  'longwood-medical-area': 800000,
};

const streetNames = {
  'back-bay': 'Commonwealth Ave', 'beacon-hill': 'Beacon St', 'south-end': 'Washington St',
  'fenway-kenmore': 'Boylston St', 'mission-hill': 'Huntington Ave', 'roxbury': 'Dudley St',
  'dorchester': 'Dorchester Ave', 'charlestown': 'Bunker Hill St', 'east-boston': 'Meridian St',
  'south-boston': 'Broadway', 'jamaica-plain': 'Centre St', 'brighton': 'Washington St',
  'default': 'Main St',
};

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: 'Missing address parameter' });

  // Surface env-misconfig early so users get a useful error
  if (!HAS_RENTCAST) {
    console.warn('[cma] RENTCAST_API_KEY not set — using mock comps only');
  }

  let subject;
  let realComps = null;     // populated if RentCast is configured
  let realSubjectRecord = null;
  let dataSource = 'mock';

  try {
    // 1. Try RentCast for real property data (address → full record + sold comps)
    if (HAS_RENTCAST) {
      try {
        realSubjectRecord = await rentcast.getPropertyRecord(address);
        if (realSubjectRecord) {
          const subjectFromRC = rentcast.rentcastToSubject(realSubjectRecord);
          // Resolve polygon (still need Census for that)
          let polygonId = 'unknown';
          if (realSubjectRecord.latitude && realSubjectRecord.longitude) {
            polygonId = resolvePolygonId(
              realSubjectRecord.latitude,
              realSubjectRecord.longitude
            );
          }
          subject = { ...subjectFromRC, polygonId };
          dataSource = 'rentcast';

          // Real sold comps within 1 mile
          const sold = await rentcast.getComparableSoldProperties({
            address,
            radius: 1,
            propertyType: realSubjectRecord.propertyType,
            bedrooms: realSubjectRecord.bedrooms,
            bathrooms: realSubjectRecord.bathrooms,
            squareFootage: realSubjectRecord.squareFootage,
            saleDateRange: 180,
            limit: 25,
          });
          realComps = (sold || []).map((r) => rentcast.rentcastToComp(r, address)).filter(Boolean);
        }
      } catch (e) {
        console.warn('[cma] RentCast lookup failed, falling back:', e.message);
      }
    }

    // 2. Fall back to Census geocoder + mock property data
    if (!subject) {
      subject = await addressToSubjectProperty(address, { geocoder: 'census' });
    }

    // 3. Build comp set: real if we have it, else mock
    const comps = realComps && realComps.length >= 5
      ? realComps
      : generateMockComps(subject);
    if (realComps && realComps.length < 5) {
      console.warn(`[cma] Only ${realComps.length} real comps — supplementing with mock`);
    }

    // 4. Select comps with min-5 rule
    const compSelection = selectComps(subject, comps, { minComps: 5, lookbackDays: 180 });

    // 5. Create market context
    const marketData = createMarketData(subject.polygonId);

    // 6. Run all methods
    const methods = getAllMethods();
    const methodResults = {};
    for (const method of methods) {
      try {
        const result = method(subject, compSelection.comps, marketData);
        methodResults[method.name] = result;
      } catch (e) {
        methodResults[method.name] = { success: false, error: e.message, name: method.name };
      }
    }

    // 7. Run optimizer
    const optimizerResult = runOptimizer(methodResults, subject, compSelection.comps, marketData);

    // 8. Build response
    return res.status(200).json({
      address: subject.address,
      polygonId: subject.polygonId,
      coordinates: { lat: subject.latitude, lon: subject.longitude },
      property: {
        type: subject.propertyType,
        sqft: subject.sqft,
        beds: subject.beds,
        baths: subject.baths,
        yearBuilt: subject.yearBuilt,
        condition: subject.condition,
      },
      comps: {
        selected: compSelection.comps.length,
        comps: compSelection.comps,           // include actual comps now
        explanation: compSelection.explanation.toString(),
      },
      methods: methodResults,
      estimate: {
        point: optimizerResult.pointEstimate,
        range: optimizerResult.range,
        confidence: optimizerResult.confidence,
        explanation: optimizerResult.explanation,
        methodWeights: optimizerResult.methodWeights,
        ambiguity: optimizerResult.ambiguity,
      },
      dataSource,                              // 'rentcast' or 'mock'
      meta: {
        timestamp: new Date().toISOString(),
        version: '0.1.0',
      },
    });
  } catch (err) {
    console.error('CMA error:', err);
    return res.status(500).json({ error: err.message });
  }
}

function generateMockComps(subject) {
  const basePrice = basePrices[subject.polygonId] || 700000;
  const street = streetNames[subject.polygonId] || streetNames.default;
  const comps = [];
  const now = new Date();
  
  for (let i = 1; i <= 8; i++) {
    const variation = 0.85 + Math.random() * 0.3; // 85-115%
    const salePrice = Math.round(basePrice * variation);
    const daysAgo = 15 + Math.floor(Math.random() * 150);
    const saleDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    
    const sqftVariation = 0.85 + Math.random() * 0.3;
    const sqft = Math.round(subject.sqft * sqftVariation);
    
    const latOffset = (Math.random() - 0.5) * 0.01;
    const lonOffset = (Math.random() - 0.5) * 0.01;
    
    comps.push(new CompRecord({
      id: `comp-${i}`,
      address: `${100 + i * 5} ${street}, Boston, MA`,
      polygonId: subject.polygonId,
      propertyType: subject.propertyType,
      status: 'sold',
      sqft,
      beds: Math.max(1, subject.beds + Math.floor(Math.random() * 3) - 1),
      baths: Math.max(1, subject.baths + (Math.random() - 0.5)),
      yearBuilt: subject.yearBuilt + Math.floor(Math.random() * 20) - 10,
      condition: Math.max(1, Math.min(5, subject.condition + Math.floor(Math.random() * 3) - 1)),
      lotSqft: subject.lotSqft || 2500,
      salePrice,
      saleDate: saleDate.toISOString(),
      latitude: subject.latitude + latOffset,
      longitude: subject.longitude + lonOffset,
      source: 'mock',
    }));
  }
  return comps;
}

function createMarketData(polygonId) {
  const base = basePrices[polygonId] || 700000;
  return new MarketContext({
    activeListings: [],
    recentSolds: [],
    microMarketStats: {
      [polygonId]: {
        medianPrice: base,
        monthsOfInventory: 2.5,
        domTrend: -0.05,
        listToSaleRatio: 0.98,
        ppsf: Math.round(base / 1800),
        grm: 12.5,
        capRate: 0.055,
        landValue: Math.round(base * 0.35),
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
      { date: '2024-01', polygonId, medianPrice: Math.round(base * 0.97) },
      { date: '2024-02', polygonId, medianPrice: Math.round(base * 0.98) },
      { date: '2024-03', polygonId, medianPrice: Math.round(base * 0.99) },
      { date: '2024-04', polygonId, medianPrice: base },
      { date: '2024-05', polygonId, medianPrice: Math.round(base * 1.01) },
    ],
    ppsfiByPolygon: { [polygonId]: Math.round(base / 1800) },
    grmByPolygon: { [polygonId]: 12.5 },
    capRateByPolygon: { [polygonId]: 0.055 },
    landValues: { [polygonId]: Math.round(base * 0.35) },
    replacementCostPerSqft: { single: 180 },
    totalEconomicLife: { single: 60 },
    rentPerSqftByPolygon: { [polygonId]: 3.50 },
    rentPerSqft: 3.50,
    listToSaleRatio: { [polygonId]: 0.98, default: 0.97 },
    absorptionRate: 2.5,
    monthsOfInventory: 2.5,
    domTrend: -0.05,
    zestimate: Math.round(base * 0.99),
    redfinEstimate: Math.round(base * 1.01),
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
    subjectPriorSale: null,
    dataAgeMonths: 0,
  });
}