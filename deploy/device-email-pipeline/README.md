# Email Pipeline — Deployment & Configuration Guide

Autonomous email processing pipeline. Runs on a schedule, reads unread emails, classifies intent, and routes each email to the appropriate specialist agent (CRM lead creation or support ticket creation).

---

## Architecture

```
email-intake (orchestrator, claude-sonnet-4-6)
  ├── sessions_spawn email-classifier   → returns intent JSON for each email
  ├── sessions_spawn crm-lead-writer    → for sales-inquiry emails → HubSpot lead
  ├── sessions_spawn ticket-creator     → for support-request emails → Linear ticket
  ├── handle inline                     → internal (summarise)
  └── handle inline                     → spam (archive)
```

The pipeline runs every 5 minutes via a cron job targeting the `email-intake` agent.

---

## Directory Layout

```
deploy/device-email-pipeline/
├── README.md                   ← this file
├── docker-compose.yml          ← container definition
├── config/
│   ├── openclaw.json           ← agent definitions, cron schedule
│   └── .env                    ← secrets and intake method (gitignored)
│   └── .env.example            ← template — copy to .env and fill in
└── workspace/
    ├── email-intake/
    │   ├── tmp/                ← attachment temp files (auto-cleaned)
    │   └── tokens/             ← OAuth token files (place here)
    ├── email-classifier/
    ├── crm-lead-writer/
    └── ticket-creator/
```

---

## Quick Start

```bash
cd deploy/device-email-pipeline

# 1. Create your env file
cp config/.env.example config/.env

# 2. Fill in your chosen intake method and API keys (see below)
nano config/.env

# 3. Start the container
docker compose up -d

# 4. Tail logs
docker compose logs -f
```

---

## Step 1 — Choose an Email Intake Method

Only **one method** should be configured per deployment. Uncomment the relevant block in `config/.env` and leave the others commented out. The agent detects the active method from which environment variables are present.

### Option A — Gmail (Google OAuth2 REST API)

Best for: Google Workspace or personal Gmail accounts.

**Setup:**
1. Create a Google Cloud project and enable the Gmail API.
2. Create OAuth2 credentials (Desktop app or Service Account).
3. Run the OAuth flow to obtain a token file and save it to `workspace/email-intake/tokens/gmail.json`.

**`.env` block:**
```env
GMAIL_OAUTH_TOKEN_PATH=/workspace/email-intake/tokens/gmail.json
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-client-secret
```

**Token file format** (`workspace/email-intake/tokens/gmail.json`):
```json
{
  "access_token": "ya29.xxx",
  "refresh_token": "1//xxx",
  "token_type": "Bearer",
  "expiry_date": 1700000000000
}
```

The agent refreshes the token automatically on 401 responses.

---

### Option B — Outlook / Microsoft 365 (Microsoft Graph API)

Best for: Microsoft 365 business accounts or personal Outlook.com.

**Setup:**
1. Register an app in Azure portal (portal.azure.com → App registrations).
2. Add delegated permissions: `Mail.ReadWrite`, `Mail.Send`, `offline_access`.
3. Run the OAuth2 authorization code flow to obtain a token and save it to `workspace/email-intake/tokens/outlook.json`.

**`.env` block:**
```env
OUTLOOK_ACCESS_TOKEN_PATH=/workspace/email-intake/tokens/outlook.json
OUTLOOK_CLIENT_ID=your-azure-app-client-id
OUTLOOK_CLIENT_SECRET=your-azure-app-client-secret
OUTLOOK_TENANT_ID=your-azure-tenant-id
```

**Token file format** (`workspace/email-intake/tokens/outlook.json`):
```json
{
  "access_token": "eyJ0xxx",
  "refresh_token": "0.Axxx",
  "token_type": "Bearer"
}
```

The agent refreshes the token automatically on 401 responses using the Microsoft identity platform endpoint.

---

### Option C — IMAP / SMTP

Best for: any provider (Gmail, Outlook, Yahoo, iCloud, Fastmail, self-hosted) when API credentials are not available or undesirable. Uses Python's built-in `imaplib` — no extra binaries.

**Common provider settings:**

| Provider | IMAP Host | SMTP Host |
|---|---|---|
| Gmail | `imap.gmail.com` | `smtp.gmail.com` |
| Outlook / M365 | `outlook.office365.com` | `smtp.office365.com` |
| Yahoo | `imap.mail.yahoo.com` | `smtp.mail.yahoo.com` |
| iCloud | `imap.mail.me.com` | `smtp.mail.me.com` |
| Fastmail | `imap.fastmail.com` | `smtp.fastmail.com` |

For Gmail and Outlook with 2FA: generate an **App Password** instead of using your account password.

**`.env` block:**
```env
IMAP_HOST=imap.gmail.com
IMAP_USER=you@example.com
IMAP_PASSWORD=your-app-password
IMAP_PORT=993
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
```

---

### Option D — Browser Automation

Best for: web-only email providers without IMAP/API access, or when the inbox is already authenticated in a browser profile and no credentials should be stored.

**No env vars required.** The agent navigates the web inbox UI directly using OpenClaw's built-in Playwright browser control.

**Requirements:**
1. Enable the browser in `config/openclaw.json`:
   ```json
   {
     "browser": { "enabled": true }
   }
   ```
2. The browser profile must already be logged in to the email account. Log in once via the browser, then the session persists across runs.
3. The host machine must have Chrome/Chromium installed and accessible.

**Note:** This method is slower and more fragile than API-based methods. Use only when no API or IMAP option is available.

---

## Step 2 — Configure CRM and Ticketing Integrations

Set the downstream API keys in `config/.env`:

```env
# HubSpot — for sales-inquiry emails
HUBSPOT_API_KEY=your-hubspot-private-app-token

# Linear — for support-request emails
LINEAR_API_KEY=your-linear-api-key
```

The `crm-lead-writer` agent uses HubSpot to create contacts/deals.
The `ticket-creator` agent uses Linear to create issues.

To use a different CRM or ticketing tool, update the relevant skill in `skills/sales-crm/` or `skills/ticket-creation/` and adjust the env vars accordingly.

---

## Step 3 — Adjust the Schedule

The pipeline runs every **5 minutes** by default. To change the interval, edit `config/openclaw.json`:

```json
"schedule": { "kind": "every", "everyMs": 300000 }
```

Common values:

| Interval | `everyMs` |
|---|---|
| 1 minute | `60000` |
| 5 minutes | `300000` |
| 15 minutes | `900000` |
| 30 minutes | `1800000` |
| 1 hour | `3600000` |

To disable the cron job (run on-demand only), set `"enabled": false`.

---

## Step 4 — Token File Permissions

OAuth token files contain sensitive credentials. Lock them down:

```bash
chmod 600 workspace/email-intake/tokens/gmail.json
chmod 600 workspace/email-intake/tokens/outlook.json
```

Never commit token files to git. The `workspace/` directory should be in `.gitignore`.

---

## Agents Reference

| Agent ID | Model | Role | Skills |
|---|---|---|---|
| `email-intake` | claude-sonnet-4-6 | Orchestrator — reads email, spawns sub-agents | email-intake, outlook-email, imap-email, browser-email-intake |
| `email-classifier` | claude-haiku-4-5 | Classifies email intent → JSON | email-classifier |
| `crm-lead-writer` | claude-haiku-4-5 | Creates HubSpot lead from sales email | sales-crm |
| `ticket-creator` | claude-haiku-4-5 | Creates Linear ticket from support email | ticket-creation |

Sub-agents are spawned dynamically by `email-intake` using `sessions_spawn`. They run in isolated workspaces under `/workspace/{agent-id}/`.

---

## Troubleshooting

**Pipeline doesn't run**
- Check `docker compose logs -f` for startup errors.
- Verify `ANTHROPIC_API_KEY` is set.
- Confirm `"enabled": true` in the cron job in `openclaw.json`.

**401 errors from Gmail or Outlook**
- The access token has expired and refresh failed.
- Check that `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` (or Outlook equivalents) are correctly set.
- Re-run the OAuth flow and replace the token file.

**IMAP authentication failure**
- For Gmail: ensure you are using an App Password, not your Google account password. Regular passwords are rejected when 2FA is on.
- For Outlook: same — use an App Password or ensure "Basic auth" is not blocked by your tenant admin.

**No emails processed**
- The inbox may have no unread messages, which is expected.
- Check that the email account being read is the correct one for this deployment.

**Attachments not saving**
- Confirm `workspace/email-intake/tmp/` exists (a `.gitkeep` is included; Docker will create the directory on mount).
- The container must have write access to `/workspace`.

**Wrong intake method used**
- The agent detects the method by checking which env vars are set. If multiple option blocks are uncommented in `.env`, the agent may behave unexpectedly. Ensure only one method's variables are active.
