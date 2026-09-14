import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("build produces a deployable Sites artifact", async () => {
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/client/_headers", import.meta.url));

  const hosting = JSON.parse(
    await readFile(new URL("../dist/.openai/hosting.json", import.meta.url), "utf8"),
  );
  assert.equal(typeof hosting.project_id, "string");
  assert.ok(hosting.project_id.length > 0);
});

test("bid validation only selects columns present on public deals", async () => {
  const route = await readFile(
    new URL("../app/api/line-item-bids/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /const dealSelect = "deal_number,quantity,public_lines"/);
  assert.doesNotMatch(route, /dealSelect = .*owner_name/);
  assert.doesNotMatch(route, /dealSelect = .*owner_email/);
});
