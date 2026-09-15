import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireNativeSession, requestNativeSession } from "./nativeSession.js";

const root = mkdtempSync(join(tmpdir(), "lumeria-session-test-"));
const location = { data: join(root, "data"), installationRoot: root };
mkdirSync(join(root, "other"));
let active = 0, refuseShutdown = true;
const owner = await acquireNativeSession(location);
assert.ok(owner);
try {
  owner.setHandlers({ activate() { active++; }, async shutdown() { if (refuseShutdown) throw new Error("Save failed"); } });
  assert.equal((await requestNativeSession(location, "status"))?.ready, true);
  assert.equal(await acquireNativeSession(location), null);
  assert.equal(active, 1);
  assert.equal(await acquireNativeSession(location, "login"), null);
  assert.equal(active, 1, "login startup must not activate an existing window");
  await assert.rejects(requestNativeSession({ ...location, installationRoot: join(root, "other") }, "shutdown"), /different Lumeria installation/);
  await assert.rejects(requestNativeSession(location, "shutdown"), /Save failed/);
  assert.equal((await requestNativeSession(location, "status"))?.closing, false);
  refuseShutdown = false;
  assert.equal((await requestNativeSession(location, "shutdown"))?.closing, true);
  await assert.rejects(requestNativeSession(location, "activate"), /already closing/);
} finally { await owner.dispose(); }
assert.equal(await requestNativeSession(location, "status"), null);
const next = await acquireNativeSession(location);
assert.ok(next, "a clean exit must release ownership");
await next.dispose();
rmSync(root, { recursive: true, force: true });
console.log("Native single instance and shutdown protocol passed");
