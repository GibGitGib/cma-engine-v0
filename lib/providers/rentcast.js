// RentCast API client
// Docs: https://developers.rentcast.io/
// Env: RENTCAST_API_KEY required

const BASE_URL = 'https://api.rentcast.io/v1';
const API_KEY = process.env.RENTCAST_API_KEY;

if (!API_KEY) {
  console.warn('[rentcast] RENTCAST_API_KEY not set — calls will fail');
}

async function request(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, v);
    }
  });

  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'X-Api-Key': API_KEY || '',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`RentCast ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Get property record by address
 * Returns full property details: sqft, beds, baths, year built, lot size, etc.
 */
export async function getPropertyRecord(address) {
  const data = await request('/properties', { address });
  if (!data || data.length === 0) return null;
  return data[0];
}

/**
 * Get comparable sold properties near an address
 * Used for CMA sales-comparison method
 */
export async function getComparableSoldProperties({
  address,
  radius = 1,           // miles
  propertyType,         // 'Single Family', 'Condo', etc.
  bedrooms,
  bathrooms,
  squareFootage,
  saleDateRange = 180,   // days back
  limit = 25,
}) {
  const params = {
    address,
    radius,
    saleDateRange,
    limit,
  };
  if (propertyType) params.propertyType = propertyType;
  if (bedrooms !== undefined) params.bedrooms = bedrooms;
  if (bathrooms !== undefined) {
    params.bathrooms = typeof bathrooms === 'string' && bathrooms.includes(':')
      ? bathrooms
      : bathrooms;
  }
  if (squareFootage !== undefined) params.squareFootage = squareFootage;

  return request('/properties', params);
}

/**
 * Get active sale listings (homes for sale right now) near an address
 * Useful for showing competing inventory
 */
export async function getActiveListings({
  address,
  radius = 1,
  propertyType,
  bedrooms,
  bathrooms,
  limit = 25,
}) {
  const params = { address, radius, limit, status: 'Active' };
  if (propertyType) params.propertyType = propertyType;
  if (bedrooms !== undefined) params.bedrooms = bedrooms;
  if (bathrooms !== undefined) params.bathrooms = bathrooms;
  return request('/listings/sale', params);
}

/**
 * Get AVM (automated valuation) for an address
 * Returns RentCast's own value estimate
 */
export async function getAVM(address) {
  const data = await request('/avm/value', { address });
  return data;
}

/**
 * Get rent estimate (long-term rent) for an address
 * Useful for the income approach in CMAs
 */
export async function getRentEstimate(address) {
  return request('/avm/rent/long-term', { address });
}

/**
 * Convert a RentCast property record to our internal SubjectProperty shape.
 * Field names mapped to match lib/types.js
 */
export function rentcastToSubject(record) {
  if (!record) return null;
  return {
    address: record.formattedAddress,
    polygonId: record.county ? record.county.toLowerCase().replace(/\s+/g, '-') : 'unknown',
    propertyType: normalizePropertyType(record.propertyType),
    sqft: record.squareFootage || null,
    beds: record.bedrooms || null,
    baths: record.bathrooms || null,
    yearBuilt: record.yearBuilt || null,
    condition: 3, // RentCast doesn't provide condition; default to "average"
    lotSqft: record.lotSize || null,
    hoaFee: record.hoa?.fee || 0,
    latitude: record.latitude,
    longitude: record.longitude,
    lastSaleDate: record.lastSaleDate,
    lastSalePrice: record.lastSalePrice,
    features: record.features || {},
  };
}

/**
 * Convert a RentCast sold property to our internal CompRecord shape.
 */
export function rentcastToComp(record, subjectAddress) {
  if (!record) return null;
  return {
    address: record.formattedAddress,
    salePrice: record.lastSalePrice,
    saleDate: record.lastSaleDate,
    sqft: record.squareFootage,
    beds: record.bedrooms,
    baths: record.bathrooms,
    yearBuilt: record.yearBuilt,
    latitude: record.latitude,
    longitude: record.longitude,
    distanceMiles: null, // computed elsewhere
    daysAgo: null,       // computed elsewhere
    source: 'rentcast',
  };
}

function normalizePropertyType(t) {
  if (!t) return 'single';
  const lower = t.toLowerCase();
  if (lower.includes('condo')) return 'condo';
  if (lower.includes('multi')) return lower.includes('4') ? 'multi_family_4plus' : 'multi_family_2';
  if (lower.includes('town')) return 'townhouse';
  return 'single';
}

export const PROVIDER_NAME = 'rentcast';