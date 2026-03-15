import { OAuth2Client } from 'google-auth-library';
import config from '../../../config/index.js';
import storageAdapter from '../adapters/storage/index.js';

class GoogleAuthClient {
  constructor() {
    this.client = new OAuth2Client({
      clientId: config.google?.clientId,
      clientSecret: config.google?.clientSecret,
      redirectUri: config.google?.redirectUri || 'http://localhost:3000/auth/google/callback',
    });
  }

  getAuthUrl(state = null) {
    const scopes = config.google?.scopes || [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ];

    return this.client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
      state,
    });
  }

  async getTokenFromCode(code) {
    const { tokens } = await this.client.getToken(code);
    return tokens;
  }

  async setCredentials(tokens, userId) {
    this.client.setCredentials(tokens);
    
    if (storageAdapter.isInitialized() && userId) {
      await storageAdapter.create('oauth_tokens', {
        user_id: userId,
        provider: 'google',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      });
    }

    return tokens;
  }

  async getStoredCredentials(userId) {
    if (!storageAdapter.isInitialized()) {
      return null;
    }

    const tokens = await storageAdapter.query('oauth_tokens', {
      eq: { user_id: userId, provider: 'google' },
      limit: 1,
    });

    if (tokens.length === 0) {
      return null;
    }

    const tokenRecord = tokens[0];
    
    if (tokenRecord.expires_at && new Date(tokenRecord.expires_at) < new Date()) {
      return await this.refreshToken(tokenRecord.refresh_token, userId);
    }

    return {
      access_token: tokenRecord.access_token,
      refresh_token: tokenRecord.refresh_token,
      expiry_date: tokenRecord.expires_at,
    };
  }

  async refreshToken(refreshToken, userId) {
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const tempClient = new OAuth2Client({
      clientId: config.google?.clientId,
      clientSecret: config.google?.clientSecret,
    });

    const { tokens } = await tempClient.getToken(refreshToken);
    
    await this.setCredentials(tokens, userId);
    
    return tokens;
  }

  async isAuthenticated(userId) {
    const credentials = await this.getStoredCredentials(userId);
    return !!credentials?.access_token;
  }

  getClient() {
    return this.client;
  }
}

const googleAuthClient = new GoogleAuthClient();

export default googleAuthClient;
export { GoogleAuthClient };