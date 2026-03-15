import express from 'express';
import { IntentRouter } from './src/router/intent.js';
import { HandlerRegistry } from './src/handlers/index.js';
import { AuditLogger } from './src/audit/telegramLogger.js';
import storageAdapter from './src/adapters/storage/index.js';
import config from './config/index.js';

const app = express();
app.use(express.json());

console.log('Supabase URL:', config.supabase?.url ? 'present' : 'missing');
console.log('Supabase Key:', config.supabase?.key ? 'present' : 'missing');

const storage = storageAdapter.isInitialized() ? storageAdapter : null;

console.log('Storage adapter:', storage ? 'ready' : 'NOT configured');

let openai = null;
const aiConfig = config.ai;

console.log('AI provider:', aiConfig.provider || 'not configured');
console.log('AI key present:', !!aiConfig.apiKey);
console.log('AI model:', aiConfig.model || 'not configured');

if (aiConfig.provider && aiConfig.apiKey && aiConfig.model) {
  try {
    const { OpenAI } = await import('openai');
    const clientOptions = {
      apiKey: aiConfig.apiKey
    };

    if (aiConfig.baseUrl) {
      clientOptions.baseURL = aiConfig.baseUrl;
    }

    if (aiConfig.provider === 'openrouter') {
      clientOptions.defaultHeaders = {
        'HTTP-Referer': aiConfig.referer || 'https://cindy-9bti.onrender.com',
        'X-OpenRouter-Title': aiConfig.title || 'CINDY'
      };
    }

    openai = new OpenAI(clientOptions);
    console.log(`AI initialized: ${aiConfig.provider} (${aiConfig.model})`);
  } catch (error) {
    console.warn('AI initialization failed:', error.message);
  }
} else {
  console.warn('No AI configured');
}

const intentRouter = new IntentRouter();
const handlers = new HandlerRegistry(storage, intentRouter, openai, aiConfig);
const auditLogger = new AuditLogger(storage);

console.log('Pipeline initialized');

function getUserId(message) {
  return message.from?.username || message.from?.first_name || `tg_${message.from?.id}`;
}

async function sendTelegramMessage(chatId, text) {
  if (!config.telegram?.botToken) {
    throw new Error('Telegram bot token not configured');
  }

  const telegramUrl = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
  const telegramResponse = await fetch(telegramUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text
    })
  });

  if (!telegramResponse.ok) {
    const errorBody = await telegramResponse.text();
    throw new Error(`Telegram API error (${telegramResponse.status}): ${errorBody}`);
  }
}

async function resolveMessage(handlers, routeResult, userId, text) {
  if (routeResult.intent === 'unknown' && handlers.hasAI()) {
    try {
      const aiResult = await handlers.chatWithAI(userId, text);
      if (aiResult?.success && aiResult?.message) {
        return {
          result: aiResult,
          execution: { source: 'ai', handler: 'ai', action: 'chat' }
        };
      }
    } catch (error) {
      console.error('AI request failed, falling back to handler:', error.message);
    }
  }

  const handlerResult = await handlers.execute(
    routeResult.handler,
    routeResult.action,
    userId,
    routeResult.params
  );

  return {
    result: handlerResult,
    execution: {
      source: 'handler',
      handler: routeResult.handler,
      action: routeResult.action
    }
  };
}

app.get('/', (req, res) => {
  res.send('CINDY is running!');
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    ai: handlers.hasAI(),
    storage: !!storage,
    aiProvider: aiConfig.provider,
    aiModel: aiConfig.model
  });
});

app.post('/telegram/webhook', async (req, res) => {
  const { message } = req.body;

  if (!message || !message.text || !message.chat) {
    return res.json({ ok: true });
  }

  const chatId = message.chat.id;
  const text = message.text;
  const messageId = message.message_id;
  const userId = getUserId(message);
  const userName = message.from?.first_name || 'User';

  try {
    console.log(`Telegram message from ${userName}: ${text}`);

    await auditLogger.logIncoming(userId, messageId, text, chatId);

    const routeResult = intentRouter.route(text);
    console.log(`Intent detected: ${routeResult.intent}`);

    const { result, execution } = await resolveMessage(handlers, routeResult, userId, text);
    const responseText = result?.message || 'Something went wrong. Try again.';

    await sendTelegramMessage(chatId, responseText);

    await auditLogger.logAction(
      userId,
      routeResult.intent,
      {
        source: execution.source,
        handler: execution.handler,
        action: execution.action,
        params: routeResult.params,
        success: result?.success ?? false
      },
      result?.success ? 'success' : 'failed'
    );

    await auditLogger.logOutgoing(userId, messageId, responseText, routeResult.intent);

    return res.json({ ok: true });
  } catch (error) {
    console.error('Pipeline error:', error);

    try {
      await auditLogger.logError(userId, 'telegram.webhook', error);
    } catch (logError) {
      console.error('Failed to record webhook error:', logError);
    }

    return res.json({ ok: false, error: error.message });
  }
});

app.listen(config.port, () => {
  console.log(`CINDY running on port ${config.port}`);
});

export default app;
