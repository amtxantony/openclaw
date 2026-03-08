---
name: ticket-creation
description: Create support and engineering tickets in Linear or Jira with correct title, description, priority, and labels
metadata:
  openclaw:
    emoji: "🎫"
    requires:
      env: ["LINEAR_API_KEY"]
---

# Ticket Creation

Create issues in Linear (preferred) or Jira. Use Linear by default unless the team's project is Jira-only.

## Linear

Linear uses the GraphQL API at `https://api.linear.app/graphql`.

### Get Team ID

You need the team ID before creating an issue. Fetch it once and cache it:

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ teams { nodes { id name } } }"}'
```

### Create an Issue

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation IssueCreate($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }",
    "variables": {
      "input": {
        "teamId": "TEAM_ID",
        "title": "Export > CSV causes white screen",
        "description": "## Steps to reproduce\n1. Open any report\n2. Click Export > CSV\n3. App freezes and shows white screen\n\n## Expected behaviour\nFile downloads successfully.\n\n## Reporter\ncustomer@example.com\n\n## Source\nEmail support request — 2026-03-08",
        "priority": 2,
        "labelIds": ["LABEL_ID_BUG", "LABEL_ID_SOURCE_EMAIL"]
      }
    }
  }'
```

Priority values: `0` = No priority, `1` = Urgent, `2` = High, `3` = Medium, `4` = Low.

### Get Label IDs

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ issueLabels { nodes { id name } } }"}'
```

### Search for Existing Issues (avoid duplicates)

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ issueSearch(term: \"export CSV white screen\") { nodes { id identifier title state { name } url } } }"
  }'
```

If an open issue already exists for the same problem, add a comment instead of creating a duplicate:

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation CommentCreate($input: CommentCreateInput!) { commentCreate(input: $input) { success } }",
    "variables": {
      "input": {
        "issueId": "ISSUE_ID",
        "body": "Additional report from customer@example.com on 2026-03-08:\n\n> Export crashes when clicking Export > CSV on the Revenue report."
      }
    }
  }'
```

---

## Jira (fallback)

Use Jira if `JIRA_API_KEY` is set and the team uses Jira. Base URL: `https://YOUR_DOMAIN.atlassian.net`.

### Create an Issue

```bash
curl -s -X POST "https://YOUR_DOMAIN.atlassian.net/rest/api/3/issue" \
  -u "your-email@example.com:$JIRA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "project": {"key": "SUP"},
      "summary": "Export > CSV causes white screen",
      "description": {
        "type": "doc",
        "version": 1,
        "content": [{
          "type": "paragraph",
          "content": [{"type": "text", "text": "Customer reported white screen when clicking Export > CSV."}]
        }]
      },
      "issuetype": {"name": "Bug"},
      "priority": {"name": "High"},
      "labels": ["source:email", "customer-reported"]
    }
  }'
```

Jira priority names: `Highest`, `High`, `Medium`, `Low`, `Lowest`.

---

## Ticket Writing Guidelines

A good ticket includes:

1. **Title** — concise, describes the symptom from the user's perspective. Bad: "Bug in export". Good: "Export > CSV crashes with white screen when column has emoji".
2. **Steps to reproduce** — numbered list, specific.
3. **Expected vs actual behaviour** — one line each.
4. **Reporter** — customer name/email.
5. **Source** — e.g., `Email support request`, `WhatsApp`, `Slack`.
6. **Priority** — High for data loss or crashes; Medium for UI issues; Low for cosmetic issues.
7. **Labels** — always include `source:<channel>` and `customer-reported` where applicable.

## Notes

- Always search for duplicates before creating a new ticket.
- Return the ticket URL and identifier (e.g., `ENG-142`) to the caller so it can be shared with the customer.
- If `LINEAR_API_KEY` is not set, fall back to `JIRA_API_KEY`. If neither is set, log the ticket details to a local file at `~/tickets/pending.jsonl` for manual review.
