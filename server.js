import express from 'express';
import { AuditLogger } from './src/audit/telegramLogger.js';
import storageAdapter from './src/adapters/storage/index.js';
import config from './config/index.js';
import CindyRuntime from './src/core/runtime.js';

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
      apiKey: aiConfig.apiKey,
    };

    if (aiConfig.baseUrl) {
      clientOptions.baseURL = aiConfig.baseUrl;
    }

    if (aiConfig.provider === 'openrouter') {
      clientOptions.defaultHeaders = {
        'HTTP-Referer': aiConfig.referer || 'https://cindy-1ud0.onrender.com',
        'X-OpenRouter-Title': aiConfig.title || 'CINDY',
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

const runtime = new CindyRuntime({ storage, openai, aiConfig });
const telegram = runtime.telegram;
const auditLogger = new AuditLogger(storage);

console.log('Pipeline initialized');

function getUserId(from = {}) {
  return from.username || from.first_name || `tg_${from.id}`;
}

function authorizeWorker(req, res, next) {
  if (!config.controlPlane?.workerSecret) {
    return res.status(503).json({ ok: false, error: 'Worker bridge secret not configured' });
  }

  const secret = req.headers['x-cindy-worker-secret'];
  if (secret !== config.controlPlane.workerSecret) {
    return res.status(401).json({ ok: false, error: 'Unauthorized worker' });
  }

  return next();
}

async function sendTelegramMessage(chatId, text, options = {}) {
  return await telegram.sendMessage(chatId, text, options);
}

app.get('/', (req, res) => {
  res.send('CINDY is running!');
});

app.get('/health', async (req, res) => {
  res.json(await runtime.getHealth());
});

app.get('/auth/google/start', (req, res) => {
  const userId = String(req.query.userId || 'default-user');
  const url = runtime.getConnectGoogleUrl(userId);

  if (!url) {
    return res.status(400).send('Google OAuth is not configured.');
  }

  return res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).send(`Google authorization failed: ${error}`);
  }

  if (!code) {
    return res.status(400).send('Missing Google authorization code.');
  }

  try {
    const result = await runtime.handleGoogleCallback(String(code), String(state || 'default-user'));
    return res.send(`Google connected for ${result.userId}. You can return to Telegram and ask CINDY about your inbox or calendar.`);
  } catch (authError) {
    return res.status(500).send(`Google callback failed: ${authError.message}`);
  }
});

app.post('/workers/register', authorizeWorker, async (req, res) => {
  try {
    const session = await runtime.workerRegistry.registerWorker(req.body || {});
    return res.json({ ok: true, session });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/workers/heartbeat', authorizeWorker, async (req, res) => {
  try {
    const session = await runtime.workerRegistry.heartbeat(String(req.body.workerId), req.body || {});
    return res.json({ ok: true, session });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/workers/jobs/claim', authorizeWorker, async (req, res) => {
  try {
    const claimed = await runtime.supervisor.claimNextJob(String(req.body.workerId), String(req.body.workerType || 'coding'));
    return res.json({ ok: true, ...(claimed || {}) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/workers/jobs/:jobId/events', authorizeWorker, async (req, res) => {
  try {
    await runtime.supervisor.processWorkerEvent(
      String(req.body.workerId),
      String(req.params.jobId),
      String(req.body.stepId),
      req.body.event || {}
    );
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

async function handleCallbackQuery(callbackQuery) {
  const userId = getUserId(callbackQuery.from);
  const chatId = callbackQuery.message?.chat?.id;
  const data = callbackQuery.data || '';

  let result = { success: false, message: 'Unknown approval action.' };
  if (data.startsWith('approve:')) {
    result = await runtime.processApprovalDecision(userId, data.replace('approve:', ''), 'approve');
  } else if (data.startsWith('deny:')) {
    result = await runtime.processApprovalDecision(userId, data.replace('deny:', ''), 'deny');
  }

  await telegram.answerCallbackQuery(callbackQuery.id, result.success ? 'Done' : 'Needs attention');

  if (chatId && result.message) {
    await sendTelegramMessage(chatId, result.message, result.telegram || {});
  }

  await auditLogger.logAction(userId, 'telegram.callback', {
    callbackData: data,
    success: result.success ?? false,
  }, result.success ? 'success' : 'failed');
}

async function handleTelegramMessage(message) {
  if (!message?.text || !message.chat) {
    return;
  }

  const chatId = message.chat.id;
  const text = message.text;
  const messageId = message.message_id;
  const userId = getUserId(message.from);
  const userName = message.from?.first_name || 'User';

  console.log(`Telegram message from ${userName}: ${text}`);

  await auditLogger.logIncoming(userId, messageId, text, chatId);

  const result = await runtime.processMessage(userId, text, {
    telegramChatId: chatId,
    telegramMessageId: messageId,
  });
  const responseText = result?.message || 'Something went wrong. Try again.';

  await sendTelegramMessage(chatId, responseText, result.telegram || {});

  await auditLogger.logAction(
    userId,
    'telegram.message',
    {
      input: text,
      success: result?.success ?? false,
    },
    result?.success ? 'success' : 'failed'
  );

  await auditLogger.logOutgoing(userId, messageId, responseText, 'telegram');
}

app.post('/telegram/webhook', async (req, res) => {
  try {
    if (req.body?.callback_query) {
      await handleCallbackQuery(req.body.callback_query);
      return res.json({ ok: true });
    }

    if (req.body?.message) {
      await handleTelegramMessage(req.body.message);
      return res.json({ ok: true });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('Pipeline error:', error);
    return res.json({ ok: false, error: error.message });
  }
});

app.listen(config.port, () => {
  console.log(`CINDY running on port ${config.port}`);
});

export default app;
