// RentCast API client — plain fetch, no extra deps
const RENTCAST_BASE = 'https://api.rentcast.io/v1';
const API_KEY = process.env.RENTCAST_API_KEY;

if (!API_KEY) {
  console.warn('[rentcast] RENTCAST_API_KEY not set — calls will fail');
}

async function fetchWithAuth(path, params = {}) {
  const url = new URL(`${RENTCAST_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });

  const res = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X-Api-Key': API_KEY || '',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`RentCast ${res.status}: ${text || res.statusText}`);
  }

  return res.json();
}

/**
 * Get comparable sold properties for a subject address
 * @param {string} address - Subject property address
 * @param {Object} opts - Options
 * @param {number} opts.radius - Search radius in miles (default: 1)
 * @param {number} opts.limit - Max comps to return (default: 20)
 * @param {number} opts.daysOld - Max days since sale (default: 180)
 * @returns {Promise<Array>} Normalized comp objects
 */
export async function getComps(address, { radius = 1, limit = 20, daysOld = 180 } = {}) {
  const data = await fetchWithAuth('/properties/sale/comparables', {
    address,
    radius,
    limit,
    daysOld,
  });

  // Normalize RentCast response to our internal shape
  const raw = data?.comparables || data?.properties || [];
  return raw.map(normalizeComp);
}

/**
 * Get property details by address (for subject property)
 */
export async function getPropertyDetails(address) {
  const data = await fetchWithAuth('/properties/sale', { address });
  const prop = data?.properties?.[0] || data;
  return normalizeProperty(prop);
}

/**
 * Search sold properties in a city/state (broader fallback)
 */
export async function searchSold({ city = 'Boston', state = 'MA', status = 'sold', limit = 50 } = {}) {
  const data = await fetchWithAuth('/properties', { city, state, status, limit });
  const raw = data?.properties || [];
  return raw.map(normalizeComp);
}

function normalizeComp(raw) {
  return {
    id: raw.id || raw.propertyId || `${raw.address?.replace(/\s+/g, '_')}_${raw.saleDate || raw.soldDate}`,
    address: raw.formattedAddress || raw.address,
    addressLine1: raw.addressLine1 || raw.address,
    city: raw.city,
    state: raw.state,
    zipCode: raw.zipCode,
    lat: raw.latitude ?? raw.lat,
    lon: raw.longitude ?? raw.lon,
    salePrice: raw.salePrice ?? raw.price ?? raw.soldPrice,
    saleDate: raw.saleDate ?? raw.soldDate ?? raw.lastSaleDate,
    sqft: raw.squareFootage ?? raw.sqft ?? raw.livingArea,
    beds: raw.bedrooms ?? raw.beds,
    baths: raw.bathrooms ?? raw.baths,
    propertyType: raw.propertyType ?? raw.type,
    yearBuilt: raw.yearBuilt,
    lotSize: raw.lotSize,
    daysOnMarket: raw.daysOnMarket,
    distance: raw.distance, // miles from subject (if comparables endpoint)
    hoaFee: raw.hoaFee,
    source: 'rentcast',
    raw,
  };
}

function normalizeProperty(raw) {
  const base = normalizeComp(raw);
  return {
    ...base,
    avm: raw.avm || raw.estimate, // RentCast AVM if available
    avmRangeLow: raw.avmRangeLow,
    avmRangeHigh: raw.avmRangeHigh,
  };
}

export { normalizeComp, normalizeProperty };