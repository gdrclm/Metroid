import { accessibleInteraction } from "../safety.js";
import { Commands, heroInput } from "./commands.js";
import { Needs, newGuideState } from "./needs.js";
import { Interventions } from "../guide/interventions.js";
import { ActOneStory } from "../story.js";
import { Supplies } from "../guide/supplies.js";
import { HeroBrain } from "./brain.js";

export class HeroDirector {
  constructor(game) {
    this.game = game;
    this.commands = new Commands(this);
    this.brain = new HeroBrain(this);
    this.needs = new Needs(this);
    this.tools = new Interventions(this);
    this.story = new ActOneStory(this);
    this.supplies = new Supplies(this);
    this.safehouseLatch = null;
    this.generation = 0;
    this.worldRevision = 0;
    this.attackTarget = null;
    this.message = "Акт I: герой ждёт вашей помощи";
    this.safehouseId = null;
    this.forecast = null;
  }
  get state() {
    return (this.game.progress.guide ||= newGuideState());
  }
  get enabled() {
    return this.state.enabled;
  }
  get obedience() {
    return 1;
  }
  roomEntered() {
    if (!this.enabled) return;
    this.commands.clear();
    this.tools.leave();
    this.attackTarget = null;
    this.generation++;
    this.forecast = null;
    const g = this.game,
      buff = this.state.caffeine;
    this.brain.roomEntered();
    if (this.safehouseLatch?.roomId !== g.room.roomId)
      this.safehouseLatch = null;
    if (buff?.state === "active" && buff.roomId !== g.room.roomId)
      this.state.caffeine = null;
    else if (
      buff?.state === "armed" &&
      buff.roomId !== g.room.roomId &&
      !g.room.entities.some((e) => e.type === "rest")
    )
      this.state.caffeine = { state: "active", roomId: g.room.roomId };
    if (this.needs.caffeine) this.state.needs.stamina = 100;
  }
  beforeStep(dt) {
    if (!this.enabled) return null;
    this.needs.update(dt);
    if (this.game.mode !== "playing") return heroInput();
    this.tools.update(dt);
    if (this.game.transition || this.game.hitStop > 0) return heroInput();
    this.brain.observe(dt);
    for (const e of this.game.enemies)
      if (
        e.hp > 0 &&
        e.state === "windup" &&
        Math.abs(e.x - this.game.player.x) < 400
      ) {
        const key = e.enemyType + ":" + (e.attackKind || "attack");
        this.state.memory[key] = Math.min(
          9999,
          (this.state.memory[key] || 0) + dt,
        );
      }
    if (this.needs.microSleep > 0) {
      this.brain.setIntent("recover", "Сонливость: удерживает равновесие");
      return heroInput();
    }
    return this.commands.step(dt);
  }
  afterHurt(amount) {
    if (this.enabled) this.needs.hurt(amount);
  }
  enemyHit(enemy) {
    if (!this.enabled) return;
    const c = this.commands.current;
    if (c?.type === "attack" && (!c.enemyId || c.enemyId === enemy.id))
      c.hit = true;
    if (
      this.attackTarget?.enemyId === enemy.id &&
      this.attackTarget.limb === "legs"
    ) {
      if (!enemy.kneelTime && !enemy.kneelCooldown)
        enemy.legHits = (enemy.legHits || 0) + 1;
      if (
        enemy.legHits >= 2 &&
        enemy.hp > 0 &&
        !enemy.kneelTime &&
        !enemy.kneelCooldown
      ) {
        enemy.legHits = 0;
        enemy.standingHeight = enemy.h;
        const newHeight = enemy.h * 0.65;
        enemy.y += enemy.h - newHeight;
        enemy.h = newHeight;
        enemy.kneelTime = 2.4;
        enemy.state = "recovery";
        enemy.timer = 2.4;
        enemy.vx = 0;
        this.message = "Нога подкошена: смотритель опустился ниже";
      }
    }
    if (enemy.hp <= 0) this.needs.slain();
  }
  openSafehouse(target) {
    this.brain.holdPosition("Остаётся у места отдыха");
    this.safehouseLatch = { roomId: this.game.room.roomId, id: target.id };
    this.safehouseId = target.id;
    this.commands.clear();
    this.game.player.vx = 0;
    if (!this.state.supplies.includes(target.id)) {
      this.state.supplies.push(target.id);
      this.state.inventory.rations = Math.min(
        99,
        this.state.inventory.rations + 2,
      );
      this.state.inventory.beans = Math.min(99, this.state.inventory.beans + 1);
    }
    this.game.mode = "safehouse";
    this.story.sync(true);
    this.game.save();
    this.game.emit("mode", "safehouse");
  }
  enterSafehouseZone() {
    const g = this.game;
    if (!this.enabled || g.mode !== "playing" || g.transition) return false;
    const rest = g.room.entities.find(
      (e) =>
        e.type === "rest" && accessibleInteraction(g.player, e, g.surfaces),
    );
    if (!rest) {
      this.safehouseLatch = null;
      return false;
    }
    if (!g.player.grounded || this.safehouseLatch?.id === rest.id) return false;
    this.openSafehouse(rest);
    return true;
  }
  safehouseAction(action) {
    const g = this.game,
      target = g.room.entities.find(
        (e) => e.id === this.safehouseId && e.type === "rest",
      );
    if (
      g.mode !== "safehouse" ||
      !target ||
      !accessibleInteraction(g.player, target, g.surfaces)
    )
      return { ok: false, reason: "Герой должен находиться у места отдыха" };
    const n = this.state.needs;
    if (action === "bed") {
      n.energy = 100;
      n.stress = Math.max(0, n.stress - 50);
      this.needs.microSleep = 0;
      this.needs.sleepClock = 0;
      g.restAt(target);
      this.message = "Сон вернул силы. Точка отдыха сохранена.";
    } else if (action === "food") {
      if (this.state.inventory.rations < 1)
        return { ok: false, reason: "Припасов для похлёбки нет" };
      this.state.inventory.rations--;
      this.needs.eat();
      this.message = "Горячая похлёбка утолила голод";
    } else if (action === "wash") {
      n.corruption = 0;
      n.stress = Math.max(0, n.stress - 20);
      this.needs.cleanTime = 90;
      this.message = "Грязь смыта. Напряжение нарастает медленнее.";
    } else if (action === "coffee") {
      if (this.state.inventory.beans < 1)
        return { ok: false, reason: "Зёрна закончились" };
      this.state.inventory.beans--;
      this.needs.coffee();
      this.message = "Кофе готов: эффект включится в следующей опасной комнате";
    } else return { ok: false, reason: "Неизвестное действие" };
    g.save();
    g.emit("sound", "rest");
    return { ok: true };
  }
  respawned() {
    if (!this.enabled) return;
    const n = this.state.needs;
    n.energy = Math.max(40, n.energy);
    n.satiety = Math.max(25, n.satiety);
    n.stress = Math.min(55, n.stress);
    n.stamina = 100;
  }
  snapshot() {
    return structuredClone({
      generation: this.generation,
      worldRevision: this.worldRevision,
      message: this.message,
      attackTarget: this.attackTarget,
      safehouseId: this.safehouseId,
      safehouseLatch: this.safehouseLatch,
      brain: this.brain.snapshot(),
      commands: {
        items: this.commands.items,
        serial: this.commands.serial,
        revision: this.commands.revision,
        result: this.commands.result,
      },
      tools: {
        structures: this.tools.structures,
        drops: this.tools.drops,
        lure: this.tools.lure,
        serial: this.tools.serial,
      },
      needs: {
        sleepClock: this.needs.sleepClock,
        microSleep: this.needs.microSleep,
        poisonClock: this.needs.poisonClock,
        panicCooldown: this.needs.panicCooldown,
        cleanTime: this.needs.cleanTime,
      },
    });
  }
  restore(snapshot) {
    Object.assign(this, {
      generation: snapshot.generation,
      worldRevision: snapshot.worldRevision,
      message: snapshot.message,
      attackTarget: snapshot.attackTarget,
      safehouseId: snapshot.safehouseId,
      safehouseLatch: snapshot.safehouseLatch || null,
    });
    Object.assign(this.commands, snapshot.commands);
    this.brain.restore(snapshot.brain);
    Object.assign(this.tools, snapshot.tools);
    Object.assign(this.needs, snapshot.needs);
  }
}
