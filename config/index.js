import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveAIProvider(env) {
  if (env.AI_PROVIDER) return env.AI_PROVIDER;
  if (env.OPENROUTER_API_KEY) return 'openrouter';
  if (env.GROQ_API_KEY) return 'groq';
  if (env.OPENAI_API_KEY) return 'openai';
  if (env.AI_BASE_URL && env.AI_API_KEY) return 'custom';
  return null;
}

function resolveAIKey(provider, env) {
  if (!provider) return null;

  switch (provider) {
    case 'openrouter':
      return env.OPENROUTER_API_KEY || env.AI_API_KEY || null;
    case 'groq':
      return env.GROQ_API_KEY || env.AI_API_KEY || null;
    case 'openai':
      return env.OPENAI_API_KEY || env.AI_API_KEY || null;
    case 'custom':
      return env.AI_API_KEY || env.OPENAI_API_KEY || env.OPENROUTER_API_KEY || env.GROQ_API_KEY || null;
    default:
      return env.AI_API_KEY || null;
  }
}

function resolveAIBaseUrl(provider, env) {
  if (env.AI_BASE_URL) return env.AI_BASE_URL;

  switch (provider) {
    case 'openrouter':
      return 'https://openrouter.ai/api/v1';
    case 'groq':
      return 'https://api.groq.com/openai/v1';
    default:
      return null;
  }
}

function resolveAIModel(provider, env) {
  if (env.AI_MODEL) return env.AI_MODEL;

  switch (provider) {
    case 'openrouter':
      return env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free';
    case 'groq':
      return env.GROQ_MODEL || 'llama-3.1-8b-instant';
    case 'openai':
      return env.OPENAI_MODEL || 'gpt-4o-mini';
    case 'custom':
      return env.CUSTOM_MODEL || 'llama-3.1-8b-instruct';
    default:
      return null;
  }
}

const aiProvider = resolveAIProvider(process.env);

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  logLevel: process.env.LOG_LEVEL || 'info',

  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY,
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },

  twenty: {
    baseUrl: process.env.TWENTY_BASE_URL || null,
    apiKey: process.env.TWENTY_API_KEY || null,
    workspaceId: process.env.TWENTY_WORKSPACE_ID || null,
  },

  pushover: {
    userKey: process.env.PUSHOVER_USER_KEY,
    appToken: process.env.PUSHOVER_APP_TOKEN,
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },

  groq: {
    apiKey: process.env.GROQ_API_KEY,
  },

  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
  },

  ai: {
    provider: aiProvider,
    apiKey: resolveAIKey(aiProvider, process.env),
    baseUrl: resolveAIBaseUrl(aiProvider, process.env),
    model: resolveAIModel(aiProvider, process.env),
    referer: process.env.OPENROUTER_SITE_URL || process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || null,
    title: process.env.OPENROUTER_APP_NAME || process.env.AI_APP_NAME || process.env.AGENT_NAME || 'CINDY',
  },

  opencode: {
    apiKey: process.env.OPENCODE_API_KEY,
  },

  controlPlane: {
    appUrl: process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || null,
    workerSecret: process.env.CINDY_WORKER_SECRET || null,
    heartbeatSeconds: parseInt(process.env.CINDY_WORKER_HEARTBEAT_SECONDS || '30', 10),
    claimBatchSize: parseInt(process.env.CINDY_WORKER_CLAIM_BATCH_SIZE || '1', 10),
    defaultCodingBackend: process.env.CINDY_DEFAULT_CODING_BACKEND || 'local-codex-bridge',
  },

  user: {
    email: process.env.USER_EMAIL,
    phone: process.env.USER_PHONE,
    timezone: process.env.USER_TIMEZONE || 'America/New_York',
  },

  trustLevels: {
    READ_ONLY: 0,
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
  },

  approvalRequiredFor: [2, 3, 4],
  alwaysRequireApproval: [4],

  paths: {
    root: path.resolve(__dirname, '..'),
    src: path.resolve(__dirname, '..', 'src'),
    config: __dirname,
  },
};

export default config;
