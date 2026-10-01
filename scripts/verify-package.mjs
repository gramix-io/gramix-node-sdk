import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporary = mkdtempSync(join(tmpdir(), "gramix-package-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
try {
  const result = JSON.parse(
    execFileSync(
      npm,
      ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary],
      { cwd: root, encoding: "utf8" },
    ),
  );
  writeFileSync(
    join(temporary, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  execFileSync(
    npm,
    [
      "install",
      "--offline",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--cache",
      join(temporary, "cache"),
      join(temporary, result[0].filename),
    ],
    { cwd: temporary, stdio: "pipe" },
  );
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import { GramixClient, GramixApiError, GramixError, GramixInvalidResponseError, parseWebhookEvent } from 'gramix-api';
    assert.equal(typeof GramixClient, 'function');
    assert.equal(typeof parseWebhookEvent, 'function');
    assert.ok(new GramixApiError('test') instanceof GramixError);
    assert.ok(!(new GramixApiError('test') instanceof GramixInvalidResponseError));
    const client = new GramixClient('test-key', { fetch: async () => new Response(JSON.stringify({ statusCode: 200, data: { gram: '1.0000', usdt: '2.0000' } })) });
    assert.deepEqual(await client.getBalance(), { gram: '1.0000', usdt: '2.0000' });
  `,
    ],
    { cwd: temporary, stdio: "inherit" },
  );
  const consumer = readFileSync(
    join(root, "types/consumer.ts"),
    "utf8",
  ).replace("../src/index.js", "gramix-api");
  writeFileSync(join(temporary, "consumer.ts"), consumer);
  writeFileSync(
    join(temporary, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        exactOptionalPropertyTypes: true,
        noEmit: true,
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        lib: ["ES2022", "DOM", "DOM.Iterable"],
      },
      include: ["consumer.ts"],
    }),
  );
  execFileSync(
    process.execPath,
    [
      join(root, "node_modules/typescript/bin/tsc"),
      "-p",
      join(temporary, "tsconfig.json"),
    ],
    { cwd: temporary, stdio: "inherit" },
  );
  console.log(
    "Packed consumer passed: ESM, request execution, generated types and invalid-input type checks.",
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
