# Command Scheduler API

NestJS + TypeScript implementation of the "Command Scheduler API" challenge.

## Features (matches the spec)
- Schedule commands for a device
- Devices poll for the next command (oldest PENDING) and receive a 60s lease
- Devices report completion (SUCCEEDED/FAILED) while the lease is still valid
- Concurrency-safe leasing (the same command is not delivered twice under concurrent polls)
- **Bonus 1:** Idempotent scheduling using an `Idempotency-Key` header
- **Bonus 2:** Optional command TTL (`ttlSeconds`) that expires commands not completed in time

## Tech
- Node.js + TypeScript + NestJS
- SQLite via TypeORM
- Redis (only for idempotency keys)

## Running locally

### 1) Start Redis

```bash
docker compose up -d
```

### 2) Install deps

```bash
npm install
```

### 3) Start the API

```bash
npm run start:dev
```

The API will start on `http://localhost:3000`.

Swagger UI: `http://localhost:3000/docs`

## Configuration

Environment variables (optional):
- `PORT` (default: 3000)
- `DB_PATH` (default: `data.sqlite`)
- `REDIS_URL` (default: `redis://localhost:6379`)

Example:

```bash
export DB_PATH=data.sqlite
export REDIS_URL=redis://localhost:6379
```

## API

### Schedule a command

`POST /devices/:deviceId/commands`

Optional header:
- `Idempotency-Key: <string>`

Body:
```json
{
  "type": "REBOOT",
  "params": { "reason": "manual_recovery" },
  "ttlSeconds": 300
}
```

### Poll next command

`POST /devices/:deviceId/commands/poll`

- Returns `200` with the leased command, or `204` if none eligible.
- Lease duration: 60 seconds.

#### Lease expiry handling (no background job)
Expired leases and TTL-expired commands are handled inline on each poll:
- commands with `leaseExpiresAt <= now` are released back to `PENDING`
- commands with `expiresAt <= now` become `EXPIRED`

### Report completion

`POST /commands/:commandId/complete`

Body:
```json
{
  "status": "SUCCEEDED",
  "output": { "durationMs": 842 }
}
```

If the command is not currently leased or the lease expired, the API returns `409 Conflict`.

## Tests

```bash
npm test
```

Tests run with an in-memory SQLite database and a mocked Redis client.

## Notes / tradeoffs
- SQLite has limited row-level locking. To prevent double-delivery under concurrent polls, leasing uses an **atomic UPDATE with a status guard**:
  - select the oldest eligible PENDING command
  - `UPDATE ... WHERE id = ? AND status = 'PENDING'`
  - if the update affects 0 rows, we retry

