---
name: email-intake
description: Orchestrate the email processing pipeline — fetch unread Gmail messages, spawn email-classifier to classify each, then spawn crm-lead-writer or ticket-creator based on intent.
metadata:
  openclaw:
    emoji: "📧"
    requires:
      env: ["GMAIL_OAUTH_TOKEN_PATH"]
---

# Email Intake

Orchestrate the email processing pipeline. You fetch unread emails, then use sub-agents to classify and act on each one.

## Pipeline Architecture

```
email-intake (orchestrator)
  ├─ sessions_spawn email-classifier  → returns JSON intent for each email
  ├─ sessions_spawn crm-lead-writer   → for sales-inquiry emails
  ├─ sessions_spawn ticket-creator    → for support-request emails
  ├─ handle inline                    → internal (summarise to Slack)
  └─ handle inline                    → spam (archive via Gmail API)
```

**When running standalone** (without specialist sub-agents configured), fall back to handling all intents inline using the instructions in the sections below.

The OAuth token for Gmail is stored at `~/tokens/gmail.json`. The path is also available via `$GMAIL_OAUTH_TOKEN_PATH`.

## Step 1 — Fetch Unread Emails

Fetch up to 20 unread messages (see below), then for each email:

1. **Spawn `email-classifier`** to get structured intent JSON:
   ```
   sessions_spawn
     agentId: email-classifier
     label: classify-<message-id>
     task: |
       Classify this email:
       Subject: <subject>
       From: <sender-name> <sender-email>
       Body:
       <decoded body text>
   ```
   Parse the returned JSON: `{ intent, confidence, sender, summary, priority, signals }`

2. **Route by intent:**
   - `sales-inquiry` → spawn `crm-lead-writer` (see Step 2a)
   - `support-request` → spawn `ticket-creator` (see Step 2b)
   - `quotation-request` → spawn `tasksmatic-handler` (see Step 2c)
   - `make-booking` → spawn `tasksmatic-handler` (see Step 2c)
   - `generate-waybill` → spawn `tasksmatic-handler` (see Step 2c)
   - `booking-inquiry` → spawn `tasksmatic-handler` (see Step 2c)
   - `internal` → summarise inline, post to Slack if configured
   - `spam` → archive inline (remove `INBOX` label)

3. After routing, **mark as read** (remove `UNREAD` label).

4. At the end, **report a summary** to the delivery channel:
   ```
   Processed 5 emails:
   - 2 sales inquiries → CRM leads created (Jane Doe @ Acme, James Liu @ startup.io)
   - 1 support request → Linear ticket ENG-201 created (Maria Chen)
   - 1 internal → summarised
   - 1 spam → archived
   ```

## Step 2a — Spawn crm-lead-writer (sales-inquiry)

```
sessions_spawn
  agentId: crm-lead-writer
  label: crm-<sender-email>
  task: |
    Create a HubSpot lead from this sales inquiry email.

    Sender: <name> <email>
    Company: <company>
    Subject: <subject>
    Summary: <summary from classifier>
    Priority: <priority>
    Original body:
    <body>
```

## Step 2b — Spawn ticket-creator (support-request)

```
sessions_spawn
  agentId: ticket-creator
  label: ticket-<sender-email>
  task: |
    Create a support ticket from this email.

    Sender: <name> <email>
    Subject: <subject>
    Priority: <priority>
    Summary: <summary from classifier>
    Labels: source:email, customer-reported
    Original body:
    <body>

    Also send an acknowledgement reply to <email> with the ticket number once created.
```

## Step 2c — Spawn tasksmatic-handler (quotation-request | make-booking | generate-waybill | booking-inquiry)

Download any attachments from the email to `/workspace/email-intake/tmp/` before spawning (see Downloading and Uploading Attachments below). Pass the full email content and the list of downloaded attachment paths.

```
sessions_spawn
  agentId: tasksmatic-handler
  label: tasksmatic-<intent>-<sender-email>
  task: |
    Handle this logistics email using the Tasksmatic API.

    Intent: <intent from classifier>
    Priority: <priority>
    Summary: <summary from classifier>

    Sender: <name> <email>
    Subject: <subject>
    Date: <date header>
    Message-ID: <message-id header>
    Body:
    <decoded body>

    Attachments saved to workspace:
    <list of /workspace/email-intake/tmp/FILENAME paths, one per line, or "none">
```

---

## Fetching Unread Messages

Use the Gmail REST API `messages.list` endpoint to retrieve unread messages from the inbox:

```bash
ACCESS_TOKEN=$(node -e "const t=require(process.env.GMAIL_OAUTH_TOKEN_PATH||'$HOME/tokens/gmail.json'); console.log(t.access_token)")

# List unread inbox messages (returns message ids)
curl -s "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread+in:inbox&maxResults=20" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Fetch the full message payload for each id:

```bash
curl -s "https://gmail.googleapis.com/gmail/v1/users/me/messages/MESSAGE_ID?format=full" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Extract the subject, from, decoded body, and attachment metadata from the JSON response.

**Body text** is base64url-encoded in `payload.parts[0].body.data` or `payload.body.data`.

**Attachments** appear as MIME parts where `body.attachmentId` is non-empty:

```bash
# Parse attachment metadata from the message JSON
# Each attachment part looks like:
# { "filename": "invoice.pdf", "mimeType": "application/pdf",
#   "body": { "attachmentId": "ANGjdJ...", "size": 102400 } }

# Extract attachment IDs and filenames with jq
echo "$MESSAGE_JSON" | jq -r '
  .payload.parts[]?
  | select(.body.attachmentId != null and .body.attachmentId != "")
  | [.filename, .mimeType, .body.attachmentId, (.body.size|tostring)]
  | @tsv
'
```

## Downloading and Uploading Attachments

When the downstream API requires the raw email attachments, download each one and send it as part of the API call.

### Step 1 — Download attachment data from Gmail

```bash
# Fetch the attachment binary (returns base64url-encoded data)
ATTACHMENT_DATA=$(curl -s \
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/MESSAGE_ID/attachments/ATTACHMENT_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq -r '.data')

# Decode base64url to a temp file in agent workspace
python3 -c "
import base64, sys
data = sys.argv[1].replace('-', '+').replace('_', '/')
# Pad to multiple of 4
data += '=' * (-len(data) % 4)
open(sys.argv[2], 'wb').write(base64.b64decode(data))
" "$ATTACHMENT_DATA" "/workspace/email-intake/tmp/invoice.pdf"
```

For multiple attachments, loop over the attachment list and save each with its original filename.

### Step 2 — POST email + attachments to your API

```bash
# Send email body + one attachment as multipart form data
curl -s -X POST "https://api.example.com/process-email" \
  -H "Authorization: Bearer $API_KEY" \
  -F "subject=$EMAIL_SUBJECT" \
  -F "from=$SENDER_EMAIL" \
  -F "body=$EMAIL_BODY" \
  -F "attachment=@/workspace/email-intake/tmp/invoice.pdf;type=application/pdf"
```

For multiple attachments, add multiple `-F "attachment=@..."` flags — most APIs accept repeated field names for multi-file uploads.

### Step 3 — Clean up temp files

```bash
rm -f /workspace/email-intake/tmp/*.pdf \
       /workspace/email-intake/tmp/*.docx \
       /workspace/email-intake/tmp/*.xlsx
```

Always clean up after each email to avoid filling the workspace.

## Attachment Constraints

| Constraint | Detail |
|---|---|
| Gmail max attachment size | 25 MB per file (Gmail enforces this at send time) |
| Temp file location | Use `/workspace/email-intake/tmp/` — never `/tmp/` (may not persist across tool calls) |
| Binary types | All MIME types work: PDF, DOCX, XLSX, images, ZIP |
| Nested MIME | Emails with `multipart/mixed` contain both body parts and attachment parts; scan all `parts[]` recursively |
| Inline images | Parts with `Content-Disposition: inline` and an attachmentId are inline images — include or skip based on API requirements |

## Intent Classification

Classify each email into one of four intents based on subject, sender, and body:

| Intent | Signals |
|--------|---------|
| `sales-inquiry` | Pricing questions, demo requests, "interested in your product", partnership offers |
| `support-request` | Bug reports, "not working", error messages, how-to questions from existing customers |
| `internal` | Emails from colleagues, @yourcompany.com senders, internal notifications |
| `spam` | Mass marketing, unsubscribe footers, no clear business intent |

## Routing Actions

### sales-inquiry → Create CRM Lead

Use the `sales-crm` skill to create a new lead in HubSpot. Pass the sender name, email, company (if parseable), and a summary of the inquiry.

### support-request → Create Support Ticket

Use the `ticket-creation` skill to open a ticket in Linear or Jira. Set the title to the email subject, the description to the email body, and tag it `source:email`.

Also send an acknowledgement reply:

```bash
# Base64url-encode the reply body
ENCODED_BODY=$(echo -n "Hi,

Thank you for reaching out. We have created a support ticket for your request and will follow up shortly.

Best regards,
Bob" | base64 | tr '+/' '-_' | tr -d '=')

curl -s -X POST "https://gmail.googleapis.com/gmail/v1/users/me/messages/send" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"raw\": \"$ENCODED_BODY\"
  }"
```

For proper reply threading, construct the raw RFC-2822 message with `In-Reply-To` and `References` headers set to the original message's `Message-ID`.

### spam → Archive

Move the message out of the inbox by removing the `INBOX` label:

```bash
curl -s -X POST "https://gmail.googleapis.com/gmail/v1/users/me/messages/MESSAGE_ID/modify" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"removeLabelIds": ["INBOX"]}'
```

### internal → Summarize and Forward

Summarize the email in 2-3 sentences and post the summary to the relevant Slack channel or note it in the session memory for the next human check-in. Do not create a ticket or CRM entry.

## Marking as Read

After processing, mark each message as read:

```bash
curl -s -X POST "https://gmail.googleapis.com/gmail/v1/users/me/messages/MESSAGE_ID/modify" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"removeLabelIds": ["UNREAD"]}'
```

## Token Refresh

If the API returns a 401, the access token has expired. Refresh it using the refresh token stored in `~/tokens/gmail.json`:

```bash
REFRESH_TOKEN=$(node -e "const t=require('$HOME/tokens/gmail.json'); console.log(t.refresh_token)")
curl -s -X POST "https://oauth2.googleapis.com/token" \
  -d "client_id=$GMAIL_CLIENT_ID&client_secret=$GMAIL_CLIENT_SECRET&refresh_token=$REFRESH_TOKEN&grant_type=refresh_token"
```

Update the `access_token` field in `~/tokens/gmail.json` with the new value before retrying.

## Notes

- Process at most 20 messages per run to avoid long-running sessions.
- If the inbox has more than 20 unread messages, log a warning and process the oldest 20 first (use `&orderBy=internalDate`).
- Never delete emails; archive or label instead.
