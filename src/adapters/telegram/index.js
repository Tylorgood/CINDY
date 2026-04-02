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
    };

    if (options.replyToMessageId) {
      payload.reply_to_message_id = options.replyToMessageId;
    }

    if (options.replyMarkup) {
      payload.reply_markup = options.replyMarkup;
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

  async answerCallbackQuery(callbackQueryId, text = '') {
    if (!this.apiUrl) {
      throw new Error('Telegram not configured');
    }

    const response = await fetch(`${this.apiUrl}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
      }),
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
