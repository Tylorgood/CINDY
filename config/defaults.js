export const defaults = {
  memory: {
    sessionTtl: 24 * 60 * 60 * 1000,
    workingTtl: 7 * 24 * 60 * 60 * 1000,
    maxRecentItems: 50,
  },

  approval: {
    timeout: 30 * 60 * 1000,
    maxRetries: 3,
    escalationDelay: 5 * 60 * 1000,
  },

  gmail: {
    maxResults: 20,
    batchSize: 10,
  },

  sms: {
    maxLength: 1600,
    batchDelay: 1000,
  },

  voice: {
    timeout: 30,
    maxRetries: 2,
  },

  audit: {
    retentionDays: 365,
    sensitiveFields: ['authToken', 'clientSecret', 'apiKey'],
  },

  scheduler: {
    maxConcurrentJobs: 10,
    cleanupInterval: 60 * 60 * 1000,
  },
};

export const trustLevelLabels = {
  0: 'READ_ONLY',
  1: 'LOW',
  2: 'MEDIUM',
  3: 'HIGH',
  4: 'CRITICAL',
};

export const actionTypeLabels = {
  'email.read': 0,
  'email.summarize': 0,
  'email.draft': 2,
  'email.send': 3,
  'sms.send': 3,
  'pushover.send': 2,
  'voice.call': 4,
  'task.create': 1,
  'task.update': 1,
  'reminder.create': 1,
  'calendar.read': 0,
  'calendar.create': 1,
  'memory.store': 0,
  'memory.delete': 4,
  'data.delete': 4,
  'money.spend': 4,
};