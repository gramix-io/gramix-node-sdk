export interface ErrorDetails {
  httpStatus?: number;
  apiStatusCode?: number;
  response?: unknown;
  rawBody?: string;
  cause?: unknown;
}

export class GramixError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class GramixTransportError extends GramixError {}

class GramixResponseError extends GramixError {
  readonly httpStatus: number | undefined;
  readonly response: unknown;
  readonly rawBody: string | undefined;

  constructor(message: string, details: ErrorDetails = {}) {
    super(message, { cause: details.cause });
    this.httpStatus = details.httpStatus;
    this.response = details.response;
    this.rawBody = details.rawBody;
  }
}

export class GramixInvalidResponseError extends GramixResponseError {}

export class GramixApiError extends GramixResponseError {
  readonly apiStatusCode: number | undefined;

  constructor(message: string, details: ErrorDetails = {}) {
    super(message, details);
    this.apiStatusCode = details.apiStatusCode;
  }
}
