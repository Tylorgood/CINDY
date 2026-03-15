# Test Scenarios

## Unit Tests

### Context Engine
- [x] Initialize empty context
- [x] Initialize with userId
- [x] Update context partially
- [x] Track active tasks
- [x] Add recent actions
- [x] Track pending approvals

### Approval Queue
- [x] Enqueue approval request
- [x] Approve request
- [x] Deny request
- [x] List pending for user
- [x] Expired approvals

### Memory Manager
- [x] Store memory
- [x] Retrieve memory
- [x] Search memories
- [x] Update memory
- [x] Delete memory

## Integration Tests

### Adapter Tests

| Test | Description | Expected Result |
|------|-------------|-----------------|
| Storage CRUD | Create, read, update, delete operations | All operations succeed |
| Gmail list | List recent emails | Returns message array |
| Gmail draft | Create email draft | Draft ID returned |
| SMS send | Send text message | Message SID returned |
| Voice call | Make voice call | Call SID returned |
| Calendar events | List calendar events | Events array returned |

### Approval Flow Tests

| Test | Description | Expected Result |
|------|-------------|-----------------|
| Low trust action | Execute task.create (trust 1) | Executes immediately |
| Medium trust action | Execute email.draft (trust 2) | Requires approval |
| High trust action | Execute email.send (trust 3) | Requires approval |
| Approve action | Approve pending request | Action executes |
| Deny action | Deny pending request | Action blocked |

## Manual Test Scenarios

### Scenario 1: Read Gmail
```
1. Send POST /action with { type: 'email.read', payload: { maxResults: 10 } }
2. Expect: { success: true, result: [...] }
```

### Scenario 2: Draft Email (Approval Required)
```
1. Send POST /action with { type: 'email.draft', payload: {...} }
2. Expect: { requiresApproval: true, approvalId: '...' }
3. Send POST /approvals/{approvalId}/approve with { userId: '...' }
4. Expect: { status: 'approved' }
```

### Scenario 3: Store Memory
```
1. Send POST /memory with { type: 'preference', data: {...} }
2. Expect: { id: '...', type: 'preference' }
3. Send GET /memory/preference
4. Expect: { memories: [...] }
```

### Scenario 4: Context Retrieval
```
1. Send GET /context
2. Expect: { sessionId: '...', userId: '...', activeTask: null, ... }
```

### Scenario 5: Health Check
```
1. Send GET /health
2. Expect: { status: 'ok', capabilities: {...} }
```

## Failure Mode Analysis

### Storage Adapter
| Failure | Impact | Mitigation |
|---------|--------|------------|
| Supabase down | All DB ops fail | Log error, continue with in-memory |
| Invalid credentials | Cannot connect | Validate on startup |
| Rate limiting | Requests rejected | Backoff + retry |

### Gmail Adapter
| Failure | Impact | Mitigation |
|---------|--------|------------|
| OAuth expired | Cannot access API | Auto-refresh token |
| No permission | API returns error | Clear error message |
| Rate limiting | Requests rejected | Backoff + retry |

### SMS/Voice Adapter
| Failure | Impact | Mitigation |
|---------|--------|------------|
| Twilio down | Cannot send | Log + notify user |
| Invalid number | Send fails | Validate number format |
| Insufficient credits | Send fails | Check balance before send |

### Approval Queue
| Failure | Impact | Mitigation |
|---------|--------|------------|
| Expired approval | Action not executed | Clear expired on check |
| Concurrent access | Race condition | Use transaction/lock |

## Security Tests

### Test: Secret Redaction
```
1. Execute action with sensitive payload
2. Query audit log
3. Verify no secrets in log
```

### Test: Unauthorized Approval
```
1. Create approval as user A
2. Try to approve as user B
3. Expect: Error - Unauthorized
```

### Test: Trust Level Enforcement
```
1. Try to execute trust level 4 action without approval
2. Expect: Requires approval
```

## Performance Tests

| Metric | Target |
|--------|--------|
| Agent initialization | < 3 seconds |
| Action execution (no API) | < 100ms |
| Approval queue check | < 50ms |
| Memory retrieval | < 200ms |

## Dependencies Required

To run full tests, need:
- [ ] Supabase project with schema
- [ ] Google Cloud project with Gmail API enabled
- [ ] Twilio account with phone number
- [ ] OAuth consent configured

## Current Status

- [x] Core modules tested
- [x] Server starts successfully
- [ ] Integration tests pending API keys
- [ ] Manual test scenarios ready