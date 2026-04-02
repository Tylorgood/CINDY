import { adapterConfigs } from '../../../config/adapters.js';

class GmailAdapter {
  constructor(authClient) {
    this.auth = authClient;
    this.config = adapterConfigs.gmail;
  }

  async listMessages(userId, options = {}) {
    const { maxResults = 20, labelIds = ['INBOX'], q } = options;

    const params = new URLSearchParams({
      maxResults: String(maxResults),
    });

    labelIds.forEach(labelId => params.append('labelIds', labelId));
    if (q) {
      params.set('q', q);
    }

    const response = await this.auth.fetchJson(
      userId,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`
    );

    return response.messages || [];
  }

  async getMessage(userId, messageId, format = 'full') {
    const response = await this.auth.fetchJson(
      userId,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=${format}`
    );

    return this.parseMessage(response);
  }

  parseMessage(message) {
    const headers = message.payload?.headers || [];
    const getHeader = (name) => {
      const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
      return header?.value;
    };

    return {
      id: message.id,
      threadId: message.threadId,
      subject: getHeader('Subject'),
      from: getHeader('From'),
      to: getHeader('To'),
      date: getHeader('Date'),
      snippet: message.snippet,
      labelIds: message.labelIds,
      payload: message.payload,
    };
  }

  async createDraft(userId, options) {
    const { to, subject, body, cc, bcc } = options;

    const message = this.createMimeMessage({ to, subject, body, cc, bcc });

    const response = await this.auth.fetchJson(
      userId,
      'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            raw: Buffer.from(message).toString('base64url'),
          },
        }),
      }
    );

    return { draftId: response.id, message: 'Draft created.' };
  }

  async sendMessage(userId, options) {
    const { to, subject, body, cc, bcc } = options;

    const message = this.createMimeMessage({ to, subject, body, cc, bcc });

    const response = await this.auth.fetchJson(
      userId,
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw: Buffer.from(message).toString('base64url'),
        }),
      }
    );

    return { messageId: response.id };
  }

  createMimeMessage({ to, subject, body, cc, bcc }) {
    const lines = [
      `To: ${to}`,
      subject ? `Subject: ${subject}` : '',
      cc ? `Cc: ${cc}` : '',
      bcc ? `Bcc: ${bcc}` : '',
      '',
      body || '',
    ];
    return lines.filter(Boolean).join('\r\n');
  }

  async modifyMessage(userId, messageId, options) {
    const { addLabelIds, removeLabelIds } = options;

    return await this.auth.fetchJson(
      userId,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addLabelIds,
          removeLabelIds,
        }),
      }
    );
  }

  async deleteMessage(userId, messageId) {
    await this.auth.fetchJson(
      userId,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
      { method: 'DELETE' }
    );

    return { deleted: true };
  }
}

export default GmailAdapter;
export { GmailAdapter };
