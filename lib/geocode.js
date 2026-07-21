// Geocoding + Polygon Resolution for Boston CMA
// Uses US Census Bureau Geocoder (free, no key) + local GeoJSON polygons

import { SubjectProperty } from './types.js';
import fs from 'fs';
import path from 'path';

// Load neighborhood polygons from GeoJSON
const GEOJSON_PATH = path.resolve('./lib/data/ma-neighborhoods.geojson');
const NEIGHBORHOODS = JSON.parse(fs.readFileSync(GEOJSON_PATH, 'utf-8')).features;

/**
 * Point-in-polygon test (ray casting)
 */
function pointInPolygon(lon, lat, polygon) {
  // polygon: [[[lon, lat], [lon, lat], ...]] - GeoJSON format
  const coords = polygon[0];
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [xi, yi] = coords[i];
    const [xj, yj] = coords[j];
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Resolve polygon ID from lat/lon
 */
export function resolvePolygonId(lat, lon) {
  for (const feature of NEIGHBORHOODS) {
    if (pointInPolygon(lon, lat, feature.geometry.coordinates)) {
      return feature.properties.NEIGHBORHOOD.toLowerCase().replace(/\s+/g, '-');
    }
  }
  return 'unknown';
}

/**
 * Get adjacent polygons (neighbors sharing boundary)
 */
export function getAdjacentPolygons(polygonId) {
  const target = NEIGHBORHOODS.find(f => 
    f.properties.NEIGHBORHOOD.toLowerCase().replace(/\s+/g, '-') === polygonId
  );
  if (!target) return [];

  const adjacent = [];
  for (const feature of NEIGHBORHOODS) {
    const otherId = feature.properties.NEIGHBORHOOD.toLowerCase().replace(/\s+/g, '-');
    if (otherId === polygonId) continue;
    if (polygonsTouch(target.geometry, feature.geometry)) {
      adjacent.push(otherId);
    }
  }
  return adjacent;
}

function polygonsTouch(poly1, poly2) {
  // Simple check: any vertex of poly1 in poly2 or vice versa
  const coords1 = poly1.coordinates[0];
  const coords2 = poly2.coordinates[0];
  
  for (const [lon, lat] of coords1) {
    if (pointInPolygon(lon, lat, poly2.coordinates)) return true;
  }
  for (const [lon, lat] of coords2) {
    if (pointInPolygon(lon, lat, poly1.coordinates)) return true;
  }
  return false;
}

/**
 * US Census Bureau Geocoder (free, no API key)
 * https://geocoding.geo.census.gov/geocoder/
 */
export async function geocodeCensus(address) {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
  const res = await fetch(url);
  const data = await res.json();
  
  if (!data.result?.addressMatches?.length) {
    throw new Error(`No match for: ${address}`);
  }
  
  const match = data.result.addressMatches[0];
  return {
    lat: match.coordinates.y,
    lon: match.coordinates.x,
    formattedAddress: match.matchedAddress,
    components: {
      street: match.addressComponents?.streetName,
      city: match.addressComponents?.city,
      state: match.addressComponents?.state,
      zip: match.addressComponents?.zip,
    },
  };
}

/**
 * Google Maps Geocoding API (requires key, higher accuracy)
 */
export async function geocodeGoogle(address, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  
  if (data.status !== 'OK' || !data.results.length) {
    throw new Error(`Google geocoding failed: ${data.status}`);
  }
  
  const result = data.results[0];
  return {
    lat: result.geometry.location.lat,
    lon: result.geometry.location.lng,
    formattedAddress: result.formatted_address,
    placeId: result.place_id,
    components: result.address_components.reduce((acc, c) => {
      acc[c.types[0]] = c.long_name;
      return acc;
    }, {}),
  };
}

/**
 * Full pipeline: address → SubjectProperty
 */
export async function addressToSubjectProperty(address, options = {}) {
  const { 
    geocoder = 'census',
    googleApiKey = null,
    propertyType = 'single',
    sqft = null,
    beds = null,
    baths = null,
    yearBuilt = null,
    conditionOverride = null,
  } = options;

  // 1. Geocode
  let geo;
  if (geocoder === 'google' && googleApiKey) {
    geo = await geocodeGoogle(address, googleApiKey);
  } else {
    geo = await geocodeCensus(address);
  }

  // 2. Resolve polygon
  const polygonId = resolvePolygonId(geo.lat, geo.lon);

  // 3. Estimate condition from age
  const currentYear = new Date().getFullYear();
  const estimatedYear = yearBuilt || estimateYearBuilt(polygonId);
  const age = currentYear - estimatedYear;
  let estimatedCondition = 3;
  if (age <= 5) estimatedCondition = 5;
  else if (age <= 15) estimatedCondition = 4;
  else if (age <= 30) estimatedCondition = 3;
  else if (age <= 60) estimatedCondition = 2;
  else estimatedCondition = 1;

  // 4. Build SubjectProperty
  return new SubjectProperty({
    address: geo.formattedAddress,
    polygonId,
    propertyType,
    sqft: sqft || estimateSqft(propertyType),
    beds: beds || estimateBeds(propertyType),
    baths: baths || estimateBaths(propertyType),
    yearBuilt: estimatedYear,
    condition: conditionOverride || estimatedCondition,
    latitude: geo.lat,
    longitude: geo.lon,
  });
}

function estimateYearBuilt(polygonId) {
  // Rough neighborhood-era mapping
  const era = {
    'back-bay': 1890, 'beacon-hill': 1850, 'south-end': 1870,
    'fenway-kenmore': 1910, 'mission-hill': 1900, 'roxbury': 1920,
    'dorchester': 1940, 'mattapan': 1950, 'hyde-park': 1960,
    'west-roxbury': 1960, 'roslindale': 1930, 'jamaica-plain': 1910,
    'brighton': 1920, 'allston': 1920, 'charlestown': 1880,
    'east-boston': 1900, 'south-boston': 1920, 'south-boston-waterfront': 2000,
    'downtown': 1900, 'chinatown': 1900, 'leather-district': 1890,
    'bay-village': 1880, 'north-end': 1850, 'west-end': 1950,
    'longwood-medical-area': 1920,
  };
  return era[polygonId] || 1950;
}

function estimateSqft(type) {
  const map = { single: 1800, condo: 1100, 'multi_family_2': 2200, 'multi_family_3': 2800, 'multi_family_4plus': 3500 };
  return map[type] || 1800;
}

function estimateBeds(type) {
  const map = { single: 3, condo: 2, 'multi_family_2': 4, 'multi_family_3': 6, 'multi_family_4plus': 8 };
  return map[type] || 3;
}

function estimateBaths(type) {
  const map = { single: 2, condo: 1.5, 'multi_family_2': 2, 'multi_family_3': 3, 'multi_family_4plus': 4 };
  return map[type] || 2;
}

export { NEIGHBORHOODS };