// Provider registry + fallback chain
// Future: add mls.js, attom.js, mock.js as additional sources.
// Order in PROVIDERS determines fallback priority.

import * as rentcast from './rentcast.js';

export const PROVIDERS = {
  rentcast,
  // mls: mlsPin,         // when MLS PIN access arrives
  // attom: attomData,    // backup data source
  // mock: mockData,      // last-resort fallback
};

/**
 * Try providers in order until one returns data.
 * Returns the first non-null result, or null if all fail.
 */
export async function withFallback(method, ...args) {
  const errors = [];
  for (const [name, provider] of Object.entries(PROVIDERS)) {
    if (typeof provider[method] !== 'function') continue;
    try {
      const result = await provider[method](...args);
      if (result !== null && result !== undefined) {
        return { source: name, data: result };
      }
    } catch (e) {
      errors.push({ provider: name, error: e.message });
    }
  }
  return { source: null, data: null, errors };
}

export { rentcast };
