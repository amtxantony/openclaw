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

Appends a JSONL record for every message Bob receives or sends. Useful for
audit trails, ticket cross-referencing, and debugging support conversation flows.

## Log File

`/workspace/bob/logs/messages.jsonl`

Each line is a JSON object:

```json
{"ts":"2026-03-08T01:00:00.000Z","direction":"received","channel":"whatsapp","from":"+1234567890","content":"My export keeps crashing","sessionKey":"agent:bob:..."}
{"ts":"2026-03-08T01:00:05.000Z","direction":"sent","channel":"whatsapp","to":"+1234567890","content":"Hi Carlos, I've opened ticket #42...","success":true,"sessionKey":"agent:bob:..."}
```

## Disabling

```bash
openclaw hooks disable message-logger
```
