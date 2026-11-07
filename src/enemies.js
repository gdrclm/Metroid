import { approach, clamp, overlaps } from "./core.js";
import { moveBody, lineBlocked } from "./physics.js";
import { record } from "./telemetry.js";
export function createEnemy(entity) {
  const keeper = entity.enemyType === "keeper",
    parasite = entity.enemyType === "parasite";
  return {
    ...entity,
    w: keeper ? 52 : parasite ? 32 : 30,
    h: keeper ? 74 : parasite ? 34 : 48,
    y: entity.y - (keeper ? 74 : parasite ? 0 : 48),
    homeX: entity.x,
    homeY: entity.y,
    hp: entity.hp,
    maxHp: entity.hp,
    vx: 0,
    vy: 0,
    facing: -1,
    state: "patrol",
    timer: 0,
    attackNumber: 0,
    repeatedAttack: 0,
    lastAttack: null,
    lastHit: 0,
    flash: 0,
    dropTime: 0,
  };
}
export function updateEnemy(e, player, dt, surfaces, game) {
  if (e.hp <= 0) return;
  e.flash = Math.max(0, e.flash - dt);
  e.timer -= dt;
  const cx = e.x + e.w / 2,
    px = player.x + player.w / 2,
    dx = px - cx,
    dy = player.y - e.y;
  const visible =
    Math.abs(dx) < 560 &&
    Math.abs(dy) < 270 &&
    !lineBlocked(
      { x: cx, y: e.y + e.h / 2 },
      { x: px, y: player.y + player.h / 2 },
      surfaces,
      { includeOneWay: true },
    );
  const onScreen =
    !game.viewport ||
    !game.camera ||
    (e.x + e.w > game.camera.x - 20 &&
      e.x < game.camera.x + game.viewport.w + 20 &&
      e.y + e.h > game.camera.y &&
      e.y < game.camera.y + game.viewport.h);
  if (e.enemyType === "parasite") {
    if (
      e.state === "patrol" &&
      visible &&
      onScreen &&
      Math.abs(dx) < 250 &&
      e.timer <= 0
    ) {
      e.state = "windup";
      e.timer = 0.7;
    } else if (e.state === "windup" && e.timer <= 0) {
      e.state = "recovery";
      e.timer = 1.8;
      game.projectiles.push({
        id: e.id + "." + game.time,
        x: cx,
        y: e.y + e.h,
        vx: clamp(dx * 1.1, -190, 190),
        vy: 240,
        w: 12,
        h: 16,
        life: 3,
        owner: e.id,
      });
    } else if (e.state === "recovery" && e.timer <= 0) e.state = "patrol";
    return;
  }
  const keeper = e.enemyType === "keeper",
    range = keeper ? 430 : 68;
  const arena = game.room?.arena || { x: 300, w: 900 };
  if (
    keeper &&
    !game.arenaActive &&
    player.x > arena.x &&
    player.x + player.w < arena.x + arena.w
  ) {
    game.arenaActive = true;
    if (game.progress) record(game, "boss_attempt");
  }
  if (keeper && !game.arenaActive) return;
  if (e.state === "windup") {
    e.vx = approach(e.vx, 0, 1800 * dt);
    if (e.timer <= 0) {
      e.state = "attack";
      e.timer = keeper ? 0.34 : 0.18;
      if (keeper && e.attackKind === "wave") {
        game.emit?.("sound", "keeperWave");
        game.projectiles.push({
          id: e.id + ".wave." + game.time,
          x: e.x + (e.facing > 0 ? e.w : 0),
          y: e.y + e.h - 26,
          w: 38,
          h: 26,
          vx: e.facing * 380,
          vy: 0,
          life: 2,
          owner: e.id,
          wave: true,
        });
      } else {
        e.attackKind = "lunge";
        if (keeper && dy < -55) e.vy = -620;
        if (keeper) game.emit?.("sound", "keeperLunge");
        e.vx = e.facing * (keeper ? 540 : 210);
      }
    }
  } else if (e.state === "attack") {
    if (e.timer <= 0) {
      e.state = "recovery";
      e.timer = keeper ? 0.85 : 0.72;
      e.vx = 0;
    }
  } else if (e.state === "recovery" || e.state === "stunned") {
    e.vx = approach(e.vx, 0, 1500 * dt);
    if (e.timer <= 0) e.state = "patrol";
  } else if (visible) {
    e.facing = dx >= 0 ? 1 : -1;
    e.state = "chase";
    if (Math.abs(dx) < range && Math.abs(dy) < 85 && onScreen) {
      e.state = "windup";
      e.timer = keeper ? 0.7 : 0.48;
      e.attackNumber++;
      let next = keeper && Math.abs(dx) > 145 ? "wave" : "lunge";
      if (keeper && e.lastAttack === next && e.repeatedAttack >= 2)
        next = next === "wave" ? "lunge" : "wave";
      e.repeatedAttack = e.lastAttack === next ? e.repeatedAttack + 1 : 1;
      e.lastAttack = next;
      e.attackKind = next;
      if (keeper)
        game.emit?.("sound", next === "wave" ? "keeperWaveReady" : "keeperLungeReady");
      e.vx = 0;
    } else e.vx = e.facing * (keeper ? 95 : 70);
  } else {
    e.state = "patrol";
    if (e.x <= e.patrol[0]) e.facing = 1;
    if (e.x >= e.patrol[1]) e.facing = -1;
    e.vx = e.facing * 40;
  }
  // Ground enemies turn at a ledge rather than falling off their patrol area.
  const edgeX = e.facing > 0 ? e.x + e.w + 8 : e.x - 8;
  const support = surfaces.some(
    (s) =>
      s.kind !== "hazard" &&
      edgeX >= s.x &&
      edgeX <= s.x + s.w &&
      Math.abs(s.y - (e.y + e.h)) < 30,
  );
  if (!support && e.state !== "attack") {
    e.facing *= -1;
    e.vx = 0;
  }
  e.vy = Math.min(800, e.vy + 1900 * dt);
  moveBody(e, e.vx * dt, e.vy * dt, surfaces);
  if (game.room?.worldBounds) {
    const minX = keeper ? Math.max(0, e.patrol[0] - 100) : 0,
      maxX = keeper
        ? Math.min(game.room.worldBounds.w - e.w, e.patrol[1] + 100)
        : game.room.worldBounds.w - e.w;
    const limited = clamp(e.x, minX, maxX);
    if (limited !== e.x) {
      e.x = limited;
      e.vx = 0;
      if (e.state === "attack") {
        e.state = "recovery";
        e.timer = 0.8;
      }
    }
  }
  if (
    overlaps(player, { x: e.x + 4, y: e.y + 5, w: e.w - 8, h: e.h - 5 }) &&
    e.flash <= 0 &&
    e.state === "attack"
  )
    game.hurt(keeper ? 2 : 1, dx >= 0 ? 1 : -1, "contact:" + e.enemyType);
  if (e.state === "attack" && e.attackKind !== "wave") {
    const hit = {
      x: e.facing > 0 ? e.x + e.w - 5 : e.x - (keeper ? 92 : 42),
      y: e.y + 18,
      w: keeper ? 98 : 48,
      h: e.h - 10,
    };
    if (
      overlaps(player, hit) &&
      !lineBlocked(
        { x: cx, y: e.y + e.h / 2 },
        { x: px, y: e.y + e.h / 2 },
        surfaces,
      )
    )
      game.hurt(keeper ? 2 : 1, e.facing, "lunge:" + e.enemyType);
  }
}
