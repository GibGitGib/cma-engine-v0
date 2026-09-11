// RentCast API client
// Docs: https://developers.rentcast.io/
// Env: RENTCAST_API_KEY required
// Includes 24h/6h response caching to stay within 50 calls/month free tier

import * as cache from './cache.js';
import { CompRecord } from '../types.js';

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
    let detail = text.slice(0, 200);
    try {
      const j = JSON.parse(text);
      detail = `${j.status || res.status} ${j.error || ''}: ${j.message || ''}`;
    } catch {}
    throw new Error(`RentCast ${res.status} ${detail}`);
  }
  const data = await res.json();
  // RentCast returns {status, error, message} on auth/billing issues with HTTP 200 sometimes
  if (data && data.status && data.status >= 400) {
    throw new Error(`RentCast ${data.status}: ${data.error || data.message || 'unknown error'}`);
  }
  return data;
}

/**
 * Get property record by address
 * Returns full property details: sqft, beds, baths, year built, lot size, etc.
 * Cached for 24h.
 */
export async function getPropertyRecord(address) {
  const cacheKey = { fn: 'getPropertyRecord', address };
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const data = await request('/properties', { address });
  const result = !data || data.length === 0 ? null : data[0];
  cache.set(cacheKey, result);
  return result;
}

/**
 * Get comparable sold properties near an address
 * Used for CMA sales-comparison method
 * Cached for 6h (comps are more volatile than property records).
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

  const cacheKey = { fn: 'getComparableSoldProperties', ...params };
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const result = await request('/properties', params);
  cache.set(cacheKey, result, cache.TTL.COMPS);
  return result;
}

/**
 * Get active sale listings (homes for sale right now) near an address
 * Useful for showing competing inventory
 * Cached for 6h.
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

  const cacheKey = { fn: 'getActiveListings', ...params };
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const result = await request('/listings/sale', params);
  cache.set(cacheKey, result, cache.TTL.COMPS);
  return result;
}

/**
 * Get AVM (automated valuation) for an address
 * Returns RentCast's own value estimate
 * Cached for 24h.
 */
export async function getAVM(address) {
  const cacheKey = { fn: 'getAVM', address };
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const data = await request('/avm/value', { address });
  cache.set(cacheKey, data);
  return data;
}

/**
 * Get rent estimate (long-term rent) for an address
 * Useful for the income approach in CMAs
 * Cached for 24h.
 */
export async function getRentEstimate(address) {
  const cacheKey = { fn: 'getRentEstimate', address };
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const result = await request('/avm/rent/long-term', { address });
  cache.set(cacheKey, result);
  return result;
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
 * Returns a full CompRecord so it survives selectComps() filtering, which
 * requires status/propertyType/polygonId. polygonId is left null here and
 * resolved by the caller from lat/lon (a geo concern, not a data-provider one).
 * Records with no sale price/date are dropped — they are not usable comps.
 */
export function rentcastToComp(record) {
  if (!record) return null;
  if (!record.lastSalePrice || !record.lastSaleDate) return null;
  return new CompRecord({
    id: record.id || record.formattedAddress || undefined,
    address: record.formattedAddress,
    polygonId: null, // resolved by caller from lat/lon
    propertyType: normalizePropertyType(record.propertyType),
    status: 'sold',
    salePrice: record.lastSalePrice,
    saleDate: record.lastSaleDate,
    sqft: record.squareFootage || 0,
    beds: record.bedrooms || 0,
    baths: record.bathrooms || 0,
    yearBuilt: record.yearBuilt || 0,
    condition: 3, // RentCast doesn't provide condition; default to "average"
    lotSqft: record.lotSize || 0,
    hoaFee: record.hoa?.fee || 0,
    latitude: record.latitude || 0,
    longitude: record.longitude || 0,
    source: 'rentcast',
  });
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