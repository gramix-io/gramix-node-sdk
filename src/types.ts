export type PaymentCurrency = "gram" | "usdt";
export type OrderStatus =
  "created" | "processing" | "completed" | "failed" | "canceled";
export type ProcessingStatus =
  | "pending_processing"
  | "payment_verified"
  | "completed_fragment_purchase"
  | "failure_verify_payment"
  | "failure_fragment_purchase"
  | "retrying_fragment_purchase";
export type OrderType =
  | "stars"
  | "gram_coins"
  | "premium_3_month"
  | "premium_6_month"
  | "premium_12_month";

export interface WalletBalance {
  gram: string;
  usdt: string;
}

export interface DepositDetails {
  address: string;
  memo: string;
}

export interface PurchaseResponse {
  orderId: string;
  status: OrderStatus;
  idempotencyKey: string;
}

export interface Order {
  id: string;
  type: OrderType;
  method: "api";
  currency: "gram" | "usd";
  amount: string;
  status: OrderStatus;
  processingStatus: ProcessingStatus;
  recipientName: string;
  extraData: { quantityStars?: number; quantityCoins?: number } | null;
  transactionHash: string | null;
  idempotencyKey: string | null;
  createdAt: string;
}

export interface OrderList {
  data: Order[];
  total: number;
  limit: number;
  offset: number;
}

interface WebhookBase {
  orderId: string;
  processingStatus: ProcessingStatus;
  type: "stars" | "gram" | `premium_${string}`;
  amount: string;
  currency: "gram" | "usd";
  recipientName: string;
  createdAt: string;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface GramixClientOptions {
  baseUrl?: string;
  timeout?: number;
  fetch?: typeof globalThis.fetch;
}

export type WebhookEvent = WebhookBase &
  (
    | { event: "order.completed"; status: "completed" }
    | { event: "order.failed"; status: "failed" }
  );

export interface PurchaseInput {
  recipientName: string;
  paymentCurrency: PaymentCurrency;
}
export interface StarsPurchaseInput extends PurchaseInput {
  stars: number;
}
export interface PremiumPurchaseInput extends PurchaseInput {
  duration: 3 | 6 | 12;
}
export interface GramPurchaseInput extends PurchaseInput {
  paymentCurrency: "gram";
  gram: number;
}
export interface ListOrdersOptions extends RequestOptions {
  limit?: number;
  offset?: number;
}
