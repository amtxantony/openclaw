---
name: message-logger
description: "Log all inbound and outbound messages to a JSONL audit file"
metadata:
  {
    "openclaw":
      {
        "emoji": "📋",
        "events": ["message"],
      },
  }
---

# Message Logger Hook

Appends a JSONL record for every message Alice receives or sends. Useful for
audit trails, CRM cross-referencing, and debugging conversation flows.

## Log File

`/workspace/alice/logs/messages.jsonl`

Each line is a JSON object:

```json
{"ts":"2026-03-08T01:00:00.000Z","direction":"received","channel":"telegram","from":"+1234567890","content":"Hi, I'd like a demo","sessionKey":"agent:alice:..."}
{"ts":"2026-03-08T01:00:05.000Z","direction":"sent","channel":"telegram","to":"+1234567890","content":"Hi! I'd be happy to help...","success":true,"sessionKey":"agent:alice:..."}
```

## Disabling

```bash
openclaw hooks disable message-logger
```
