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
const storageAdapter = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

// Initialize OpenAI
let openai = null;
const openaiKey = process.env.OPENAI_API_KEY;
if (openaiKey && openaiKey.startsWith('sk-')) {
  try {
    const { OpenAI } = await import('openai');
    openai = new OpenAI({ apiKey: openaiKey });
    console.log('✓ OpenAI initialized');
  } catch (e) {
    console.warn('⚠ OpenAI not available:', e.message);
  }
} else {
  console.warn('⚠ OpenAI API key not configured');
}

// Root route
app.get('/', (req, res) => {
  res.send('CINDY Personal Agent - AI-powered Telegram bot!');
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    features: {
      memory: !!storageAdapter,
      ai: !!openai,
      telegram: !!config.telegram?.botToken
    }
  });
});

// Initialize pipeline
const intentRouter = new IntentRouter();
const handlers = new HandlerRegistry(storageAdapter, intentRouter, openai);
const auditLogger = new AuditLogger(storageAdapter);

console.log('✓ Pipeline initialized');

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
    
    console.log(`📋 Intent: ${routeResult.intent}, confidence: ${routeResult.confidence}`);
    console.log(`🤖 AI available:`, !!openai);
    
    let result;
    
    // If intent is unknown OR confidence is low and AI is available, try AI chat
    if ((routeResult.intent === 'unknown' || routeResult.confidence < 0.5) && openai) {
      console.log('🤖 Calling AI...');
      try {
        result = await handlers.chatWithAI(userId, text);
        console.log('🤖 AI result:', result?.message?.substring(0, 100));
      } catch (e) {
        console.log('🤖 AI error:', e.message);
        result = { success: false, message: 'AI error: ' + e.message };
      }
      
      // If AI failed or returned empty, fall back to help
      if (!result?.success || !result?.message) {
        console.log('🤖 AI failed, using help');
        result = await handlers.execute('help', 'suggest', userId, { originalText: text });
      }
    } else {
      // Use structured handlers
      console.log(`🎯 Using handler: ${routeResult.handler}.${routeResult.action}`);
      result = await handlers.execute(
        routeResult.handler,
        routeResult.action,
        userId,
        routeResult.params
      );
    }

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