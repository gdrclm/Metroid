import { clamp, overlaps } from "../core.js";
import { moveBody } from "../physics.js";
const COSTS = { platform: 16, barricade: 22, rations: 5, beans: 7, lure: 8 };
export class Interventions {
  constructor(director) {
    this.director = director;
    this.structures = [];
    this.drops = [];
    this.lure = null;
    this.serial = 0;
  }
  get surfaces() {
    return this.structures.filter((s) => s.life > 1e-8 && s.hp > 0);
  }
  place(type, x, y) {
    const d = this.director,
      g = d.game;
    if (!["playing", "tactical"].includes(g.mode))
      return { ok: false, reason: "Сейчас вмешательство недоступно" };
    if (
      !Object.hasOwn(COSTS, type) ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    )
      return { ok: false, reason: "Выберите место в мире" };
    const cost = COSTS[type];
    if (d.state.focus < cost)
      return this.reject("Не хватает сосредоточенности");
    if (["rations", "beans"].includes(type) && d.state.inventory[type] < 1)
      return this.reject(
        type === "beans" ? "Зёрен больше нет" : "Припасов больше нет",
      );
    const box = {
      x: x - (type === "platform" ? 60 : type === "barricade" ? 22 : 8),
      y: y - (type === "barricade" ? 90 : 0),
      w: type === "platform" ? 120 : type === "barricade" ? 44 : 16,
      h: type === "barricade" ? 90 : type === "platform" ? 12 : 16,
    };
    if (
      box.x < 0 ||
      box.x + box.w > g.room.worldBounds.w ||
      box.y < 0 ||
      box.y + box.h > g.room.worldBounds.h
    )
      return this.reject("Место за пределами комнаты");
    if (
      g.currentSurfaces().some((s) => s.kind !== "hazard" && overlaps(box, s))
    )
      return this.reject("Место занято геометрией");
    if (["platform", "barricade"].includes(type)) {
      if (this.structures.length >= 3)
        return this.reject("Одновременно можно удерживать три конструкции");
      if (
        [g.player, ...g.enemies.filter((e) => e.hp > 0)].some((actor) =>
          overlaps(box, actor),
        )
      )
        return this.reject("Конструкция не может появиться внутри тела");
      this.structures.push({
        ...box,
        id: `guide.${++this.serial}`,
        kind: type === "platform" ? "oneWay" : "solid",
        grippable: true,
        material: "metal",
        type,
        life: type === "platform" ? 3 : 16,
        hp: type === "platform" ? 1 : 4,
      });
    } else if (type === "lure") this.lure = { x, y, life: 9 };
    else {
      const id = `delivery.${++this.serial}`;
      d.state.inventory[type]--;
      d.state.deliveries.push({ id, item: type, state: "pending" });
      this.drops.push({ ...box, id, item: type, vx: 0, vy: 0, dropTime: 0 });
    }
    d.state.focus -= cost;
    g.surfaces = g.currentSurfaces();
    d.worldRevision++;
    d.message = "Вмешательство проявлено";
    g.save();
    return { ok: true };
  }
  reject(reason) {
    this.director.message = reason;
    return { ok: false, reason };
  }
  update(dt) {
    const d = this.director,
      g = d.game;
    const before = this.structures.length;
    for (const s of this.structures) s.life -= dt;
    this.structures = this.structures.filter((s) => s.life > 1e-8 && s.hp > 0);
    if (this.structures.length !== before) d.worldRevision++;
    if (this.lure) {
      this.lure.life -= dt;
      if (this.lure.life <= 0) this.lure = null;
    }
    for (const drop of this.drops) {
      drop.vy = Math.min(500, drop.vy + 1000 * dt);
      moveBody(drop, 0, drop.vy * dt, g.surfaces);
      if (overlaps(drop, g.player)) {
        if (drop.item === "rations") d.needs.eat();
        else d.needs.coffee(true);
        d.state.deliveries = d.state.deliveries.filter((e) => e.id !== drop.id);
        drop.picked = true;
        d.message =
          drop.item === "rations"
            ? "Герой подобрал еду"
            : "Кофе выпит: выносливость закреплена до выхода";
        g.emit("sound", "pickup");
        g.save();
      }
    }
    this.drops = this.drops.filter((drop) => !drop.picked);
  }
  projectileImpact(shot) {
    const obstacle = this.structures.find((s) => s.hp > 0 && overlaps(s, shot));
    if (obstacle) {
      obstacle.hp--;
      shot.life = 0;
      this.director.worldRevision++;
      if (obstacle.hp <= 0)
        this.director.game.surfaces = this.director.game.surfaces.filter(
          (s) => s.id !== obstacle.id,
        );
      return true;
    }
    return false;
  }
  leave() {
    const d = this.director;
    for (const drop of d.state.deliveries)
      if (drop.state === "pending")
        d.state.inventory[drop.item] = clamp(
          (d.state.inventory[drop.item] || 0) + 1,
          0,
          99,
        );
    d.state.deliveries = [];
    this.structures = [];
    this.drops = [];
    this.lure = null;
    d.worldRevision++;
  }
}
