import express from 'express';
import personalAgent from './src/index.js';
import config from './config/index.js';
import { IntentRouter } from './src/router/intent.js';
import { HandlerRegistry } from './src/handlers/index.js';
import { AuditLogger } from './src/audit/telegramLogger.js';

const app = express();
app.use(express.json());

// Root route
app.get('/', (req, res) => {
  res.send('CINDY Personal Agent - Telegram bot running!');
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    capabilities: personalAgent.getCapabilities(),
  });
});

// Initialize handlers after agent is ready
let intentRouter;
let handlers;
let auditLogger;

async function initializePipeline() {
  // Wait for agent to be ready
  await personalAgent.initialize();
  
  // Initialize intent router
  intentRouter = new IntentRouter();
  
  // Initialize handlers with storage adapter
  handlers = new HandlerRegistry(personalAgent.adapters.storage, intentRouter);
  
  // Initialize audit logger
  auditLogger = new AuditLogger(personalAgent.adapters.storage);
  
  console.log('✓ Pipeline initialized');
}

const pipelineInit = initializePipeline();

// Telegram webhook - full pipeline
app.post('/telegram/webhook', async (req, res) => {
  try {
    // Await pipeline init if not ready
    await pipelineInit;

    const { message } = req.body;
    
    // 1. Validate incoming message
    if (!message || !message.text || !message.chat) {
      return res.json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text;
    const messageId = message.message_id;
    const userId = message.from?.username || message.from?.first_name || `tg_${message.from?.id}`;
    const userName = message.from?.first_name || 'User';

    console.log(`📩 Message from ${userName} (${userId}): ${text}`);

    // 2. Log incoming message
    await auditLogger.logIncoming(userId, messageId, text, chatId);

    // 3. Route to intent
    const routeResult = intentRouter.route(text);
    
    console.log(`🎯 Intent: ${routeResult.intent} (${routeResult.handler}.${routeResult.action})`);

    // 4. Execute handler
    const result = await handlers.execute(
      routeResult.handler,
      routeResult.action,
      userId,
      routeResult.params
    );

    // 5. Log action execution
    await auditLogger.logAction(userId, `${routeResult.handler}.${routeResult.action}`, {
      intent: routeResult.intent,
      params: routeResult.params,
      success: result.success
    });

    // 6. Send response
    if (result.message) {
      await personalAgent.adapters.telegram?.sendMessage(chatId, result.message);
      
      // 7. Log outgoing response
      await auditLogger.logOutgoing(userId, messageId, result.message, routeResult.intent);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('❌ Pipeline error:', error);
    
    // Log error
    if (auditLogger) {
      await auditLogger.logError(userId, 'telegram_pipeline', error);
    }

    // Try to send error message to user
    try {
      if (message?.chat?.id && personalAgent.adapters.telegram) {
        await personalAgent.adapters.telegram.sendMessage(
          message.chat.id,
          "Sorry, something went wrong. Try again!"
        );
      }
    } catch (e) {
      // Ignore errors in error handling
    }
    
    res.json({ ok: false, error: error.message });
  }
});

async function startServer() {
  try {
    await personalAgent.initialize();
    
    app.listen(config.port, () => {
      console.log(`CINDY Personal Agent running on port ${config.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;