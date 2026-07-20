# Connectors — Local Agent API

HTTP interface for reading and writing data-source connectors and their credentials while the app runs. This is how an agent adds a market indicator or a calendar feed without touching the source tree.

Status: **implemented.** Routes in `src/main/agent-api/connectors-routes.ts`, registered in `server.ts`. Domain logic in `src/main/connectors/` (`store.ts`, `credentials.ts`, `runtime.ts`).

- **The connector schema itself lives in [`connector-protocol.md`](connector-protocol.md).** Read that first; this page is only the transport.
- `dyd source` and `dyd cred` wrap these routes, see [`dyd-cli.md`](dyd-cli.md).
- Discovery, bind address, and auth are identical to [`todos-agent-api.md`](todos-agent-api.md#discovery): loopback only, `Authorization: Bearer <token>` from `<userData>/agent-api.json`.

## Why writes are slow

`POST /api/connectors` and `PATCH /api/connectors/:id` **fetch the endpoint for real before storing anything**, and reject the write with a `400` if that fetch fails. Expect these calls to take up to the fetch timeout (10 s).

This is deliberate. The failure mode it prevents is an agent writing a plausible but wrong `valuePath`, the save succeeding, and the widget rendering `—` forever with nothing anywhere reporting a problem. A `400` naming the bad path is worth the wait.

Send `"skipTest": true` in the body to bypass it (offline, or the credential is not registered yet). `skipTest` is a request option, not a connector field: it is stripped before the definition is validated and stored.

## Connector routes

### `GET /api/connectors`

```
GET /api/connectors
GET /api/connectors?group=Rates
GET /api/connectors?kind=series          // "series" | "events"
→ 200 { "connectors": [ ...Connector ] }
```

Sorted by `order` (unset last), then by `id`. Filters combine. An unrecognized `kind` is a `400` rather than an empty list, because a silent empty result reads as "nothing configured" and sends you looking in the wrong place.

### `GET /api/connectors/:id`

```
GET /api/connectors/DGS10
→ 200 { "connector": {...} }
→ 404 { "error": "connector \"DGS10\" not found" }
```

### `POST /api/connectors`

Create or replace, keyed on `id`.

```jsonc
POST /api/connectors
{
  "id": "upbit-btc-krw",
  "kind": "series",
  "label": "BTC/KRW",
  "group": "Crypto",
  "request": {
    "url": "https://api.upbit.com/v1/candles/days",
    "query": { "market": "KRW-BTC", "count": "{{limit}}" },
    "auth": { "mode": "none" }
  },
  "response": { "itemsPath": "", "datePath": "candle_date_time_kst", "valuePath": "trade_price" },
  "display": { "unit": "currency", "fractionDigits": 0 }
}

→ 201 {
  "connector": { ... },        // as stored, after defaults are applied
  "test": {
    "ok": true,
    "itemCount": 10,
    "sample": [ { "date": "2026-07-20", "value": 98750000 } ]   // last 3 points
  }
}
```

`"test": null` when `skipTest` was set. A failed dry-run never reaches the store:

```jsonc
→ 400 {
  "error": "connector test failed: parsed 0 usable points from 10 items — check datePath \"date\" and valuePath \"price\""
}
```

### `PATCH /api/connectors/:id`

```
PATCH /api/connectors/upbit-btc-krw
{ "label": "Bitcoin (KRW)", "enabled": false }
→ 200 { "connector": {...}, "test": {...} | null }
```

**Merging is top-level only.** `request` and `response` must be supplied whole; there is no deep merge, because half a merged request is more likely to produce a subtly broken connector than to save you typing. `id` cannot be changed by a patch (post a new definition instead).

The dry-run tests the **merged result**, not the fragment you sent, and nothing is written if it fails.

**State-only patches are not dry-run.** A patch whose keys are all in `{enabled, order}` describes *whether* a connector runs, not *how*, so it skips the fetch entirely and needs no `skipTest`:

```json
{ "enabled": false }
```

This is what makes a broken source recoverable: it can be switched off while it is failing, and switched back on before its credential is registered. Any patch touching `request`, `response`, or `display` is dry-run as usual.

### `DELETE /api/connectors/:id`

```
DELETE /api/connectors/upbit-btc-krw
→ 204
→ 404 if unknown
```

### `POST /api/connectors/:id/test`

Fetch a stored connector right now, bypassing the cache.

```
POST /api/connectors/DGS10/test
→ 200 { "test": { "ok": true, "itemCount": 10, "sample": [...] } }
```

### `POST /api/connectors/test`

Same, for a definition that has not been saved. The body is the definition.

```
POST /api/connectors/test
{ "id": "draft", "kind": "series", ... }
→ 200 { "test": { "ok": false, "error": "expected an array at \"data\", got an object with keys [results, status]" } }
```

Both test routes return **`200` with `ok: false`** for a failing definition. You asked what would happen; that is the answer, not a transport error. Only the write routes turn a failed test into a `400`.

## Credential routes

Secrets are **write-only**. There is no route that returns one, by design: a leaked token for this API must not become a leaked FRED key. See [`connector-protocol.md`](connector-protocol.md#credentials) for the `allowedHost` pin.

### `GET /api/credentials`

```
GET /api/credentials
→ 200 { "credentials": [ { "name": "fred", "allowedHost": "api.stlouisfed.org" } ] }
```

Names and pinned hosts only.

### `PUT /api/credentials/:name`

Create or replace.

```
PUT /api/credentials/fred
{ "secret": "abcdef...", "allowedHost": "api.stlouisfed.org" }
→ 200 { "credential": { "name": "fred", "allowedHost": "api.stlouisfed.org" } }
```

`allowedHost` accepts a full URL and reduces it to the hostname, since a caller usually has the endpoint at hand. The response echoes the normalized host and never the secret.

### `DELETE /api/credentials/:name`

```
DELETE /api/credentials/fred
→ 204
→ 404 if unknown
```

Connectors referencing a removed credential stay stored and start failing at fetch time with `credential "fred" is not configured`.

## Errors

```json
{ "error": "response.itemsPath segment \"data[0]\" must be alphanumeric, \"_\" or \"-\"" }
```

| Code | Meaning |
|---|---|
| `400` | Schema violation, unsafe URL, failed dry-run, bad `kind` filter, non-JSON body |
| `401` | Missing or invalid bearer token |
| `404` | Unknown connector id, unknown credential name, or unknown route |
| `405` | Route exists, wrong method |
| `500` | Internal error (logged app-side, not returned) |

Validation messages name the offending field and what was expected, and are returned verbatim as the `400` body. They are the only feedback a caller gets, so they are written to be acted on directly.

## Example: add a source end to end

```bash
BASE=http://127.0.0.1:8799
AUTH="Authorization: Bearer $TOKEN"

# 1. Register the key once, pinned to its host.
curl -s -H "$AUTH" -X PUT $BASE/api/credentials/fred \
  -d '{"secret":"'"$FRED_KEY"'","allowedHost":"api.stlouisfed.org"}'

# 2. Dry-run a draft without saving it.
curl -s -H "$AUTH" -X POST $BASE/api/connectors/test -d @draft.json

# 3. Save it. Rejected with 400 if the fetch or the paths are wrong.
curl -s -H "$AUTH" -X POST $BASE/api/connectors -d @draft.json
```

`dyd source add "$(cat draft.json)"` does the same thing with readable output.
