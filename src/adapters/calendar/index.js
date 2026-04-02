import { adapterConfigs } from '../../../config/adapters.js';

class CalendarAdapter {
  constructor(authClient) {
    this.auth = authClient;
    this.config = adapterConfigs.calendar;
    this.calendarId = 'primary';
  }

  async listEvents(userId, options = {}) {
    const { 
      timeMin, 
      timeMax, 
      maxResults = 20, 
      q,
      orderBy = 'startTime' 
    } = options;

    const params = {
      calendarId: this.calendarId,
      maxResults,
      orderBy,
      singleEvents: true,
    };

    if (timeMin) {
      params.timeMin = timeMin instanceof Date ? timeMin.toISOString() : timeMin;
    } else {
      params.timeMin = new Date().toISOString();
    }

    if (timeMax) {
      params.timeMax = timeMax instanceof Date ? timeMax.toISOString() : timeMax;
    }

    if (q) {
      params.q = q;
    }

    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      query.set(key, String(value));
    }

    const response = await this.auth.fetchJson(
      userId,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?${query.toString()}`
    );

    return (response.items || []).map(this.parseEvent.bind(this));
  }

  async getEvent(userId, eventId) {
    const response = await this.auth.fetchJson(
      userId,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}`
    );

    return this.parseEvent(response);
  }

  async createEvent(userId, event) {
    const { title, description, location, start, end, attendees, reminders } = event;

    const resource = {
      summary: title,
      description,
      location,
      start: this.formatDateTime(start),
      end: this.formatDateTime(end),
    };

    if (attendees?.length > 0) {
      resource.attendees = attendees.map(email => ({ email }));
    }

    if (reminders) {
      resource.reminders = {
        useDefault: false,
        overrides: reminders.map(r => ({
          method: r.method || 'popup',
          minutes: r.minutes || 30,
        })),
      };
    }

    const response = await this.auth.fetchJson(
      userId,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?sendUpdates=all`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resource),
      }
    );

    return this.parseEvent(response);
  }

  async updateEvent(userId, eventId, updates) {
    const resource = {};
    
    if (updates.title) resource.summary = updates.title;
    if (updates.description) resource.description = updates.description;
    if (updates.location) resource.location = updates.location;
    if (updates.start) resource.start = this.formatDateTime(updates.start);
    if (updates.end) resource.end = this.formatDateTime(updates.end);

    const response = await this.auth.fetchJson(
      userId,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}?sendUpdates=all`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resource),
      }
    );

    return this.parseEvent(response);
  }

  async deleteEvent(userId, eventId) {
    await this.auth.fetchJson(
      userId,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}?sendUpdates=all`,
      { method: 'DELETE' }
    );

    return { deleted: true };
  }

  parseEvent(event) {
    const start = event.start?.dateTime || event.start?.date;
    const end = event.end?.dateTime || event.end?.date;

    return {
      id: event.id,
      title: event.summary,
      description: event.description,
      location: event.location,
      start,
      end,
      startTime: start,
      endTime: end,
      attendees: event.attendees?.map(a => a.email) || [],
      status: event.status,
      htmlLink: event.htmlLink,
      created: event.created,
      updated: event.updated,
    };
  }

  formatDateTime(dateInput) {
    if (typeof dateInput === 'string') {
      return { dateTime: dateInput, timeZone: 'UTC' };
    }
    
    if (dateInput instanceof Date) {
      return { dateTime: dateInput.toISOString(), timeZone: 'UTC' };
    }

    if (dateInput.dateTime) {
      return dateInput;
    }

    return { dateTime: dateInput, timeZone: 'UTC' };
  }

  async getTodayEvents(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return await this.listEvents(userId, {
      timeMin: today.toISOString(),
      timeMax: tomorrow.toISOString(),
    });
  }

  async getUpcomingEvents(userId, days = 7) {
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);

    return await this.listEvents(userId, {
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
    });
  }
}

export default CalendarAdapter;
export { CalendarAdapter };
