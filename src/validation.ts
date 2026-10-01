import type {
  DepositDetails,
  Order,
  OrderList,
  PurchaseResponse,
  WalletBalance,
  WebhookEvent,
} from "./types.js";

const RECIPIENT = /^[a-z][a-z0-9_]{4,31}$/;
const IDEMPOTENCY = /^[A-Za-z0-9_-]{8,64}$/;
// Accept RFC UUID versions, including newer time-ordered UUIDs.
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY = /^\d+\.\d{4}$/;
const ORDER_STATUSES = [
  "created",
  "processing",
  "completed",
  "failed",
  "canceled",
] as const;
const ORDER_TYPES = [
  "stars",
  "gram_coins",
  "premium_3_month",
  "premium_6_month",
  "premium_12_month",
] as const;
const PROCESSING_STATUSES = [
  "pending_processing",
  "payment_verified",
  "completed_fragment_purchase",
  "failure_verify_payment",
  "failure_fragment_purchase",
  "retrying_fragment_purchase",
] as const;

export function object(
  value: unknown,
  name = "Input",
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, name: string, pattern?: RegExp): string {
  if (typeof value !== "string" || (pattern && !pattern.test(value))) {
    throw new TypeError(
      `${name} must be a valid string${pattern ? ` matching ${pattern}` : ""}.`,
    );
  }
  return value;
}

function choice<const T extends readonly string[]>(
  value: unknown,
  values: T,
  name: string,
): T[number] {
  if (typeof value !== "string" || !values.includes(value)) {
    throw new TypeError(`${name} must be one of: ${values.join(", ")}.`);
  }
  return value;
}

export function integer(
  value: unknown,
  min: number,
  max: number,
  name: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new RangeError(
      `${name} must be an integer between ${min} and ${max}.`,
    );
  }
  return value;
}

export function orderId(value: unknown): string {
  return string(value, "Order ID", UUID);
}

export function validatePurchase(
  recipient: unknown,
  currency: unknown,
  key: unknown,
): void {
  string(recipient, "Recipient name", RECIPIENT);
  choice(currency, ["gram", "usdt"], "Payment currency");
  string(key, "Idempotency key", IDEMPOTENCY);
}

function timestamp(value: unknown): string {
  const text = string(
    value,
    "createdAt",
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
  );
  if (!Number.isFinite(Date.parse(text)))
    throw new TypeError("createdAt must be an ISO 8601 timestamp.");
  return text;
}

export function walletBalance(value: unknown): WalletBalance {
  const data = object(value);
  return {
    gram: string(data.gram, "gram", MONEY),
    usdt: string(data.usdt, "usdt", MONEY),
  };
}

export function depositDetails(value: unknown): DepositDetails {
  const data = object(value);
  return {
    address: string(data.address, "address", /\S/),
    memo: string(data.memo, "memo", /\S/),
  };
}

export function purchaseResponse(value: unknown): PurchaseResponse {
  const data = object(value);
  return {
    orderId: orderId(data.orderId),
    status: choice(data.status, ORDER_STATUSES, "status"),
    idempotencyKey: string(data.idempotencyKey, "idempotencyKey", IDEMPOTENCY),
  };
}

function nullableString(value: unknown, name: string): string | null {
  return value === null ? null : string(value, name);
}

function extraData(value: unknown): Order["extraData"] {
  if (value === null) return null;
  const data = object(value, "extraData");
  const result: NonNullable<Order["extraData"]> = {};
  for (const key of ["quantityStars", "quantityCoins"] as const) {
    if (Object.hasOwn(data, key))
      result[key] = integer(data[key], 0, Number.MAX_SAFE_INTEGER, key);
  }
  return result;
}

function orderFields(data: Record<string, unknown>) {
  return {
    currency: choice(data.currency, ["gram", "usd"], "currency"),
    amount: string(data.amount, "amount", MONEY),
    processingStatus: choice(
      data.processingStatus,
      PROCESSING_STATUSES,
      "processingStatus",
    ),
    recipientName: string(data.recipientName, "recipientName", RECIPIENT),
    createdAt: timestamp(data.createdAt),
  };
}

export function order(value: unknown): Order {
  const data = object(value, "Order");
  return {
    ...orderFields(data),
    id: orderId(data.id),
    type: choice(data.type, ORDER_TYPES, "type"),
    method: choice(data.method, ["api"], "method"),
    status: choice(data.status, ORDER_STATUSES, "status"),
    extraData: extraData(data.extraData),
    transactionHash: nullableString(data.transactionHash, "transactionHash"),
    idempotencyKey:
      data.idempotencyKey === null
        ? null
        : string(data.idempotencyKey, "idempotencyKey", IDEMPOTENCY),
  };
}

export function orderList(value: unknown): OrderList {
  const data = object(value);
  if (!Array.isArray(data.data))
    throw new TypeError("Order list data must be an array.");
  return {
    data: data.data.map(order),
    total: integer(data.total, 0, Number.MAX_SAFE_INTEGER, "total"),
    limit: integer(data.limit, 1, 100, "limit"),
    offset: integer(data.offset, 0, Number.MAX_SAFE_INTEGER, "offset"),
  };
}

/** Validates shape only; the documented API does not specify a webhook signature. */
export function parseWebhookEvent(value: unknown): WebhookEvent {
  const data = object(value, "Webhook payload");
  const event = choice(
    data.event,
    ["order.completed", "order.failed"],
    "event",
  );
  const expected = event === "order.completed" ? "completed" : "failed";
  if (data.status !== expected)
    throw new TypeError("Webhook event and status do not match.");
  const type = string(data.type, "type");
  if (type !== "stars" && type !== "gram" && !type.startsWith("premium_")) {
    throw new TypeError("Webhook type is not recognized.");
  }
  const base = {
    ...orderFields(data),
    orderId: orderId(data.orderId),
    type: type as WebhookEvent["type"],
  };
  return event === "order.completed"
    ? { ...base, event, status: "completed" }
    : { ...base, event, status: "failed" };
}
