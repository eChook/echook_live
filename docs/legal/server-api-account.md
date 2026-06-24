# Account deletion API (eChook Server)

This document specifies session-protected account endpoints required by eChook Live policy pages and Settings UI. Implement these in **eChook Server** (not in this frontend repository).

## Authentication

All endpoints require a valid session cookie (same as `/account/update`). Return `401` when unauthenticated.

Destructive actions also require a verification code from `POST /account/request-code` (same OTP flow as account update).

---

## POST /account/delete-telemetry

Permanently removes stored SQL telemetry for the authenticated account. Does not delete the MongoDB account document.

### Delete all telemetry

```
POST /account/delete-telemetry
Cookie: session=...
Content-Type: application/json

{
  "code": "123456",
  "deleteAll": true
}
```

When `deleteAll` is `true`, `fromDate` and `toDate` are not required.

### Delete telemetry in a date range

```
POST /account/delete-telemetry
Cookie: session=...
Content-Type: application/json

{
  "code": "123456",
  "fromDate": "2026-01-01",
  "toDate": "2026-01-31"
}
```

- `fromDate` and `toDate` use UTC calendar days (`YYYY-MM-DD`), matching `GET /api/history/days/:id`
- The range is inclusive of both days

### Response (200)

```json
{
  "success": true,
  "message": "Telemetry data from 2026-01-01 to 2026-01-31 deleted successfully.",
  "deleted": 48210
}
```

### Errors

- `400 Bad Request`: Invalid or missing dates, invalid code, or expired code
- `401 Unauthorized`: Not logged in
- `403 Forbidden`: Too many failed OTP attempts

### Server behaviour

1. Resolve authenticated user and car ID from session.
2. Validate the verification code.
3. If `deleteAll` is true, delete all telemetry rows in SQL for that car ID.
4. Otherwise delete telemetry rows where the UTC calendar day falls within the inclusive `fromDate`–`toDate` range.
5. Clear or prune in-memory live buffers for that car on the server as appropriate.
6. Do **not** remove the user account from MongoDB.

---

## POST /account/delete

Permanently deletes the authenticated account and all SQL telemetry associated with it. The session is ended on success.

### Request

```
POST /account/delete
Cookie: session=...
Content-Type: application/json

{
  "code": "123456"
}
```

### Response (200)

```json
{
  "success": true,
  "message": "Account and all associated telemetry data deleted successfully."
}
```

### Errors

- `400 Bad Request`: Missing, invalid, or expired verification code
- `401 Unauthorized`: Not logged in
- `403 Forbidden`: Too many failed OTP attempts
- `404 Not Found`: User not found
- `500 Server Error`: Telemetry deletion failed or other server error

### Server behaviour

1. Resolve authenticated user from session.
2. Validate the verification code.
3. Delete all SQL telemetry for the user's car ID.
4. Delete the MongoDB user document.
5. Invalidate the session cookie.

---

## Frontend integration

eChook Live calls these endpoints from [`src/stores/auth.js`](../src/stores/auth.js):

- `auth.requestVerificationCode()` → `POST /account/request-code` (sent before each delete modal opens)
- `auth.deleteTelemetry(code)` → `POST /account/delete-telemetry` with `{ code, deleteAll: true }`
- `auth.deleteTelemetryRange(code, fromDate, toDate)` → `POST /account/delete-telemetry` with `{ code, fromDate, toDate }`
- `auth.deleteAccount(code)` → `POST /account/delete` with `{ code }`

Settings delete actions show server error messages inline in the confirmation modal when the OTP or request is rejected.
