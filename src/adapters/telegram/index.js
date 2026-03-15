import config from '../../../config/index.js';

class TelegramAdapter {
  constructor() {
    this.token = config.telegram?.botToken;
    this.apiUrl = this.token ? `https://api.telegram.org/bot${this.token}` : null;
  }

  async sendMessage(chatId, text, options = {}) {
    if (!this.apiUrl) {
      throw new Error('Telegram not configured');
    }

    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
    };

    if (options.replyToMessageId) {
      payload.reply_to_message_id = options.replyToMessageId;
    }

    const response = await fetch(`${this.apiUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!result.ok) {
      throw new Error(`Telegram error: ${result.description}`);
    }

    return result.result;
  }

  async getUpdates() {
    if (!this.apiUrl) {
      throw new Error('Telegram not configured');
    }

    const response = await fetch(`${this.apiUrl}/getUpdates`);
    const result = await response.json();
    if (!result.ok) {
      throw new Error(`Telegram error: ${result.description}`);
    }

    return result.result;
  }

  async setWebhook(url) {
    if (!this.apiUrl) {
      throw new Error('Telegram not configured');
    }

    const response = await fetch(`${this.apiUrl}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const result = await response.json();
    return result;
  }

  isConfigured() {
    return !!this.token;
  }
}

export default TelegramAdapter;
export { TelegramAdapter };