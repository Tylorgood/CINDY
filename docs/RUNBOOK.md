# Operations Runbook

## Daily Operations

### Starting the Agent

```bash
cd personal-agent
npm start
```

Expected output:
```
Initializing Personal Agent...
✓ Storage adapter initialized
✓ Gmail adapter initialized
✓ SMS adapter initialized
✓ Voice adapter initialized
Personal Agent initialized successfully
```

### Checking Status

```bash
# Check running processes
ps aux | grep node

# Check logs
tail -f logs/combined.log
```

### Viewing Audit Logs

Connect to Supabase and query:
```sql
SELECT * FROM audit_logs 
ORDER BY timestamp DESC 
LIMIT 50;
```

## Common Operations

### Add New User Preference

```javascript
await agent.storeMemory('preference', {
  key: 'preferredContactMethod',
  value: 'sms',
});
```

### Check Pending Approvals

```javascript
const pending = agent.getPendingApprovals('user-123');
console.log(pending);
```

### Approve Action

```javascript
await agent.approveAction('approval-id', 'user-123', 'approve');
```

### Get User Profile

```javascript
const profile = await agent.getMemory('profile', { userId: 'user-123' });
```

## Troubleshooting

### Adapter Not Initializing

Check environment variables:
```bash
echo $SUPABASE_URL
echo $GOOGLE_CLIENT_ID
echo $TWILIO_ACCOUNT_SID
```

### Database Connection Failed

1. Verify Supabase project is active
2. Check network connectivity
3. Verify credentials in `.env`

### Gmail API Errors

1. Verify OAuth consent screen configured
2. Check API is enabled in Google Cloud Console
3. Verify redirect URI matches config

### Twilio Errors

1. Verify account is active
2. Check phone number is provisioned
3. Verify account SID and token

## Maintenance

### Backup Database

Supabase handles automatic backups. For custom backup:
```bash
# Export via pg_dump
pg_dump $DATABASE_URL > backup.sql
```

### Rotate Secrets

1. Update in environment variables
2. Restart agent
3. Verify functionality

### Clear Session Cache

```javascript
agent.getContext().clearSession();
```

## Monitoring

### Key Metrics

- Pending approvals count
- Action success rate
- Adapter availability
- Response times

### Alert Conditions

- Approval queue > 10 pending
- Adapter failure > 2 consecutive
- Error rate > 10%

## Emergency Procedures

### Stop Agent

```bash
pkill -f "node src/index.js"
```

### Revoke API Access

1. Google: cloud.google.com → APIs → Disable
2. Twilio: console.twilio.com → API Keys → Revoke

### Data Isolation

1. Disable all adapters in config
2. Export audit logs for investigation
3. Contact security team