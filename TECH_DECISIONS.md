# PHASE 2: Technical Decisions

## Technology Stack Recommendations

This document recommends specific technologies for each component of the personal agent, with justification and alternatives.

---

## 1. Agent Definition & Runtime

### Recommendation: OpenCode

**Choice**: Use OpenCode's native agent definition system (`AGENTS.md`)

**Why**:
- Already integrated into your workflow
- Supports memory context injection
- Built-in tool calling
- Secure prompt management

**Alternative**: Custom prompt engineering with separate agent platform

---

## 2. Backend Runtime

### Recommendation: Node.js (v24+)

**Choice**: Node.js with Express.js

**Why**:
- Already installed (v24.13.0)
- Large ecosystem for Google/Twilio APIs
- Native async/await for event-driven architecture
- Good for microservices pattern
- Supabase has excellent Node SDK

**Alternatives**:
- Python (FastAPI) - Good for AI/ML but less integrated with your existing stack
- Go - Better performance but more verbose
- Bun - Faster but newer, less battle-tested

### Recommendation: Express.js

**Why**:
- Simple, well-understood patterns
- Extensive middleware ecosystem
- Good for proxy/routing pattern with OpenCode

**Alternative**: Fastify (smaller, faster) or Koa (more modular)

---

## 3. Database

### Recommendation: Supabase

**Choice**: Supabase (PostgreSQL)

**Why**:
- Already configured in your Pinnacle V2 project
- Excellent TypeScript SDK
- Row-level security built-in
- Real-time subscriptions
- Easy authentication integration
- Generous free tier

**Alternatives**:
- Firebase - Good but less SQL flexibility
- PlanetScale - Good serverless MySQL, but Supabase already in use
- MongoDB - Less structured, harder to enforce schemas
- SQLite - Too limited for production

---

## 4. Memory Storage

### Recommendation: Supabase + In-Memory Cache

**Choice**: Hybrid approach - Supabase for persistent memory, Node.js in-memory for session context

**Why**:
- Supabase handles long-term storage with full query capability
- Session context (current task, active conversation) stored in-memory for speed
- Easy to extend to Redis later if needed

**Schema Approach**:
- `profiles` table - User profile
- `relationships` table - People user knows
- `projects` table - Ongoing projects
- `memories` table - Key-value memories with tags
- `audit_logs` table - Action history

**Alternatives**:
- Redis - Faster but additional infrastructure
- Pinecone - Good for vector similarity search (future enhancement)
- Chroma - Open-source vectors, good for embeddings later

---

## 5. Job Queue / Scheduler

### Recommendation: Node-schedule (for immediate needs) + Supabase for persistence

**Choice**: Built-in Node.js scheduling with database persistence

**Why**:
- Simple for basic scheduling (reminders, cron-like jobs)
- Supabase can store scheduled job state
- No additional infrastructure needed
- Easy to migrate to BullMQ + Redis later if scaling

**Alternatives**:
- BullMQ + Redis - More robust, better for high-volume
- Agenda - MongoDB-based, simpler than Bull
- Cloud Scheduler (Google Cloud) - Managed, but adds dependency

---

## 6. Gmail Integration

### Recommendation: Google Gmail API with @google-cloud/gmail package

**Choice**: Official Google Cloud SDK

**Why**:
- Official, maintained by Google
- Full API coverage
- Proper token refresh handling
- Better error handling than REST direct

**Setup Required**:
1. Google Cloud Console project
2. OAuth 2.0 credentials
3. Scopes: `gmail.readonly`, `gmail.compose`, (optional) `gmail.send`

**Alternatives**:
- IMAP/SMTP - Older, less secure, no OAuth
- Nodemailer with Gmail - Works but less API control
- Third-party wrappers - Less reliable

---

## 7. SMS / Voice Integration

### Recommendation: Twilio

**Choice**: Twilio SDK

**Why**:
- Industry standard
- Excellent Node.js SDK
- Both SMS and Voice from one provider
- Good documentation
- Webhook support for incoming

**Setup Required**:
1. Twilio account
2. Phone number purchase
3. Account SID and Auth Token

**Alternatives**:
- AWS SNS (SMS only) - No voice
- Vonage (Nexmo) - Good but less market share
- Plivo - Cheaper but less mature

---

## 8. Logging & Observability

### Recommendation: Winston + Supabase

**Choice**: Winston for application logging, Supabase for audit persistence

**Why**:
- Winston is standard Node.js logger
- Easy to configure multiple transports (console, file, DB)
- Supabase stores audit logs persistently
- Can add Sentry later for error tracking

**Log Levels**:
- `error` - System errors, failures
- `warn` - Warnings (approval denials, missing configs)
- `info` - Normal operations (action taken, email read)
- `debug` - Detailed debugging (API calls, variables)

**For Audit Logs**: Always store in Supabase with full context

**Alternatives**:
- Pino - Faster, less overhead, but Winston more common
- ELK Stack - Better for large-scale, overkill here
- Datadog - Expensive, more enterprise

---

## 9. Authentication & Secrets

### Recommendation: Environment Variables + OpenCode Secrets

**Choice**: Hybrid secret management

**Why**:
- Simple, no additional tools needed
- OpenCode has built-in secret storage for agent definitions
- Environment variables for runtime configuration
- Easy to rotate

**Secret Management Pattern**:
```
.env (local) → process.env (runtime) → secrets manager (future)
```

**Required Secrets**:
- `SUPABASE_URL`, `SUPABASE_KEY` - Database
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - Gmail API
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` - SMS/Voice
- `OPENCODE_API_KEY` - Agent runtime (if external)

**Alternatives**:
- HashiCorp Vault - Best for production, adds complexity
- AWS Secrets Manager - If already on AWS
- Doppler - Good developer experience, but costs

---

## 10. Summary: Technology Matrix

| Component | Recommendation | Package/Service |
|-----------|----------------|----------------|
| Runtime | Node.js 24 | Node.js |
| Web Framework | Express.js | express |
| Database | Supabase | @supabase/supabase-js |
| Memory | Supabase + In-memory | (built-in) |
| Scheduler | node-schedule | node-schedule |
| Gmail | @google-cloud/gmail | @google-cloud/gmail |
| SMS/Voice | Twilio | twilio |
| Logging | Winston | winston |
| Auth | Environment + OAuth | (built-in) |
| Secrets | Environment variables | dotenv |

---

## 11. Package Dependencies (Initial)

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "@supabase/supabase-js": "^2.39.0",
    "@google-cloud/gmail": "^1.5.0",
    "twilio": "^4.19.0",
    "winston": "^3.11.0",
    "node-schedule": "^2.1.1",
    "dotenv": "^16.3.1",
    "uuid": "^9.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "eslint": "^8.55.0"
  }
}
```

---

## 12. Implementation Priority

After scaffolding (Phase 3), implement in this order:
1. Supabase client + basic CRUD
2. Audit logger
3. Gmail adapter (read only)
4. Approval queue
5. Profile memory
6. SMS adapter
7. Voice adapter
8. Calendar adapter

---

*End of Technical Decisions*