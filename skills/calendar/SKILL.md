---
name: calendar
description: Manage Google Calendar — check availability, create events, send invitations using the Calendar API
metadata:
  openclaw:
    emoji: "📅"
    requires:
      env: ["GOOGLE_CALENDAR_OAUTH_TOKEN_PATH"]
---

# Calendar Management

Interact with Google Calendar using the REST API v3. The OAuth token is stored at `~/tokens/google-calendar.json` (also available via `$GOOGLE_CALENDAR_OAUTH_TOKEN_PATH`).

## Authenticate

```bash
ACCESS_TOKEN=$(node -e "const t=require(process.env.GOOGLE_CALENDAR_OAUTH_TOKEN_PATH||'$HOME/tokens/google-calendar.json'); console.log(t.access_token)")
```

If the token is expired (API returns 401), refresh it:

```bash
REFRESH_TOKEN=$(node -e "const t=require('$HOME/tokens/google-calendar.json'); console.log(t.refresh_token)")
NEW_TOKEN=$(curl -s -X POST "https://oauth2.googleapis.com/token" \
  -d "client_id=$GOOGLE_CLIENT_ID&client_secret=$GOOGLE_CLIENT_SECRET&refresh_token=$REFRESH_TOKEN&grant_type=refresh_token" \
  | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).access_token))")
# Update the token file with the new access_token
```

## List Calendars

```bash
curl -s "https://www.googleapis.com/calendar/v3/users/me/calendarList" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

The primary calendar id is typically the user's email address, or use `primary` as a shorthand.

## Check Availability (Free/Busy)

Check if a time slot is free before booking:

```bash
curl -s -X POST "https://www.googleapis.com/calendar/v3/freeBusy" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "timeMin": "2026-03-10T09:00:00+08:00",
    "timeMax": "2026-03-10T17:00:00+08:00",
    "timeZone": "Asia/Shanghai",
    "items": [{"id": "primary"}]
  }'
```

The response lists busy intervals. Slots not covered by any busy interval are free.

## Find the Next Available Slot

To find the first available 30-minute slot within business hours (09:00–17:00):

1. Call `freeBusy` for the desired day.
2. Build a list of free intervals by subtracting the busy blocks from 09:00–17:00.
3. Return the first interval that is at least 30 minutes long.
4. Repeat for the next business day if no slot is found today.

## Create an Event

```bash
curl -s -X POST "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "Product Demo — Alice & Jane Doe (Acme Corp)",
    "description": "30-minute product demo. Dial-in: https://meet.google.com/abc-defg-hij",
    "start": {
      "dateTime": "2026-03-12T10:00:00+08:00",
      "timeZone": "Asia/Shanghai"
    },
    "end": {
      "dateTime": "2026-03-12T10:30:00+08:00",
      "timeZone": "Asia/Shanghai"
    },
    "attendees": [
      {"email": "alice@yourcompany.com"},
      {"email": "jane.doe@example.com"}
    ],
    "reminders": {
      "useDefault": false,
      "overrides": [
        {"method": "email", "minutes": 1440},
        {"method": "popup", "minutes": 15}
      ]
    }
  }'
```

Setting `sendUpdates=all` causes Google to send invitation emails to all attendees automatically.

## Update an Event

```bash
curl -s -X PATCH "https://www.googleapis.com/calendar/v3/calendars/primary/events/EVENT_ID?sendUpdates=all" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "start": {"dateTime": "2026-03-13T14:00:00+08:00", "timeZone": "Asia/Shanghai"},
    "end":   {"dateTime": "2026-03-13T14:30:00+08:00", "timeZone": "Asia/Shanghai"}
  }'
```

## Cancel / Delete an Event

```bash
curl -s -X DELETE "https://www.googleapis.com/calendar/v3/calendars/primary/events/EVENT_ID?sendUpdates=all" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

A 204 No Content response confirms deletion.

## List Upcoming Events

```bash
curl -s "https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=$(date -u +%Y-%m-%dT%H:%M:%SZ)&maxResults=10&singleEvents=true&orderBy=startTime" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

## Notes

- Always confirm the attendee's timezone before booking. Use `timeZone` in start/end objects accordingly.
- Use `sendUpdates=all` when creating or modifying events with external attendees so they receive email notifications.
- Return the event `htmlLink` to the caller so it can be shared in the follow-up message.
- If the proposed time is busy, offer 2–3 alternative slots rather than asking the user to pick from an open-ended range.
- For recurring events (e.g., weekly syncs), add a `recurrence` field: `["RRULE:FREQ=WEEKLY;BYDAY=MO"]`.
