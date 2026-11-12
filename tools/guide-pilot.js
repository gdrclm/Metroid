// Automated playtest driver, not the in-game Hero AI. It translates the existing
// authored journey's intentions into public Guide commands, using live geometry.
// It never sets positions, health, abilities, flags, enemy state or resources.
import { JourneyPilot } from "./pilot.js";
import { heroInput } from "../src/hero/commands.js";
export function runGuideJourney(
  g,
  { onTask = null, maxTicks = 90000, pilot = new JourneyPilot() } = {},
) {
  if (!g.guide.enabled)
    throw Error("Start Guide mode before running the journey");
  let last = -1,
    stuck = 0,
    commands = 0;
  function issue(type, options = {}) {
    const q = g.guide.commands;
    q.clear();
    const r = q.enqueue(type, options);
    if (r.ok) commands++;
  }
  for (let i = 0; i < maxTicks; i++) {
    if (g.mode === "death") {
      if (g.progress.deaths > 6) break;
      g.respawn();
    }
    if (g.mode === "safehouse") {
      for (const a of ["bed", "food", "wash", "coffee"])
        g.guide.safehouseAction(a);
      g.mode = "playing";
    }
    if (g.mode === "dialogue" || g.mode === "complete") g.mode = "playing";
    const a = pilot.next(g),
      p = g.player,
      q = g.guide.commands,
      cur = q.current,
      axis = a.held.includes("right") ? 1 : a.held.includes("left") ? -1 : 0;
    if (pilot.index !== last) {
      onTask?.({
        index: pilot.index,
        room: g.room.roomId,
        time: g.time,
        health: g.health,
        task: pilot.tasks[pilot.index],
      });
      last = pilot.index;
      stuck = 0;
    } else stuck++;
    if (pilot.done) break;
    if (stuck > 6000)
      throw Error(
        "Guide journey stuck: " +
          JSON.stringify({
            task: pilot.tasks[pilot.index],
            player: g.player,
            result: q.result,
            state: pilot.state,
          }),
      );
    if (!g.transition && p.hurtTime <= 0) {
      if (
        pilot.tasks[pilot.index]?.kind === "boss" &&
        g.room.roomId === "R07"
      ) {
        const e = g.enemies.find((e) => e.hp > 0);
        if (!cur && e) {
          const dx = e.x + e.w / 2 - p.x - p.w / 2,
            direction = Math.sign(dx) || p.facing;
          if (e.state === "windup" && e.timer < 0.3)
            issue("guard", { direction, duration: 1.2 });
          else if (Math.abs(dx) < 105 && Math.abs(e.y + e.h - p.y - p.h) < 60)
            issue("attack", { enemyId: e.id, limb: "legs" });
          else
            issue("move", {
              x:
                p.x +
                12 +
                direction * Math.min(80, Math.max(15, Math.abs(dx) - 75)),
              timeout: 1,
            });
        }
      } else if (
        a.pressed.includes("interact") ||
        a.pressed.includes("up") ||
        a.pressed.includes("down")
      ) {
        if (g.nearby && cur?.type !== "interact")
          issue("interact", { targetId: g.nearby.id || g.nearby.exitId });
      } else if (
        a.pressed.includes("dash") &&
        g.abilities.dash &&
        !p.grounded &&
        p.dashReady &&
        cur?.type !== "dash"
      )
        issue("dash", { direction: axis || p.facing });
      else if (
        a.pressed.includes("jump") &&
        a.held.includes("down") &&
        p.grounded &&
        cur?.type !== "drop"
      ) {
        const solid = g.surfaces.find(
          (s) =>
            s.kind === "solid" &&
            Math.abs(s.y - p.y - p.h) < 1 &&
            p.x + p.w > s.x &&
            p.x < s.x + s.w,
        );
        if (solid) {
          if (cur?.type !== "move")
            issue("move", {
              x: p.x + 12 + (p.x + p.w / 2 >= solid.x + solid.w / 2 ? 80 : -80),
            });
        } else issue("drop");
      } else if (
        a.pressed.includes("jump") &&
        (p.grounded || p.coyote > 0 || (p.wall && p.wallLock <= 0)) &&
        cur?.type !== "dash"
      )
        issue("jump", { direction: axis || p.facing });
      else if (
        a.pressed.includes("attack") &&
        cur?.type !== "attack" &&
        cur?.type !== "jump" &&
        cur?.type !== "dash"
      )
        issue("attack", { direction: axis || p.facing });
      else if (!cur || cur.type === "move") {
        if (axis) {
          if (!cur || Math.sign(cur.x - p.x - 12) !== axis)
            issue("move", { x: axis > 0 ? g.room.worldBounds.w - 12 : 12 });
        } else if (cur?.type === "move") q.cancel(cur.id);
      }
    }
    g.update(g.config.fixedStep, heroInput());
  }

  return {
    completed: pilot.done,
    visited: [...g.progress.visited],
    health: g.health,
    deaths: g.progress.deaths,
    time: g.time,
    commands,
    trace: pilot.trace,
  };
}
