import test from "node:test";
import assert from "node:assert/strict";
import {
  SaveStore,
  newProgress,
  encodeSave,
  decodeSave,
  SAVE_KEY,
  setFlag,
} from "../src/save.js";
import { memoryStorage } from "./helpers.js";
test("save round trip preserves progression, exploration, checkpoint and settings", () => {
  const p = newProgress();
  setFlag(p, "ability.dash");
  p.visited.push("P04");
  p.settings.assist = true;
  p.lastRest = { roomId: "P02", spawnPointId: "rest.rest.pier" };
  assert.deepEqual(decodeSave(encodeSave(p)), p);
});
test("truncated, tampered and incompatible saves are rejected", () => {
  const good = encodeSave(newProgress());
  assert.equal(decodeSave(good.slice(0, -5)), null);
  assert.equal(decodeSave(good.replace("P01", "P99")), null);
  assert.equal(decodeSave('{"version":99}'), null);
});
test("an interrupted primary write recovers the last valid backup", () => {
  const storage = memoryStorage(),
    messages = [],
    store = new SaveStore(storage, (t, e) => messages.push([t, e]));
  const p = newProgress();
  store.write(p);
  setFlag(p, "ability.dash");
  store.write(p);
  storage.setItem(SAVE_KEY, '{"partial":');
  const loaded = store.load();
  assert.equal(loaded.lastRest.roomId, "P01");
  assert.equal(loaded.flags.includes("ability.dash"), false);
  assert.ok(messages.some(([, e]) => e));
});
test("write failure reports an error while preserving the previous valid record", () => {
  const storage = memoryStorage(),
    messages = [],
    store = new SaveStore(storage, (t, e) => messages.push(e));
  store.write(newProgress());
  storage.setItem = () => {
    throw new Error("quota");
  };
  assert.equal(store.write(newProgress()), false);
  assert.ok(store.load());
  assert.equal(messages.includes(true), true);
});
