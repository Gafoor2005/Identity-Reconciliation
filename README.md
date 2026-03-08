# Identity Reconciliation

Tracks and links customer identities across multiple purchases using email and phone number.

## Endpoint

```
POST https://identity-reconciliation-zesw.onrender.com/identify
```

## How it works

Send an email, a phone number, or both. The service figures out if it's seen this person before and returns a consolidated view of all their known contact details.

## Request

```json
{
  "email": "mcfly@hillvalley.edu",
  "phoneNumber": "123456"
}
```

At least one of `email` or `phoneNumber` is required.

## Response

```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [23]
  }
}
```

- **primaryContatctId** — the oldest known contact for this person
- **emails** — all emails linked to them, primary's first
- **phoneNumbers** — all phone numbers linked to them, primary's first
- **secondaryContactIds** — IDs of all the other contacts merged into this one

## Rules

- No match found → creates a new contact
- Partial match (new info on a known person) → creates a secondary contact linked to the primary
- Two separate contacts turn out to be the same person → the older one becomes the primary, newer is demoted to secondary
