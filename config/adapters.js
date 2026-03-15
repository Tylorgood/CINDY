export const adapterConfigs = {
  gmail: {
    name: 'Gmail',
    provider: 'google',
    authType: 'oauth2',
    capabilities: ['read', 'list', 'draft', 'send'],
    rateLimits: {
      requestsPerSecond: 10,
      dailyQuota: 100000,
    },
    requiredScopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
    ],
  },

  calendar: {
    name: 'Google Calendar',
    provider: 'google',
    authType: 'oauth2',
    capabilities: ['read', 'list', 'create', 'update', 'delete'],
    rateLimits: {
      requestsPerSecond: 10,
      dailyQuota: 50000,
    },
    requiredScopes: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  },

  sms: {
    name: 'Twilio SMS',
    provider: 'twilio',
    authType: 'api_key',
    capabilities: ['send', 'status'],
    rateLimits: {
      requestsPerSecond: 5,
      monthlyQuota: 500,
    },
    requiredConfig: ['accountSid', 'authToken', 'phoneNumber'],
  },

  voice: {
    name: 'Twilio Voice',
    provider: 'twilio',
    authType: 'api_key',
    capabilities: ['call', 'status'],
    rateLimits: {
      requestsPerSecond: 2,
      monthlyQuota: 100,
    },
    requiredConfig: ['accountSid', 'authToken', 'phoneNumber'],
  },

  storage: {
    name: 'Supabase Storage',
    provider: 'supabase',
    authType: 'api_key',
    capabilities: ['read', 'write', 'delete'],
    rateLimits: {
      requestsPerSecond: 20,
      monthlyQuota: 'unlimited',
    },
    requiredConfig: ['url', 'key'],
  },
};

export function getAdapterConfig(adapterName) {
  return adapterConfigs[adapterName] || null;
}

export function getAdapterCapabilities(adapterName) {
  const config = getAdapterConfig(adapterName);
  return config ? config.capabilities : [];
}

export function validateAdapterConfig(adapterName, config) {
  const adapter = getAdapterConfig(adapterName);
  if (!adapter) {
    return { valid: false, error: `Unknown adapter: ${adapterName}` };
  }

  if (adapter.requiredConfig) {
    const missing = adapter.requiredConfig.filter((key) => !config[key]);
    if (missing.length > 0) {
      return { valid: false, error: `Missing config: ${missing.join(', ')}` };
    }
  }

  return { valid: true };
}