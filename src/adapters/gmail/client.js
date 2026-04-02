import { OAuth2Client } from 'google-auth-library';
import config from '../../../config/index.js';
import storageAdapter from '../storage/index.js';

class GoogleAuthClient {
  constructor() {
    this.client = new OAuth2Client(
      config.google?.clientId,
      config.google?.clientSecret,
      config.google?.redirectUri || 'http://localhost:3000/auth/google/callback'
    );
  }

  isConfigured() {
    return !!(config.google?.clientId && config.google?.clientSecret && config.google?.redirectUri);
  }

  getAuthUrl(userId = null) {
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
      state: userId || undefined,
    });
  }

  async getTokenFromCode(code) {
    const { tokens } = await this.client.getToken(code);
    return tokens;
  }

  async setCredentials(tokens, userId) {
    this.client.setCredentials(tokens);
    
    if (storageAdapter.isInitialized() && userId) {
      const existing = await storageAdapter.query('oauth_tokens', {
        eq: { userId, provider: 'google' },
        limit: 1,
      });

      const record = {
        userId,
        provider: 'google',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || existing[0]?.refreshToken || null,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : existing[0]?.expiresAt || null,
        updatedAt: new Date().toISOString(),
      };

      if (existing.length > 0) {
        await storageAdapter.update('oauth_tokens', existing[0].id, record);
      } else {
        await storageAdapter.create('oauth_tokens', {
          ...record,
          createdAt: new Date().toISOString(),
        });
      }
    }

    return tokens;
  }

  async getStoredCredentials(userId) {
    if (!storageAdapter.isInitialized()) {
      return null;
    }

    const tokens = await storageAdapter.query('oauth_tokens', {
      eq: { userId, provider: 'google' },
      limit: 1,
    });

    if (tokens.length === 0) {
      return null;
    }

    const tokenRecord = tokens[0];
    
    if (tokenRecord.expiresAt && new Date(tokenRecord.expiresAt) < new Date()) {
      return await this.refreshToken(tokenRecord.refreshToken, userId);
    }

    return {
      access_token: tokenRecord.accessToken,
      refresh_token: tokenRecord.refreshToken,
      expiry_date: tokenRecord.expiresAt ? new Date(tokenRecord.expiresAt).getTime() : null,
    };
  }

  async refreshToken(refreshToken, userId) {
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const tempClient = new OAuth2Client(
      config.google?.clientId,
      config.google?.clientSecret,
      config.google?.redirectUri || 'http://localhost:3000/auth/google/callback'
    );

    tempClient.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await tempClient.refreshAccessToken();
    const tokens = {
      ...credentials,
      refresh_token: credentials.refresh_token || refreshToken,
    };
    
    await this.setCredentials(tokens, userId);
    
    return tokens;
  }

  async isAuthenticated(userId) {
    const credentials = await this.getStoredCredentials(userId);
    return !!credentials?.access_token;
  }

  async exchangeCode(code, userId) {
    const tokens = await this.getTokenFromCode(code);
    await this.setCredentials(tokens, userId);
    return tokens;
  }

  async getAccessToken(userId) {
    const credentials = await this.getStoredCredentials(userId);
    if (!credentials) {
      throw new Error('Google account not connected');
    }

    if (credentials.expiry_date && credentials.expiry_date <= Date.now()) {
      const refreshed = await this.refreshToken(credentials.refresh_token, userId);
      return refreshed.access_token;
    }

    return credentials.access_token;
  }

  async fetchJson(userId, url, options = {}) {
    const accessToken = await this.getAccessToken(userId);
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers || {}),
      },
    });

    if (response.status === 401) {
      const refreshed = await this.refreshToken((await this.getStoredCredentials(userId))?.refresh_token, userId);
      const retry = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${refreshed.access_token}`,
          ...(options.headers || {}),
        },
      });

      if (!retry.ok) {
        throw new Error(`Google API error (${retry.status}): ${await retry.text()}`);
      }

      return await retry.json();
    }

    if (!response.ok) {
      throw new Error(`Google API error (${response.status}): ${await response.text()}`);
    }

    return await response.json();
  }

  getClient() {
    return this.client;
  }
}

const googleAuthClient = new GoogleAuthClient();

export default googleAuthClient;
export { GoogleAuthClient };
