import { clamp } from "../core.js";
import { accessibleInteraction } from "../safety.js";
export const COMMAND_LIMIT = 3;
export const COMMAND_NAMES = {
  move: "Идти",
  jump: "Прыжок",
  drop: "Спуститься",
  dash: "Рывок",
  guard: "Щит",
  roll: "Перекат",
  attack: "Удар",
  interact: "Действие",
  wait: "Ждать",
};
export function heroInput(held = [], pressed = []) {
  return { down: (k) => held.includes(k), pressed: (k) => pressed.includes(k) };
}
export function limbBox(enemy, limb = "torso") {
  const profile = { head: [0, 0.28], torso: [0.25, 0.48], legs: [0.64, 0.36] }[
    limb
  ] || [0.25, 0.48];
  return {
    x: enemy.x,
    y: enemy.y + enemy.h * profile[0],
    w: enemy.w,
    h: enemy.h * profile[1],
  };
}
export class Commands {
  constructor(director) {
    this.director = director;
    this.items = [];
    this.serial = 0;
    this.revision = 0;
    this.result = null;
  }
  get current() {
    return this.items[0] || null;
  }
  enqueue(type, options = {}) {
    const d = this.director,
      g = d.game,
      p = g.player;
    if (!Object.hasOwn(COMMAND_NAMES, type))
      return this.reject("Неизвестный приказ");
    if (this.items.length >= COMMAND_LIMIT)
      return this.reject("В очереди уже три приказа");
    const direction =
      type === "jump" && options.direction === 0
        ? 0
        : options.direction === -1
          ? -1
          : options.direction === 1
            ? 1
            : p.facing;
    if (type === "dash" && !g.abilities.dash)
      return this.reject("Сначала найдите Порыв ветра");
    if (type === "move" && !Number.isFinite(options.x))
      return this.reject("Выберите точку движения");
    const command = {
      ...options,
      id: ++this.serial,
      type,
      direction,
      generation: d.generation,
      elapsed: 0,
      started: false,
      status: "queued",
      timeout: options.timeout || (type === "move" ? 12 : 5),
    };
    if (type === "move")
      command.x = clamp(options.x, 12, g.room.worldBounds.w - 12);
    if (type === "guard" || type === "wait")
      command.duration = clamp(Number(options.duration) || 1, 0.15, 5);
    if (
      type === "attack" &&
      options.enemyId &&
      !g.enemies.some((e) => e.id === options.enemyId && e.hp > 0)
    )
      return this.reject("Цель уже недоступна");
    this.items.push(command);
    this.revision++;
    d.message = "Приказ добавлен";
    return { ok: true, id: command.id };
  }
  reject(reason) {
    this.director.message = reason;
    return { ok: false, reason };
  }
  replace(plan) {
    if (this.director.game.mode !== "tactical")
      return this.reject("Заменять план можно в тактической паузе");
    if (!Array.isArray(plan) || !plan.length || plan.length > COMMAND_LIMIT)
      return this.reject("План должен содержать от одного до трёх приказов");
    const staged = new Commands(this.director);
    staged.serial = this.serial;
    for (const command of plan) {
      const result = staged.enqueue(command.type, command);
      if (!result.ok) return result;
    }
    this.clear();
    this.items = staged.items;
    this.serial = staged.serial;
    this.revision++;
    this.result = null;
    this.director.message = "План Оракула принят. Space — исполнить.";
    return { ok: true };
  }
  finish(status = "succeeded", reason = "") {
    const c = this.current;
    if (!c) return;
    const d = this.director,
      p = d.game.player;
    p.guard = false;
    if (c.type === "roll") p.rollTime = 0;
    if (c.type === "dash") p.dashTime = 0;
    if (status === "cancelled" && ["dash", "roll"].includes(c.type))
      p.vx = clamp(p.vx, -d.game.config.maxSpeed, d.game.config.maxSpeed);
    if (c.type === "attack") d.attackTarget = null;
    this.items.shift();
    this.revision++;
    this.result = { id: c.id, type: c.type, status, reason };
    if (status === "failed") {
      this.items = [];
      d.message = reason;
      d.game.emit("toast", reason);
    } else if (status === "succeeded") {
      d.state.completedCommands++;
      d.state.volition = Math.min(25, d.state.volition + 0.08);
      if (d.story.sync(true)) d.game.save();
    }
  }
  cancel(id) {
    const index = this.items.findIndex((c) => c.id === id);
    if (index < 0) return;
    if (index === 0) {
      this.finish("cancelled");
      this.director.game.player.attackTime = 0;
    } else {
      this.items.splice(index, 1);
      this.revision++;
    }
    this.director.message = "Приказ отменён";
  }
  clear() {
    while (this.items.length) this.cancel(this.current.id);
    this.result = null;
  }
  fail(reason) {
    this.finish("failed", reason);
    return heroInput();
  }
  step(dt) {
    const d = this.director,
      g = d.game,
      p = g.player,
      c = this.current;
    p.guard = false;
    if (!c) return this.idle();
    if (c.generation !== d.generation)
      return this.fail("Комната изменилась: план очищен");
    if (p.hurtTime > 0 || d.needs.microSleep > 0) {
      c.status = "blocked";
      return heroInput();
    }
    c.elapsed += dt;
    c.status = "running";
    if (c.elapsed > c.timeout)
      return this.fail("Путь заблокирован: требуется новый план");
    const first = !c.started;
    c.started = true;
    if (c.type === "move") {
      const dx = c.x - (p.x + p.w / 2);
      const edge = c.x <= 24 || c.x >= g.room.worldBounds.w - 24;
      if (!edge && Math.abs(dx) < 12 && Math.abs(p.vx) < 35) {
        this.finish();
        return heroInput();
      }
      const stopping = (p.vx * p.vx) / (2 * g.config.braking) + 3;
      if (
        !edge &&
        Math.sign(dx) === Math.sign(p.vx) &&
        Math.abs(dx) <= stopping
      )
        return heroInput();
      return heroInput([dx > 0 ? "right" : "left"]);
    }
    if (c.type === "jump") {
      if (
        first &&
        !p.grounded &&
        !p.coyote &&
        !(p.wall && g.abilities.wall_grip) &&
        !(g.abilities.air_jump && p.airJumpsLeft > 0)
      )
        return this.fail("Нет опоры или заряда воздушного прыжка");
      if (first && d.state.needs.stamina < 4 && !d.needs.caffeine)
        return this.fail("Не хватает выносливости для прыжка");
      if (!first && c.elapsed > 0.05 && p.vy >= 0) {
        this.finish();
        return heroInput();
      }
      return heroInput(
        [
          ...(c.direction ? [c.direction > 0 ? "right" : "left"] : []),
          ...(c.elapsed < 0.35 ? ["jump"] : []),
        ],
        first ? ["jump"] : [],
      );
    }
    if (c.type === "dash") {
      if (first && (p.grounded || !p.dashReady))
        return this.fail("Рывок требует воздуха и заряда");
      if (first && d.state.needs.stamina < 10 && !d.needs.caffeine)
        return this.fail("Не хватает выносливости для рывка");
      if (!first && p.dashTime <= 0) {
        this.finish();
        return heroInput();
      }
      return heroInput(
        [c.direction > 0 ? "right" : "left"],
        first ? ["dash"] : [],
      );
    }
    if (c.type === "guard") {
      if (d.state.needs.stamina <= 0 && !d.needs.caffeine)
        return this.fail("Не хватает выносливости для щита");
      if (c.elapsed >= c.duration) {
        this.finish();
        return heroInput();
      }
      p.facing = c.direction;
      p.guard = true;
      return heroInput();
    }
    if (c.type === "roll") {
      if (first && !p.grounded) return this.fail("Перекат выполняется с земли");
      if (first && d.state.needs.stamina < 22 && !d.needs.caffeine)
        return this.fail("Не хватает выносливости для переката");
      if (!first && p.rollTime <= 0) {
        this.finish();
        return heroInput();
      }
      return heroInput(
        [c.direction > 0 ? "right" : "left"],
        first ? ["roll"] : [],
      );
    }
    if (c.type === "attack") {
      const enemy = c.enemyId
        ? g.enemies.find((e) => e.id === c.enemyId && e.hp > 0)
        : null;
      if (c.enemyId && !enemy) {
        if (c.hit) {
          this.finish();
          return heroInput();
        }
        return this.fail("Цель больше не существует");
      }
      if (enemy) p.facing = enemy.x + enemy.w / 2 >= p.x + p.w / 2 ? 1 : -1;
      else p.facing = c.direction;
      if (first) {
        if (d.state.needs.stamina < 8 && !d.needs.caffeine)
          return this.fail("Не хватает выносливости для удара");
        d.attackTarget = enemy
          ? {
              enemyId: enemy.id,
              limb: c.limb || "torso",
              generation: d.generation,
            }
          : null;
      }
      if (!first && p.attackTime <= 0) {
        if (c.enemyId && !c.hit)
          return this.fail(
            "Удар не достиг цели: подойдите ближе или выберите другую часть тела",
          );
        this.finish();
        return heroInput();
      }
      return heroInput([], first ? ["attack"] : []);
    }
    if (c.type === "drop") {
      if (
        first &&
        !g.surfaces.some(
          (s) =>
            s.kind === "oneWay" &&
            Math.abs(p.y + p.h - s.y) < 1 &&
            p.x + p.w > s.x &&
            p.x < s.x + s.w,
        )
      )
        return this.fail("Спуск возможен только сквозь решётку");
      if (!first && c.elapsed > 0.22) {
        this.finish();
        return heroInput();
      }
      return heroInput(["down"], first ? ["jump"] : []);
    }
    if (c.type === "interact") {
      const target = [
        ...g.room.entities,
        ...g.room.exits,
        ...d.supplies.available,
      ].find((e) => (e.id || e.exitId) === c.targetId);
      if (!target || !accessibleInteraction(p, target, g.surfaces))
        return this.fail(
          "Подойдите ближе: сквозь стену взаимодействовать нельзя",
        );
      if (target.type === "care") {
        g.nearby = target;
        const result = g.interact();
        if (result?.ok === false) return this.fail(result.reason);
        this.finish();
        return heroInput();
      }
      this.finish();
      g.nearby = target;
      g.interact();
      return heroInput();
    }
    if (c.type === "wait") {
      if (c.elapsed >= c.duration) this.finish();
      return heroInput();
    }
    return heroInput();
  }
  idle() {
    const d = this.director,
      g = d.game,
      lure = d.tools.lure;
    if (lure && Math.abs(lure.x - g.player.x) > 18)
      return heroInput([lure.x > g.player.x ? "right" : "left"]);
    return heroInput();
  }
}
