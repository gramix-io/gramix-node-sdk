import assert from "node:assert/strict";
import test from "node:test";

import {
  GramixApiError,
  GramixClient,
  GramixInvalidResponseError,
  GramixTransportError,
  parseWebhookEvent,
} from "../dist/index.js";

function sampleOrder() {
  return {
    id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    type: "stars",
    method: "api",
    currency: "usd",
    amount: "1.5500",
    status: "completed",
    processingStatus: "completed_fragment_purchase",
    recipientName: "telegram_user",
    extraData: { quantityCoins: 100 },
    transactionHash: null,
    idempotencyKey: "stars_test_0001",
    createdAt: "2026-07-16T12:00:00.000Z",
  };
}

function jsonResponse(status, data) {
  return new Response(JSON.stringify({ statusCode: status, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("purchaseStars builds the documented request", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(201, {
      orderId: "7ba77616-7706-4215-9e6f-b6c67e4df292",
      status: "processing",
      idempotencyKey: "stars_test_0001",
    });
  };

  const client = new GramixClient("test-key", {
    baseUrl: "https://example.test/api/v1",
    timeout: 5_000,
    fetch,
  });
  const result = await client.purchaseStars(
    { recipientName: "telegram_user", paymentCurrency: "usdt", stars: 500 },
    "stars_test_0001",
  );

  assert.equal(result.status, "processing");
  assert.equal(calls[0].url, "https://example.test/api/v1/purchase/stars");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["idempotency-key"], "stars_test_0001");
  assert.equal(JSON.parse(calls[0].init.body).stars, 500);
  assert.equal(client.apiKey, undefined);
});

test("non-2xx response throws a typed API error with diagnostics", async () => {
  const rawBody = JSON.stringify({
    statusCode: 403,
    message: "Insufficient balance",
  });
  const client = new GramixClient("test-key", {
    fetch: async () =>
      new Response(rawBody, {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
  });

  await assert.rejects(client.getBalance(), (error) => {
    assert.ok(error instanceof GramixApiError);
    assert.equal(error.httpStatus, 403);
    assert.equal(error.apiStatusCode, 403);
    assert.equal(error.rawBody, rawBody);
    assert.equal(error.message, "Insufficient balance");
    return true;
  });
});

test("all documented endpoint methods use the correct routes", async () => {
  const routes = [];
  const client = new GramixClient("test-key", {
    baseUrl: "https://example.test/api/v1",
    fetch: async (url, init) => {
      routes.push([init.method, url]);
      const status = init.method === "POST" ? 201 : 200;
      let data;
      if (url.endsWith("/wallets/balance")) {
        data =
          init.method === "GET"
            ? { gram: "14.2500", usdt: "125.5000" }
            : { address: "UQTEST", memo: "test-memo" };
      } else if (url.endsWith("/purchase/advertisement/check")) {
        data = { isValid: true, message: "OK", minAmount: 20 };
      } else if (url.includes("/purchase/")) {
        data = {
          orderId: "7ba77616-7706-4215-9e6f-b6c67e4df292",
          status: "processing",
          idempotencyKey: "route_test_0001",
        };
      } else if (url.includes("/orders?")) {
        data = {
          data: [sampleOrder()],
          total: 1,
          limit: 100,
          offset: 10,
        };
      } else {
        data = sampleOrder();
      }
      return jsonResponse(status, data);
    },
  });

  await client.getBalance();
  await client.getDepositDetails();
  await client.purchaseStars(
    { recipientName: "telegram_user", paymentCurrency: "usdt", stars: 50 },
    "stars_route_0001",
  );
  await client.purchasePremium(
    { recipientName: "telegram_user", paymentCurrency: "gram", duration: 6 },
    "premium_route_0001",
  );
  await client.purchaseGram(
    { recipientName: "telegram_user", paymentCurrency: "gram", gram: 1 },
    "gram_route_0001",
  );
  await client.checkAdvertisement({
    adsAccountId:
      "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdEfGhIjKlMnOpQrStUvWxYz",
    amount: 20,
  });
  await client.purchaseAdvertisement(
    {
      adsAccountId:
        "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdEfGhIjKlMnOpQrStUvWxYz",
      paymentCurrency: "usdt",
      amount: 20,
    },
    "ads_route_0001",
  );
  await client.listOrders({ limit: 100, offset: 10 });
  await client.getOrder("f47ac10b-58cc-4372-a567-0e02b2c3d479");

  assert.deepEqual(routes, [
    ["GET", "https://example.test/api/v1/wallets/balance"],
    ["POST", "https://example.test/api/v1/wallets/balance"],
    ["POST", "https://example.test/api/v1/purchase/stars"],
    ["POST", "https://example.test/api/v1/purchase/premium/6"],
    ["POST", "https://example.test/api/v1/purchase/gram"],
    ["POST", "https://example.test/api/v1/purchase/advertisement/check"],
    ["POST", "https://example.test/api/v1/purchase/advertisement"],
    ["GET", "https://example.test/api/v1/orders?limit=100&offset=10"],
    [
      "GET",
      "https://example.test/api/v1/orders/f47ac10b-58cc-4372-a567-0e02b2c3d479",
    ],
  ]);
});

test("invalid successful responses are rejected", async () => {
  const client = new GramixClient("test-key", {
    fetch: async () => jsonResponse(200, { gram: 12, usdt: "1.0000" }),
  });

  await assert.rejects(client.getBalance(), (error) => {
    assert.ok(error instanceof GramixInvalidResponseError);
    assert.equal(error.httpStatus, 200);
    return true;
  });
});

test("timeouts are reported as transport errors", async () => {
  const client = new GramixClient("test-key", {
    timeout: 10,
    fetch: async (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
  });

  await assert.rejects(client.getBalance(), GramixTransportError);
});

test("documented constraints are validated locally", () => {
  const client = new GramixClient("test-key", {
    fetch: async () => {
      throw new Error("must not be called");
    },
  });

  assert.throws(
    () =>
      client.purchasePremium(
        {
          recipientName: "telegram_user",
          paymentCurrency: "usdt",
          duration: 4,
        },
        "premium_test_0001",
      ),
    RangeError,
  );
  assert.throws(
    () =>
      client.purchaseStars(
        {
          recipientName: "1username",
          paymentCurrency: "usdt",
          stars: 50,
        },
        "stars_test_0001",
      ),
    TypeError,
  );
  assert.throws(() => client.listOrders({ limit: 101 }), RangeError);
  assert.throws(() => client.getOrder("not-a-uuid"), TypeError);
  assert.throws(
    () => new GramixClient("test-key", { baseUrl: "file:///tmp/api" }),
    TypeError,
  );
});

test("webhook parser validates event coherence", () => {
  const event = parseWebhookEvent({
    event: "order.completed",
    orderId: "7ba77616-7706-4215-9e6f-b6c67e4df292",
    status: "completed",
    processingStatus: "completed_fragment_purchase",
    type: "stars",
    amount: "7.6500",
    currency: "usd",
    recipientName: "telegram_user",
    createdAt: "2026-07-13T10:20:30.000Z",
  });
  assert.equal(event.status, "completed");
  assert.throws(
    () => parseWebhookEvent({ ...event, status: "failed" }),
    TypeError,
  );
});

for (const input of [
  { paymentCurrency: "usdt", gram: 1 },
  { paymentCurrency: "gram", gram: 2.5 },
]) {
  test(`GRAM rejects undocumented input ${JSON.stringify(input)}`, () => {
    const client = new GramixClient("test-key", {
      fetch: async () => jsonResponse(201, {}),
    });
    assert.throws(() =>
      client.purchaseGram(
        { recipientName: "telegram_user", ...input },
        "gram_test_0001",
      ),
    );
  });
}

test("timeout rejects values that overflow Node timers", () => {
  assert.throws(
    () => new GramixClient("key", { timeout: 2 ** 31 }),
    RangeError,
  );
});

test("successful HTTP response rejects contradictory envelope status", async () => {
  const client = new GramixClient("key", {
    fetch: async () =>
      new Response(
        JSON.stringify({
          statusCode: 500,
          data: { gram: "1.0000", usdt: "0.0000" },
        }),
      ),
  });
  await assert.rejects(client.getBalance(), GramixInvalidResponseError);
});

test("malformed monetary balances are rejected", async () => {
  const client = new GramixClient("key", {
    fetch: async () => jsonResponse(200, { gram: "NaN", usdt: "0.0000" }),
  });
  await assert.rejects(client.getBalance(), GramixInvalidResponseError);
});

test("malformed order quantities are rejected", async () => {
  const client = new GramixClient("key", {
    fetch: async () =>
      jsonResponse(200, {
        ...sampleOrder(),
        extraData: { quantityCoins: "100" },
      }),
  });
  await assert.rejects(
    client.getOrder(sampleOrder().id),
    GramixInvalidResponseError,
  );
});

test("negative pagination in responses is rejected", async () => {
  const client = new GramixClient("key", {
    fetch: async () =>
      jsonResponse(200, { data: [], total: -1, limit: 20, offset: 0 }),
  });
  await assert.rejects(client.listOrders(), GramixInvalidResponseError);
});

for (const [status, body, ErrorType] of [
  [200, "<html>broken</html>", GramixInvalidResponseError],
  [502, "<html>gateway</html>", GramixApiError],
  [200, "null", GramixInvalidResponseError],
  [500, "[]", GramixApiError],
  [200, '{"data":{}}', GramixInvalidResponseError],
  [200, '{"statusCode":200,"data":null}', GramixInvalidResponseError],
]) {
  test(`HTTP ${status} with ${body} produces ${ErrorType.name}`, async () => {
    const client = new GramixClient("key", {
      fetch: async () => new Response(body, { status }),
    });
    await assert.rejects(client.getBalance(), (error) => {
      assert.ok(error instanceof ErrorType);
      assert.equal(error.httpStatus, status);
      assert.equal(error.rawBody, body);
      return true;
    });
  });
}

test("pre-aborted requests never reach fetch", async () => {
  let calls = 0;
  const reason = new Error("canceled by caller");
  const client = new GramixClient("key", {
    fetch: async () => {
      calls++;
      return jsonResponse(200, {});
    },
  });
  await assert.rejects(
    client.getBalance({ signal: AbortSignal.abort(reason) }),
    (error) => {
      assert.ok(error instanceof GramixTransportError);
      assert.equal(error.cause, reason);
      return true;
    },
  );
  assert.equal(calls, 0);
});

test("failed purchases are not retried automatically", async () => {
  let calls = 0;
  const reason = new Error("connection reset");
  const client = new GramixClient("key", {
    fetch: async () => {
      calls++;
      throw reason;
    },
  });
  await assert.rejects(
    client.purchaseGram(
      { recipientName: "telegram_user", paymentCurrency: "gram", gram: 1 },
      "gram_test_0001",
    ),
    (error) => {
      assert.ok(error instanceof GramixTransportError);
      assert.equal(error.cause, reason);
      return true;
    },
  );
  assert.equal(calls, 1);
});

for (const gram of [1, 10_000]) {
  test(`GRAM accepts integer boundary ${gram}`, async () => {
    const client = new GramixClient("key", {
      fetch: async (_url, init) => {
        assert.deepEqual(JSON.parse(init.body), {
          recipientName: "telegram_user",
          paymentCurrency: "gram",
          gram,
        });
        return jsonResponse(201, {
          orderId: sampleOrder().id,
          status: "processing",
          idempotencyKey: "gram_test_0001",
        });
      },
    });
    await client.purchaseGram(
      { recipientName: "telegram_user", paymentCurrency: "gram", gram },
      "gram_test_0001",
    );
  });
}

for (const patch of [
  { amount: "NaN" },
  { createdAt: "yesterday" },
  { processingStatus: "unknown" },
]) {
  test(`webhook rejects invalid ${Object.keys(patch)[0]}`, () => {
    assert.throws(
      () =>
        parseWebhookEvent({
          ...sampleOrder(),
          orderId: sampleOrder().id,
          event: "order.completed",
          ...patch,
        }),
      TypeError,
    );
  });
}

const ADS_ACCOUNT_ID =
  "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdEfGhIjKlMnOpQrStUvWxYz";

function sampleAdvertisementOrder() {
  return {
    ...sampleOrder(),
    type: "advertisement",
    currency: "gram",
    amount: "25.0000",
    recipientName: ADS_ACCOUNT_ID,
    extraData: { quantityGrams: 25 },
    idempotencyKey: "ads_test_0001",
  };
}

test("checkAdvertisement sends the documented request without idempotency key", async () => {
  const calls = [];
  const client = new GramixClient("test-key", {
    baseUrl: "https://example.test/api/v1",
    fetch: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(201, {
        isValid: true,
        message: "OK",
        minAmount: 20,
      });
    },
  });
  const result = await client.checkAdvertisement({
    adsAccountId: ADS_ACCOUNT_ID,
    amount: 25,
  });

  assert.deepEqual(result, { isValid: true, message: "OK", minAmount: 20 });
  assert.equal(
    calls[0].url,
    "https://example.test/api/v1/purchase/advertisement/check",
  );
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["x-api-key"], "test-key");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.equal(Object.hasOwn(calls[0].init.headers, "idempotency-key"), false);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    adsAccountId: ADS_ACCOUNT_ID,
    amount: 25,
  });
});

for (const [name, data] of [
  [
    "below minimum",
    {
      isValid: false,
      message: "Minimum top-up amount is 20 GRAM",
      minAmount: 20,
      code: "ADVERTISEMENT_AMOUNT_BELOW_MINIMUM_TWENTY",
    },
  ],
  [
    "without optional fields",
    { isValid: false, message: "Advertisement account cannot be recharged" },
  ],
  [
    "with an unknown code",
    { isValid: false, message: "Not allowed", code: "SOME_FUTURE_CODE" },
  ],
]) {
  test(`checkAdvertisement parses a response ${name}`, async () => {
    const client = new GramixClient("key", {
      fetch: async () => jsonResponse(201, data),
    });
    const result = await client.checkAdvertisement({
      adsAccountId: ADS_ACCOUNT_ID,
      amount: 10,
    });
    assert.deepEqual(result, data);
  });
}

for (const data of [
  { message: "OK" },
  { isValid: "true", message: "OK" },
  { isValid: true },
  { isValid: true, message: "OK", minAmount: 2.5 },
  { isValid: true, message: "OK", code: 5 },
]) {
  test(`checkAdvertisement rejects invalid response ${JSON.stringify(data)}`, async () => {
    const client = new GramixClient("key", {
      fetch: async () => jsonResponse(201, data),
    });
    await assert.rejects(
      client.checkAdvertisement({ adsAccountId: ADS_ACCOUNT_ID, amount: 20 }),
      GramixInvalidResponseError,
    );
  });
}

test("purchaseAdvertisement builds the documented request", async () => {
  const calls = [];
  const client = new GramixClient("test-key", {
    baseUrl: "https://example.test/api/v1",
    fetch: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(201, {
        orderId: "7ba77616-7706-4215-9e6f-b6c67e4df292",
        status: "processing",
        idempotencyKey: "ads_test_0001",
      });
    },
  });
  const adsAccountId =
    "0a30XEfiw4DJ3GUCaVpgcQr71-_zjpIVzevDuJ9DCB6kCEwof3pVjNXEmlUoOECl";
  const result = await client.purchaseAdvertisement(
    { adsAccountId, paymentCurrency: "usdt", amount: 10_000 },
    "ads_test_0001",
  );

  assert.equal(result.status, "processing");
  assert.equal(
    calls[0].url,
    "https://example.test/api/v1/purchase/advertisement",
  );
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["x-api-key"], "test-key");
  assert.equal(calls[0].init.headers["idempotency-key"], "ads_test_0001");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    adsAccountId,
    paymentCurrency: "usdt",
    amount: 10_000,
  });
});

for (const [name, patch, ErrorType] of [
  ["short ID", { adsAccountId: "short_id" }, TypeError],
  ["invalid character", { adsAccountId: "a".repeat(63) + "!" }, TypeError],
  ["65-character ID", { adsAccountId: ADS_ACCOUNT_ID + "a" }, TypeError],
  ["non-string ID", { adsAccountId: 123 }, TypeError],
  [
    "repeated run",
    { adsAccountId: "AAAAAAAAA" + ADS_ACCOUNT_ID.slice(9) },
    TypeError,
  ],
  ["decimal amount", { amount: 2.5 }, RangeError],
  ["zero amount", { amount: 0 }, RangeError],
  ["amount above maximum", { amount: 10_001 }, RangeError],
  ["string amount", { amount: "20" }, RangeError],
  ["bad currency", { paymentCurrency: "usd" }, TypeError],
]) {
  test(`advertisement rejects ${name} locally`, () => {
    const client = new GramixClient("key", {
      fetch: async () => {
        throw new Error("must not be called");
      },
    });
    const input = {
      adsAccountId: ADS_ACCOUNT_ID,
      paymentCurrency: "gram",
      amount: 20,
      ...patch,
    };
    assert.throws(
      () => client.purchaseAdvertisement(input, "ads_test_0001"),
      ErrorType,
    );
    if (!Object.hasOwn(patch, "paymentCurrency")) {
      assert.throws(
        () =>
          client.checkAdvertisement({
            adsAccountId: input.adsAccountId,
            amount: input.amount,
          }),
        ErrorType,
      );
    }
  });
}

test("advertisement purchase requires a valid idempotency key", () => {
  const client = new GramixClient("key", {
    fetch: async () => jsonResponse(201, {}),
  });
  assert.throws(
    () =>
      client.purchaseAdvertisement(
        { adsAccountId: ADS_ACCOUNT_ID, paymentCurrency: "gram", amount: 20 },
        "short",
      ),
    TypeError,
  );
});

test("advertisement orders keep the case-sensitive ads account ID", async () => {
  const client = new GramixClient("key", {
    fetch: async (url) =>
      url.includes("/orders?")
        ? jsonResponse(200, {
            data: [sampleAdvertisementOrder(), sampleOrder()],
            total: 2,
            limit: 20,
            offset: 0,
          })
        : jsonResponse(200, sampleAdvertisementOrder()),
  });
  const order = await client.getOrder(sampleOrder().id);
  assert.equal(order.type, "advertisement");
  assert.equal(order.recipientName, ADS_ACCOUNT_ID);
  assert.deepEqual(order.extraData, { quantityGrams: 25 });
  const page = await client.listOrders();
  assert.equal(page.data[0].recipientName, ADS_ACCOUNT_ID);
  assert.equal(page.data[1].recipientName, "telegram_user");
});

for (const patch of [
  { extraData: { quantityGrams: "25" } },
  { recipientName: "telegram_user" },
  { recipientName: ADS_ACCOUNT_ID.slice(1) },
]) {
  test(`advertisement order rejects invalid ${JSON.stringify(patch)}`, async () => {
    const client = new GramixClient("key", {
      fetch: async () =>
        jsonResponse(200, { ...sampleAdvertisementOrder(), ...patch }),
    });
    await assert.rejects(
      client.getOrder(sampleOrder().id),
      GramixInvalidResponseError,
    );
  });
}

test("non-advertisement orders still require Telegram usernames", async () => {
  const client = new GramixClient("key", {
    fetch: async () =>
      jsonResponse(200, { ...sampleOrder(), recipientName: ADS_ACCOUNT_ID }),
  });
  await assert.rejects(
    client.getOrder(sampleOrder().id),
    GramixInvalidResponseError,
  );
});

test("webhook parser accepts advertisement orders", () => {
  const event = parseWebhookEvent({
    event: "order.failed",
    orderId: "7ba77616-7706-4215-9e6f-b6c67e4df292",
    status: "failed",
    processingStatus: "failure_fragment_purchase",
    type: "advertisement",
    amount: "25.0000",
    currency: "gram",
    recipientName: ADS_ACCOUNT_ID,
    createdAt: "2026-11-09T10:20:30.000Z",
  });
  assert.equal(event.type, "advertisement");
  assert.equal(event.recipientName, ADS_ACCOUNT_ID);
  assert.throws(
    () => parseWebhookEvent({ ...event, type: "stars", status: "failed" }),
    TypeError,
  );
});
