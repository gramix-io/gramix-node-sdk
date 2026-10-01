import {
  GramixClient,
  GramixInvalidResponseError,
  type Order,
  type OrderList,
  type PurchaseResponse,
  type WalletBalance,
  type WebhookEvent,
  parseWebhookEvent,
} from "../src/index.js";

const client = new GramixClient("test-key");

const balance: Promise<WalletBalance> = client.getBalance();
const purchase: Promise<PurchaseResponse> = client.purchaseStars(
  {
    recipientName: "telegram_user",
    paymentCurrency: "usdt",
    stars: 500,
  },
  "stars_types_0001",
);
const orders: Promise<OrderList> = client.listOrders({ limit: 20, offset: 0 });
const order: Promise<Order> = client.getOrder(
  "f47ac10b-58cc-4372-a567-0e02b2c3d479",
);
const event: WebhookEvent = parseWebhookEvent({});

void balance;
void purchase;
void orders;
void order;
void event;
void GramixInvalidResponseError;

client.purchaseGram(
  { recipientName: "telegram_user", paymentCurrency: "gram", gram: 1 },
  "gram_types_0001",
);
client.purchaseGram(
  // @ts-expect-error GRAM purchases cannot use USDT.
  { recipientName: "telegram_user", paymentCurrency: "usdt", gram: 1 },
  "gram_types_0001",
);
client.purchasePremium(
  // @ts-expect-error Premium supports only 3, 6 and 12 months.
  { recipientName: "telegram_user", paymentCurrency: "gram", duration: 4 },
  "premium_types_0001",
);
client.purchaseStars(
  // @ts-expect-error Stars quantity must be numeric.
  { recipientName: "telegram_user", paymentCurrency: "usdt", stars: "50" },
  "stars_types_0001",
);
if (event.event === "order.completed") {
  const status: "completed" = event.status;
  void status;
}
// @ts-expect-error Webhook event and status must agree.
const invalidEvent: WebhookEvent = {
  ...event,
  event: "order.completed",
  status: "failed",
};
void invalidEvent;
