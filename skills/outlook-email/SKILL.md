---
name: outlook-email
description: Read, send, and manage Outlook/Microsoft 365 email using the Microsoft Graph API. Supports fetching unread messages, reading full message bodies and attachments, sending replies, and archiving.
metadata:
  openclaw:
    emoji: "📨"
    requires:
      env:
        - OUTLOOK_ACCESS_TOKEN_PATH
        - OUTLOOK_CLIENT_ID
        - OUTLOOK_CLIENT_SECRET
        - OUTLOOK_TENANT_ID
---

# Outlook Email (Microsoft Graph API)

Read and manage Microsoft 365 / Outlook email via the Microsoft Graph API.

The OAuth2 token is stored at `~/tokens/outlook.json` (path also available as `$OUTLOOK_ACCESS_TOKEN_PATH`).

## Authentication

Load the access token:

```bash
ACCESS_TOKEN=$(node -e "const t=require(process.env.OUTLOOK_ACCESS_TOKEN_PATH||'$HOME/tokens/outlook.json'); console.log(t.access_token)")
```

If the API returns **401**, refresh the token (see **Token Refresh** section below) before retrying.

---

## Fetching Unread Messages

### List unread inbox messages (returns message IDs + metadata)

```bash
curl -s "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?\$filter=isRead eq false&\$top=20&\$select=id,subject,from,receivedDateTime,bodyPreview,hasAttachments&\$orderby=receivedDateTime asc" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Accept: application/json"
```

Returns an array of message objects under `value[]`.

### Fetch full message (body + headers)

```bash
curl -s "https://graph.microsoft.com/v1.0/me/messages/MESSAGE_ID?\$select=id,subject,from,toRecipients,ccRecipients,body,bodyPreview,receivedDateTime,hasAttachments,internetMessageHeaders,conversationId" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

The full body text is in `.body.content` (`.body.contentType` is `html` or `text`).

---

## Fetching Attachments

### List attachments for a message

```bash
curl -s "https://graph.microsoft.com/v1.0/me/messages/MESSAGE_ID/attachments?\$select=id,name,contentType,size,isInline" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Returns `value[]` with each attachment's `id`, `name`, `contentType`, `size`, `isInline`.

### Download attachment content (base64-encoded)

```bash
curl -s "https://graph.microsoft.com/v1.0/me/messages/MESSAGE_ID/attachments/ATTACHMENT_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

The response field `contentBytes` contains the base64-encoded file data.

Decode and save to disk:

```bash
ATTACHMENT_JSON=$(curl -s "https://graph.microsoft.com/v1.0/me/messages/MESSAGE_ID/attachments/ATTACHMENT_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

FILENAME=$(echo "$ATTACHMENT_JSON" | jq -r '.name')
CONTENT_BYTES=$(echo "$ATTACHMENT_JSON" | jq -r '.contentBytes')

python3 -c "
import base64, sys
open(sys.argv[2], 'wb').write(base64.b64decode(sys.argv[1]))
" "$CONTENT_BYTES" "/workspace/email-intake/tmp/$FILENAME"
```

For multiple attachments, loop over the `value[]` array and save each file.

---

## Marking as Read

```bash
curl -s -X PATCH "https://graph.microsoft.com/v1.0/me/messages/MESSAGE_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isRead": true}'
```

---

## Moving to Archive / Junk

### Move to Archive folder

```bash
curl -s -X POST "https://graph.microsoft.com/v1.0/me/messages/MESSAGE_ID/move" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"destinationId": "archive"}'
```

Well-known folder IDs: `inbox`, `archive`, `deleteditems`, `junkemail`, `sentitems`, `drafts`.

---

## Sending a Reply

```bash
curl -s -X POST "https://graph.microsoft.com/v1.0/me/messages/MESSAGE_ID/reply" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "body": {
        "contentType": "Text",
        "content": "Hi,\n\nThank you for reaching out. We have created a support ticket and will follow up shortly.\n\nBest regards,\nSupport Team"
      }
    },
    "comment": ""
  }'
```

For HTML replies, set `"contentType": "HTML"` and provide HTML in `content`.

---

## Sending a New Message

```bash
curl -s -X POST "https://graph.microsoft.com/v1.0/me/sendMail" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "subject": "Your subject here",
      "body": {
        "contentType": "Text",
        "content": "Message body here."
      },
      "toRecipients": [
        { "emailAddress": { "address": "recipient@example.com", "name": "Recipient Name" } }
      ]
    },
    "saveToSentItems": true
  }'
```

---

## Searching Messages

```bash
curl -s "https://graph.microsoft.com/v1.0/me/messages?\$search=\"subject:invoice\"&\$top=10" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Use OData `$search` for full-text search or `$filter` for structured queries:

```bash
# Filter by sender
curl -s "https://graph.microsoft.com/v1.0/me/messages?\$filter=from/emailAddress/address eq 'sender@example.com'&\$top=10" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# Filter by date range
curl -s "https://graph.microsoft.com/v1.0/me/messages?\$filter=receivedDateTime ge 2025-01-01T00:00:00Z&\$top=20" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## Token Refresh

If the API returns **401 Unauthorized**, the access token has expired. Refresh it:

```bash
REFRESH_TOKEN=$(node -e "const t=require('$HOME/tokens/outlook.json'); console.log(t.refresh_token)")

NEW_TOKENS=$(curl -s -X POST "https://login.microsoftonline.com/$OUTLOOK_TENANT_ID/oauth2/v2.0/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=$OUTLOOK_CLIENT_ID&client_secret=$OUTLOOK_CLIENT_SECRET&refresh_token=$REFRESH_TOKEN&grant_type=refresh_token&scope=https://graph.microsoft.com/Mail.ReadWrite%20https://graph.microsoft.com/Mail.Send%20offline_access")

NEW_ACCESS_TOKEN=$(echo "$NEW_TOKENS" | jq -r '.access_token')
NEW_REFRESH_TOKEN=$(echo "$NEW_TOKENS" | jq -r '.refresh_token')

# Update the token file
node -e "
const fs = require('fs');
const path = process.env.OUTLOOK_ACCESS_TOKEN_PATH || (process.env.HOME + '/tokens/outlook.json');
const t = JSON.parse(fs.readFileSync(path, 'utf-8'));
t.access_token = process.env.NEW_ACCESS_TOKEN;
if (process.env.NEW_REFRESH_TOKEN && process.env.NEW_REFRESH_TOKEN !== 'null') {
  t.refresh_token = process.env.NEW_REFRESH_TOKEN;
}
fs.writeFileSync(path, JSON.stringify(t, null, 2));
" NEW_ACCESS_TOKEN="$NEW_ACCESS_TOKEN" NEW_REFRESH_TOKEN="$NEW_REFRESH_TOKEN"
```

---

## Attachment Constraints

| Constraint | Detail |
|---|---|
| Max attachment size (Graph API) | 3 MB for inline upload; use upload session for files up to 150 MB |
| Temp file location | Use `/workspace/email-intake/tmp/` — never `/tmp/` (may not persist) |
| Inline images | `isInline: true` attachments are embedded images — skip unless downstream API needs them |
| HTML body | Strip HTML tags if passing body to a plain-text classifier: `echo "$BODY" \| sed 's/<[^>]*>//g'` |

---

## Parsing Useful Fields

```bash
# Extract subject, sender name, sender email, and body preview from a message list
echo "$MESSAGES_JSON" | jq -r '.value[] | [.id, .subject, .from.emailAddress.name, .from.emailAddress.address, .bodyPreview] | @tsv'

# Extract attachment list from a message
echo "$MESSAGE_JSON" | jq -r '.value[] | select(.isInline == false) | [.id, .name, .contentType, .size] | @tsv'
```

---

## Notes

- **Delegated vs Application permissions**: These instructions assume delegated access (acting as a user). For app-only daemon access, use client_credentials flow with `Mail.Read` application permission.
- **Shared mailboxes**: Replace `/me/` with `/users/shared-mailbox@example.com/` in all endpoints.
- **Large attachment upload session**: For files > 3 MB, create an upload session first via `POST /me/messages/{id}/attachments/createUploadSession`.
- **Rate limits**: Graph API enforces per-user throttling. On 429 responses, respect the `Retry-After` header.
- **Never delete messages** — move to `deleteditems` or `archive` instead.
