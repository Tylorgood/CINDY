import { adapterConfigs } from '../../../config/adapters.js';
import config from '../../../config/index.js';

class VoiceAdapter {
  constructor(twilioClient) {
    this.client = twilioClient;
    this.config = adapterConfigs.voice;
    this.fromNumber = config.twilio?.phoneNumber;
  }

  async call(options) {
    const { to, message, twiml, statusCallback } = options;

    if (!to) {
      throw new Error('Recipient phone number required');
    }

    if (!message && !twiml) {
      throw new Error('Either message or TwiML required');
    }

    const callOptions = {
      to: this.normalizePhoneNumber(to),
      from: this.fromNumber,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    };

    if (twiml) {
      callOptions.twiml = twiml;
    } else {
      callOptions.twiml = this.createTwimlFromMessage(message);
    }

    if (statusCallback) {
      callOptions.statusCallback = statusCallback;
    }

    try {
      const result = await this.client.calls.create(callOptions);

      return {
        sid: result.sid,
        status: result.status,
        to: result.to,
        from: result.from,
        direction: result.direction,
        startTime: result.startTime,
        endTime: result.endTime,
      };
    } catch (error) {
      throw new Error(`Voice call failed: ${error.message}`);
    }
  }

  async callWithRecording(options) {
    const { to, message, record = true } = options;

    const twiml = this.createTwimlWithRecording(message, record);

    return await this.call({
      to,
      twiml,
    });
  }

  createTwimlFromMessage(message) {
    const escaped = this.escapeXml(message);
    return `<Response><Say voice="alice">${escaped}</Say></Response>`;
  }

  createTwimlWithRecording(message, record) {
    const escaped = this.escapeXml(message);
    const recordAttr = record ? ' record="record-from-answer-dual"' : '';
    return `<Response>
      <Say voice="alice">${escaped}</Say>
      <Record${recordAttr} />
    </Response>`;
  }

  escapeXml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  async getCallStatus(callSid) {
    const result = await this.client.calls(callSid).fetch();

    return {
      sid: result.sid,
      status: result.status,
      to: result.to,
      from: result.from,
      direction: result.direction,
      startTime: result.startTime,
      endTime: result.endTime,
      duration: result.duration,
      answeredBy: result.answeredBy,
    };
  }

  async endCall(callSid) {
    const result = await this.client.calls(callSid).update({
      status: 'completed',
    });

    return {
      sid: result.sid,
      status: result.status,
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

  validatePhoneNumber(phone) {
    const normalized = this.normalizePhoneNumber(phone);
    const e164Pattern = /^\+[1-9]\d{1,14}$/;
    return e164Pattern.test(normalized);
  }
}

export default VoiceAdapter;
export { VoiceAdapter };