import { HttpTransport } from "./transport.js";
import type {
  GramixClientOptions,
  GramPurchaseInput,
  ListOrdersOptions,
  PremiumPurchaseInput,
  RequestOptions,
  StarsPurchaseInput,
} from "./types.js";
import {
  depositDetails,
  integer,
  object,
  order,
  orderId,
  orderList,
  purchaseResponse,
  validatePurchase,
  walletBalance,
} from "./validation.js";

/** Gramix API v1 client. Methods return the validated response's data field. */
export class GramixClient {
  readonly #transport: HttpTransport;

  constructor(apiKey: string, options?: GramixClientOptions) {
    this.#transport = new HttpTransport(apiKey, options);
  }

  getBalance(options?: RequestOptions) {
    return this.#transport.request({
      method: "GET",
      path: "/wallets/balance",
      signal: options?.signal,
      parse: walletBalance,
    });
  }

  getDepositDetails(options?: RequestOptions) {
    return this.#transport.request({
      method: "POST",
      path: "/wallets/balance",
      signal: options?.signal,
      parse: depositDetails,
    });
  }

  purchaseStars(
    input: StarsPurchaseInput,
    idempotencyKey: string,
    options?: RequestOptions,
  ) {
    object(input, "Stars purchase input");
    const { recipientName, paymentCurrency, stars } = input;
    validatePurchase(recipientName, paymentCurrency, idempotencyKey);
    integer(stars, 50, 1_000_000, "Stars");
    return this.#purchase(
      "/purchase/stars",
      { recipientName, paymentCurrency, stars },
      idempotencyKey,
      options,
    );
  }

  purchasePremium(
    input: PremiumPurchaseInput,
    idempotencyKey: string,
    options?: RequestOptions,
  ) {
    object(input, "Premium purchase input");
    const { recipientName, paymentCurrency, duration } = input;
    validatePurchase(recipientName, paymentCurrency, idempotencyKey);
    if (![3, 6, 12].includes(duration))
      throw new RangeError("Premium duration must be 3, 6, or 12 months.");
    return this.#purchase(
      `/purchase/premium/${duration}`,
      { recipientName, paymentCurrency },
      idempotencyKey,
      options,
    );
  }

  purchaseGram(
    input: GramPurchaseInput,
    idempotencyKey: string,
    options?: RequestOptions,
  ) {
    object(input, "GRAM purchase input");
    const { recipientName, paymentCurrency, gram } = input;
    validatePurchase(recipientName, paymentCurrency, idempotencyKey);
    if (paymentCurrency !== "gram")
      throw new TypeError('GRAM purchases require paymentCurrency "gram".');
    integer(gram, 1, 10_000, "GRAM amount");
    return this.#purchase(
      "/purchase/gram",
      { recipientName, paymentCurrency, gram },
      idempotencyKey,
      options,
    );
  }

  listOrders({ limit = 20, offset = 0, signal }: ListOrdersOptions = {}) {
    integer(limit, 1, 100, "Limit");
    integer(offset, 0, Number.MAX_SAFE_INTEGER, "Offset");
    const query = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    return this.#transport.request({
      method: "GET",
      path: `/orders?${query}`,
      signal,
      parse: orderList,
    });
  }

  getOrder(id: string, options?: RequestOptions) {
    orderId(id);
    return this.#transport.request({
      method: "GET",
      path: `/orders/${encodeURIComponent(id)}`,
      signal: options?.signal,
      parse: order,
    });
  }

  #purchase(
    path: string,
    body: object,
    idempotencyKey: string,
    options?: RequestOptions,
  ) {
    return this.#transport.request({
      method: "POST",
      path,
      body,
      idempotencyKey,
      signal: options?.signal,
      parse: purchaseResponse,
    });
  }
}
