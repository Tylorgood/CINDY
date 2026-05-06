import { v4 as uuidv4 } from 'uuid';

function isRecoverableStorageError(error) {
  return /Could not find the table|fetch failed|network/i.test(error?.message || '');
}

function normalizeLookup(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmail(value) {
  return normalizeLookup(value);
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  if (String(value).startsWith('+')) {
    return String(value);
  }

  return `+${digits}`;
}

export class ContactStore {
  constructor(storageAdapter) {
    this.storage = storageAdapter;
  }

  isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  isPhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length >= 10;
  }

  normalizeAddress(channel, value) {
    if (channel === 'email') {
      return normalizeEmail(value);
    }

    if (channel === 'sms' || channel === 'voice') {
      return normalizePhone(value);
    }

    return String(value || '').trim();
  }

  async list(userId, channel = null) {
    if (!this.storage) {
      return [];
    }

    const eq = { userId };
    if (channel) {
      eq.channel = channel;
    }

    try {
      return await this.storage.query('contacts', {
        eq,
        orderBy: { column: 'updatedAt', direction: 'desc' },
        limit: 200,
      });
    } catch (error) {
      if (isRecoverableStorageError(error)) {
        this.storage = null;
        return [];
      }
      throw error;
    }
  }

  async findByName(userId, channel, name) {
    const contacts = await this.list(userId, channel);
    const lookupKey = normalizeLookup(name);
    return contacts.find(contact => contact.lookupKey === lookupKey) || null;
  }

  async findByAddress(userId, channel, address) {
    const contacts = await this.list(userId, channel);
    const normalized = this.normalizeAddress(channel, address);
    return contacts.find(contact => this.normalizeAddress(channel, contact.address) === normalized) || null;
  }

  async save(userId, channel, { name = '', address, trusted = false }) {
    if (!this.storage) {
      return null;
    }

    const normalizedAddress = this.normalizeAddress(channel, address);
    const lookupKey = normalizeLookup(name || normalizedAddress);
    const existing = (await this.findByAddress(userId, channel, normalizedAddress))
      || (name ? await this.findByName(userId, channel, name) : null);

    const updates = {
      name: name || existing?.name || null,
      lookupKey,
      channel,
      address: normalizedAddress,
      trusted: trusted || existing?.trusted || false,
      trustedAt: trusted || existing?.trusted ? (existing?.trustedAt || new Date().toISOString()) : null,
      updatedAt: new Date().toISOString(),
    };

    if (existing) {
      try {
        return await this.storage.update('contacts', existing.id, updates);
      } catch (error) {
        if (isRecoverableStorageError(error)) {
          this.storage = null;
          return { id: existing.id, userId, ...existing, ...updates };
        }
        throw error;
      }
    }

    try {
      return await this.storage.create('contacts', {
        id: uuidv4(),
        userId,
        ...updates,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      if (isRecoverableStorageError(error)) {
        this.storage = null;
        return {
          id: uuidv4(),
          userId,
          ...updates,
          createdAt: new Date().toISOString(),
        };
      }
      throw error;
    }
  }

  async resolve(userId, channel, recipient) {
    if (!recipient || !this.storage) {
      return null;
    }

    if (channel === 'email' && this.isEmail(recipient)) {
      return await this.save(userId, channel, {
        name: recipient.split('@')[0],
        address: recipient,
        trusted: false,
      });
    }

    if ((channel === 'sms' || channel === 'voice') && this.isPhone(recipient)) {
      return await this.save(userId, channel, {
        address: recipient,
        trusted: false,
      });
    }

    return await this.findByName(userId, channel, recipient);
  }

  async markTrusted(contactId) {
    if (!this.storage || !contactId) {
      return null;
    }

    try {
      return await this.storage.update('contacts', contactId, {
        trusted: true,
        trustedAt: new Date().toISOString(),
        lastApprovedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (isRecoverableStorageError(error)) {
        this.storage = null;
        return null;
      }
      throw error;
    }
  }

  async touch(contactId) {
    if (!this.storage || !contactId) {
      return null;
    }

    try {
      return await this.storage.update('contacts', contactId, {
        lastUsedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (isRecoverableStorageError(error)) {
        this.storage = null;
        return null;
      }
      throw error;
    }
  }
}

export default ContactStore;
