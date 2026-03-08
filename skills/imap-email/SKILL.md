---
name: imap-email
description: Read, search, and manage email from any IMAP mailbox (Gmail, Outlook, Yahoo, Exchange, iCloud, Fastmail, custom servers) using Python's built-in imaplib. No external binaries required. Supports fetching unread messages, reading full bodies and attachments, marking as read, moving to folders, and sending replies via SMTP.
metadata:
  openclaw:
    emoji: "📬"
    requires:
      env:
        - IMAP_HOST
        - IMAP_USER
        - IMAP_PASSWORD
---

# IMAP Email

Connect to any IMAP mailbox using Python's built-in `imaplib` and `smtplib`. Works with any provider that supports IMAP/SMTP — Gmail, Outlook/Exchange, Yahoo, iCloud, Fastmail, self-hosted servers.

## Common Provider Settings

| Provider | IMAP Host | IMAP Port | SMTP Host | SMTP Port |
|---|---|---|---|---|
| Gmail | `imap.gmail.com` | 993 | `smtp.gmail.com` | 587 |
| Outlook / Microsoft 365 | `outlook.office365.com` | 993 | `smtp.office365.com` | 587 |
| Yahoo Mail | `imap.mail.yahoo.com` | 993 | `smtp.mail.yahoo.com` | 587 |
| iCloud Mail | `imap.mail.me.com` | 993 | `smtp.mail.me.com` | 587 |
| Fastmail | `imap.fastmail.com` | 993 | `smtp.fastmail.com` | 587 |

For Gmail: use an **App Password** (not your Google account password). Generate one at myaccount.google.com → Security → App Passwords.

For Outlook/Microsoft 365: use your email + password, or an app password if MFA is enabled.

---

## Step 1 — Fetch Unread Messages

```bash
python3 << 'EOF'
import imaplib, email, os, json, base64
from email.header import decode_header

host     = os.environ['IMAP_HOST']
user     = os.environ['IMAP_USER']
password = os.environ['IMAP_PASSWORD']
port     = int(os.environ.get('IMAP_PORT', '993'))

mail = imaplib.IMAP4_SSL(host, port)
mail.login(user, password)
mail.select('INBOX')

# Search for unread messages
_, ids = mail.search(None, 'UNSEEN')
msg_ids = ids[0].split()[-20:]  # process at most 20, oldest first

messages = []
for msg_id in msg_ids:
    _, data = mail.fetch(msg_id, '(RFC822)')
    raw = data[0][1]
    msg = email.message_from_bytes(raw)

    # Decode subject
    subject_parts = decode_header(msg.get('Subject', ''))
    subject = ''.join(
        part.decode(enc or 'utf-8') if isinstance(part, bytes) else part
        for part, enc in subject_parts
    )

    # Decode From
    from_parts = decode_header(msg.get('From', ''))
    from_str = ''.join(
        part.decode(enc or 'utf-8') if isinstance(part, bytes) else part
        for part, enc in from_parts
    )

    # Extract body and attachments
    body_text = ''
    attachments = []
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            disposition = str(part.get('Content-Disposition', ''))
            if ct == 'text/plain' and 'attachment' not in disposition:
                charset = part.get_content_charset() or 'utf-8'
                body_text = part.get_payload(decode=True).decode(charset, errors='replace')
            elif 'attachment' in disposition or part.get_filename():
                attachments.append({
                    'filename': part.get_filename(),
                    'mimeType': ct,
                    'data': base64.b64encode(part.get_payload(decode=True)).decode()
                })
    else:
        charset = msg.get_content_charset() or 'utf-8'
        body_text = msg.get_payload(decode=True).decode(charset, errors='replace')

    messages.append({
        'id': msg_id.decode(),
        'subject': subject,
        'from': from_str,
        'date': msg.get('Date', ''),
        'messageId': msg.get('Message-ID', ''),
        'body': body_text,
        'attachments': attachments
    })

mail.logout()
print(json.dumps(messages, indent=2, ensure_ascii=False))
EOF
```

Each message in the output has: `id`, `subject`, `from`, `date`, `messageId`, `body`, `attachments[]`.

Attachments include `filename`, `mimeType`, and `data` (base64-encoded file content).

---

## Step 2 — Save Attachments to Disk

```bash
python3 << 'EOF'
import base64, os

# Paste the base64 data from the attachment above
attachment_data = "BASE64_DATA_HERE"
filename = "invoice.pdf"
output_dir = "/workspace/email-intake/tmp"

os.makedirs(output_dir, exist_ok=True)
with open(os.path.join(output_dir, filename), 'wb') as f:
    f.write(base64.b64decode(attachment_data))

print(f"Saved to {output_dir}/{filename}")
EOF
```

---

## Step 3 — Mark Messages as Read

```bash
python3 << 'EOF'
import imaplib, os

host     = os.environ['IMAP_HOST']
user     = os.environ['IMAP_USER']
password = os.environ['IMAP_PASSWORD']
port     = int(os.environ.get('IMAP_PORT', '993'))

# Comma-separated list of message IDs to mark as read
msg_ids = "1,2,5"  # replace with actual IDs

mail = imaplib.IMAP4_SSL(host, port)
mail.login(user, password)
mail.select('INBOX')

mail.store(msg_ids, '+FLAGS', '\\Seen')
mail.logout()
print(f"Marked {msg_ids} as read")
EOF
```

---

## Step 4 — Move Message to Another Folder (Archive / Spam)

```bash
python3 << 'EOF'
import imaplib, os

host     = os.environ['IMAP_HOST']
user     = os.environ['IMAP_USER']
password = os.environ['IMAP_PASSWORD']
port     = int(os.environ.get('IMAP_PORT', '993'))

msg_id = "5"          # message ID to move
dest   = "Archive"    # destination folder name

# Gmail uses "[Gmail]/All Mail" for archive; Outlook uses "Archive"
# List available folders first if unsure:
# mail.list()

mail = imaplib.IMAP4_SSL(host, port)
mail.login(user, password)
mail.select('INBOX')

mail.copy(msg_id, dest)
mail.store(msg_id, '+FLAGS', '\\Deleted')
mail.expunge()
mail.logout()
print(f"Moved message {msg_id} to {dest}")
EOF
```

### Common folder names by provider

| Provider | Archive | Spam / Junk |
|---|---|---|
| Gmail | `[Gmail]/All Mail` | `[Gmail]/Spam` |
| Outlook | `Archive` | `Junk Email` |
| Yahoo | `Archive` | `Bulk Mail` |
| iCloud | `Archive` | `Junk` |

List available folders to confirm:

```bash
python3 -c "
import imaplib, os
m = imaplib.IMAP4_SSL(os.environ['IMAP_HOST'], int(os.environ.get('IMAP_PORT','993')))
m.login(os.environ['IMAP_USER'], os.environ['IMAP_PASSWORD'])
print('\n'.join(f[2] if isinstance(f[2], str) else f[2].decode() for f in m.list()[1]))
m.logout()
"
```

---

## Step 5 — Send a Reply via SMTP

```bash
python3 << 'EOF'
import smtplib, os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

smtp_host = os.environ.get('SMTP_HOST', os.environ['IMAP_HOST'].replace('imap.', 'smtp.'))
smtp_port = int(os.environ.get('SMTP_PORT', '587'))
user      = os.environ['IMAP_USER']
password  = os.environ['IMAP_PASSWORD']

# Values from the original email
to_addr    = "customer@example.com"
subject    = "Re: Your original subject"
orig_msg_id = "<original-message-id@example.com>"

msg = MIMEMultipart()
msg['From']       = user
msg['To']         = to_addr
msg['Subject']    = subject
msg['In-Reply-To'] = orig_msg_id
msg['References']  = orig_msg_id

body = MIMEText("""Hi,

Thank you for reaching out. We have created a support ticket for your request and will follow up shortly.

Best regards,
Support Team
""", 'plain')
msg.attach(body)

with smtplib.SMTP(smtp_host, smtp_port) as smtp:
    smtp.starttls()
    smtp.login(user, password)
    smtp.send_message(msg)

print(f"Reply sent to {to_addr}")
EOF
```

---

## Step 6 — Search Messages

```bash
python3 << 'EOF'
import imaplib, os

host     = os.environ['IMAP_HOST']
user     = os.environ['IMAP_USER']
password = os.environ['IMAP_PASSWORD']

mail = imaplib.IMAP4_SSL(host, int(os.environ.get('IMAP_PORT', '993')))
mail.login(user, password)
mail.select('INBOX')

# IMAP search criteria examples:
# 'UNSEEN'                  — unread
# 'FROM "sender@example.com"'
# 'SUBJECT "invoice"'
# 'SINCE 01-Jan-2025'
# 'UNSEEN FROM "sales@"'   — combine with spaces

_, ids = mail.search(None, 'UNSEEN', 'SUBJECT "invoice"')
print("Matching IDs:", ids[0].split())
mail.logout()
EOF
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `IMAP_HOST` | Yes | — | IMAP server hostname |
| `IMAP_USER` | Yes | — | Email address / login |
| `IMAP_PASSWORD` | Yes | — | Password or app password |
| `IMAP_PORT` | No | `993` | IMAP SSL port |
| `SMTP_HOST` | No | derived from `IMAP_HOST` | SMTP server hostname |
| `SMTP_PORT` | No | `587` | SMTP STARTTLS port |

---

## Notes

- Python's `imaplib` is built into the standard library — no `pip install` needed.
- Always use **App Passwords** for Gmail and Outlook when 2FA is enabled.
- Process at most **20 messages per run**. Use `ids[0].split()[-20:]` to take the 20 most recent.
- Never delete messages permanently; move to `[Gmail]/Trash` or `Deleted Items` instead of calling `mail.expunge()` without a prior `COPY`.
- For HTML-only emails, extract the `text/html` part and strip tags with: `re.sub(r'<[^>]+>', '', html_body)`.
- Clean up temp attachment files after each email: `rm -f /workspace/email-intake/tmp/*`.
