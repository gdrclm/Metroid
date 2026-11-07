import test from "node:test";
import assert from "node:assert/strict";
import { signText } from "../src/tutorial.js";
import { world, fixture } from "./helpers.js";
test("platform instructions are concise and use the active device controls", () => {
  assert.equal(signText("jump"), "Пробел — прыжок");
  assert.equal(signText("jump", "touch"), "↑ — прыжок");
  assert.equal(signText("dash", "gamepad"), "В прыжке → B");
  for (const action of [
    "move",
    "jump",
    "attack",
    "interact",
    "map",
    "dash",
    "wall",
  ])
    for (const device of ["keyboard", "touch", "gamepad"]) {
      assert.ok(
        signText(action, device).length > 0 &&
          signText(action, device).length < 35,
      );
    }
});
test("instructions are painted below walkable platform tops, outside the player body", () => {
  const all = world.rooms.flatMap((r) => r.tutorialSigns.map((s) => [r, s]));
  assert.ok(all.length >= 7);
  for (const [r, s] of all) {
    assert.ok(
      r.collisionLayers.some(
        (p) =>
          s.x >= p.x &&
          s.x + s.w <= p.x + p.w &&
          s.y - 20 >= p.y &&
          s.y <= p.y + p.h,
      ),
      r.roomId + " sign must fit its platform face",
    );
  }
});
test("mobile viewport follows the player and rotation preserves physics and progress", () => {
  const { game } = fixture();
  Object.assign(game.player, { x: 1000, vx: 230, vy: -100 });
  game.flag("ability.dash");
  game.setViewport(540, 720);
  assert.ok(
    game.player.x >= game.camera.x && game.player.x < game.camera.x + 540,
  );
  game.setViewport(1100, 540);
  assert.equal(game.player.x, 1000);
  assert.equal(game.player.vx, 230);
  assert.equal(game.player.vy, -100);
  assert.ok(game.abilities.dash);
  assert.ok(game.camera.x >= 0 && game.camera.x <= 180);
  assert.ok(game.camera.y >= 0 && game.camera.y <= 180);
});
