# Personal AI Agent - System Architecture

## Version 1.0 | March 2026

---

## 1. Product Vision

### Core Purpose
A secure, modular personal AI assistant that acts as a centralized orchestration layer for your digital life. The agent operates as your "personal operating system" - knowing your context, managing communications, handling tasks, and escalating appropriately when human intervention is needed.

### Long-Term Capabilities
1. **Context Engine** - Knows your profile, preferences, routines, priorities, relationships
2. **Long-Term Memory** - Maintains persistent memory across sessions about projects, people, commitments
3. **Email Management** - Read, organize, summarize, and draft Gmail messages
4. **Notifications** - Text message notifications for important events
5. **Voice Capabilities** - Call you for urgent situations
6. **Task Management** - Reminders, scheduling, to-do orchestration
7. **Tool Orchestration** - Central hub connecting all your digital services

---

## 2. System Architecture Diagram (Text)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PERSONAL AGENT CORE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │
│  │   Context   │  │   Memory    │  │   Event     │  │   Approval      │    │
│  │   Engine    │  │   Manager   │  │   Processor │  │   Queue         │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘    │
│         │                │                │                │                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     ORCHESTRATION LAYER                            │    │
│  │         (Task routing, action planning, safety gates)              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│         │                │                │                │                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │
│  │   Profile  │  │   Audit     │  │   Config    │  │   Agent         │    │
│  │   Store    │  │   Logger    │  │   Manager   │  │   Definition    │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘    │
├─────────────────────────────────────────────────────────────────────────────┤
│                              INTEGRATION ADAPTERS                            │
├──────────────┬──────────────┬──────────────┬──────────────┬──────────────┤
│   Gmail     │    SMS       │    Voice     │   Calendar   │   Storage    │
│   Adapter   │   Adapter    │   Adapter    │   Adapter    │   Adapter    │
└──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
         │                │                │                │
    ┌────────┐       ┌────────┐       ┌────────┐      ┌────────┐
    │ Google │       │ Twilio │       │ Twilio │      │Supabase│
    │  API   │       │  API   │       │  API   │      │   DB   │
    └────────┘       └────────┘       └────────┘      └────────┘
```

---

## 3. Module Breakdown

### 3.1 Core Engine Modules

| Module | Responsibility | Public API |
|--------|----------------|------------|
| **Context Engine** | Maintains current user context, active session state, active task | `getContext()`, `updateContext()`, `clearContext()` |
| **Memory Manager** | Long-term storage and retrieval of personal data, relationships, history | `store()`, `retrieve()`, `search()`, `forget()` |
| **Event Processor** | Processes incoming triggers, routes to appropriate handlers | `processEvent()`, `subscribe()`, `unsubscribe()` |
| **Approval Queue** | Manages pending approvals, tracks decision status | `enqueue()`, `approve()`, `deny()`, `listPending()` |

### 3.2 Integration Adapters

| Adapter | Purpose | Provider Options |
|---------|---------|------------------|
| **Gmail Adapter** | Read, summarize, draft emails | Google Gmail API |
| **SMS Adapter** | Send text notifications | Twilio |
| **Voice Adapter** | Make urgent calls | Twilio |
| **Calendar Adapter** | Read/write events | Google Calendar API |
| **Storage Adapter** | Persistent data | Supabase |

### 3.3 Supporting Modules

| Module | Purpose |
|--------|---------|
| **Profile Store** | User preferences, default behaviors, contact info |
| **Audit Logger** | Every action logged with timestamp, user, action, result |
| **Config Manager** | Environment-based configuration, secret management |
| **Agent Definition** | OpenCode agent specification file |

---

## 4. Trust Levels & Permission Boundaries

### 4.1 Trust Level Definitions

| Level | Name | Capabilities | Examples |
|-------|------|--------------|----------|
| **0** | Minimal | Read-only, no external actions | Summarize email, read calendar |
| **1** | Low | Non-critical actions | Add to task list, set reminder |
| **2** | Medium | Actions with moderate impact | Draft email, send notification |
| **3** | High | Actions with significant impact | Send email, initiate call |
| **4** | Critical | Destructive or financial actions | Delete data, spend money |

### 4.2 Approval Requirements Matrix

| Action | Trust Level | Approval Required | Auto-Execute |
|--------|-------------|-------------------|--------------|
| Read email | 0 | No | Yes |
| Summarize email | 0 | No | Yes |
| Draft email | 2 | Yes (pre-approval) | No |
| Send email | 3 | Yes (pre-approval) | No |
| Send SMS | 3 | Yes (pre-approval) | No |
| Make call | 4 | Yes (always) | No |
| Delete data | 4 | Yes (always) | No |
| Move file | 2 | Yes (pre-approval) | No |
| Spend money | 4 | Yes (always) | No |
| Add calendar event | 1 | No | Yes |
| Set reminder | 1 | No | Yes |

### 4.3 Urgent Escalation Rules

The agent may bypass approval queue ONLY when ALL of these conditions are met:
1. **Critical Event Detected**: Security breach, health emergency, safety threat
2. **Pre-authorized Escalation**: User has pre-approved specific scenarios
3. **Attempted Contact Failed**: Unable to reach user via normal channels
4. **Documented in Audit**: All emergency actions logged immediately

**Pre-authorized Urgent Scenarios** (user-configurable):
- Security system alerts (motion detected, door opened when away)
- Health monitoring alerts (fall detected, heart anomaly)
- Missing person / no response after X hours
- Critical system failures (home systems offline)

---

## 5. Memory Categories

### 5.1 Memory Type Definitions

| Category | Retention | Access | Content |
|----------|-----------|--------|---------|
| **Session** | Until conversation ends | Agent-only | Current task, recent context |
| **Working** | 7 days | Agent + user | Active projects, current priorities |
| **Personal** | Forever | Agent + user | Profile, preferences, relationships |
| **Historical** | Forever | Agent + user | Past interactions, completed tasks |
| **Sensitive** | User-defined | Encrypted | Health data, financial info, passwords |

### 5.2 Memory Schema

```
UserProfile:
  - id: uuid
  - name: string
  - email: string
  - phone: string
  - timezone: string
  - preferences: json
  - created_at: timestamp
  - updated_at: timestamp

Relationship:
  - id: uuid
  - user_id: uuid
  - name: string
  - type: enum (family, friend, colleague, professional, other)
  - context: text
  - last_interaction: timestamp
  - importance: number (1-5)

Project:
  - id: uuid
  - user_id: uuid
  - name: string
  - status: enum (active, paused, completed)
  - priority: number (1-5)
  - description: text
  - milestones: json
  - created_at: timestamp
  - updated_at: timestamp

Event:
  - id: uuid
  - user_id: uuid
  - type: enum (email, sms, call, task, calendar)
  - summary: text
  - details: json
  - timestamp: timestamp

AuditLog:
  - id: uuid
  - user_id: uuid
  - action: string
  - details: json
  - trust_level: number
  - approved: boolean
  - timestamp: timestamp
```

---

## 6. File/Folder Structure

```
personal-agent/
├── .env.example                 # Environment template (secrets)
├── .gitignore
├── package.json
├── README.md
├── AGENTS.md                    # Agent instructions for OpenCode
├── ARCHITECTURE.md              # This file
│
├── config/
│   ├── index.js                 # Config loader
│   ├── defaults.js              # Default configurations
│   └── adapters.js              # Adapter configurations
│
├── src/
│   ├── core/
│   │   ├── context.js           # Context engine
│   │   ├── memory.js            # Memory manager
│   │   ├── orchestrator.js      # Task orchestration
│   │   └── approval.js          # Approval queue
│   │
│   ├── adapters/
│   │   ├── gmail/
│   │   │   ├── index.js         # Gmail adapter interface
│   │   │   ├── client.js        # Google API client
│   │   │   └── handlers.js      # Email operations
│   │   │
│   │   ├── sms/
│   │   │   ├── index.js         # SMS adapter interface
│   │   │   └── client.js        # Twilio client
│   │   │
│   │   ├── voice/
│   │   │   ├── index.js         # Voice adapter interface
│   │   │   └── client.js        # Twilio voice client
│   │   │
│   │   ├── calendar/
│   │   │   ├── index.js         # Calendar adapter interface
│   │   │   └── client.js        # Google Calendar client
│   │   │
│   │   └── storage/
│   │       ├── index.js         # Storage adapter interface
│   │       └── client.js        # Supabase client
│   │
│   ├── audit/
│   │   └── logger.js            # Audit logging
│   │
│   ├── utils/
│   │   ├── secrets.js           # Secret management
│   │   ├── validation.js         # Input validation
│   │   └── helpers.js           # Utility functions
│   │
│   └── triggers/
│       ├── index.js             # Event trigger framework
│       └── handlers/            # Trigger handlers
│
├── tests/
│   ├── integration/
│   │   ├── approval-flow.test.js
│   │   ├── audit-logging.test.js
│   │   └── adapter-errors.test.js
│   │
│   └── unit/
│       ├── context.test.js
│       ├── memory.test.js
│       └── orchestrator.test.js
│
└── docs/
    ├── DEPLOYMENT.md
    ├── SECURITY.md
    └── RUNBOOK.md
```

---

## 7. Prioritized Milestone Plan

### Phase 1: Foundation (Weeks 1-2)
- [ ] Core modules: Context, Memory, Orchestrator, Approval
- [ ] Audit logging infrastructure
- [ ] Environment configuration and secret management
- [ ] Basic OpenCode agent definition
- [ ] **Milestone**: Agent loads and maintains context

### Phase 2: Memory & Profile (Weeks 3-4)
- [ ] User profile storage and retrieval
- [ ] Relationship tracking
- [ ] Project memory
- [ ] Supabase integration
- [ ] **Milestone**: Agent remembers user preferences across sessions

### Phase 3: Email Integration (Weeks 5-6)
- [ ] Gmail OAuth setup
- [ ] Read email capability
- [ ] Email summarization
- [ ] Draft email generation
- [ ] **Milestone**: User can ask "What's my inbox about?" and get summary

### Phase 4: Notifications (Weeks 7-8)
- [ ] Twilio SMS integration
- [ ] Text notification capability
- [ ] Approval queue for sending
- [ ] **Milestone**: Agent can send important notifications with approval

### Phase 5: Voice & Escalation (Weeks 9-10)
- [ ] Twilio Voice integration
- [ ] Urgent call capability
- [ ] Escalation rules engine
- [ ] Emergency bypass (limited)
- [ ] **Milestone**: Agent can call for critical situations

### Phase 6: Task Management (Weeks 11-12)
- [ ] Task creation and tracking
- [ ] Reminder system
- [ ] Calendar integration
- [ ] Scheduling assistance
- [ ] **Milestone**: Agent manages daily tasks and reminders

### Phase 7: Security Hardening (Weeks 13-14)
- [ ] Full audit review
- [ ] Security penetration testing
- [ ] Permission model review
- [ ] Fail-safe verification
- [ ] **Milestone**: Production-ready security posture

### Phase 8: Production Deploy (Weeks 15-16)
- [ ] CI/CD pipeline
- [ ] Monitoring and alerting
- [ ] Documentation and runbook
- [ ] User acceptance testing
- **Milestone**: Live production system

---

## 8. Integration Requirements

### 8.1 Required API Keys / Services

| Service | Purpose | Key Type | Provider |
|---------|---------|----------|----------|
| Google Cloud | Gmail, Calendar access | OAuth 2.0 | console.cloud.google.com |
| Supabase | Database & storage | API Key | supabase.com |
| Twilio | SMS & Voice | Account SID + Auth Token | twilio.com |
| OpenCode | Agent runtime | API Key | opencode.ai |

### 8.2 OAuth Scopes Required

**Google (Gmail)**:
- `https://www.googleapis.com/auth/gmail.readonly` - Read emails
- `https://www.googleapis.com/auth/gmail.compose` - Draft emails
- `https://www.googleapis.com/auth/gmail.send` - Send emails (optional, controlled)

**Google (Calendar)**:
- `https://www.googleapis.com/auth/calendar.readonly` - Read events
- `https://www.googleapis.com/auth/calendar.events` - Create/modify events

---

## 9. Security Model

### 9.1 Key Principles

1. **Least Privilege** - Agent has minimum permissions needed
2. **Approval-First** - High-risk actions always require user approval
3. **Audit Everything** - Complete action logging
4. **Secret Isolation** - No secrets in code, use environment variables
5. **Modular Adapters** - Providers can be swapped without core changes

### 9.2 Secret Management

```
✅ GOOD
- Environment variables
- OpenCode secret storage
- HashiCorp Vault (future)

❌ BAD
- Hardcoded API keys in source
- Secrets in configuration files committed to repo
- Credentials in chat/prompts
```

---

## 10. OpenCode Agent Specification

The personal agent will be defined in OpenCode with:
- Clear system instructions defining its role and constraints
- Specific capabilities and limitations
- Approval workflow integration
- Memory context injection
- Security constraints baked in

See `AGENTS.md` for the full agent specification.

---

*End of Architecture Document*