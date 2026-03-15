import { adapterConfigs } from '../../../config/adapters.js';

class GmailAdapter {
  constructor(googleClient) {
    this.client = googleClient;
    this.config = adapterConfigs.gmail;
  }

  async listMessages(options = {}) {
    const { maxResults = 20, labelIds = ['INBOX'], q } = options;
    
    const response = await this.client.users.messages.list({
      userId: 'me',
      maxResults,
      labelIds,
      q,
    });

    return response.data.messages || [];
  }

  async getMessage(messageId, format = 'full') {
    const response = await this.client.users.messages.get({
      userId: 'me',
      id: messageId,
      format,
    });

    return this.parseMessage(response.data);
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

  async createDraft(options) {
    const { to, subject, body, cc, bcc } = options;

    const message = this.createMimeMessage({ to, subject, body, cc, bcc });

    const response = await this.client.users.drafts.create({
      userId: 'me',
      resource: {
        message: {
          raw: Buffer.from(message).toString('base64url'),
        },
      },
    });

    return { draftId: response.data.id };
  }

  async sendMessage(options) {
    const { to, subject, body, cc, bcc } = options;

    const message = this.createMimeMessage({ to, subject, body, cc, bcc });

    const response = await this.client.users.messages.send({
      userId: 'me',
      resource: {
        raw: Buffer.from(message).toString('base64url'),
      },
    });

    return { messageId: response.data.id };
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

  async modifyMessage(messageId, options) {
    const { addLabelIds, removeLabelIds } = options;

    const response = await this.client.users.messages.modify({
      userId: 'me',
      id: messageId,
      resource: {
        addLabelIds,
        removeLabelIds,
      },
    });

    return response.data;
  }

  async deleteMessage(messageId) {
    await this.client.users.messages.delete({
      userId: 'me',
      id: messageId,
    });

    return { deleted: true };
  }
}

export default GmailAdapter;
export { GmailAdapter };