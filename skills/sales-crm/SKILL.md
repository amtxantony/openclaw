---
name: sales-crm
description: Query and update the HubSpot CRM — list contacts, create leads, update deal stages, log activities
metadata:
  openclaw:
    emoji: "💼"
    requires:
      env: ["HUBSPOT_API_KEY"]
---

# Sales CRM (HubSpot)

Interact with HubSpot using the REST API v3. All requests require the `Authorization: Bearer $HUBSPOT_API_KEY` header.

Base URL: `https://api.hubapi.com`

## List Contacts

Retrieve the most recently modified contacts:

```bash
curl -s "https://api.hubapi.com/crm/v3/objects/contacts?limit=20&properties=firstname,lastname,email,company,phone,hs_lead_status&sort=-lastmodifieddate" \
  -H "Authorization: Bearer $HUBSPOT_API_KEY"
```

Search contacts by email:

```bash
curl -s -X POST "https://api.hubapi.com/crm/v3/objects/contacts/search" \
  -H "Authorization: Bearer $HUBSPOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "filterGroups": [{"filters": [{"propertyName": "email", "operator": "EQ", "value": "contact@example.com"}]}],
    "properties": ["firstname", "lastname", "email", "company", "hs_lead_status"]
  }'
```

## Create a New Lead (Contact)

```bash
curl -s -X POST "https://api.hubapi.com/crm/v3/objects/contacts" \
  -H "Authorization: Bearer $HUBSPOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "properties": {
      "firstname": "Jane",
      "lastname": "Doe",
      "email": "jane.doe@example.com",
      "company": "Acme Corp",
      "phone": "+1-555-0100",
      "hs_lead_status": "NEW",
      "lead_source": "EMAIL"
    }
  }'
```

Standard `hs_lead_status` values: `NEW`, `OPEN`, `IN_PROGRESS`, `OPEN_DEAL`, `UNQUALIFIED`, `ATTEMPTED_TO_CONTACT`, `CONNECTED`, `BAD_TIMING`.

## Create a Deal

```bash
curl -s -X POST "https://api.hubapi.com/crm/v3/objects/deals" \
  -H "Authorization: Bearer $HUBSPOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "properties": {
      "dealname": "Acme Corp — Enterprise Plan",
      "dealstage": "appointmentscheduled",
      "pipeline": "default",
      "amount": "12000",
      "closedate": "2026-06-30"
    }
  }'
```

Common `dealstage` values (default pipeline): `appointmentscheduled`, `qualifiedtobuy`, `presentationscheduled`, `decisionmakerboughtin`, `contractsent`, `closedwon`, `closedlost`.

## Update a Deal Stage

```bash
curl -s -X PATCH "https://api.hubapi.com/crm/v3/objects/deals/DEAL_ID" \
  -H "Authorization: Bearer $HUBSPOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"properties": {"dealstage": "contractsent"}}'
```

## Associate a Contact with a Deal

```bash
curl -s -X PUT "https://api.hubapi.com/crm/v3/objects/deals/DEAL_ID/associations/contacts/CONTACT_ID/deal_to_contact" \
  -H "Authorization: Bearer $HUBSPOT_API_KEY"
```

## Log an Activity (Note)

```bash
curl -s -X POST "https://api.hubapi.com/crm/v3/objects/notes" \
  -H "Authorization: Bearer $HUBSPOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "properties": {
      "hs_note_body": "Called Jane Doe. Interested in Enterprise plan. Follow up next week.",
      "hs_timestamp": "2026-03-08T09:00:00.000Z"
    }
  }'
```

Then associate the note with a contact or deal using the associations endpoint (same pattern as above, type `note_to_contact`).

## Get Sales Pipeline Summary

Retrieve all open deals grouped by stage:

```bash
curl -s -X POST "https://api.hubapi.com/crm/v3/objects/deals/search" \
  -H "Authorization: Bearer $HUBSPOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "filterGroups": [{"filters": [{"propertyName": "dealstage", "operator": "NOT_IN", "values": ["closedwon", "closedlost"]}]}],
    "properties": ["dealname", "dealstage", "amount", "closedate", "hubspot_owner_id"],
    "sorts": [{"propertyName": "amount", "direction": "DESCENDING"}],
    "limit": 50
  }'
```

## Notes

- HubSpot API rate limit: 150 requests per 10 seconds per account.
- Always check for a 409 Conflict response when creating contacts — it means a contact with that email already exists. In that case, update the existing record instead.
- Currency amounts are strings (no currency symbol).
