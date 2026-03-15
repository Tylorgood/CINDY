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

// Initialize AI (prefer Groq, fallback to OpenAI)
let openai = null;
const groqKey = process.env.GROQ_API_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

console.log('🔑 GROQ key present:', !!groqKey);
console.log('🔑 OPENAI key present:', !!openaiKey);

// Try Groq first (it's free)
if (groqKey) {
  try {
    const { OpenAI } = await import('openai');
    openai = new OpenAI({ 
      apiKey: groqKey,
      baseURL: 'https://api.groq.com/openai/v1'
    });
    console.log('✓ Groq AI initialized (free!)');
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

// Debug AI endpoint
app.get('/debug-ai', async (req, res) => {
  if (!openai) {
    return res.json({ error: 'AI not configured' });
  }
  
  try {
    const result = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Say hello!' }],
    });
    
    return res.json({ 
      success: true, 
      response: result.choices[0]?.message?.content 
    });
  } catch (e) {
    return res.json({ error: e.message });
  }
});

// Debug route intent
app.get('/debug-intent', (req, res) => {
  const { text } = req.query;
  if (!text) {
    return res.json({ error: 'Provide text param' });
  }
  
  const result = intentRouter.route(text);
  return res.json(result);
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
    
    // If AI is available and message is conversational (not a command), use AI
    // Otherwise use structured handlers
    const isCommand = ['remember', 'add_task', 'show_tasks', 'show_projects', 'profile', 'help', 'complete_task'].includes(routeResult.intent);
    
    if (openai && !isCommand) {
      console.log('🤖 Using AI for natural conversation...');
      try {
        result = await handlers.chatWithAI(userId, text);
        console.log('🤖 AI Response:', result?.message?.substring(0, 50));
      } catch (e) {
        console.log('🤖 AI Error:', e.message);
        result = { success: false, message: 'AI error' };
      }
      
      // If AI failed, fall back to help
      if (!result?.success || !result?.message) {
        console.log('🤖 AI failed, using help');
        result = await handlers.execute('help', 'suggest', userId, { originalText: text });
      }
    } else {
      // Use structured handlers for commands
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