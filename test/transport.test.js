import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { GramixClient, GramixTransportError } from "../dist/index.js";

async function server(t, handler) {
  const instance = createServer(handler);
  instance.listen(0, "127.0.0.1");
  await once(instance, "listening");
  t.after(
    () =>
      new Promise((resolve, reject) => {
        instance.close((error) => (error ? reject(error) : resolve()));
        instance.closeAllConnections();
      }),
  );
  return `http://127.0.0.1:${instance.address().port}/api/v1`;
}

test("real HTTP sends authentication, routes and JSON purchase body", async (t) => {
  let received;
  const baseUrl = await server(t, async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    received = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: JSON.parse(body),
    };
    res.writeHead(201, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        statusCode: 201,
        data: {
          orderId: "7ba77616-7706-4215-9e6f-b6c67e4df292",
          status: "processing",
          idempotencyKey: "gram_test_0001",
        },
      }),
    );
  });
  const client = new GramixClient("test-secret", { baseUrl });
  const purchase = await client.purchaseGram(
    { recipientName: "telegram_user", paymentCurrency: "gram", gram: 2 },
    "gram_test_0001",
  );
  assert.equal(purchase.status, "processing");
  assert.equal(received.method, "POST");
  assert.equal(received.url, "/api/v1/purchase/gram");
  assert.equal(received.headers["x-api-key"], "test-secret");
  assert.equal(received.headers["idempotency-key"], "gram_test_0001");
  assert.equal(received.headers["content-type"], "application/json");
  assert.deepEqual(received.body, {
    recipientName: "telegram_user",
    paymentCurrency: "gram",
    gram: 2,
  });
});

test("redirects cannot forward the API key", async (t) => {
  let destinationCalls = 0;
  const destination = await server(t, (_req, res) => {
    destinationCalls++;
    res.end();
  });
  const baseUrl = await server(t, (_req, res) => {
    res.writeHead(307, { Location: destination });
    res.end();
  });
  await assert.rejects(
    new GramixClient("test-secret", { baseUrl }).getBalance(),
    GramixTransportError,
  );
  assert.equal(destinationCalls, 0);
});

test("timeout covers a response body that never finishes", async (t) => {
  const baseUrl = await server(t, (_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write('{"statusCode":200,');
  });
  await assert.rejects(
    new GramixClient("key", { baseUrl, timeout: 100 }).getBalance(),
    GramixTransportError,
  );
});

test("caller cancellation interrupts an in-flight HTTP request", async (t) => {
  const controller = new AbortController();
  const reason = new Error("caller stopped waiting");
  const baseUrl = await server(t, () => controller.abort(reason));
  await assert.rejects(
    new GramixClient("key", { baseUrl }).getBalance({
      signal: controller.signal,
    }),
    (error) => {
      assert.ok(error instanceof GramixTransportError);
      assert.equal(error.cause, reason);
      return true;
    },
  );
});
