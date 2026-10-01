import {
  GramixApiError,
  GramixError,
  GramixInvalidResponseError,
  GramixTransportError,
} from "./errors.js";
import type { GramixClientOptions } from "./types.js";
import { integer, object } from "./validation.js";

interface Request<T> {
  method: "GET" | "POST";
  path: string;
  parse: (value: unknown) => T;
  body?: object;
  idempotencyKey?: string;
  signal?: AbortSignal | undefined;
}

/** Owns HTTP, cancellation and response envelopes; endpoint policy stays in the client. */
export class HttpTransport {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #timeout: number;
  readonly #fetch: typeof globalThis.fetch;

  constructor(apiKey: string, options: GramixClientOptions = {}) {
    const {
      baseUrl = "https://api.gramix.io/api/v1",
      timeout = 30_000,
      fetch = globalThis.fetch,
    } = options;
    if (
      typeof apiKey !== "string" ||
      !apiKey.trim() ||
      /[^\x20-\x7e]/.test(apiKey)
    ) {
      throw new TypeError(
        "API key must be a non-empty printable ASCII string.",
      );
    }
    let url: URL;
    try {
      if (typeof baseUrl !== "string" || baseUrl !== baseUrl.trim())
        throw new TypeError();
      url = new URL(baseUrl);
    } catch {
      throw new TypeError("Base URL must be an absolute HTTP(S) URL.");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new TypeError(
        "Base URL must use HTTP(S) without credentials, query, or fragment.",
      );
    }
    integer(timeout, 1, 2_147_483_647, "Timeout");
    if (typeof fetch !== "function")
      throw new TypeError("A fetch implementation is required.");
    this.#apiKey = apiKey;
    this.#baseUrl = url.href.replace(/\/+$/, "");
    this.#timeout = timeout;
    this.#fetch = fetch;
  }

  async request<T>({
    method,
    path,
    body,
    idempotencyKey,
    signal: callerSignal,
    parse,
  }: Request<T>): Promise<T> {
    // Construct the combined signal before allocating a timer so invalid signals cannot leak it.
    const controller = new AbortController();
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, controller.signal])
      : controller.signal;
    const timer = setTimeout(
      () => controller.abort(new Error("Request timed out.")),
      this.#timeout,
    );
    const headers: Record<string, string> = {
      Accept: "application/json",
      "x-api-key": this.#apiKey,
      "User-Agent": "gramix-node/1.0.0",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (idempotencyKey !== undefined)
      headers["idempotency-key"] = idempotencyKey;
    try {
      signal.throwIfAborted();
      const response = await this.#fetch(this.#baseUrl + path, {
        method,
        headers,
        signal,
        // Never forward the API key to a redirect destination or replay a purchase there.
        redirect: "error",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const rawBody = await response.text();
      signal.throwIfAborted();
      const details = { httpStatus: response.status, rawBody };
      let payload: unknown;
      try {
        payload = JSON.parse(rawBody) as unknown;
      } catch (cause) {
        const ErrorType = response.ok
          ? GramixInvalidResponseError
          : GramixApiError;
        throw new ErrorType(
          `Gramix API returned invalid JSON (HTTP ${response.status}).`,
          { ...details, cause },
        );
      }
      let envelope: Record<string, unknown>;
      try {
        envelope = object(payload, "Response");
      } catch (cause) {
        const ErrorType = response.ok
          ? GramixInvalidResponseError
          : GramixApiError;
        throw new ErrorType(
          `Gramix API returned an invalid envelope (HTTP ${response.status}).`,
          { ...details, response: payload, cause },
        );
      }
      const apiStatusCode =
        typeof envelope.statusCode === "number" &&
        Number.isInteger(envelope.statusCode)
          ? envelope.statusCode
          : undefined;
      if (!response.ok) {
        throw new GramixApiError(
          typeof envelope.message === "string"
            ? envelope.message
            : `Gramix API request failed with HTTP ${response.status}.`,
          {
            ...details,
            response: payload,
            ...(apiStatusCode === undefined ? {} : { apiStatusCode }),
          },
        );
      }
      if (apiStatusCode !== response.status) {
        throw new GramixInvalidResponseError(
          "Gramix API statusCode must match the HTTP status.",
          { ...details, response: payload },
        );
      }
      try {
        return parse(envelope.data);
      } catch (cause) {
        throw new GramixInvalidResponseError(
          `Gramix API returned invalid data: ${cause instanceof Error ? cause.message : "validation failed"}`,
          { ...details, response: payload, cause },
        );
      }
    } catch (cause) {
      if (cause instanceof GramixError) throw cause;
      throw new GramixTransportError(
        "Gramix API request failed, timed out, or was canceled.",
        { cause },
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
