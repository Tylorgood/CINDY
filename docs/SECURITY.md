# Security Model

## Overview

The Personal Agent implements defense-in-depth security with multiple layers of protection.

## Security Principles

### 1. Least Privilege
- Agent has minimum permissions needed for each operation
- OAuth scopes limited to specific capabilities
- API keys have minimum required permissions

### 2. Approval-First
- High-risk actions (trust level 3-4) require explicit approval
- Approval queue tracks all pending actions
- Approval timeout prevents stale requests

### 3. Complete Audit
- Every action logged with full context
- Sensitive data redacted in logs
- Audit logs retained for 1 year

### 4. Secret Isolation
- No secrets in source code
- Environment variables for all credentials
- Secrets never logged or exposed

## Trust Levels

| Level | Actions | Example |
|-------|---------|---------|
| 0 | Read-only | Read email, view calendar |
| 1 | Low impact | Add task, set reminder |
| 2 | Medium impact | Draft email, send notification |
| 3 | High impact | Send email, send SMS |
| 4 | Critical | Make call, delete data, spend money |

## Approval Matrix

| Action | Trust Level | Requires Approval |
|--------|-------------|-------------------|
| Read emails | 0 | No |
| Summarize | 0 | No |
| Create task | 1 | No |
| Draft email | 2 | Before sending |
| Send notification | 3 | Yes |
| Send email | 3 | Yes |
| Make call | 4 | Always |
| Delete data | 4 | Always |
| Spend money | 4 | Always |

## Emergency Escalation

The agent may bypass approval only when:
1. Critical event detected (security, health, safety)
2. Pre-authorized scenario (user configured)
3. Documented in audit with `emergency: true`

## Data Classification

### Sensitive Data
- Authentication tokens
- API keys
- Personal communications
- Financial information

### Handling
- Never log sensitive data
- Redact in audit trails
- Encrypt at rest (Supabase)
- Transmit only over TLS

## Security Checklist

- [ ] Environment variables set correctly
- [ ] Supabase RLS enabled
- [ ] Google OAuth scopes minimal
- [ ] Twilio credentials secured
- [ ] Audit logging functional
- [ ] Approval workflow tested
- [ ] Secrets never in code
- [ ] HTTPS in production

## Vulnerability Mitigation

| Risk | Mitigation |
|------|------------|
| API key exposure | Environment variables only |
| Data leakage | RLS + audit logging |
| Unauthorized actions | Approval queue |
| Social engineering | Explicit confirmation |
| Privilege escalation | Trust level enforcement |

## Incident Response

1. **Detect** - Review audit logs
2. **Contain** - Revoke API keys
3. **Eradicate** - Remove unauthorized data
4. **Recover** - Restore from clean state
5. **Lesson Learned** - Update security model

## Compliance

- GDPR: Data minimization, right to deletion
- SOC 2: Audit logging, access controls
- PCI-DSS: No card data stored