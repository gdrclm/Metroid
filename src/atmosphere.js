import { conditionMet } from "./core.js";
import { Particles } from "./particles.js";

export class Atmosphere {
  constructor(game) {
    this.game = game;
    this.active = new Map();
    this.wind = { x: 0, gust: 0 };
    this.particles = new Particles(game);
    this.events = game.world.rooms.flatMap((room) =>
      (room.storyEvents || []).map((e) => ({ ...e, roomId: room.roomId })),
    );
  }
  condition(condition) {
    const scenes = { ...this.game.progress.scenes };
    const preview = this.game.debug.atmospherePreview;
    if (preview && preview !== "live")
      for (const e of this.events)
        if (
          e.roomId === this.game.room.roomId ||
          e.followRooms?.includes(this.game.room.roomId)
        )
          scenes[e.id] = preview === "after";
    return conditionMet(condition, this.previewFlags(), { scenes });
  }
  previewFlags() {
    const g = this.game,
      mode = g.debug.atmospherePreview;
    if (!mode || mode === "live") return g.flags;
    const flags = new Set(g.flags);
    for (const e of this.events)
      if (
        e.roomId === g.room.roomId ||
        e.followRooms?.includes(g.room.roomId)
      ) {
        const flag = e.terminalFlag || e.trigger.flag;
        if (flag) mode === "after" ? flags.add(flag) : flags.delete(flag);
      }
    return [...flags];
  }
  phase(id) {
    const g = this.game,
      preview = g.debug.atmospherePreview;
    if (preview && preview !== "live") return preview === "after" ? 1 : 0;
    const active = this.active.get(id);
    if (active) return Math.min(1, active.time / active.definition.duration);
    const e = this.events.find((e) => e.id === id);
    return g.progress.scenes[id] ||
      (e?.terminalFlag && g.flags.includes(e.terminalFlag))
      ? 1
      : 0;
  }
  load(room, record) {
    this.events = this.game.world.rooms.flatMap((r) =>
      (r.storyEvents || []).map((e) => ({ ...e, roomId: r.roomId })),
    );
    this.particles.load();
    for (const [id, state] of this.active)
      if (
        state.definition.roomId !== room.roomId &&
        !state.definition.followRooms?.includes(room.roomId)
      )
        this.active.delete(id);
    if (record) this.trigger("enter");
  }
  trigger(type, detail = {}) {
    const g = this.game;
    for (const e of this.events) {
      const t = e.trigger;
      if (
        e.roomId !== g.room.roomId ||
        t.type !== type ||
        g.progress.scenes[e.id] ||
        !this.condition(e.requires)
      )
        continue;
      if (
        (t.flag && t.flag !== detail.flag) ||
        (t.entity && t.entity !== detail.entity) ||
        (t.targetRoom && t.targetRoom !== detail.exit?.targetRoomId) ||
        (t.travelType && t.travelType !== detail.exit?.type)
      )
        continue;
      this.start(e);
    }
  }
  start(e) {
    // Commit the endpoint before effects. Interruptions settle there, without replay.
    this.game.progress.scenes[e.id] = true;
    const state = { definition: e, time: 0, fired: new Set() };
    this.active.set(e.id, state);
    this.game.save();
    this.effects(state);
  }
  effects(state) {
    for (let i = 0; i < state.definition.effects.length; i++) {
      const effect = state.definition.effects[i];
      if (state.fired.has(i) || state.time < effect.at) continue;
      state.fired.add(i);
      if (effect.type === "sound")
        this.game.emit("sound", effect.name, {
          ...effect,
          roomId: this.game.room.roomId,
          sceneId: state.definition.id,
        });
      if (
        effect.type === "particles" &&
        (!effect.roomId || effect.roomId === this.game.room.roomId)
      ) {
        const emitter = this.game.room.emitters?.find(
          (e) => e.id === effect.emitter,
        );
        if (emitter) this.particles.emit(emitter, effect.count || 16, 1);
      }
    }
  }
  update(dt) {
    const g = this.game,
      exposure = g.room.atmosphere?.exposure || 0.2;
    this.wind.gust =
      0.55 + Math.sin(g.time * 0.43) * 0.25 + Math.sin(g.time * 0.19 + 2) * 0.2;
    this.wind.x = exposure * (12 + this.wind.gust * 34);
    for (const e of this.events)
      if (
        e.roomId === g.room.roomId &&
        e.trigger.type === "proximity" &&
        !g.progress.scenes[e.id] &&
        Math.hypot(g.player.x - e.trigger.x, g.player.y - e.trigger.y) <
          e.trigger.radius &&
        this.condition(e.requires)
      )
        this.start(e);
    for (const [id, state] of this.active) {
      state.time += dt;
      this.effects(state);
      if (state.time >= state.definition.duration) this.active.delete(id);
    }
    this.particles.update(dt);
  }
  feedback(action, detail = {}) {
    const g = this.game,
      p = g.player,
      x = detail.x ?? p.x + p.w / 2,
      y = detail.y ?? p.y + p.h;
    const surface =
      g.surfaces.find((s) => s.id === (p.contact?.surface || p.wallSurface)) ||
      g.surfaces.find(
        (s) => Math.abs(s.y - y) < 2 && x >= s.x && x <= s.x + s.w,
      );
    const material =
      detail.material ||
      surface?.material ||
      (g.room.regionId === "pier"
        ? "wood"
        : g.room.regionId === "station"
          ? "metal"
          : "stone");
    g.emit("sound", action, { x, y, material, roomId: g.room.roomId });
    const effects = {
      land:
        material === "wetWood"
          ? "spray"
          : material === "metal"
            ? "rust"
            : "dust",
      dash: "dash",
      dashRecharge: "recharge",
      wallGrip: "dust",
      wallJump: "dust",
      hit: detail.material === "stone" ? "impact" : "spark",
      hurt: "hurt",
    };
    if (!effects[action]) return;
    const wall = action === "wallGrip" || action === "wallJump";
    this.particles.burst(
      effects[action],
      wall ? p.x + (p.wall > 0 ? p.w : 0) : x,
      wall ? p.y + 25 : y,
      action === "land"
        ? detail.speed > 650
          ? 14
          : 5
        : action === "dash"
          ? 12
          : 7,
      {
        direction: {
          x: action === "dash" ? -p.facing : wall ? -(p.wall || p.facing) : 0,
          y: action === "dash" ? 0 : -1,
        },
        speed: action === "dash" ? [70, 160] : [18, 65],
        life: action === "dash" ? [0.1, 0.25] : [0.2, 0.55],
        layer: "gameplay",
        area:
          action === "land"
            ? { w: detail.speed > 650 ? 36 : 12, h: 0 }
            : undefined,
      },
    );
  }
}
