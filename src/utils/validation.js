import { z } from 'zod';

export const EmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().optional(),
  body: z.string().optional(),
  cc: z.string().email().optional(),
  bcc: z.string().email().optional(),
});

export const SmsSchema = z.object({
  to: z.string().min(10),
  message: z.string().min(1).max(1600),
  mediaUrl: z.union([z.string(), z.array(z.string())]).optional(),
});

export const VoiceCallSchema = z.object({
  to: z.string().min(10),
  message: z.string().optional(),
  twiml: z.string().optional(),
  record: z.boolean().optional(),
});

export const TaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  dueDate: z.string().datetime().optional(),
  priority: z.number().min(1).max(5).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
});

export const CalendarEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  location: z.string().max(500).optional(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  attendees: z.array(z.string().email()).optional(),
  reminders: z.array(z.object({
    method: z.enum(['email', 'popup', 'sms']).optional(),
    minutes: z.number(),
  })).optional(),
});

export const ApprovalResponseSchema = z.object({
  approvalId: z.string().uuid(),
  decision: z.enum(['approve', 'deny']),
  reason: z.string().optional(),
});

export const ProfileUpdateSchema = z.object({
  name: z.string().max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(10).optional(),
  timezone: z.string().optional(),
  preferences: z.record(z.any()).optional(),
});

export function validateInput(schema, data) {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    const errors = result.error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return { valid: false, errors };
  }
  
  return { valid: true, data: result.data };
}

export function validateEmail(email) {
  return validateInput(EmailSchema, { to: email, subject: '', body: '' });
}

export function validatePhoneNumber(phone) {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
}

export function validateActionPayload(actionType, payload) {
  const schemas = {
    'email.send': EmailSchema,
    'email.draft': EmailSchema,
    'sms.send': SmsSchema,
    'voice.call': VoiceCallSchema,
    'task.create': TaskSchema,
    'calendar.create': CalendarEventSchema,
  };

  const schema = schemas[actionType];
  if (!schema) {
    return { valid: true };
  }

  return validateInput(schema, payload);
}