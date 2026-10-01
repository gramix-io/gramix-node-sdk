# Development

Use Node.js 22 or newer. Clone the repository, then run:

```bash
npm ci
npm run verify
```

`verify` checks formatting, strict TypeScript, tests, and the installed npm
archive. Tests use mock responses and local HTTP servers; no account or API key
is required. Local firewall or sandbox settings must allow loopback sockets.

Edit `src/`, never generated `dist/`. Run `npm run format` after editing. Add a
regression test for behavior changes and update `CHANGELOG.md` for public API
changes. Keep endpoint rules aligned with the official API documentation.

Do not include credentials or customer payloads in commits, issues, or test
fixtures. Include reproduction steps and the Node.js version in bug reports.

The package currently declares `UNLICENSED`. Repository visibility does not grant
an open-source license; the rights holder must decide licensing before accepting
external contributions or distributing under different terms.
