---
name: browser-email-intake
description: Read unread emails from any web-based email client (Gmail, Outlook Web, Yahoo Mail, etc.) using the built-in browser tool. Navigate the inbox, extract email content and attachments, and perform actions like mark-as-read, archive, or reply — all through browser automation without needing API credentials.
metadata:
  openclaw:
    emoji: "🌐"
    requires:
      config: ["browser.enabled"]
---

# Browser Email Intake

Read and manage email from any web-based inbox by controlling the browser directly. Useful when API credentials are unavailable, when using a provider without a public API, or when the mailbox is already authenticated in an existing browser profile.

The browser must be running and the inbox must be accessible (already logged in) in the configured browser profile.

---

## Step 1 — Navigate to the Inbox

Use the `browser` tool to navigate to the web email client:

```
browser action=navigate targetUrl="https://mail.google.com"
```

For Outlook Web:
```
browser action=navigate targetUrl="https://outlook.live.com/mail/0/inbox"
```

For any provider, navigate to the inbox URL. Wait for the page to load:

```
browser action=act request={ kind: "wait", loadState: "networkidle", timeoutMs: 15000 }
```

---

## Step 2 — Take a Snapshot of the Inbox

Use the efficient AI snapshot to see the inbox contents without reading every pixel:

```
browser action=snapshot mode=efficient interactive=true
```

The snapshot returns a structured accessibility tree. Look for unread message rows — they typically have bold text, an "unread" aria-label, or a distinct visual indicator.

Take a screenshot if you need to visually inspect the layout:

```
browser action=screenshot fullPage=false
```

---

## Step 3 — Identify Unread Emails

From the snapshot, identify elements representing unread emails. Unread messages typically appear as:
- Bold subject/sender text in the message list
- Rows with `aria-label` containing "unread"
- Elements with a blue dot or indicator

Note the `ref` value for each unread row from the snapshot output.

---

## Step 4 — Open an Email

Click the email row to open it:

```
browser action=act request={ kind: "click", ref: "<email-row-ref>" }
```

Wait for the email content to load:

```
browser action=act request={ kind: "wait", loadState: "networkidle", timeoutMs: 10000 }
```

Then snapshot again to read the full email content:

```
browser action=snapshot mode=efficient
```

Extract from the snapshot:
- **Subject**: heading element or page title
- **From**: sender name and email in the email header
- **Body**: main content area text
- **Attachments**: any download links or file attachment elements

---

## Step 5 — Download Attachments (if any)

If attachments are visible in the email view, click the download link:

```
browser action=act request={ kind: "click", ref: "<attachment-download-ref>" }
```

Wait for the download:

```
browser action=act request={ kind: "wait", timeMs: 3000 }
```

Downloaded files land in the browser's downloads directory. To save to a specific path, use the download action:

```
browser action=download ref="<attachment-link-ref>" path="email-attachment.pdf"
```

---

## Step 6 — Mark as Read

### Gmail Web

After reading, click the "Mark as read" button or use keyboard shortcut. Snapshot to find the button:

```
browser action=snapshot mode=efficient interactive=true selector="[data-tooltip='Mark as read']"
```

Then click:

```
browser action=act request={ kind: "click", ref: "<mark-as-read-ref>" }
```

Alternatively, press the `i` key (Gmail keyboard shortcut for mark as read):

```
browser action=act request={ kind: "press", key: "i" }
```

### Outlook Web

Right-click the message and select "Mark as read", or use the ribbon button.

---

## Step 7 — Archive / Move Email

### Gmail — Archive (keyboard shortcut `e`):

```
browser action=act request={ kind: "press", key: "e" }
```

Or click the Archive button (found in toolbar after selecting the email):

```
browser action=act request={ kind: "click", ref: "<archive-button-ref>" }
```

### Outlook Web — Move to Archive:

```
browser action=act request={ kind: "click", ref: "<archive-button-ref>" }
```

---

## Step 8 — Reply to an Email

Click the Reply button in the open email view:

```
browser action=act request={ kind: "click", ref: "<reply-button-ref>" }
```

Wait for the compose area to appear, then type the reply body:

```
browser action=act request={ kind: "click", ref: "<compose-area-ref>" }
browser action=act request={ kind: "type", ref: "<compose-area-ref>", text: "Hi,\n\nThank you for your message. We have created a support ticket and will follow up shortly.\n\nBest regards,\nSupport Team" }
```

Send by clicking the Send button or pressing `Ctrl+Enter`:

```
browser action=act request={ kind: "press", key: "Control+Enter" }
```

---

## Processing Multiple Emails

To process multiple unread emails in one session:

1. Navigate to inbox and snapshot to get the list
2. Note all unread email `ref` values from the snapshot
3. For each email:
   - Click to open
   - Snapshot to extract content
   - Process (classify, route)
   - Mark as read or archive
   - Press `Escape` or click Back to return to inbox list: `browser action=act request={ kind: "press", key: "Escape" }`
4. Snapshot inbox again to confirm unread count decreased

Process at most **20 emails per run** to avoid overly long sessions.

---

## Tips

- **Prefer snapshots over screenshots** for text extraction — snapshots return structured accessible text directly.
- **Use `mode=efficient interactive=true`** to get a compact tree with only interactive elements and their refs.
- **Session persistence**: The browser profile maintains login state between agent runs. You do not need to log in each time as long as the profile is the same.
- **Pop-ups and dialogs**: Use `browser action=dialog accept=true` to dismiss any unexpected dialogs.
- **Slow networks**: Increase `timeoutMs` to 20000–30000 for slow loading inboxes.
- **If the page requires login**: Navigate to the login page, snapshot to find the form fields, and use `browser action=act request={ kind: "fill", fields: [...] }` to enter credentials. Store credentials in environment variables — never hardcode.
