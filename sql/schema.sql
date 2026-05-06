-- Database Schema for Personal Agent
-- Run this in Supabase SQL Editor

-- ============================================
-- CORE TABLES
-- ============================================

-- User profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,
  name TEXT,
  email TEXT,
  phone TEXT,
  timezone TEXT DEFAULT 'America/New_York',
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Relationships (people user knows)
CREATE TABLE IF NOT EXISTS relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('family', 'friend', 'colleague', 'professional', 'other')),
  context TEXT,
  importance INTEGER DEFAULT 3 CHECK (importance >= 1 AND importance <= 5),
  last_interaction TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT CHECK (status IN ('active', 'paused', 'completed')) DEFAULT 'active',
  priority INTEGER DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
  description TEXT,
  milestones JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Memories (key-value with tags)
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')) DEFAULT 'pending',
  priority INTEGER DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  trust_level INTEGER,
  status TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- OAuth tokens storage
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Approval requests
CREATE TABLE IF NOT EXISTS approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  meta JSONB DEFAULT '{}',
  trust_level INTEGER NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'completed', 'failed')),
  denial_reason TEXT,
  expires_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  denied_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reachable contacts and trust status
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT,
  lookup_key TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'voice')),
  address TEXT NOT NULL,
  trusted BOOLEAN DEFAULT false,
  trusted_at TIMESTAMPTZ,
  last_approved_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stored Codex briefs and prompts
CREATE TABLE IF NOT EXISTS codex_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  goal TEXT NOT NULL,
  repo TEXT,
  relevant_files TEXT[] DEFAULT '{}',
  constraints TEXT[] DEFAULT '{}',
  acceptance_criteria TEXT[] DEFAULT '{}',
  verification_steps TEXT[] DEFAULT '{}',
  prompt TEXT NOT NULL,
  source_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  parent_job_id UUID,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  goal TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'queued'
    CHECK (phase IN ('queued', 'planning', 'awaiting_approval', 'running', 'blocked', 'completed', 'failed', 'cancelled')),
  backend TEXT,
  requested_tools TEXT[] DEFAULT '{}',
  requested_by TEXT DEFAULT 'telegram',
  telegram_chat_id TEXT,
  telegram_message_id TEXT,
  summary TEXT,
  result JSONB DEFAULT '{}',
  meta JSONB DEFAULT '{}',
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS job_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  step_key TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'queued'
    CHECK (phase IN ('queued', 'running', 'awaiting_approval', 'completed', 'failed', 'cancelled', 'blocked')),
  worker_type TEXT,
  worker_id TEXT,
  input JSONB DEFAULT '{}',
  output JSONB DEFAULT '{}',
  status_message TEXT,
  approval_id UUID,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS job_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  step_id UUID,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  content TEXT,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS worker_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id TEXT NOT NULL,
  worker_type TEXT NOT NULL,
  display_name TEXT,
  capabilities JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'online'
    CHECK (status IN ('online', 'busy', 'offline', 'paused')),
  last_heartbeat_at TIMESTAMPTZ DEFAULT NOW(),
  current_job_id UUID,
  current_step_id UUID,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tool_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'missing', 'revoked')),
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  account_key TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'disconnected', 'error')),
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS runbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  command TEXT NOT NULL,
  requires_approval BOOLEAN DEFAULT true,
  allowed_worker_type TEXT DEFAULT 'runbook',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operating_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE codex_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE runbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE operating_preferences ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage own profiles" ON profiles
  FOR ALL USING (true);

CREATE POLICY "Users can manage own relationships" ON relationships
  FOR ALL USING (true);

CREATE POLICY "Users can manage own projects" ON projects
  FOR ALL USING (true);

CREATE POLICY "Users can manage own memories" ON memories
  FOR ALL USING (true);

CREATE POLICY "Users can manage own tasks" ON tasks
  FOR ALL USING (true);

CREATE POLICY "Users can view own audit logs" ON audit_logs
  FOR SELECT USING (true);

CREATE POLICY "Users can manage own oauth tokens" ON oauth_tokens
  FOR ALL USING (true);

CREATE POLICY "Users can manage own approvals" ON approvals
  FOR ALL USING (true);

CREATE POLICY "Users can manage own contacts" ON contacts
  FOR ALL USING (true);

CREATE POLICY "Users can manage own codex briefs" ON codex_briefs
  FOR ALL USING (true);

CREATE POLICY "Users can manage own jobs" ON jobs
  FOR ALL USING (true);

CREATE POLICY "Users can manage own job steps" ON job_steps
  FOR ALL USING (true);

CREATE POLICY "Users can manage own job artifacts" ON job_artifacts
  FOR ALL USING (true);

CREATE POLICY "Users can manage worker sessions" ON worker_sessions
  FOR ALL USING (true);

CREATE POLICY "Users can manage own tool credentials" ON tool_credentials
  FOR ALL USING (true);

CREATE POLICY "Users can manage own crm accounts" ON crm_accounts
  FOR ALL USING (true);

CREATE POLICY "Users can manage own runbooks" ON runbooks
  FOR ALL USING (true);

CREATE POLICY "Users can manage own operating preferences" ON operating_preferences
  FOR ALL USING (true);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_relationships_user ON relationships(user_id);
CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_memories_user ON memories(user_id);
CREATE INDEX idx_memories_type ON memories(type);
CREATE INDEX idx_tasks_user ON tasks(user_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_oauth_tokens_user ON oauth_tokens(user_id);
CREATE INDEX idx_oauth_tokens_provider ON oauth_tokens(provider);
CREATE INDEX idx_approvals_user ON approvals(user_id);
CREATE INDEX idx_approvals_status ON approvals(status);
CREATE INDEX idx_contacts_user ON contacts(user_id);
CREATE INDEX idx_contacts_lookup ON contacts(user_id, channel, lookup_key);
CREATE INDEX idx_contacts_address ON contacts(user_id, channel, address);
CREATE INDEX idx_codex_briefs_user ON codex_briefs(user_id);
CREATE INDEX idx_codex_briefs_created ON codex_briefs(created_at DESC);
CREATE INDEX idx_jobs_user ON jobs(user_id);
CREATE INDEX idx_jobs_phase ON jobs(phase);
CREATE INDEX idx_jobs_created ON jobs(created_at DESC);
CREATE INDEX idx_job_steps_job ON job_steps(job_id);
CREATE INDEX idx_job_steps_phase ON job_steps(phase);
CREATE INDEX idx_job_artifacts_job ON job_artifacts(job_id);
CREATE INDEX idx_worker_sessions_worker ON worker_sessions(worker_id);
CREATE INDEX idx_worker_sessions_status ON worker_sessions(status);
CREATE INDEX idx_tool_credentials_user ON tool_credentials(user_id);
CREATE INDEX idx_crm_accounts_user ON crm_accounts(user_id);
CREATE INDEX idx_runbooks_user ON runbooks(user_id);
CREATE INDEX idx_operating_preferences_user_key ON operating_preferences(user_id, key);
