import { clamp } from "../core.js";
import { newStoryState, normalizeStoryState } from "../story.js";

const bounded = (value, fallback, max = 100) =>
  Number.isFinite(value) ? clamp(value, 0, max) : fallback;
export function newGuideState() {
  return {
    schemaVersion: 1,
    enabled: false,
    act: 1,
    volition: 6,
    focus: 100,
    needs: { energy: 82, satiety: 78, stress: 8, corruption: 0, stamina: 100 },
    inventory: { rations: 3, beans: 2 },
    caffeine: null,
    supplies: [],
    collectedSupplies: [],
    deliveries: [],
    memory: {},
    completedCommands: 0,
    cleanProtection: 0,
    story: newStoryState(),
  };
}
export function normalizeGuideState(raw) {
  const state = newGuideState();
  if (!raw || typeof raw !== "object") return state;
  state.enabled = raw.enabled === true;
  state.story = normalizeStoryState(raw.story);
  state.volition = bounded(raw.volition, 6, 25);
  state.focus = bounded(raw.focus, 100);
  state.cleanProtection = bounded(raw.cleanProtection, 0, 90);
  for (const key of Object.keys(state.needs))
    state.needs[key] = bounded(raw.needs?.[key], state.needs[key]);
  for (const key of Object.keys(state.inventory))
    state.inventory[key] = Math.floor(
      bounded(raw.inventory?.[key], state.inventory[key], 99),
    );
  state.supplies = Array.isArray(raw.supplies)
    ? [...new Set(raw.supplies.filter((x) => typeof x === "string"))].slice(
        0,
        100,
      )
    : [];
  state.completedCommands = Math.floor(
    bounded(raw.completedCommands, 0, 100000),
  );
  state.collectedSupplies = Array.isArray(raw.collectedSupplies)
    ? [
        ...new Set(
          raw.collectedSupplies.filter((id) => typeof id === "string"),
        ),
      ].slice(0, 100)
    : [];
  state.memory = Object.fromEntries(
    Object.entries(raw.memory || {})
      .filter(
        ([key, value]) => typeof key === "string" && Number.isFinite(value),
      )
      .slice(0, 80),
  );
  if (
    raw.caffeine &&
    ["armed", "active"].includes(raw.caffeine.state) &&
    typeof raw.caffeine.roomId === "string"
  )
    state.caffeine = { state: raw.caffeine.state, roomId: raw.caffeine.roomId };
  // A delivered item is escrowed, never duplicated in both inventory and world.
  // On reload its unclaimed escrow returns once; a picked item has no ledger entry.
  if (Array.isArray(raw.deliveries))
    for (const drop of raw.deliveries.slice(0, 8)) {
      if (["rations", "beans"].includes(drop?.item) && drop.state === "pending")
        state.inventory[drop.item] = Math.min(
          99,
          state.inventory[drop.item] + 1,
        );
    }
  return state;
}
export class Needs {
  constructor(director) {
    this.director = director;
    this.sleepClock = 0;
    this.microSleep = 0;
    this.poisonClock = 0;
    this.panicCooldown = 0;
  }
  get state() {
    return this.director.state.needs;
  }
  get cleanTime() {
    return this.director.state.cleanProtection || 0;
  }
  set cleanTime(value) {
    this.director.state.cleanProtection = clamp(value, 0, 90);
  }
  get conditions() {
    const n = this.state,
      d = this.director,
      result = [];
    if (n.corruption >= 80)
      result.push({
        id: "poison",
        label: "Отравление",
        detail: "Скверна отнимает здоровье. Нужна вода в убежище.",
        severity: "danger",
      });
    if (n.energy <= 3)
      result.push({
        id: "sleep",
        label: "Микросон",
        detail: "Истощение нарушает ритм приказов. Поможет кровать.",
        severity: "danger",
      });
    else if (n.energy < 12)
      result.push({
        id: "tired",
        label: "Усталость",
        detail: "Герой двигается медленнее. Нужен сон.",
        severity: "warning",
      });
    if (n.satiety < 15)
      result.push({
        id: "hunger",
        label: "Голод",
        detail: "Скорость снижена до 70%, урон — до 50%. Нужна еда.",
        severity: "danger",
      });
    else if (n.satiety < 30)
      result.push({
        id: "hungry",
        label: "Пора поесть",
        detail: "Голод нарастает. Найдите припасы или очаг.",
        severity: "warning",
      });
    if (n.stress >= 85)
      result.push({
        id: "panic",
        label: "Паника",
        detail: "Герой напуган, но выполняет приказы. Нужен отдых.",
        severity: "danger",
      });
    if (this.cleanTime > 0)
      result.push({
        id: "clean",
        label: "Чистота",
        detail: "После мытья стресс нарастает медленнее.",
        severity: "good",
      });
    if (this.caffeine)
      result.push({
        id: "coffee",
        label: "Кофе действует",
        detail: "Выносливость закреплена до выхода из комнаты.",
        severity: "good",
      });
    else if (d.state.caffeine?.state === "armed")
      result.push({
        id: "coffee-ready",
        label: "Кофе приготовлен",
        detail: "Бафф включится в следующей опасной комнате.",
        severity: "good",
      });
    return result;
  }
  get caffeine() {
    const d = this.director;
    return (
      d.state.caffeine?.state === "active" &&
      d.state.caffeine.roomId === d.game.room.roomId
    );
  }
  spend(amount) {
    if (this.caffeine) return true;
    if (this.state.stamina + 1e-6 < amount) return false;
    this.state.stamina -= amount;
    this.state.energy = Math.max(0, this.state.energy - amount * 0.025);
    return true;
  }
  update(dt) {
    const d = this.director,
      g = d.game,
      n = this.state,
      moving = Math.abs(g.player.vx) > 30;
    n.energy = Math.max(0, n.energy - dt * (moving ? 0.055 : 0.012));
    n.satiety = Math.max(0, n.satiety - dt * 0.045);
    this.cleanTime = Math.max(0, this.cleanTime - dt);
    const profile = g.room.survival;
    if (profile?.grimeRate > 0 && g.player.y + g.player.h > profile.wetBelowY)
      n.corruption = clamp(n.corruption + profile.grimeRate * dt, 0, 100);
    const dark =
      ["P03", "P09", "R03", "R05", "R09"].includes(g.room.roomId) ||
      profile?.darkness >= 0.5;
    const threat = g.enemies.some(
      (e) => e.hp > 0 && Math.hypot(e.x - g.player.x, e.y - g.player.y) < 260,
    );
    n.stress = clamp(
      n.stress +
        dt *
          (dark || threat
            ? (this.cleanTime ? 0.05 : 0.12) * (1 + n.corruption / 65)
            : -0.3),
      0,
      100,
    );
    if (this.caffeine) n.stamina = 100;
    else
      n.stamina = clamp(
        n.stamina +
          dt *
            (g.player.guard
              ? -5
              : g.player.attackTime > 0 || g.player.rollTime > 0
                ? 0
                : 14),
        0,
        100,
      );
    d.state.focus = Math.min(100, d.state.focus + dt * 0.65);
    this.microSleep = Math.max(0, this.microSleep - dt);
    this.sleepClock += dt;
    if (n.energy <= 3 && this.sleepClock >= 4.2) {
      this.microSleep = 0.18;
      this.sleepClock = 0;
      d.message = "Микросон: герой не успевает за приказом";
    }
    this.panicCooldown = Math.max(0, this.panicCooldown - dt);
    if (n.stress >= 85 && !this.panicCooldown) {
      this.panicCooldown = 12;
      d.message = "Герой в панике. Приказы по-прежнему исполняются.";
      g.emit("sound", "panic");
      g.emit("toast", d.message);
    }
    if (n.corruption >= 80) {
      this.poisonClock += dt;
      if (this.poisonClock >= 18) {
        this.poisonClock = 0;
        g.hurt(1, 1, "corruption");
      }
    } else this.poisonClock = 0;
  }
  get stats() {
    const n = this.state;
    return {
      speed: (n.satiety < 15 ? 0.7 : 1) * (n.energy < 12 ? 0.88 : 1),
      damage: n.satiety < 15 ? 0.5 : 1,
    };
  }
  hurt(amount) {
    this.state.stress = clamp(this.state.stress + amount * 10, 0, 100);
  }
  slain() {
    this.state.corruption = clamp(this.state.corruption + 7, 0, 100);
  }
  eat() {
    this.state.satiety = Math.min(100, this.state.satiety + 55);
    this.state.stress = Math.max(0, this.state.stress - 10);
  }
  coffee(field = false) {
    const d = this.director;
    this.state.stamina = 100;
    this.state.energy = Math.min(100, this.state.energy + 18);
    this.state.stress = Math.max(0, this.state.stress - 15);
    d.state.caffeine = {
      state: field ? "active" : "armed",
      roomId: d.game.room.roomId,
    };
  }
}
