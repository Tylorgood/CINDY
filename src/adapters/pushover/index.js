import config from '../../../config/index.js';

class PushoverAdapter {
  constructor() {
    this.userKey = config.pushover?.userKey;
    this.appToken = config.pushover?.appToken;
    this.apiUrl = 'https://api.pushover.net/1/messages.json';
  }

  async send(options) {
    const { message, title, priority = 0, sound = 'default' } = options;

    if (!this.userKey || !this.appToken) {
      throw new Error('Pushover not configured - missing userKey or appToken');
    }

    const formData = new URLSearchParams();
    formData.append('token', this.appToken);
    formData.append('user', this.userKey);
    formData.append('message', message);
    if (title) formData.append('title', title);
    formData.append('priority', priority.toString());
    formData.append('sound', sound);

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pushover send failed: ${error}`);
    }

    const result = await response.json();
    return {
      success: result.status === 1,
      receipt: result.receipt,
      requestId: result.request,
    };
  }

  isConfigured() {
    return !!(this.userKey && this.appToken);
  }
}

export default PushoverAdapter;
export { PushoverAdapter };