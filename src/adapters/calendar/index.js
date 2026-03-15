import { adapterConfigs } from '../../../config/adapters.js';

class CalendarAdapter {
  constructor(googleClient) {
    this.client = googleClient;
    this.config = adapterConfigs.calendar;
    this.calendarId = 'primary';
  }

  async listEvents(options = {}) {
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

    const response = await this.client.events.list(params);

    return (response.data.items || []).map(this.parseEvent.bind(this));
  }

  async getEvent(eventId) {
    const response = await this.client.events.get({
      calendarId: this.calendarId,
      eventId,
    });

    return this.parseEvent(response.data);
  }

  async createEvent(event) {
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

    const response = await this.client.events.insert({
      calendarId: this.calendarId,
      resource,
      sendUpdates: 'all',
    });

    return this.parseEvent(response.data);
  }

  async updateEvent(eventId, updates) {
    const resource = {};
    
    if (updates.title) resource.summary = updates.title;
    if (updates.description) resource.description = updates.description;
    if (updates.location) resource.location = updates.location;
    if (updates.start) resource.start = this.formatDateTime(updates.start);
    if (updates.end) resource.end = this.formatDateTime(updates.end);

    const response = await this.client.events.patch({
      calendarId: this.calendarId,
      eventId,
      resource,
      sendUpdates: 'all',
    });

    return this.parseEvent(response.data);
  }

  async deleteEvent(eventId) {
    await this.client.events.delete({
      calendarId: this.calendarId,
      eventId,
      sendUpdates: 'all',
    });

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

  async getTodayEvents() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return await this.listEvents({
      timeMin: today.toISOString(),
      timeMax: tomorrow.toISOString(),
    });
  }

  async getUpcomingEvents(days = 7) {
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);

    return await this.listEvents({
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
    });
  }
}

export default CalendarAdapter;
export { CalendarAdapter };