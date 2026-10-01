# GitHub and npm publication

This directory is the root of a standalone Node.js repository. Upload its contents,
including `.github/`, rather than the parent integrations directory; GitHub only
loads workflows from the repository root.

## Prepare GitHub

1. Target repository: https://github.com/gramix-io/gramix-node-sdk. Before the
   first push, check whether it already contains commits; if so, clone it and
   integrate these files with its history instead of force-pushing.
2. `repository` and `bugs` in `package.json` point to this repository.
   `homepage` points to the API documentation.
3. Review the license with the rights holder. `UNLICENSED` is intentional and
   does not grant open-source usage rights. Do not add an arbitrary license.
4. Run `npm ci`, `npm run verify`, and `npm pack --dry-run`.
5. If the remote repository is empty, initialize and inspect the first commit
   from this directory:

   ```bash
   git init -b main
   git add .
   git diff --cached --stat
   git diff --cached
   git commit -m "Prepare Gramix Node.js SDK"
   git remote add origin https://github.com/gramix-io/gramix-node-sdk.git
   git push -u origin main
   ```

   Review staged files for secrets before committing. Build outputs, dependencies, environment files,
   local npm configuration, logs, and package archives are ignored.

6. Wait for CI on Node.js 22 and 24. Protect `main` with required passing CI and
   pull-request review. Enable private vulnerability reporting in repository
   settings if available. Dependabot updates npm dependencies and GitHub Actions.

## Prepare an npm release

Target package: `gramix-api`. Verify ownership or availability on npm before
publishing. Keep the version in `package.json`, `package-lock.json`, the client
User-Agent, and `CHANGELOG.md` consistent. Move Unreleased notes into the release
section, then run `npm run verify` and inspect `npm pack --dry-run`.

The package archive must contain only the built `dist/`, package metadata,
README, changelog, and any approved license. Do not publish keys or tokens.

`publishConfig.provenance` expects a supported CI publishing environment.
Configure npm Trusted Publishing against the final GitHub repository and a
reviewed release workflow before publishing with provenance. The included CI
workflow validates changes and does not publish to npm.

After publication, install the exact released version in a clean project and
verify ESM imports and TypeScript compilation. Tag the verified release with its
package version (for example, `v1.0.0`).
