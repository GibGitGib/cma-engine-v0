// Manual entry provider — licensee enters comps/sales by hand
// Used when MLS/licensed APIs aren't available or for edge cases

const STORAGE_KEY = 'manual_comps_v1';

export function getManualComps() {
  if (typeof window === 'undefined') return []; // SSR guard
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveManualComp(comp) {
  const comps = getManualComps();
  const withMeta = {
    ...comp,
    id: comp.id || `manual_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    source: 'manual',
    enteredAt: new Date().toISOString(),
    enteredBy: comp.enteredBy || 'licensee',
  };
  comps.unshift(withMeta);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(comps));
  return withMeta;
}

export function deleteManualComp(id) {
  const comps = getManualComps().filter(c => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(comps));
}

export function clearManualComps() {
  localStorage.removeItem(STORAGE_KEY);
}

// Normalize manual entry to internal comp shape
export function normalizeManualComp(input) {
  return {
    id: input.id,
    address: input.address,
    addressLine1: input.addressLine1,
    city: input.city || 'Boston',
    state: input.state || 'MA',
    zipCode: input.zipCode,
    lat: input.lat,
    lon: input.lon,
    salePrice: input.salePrice,
    saleDate: input.saleDate,
    sqft: input.sqft,
    beds: input.beds,
    baths: input.baths,
    propertyType: input.propertyType,
    yearBuilt: input.yearBuilt,
    lotSize: input.lotSize,
    daysOnMarket: input.daysOnMarket,
    hoaFee: input.hoaFee,
    source: 'manual',
    raw: input,
  };
}