---
name: tasksmatic-task
description: Create, read, update, complete, and delete tasks in Tasksmatic via the REST API. Use when managing work items, to-dos, or project tasks inside Tasksmatic.
metadata:
  {
    "openclaw":
      {
        "emoji": "✅",
        "requires":
          {
            "bins": ["curl", "jq"],
            "env": ["TASKSMATIC_API_KEY", "TASKSMATIC_API_URL"],
          },
      },
  }
---

# Tasksmatic Task Skill

Manage tasks in Tasksmatic via the REST API. All requests authenticate with a Bearer token and return JSON.

## Setup

Set the following environment variables (add to your device's `.env`):

```bash
TASKSMATIC_API_URL=https://api.tasksmatic.com   # base URL — no trailing slash
TASKSMATIC_API_KEY=your-api-key-here
```

All examples below use these variables as `$TASKSMATIC_API_URL` and `$TASKSMATIC_API_KEY`.

---

## List Tasks

```bash
# All tasks (default page size)
curl -s "$TASKSMATIC_API_URL/tasks" \
  -H "Authorization: Bearer $TASKSMATIC_API_KEY" | jq '.[] | {id, title, status, assignee, dueDate}'

# Filter by status: open | in_progress | done
curl -s "$TASKSMATIC_API_URL/tasks?status=open" \
  -H "Authorization: Bearer $TASKSMATIC_API_KEY" | jq '.[] | {id, title, dueDate}'

# Filter by assignee
curl -s "$TASKSMATIC_API_URL/tasks?assigneeId=USER_ID" \
  -H "Authorization: Bearer $TASKSMATIC_API_KEY" | jq '.[] | {id, title, status}'

# Filter by project
curl -s "$TASKSMATIC_API_URL/tasks?projectId=PROJECT_ID" \
  -H "Authorization: Bearer $TASKSMATIC_API_KEY" | jq '.'
```

---

## Get a Task

```bash
curl -s "$TASKSMATIC_API_URL/tasks/TASK_ID" \
  -H "Authorization: Bearer $TASKSMATIC_API_KEY" | jq '.'
```

---

## Create a Task

```bash
curl -s -X POST "$TASKSMATIC_API_URL/tasks" \
  -H "Authorization: Bearer $TASKSMATIC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Follow up with Jane Doe re: Enterprise demo",
    "description": "Jane requested a demo on 2026-03-08. Schedule a 30-min Zoom and send calendar invite.",
    "status": "open",
    "priority": "high",
    "assigneeId": "USER_ID",
    "projectId": "PROJECT_ID",
    "dueDate": "2026-03-10"
  }' | jq '{id, title, url}'
```

Priority values: `low` | `medium` | `high` | `urgent`

---

## Update a Task

Patch only the fields you want to change:

```bash
# Change title and due date
curl -s -X PATCH "$TASKSMATIC_API_URL/tasks/TASK_ID" \
  -H "Authorization: Bearer $TASKSMATIC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated title", "dueDate": "2026-03-12"}' | jq '{id, title, dueDate}'

# Reassign to a different user
curl -s -X PATCH "$TASKSMATIC_API_URL/tasks/TASK_ID" \
  -H "Authorization: Bearer $TASKSMATIC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"assigneeId": "NEW_USER_ID"}' | jq '{id, assignee}'

# Change status
curl -s -X PATCH "$TASKSMATIC_API_URL/tasks/TASK_ID" \
  -H "Authorization: Bearer $TASKSMATIC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress"}' | jq '{id, status}'
```

---

## Complete a Task

```bash
curl -s -X PATCH "$TASKSMATIC_API_URL/tasks/TASK_ID" \
  -H "Authorization: Bearer $TASKSMATIC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": "done"}' | jq '{id, title, status}'
```

---

## Add a Comment

```bash
curl -s -X POST "$TASKSMATIC_API_URL/tasks/TASK_ID/comments" \
  -H "Authorization: Bearer $TASKSMATIC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"body": "Called Jane — confirmed demo for 2026-03-10 at 2pm SGT. Invite sent."}' | jq '{id, body}'
```

---

## Delete a Task

```bash
curl -s -X DELETE "$TASKSMATIC_API_URL/tasks/TASK_ID" \
  -H "Authorization: Bearer $TASKSMATIC_API_KEY" \
  -o /dev/null -w "%{http_code}"
# Expect 204 on success
```

---

## List Projects (to find PROJECT_ID)

```bash
curl -s "$TASKSMATIC_API_URL/projects" \
  -H "Authorization: Bearer $TASKSMATIC_API_KEY" | jq '.[] | {id, name}'
```

---

## List Users (to find USER_ID / assigneeId)

```bash
curl -s "$TASKSMATIC_API_URL/users" \
  -H "Authorization: Bearer $TASKSMATIC_API_KEY" | jq '.[] | {id, name, email}'
```

---

## Error Handling

| HTTP status | Meaning | Action |
|-------------|---------|--------|
| 200 / 201 | Success | Parse the response JSON |
| 204 | Success (no body) | e.g. after DELETE |
| 400 | Bad request | Log the response body — likely a missing required field |
| 401 | Unauthorised | Check `TASKSMATIC_API_KEY` is set and valid |
| 404 | Not found | Task or resource ID is wrong |
| 429 | Rate limited | Wait briefly and retry once |
| 5xx | Server error | Log and surface to the user; do not retry automatically |

---

## Notes

- Always capture the returned `id` when creating a task so it can be referenced later.
- When creating tasks on behalf of a user message, set `dueDate` only if the user explicitly mentioned a deadline.
- If `TASKSMATIC_API_URL` is not set, output a warning and do nothing — never guess the URL.
- Return the task `id` (and `url` if present) to the caller after any create or update.
