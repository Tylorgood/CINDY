import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { IntentRouter } from './src/router/intent.js';
import { HandlerRegistry } from './src/handlers/index.js';
import { AuditLogger } from './src/audit/telegramLogger.js';
import config from './config/index.js';

const app = express();
app.use(express.json());

// Initialize Supabase
const supabaseUrl = config.supabase?.url;
const supabaseKey = config.supabase?.key;

console.log('📦 Supabase URL:', supabaseUrl ? 'present' : 'missing');
console.log('📦 Supabase Key:', supabaseKey ? 'present' : 'missing');

const storageAdapter = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

// Create storage wrapper with create/query methods
const storageWrapper = storageAdapter ? {
  create: async (table, data) => {
    const result = await storageAdapter.from(table).insert(data).select().single();
    if (result.error) throw new Error(result.error.message);
    return result.data;
  },
  query: async (table, options = {}) => {
    let q = storageAdapter.from(table).select('*');
    if (options.eq) {
      for (const [key, value] of Object.entries(options.eq)) {
        q = q.eq(key, value);
      }
    }
    if (options.limit) q = q.limit(options.limit);
    if (options.orderBy) {
      for (const [key, value] of Object.entries(options.orderBy)) {
        q = q.order(key, { ascending: value.direction !== 'desc' });
      }
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
  },
  update: async (table, id, data) => {
    const result = await storageAdapter.from(table).update(data).eq('id', id).select().single();
    if (result.error) throw new Error(result.error.message);
    return result.data;
  },
  delete: async (table, id) => {
    const result = await storageAdapter.from(table).delete().eq('id', id);
    if (result.error) throw new Error(result.error.message);
    return { deleted: true };
  }
} : null;

console.log('📦 Storage wrapper:', storageWrapper ? 'ready' : 'NOT configured');

// Initialize AI FIRST
let openai = null;
const groqKey = process.env.GROQ_API_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

console.log('🔑 GROQ key present:', !!groqKey);
console.log('🔑 OPENAI key present:', !!openaiKey);

// Test Groq model - use a working one
const GROQ_MODEL = 'llama-3.1-8b-instant';

// Try Groq first (it's free)
if (groqKey) {
  try {
    const { OpenAI } = await import('openai');
    openai = new OpenAI({ 
      apiKey: groqKey,
      baseURL: 'https://api.groq.com/openai/v1'
    });
    console.log('✓ Groq AI initialized with model:', GROQ_MODEL);
  } catch (e) {
    console.warn('⚠ Groq not available:', e.message);
  }
}

// Fallback to OpenAI if Groq not set
if (!openai && openaiKey && openaiKey.startsWith('sk-')) {
  try {
    const { OpenAI } = await import('openai');
    openai = new OpenAI({ apiKey: openaiKey });
    console.log('✓ OpenAI initialized');
  } catch (e) {
    console.warn('⚠ OpenAI not available:', e.message);
  }
}

if (!openai) {
  console.warn('⚠ No AI configured!');
}

// Initialize pipeline AFTER AI
const intentRouter = new IntentRouter();
const handlers = new HandlerRegistry(storageWrapper, intentRouter, openai);
const auditLogger = new AuditLogger(storageWrapper);

console.log('✓ Pipeline initialized');

// Root route
app.get('/', (req, res) => {
  res.send('CINDY is running! 🤖');
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', ai: !!openai, storage: !!storageWrapper });
});

// Telegram webhook - full pipeline
app.post('/telegram/webhook', async (req, res) => {
  try {
    const { message } = req.body;
    
    // Validate incoming message
    if (!message || !message.text || !message.chat) {
      return res.json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text;
    const messageId = message.message_id;
    const userId = message.from?.username || message.from?.first_name || `tg_${message.from?.id}`;
    const userName = message.from?.first_name || 'User';

    console.log(`📩 ${userName}: ${text}`);

    // Log incoming
    await auditLogger.logIncoming(userId, messageId, text, chatId);

    // Route intent
    const routeResult = intentRouter.route(text);
    
    console.log(`📋 Intent: ${routeResult.intent}`);
    console.log(`🤖 AI ready:`, !!openai);
    
    let responseText;
    
    // ALWAYS try AI first if available
    if (openai) {
      console.log('🤖 Calling Groq...');
      try {
        const aiResult = await handlers.chatWithAI(userId, text);
        console.log('🤖 AI result:', aiResult?.success, aiResult?.message?.substring(0, 30));
        
        if (aiResult?.success && aiResult?.message) {
          responseText = aiResult.message;
        } else {
          console.log('🤖 AI returned no message');
        }
      } catch (e) {
        console.log('🤖 AI Error:', e.message);
      }
    } else {
      console.log('🤖 No AI configured');
    }
    
    // If no AI response, use handlers
    if (!responseText) {
      console.log('🎯 Handler:', routeResult.handler, routeResult.action);
      try {
        const result = await handlers.execute(
          routeResult.handler,
          routeResult.action,
          userId,
          routeResult.params
        );
        responseText = result?.message || 'No response';
        console.log('📤 Handler result:', responseText?.substring(0, 50));
      } catch (e) {
        console.log('❌ Handler error:', e.message);
        responseText = 'Error: ' + e.message;
      }
    }
    
    // Send response
    console.log('📤 Sending:', responseText?.substring(0, 50));
    const telegramUrl = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
    await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: responseText,
        parse_mode: 'Markdown'
      })
    });

    // Log action
    await auditLogger.logAction(userId, routeResult.intent, {
      handler: routeResult.handler,
      params: routeResult.params,
      success: result.success
    }, result.success ? 'success' : 'failed');

    // Send response
    if (result.message) {
      // Simple Telegram API call
      const telegramUrl = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
      await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: result.message,
          parse_mode: 'Markdown'
        })
      });
      
      // Log outgoing
      await auditLogger.logOutgoing(userId, messageId, result.message, routeResult.intent);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('❌ Pipeline error:', error);
    res.json({ ok: false, error: error.message });
  }
});

// Start server
app.listen(config.port, () => {
  console.log(`CINDY running on port ${config.port}`);
});

export default app;