# Changelog

All notable changes to this package will be documented here.

## Unreleased

- Move implementation to strict TypeScript and generate declarations during build.
- Separate endpoint logic, HTTP transport, validation and public error types.
- Correct GRAM purchases to use only GRAM currency and integer quantities.
- Validate monetary values, pagination, quantities, timestamps and response envelopes.
- Reject redirects, bound timeouts and preserve cancellation causes.
- Add regression tests, local HTTP tests, formatting checks and packaged-consumer verification.
- Preserve package-root ESM imports; replace direct source imports with the public package entry.

## 1.0.0 - 2026-07-29

- Implement all seven Gramix API v1 endpoints.
- Add request validation, request cancellation, timeouts, and typed errors.
- Ship TypeScript declarations, validate documented response schemas, and
  parse order webhook payloads.
