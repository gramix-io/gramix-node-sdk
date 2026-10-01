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
  await client.listOrders({ limit: 100, offset: 10 });
  await client.getOrder("f47ac10b-58cc-4372-a567-0e02b2c3d479");

  assert.deepEqual(routes, [
    ["GET", "https://example.test/api/v1/wallets/balance"],
    ["POST", "https://example.test/api/v1/wallets/balance"],
    ["POST", "https://example.test/api/v1/purchase/stars"],
    ["POST", "https://example.test/api/v1/purchase/premium/6"],
    ["POST", "https://example.test/api/v1/purchase/gram"],
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
