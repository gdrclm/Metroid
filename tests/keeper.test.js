import test from "node:test";
import assert from "node:assert/strict";
import { updateEnemy } from "../src/enemies.js";
import { fixture, config, controls } from "./helpers.js";

function arena() {
  const { game } = fixture();
  game.loadRoom("R07");
  game.arenaActive = true;
  const enemy = game.enemies[0];
  Object.assign(game.player, { invulnerable: 0, vx: 0, vy: 0 });
  return { game, enemy };
}

test("keeper telegraphs and recovery cannot damage even an overlapping player", () => {
  for (const state of ["windup", "recovery"]) {
    for (const attackKind of ["wave", "lunge"]) {
      const { game, enemy } = arena();
      Object.assign(enemy, { state, attackKind, timer: 0.7, vx: 0 });
      Object.assign(game.player, { x: enemy.x + 10, y: enemy.y + 25 });
      const hp = game.health;
      for (let i = 0; i < 60; i++)
        updateEnemy(enemy, game.player, config.fixedStep, game.surfaces, game);
      assert.equal(game.health, hp, state + ":" + attackKind);
      assert.equal(game.projectiles.length, 0);
    }
  }
});

test("keeper lunge needs body contact, including airborne near misses on either side", () => {
  for (const facing of [-1, 1]) {
    for (const airborne of [false, true]) {
      const { game, enemy } = arena();
      Object.assign(enemy, {
        state: "attack", attackKind: "lunge", timer: 0.3,
        vx: facing * 540, facing,
      });
      if (airborne) Object.assign(enemy, { y: enemy.y - 100, vy: -100 });
      Object.assign(game.player, {
        x: airborne ? enemy.x + 10 : facing > 0 ? enemy.x + enemy.w + 25 : enemy.x - 49,
        y: airborne ? enemy.y + enemy.h + 2 : enemy.y + 25,
      });
      const hp = game.health;
      updateEnemy(enemy, game.player, config.fixedStep, game.surfaces, game);
      assert.equal(game.health, hp, `near miss: facing=${facing}, airborne=${airborne}`);
    }
  }
});

test("keeper lunge inflicts damage only after its windup ends and the bodies touch", () => {
  const { game, enemy } = arena();
  Object.assign(enemy, { state: "windup", attackKind: "lunge", timer: 0.02, facing: -1 });
  Object.assign(game.player, { x: enemy.x + 10, y: enemy.y + 25 });
  const hp = game.health;
  for (let i = 0; i < 2; i++) {
    updateEnemy(enemy, game.player, config.fixedStep, game.surfaces, game);
    assert.equal(game.health, hp);
    assert.equal(enemy.state, "windup");
  }
  updateEnemy(enemy, game.player, config.fixedStep, game.surfaces, game);
  assert.equal(enemy.state, "attack");
  assert.equal(game.health, hp - 2);
  // Normal hurt invulnerability prevents repeated damage while still touching.
  updateEnemy(enemy, game.player, config.fixedStep, game.surfaces, game);
  assert.equal(game.health, hp - 2);
});

test("keeper waves spawn after the telegraph and hurt only on projectile contact", () => {
  const { game, enemy } = arena();
  Object.assign(enemy, { state: "windup", attackKind: "wave", timer: 0.02, facing: -1 });
  Object.assign(game.player, { x: enemy.x - 120, y: enemy.y + enemy.h - 44 });
  const hp = game.health;
  for (let i = 0; i < 2; i++) {
    game.update(config.fixedStep, controls());
    assert.equal(game.projectiles.length, 0);
    assert.equal(game.health, hp);
  }
  game.update(config.fixedStep, controls());
  assert.equal(game.projectiles.length, 1);
  assert.equal(game.health, hp);
  const shot = game.projectiles[0];
  Object.assign(game.player, { x: shot.x - shot.w - 10, vx: 0, vy: 0 });
  game.update(config.fixedStep, controls());
  assert.equal(game.health, hp);
  Object.assign(game.player, { x: shot.x, y: shot.y - 10, vx: 0, vy: 0 });
  game.update(config.fixedStep, controls());
  assert.equal(game.health, hp - 1);
});
