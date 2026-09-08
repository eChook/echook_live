# Feedback API (eChook Server)

This document specifies session-protected feedback endpoints required by the eChook Live Settings "Send Feedback" button and the Admin "Feedback" tab. Implement these in **eChook Server** (not in this frontend repository).

## Authentication

- `POST /account/feedback` requires a valid session cookie (same as `/account/update`). Return `401` when unauthenticated.
- `GET /admin/feedback` requires an authenticated admin session (same as other `/admin/*` routes). Return `401`/`403` when unauthenticated or non-admin.

---

## POST /account/feedback

Submits freeform feedback from the authenticated car account. The client only sends the message text — the server must attribute the submission to the session's account and record the time it was received.

### Request

```
POST /account/feedback
Cookie: session=...
Content-Type: application/json

{
  "message": "The lap timer sometimes double-counts the start/finish line."
}
```

- `message`: required, non-empty string. Reject empty/whitespace-only messages with `400`. Recommend capping length server-side (e.g. 2000 characters) to match the client's `maxlength`.

### Response (200)

```json
{
  "success": true,
  "message": "Thanks for your feedback!"
}
```

### Errors

- `400 Bad Request`: Missing or empty `message`, or message exceeds the server's length limit
- `401 Unauthorized`: Not logged in

### Server behaviour

1. Resolve the authenticated user and car ID from the session (do **not** trust a client-supplied car/account identifier).
2. Validate `message`.
3. Store a new feedback record containing:
   - The account/car ID (and denormalized `carName`/`teamName` at time of submission, so the admin view still reads sensibly if the account is later renamed or deleted)
   - The feedback `message` text
   - A server-generated UTC timestamp (`createdAt`)
4. Do not require or process any client-supplied identity/timestamp fields — both must come from the server session and clock.

---

## GET /admin/feedback

Returns a paginated, most-recent-first list of feedback submissions for the Admin "Feedback" tab.

### Request

```
GET /admin/feedback?limit=50&offset=0
Cookie: session=...
```

- `limit`: optional, default `50`
- `offset`: optional, default `0`

### Response (200)

```json
{
  "items": [
    {
      "id": "665f1c2e8a1b2c3d4e5f6789",
      "carId": "665f1c2e8a1b2c3d4e5f0001",
      "carName": "Car 7",
      "teamName": "Team Rocket",
      "message": "The lap timer sometimes double-counts the start/finish line.",
      "createdAt": "2026-09-05T14:32:00.000Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

This shape matches the existing `GET /admin/backup/r2/logs` pagination convention used elsewhere in the admin panel.

### Errors

- `401 Unauthorized`: Not logged in
- `403 Forbidden`: Logged in but not an admin

### Server behaviour

1. Verify the session belongs to an admin.
2. Query stored feedback records sorted by `createdAt` descending.
3. Return the requested page along with the total count.

---

## Frontend integration

eChook Live calls these endpoints from:

- [`src/stores/auth.js`](../src/stores/auth.js) — `auth.submitFeedback(message)` → `POST /account/feedback` with `{ message }`, triggered by the "Send Feedback" button in [`src/components/tabs/SettingsTab.vue`](../src/components/tabs/SettingsTab.vue)
- [`src/stores/admin.js`](../src/stores/admin.js) — `adminStore.fetchFeedback({ limit, offset })` → `GET /admin/feedback`, rendered by [`src/components/tabs/AdminFeedbackTab.vue`](../src/components/tabs/AdminFeedbackTab.vue)

The Settings modal shows the server's error message inline when submission fails, matching the pattern used by the account deletion modals.
