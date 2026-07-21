// ATTOM Data API client (optional fallback layer)
const ATTOM_BASE = 'https://api.gateway.attomdata.com';
const API_KEY = process.env.ATTOM_API_KEY;

async function fetchAttom(path, params = {}) {
  const url = new URL(`${ATTOM_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });

  const res = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'apikey': API_KEY || '',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ATTOM ${res.status}: ${text || res.statusText}`);
  }

  return res.json();
}

export async function getAttomComps(address, { radius = 1, limit = 20 } = {}) {
  // ATTOM uses different endpoints - this is a stub for when credentials arrive
  console.warn('[attom] Not fully implemented - needs ATTOM_API_KEY');
  return [];
}

export async function getAttomProperty(address) {
  console.warn('[attom] Not fully implemented');
  return null;
}