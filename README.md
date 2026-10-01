# Gramix Node.js SDK

An asynchronous, fully typed client for the [Gramix.io](https://gramix.io/)
reseller API. See the [API documentation](https://gramix.io/resellers/api/documentation).
Requires Node.js 22+ and has no runtime dependencies. Written in strict TypeScript,
the ESM package includes compiled JavaScript and generated type declarations.

## Installation

```bash
npm install gramix-api
```

Before the first npm release, build and install from a local clone of the
[standalone repository](https://github.com/gramix-io/gramix-node-sdk):

```bash
npm ci
npm run build
npm install .
```

## Quick start

Set `GRAMIX_API_KEY` in your environment. Purchase examples create real, paid
orders when executed with an active key. Persist each idempotency key before
sending its request; generate a distinct key (for example with
`crypto.randomUUID()`) for every new purchase. The keys below are examples.

```js
import { GramixClient } from "gramix-api";

const client = new GramixClient(process.env.GRAMIX_API_KEY);

const balance = await client.getBalance();
const deposit = await client.getDepositDetails();

const purchase = await client.purchaseStars(
  {
    recipientName: "telegram_user",
    paymentCurrency: "usdt",
    stars: 500,
  },
  "stars_20260729_0001",
);

const premium = await client.purchasePremium(
  {
    recipientName: "telegram_user",
    paymentCurrency: "gram",
    duration: 6,
  },
  "premium_20260729_0001",
);

const gram = await client.purchaseGram(
  {
    recipientName: "telegram_user",
    paymentCurrency: "gram",
    gram: 2,
  },
  "gram_20260729_0001",
);

const orders = await client.listOrders({ limit: 20, offset: 0 });
const order = await client.getOrder(purchase.orderId);
```

Every method returns the contents of the successful response's `data` field.
The client validates the documented structure before returning it.

## API methods

All paths below are relative to `https://api.gramix.io/api/v1`.

| JavaScript method                        | HTTP endpoint                       | Arguments / result                              |
| ---------------------------------------- | ----------------------------------- | ----------------------------------------------- |
| `getBalance()`                           | `GET /wallets/balance`              | Decimal strings: `gram`, `usdt`                 |
| `getDepositDetails()`                    | `POST /wallets/balance`             | TON `address` and required `memo`               |
| `purchaseStars(input, idempotencyKey)`   | `POST /purchase/stars`              | 50–1,000,000 integer Stars; `gram` or `usdt`    |
| `purchasePremium(input, idempotencyKey)` | `POST /purchase/premium/{duration}` | 3, 6, or 12 months; `gram` or `usdt`            |
| `purchaseGram(input, idempotencyKey)`    | `POST /purchase/gram`               | 1–10,000 integer GRAM; payment currency `gram`  |
| `listOrders({ limit: 20, offset: 0 })`   | `GET /orders`                       | `data`, `total`, `limit`, `offset`; limit 1–100 |
| `getOrder(orderId)`                      | `GET /orders/{id}`                  | One order by UUID                               |

Methods return promises. Input and response fields use the API's `camelCase`
names. GET requests and deposit requests have no JSON body. Purchases carry
`Content-Type: application/json` and `idempotency-key`; every request includes
`x-api-key` and `Accept: application/json`.

Recipients use lowercase Telegram usernames without `@`. Idempotency keys
contain 8–64 ASCII letters, digits, underscores, or hyphens. Always include the
deposit memo in the TON transfer. A purchase response means acceptance for
asynchronous processing; use `getOrder(purchase.orderId)` or webhooks to track
completion. Order currency uses `usd` for USDT payments.

Balances and amounts remain decimal strings with four fractional digits. Keep
them as strings or use a decimal arithmetic library instead of floating-point
arithmetic. Timestamps are validated as ISO 8601 strings. Response parsing
returns documented fields and ignores unknown fields.

## Pagination

```js
let offset = 0;
while (true) {
  const page = await client.listOrders({ limit: 100, offset });
  for (const order of page.data) {
    console.log(order.id, order.status);
  }
  offset += page.data.length;
  if (page.data.length === 0 || offset >= page.total) break;
}
```

Orders are newest first. New orders arriving during pagination can shift offsets;
deduplicate by `id` when collecting a changing order history.

## Errors

- Non-2xx responses throw `GramixApiError` and preserve `httpStatus`,
  `apiStatusCode`, `response`, and `rawBody`.
- Network, timeout, cancellation, and rejected redirects throw `GramixTransportError`.
- Successful but malformed responses throw `GramixInvalidResponseError`.
- Invalid arguments throw `TypeError` or `RangeError`.

All SDK response and transport errors inherit from `GramixError`:

```js
import {
  GramixApiError,
  GramixInvalidResponseError,
  GramixTransportError,
} from "gramix-api";

try {
  const balance = await client.getBalance();
  console.log(balance);
} catch (error) {
  if (error instanceof GramixApiError) {
    console.error(`API rejected the request: HTTP ${error.httpStatus}`);
  } else if (error instanceof GramixTransportError) {
    console.error("Request outcome is unknown; check before retrying.");
  } else if (error instanceof GramixInvalidResponseError) {
    console.error("The API response does not match the documented format.");
  } else {
    throw error;
  }
}
```

The SDK does not retry automatically. After a network error or unreadable purchase
response, retry the same request with the same idempotency key. Use a new key
only for a new purchase.

## Webhooks

```js
import { parseWebhookEvent } from "gramix-api";

const event = parseWebhookEvent(await request.json());
```

This validates the documented payload shape but does not authenticate the
sender. The public API documentation currently defines no webhook signature.
Confirm order state with `getOrder(event.orderId)` before granting value.
Return HTTP 2xx promptly, handle duplicates idempotently, and do not assume
events arrive in order.

## Configuration

The constructor accepts `baseUrl`, `timeout` in milliseconds, and a custom `fetch`
for private gateways and tests. A custom base URL receives the API key, so use
only a trusted HTTP(S) endpoint. Keep keys in server-side secrets.

```js
const client = new GramixClient(process.env.GRAMIX_API_KEY, {
  timeout: 15_000,
});

const controller = new AbortController();
const pendingBalance = client.getBalance({ signal: controller.signal });
// Call controller.abort() to cancel the request.
const balance = await pendingBalance;
```

The default timeout is 30,000 ms and covers headers and the response body.
Allowed values are integers from 1 to 2,147,483,647 ms. Individual methods accept
an `AbortSignal` in their options argument. A custom `fetch` must honor the
provided signal and `redirect: "error"`. Redirects are rejected to avoid
forwarding credentials or replaying purchases at another destination.

## Development

```bash
npm ci
npm run verify
npm pack --dry-run
```

`verify` checks formatting, strict TypeScript, tests, and the installed package
archive, including ESM imports and generated declarations. Tests use mock
responses and local HTTP servers; they require no API key and create no real
purchases. GitHub CI runs on Node.js 22 and 24 on Linux.

Edit `src/`; `npm run build` generates `dist/`. The source separates endpoint
methods (`client.ts`), HTTP transport (`transport.ts`), boundary validation
(`validation.ts`), public types (`types.ts`), and errors (`errors.ts`). Import
from `gramix-api`; direct imports from source files are unsupported.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

## Releases

Update `package.json`, `package-lock.json`, the client User-Agent version, and
`CHANGELOG.md` together. Run `npm run verify` and inspect `npm pack --dry-run`
before publishing. The included CI workflow validates changes; it does not
publish npm packages or create GitHub Releases automatically.

See [PUBLISHING.md](./PUBLISHING.md) for GitHub setup and npm release instructions.

## License

The package currently declares `UNLICENSED`. No open-source license is granted;
licensing terms must be confirmed with the rights holder before redistribution.
