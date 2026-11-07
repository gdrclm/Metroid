// Read-only playtest policy. It returns ordinary actions; it never writes game state.
import { conditionMet } from "../src/core.js";
const go = (room) => ({ room, kind: "arrive" }),
  use = (room, id, flag) => ({ room, kind: "use", id, flag }),
  move = (room, x, feet) => ({ room, kind: "move", x, feet });
export function journeyTasks() {
  return [
    go("P02"),
    use("P02", "rest.pier"),
    go("P03"),
    use("P03", "pickup.p03_lower", "pickup.p03_lower"),
    move("P03", 560, 548),
    move("P03", 680, 520),
    move("P03", 800, 450),
    { room: "P03", kind: "drop" },
    go("P04"),
    use("P04", "gift.dash", "ability.dash"),
    go("P05"),
    go("P06"),
    move("P06", 1060, 530),
    go("P09"),
    use("P09", "pickup.p06_dash", "pickup.p06_dash"),
    go("P07"),
    use("P07", "lever.pier_gate", "shortcut.pier_gate"),
    go("P02"),
    go("P07"),
    go("P06"),
    go("P08"),
    use("P08", "lever.pier_lift", "mechanism.pier_lift"),
    go("V01"),
    go("V02"),
    use("V02", "rest.station"),
    go("V03"),
    use("V03", "wheel.clockwork", "mechanism.clockwork"),
    use("V03", "npc.clockmaker", "pickup.clockmaker"),
    go("V02"),
    go("V04"),
    go("R01"),
    go("R02"),
    use("R02", "rest.kitchen"),
    go("R03"),
    go("R04"),
    use("R04", "gift.wall_grip", "ability.wall_grip"),
    go("R05"),
    go("R06"),
    go("R09"),
    go("R07"),
    use("R07", "lamp.keeper_retry"),
    { room: "R07", kind: "boss" },
    use("R07", "lever.fire_stairs", "shortcut.fire_stairs"),
    use("R07", "lever.tower_bridge", "mechanism.tower_bridge"),
    go("R02"),
    use("R02", "rest.kitchen"),
    go("R07"),
    go("R06"),
    go("R08"),
    use("R08", "slice.overlook", "slice.overlook_seen"),
    go("P03"),
    { room: "P03", kind: "niche" },
    use("P03", "pickup.p03_upper", "pickup.p03_upper"),
    { room: "P03", kind: "drop" },
    go("V03"),
    use("V03", "npc.clockmaker", "story.clockmaker_memory"),
    go("R08"),
  ];
}
export class JourneyPilot {
  constructor(tasks = journeyTasks()) {
    this.tasks = tasks;
    this.index = 0;
    this.state = {};
    this.jumpUntil = 0;
    this.lastTime = 0;
    this.trace = [];
    this.done = false;
    this.lastRoom = null;
  }
  action(g, held = [], pressed = []) {
    if (pressed.includes("jump")) this.jumpUntil = g.time + 0.55;
    if (
      g.time < this.jumpUntil &&
      !held.includes("down") &&
      !held.includes("jump")
    )
      held.push("jump");
    return { held, pressed };
  }
  advance(g) {
    this.trace.push({
      task: this.index,
      room: g.room.roomId,
      time: +g.progress.playTime.toFixed(2),
      health: g.health,
      kind: this.tasks[this.index].kind,
    });
    this.index++;
    this.state = {};
  }
  route(g, target) {
    const queue = [[g.room.roomId]],
      seen = new Set(queue[0]);
    for (let n = 0; n < queue.length; n++) {
      const path = queue[n],
        id = path.at(-1);
      if (id === target) return path;
      for (const e of g.rooms.get(id)?.exits || [])
        if (!seen.has(e.targetRoomId) && conditionMet(e.condition, g.flags)) {
          seen.add(e.targetRoomId);
          queue.push([...path, e.targetRoomId]);
        }
    }
    return [];
  }
  walk(g, x, feet = null) {
    const p = g.player,
      dx = x - (p.x + p.w / 2),
      dir = Math.sign(dx),
      held = Math.abs(dx) > 16 ? [dir > 0 ? "right" : "left"] : [],
      pressed = [];
    const obstacle = g.surfaces.find(
      (s) =>
        s.kind === "solid" &&
        s.y < p.y + p.h - 3 &&
        s.y + s.h > p.y + 3 &&
        (dir > 0
          ? s.x >= p.x + p.w - 0.5 && s.x - p.x - p.w < 55
          : s.x + s.w <= p.x + 0.5 && p.x - s.x - s.w < 55),
    );
    if (
      p.grounded &&
      (obstacle ||
        (feet !== null && p.y + p.h > feet + 20 && Math.abs(dx) < 165))
    )
      pressed.push("jump");
    return this.action(g, held, pressed);
  }
  fightOrdinary(g) {
    const p = g.player,
      e = g.enemies.find(
        (e) =>
          e.hp > 0 &&
          e.enemyType !== "keeper" &&
          Math.abs(e.x + e.w / 2 - p.x - p.w / 2) < 100 &&
          Math.abs(e.y + e.h / 2 - p.y - p.h / 2) < 55,
      );
    if (!e) return null;
    const dx = e.x + e.w / 2 - p.x - p.w / 2,
      dir = Math.sign(dx),
      held =
        Math.abs(dx) > 65 || p.facing !== dir
          ? [dir > 0 ? "right" : "left"]
          : [],
      pressed = [];
    if (p.attackTime <= 0) pressed.push("attack");
    if (e.state === "windup" && e.timer < 0.18 && p.grounded)
      pressed.push("jump");
    return this.action(g, held, pressed);
  }
  climb(g, kind) {
    const p = g.player,
      s = this.state,
      feet = p.y + p.h;
    const setup =
      kind === "shaft"
        ? { x: 686, top: 200, threshold: 190, dir: -1 }
        : kind === "niche"
          ? { x: 920, top: 250, threshold: 206, dir: 1 }
          : kind === "grip"
            ? { x: 920, top: 220, threshold: 176, dir: 1 }
            : { x: 1150, top: 280, threshold: 236, dir: -1 };
    if (!s.phase) {
      if (Math.abs(p.x + 12 - setup.x) > 18 || !p.grounded)
        return this.walk(g, setup.x);
      s.phase = "climb";
      s.dir = setup.dir;
    }
    if (s.phase === "climb") {
      if (kind === "roofs" && p.grounded && Math.abs(feet - 280) < 2) {
        s.phase = "cross";
        return this.action(g, ["left", "jump"], ["jump"]);
      }
      const kick = p.grounded || (p.wall && p.wallLock <= 0);
      if (kick && p.wall) s.dir = -p.wall;
      if (kind !== "roofs" && p.y < setup.threshold) s.phase = "land";
      return this.action(
        g,
        [s.dir > 0 ? "right" : "left", "jump"],
        kick ? ["jump"] : [],
      );
    }
    if (s.phase === "land") {
      if (p.grounded) {
        if (kind === "niche" || kind === "grip") {
          s.finished = true;
          return this.action(g);
        }
        if (Math.abs(feet - 200) < 2) {
          s.phase = "cross";
          return this.action(g, ["left", "jump"], ["jump"]);
        }
        s.phase = null;
        return this.action(g);
      }
      return this.action(g, ["jump"]);
    }
    if (s.phase === "cross") {
      const dash =
        p.dashReady &&
        p.y < (kind === "roofs" ? 200 : 120) &&
        p.x < (kind === "roofs" ? 850 : 660);
      if (p.grounded && p.x < (kind === "roofs" ? 580 : 280)) {
        s.finished = true;
        return this.action(g);
      }
      return this.action(g, ["left", "jump"], dash ? ["dash"] : []);
    }
    return this.action(g);
  }
  travel(g, room) {
    const p = g.player,
      path = this.route(g, room),
      exit = g.room.exits.find((e) => e.targetRoomId === path[1]);
    if (!exit) return this.action(g);
    const feet = p.y + p.h;
    if (
      g.room.roomId === "P05" &&
      ((exit.targetRoomId === "P06" && p.x > 500) ||
        (exit.targetRoomId === "P04" && p.x < 870))
    ) {
      const dir = exit.targetRoomId === "P06" ? -1 : 1;
      if (feet > 500) return this.walk(g, dir < 0 ? 1160 : 130, 440);
      const edge = dir < 0 ? 900 : 380;
      if (p.grounded && Math.abs(p.x + 12 - edge) > 25)
        return this.walk(g, edge, 440);
      if (p.grounded)
        return this.action(g, [dir < 0 ? "left" : "right", "jump"], ["jump"]);
      const dash = p.dashReady && p.vy > -150;
      return this.action(
        g,
        [dir < 0 ? "left" : "right", "jump"],
        dash ? ["dash"] : [],
      );
    }
    if (g.room.roomId === "R06" && exit.targetRoomId === "R09" && feet < 600)
      return this.action(g, ["down"], p.grounded ? ["jump"] : []);
    if (g.room.roomId === "R04" && exit.targetRoomId === "R05" && feet > 230)
      return this.climb(g, "grip");
    if (
      g.room.roomId === "R05" &&
      exit.targetRoomId === "R06" &&
      !this.state.finished
    )
      return this.climb(g, "shaft");
    if (g.room.roomId === "R05" && exit.targetRoomId === "R04" && feet < 990) {
      return this.action(g, ["down"], p.grounded ? ["jump"] : []);
    }
    if (
      g.room.roomId === "R06" &&
      exit.targetRoomId === "R07" &&
      feet > 310 &&
      !this.state.finished
    )
      return this.climb(g, "roofs");
    if (g.room.roomId === "R06" && exit.targetRoomId === "R05" && p.x < 960) {
      if (p.grounded && feet > 450) return this.walk(g, 675, 540);
      if (p.grounded && feet > 360)
        return this.walk(g, 675, feet > 500 ? 450 : 360);
      if (p.grounded && feet <= 360 && p.x + 12 < 530)
        return this.walk(g, 540, feet);
      if (p.grounded) return this.action(g, ["right", "jump"], ["jump"]);
      return this.action(
        g,
        ["right", "jump"],
        p.dashReady && p.y + p.h < 280 && p.x > 650 ? ["dash"] : [],
      );
    }
    const nearby = g.nearby?.exitId === exit.exitId;
    if (exit.type === "passage")
      return this.walk(
        g,
        exit.direction === "left" ? -30 : g.room.worldBounds.w + 30,
        exit.y,
      );
    if (nearby && Math.abs(feet - exit.y) < 65)
      return this.action(
        g,
        [],
        [exit.type === "stairs" ? exit.direction : "interact"],
      );
    return this.walk(g, exit.x, exit.y);
  }
  boss(g) {
    const p = g.player,
      e = g.enemies.find((e) => e.enemyType === "keeper" && e.hp > 0);
    if (!e) return this.action(g);
    const dx = e.x + e.w / 2 - p.x - p.w / 2,
      dir = Math.sign(dx) || p.facing,
      held = [],
      pressed = [];
    if (!g.arenaActive) return this.walk(g, e.x + (p.x > e.x ? 110 : -110));
    if (p.grounded && p.y + p.h < e.y + e.h - 55 && e.state === "recovery")
      return this.action(g, ["down"], ["jump"]);
    if ((e.state === "windup" && e.timer < 0.45) || e.state === "attack") {
      if (p.grounded) pressed.push("jump");
      if (
        !p.grounded &&
        p.dashReady &&
        p.y + p.h < e.y + 8 &&
        Math.abs(dx) < 240
      )
        pressed.push("dash");
      held.push(dir > 0 ? "right" : "left");
    } else if (Math.abs(dx) > 88) held.push(dir > 0 ? "right" : "left");
    else if (p.facing !== dir) held.push(dir > 0 ? "right" : "left");
    if (
      Math.abs(dx) < 115 &&
      Math.abs(p.y + p.h - e.y - e.h) < 60 &&
      p.attackTime <= 0
    )
      pressed.push("attack");
    return this.action(g, held, pressed);
  }
  next(g) {
    if (this.index >= this.tasks.length) {
      this.done = true;
      return this.action(g);
    }
    if (g.transition) return this.action(g);
    if (this.lastRoom !== g.room.roomId) {
      this.state = {};
      this.lastRoom = g.room.roomId;
    }
    const task = this.tasks[this.index],
      p = g.player;
    if (g.room.roomId !== task.room) {
      const fight = this.fightOrdinary(g);
      return fight || this.travel(g, task.room);
    }
    if (task.kind === "arrive") {
      this.advance(g);
      return this.action(g);
    }
    if (task.kind === "wait") {
      this.state.waitStart ??= g.time;
      if (g.time - this.state.waitStart >= task.seconds) this.advance(g);
      return this.action(g);
    }
    if (task.kind === "boss") {
      if (g.flags.includes("boss.courtyard_keeper")) {
        this.advance(g);
        return this.action(g);
      }
      return this.boss(g);
    }
    const ordinary = this.fightOrdinary(g);
    if (ordinary) return ordinary;
    if (task.kind === "move") {
      if (
        Math.abs(g.player.x + 12 - task.x) < 35 &&
        Math.abs(g.player.y + 44 - task.feet) < 3 &&
        g.player.grounded
      ) {
        this.advance(g);
        return this.action(g);
      }
      return this.walk(g, task.x, task.feet);
    }
    if (task.kind === "drop") {
      if (
        g.player.grounded &&
        Math.abs(g.player.y + 44 - g.room.decoration.groundY) < 3
      ) {
        this.advance(g);
        return this.action(g);
      }
      return this.action(g, ["down"], g.player.grounded ? ["jump"] : []);
    }
    if (task.kind === "niche") {
      if (this.state.finished) {
        this.advance(g);
        return this.action(g);
      }
      return this.climb(g, "niche");
    }
    if (task.kind === "dash_secret") {
      const p = g.player;
      if (p.grounded && p.x < 450 && Math.abs(p.y + 44 - 440) < 3) {
        this.advance(g);
        return this.action(g);
      }
      if (p.grounded && p.x > 620)
        return this.action(g, ["left", "jump"], ["jump"]);
      return this.action(
        g,
        ["left", "jump"],
        p.dashReady && p.x < 670 && p.y < 380 ? ["dash"] : [],
      );
    }
    if (task.kind === "use") {
      const target = g.room.entities.find((e) => e.id === task.id);
      if (!target) throw Error("Missing pilot target " + task.id);
      const complete = task.flag
        ? g.flags.includes(task.flag)
        : target.type === "rest"
          ? g.progress.lastRest.roomId === task.room && g.health >= 5
          : target.type === "retry"
            ? this.state.used
            : false;
      if (complete) {
        this.advance(g);
        return this.action(g);
      }
      if (g.nearby?.id === task.id) {
        this.state.used = true;
        return this.action(g, [], ["interact"]);
      }
      if (g.room.roomId === "P09" && p.x < 620) {
        if (p.y + p.h > 400) return this.walk(g, 130, 360);
        if (p.grounded && p.x < 210) return this.walk(g, 230, 360);
        if (p.grounded) return this.action(g, ["right", "jump"], ["jump"]);
        return this.action(
          g,
          ["right", "jump"],
          p.dashReady && p.vy > -150 ? ["dash"] : [],
        );
      }
      return this.walk(
        g,
        target.id === "wheel.clockwork" ? 475 : target.x,
        target.type === "pickup"
          ? target.y + 32
          : target.type === "ability"
            ? target.y + 52
            : target.y,
      );
    }
    return this.action(g);
  }
}
