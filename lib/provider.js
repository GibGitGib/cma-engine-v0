// Data provider interface — all providers implement this shape
// Providers: rentcast, attom, mls-pin, manual, mock

export const ProviderNames = {
  RENTCAST: 'rentcast',
  ATTOM: 'attom',
  MLS_PIN: 'mls_pin',
  MANUAL: 'manual',
  MOCK: 'mock',
};

export const ProviderInterface = {
  // Get subject property details
  getProperty: async (address) => {
    throw new Error('Not implemented');
  },

  // Get comparable sold properties
  getComps: async (address, options = {}) => {
    throw new Error('Not implemented');
  },

  // Search sold properties by area (fallback)
  searchSold: async (criteria = {}) => {
    throw new Error('Not implemented');
  },

  // Provider metadata
  name: '',
  requiresCredentials: true,
  rateLimit: { requests: 100, window: '1h' },
};

// Factory to get provider by name
export async function getProvider(name, config = {}) {
  switch (name) {
    case ProviderNames.RENTCAST:
      const { getPropertyDetails, getComps, searchSold } = await import('./rentcast.js');
      return {
        name: ProviderNames.RENTCAST,
        requiresCredentials: true,
        getProperty: getPropertyDetails,
        getComps,
        searchSold,
      };
    case ProviderNames.ATTOM:
      const { getAttomProperty, getAttomComps } = await import('./attom.js');
      return {
        name: ProviderNames.ATTOM,
        requiresCredentials: true,
        getProperty: getAttomProperty,
        getComps: getAttomComps,
        searchSold: async () => [],
      };
    case ProviderNames.MANUAL:
      const { getManualComps, normalizeManualComp } = await import('./manual.js');
      return {
        name: ProviderNames.MANUAL,
        requiresCredentials: false,
        getProperty: async () => null,
        getComps: async () => getManualComps().map(normalizeManualComp),
        searchSold: async () => getManualComps().map(normalizeManualComp),
      };
    case ProviderNames.MOCK:
      const { mockProvider } = await import('./mock.js');
      return mockProvider;
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

// Priority order for fallback
export const PROVIDER_PRIORITY = [
  ProviderNames.RENTCAST,
  ProviderNames.ATTOM,
  ProviderNames.MLS_PIN,
  ProviderNames.MANUAL,
  ProviderNames.MOCK,
];