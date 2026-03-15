import config from '../../config/index.js';

class SecretsManager {
  constructor() {
    this.secrets = new Map();
  }

  get(key) {
    const value = process.env[key];
    if (!value) {
      console.warn(`Secret ${key} not found in environment`);
      return null;
    }
    return value;
  }

  getOrFail(key) {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Required secret ${key} not found in environment`);
    }
    return value;
  }

  set(key, value) {
    this.secrets.set(key, value);
  }

  has(key) {
    return !!process.env[key] || this.secrets.has(key);
  }

  getAll() {
    const envKeys = Object.keys(process.env).filter(k => 
      k.includes('KEY') || 
      k.includes('SECRET') || 
      k.includes('PASSWORD') || 
      k.includes('TOKEN')
    );
    
    const secrets = {};
    for (const key of envKeys) {
      secrets[key] = '[SET]';
    }
    
    return secrets;
  }

  validateRequired(requiredSecrets) {
    const missing = [];
    
    for (const secret of requiredSecrets) {
      if (!this.has(secret)) {
        missing.push(secret);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }
}

const secretsManager = new SecretsManager();

export const requiredSecrets = {
  development: [],
  production: ['SUPABASE_URL', 'SUPABASE_KEY'],
  gmail: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  twilio: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
};

export function validateEnvironment() {
  const env = config.env;
  const required = requiredSecrets[env] || [];
  
  return secretsManager.validateRequired(required);
}

export default secretsManager;
export { SecretsManager };