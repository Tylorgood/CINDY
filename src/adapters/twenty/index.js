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

  async graphql(query, variables = {}) {
    if (!this.isConfigured()) {
      throw new Error('Twenty adapter not configured');
    }

    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/graphql`, {
      method: 'POST',
      headers: {
        'X-Auth-Token': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    const result = await response.json();

    if (result.errors && result.errors.length > 0) {
      throw new Error(`Twenty GraphQL error: ${JSON.stringify(result.errors)}`);
    }

    return result.data;
  }

  async getDeals() {
    const query = `
      query GetOpportunities {
        opportunities {
          id
          name
          stage {
            id
            name
          }
        }
      }
    `;
    const data = await this.graphql(query);
    return data?.opportunities || [];
  }

  async createNote(payload, idempotencyKey = null, stepId = null) {
    if (idempotencyKey) {
      const alreadyExecuted = await this.checkIdempotencyKey(idempotencyKey);
      if (alreadyExecuted) {
        return { skipped: true, reason: 'duplicate_idempotency_key', key: idempotencyKey };
      }
    }

    const mutation = `
      mutation CreateNote($input: NoteCreateInput!) {
        createNote(data: $input) {
          id
          body
        }
      }
    `;

    const variables = {
      input: {
        body: payload.body || payload.name || 'Note from CINDY',
        ...(payload.companyId ? { companyId: payload.companyId } : {}),
        ...(payload.opportunityId ? { opportunityId: payload.opportunityId } : {}),
      },
    };

    const data = await this.graphql(mutation, variables);

    if (idempotencyKey && stepId) {
      await this.recordIdempotencyKey(stepId, idempotencyKey);
    }

    return data?.createNote;
  }

  async createCompany(payload, idempotencyKey = null, stepId = null) {
    if (idempotencyKey) {
      const alreadyExecuted = await this.checkIdempotencyKey(idempotencyKey);
      if (alreadyExecuted) {
        return { skipped: true, reason: 'duplicate_idempotency_key', key: idempotencyKey };
      }
    }

    const mutation = `
      mutation CreateCompany($input: CompanyCreateInput!) {
        createCompany(data: $input) {
          id
          name
          domainName
        }
      }
    `;

    const variables = {
      input: {
        name: payload.name || 'Unknown Company',
        ...(payload.domainName ? { domainName: payload.domainName } : {}),
        ...(payload.address ? { address: payload.address } : {}),
        ...(payload.employees ? { employees: payload.employees } : {}),
      },
    };

    const data = await this.graphql(mutation, variables);

    if (idempotencyKey && stepId) {
      await this.recordIdempotencyKey(stepId, idempotencyKey);
    }

    return data?.createCompany;
  }

  async updateOpportunity(opportunityId, payload, idempotencyKey = null, stepId = null) {
    if (idempotencyKey) {
      const alreadyExecuted = await this.checkIdempotencyKey(idempotencyKey);
      if (alreadyExecuted) {
        return { skipped: true, reason: 'duplicate_idempotency_key', key: idempotencyKey };
      }
    }

    const mutation = `
      mutation UpdateOpportunity($id: ID!, $input: OpportunityUpdateInput!) {
        updateOpportunity(id: $id, data: $input) {
          id
          name
          stage {
            id
            name
          }
        }
      }
    `;

    const variables = {
      id: opportunityId,
      input: payload,
    };

    const data = await this.graphql(mutation, variables);

    if (idempotencyKey && stepId) {
      await this.recordIdempotencyKey(stepId, idempotencyKey);
    }

    return data?.updateOpportunity;
  }
}

export default TwentyAdapter;
export { TwentyAdapter };
