import config from '../../../config/index.js';

class TwentyAdapter {
  constructor() {
    this.baseUrl = config.twenty?.baseUrl || null;
    this.apiKey = config.twenty?.apiKey || null;
    this.workspaceId = config.twenty?.workspaceId || null;
    this.idempotencyStore = null;
  }

  isConfigured() {
    return !!(this.baseUrl && this.apiKey);
  }

  setIdempotencyStore(store) {
    this.idempotencyStore = store;
  }

  async checkIdempotencyKey(key) {
    if (!key || !this.idempotencyStore) {
      return false;
    }
    return await this.idempotencyStore.checkIdempotencyKey(key);
  }

  async recordIdempotencyKey(stepId, key) {
    if (!key || !stepId || !this.idempotencyStore) {
      return null;
    }
    return await this.idempotencyStore.recordIdempotencyKey(stepId, key);
  }

  async request(path, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('Twenty adapter not configured');
    }

    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Twenty API error (${response.status}): ${await response.text()}`);
    }

    return await response.json();
  }

  async getDeals() {
    return await this.request('/rest/opportunities');
  }

  async createNote(payload, idempotencyKey = null, stepId = null) {
    if (idempotencyKey) {
      const alreadyExecuted = await this.checkIdempotencyKey(idempotencyKey);
      if (alreadyExecuted) {
        return { skipped: true, reason: 'duplicate_idempotency_key', key: idempotencyKey };
      }
    }

    const result = await this.request('/rest/notes', {
      method: 'POST',
      body: JSON.stringify({ ...payload, idempotencyKey }),
    });

    if (idempotencyKey && stepId) {
      await this.recordIdempotencyKey(stepId, idempotencyKey);
    }

    return result;
  }

  async createCompany(payload, idempotencyKey = null, stepId = null) {
    if (idempotencyKey) {
      const alreadyExecuted = await this.checkIdempotencyKey(idempotencyKey);
      if (alreadyExecuted) {
        return { skipped: true, reason: 'duplicate_idempotency_key', key: idempotencyKey };
      }
    }

    const result = await this.request('/rest/companies', {
      method: 'POST',
      body: JSON.stringify({ ...payload, idempotencyKey }),
    });

    if (idempotencyKey && stepId) {
      await this.recordIdempotencyKey(stepId, idempotencyKey);
    }

    return result;
  }

  async updateOpportunity(opportunityId, payload, idempotencyKey = null, stepId = null) {
    if (idempotencyKey) {
      const alreadyExecuted = await this.checkIdempotencyKey(idempotencyKey);
      if (alreadyExecuted) {
        return { skipped: true, reason: 'duplicate_idempotency_key', key: idempotencyKey };
      }
    }

    const result = await this.request(`/rest/opportunities/${opportunityId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...payload, idempotencyKey }),
    });

    if (idempotencyKey && stepId) {
      await this.recordIdempotencyKey(stepId, idempotencyKey);
    }

    return result;
  }
}

export default TwentyAdapter;
export { TwentyAdapter };
