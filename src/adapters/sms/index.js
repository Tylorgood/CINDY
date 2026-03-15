import { adapterConfigs } from '../../../config/adapters.js';
import config from '../../../config/index.js';

class SmsAdapter {
  constructor(twilioClient) {
    this.client = twilioClient;
    this.config = adapterConfigs.sms;
    this.fromNumber = config.twilio?.phoneNumber;
  }

  async send(options) {
    const { to, message, mediaUrl } = options;

    if (!to) {
      throw new Error('Recipient phone number required');
    }

    if (!message) {
      throw new Error('Message content required');
    }

    if (message.length > this.config.rateLimits?.maxLength) {
      throw new Error(`Message exceeds maximum length of ${this.config.rateLimits.maxLength}`);
    }

    try {
      const messageOptions = {
        to: this.normalizePhoneNumber(to),
        body: message,
        from: this.fromNumber,
      };

      if (mediaUrl) {
        messageOptions.mediaUrl = Array.isArray(mediaUrl) ? mediaUrl : [mediaUrl];
      }

      const result = await this.client.messages.create(messageOptions);

      return {
        sid: result.sid,
        status: result.status,
        to: result.to,
        from: result.from,
        body: result.body,
        dateCreated: result.dateCreated,
      };
    } catch (error) {
      throw new Error(`SMS send failed: ${error.message}`);
    }
  }

  async sendBatch(messages) {
    const results = [];
    
    for (const msg of messages) {
      const result = await this.send(msg);
      results.push(result);
      
      if (this.config.batchDelay) {
        await this.delay(this.config.batchDelay);
      }
    }

    return results;
  }

  async getStatus(messageSid) {
    const result = await this.client.messages(messageSid).fetch();

    return {
      sid: result.sid,
      status: result.status,
      to: result.to,
      from: result.from,
      body: result.body,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      dateSent: result.dateSent,
    };
  }

  normalizePhoneNumber(phone) {
    const cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    }
    
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`;
    }
    
    if (!phone.startsWith('+')) {
      return `+${cleaned}`;
    }
    
    return phone;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  validatePhoneNumber(phone) {
    const normalized = this.normalizePhoneNumber(phone);
    const e164Pattern = /^\+[1-9]\d{1,14}$/;
    return e164Pattern.test(normalized);
  }
}

export default SmsAdapter;
export { SmsAdapter };