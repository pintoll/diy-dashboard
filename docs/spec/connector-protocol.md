# Connector Protocol

A **connector** is a declarative description of one HTTP JSON endpoint: where to fetch, and where in the response the values live. Adding a market indicator or a calendar feed is writing one of these, not writing code.

Status: **implemented.** Types in `src/main/connectors/types.ts`, validation in `validate.ts`, request execution in `fetcher.ts`, response shaping in `parse.ts`, URL policy in `url-guard.ts`, caching and the test harness in `runtime.ts`. Definitions are stored in `<userData>/connectors.json`.

Write connectors through [`connectors-agent-api.md`](connectors-agent-api.md) or the `dyd source` commands in [`dyd-cli.md`](dyd-cli.md). Both dry-run a definition before storing it, so a wrong path comes back as an error rather than a card that renders `—` forever.

## The two kinds

| kind | produces | template vars | used by |
|---|---|---|---|
| `series` | dated numeric points | `{{limit}}` | macro indicator cards, charts |
| `events` | dated labels | `{{from}}`, `{{to}}` | economic calendar |

Pick `series` when the answer is a number over time (a rate, an index, a price). Pick `events` when the answer is "something happens on this date".

## Schema

```jsonc
{
  "id": "DGS10",              // required. ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$
  "kind": "series",           // required. "series" | "events"
  "label": "10Y UST",         // required. what the card shows
  "group": "Rates",           // required. free-form; widget tabs are derived
                              //   from the distinct values in use
  "enabled": true,            // optional, default true
  "order": 10,                // optional. ascending; unset sorts last, ties by id
  "cacheTtlMs": 300000,       // optional, default 5 min. 1000 .. 86400000
  "request": {
    "url": "https://...",     // required. https only, no placeholders (see below)
    "query": {                // optional. <= 20 entries, values <= 200 chars
      "series_id": "DGS10",   //   placeholders are substituted HERE
      "limit": "{{limit}}"
    },
    "headers": {},            // optional. sent verbatim, no substitution
    "auth": { "mode": "none" } // required. see Credentials
  },
  "response": { },            // required. shape depends on kind
  "display": { },             // required for kind "series" only
  "meta": {}                  // optional. scalars only; passed to the widget,
                              //   ignored by the transport (e.g. calendar
                              //   country / importance)
}
```

`response` for `series`:

```jsonc
{
  "itemsPath": "observations",  // required. "" means the response root is the array
  "datePath": "date",           // required. path WITHIN one item
  "valuePath": "value",         // required. path WITHIN one item
  "skipValues": ["."]           // optional. missing-data sentinels
}
```

`response` for `events`:

```jsonc
{
  "itemsPath": "release_dates",
  "datePath": "date",
  "labelPath": "release_name"   // optional; falls back to the connector's `label`
}
```

`display` (series only):

```jsonc
{
  "unit": "percent",       // "percent" | "index" | "currency" | "basis_points"
  "fractionDigits": 2      // integer 0..8
}
```

## Dot paths

Paths are **simple dot paths and nothing else**. No wildcards, no filters, no expressions, no array indices. The point is that a correct path can be written from one glance at a response sample, without learning a query language.

- `"observations"` reads `json.observations`
- `"data.items"` reads `json.data.items`
- `""` means "the value is the root itself", used when the API returns a bare array
- Each segment must match `[A-Za-z0-9_-]+`, at most 8 segments deep

`itemsPath` is resolved against the whole response and must land on an array. `datePath`, `valuePath`, and `labelPath` are resolved against **one element** of that array, not against the root.

If the array is at the root and each element is a flat object, `itemsPath` is `""` and the other paths are plain key names.

## Template variables

Placeholders are substituted **only into `request.query` values**. They are *not* substituted into `request.url` or into `request.headers`. A `{{limit}}` typed into the URL string is sent to the server literally and will not do what you meant, so parameters that need a variable belong in `query`.

| variable | available in | value |
|---|---|---|
| `{{limit}}` | `series` fetches | how many points the widget wants |
| `{{from}}` | `events` fetches | window start, `YYYY-MM-DD` |
| `{{to}}` | `events` fetches | window end, `YYYY-MM-DD` |

A placeholder that is not bound for the current kind is an error, not an empty string: using `{{from}}` in a `series` connector fails the fetch rather than silently requesting the wrong window.

## Ordering, dates, and skipped rows

**Points are always sorted oldest-first by their parsed date.** There is no ordering field, and you do not need to declare that an API returns newest-first. Provider-side sort parameters still belong in `request.query`, because they select *which* rows a `limit` returns (FRED's `sort_order=desc` with `limit=10` means "the 10 most recent"), but the final order is normalized either way.

Dates are normalized to `YYYY-MM-DD` from any of: a `YYYY-MM-DD` prefix, a full ISO datetime, or an epoch number (values above `1e11` are read as milliseconds, smaller ones as seconds).

For `series`, a row is skipped when:

- `valuePath` resolves to `null` or is missing
- the raw string value is listed in `skipValues` (matched **before** numeric coercion, which is why FRED's `"."` works)
- the value does not coerce to a finite number
- the date cannot be parsed

If **every** row is skipped, the fetch fails with `parsed 0 usable points from N items`, naming the two paths to check. An `events` connector that yields zero entries is *not* an error: an empty calendar window is a legitimate answer.

## Credentials

A connector definition is plaintext and holds **no secrets**. It names a credential; the fetcher resolves that name against the encrypted store at request time.

```jsonc
{ "mode": "none" }
{ "mode": "query",  "param": "api_key",       "credential": "fred" }
{ "mode": "bearer",                            "credential": "polygon" }
{ "mode": "header", "header": "X-API-KEY", "prefix": "", "credential": "vendor" }
```

A credential is `{ name, secret, allowedHost }`:

- `name`: `^[a-z0-9][a-z0-9._-]{0,39}$`, at most 50 stored
- `secret`: write-only, at most 4096 chars. **No API route or CLI command ever returns it.**
- `allowedHost`: one hostname. A full URL is accepted and reduced to its host.

**The `allowedHost` pin is what makes it safe to let an agent author definitions.** Before a secret is attached to a request, the request's hostname must equal the pin. A definition that names credential `fred` but points somewhere else is refused:

```
credential "fred" is bound to api.stlouisfed.org and will not be sent to evil.example
```

So a mistaken or tampered definition cannot exfiltrate a key by redirecting it. Set the credential once, then connectors can reference it by name forever.

## Security limits

Enforced by `url-guard.ts` (before and during the request) and `fetcher.ts` (on the response). These are not advisory:

| limit | value |
|---|---|
| scheme | `https` only |
| request timeout | 10 s |
| response size | 5 MB (streamed and counted, not trusted from `content-length`) |
| items per response | 5000 |
| redirects | at most 3, re-checked each hop, **same-host only** |
| per-host concurrency | 5 in flight |
| connectors stored | 100 |

Blocked destinations, checked statically at save time *and* against resolved DNS immediately before each request:

- `localhost`, and any host ending `.local`, `.internal`, `.localhost`
- IPv4 `0.*`, `10.*`, `127.*`, `169.254.*` (link-local, includes cloud metadata), `172.16-31.*`, `192.168.*`, `100.64-127.*` (CGNAT)
- IPv6 `::1`, `::`, `fc00::/7`, `fe80::/10`, and IPv4-mapped forms of the above

Cross-host redirects are refused outright rather than followed, so a public endpoint cannot bounce a request (and its attached credential) to another host.

## Testing before saving

Every write runs the definition end to end first and refuses to store one that fails. That check is the reason this system is safe to hand to an agent. A `series` test fetches with `limit: 10`; an `events` test fetches a window of -30 to +30 days. Both return an item count and a small sample, so you can confirm the numbers are the ones you expected and not, say, a volume column.

Pass `skipTest: true` to bypass it when the machine is offline or the credential is not set yet.

---

## Example 1: FRED series (query-param auth, sentinel values)

The 10-year Treasury yield. This is a seeded default, from `src/main/connectors/defaults.ts`.

```jsonc
{
  "id": "DGS10",
  "kind": "series",
  "label": "10Y UST",
  "group": "Rates",
  "enabled": true,
  "order": 10,
  "request": {
    "url": "https://api.stlouisfed.org/fred/series/observations",
    "query": {
      "series_id": "DGS10",
      "file_type": "json",
      // newest-first so a limit keeps the most recent window; the fetcher
      // sorts back to oldest-first after parsing
      "sort_order": "desc",
      "limit": "{{limit}}"
    },
    "auth": { "mode": "query", "param": "api_key", "credential": "fred" }
  },
  "response": {
    "itemsPath": "observations",
    "datePath": "date",
    "valuePath": "value",
    // FRED sends "." for a day with no observation
    "skipValues": ["."]
  },
  "display": { "unit": "percent", "fractionDigits": 2 }
}
```

Response shape it reads:

```jsonc
{
  "observations": [
    { "date": "2026-07-18", "value": "4.42" },
    { "date": "2026-07-17", "value": "." }
  ]
}
```

Note the values are **strings**: numeric coercion is automatic, so no declaration is needed.

## Example 2: Upbit daily candles (no auth, root-level array)

Bitcoin in KRW. The response is a bare array, so `itemsPath` is `""`.

```jsonc
{
  "id": "upbit-btc-krw",
  "kind": "series",
  "label": "BTC/KRW",
  "group": "Crypto",
  "request": {
    "url": "https://api.upbit.com/v1/candles/days",
    // market and count are query entries, NOT part of the url string,
    // because that is the only place {{limit}} is substituted
    "query": { "market": "KRW-BTC", "count": "{{limit}}" },
    "auth": { "mode": "none" }
  },
  "response": {
    "itemsPath": "",
    "datePath": "candle_date_time_kst",
    "valuePath": "trade_price"
  },
  "display": { "unit": "currency", "fractionDigits": 0 }
}
```

Response shape it reads:

```jsonc
[
  { "candle_date_time_kst": "2026-07-20T00:00:00", "trade_price": 98750000 },
  { "candle_date_time_kst": "2026-07-19T00:00:00", "trade_price": 97120000 }
]
```

`candle_date_time_kst` is an ISO datetime; it is truncated to its date. Upbit returns newest-first, which needs no declaration.

## Example 3: bearer auth

Shape only. Substitute your provider's host, path, parameter names, and response paths; the auth block is the part to copy.

```jsonc
{
  "id": "vendor-cpi",
  "kind": "series",
  "label": "Vendor CPI",
  "group": "Inflation",
  "cacheTtlMs": 3600000,
  "request": {
    "url": "https://api.vendor.example/v2/timeseries",
    "query": { "symbol": "CPIAUCSL", "periods": "{{limit}}" },
    "auth": { "mode": "bearer", "credential": "vendor" }
  },
  "response": {
    "itemsPath": "data.points",
    "datePath": "t",
    "valuePath": "v"
  },
  "display": { "unit": "index", "fractionDigits": 1 }
}
```

Sends `Authorization: Bearer <secret>`. Register the credential first, pinned to the same host:

```bash
dyd cred set vendor api.vendor.example "$VENDOR_KEY"
```

For a provider that wants a custom header instead, use `{"mode": "header", "header": "X-API-KEY", "credential": "vendor"}`, adding `"prefix"` if the value needs one (`"prefix": "Token "`).

## Example 4: an events connector

FRED release dates, driving the economic calendar. `{{from}}` and `{{to}}` are the calendar's visible window.

```jsonc
{
  "id": "fred-release-10",
  "kind": "events",
  "label": "CPI",
  "group": "US",
  "request": {
    "url": "https://api.stlouisfed.org/fred/release/dates",
    "query": {
      "release_id": "10",
      "file_type": "json",
      "realtime_start": "{{from}}",
      "realtime_end": "{{to}}",
      "include_release_dates_with_no_data": "true",
      "sort_order": "asc"
    },
    "auth": { "mode": "query", "param": "api_key", "credential": "fred" }
  },
  "response": {
    "itemsPath": "release_dates",
    "datePath": "date",
    "labelPath": "release_name"
  },
  "meta": { "country": "US", "importance": 3 }
}
```

There is no `display` block: events carry a label, not a number. `meta` is opaque to the transport and read by the calendar widget.

## Writing a new connector: the loop

1. Fetch the endpoint once yourself and look at the JSON.
2. Find the array. That path is `itemsPath` (`""` if the array is the root).
3. Inside one element, find the date and the number. Those are `datePath` and `valuePath`.
4. Move any parameter that needs a variable into `request.query` with `{{limit}}` or `{{from}}`/`{{to}}`.
5. `dyd source add '<json>'`. The app fetches it before saving; if the sample is wrong, fix the path and repeat.
