import { v4 as uuidv4 } from 'uuid';
import { defaults } from '../../config/defaults.js';

class MemoryManager {
  constructor(storageAdapter) {
    this.storage = storageAdapter;
    this.sessionCache = new Map();
    this.workingCache = new Map();
  }

  async store(type, data, options = {}) {
    // Extract userId from data if present
    const userId = data.userId || options.userId || 'default-user';
    const cleanData = { ...data };
    delete cleanData.userId;
    
    const memory = {
      id: uuidv4(),
      userId: userId,
      type,
      data: cleanData,
      createdAt: new Date().toISOString(),
    };

    if (options.persistent !== false && this.storage) {
      await this.storage.create('memories', memory);
    }

    this.workingCache.set(memory.id, memory);
    return memory;
  }

  async retrieve(memoryId) {
    if (this.workingCache.has(memoryId)) {
      return this.workingCache.get(memoryId);
    }

    if (this.storage) {
      const result = await this.storage.get('memories', memoryId);
      if (result) {
        this.workingCache.set(memoryId, result);
        return result;
      }
    }

    return null;
  }

  async search(query, options = {}) {
    const { type, limit = 20, offset = 0 } = options;
    
    if (this.storage) {
      return await this.storage.query('memories', {
        ...query,
        limit,
        offset,
      });
    }

    return [];
  }

  async update(memoryId, updates) {
    const existing = await this.retrieve(memoryId);
    if (!existing) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (this.storage) {
      await this.storage.update('memories', memoryId, updated);
    }

    this.workingCache.set(memoryId, updated);
    return updated;
  }

  async delete(memoryId) {
    if (this.storage) {
      await this.storage.delete('memories', memoryId);
    }
    this.workingCache.delete(memoryId);
  }

  async forget(userId, pattern) {
    if (this.storage) {
      return await this.storage.deleteMany('memories', {
        userId,
        pattern,
      });
    }
    return { deleted: 0 };
  }

  async getUserProfile(userId) {
    if (this.storage) {
      const profiles = await this.storage.query('profiles', {
        eq: { userId },
        limit: 1,
      });
      return profiles[0] || null;
    }
    return null;
  }

  async updateUserProfile(userId, profileData) {
    const existing = await this.getUserProfile(userId);
    
    if (existing) {
      return await this.storage.update('profiles', existing.id, {
        ...profileData,
        updatedAt: new Date().toISOString(),
      });
    } else {
      return await this.storage.create('profiles', {
        userId,
        ...profileData,
        createdAt: new Date().toISOString(),
      });
    }
  }

  async getRelationships(userId) {
    if (this.storage) {
      return await this.storage.query('relationships', {
        eq: { userId },
        orderBy: { column: 'lastInteraction', direction: 'desc' },
      });
    }
    return [];
  }

  async addRelationship(userId, relationship) {
    if (this.storage) {
      return await this.storage.create('relationships', {
        userId,
        ...relationship,
        createdAt: new Date().toISOString(),
      });
    }
    return null;
  }

  async getProjects(userId, status = null) {
    if (this.storage) {
      const query = { userId };
      if (status) {
        query.status = status;
      }
      return await this.storage.query('projects', {
        eq: query,
        orderBy: { column: 'priority', direction: 'desc' },
      });
    }
    return [];
  }

  async getActiveProjects(userId) {
    return await this.getProjects(userId, 'active');
  }

  async getImportantRelationships(userId) {
    const all = await this.getRelationships(userId);
    return all.filter(r => r.importance >= 4).slice(0, 5);
  }

  clearSessionCache() {
    this.sessionCache.clear();
  }

  clearWorkingCache() {
    this.workingCache.clear();
  }
}

export default MemoryManager;
export { MemoryManager };