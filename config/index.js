import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  logLevel: process.env.LOG_LEVEL || 'info',

  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
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

  opencode: {
    apiKey: process.env.OPENCODE_API_KEY,
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