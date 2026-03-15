import { createClient } from '@supabase/supabase-js';
import config from '../../../config/index.js';

function toSnakeCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  
  const result = {};
  for (const key of Object.keys(obj)) {
    // Skip runtime fields not in DB schema
    if (['persistent', 'tags'].includes(key)) continue;
    
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    result[snakeKey] = obj[key];
  }
  return result;
}

function toCamelCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  
  const result = {};
  for (const key of Object.keys(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = obj[key];
  }
  return result;
}

class StorageAdapter {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  initialize(url, key) {
    this.client = createClient(url, key);
    this.initialized = true;
  }

  isInitialized() {
    return this.initialized && this.client !== null;
  }

  async create(table, data) {
    if (!this.isInitialized()) {
      throw new Error('Storage adapter not initialized');
    }

    const snakeData = toSnakeCase(data);

    const { data: result, error } = await this.client
      .from(table)
      .insert(snakeData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create ${table}: ${error.message}`);
    }

    return toCamelCase(result);
  }

  async get(table, id) {
    if (!this.isInitialized()) {
      throw new Error('Storage adapter not initialized');
    }

    const { data, error } = await this.client
      .from(table)
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get ${table}: ${error.message}`);
    }

    return data ? toCamelCase(data) : null;
  }

  async query(table, options = {}) {
    if (!this.isInitialized()) {
      throw new Error('Storage adapter not initialized');
    }

    let query = this.client.from(table).select('*');

    if (options.eq) {
      const snakeEq = toSnakeCase(options.eq);
      for (const [key, value] of Object.entries(snakeEq)) {
        query = query.eq(key, value);
      }
    }

    if (options.gt) {
      const snakeGt = toSnakeCase(options.gt);
      for (const [key, value] of Object.entries(snakeGt)) {
        query = query.gt(key, value);
      }
    }

    if (options.lt) {
      const snakeLt = toSnakeCase(options.lt);
      for (const [key, value] of Object.entries(snakeLt)) {
        query = query.lt(key, value);
      }
    }

    if (options.like) {
      const snakeLike = toSnakeCase(options.like);
      for (const [key, value] of Object.entries(snakeLike)) {
        query = query.like(key, `%${value}%`);
      }
    }

    if (options.orderBy) {
      for (const [key, value] of Object.entries(options.orderBy)) {
        query = query.order(key, { ascending: value.direction !== 'desc' });
      }
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to query ${table}: ${error.message}`);
    }

    return (data || []).map(toCamelCase);
  }

  async update(table, id, updates) {
    if (!this.isInitialized()) {
      throw new Error('Storage adapter not initialized');
    }

    const snakeUpdates = toSnakeCase(updates);

    const { data, error } = await this.client
      .from(table)
      .update(snakeUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update ${table}: ${error.message}`);
    }

    return toCamelCase(data);
  }

  async delete(table, id) {
    if (!this.isInitialized()) {
      throw new Error('Storage adapter not initialized');
    }

    const { error } = await this.client
      .from(table)
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete ${table}: ${error.message}`);
    }

    return { deleted: true };
  }

  async deleteMany(table, filters) {
    if (!this.isInitialized()) {
      throw new Error('Storage adapter not initialized');
    }

    let query = this.client.from(table).delete();

    for (const [key, value] of Object.entries(filters)) {
      if (key === 'pattern') {
        continue;
      }
      query = query.eq(key, value);
    }

    const { error, count } = await query;

    if (error) {
      throw new Error(`Failed to delete from ${table}: ${error.message}`);
    }

    return { deleted: count || 0 };
  }

  async count(table, filters = {}) {
    if (!this.isInitialized()) {
      throw new Error('Storage adapter not initialized');
    }

    let query = this.client.from(table).select('*', { count: 'exact', head: true });

    for (const [key, value] of Object.entries(filters)) {
      query = query.eq(key, value);
    }

    const { count, error } = await query;

    if (error) {
      throw new Error(`Failed to count ${table}: ${error.message}`);
    }

    return count || 0;
  }

  async subscribe(table, callback) {
    if (!this.isInitialized()) {
      throw new Error('Storage adapter not initialized');
    }

    return this.client
      .channel(`public:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
      .subscribe();
  }
}

const storageAdapter = new StorageAdapter();

if (config.supabase?.url && config.supabase?.key) {
  storageAdapter.initialize(config.supabase.url, config.supabase.key);
}

export default storageAdapter;
export { StorageAdapter };