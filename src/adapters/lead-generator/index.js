import config from '../../../config/index.js';

class LeadGeneratorAdapter {
  constructor() {
    this.providers = {
      prospeo: {
        apiKey: process.env.PROSPEO_API_KEY || config.leadGenerator?.prospeoApiKey || null,
        baseUrl: 'https://api.prospeo.io/v1',
      },
      wiza: {
        apiKey: process.env.WIZA_API_KEY || config.leadGenerator?.wizaApiKey || null,
        baseUrl: 'https://api.wiza.io/v1',
      },
      googlePlaces: {
        apiKey: process.env.GOOGLE_PLACES_API_KEY || config.leadGenerator?.googlePlacesApiKey || null,
        baseUrl: 'https://maps.googleapis.com/maps/api/place',
      },
    };
  }

  isConfigured() {
    return !!(
      this.providers.prospeo.apiKey ||
      this.providers.wiza.apiKey ||
      this.providers.googlePlaces.apiKey
    );
  }

  getConfiguredProviders() {
    return Object.entries(this.providers)
      .filter(([, v]) => v.apiKey)
      .map(([name]) => name);
  }

  async searchProsperity(query, options = {}) {
    const provider = this.providers.prospeo;
    if (!provider.apiKey) {
      throw new Error('Prospero API key not configured');
    }

    const params = new URLSearchParams({
      q: query,
      limit: String(options.limit || 50),
      industry: options.industry || 'manufacturing',
    });

    const response = await fetch(`${provider.baseUrl}/leads/search?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Prospero API error (${response.status}): ${await response.text()}`);
    }

    const data = await response.json();
    return this.normalizeProsperityLeads(data.leads || []);
  }

  async searchWiza(query, options = {}) {
    const provider = this.providers.wiza;
    if (!provider.apiKey) {
      throw new Error('Wiza API key not configured');
    }

    const response = await fetch(`${provider.baseUrl}/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        filters: {
          industry: options.industry || 'manufacturing',
          ...(options.filters || {}),
        },
        limit: options.limit || 50,
      }),
    });

    if (!response.ok) {
      throw new Error(`Wiza API error (${response.status}): ${await response.text()}`);
    }

    const data = await response.json();
    return this.normalizeWizaLeads(data.results || []);
  }

  async searchGooglePlaces(query, options = {}) {
    const provider = this.providers.googlePlaces;
    if (!provider.apiKey) {
      throw new Error('Google Places API key not configured');
    }

    // First: text search
    const searchParams = new URLSearchParams({
      query: `${query} manufacturing`,
      key: provider.apiKey,
      type: 'establishment',
    });

    const searchResponse = await fetch(
      `${provider.baseUrl}/textsearch/json?${searchParams.toString()}`
    );

    if (!searchResponse.ok) {
      throw new Error(`Google Places API error (${searchResponse.status}): ${await searchResponse.text()}`);
    }

    const searchData = await searchResponse.json();
    if (searchData.status !== 'OK') {
      throw new Error(`Google Places error: ${searchData.status} - ${searchData.error_message || ''}`);
    }

    return this.normalizeGooglePlaces(searchData.results || []);
  }

  normalizeProsperityLeads(leads) {
    return leads.map(lead => ({
      source: 'prospeo',
      externalId: lead.id || null,
      companyName: lead.company_name || lead.name || '',
      industry: lead.industry || 'manufacturing',
      website: lead.website || null,
      email: lead.email || null,
      phone: lead.phone || null,
      address: lead.address || null,
      city: lead.city || null,
      state: lead.state || null,
      country: lead.country || 'US',
      employeeCount: lead.employee_count || null,
      description: lead.description || '',
      raw: lead,
    }));
  }

  normalizeWizaLeads(leads) {
    return leads.map(lead => ({
      source: 'wiza',
      externalId: lead.id || null,
      companyName: lead.company || lead.organization_name || '',
      industry: lead.industry || 'manufacturing',
      website: lead.website || null,
      email: lead.email || null,
      phone: lead.phone || null,
      address: lead.address || null,
      city: lead.city || null,
      state: lead.state || null,
      country: lead.country || 'US',
      employeeCount: lead.employee_count || null,
      description: lead.description || '',
      raw: lead,
    }));
  }

  normalizeGooglePlaces(places) {
    return places.map(place => ({
      source: 'google_places',
      externalId: place.place_id || null,
      companyName: place.name || '',
      industry: 'manufacturing',
      website: place.website || null,
      email: null,
      phone: place.formatted_phone_number || null,
      address: place.formatted_address || null,
      city: place.vicinity || '',
      state: '',
      country: 'US',
      employeeCount: null,
      description: place.types?.join(', ') || '',
      raw: place,
    }));
  }

  async searchAll(query, options = {}) {
    const results = [];
    const errors = [];

    // Run all configured providers in parallel
    const searches = [];

    if (this.providers.prospeo.apiKey) {
      searches.push(
        this.searchProsperity(query, options)
          .then(leads => ({ source: 'prospeo', leads, error: null }))
          .catch(error => ({ source: 'prospeo', leads: [], error: error.message }))
      );
    }

    if (this.providers.wiza.apiKey) {
      searches.push(
        this.searchWiza(query, options)
          .then(leads => ({ source: 'wiza', leads, error: null }))
          .catch(error => ({ source: 'wiza', leads: [], error: error.message }))
      );
    }

    if (this.providers.googlePlaces.apiKey) {
      searches.push(
        this.searchGooglePlaces(query, options)
          .then(leads => ({ source: 'google_places', leads, error: null }))
          .catch(error => ({ source: 'google_places', leads: [], error: error.message }))
      );
    }

    const allResults = await Promise.all(searches);

    for (const result of allResults) {
      if (result.error) {
        errors.push({ source: result.source, error: result.error });
      } else {
        results.push(...result.leads);
      }
    }

    return { leads: results, errors, total: results.length };
  }

  formatForDisplay(leads, limit = 10) {
    if (leads.length === 0) {
      return 'No leads found.';
    }

    const lines = leads.slice(0, limit).map((lead, index) => [
      `${index + 1}. **${lead.companyName}** (${lead.source})`,
      lead.website ? `   Website: ${lead.website}` : null,
      lead.email ? `   Email: ${lead.email}` : null,
      lead.phone ? `   Phone: ${lead.phone}` : null,
      lead.address ? `   Address: ${lead.address}` : null,
      lead.employeeCount ? `   Employees: ${lead.employeeCount}` : null,
    ].filter(Boolean).join('\n'));

    return [
      `Found ${leads.length} lead${leads.length === 1 ? '' : 's'}:`,
      '',
      ...lines,
      leads.length > limit ? `\n... and ${leads.length - limit} more` : null,
    ].filter(Boolean).join('\n');
  }

  formatForTwenty(leads) {
    return leads.map(lead => ({
      name: lead.companyName,
      domainName: lead.website ? new URL(lead.website).hostname : null,
      address: lead.address,
      employees: lead.employeeCount,
      // Twenty-specific fields
      customFields: {
        source: lead.source,
        industry: lead.industry,
        phone: lead.phone,
        email: lead.email,
        externalId: lead.externalId,
      },
    }));
  }
}

export default LeadGeneratorAdapter;
export { LeadGeneratorAdapter };
