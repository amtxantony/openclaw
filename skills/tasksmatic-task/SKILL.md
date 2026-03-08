---
name: tasksmatic-task
description: Interact with Tasksmatic via the REST API — manage tasks, and handle logistics operations (quotation requests, bookings, waybill generation, booking inquiries). All logistics endpoints receive the raw email content, headers, and attachments.
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

---

## Logistics Operations (Email-Driven)

All four endpoints below receive the **full email content**: raw headers, decoded body text, and any attachments as multipart form fields. Download attachments to the agent workspace first (see the `email-intake` skill for download instructions), then include them in the request.

### Common request shape

Every logistics endpoint accepts the following base fields. Each endpoint may require additional fields — see the per-endpoint sections below.

```bash
# Build the base form fields — reuse across all four endpoints
EMAIL_FROM="sender@example.com"
EMAIL_SUBJECT="subject line"
EMAIL_BODY="decoded body text"
EMAIL_DATE="2026-03-08T10:00:00Z"   # from the Date header
EMAIL_MESSAGE_ID="<msg-id@domain>"  # from the Message-ID header

# Add attachment flags (repeat for each file)
# -F "attachment=@/workspace/email-intake/tmp/invoice.pdf;type=application/pdf"
```

---

### Quotation Request

Triggered when `intent = quotation-request`. Send the email so the system can extract shipment details and calculate a rate.

```bash
curl -s -X POST "$TASKSMATIC_API_URL/TODO_quotation_endpoint" \
  -H "Authorization: Bearer $TASKSMATIC_API_KEY" \
  -F "from=$EMAIL_FROM" \
  -F "subject=$EMAIL_SUBJECT" \
  -F "body=$EMAIL_BODY" \
  -F "date=$EMAIL_DATE" \
  -F "messageId=$EMAIL_MESSAGE_ID" \
  # TODO: add shipment-specific fields once API schema is confirmed
  # -F "attachment=@/workspace/email-intake/tmp/FILENAME;type=MIMETYPE"
  | jq '{id, quoteRef, status}'
```

Return the `quoteRef` and status to the email-intake orchestrator.

---

### Make Booking

Triggered when `intent = make-booking`. Submits a new booking order from the email content.

```bash
curl -s -X POST "$TASKSMATIC_API_URL/TODO_booking_endpoint" \
  -H "Authorization: Bearer $TASKSMATIC_API_KEY" \
  -F "from=$EMAIL_FROM" \
  -F "subject=$EMAIL_SUBJECT" \
  -F "body=$EMAIL_BODY" \
  -F "date=$EMAIL_DATE" \
  -F "messageId=$EMAIL_MESSAGE_ID" \
  # TODO: add booking-specific fields once API schema is confirmed
  # -F "attachment=@/workspace/email-intake/tmp/FILENAME;type=MIMETYPE"
  | jq '{id, bookingRef, status}'
```

Return the `bookingRef` and status to the email-intake orchestrator.

---

### Generate Waybill

Triggered when `intent = generate-waybill`. Requests waybill/AWB/BOL generation for an existing booking reference found in the email.

```bash
curl -s -X POST "$TASKSMATIC_API_URL/TODO_waybill_endpoint" \
  -H "Authorization: Bearer $TASKSMATIC_API_KEY" \
  -F "from=$EMAIL_FROM" \
  -F "subject=$EMAIL_SUBJECT" \
  -F "body=$EMAIL_BODY" \
  -F "date=$EMAIL_DATE" \
  -F "messageId=$EMAIL_MESSAGE_ID" \
  # TODO: add waybill-specific fields once API schema is confirmed
  # -F "attachment=@/workspace/email-intake/tmp/FILENAME;type=MIMETYPE"
  | jq '{id, waybillNumber, downloadUrl}'
```

Return the `waybillNumber` and `downloadUrl` to the email-intake orchestrator.

---

### Booking Inquiry

Triggered when `intent = booking-inquiry`. Submits a query about an existing booking (status, ETA, amendments, cancellations, documents).

```bash
curl -s -X POST "$TASKSMATIC_API_URL/TODO_booking_inquiry_endpoint" \
  -H "Authorization: Bearer $TASKSMATIC_API_KEY" \
  -F "from=$EMAIL_FROM" \
  -F "subject=$EMAIL_SUBJECT" \
  -F "body=$EMAIL_BODY" \
  -F "date=$EMAIL_DATE" \
  -F "messageId=$EMAIL_MESSAGE_ID" \
  # TODO: add inquiry-specific fields once API schema is confirmed
  # -F "attachment=@/workspace/email-intake/tmp/FILENAME;type=MIMETYPE"
  | jq '{id, inquiryRef, status}'
```

Return the `inquiryRef` and status to the email-intake orchestrator.

---

### After Each Logistics API Call

1. Log the result to `/workspace/email-intake/processed.jsonl`:
   ```bash
   echo '{"timestamp":"'$(date -u +%FT%TZ)'","intent":"INTENT","from":"'$EMAIL_FROM'","ref":"RETURNED_REF","status":"STATUS"}' \
     >> /workspace/email-intake/processed.jsonl
   ```
2. Clean up any downloaded attachments from `/workspace/email-intake/tmp/`.
3. Return a one-line summary to the orchestrator: `intent → ref → status`.
