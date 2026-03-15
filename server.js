import express from 'express';
import personalAgent from './src/index.js';
import config from './config/index.js';

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Personal Agent is running! Send commands to /action, /memory, /approvals');
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    capabilities: personalAgent.getCapabilities(),
  });
});

app.post('/action', async (req, res) => {
  try {
    const { type, payload, userId = 'default-user', requiresApproval = false } = req.body;
    
    if (!type) {
      return res.status(400).json({ error: 'Action type required' });
    }

    const result = await personalAgent.executeAction({
      type,
      payload: payload || {},
      userId,
      requiresApproval,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/approvals/:userId', async (req, res) => {
  try {
    const pending = personalAgent.getPendingApprovals(req.params.userId);
    res.json({ pending });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/approvals/:approvalId/:decision', async (req, res) => {
  try {
    const { userId = 'default-user', reason } = req.body;
    const { approvalId, decision } = req.params;

    if (!['approve', 'deny'].includes(decision)) {
      return res.status(400).json({ error: 'Invalid decision' });
    }

    const result = await personalAgent.approveAction(approvalId, userId, decision, reason);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/memory', async (req, res) => {
  try {
    const { type, data, userId = 'default-user', persistent = true } = req.body;
    
    // Create memory object with userId at top level
    const memoryData = {
      userId,
      ...data
    };
    
    const result = await personalAgent.storeMemory(type, memoryData, { persistent });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/memory/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { userId = 'default-user', limit = 20 } = req.query;
    
    const memories = await personalAgent.getMemory(type, { userId }, { limit: parseInt(limit) });
    res.json({ memories });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/context', (req, res) => {
  res.json(personalAgent.getContext());
});

// Telegram webhook
app.post('/telegram/webhook', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || !message.text || !message.chat) {
      return res.json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text;
    const userId = message.from?.username || message.from?.first_name || 'telegram-user';

    console.log(`Telegram message from ${userId}: ${text}`);

    // For now, just echo back and explain
    const response = `I received: "${text}". This is the Personal Agent. For now, you can:\n- Store a memory: /memory [type] [content]\n- Get help: /help`;
    
    if (personalAgent.adapters.telegram) {
      await personalAgent.adapters.telegram.sendMessage(chatId, response);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    res.json({ ok: false });
  }
});

async function startServer() {
  try {
    await personalAgent.initialize();
    
    app.listen(config.port, () => {
      console.log(`Personal Agent server running on port ${config.port}`);
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