// Shared types and result wrapper

export class MethodResult {
  constructor({ success, method, label, estimate, range, confidence, compsUsed, rationale, strengths, weaknesses, details, error }) {
    this.success = success;
    this.method = method;
    this.label = label;
    this.estimate = estimate;
    this.range = range;
    this.confidence = confidence;
    this.compsUsed = compsUsed;
    this.rationale = rationale;
    this.strengths = strengths;
    this.weaknesses = weaknesses;
    this.details = details;
    this.error = error;
  }

  static success(data) {
    return new MethodResult({ success: true, ...data });
  }

  static failure(error) {
    return new MethodResult({ success: false, error });
  }

  toJSON() {
    const { success, method, label, estimate, range, confidence, compsUsed, rationale, strengths, weaknesses, details, error } = this;
    return { success, method, label, estimate, range, confidence, compsUsed, rationale, strengths, weaknesses, details, error };
  }
}

// Subject property input
export class SubjectProperty {
  constructor(data = {}) {
    this.address = data.address || '';
    this.polygonId = data.polygonId || null;
    this.propertyType = data.propertyType || 'single';
    this.sqft = data.sqft || 0;
    this.beds = data.beds || 0;
    this.baths = data.baths || 0;
    this.halfBaths = data.halfBaths || 0;
    this.yearBuilt = data.yearBuilt || 0;
    this.condition = data.condition || 3;
    this.lotSqft = data.lotSqft || 0;
    this.garageSpaces = data.garageSpaces || 0;
    this.hoaFee = data.hoaFee || 0;
    this.buildingId = data.buildingId || null;
    this.latitude = data.latitude || 0;
    this.longitude = data.longitude || 0;
    this.annualRent = data.annualRent || null;
    this.units = data.units || 1;
    this.operatingExpenses = data.operatingExpenses || null;
    this.priorSalePrice = data.priorSalePrice || null;
    this.priorSaleDate = data.priorSaleDate || null;
  }
}

// Comp record (normalized)
export class CompRecord {
  constructor(data = {}) {
    this.id = data.id || '';
    this.address = data.address || '';
    this.polygonId = data.polygonId || null;
    this.propertyType = data.propertyType || 'single';
    this.status = data.status || 'sold';
    this.sqft = data.sqft || 0;
    this.beds = data.beds || 0;
    this.baths = data.baths || 0;
    this.halfBaths = data.halfBaths || 0;
    this.yearBuilt = data.yearBuilt || 0;
    this.condition = data.condition || 3;
    this.lotSqft = data.lotSqft || 0;
    this.garageSpaces = data.garageSpaces || 0;
    this.hoaFee = data.hoaFee || 0;
    this.buildingId = data.buildingId || null;
    this.listPrice = data.listPrice || 0;
    this.salePrice = data.salePrice || 0;
    this.listDate = data.listDate || null;
    this.saleDate = data.saleDate || null;
    this.dom = data.dom || 0;
    this.latitude = data.latitude || 0;
    this.longitude = data.longitude || 0;
    this.source = data.source || 'manual';
    this.provenance = data.provenance || {};
    this.distanceMiles = data.distanceMiles || null;
    this.priorSalePrice = data.priorSalePrice || null;
    this.priorSaleDate = data.priorSaleDate || null;
  }
}

// Market data context
export class MarketContext {
  constructor(data = {}) {
    this.activeListings = data.activeListings || [];
    this.recentSolds = data.recentSolds || [];
    this.pendingSales = data.pendingSales || [];
    this.microMarketStats = data.microMarketStats || {};
    this.neighborhoodPolys = data.neighborhoodPolys || {};
    this.tStations = data.tStations || [];
    this.hpiIndex = data.hpiIndex || [];
    this.medianHistory = data.medianHistory || [];
    this.ppsfiByPolygon = data.ppsfiByPolygon || {};
    this.grmByPolygon = data.grmByPolygon || {};
    this.capRateByPolygon = data.capRateByPolygon || {};
    this.landValues = data.landValues || {};
    this.replacementCostPerSqft = data.replacementCostPerSqft || {};
    this.totalEconomicLife = data.totalEconomicLife || {};
    this.rentPerSqftByPolygon = data.rentPerSqftByPolygon || {};
    this.rentPerSqft = data.rentPerSqft || 0;
    this.listToSaleRatio = data.listToSaleRatio || {};
    this.absorptionRate = data.absorptionRate || 0;
    this.monthsOfInventory = data.monthsOfInventory || 0;
    this.domTrend = data.domTrend || 0;
    this.zestimate = data.zestimate || null;
    this.redfinEstimate = data.redfinEstimate || null;
    this.hedonicCoefficients = data.hedonicCoefficients || {};
    this.hedonicResiduals = data.hedonicResiduals || [];
    this.hedonicSampleSize = data.hedonicSampleSize || 0;
    this.hedonicRSquared = data.hedonicRSquared || 0;
    this.subjectPriorSale = data.subjectPriorSale || null;
    this.dataAgeMonths = data.dataAgeMonths || 0;
    this.baseEstimate = data.baseEstimate || null;
    this.grossRentMultiplier = data.grossRentMultiplier || null;
    this.capRate = data.capRate || null;
    this.marketRent = data.marketRent || {};
    this.subjectGrossRent = data.subjectGrossRent || null;
  }
}

export const PROPERTY_TYPES = [
  'single_family',
  'condo',
  'multi_family_2',
  'multi_family_3',
  'multi_family_4plus',
  'townhouse',
  'coop',
  'land',
];

export const LISTING_STATUSES = [
  'active',
  'pending',
  'sold',
  'off_market',
];