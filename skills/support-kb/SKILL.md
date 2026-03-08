---
name: support-kb
description: Search a local markdown knowledge base for known issues and solutions; escalate unknowns to engineering
metadata:
  openclaw:
    emoji: "📚"
---

# Support Knowledge Base

The knowledge base is a collection of markdown files stored at `~/kb/`. Each file represents a known issue, FAQ, or how-to guide.

## Directory Layout

```
~/kb/
├── index.md          # Master index of all articles (title, filename, tags)
├── bugs/             # Known bugs and workarounds
│   ├── export-crash.md
│   └── login-timeout.md
├── how-to/           # Step-by-step guides
│   ├── connect-integration.md
│   └── export-data.md
└── faq/              # Frequently asked questions
    └── billing.md
```

## Searching the Knowledge Base

Use `grep` to search by keyword across all articles:

```bash
grep -r -i -l "export" ~/kb/
```

Search for multiple keywords (AND logic):

```bash
grep -r -i -l "export" ~/kb/ | xargs grep -l -i "crash"
```

For fuzzy matching or ranked results, use `fzf` if available:

```bash
grep -r -i "export crash" ~/kb/ | fzf --filter "export crash" | head -20
```

Read the full content of a matching article:

```bash
cat ~/kb/bugs/export-crash.md
```

## Matching Issues to Known Solutions

1. Extract the key symptom keywords from the support request (e.g., "export", "white screen", "CSV", "crash").
2. Search `~/kb/` with those keywords.
3. If one or more articles match, read them and extract the resolution steps.
4. Present the resolution to the customer in plain language, with a link to the article if a public URL is available in the frontmatter.

### Example KB Article Format

```markdown
---
title: Export to CSV causes white screen
tags: [export, csv, crash, bug]
status: known-bug
workaround: true
fix-version: 2.4.1
---

## Symptom
Clicking Export > CSV on any report freezes the app and shows a white screen.

## Root Cause
A null-pointer exception in the CSV serializer when a column contains emoji characters.

## Workaround
1. Remove any emoji from column headers before exporting.
2. Use the JSON export format instead.

## Permanent Fix
Resolved in v2.4.1 (released 2026-02-15). Upgrade to resolve.
```

## Escalating Unknowns

If no article matches the reported issue:

1. Check if the issue has been reported before by searching Linear/Jira for similar tickets (use the `ticket-creation` skill's search capability if available).
2. If genuinely unknown, escalate:
   - Create a new ticket with priority `High` and label `needs-investigation`.
   - Add a note: "No KB article found. Escalated for engineering review."
   - Reply to the customer: "This appears to be a new issue we haven't seen before. I've escalated it to our engineering team and will follow up within 1 business day."

3. After engineering resolves the issue, create a new KB article at `~/kb/bugs/<slug>.md` or `~/kb/how-to/<slug>.md` to capture the solution for future cases.

## Keeping the KB Up to Date

When you successfully resolve an issue that isn't documented:

```bash
# Create a new article
cat > ~/kb/bugs/new-issue-slug.md << 'EOF'
---
title: <Title>
tags: [tag1, tag2]
status: known-bug
workaround: true
---

## Symptom
...

## Workaround
...
EOF
```

Then add an entry to `~/kb/index.md`.

## Notes

- Always prefer a documented workaround over telling a customer to wait for a fix.
- If the customer is on an older version, check `fix-version` in the article frontmatter — the fix may already be available if they upgrade.
- Do not share internal root cause details (e.g., code file names) in customer-facing replies.
