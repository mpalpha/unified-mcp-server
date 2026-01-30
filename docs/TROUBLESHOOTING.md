# Troubleshooting

## Common Issues

### Database Locked

**Symptom:** `SQLITE_BUSY: database is locked`

**Solution:**
- Wait for concurrent operations to complete
- Check for zombie processes: `ps aux | grep node`
- Delete lock file if stale: `rm ~/.unified-mcp/data.db-*`

### FTS5 Corruption

**Symptom:** `SQLITE_CORRUPT_VTAB: database disk image is malformed`

**Solution:**
1. Run health check: `health_check`
2. If corrupted, rebuild index:
```bash
rm ~/.unified-mcp/data.db
node test-suite.js  # Recreates with test data
```

### Token Expired

**Symptom:** `Token expired` or `Token not found`

**Solution:**
- Operation tokens expire in 5 minutes
- Session tokens expire in 60 minutes
- Get a new token with `verify_compliance`
- Cleanup expired tokens: `reset_workflow` with `cleanup_only: true`

### Duplicate Detection

**Symptom:** `Similar experience already exists`

**Solution:**
- This is normal behavior (90% similarity threshold)
- Make situation text more unique
- Use `update_experience` to revise existing instead
- Check duplicate_id in response to get existing record

### Tests Failing

**Symptom:** Some tests fail on repeated runs

**Solution:**
- Tests automatically clean database before running
- If issues persist: `rm ~/.unified-mcp/data.db`
- Run tests: `node test-suite.js`

### Import Failures

**Symptom:** Records skipped during import

**Solution:**
- Verify JSON format matches schema
- Required fields: type, domain, situation, approach, outcome, reasoning
- Check file exists and is readable
- Review import results for error details

## Debugging

### Enable Verbose Logging

Server logs to stderr:
```bash
node index.js 2> debug.log
```

### Check Database

```bash
sqlite3 ~/.unified-mcp/data.db
.tables
SELECT COUNT(*) FROM experiences;
.quit
```

### Verify Token Directory

```bash
ls -la ~/.unified-mcp/tokens/
```

### Health Check

```json
{
  "name": "health_check",
  "arguments": {}
}
```

Returns diagnostic information about:
- Database connectivity
- Table integrity
- FTS5 index
- Record counts

### Session State

```json
{
  "name": "get_session_state",
  "arguments": {
    "session_id": "your-session"
  }
}
```

## Performance

### Slow Searches

- FTS5 with BM25 is optimized for speed
- Large result sets use `output_mode: "files_with_matches"`
- Add domain/type filters to narrow results

### Database Size

```bash
du -h ~/.unified-mcp/data.db
```

Export and reimport to compact:
```json
{
  "name": "export_experiences",
  "arguments": {
    "format": "json",
    "file_path": "backup.json"
  }
}
```

## Getting Help

1. Run `health_check` to verify system status
2. Check logs in stderr
3. Review test output: `node test-suite.js`
4. Verify database integrity with sqlite3
