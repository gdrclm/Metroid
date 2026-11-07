import { conditionMet, distance, overlaps, clamp, approach } from "./core.js";
import {
  createPlayer,
  activeSurfaces,
  updatePlayer,
  attackBox,
  lineBlocked,
  safeStandingPoint,
} from "./physics.js";
import {
  accessibleInteraction,
  lockReason,
  safeReturnPoint,
} from "./safety.js";
import { updateCamera } from "./camera.js";
import { record, newStats } from "./telemetry.js";
import { createEnemy, updateEnemy } from "./enemies.js";
import { setFlag, maxHealth, newProgress, fragmentCount } from "./save.js";

export class Game {
  constructor(world, config, store, events = {}) {
    this.world = world;
    this.config = config;
    this.store = store;
    this.events = events;
    this.rooms = new Map(
      [...world.rooms, ...(world.testRoom ? [world.testRoom] : [])].map((r) => [
        r.roomId,
        r,
      ]),
    );
    this.progress = store.load();
    this.mode = "title";
    this.time = 0;
    this.hitStop = 0;
    this.frameTimes = [];
    this.debug = { enabled: false, god: false, fly: false, collisions: false };
    this.viewport = { w: 1280, h: 720 };
    this.requestedViewport = { w: 1280, h: 720 };
    this.camera = { x: 0, y: 0 };
    this.shake = 0;
    this.transition = null;
    this.defeatedOrdinary = new Set();
    this.mechanisms = new Map();
    this.safeHistory = [];
    this.loadRoom("P01", "start", false);
  }
  get flags() {
    return this.progress.flags;
  }
  setViewport(w, h) {
    this.requestedViewport = { w, h };
    this.viewport = {
      w: Math.min(w, this.room.worldBounds.w),
      h: Math.min(h, this.room.worldBounds.h),
    };
    if (this.player) this.snapCamera();
  }
  snapCamera() {
    updateCamera(this, 0, null, true);
  }
  currentSurfaces() {
    const surfaces = activeSurfaces(
      this.room,
      this.flags,
      conditionMet,
      this.time,
    ).filter(
      (s) =>
        !s.mechanismId ||
        (this.mechanisms.get(s.mechanismId)?.value || 0) >= 0.98,
    );
    for (const m of this.mechanisms.values())
      if (m.kind === "gate" && m.value < 0.98)
        surfaces.push({
          id: m.id + ".collider",
          x: m.x - m.w / 2,
          y: m.y - m.h - m.value * m.h,
          w: m.w,
          h: m.h,
          kind: "solid",
          grippable: false,
        });
    return surfaces;
  }
  get abilities() {
    return {
      dash: this.flags.includes("ability.dash"),
      wall_grip: this.flags.includes("ability.wall_grip"),
    };
  }
  emit(name, ...args) {
    this.events[name]?.(...args);
  }
  save() {
    return this.store.write(this.progress);
  }
  flag(flag) {
    if (!setFlag(this.progress, flag)) return false;
    this.save();
    this.emit("progress", flag);
    return true;
  }
  start(fresh = false) {
    if (fresh) {
      this.progress = newProgress();
      this.save();
    }
    let { roomId, spawnPointId } =
      this.progress.retryCheckpoint &&
      !this.flags.includes("boss.courtyard_keeper")
        ? this.progress.retryCheckpoint
        : this.progress.lastRest;
    if (!this.rooms.get(roomId)?.spawnPoints[spawnPointId]) {
      roomId = "P01";
      spawnPointId = "start";
      this.progress.lastRest = { roomId, spawnPointId };
      this.emit("toast", "Точка отдыха недоступна. Возвращаемся на пристань.");
    }
    this.defeatedOrdinary.clear();
    this.health = maxHealth(this.progress);
    this.loadRoom(roomId, spawnPointId);
    this.mode = "playing";
    this.emit("mode", "playing");
  }
  loadRoom(id, spawnId = "start", record = true) {
    const room = this.rooms.get(id),
      spawn = room?.spawnPoints[spawnId];
    if (!room || !spawn) {
      this.emit(
        "toast",
        "Не удалось открыть комнату. Вы можете вернуться к месту отдыха.",
      );
      return false;
    }
    this.room = room;
    const desired = this.requestedViewport || this.viewport;
    this.viewport = {
      w: Math.min(desired.w, room.worldBounds.w),
      h: Math.min(desired.h, room.worldBounds.h),
    };
    this.player = createPlayer(spawn, this.config);
    this.player.invulnerable = 0.6;
    this.enemies = room.entities
      .filter(
        (e) =>
          e.type === "enemy" &&
          !this.flags.includes(e.defeatedFlag) &&
          !this.defeatedOrdinary.has(e.id),
      )
      .map(createEnemy);
    this.projectiles = [];
    this.ambientSeen = new Set();
    this.demonstration = null;
    this.particles = [];
    this.arenaActive = false;
    this.hitStop = 0;
    this.safePoint = { x: spawn.x, y: spawn.y };
    this.safeHistory = [this.safePoint];
    this.transitionCooldown = 0.45;
    this.nearby = null;
    this.surfaces = activeSurfaces(room, this.flags, conditionMet, this.time);
    this.snapCamera();
    this.mechanisms = new Map(
      (room.mechanisms || []).map((m) => [
        m.id,
        { ...m, value: this.flags.includes(m.flag) ? 1 : 0 },
      ]),
    );
    this.surfaces = this.currentSurfaces();
    if (record && room.arena && !this.flags.includes("boss.courtyard_keeper"))
      this.progress.retryCheckpoint = {
        roomId: room.roomId,
        spawnPointId: room.arena.retrySpawn,
      };
    if (record) {
      if (id !== "LAB" && !this.progress.visited.includes(id))
        this.progress.visited.push(id);
      this.save();
      this.emit("room", room);
    }
    return true;
  }
  tryExit(exit) {
    if (this.transition) return false;
    if (
      this.arenaActive &&
      this.enemies.some((e) => e.enemyType === "keeper" && e.hp > 0)
    ) {
      this.emit("toast", "Сначала одолейте смотрителя.");
      return false;
    }
    if (!conditionMet(exit.condition, this.flags)) {
      if (this.blockedExitLatch !== exit.exitId)
        record(this, "blocked_exit", {
          exit: exit.exitId,
          reason: lockReason(exit),
        });
      this.blockedExitLatch = exit.exitId;
      this.emit("toast", lockReason(exit));
      return false;
    }
    if (
      [...this.mechanisms.values()].some(
        (m) => m.controlledExits?.includes(exit.exitId) && m.value < 0.98,
      )
    ) {
      this.emit("toast", "Дождитесь открытия прохода.");
      return false;
    }
    if (exit.condition && JSON.stringify(exit.condition).includes("shortcut."))
      record(this, "shortcut", { exit: exit.exitId });
    if (!this.progress.seenExits.includes(exit.exitId))
      this.progress.seenExits.push(exit.exitId);
    if (!this.rooms.get(exit.targetRoomId)?.spawnPoints[exit.spawnPointId]) {
      this.emit(
        "toast",
        "Проход повреждён. Вернитесь к месту отдыха из меню паузы.",
      );
      return false;
    }
    const velocity =
      exit.type === "passage"
        ? clamp(this.player.vx, -this.config.maxSpeed, this.config.maxSpeed)
        : 0;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.attackTime = 0;
    this.player.state = "transition";
    this.transition = {
      exit,
      elapsed: 0,
      duration:
        exit.type === "lift" ? 2.4 : exit.type === "passage" ? 0.24 : 0.55,
      velocity,
      loaded: false,
    };
    if (exit.type === "lift") this.emit("toast", "Подъёмник в пути…");
    return true;
  }
  interact() {
    const target = this.nearby;
    if (!target || !accessibleInteraction(this.player, target, this.surfaces))
      return;
    if (target.exitId) {
      this.tryExit(target);
      return;
    }
    if (target.requires && !conditionMet(target.requires, this.flags)) {
      this.emit("toast", lockReason(target));
      return;
    }
    if (target.type === "ability") {
      if (this.flag(target.flag)) {
        this.demonstration = {
          type: target.reward,
          x: target.x,
          y: target.y,
          t: 0,
        };
        this.burst(target.x, target.y, 30, "#ddc58e");
        this.emit("sound", "ability");
        this.emit("toast", target.title + " · способность получена");
      }
    } else if (target.type === "pickup") {
      if (this.flag(target.flag)) {
        if (target.flag === "pickup.p03_upper") record(this, "late_secret");
        if (target.reward === "health") this.health = maxHealth(this.progress);
        this.burst(target.x, target.y, 20, "#ddc58e");
        this.emit("sound", "pickup");
        this.emit(
          "toast",
          target.reward === "health"
            ? "Сердце города найдено. Здоровье увеличено."
            : target.title + " · найден осколок памяти",
        );
      }
    } else if (target.type === "retry") {
      this.progress.retryCheckpoint = {
        roomId: this.room.roomId,
        spawnPointId: this.room.arena.retrySpawn,
      };
      this.health = maxHealth(this.progress);
      this.save();
      this.emit("sound", "rest");
      this.emit("toast", "Лампа зажжена. После поражения вы вернётесь сюда.");
    } else if (target.type === "rest") {
      this.defeatedOrdinary.clear();
      this.progress.retryCheckpoint = null;
      const spawnId = "rest." + target.id;
      this.room.spawnPoints[spawnId] = {
        x: target.x - 12,
        y: target.y - this.config.height,
        safeRadius: 28,
      };
      this.progress.lastRest = {
        roomId: this.room.roomId,
        spawnPointId: spawnId,
      };
      if (!this.progress.rests.includes(target.id))
        this.progress.rests.push(target.id);
      this.health = maxHealth(this.progress);
      this.loadRoom(this.room.roomId, spawnId, false);
      this.save();
      this.emit("sound", "rest");
      this.emit("toast", "Здоровье восстановлено · место отдыха сохранено");
      this.burst(target.x, target.y - 20, 22, "#e0b36b");
    } else if (target.type === "lever" || target.type === "repair") {
      if (this.flag(target.flag)) {
        this.emit("sound", "lever");
        this.emit("toast", target.text);
        this.shake = target.flag.includes("bridge") ? 0.4 : 0.2;
        this.burst(target.x, target.y - 40, 20, "#d4b47b");
      } else this.emit("toast", "Механизм уже работает.");
    } else if (target.type === "npc" || target.type === "barrier") {
      if (
        target.giftFlag &&
        conditionMet(target.giftRequires, this.flags) &&
        this.flag(target.giftFlag)
      )
        this.emit("sound", "pickup");
      let text = target.text;
      if (target.id === "npc.clockmaker") {
        if (!this.flags.includes("mechanism.clockwork"))
          text = "Поверни маховик на верстаке. Я попробую запустить часы.";
        else if (fragmentCount(this.progress) >= 3) {
          this.flag("story.clockmaker_memory");
          text =
            "Три осколка помнят утро. Прими золотую нить для шарфа. А сердце города ищи над соляным складом.";
        }
      }
      if (target.id === "npc.station_keeper" && this.abilities.wall_grip)
        text =
          "Ты вернулся с крыш. Значит, город ещё не забыл, как встречать рассвет. Верхняя ниша соляного склада теперь тебе по силам.";
      else if (
        target.id !== "npc.clockmaker" &&
        target.giftFlag &&
        this.flags.includes(target.giftFlag) &&
        this.progress.hints.includes(target.id)
      )
        text = "Ты уже взял осколок. Возвращайся, когда город снова проснётся.";
      if (!this.progress.hints.includes(target.id)) {
        this.progress.hints.push(target.id);
        this.save();
      }
      this.emit("dialogue", target.title, text);
    } else if (target.type === "ending") {
      if (this.flag(target.flag)) {
        this.emit("sound", "ability");
        this.emit("complete");
      } else
        this.emit(
          "toast",
          "Сады, литейные и архив. Когда-нибудь вы доберётесь и туда.",
        );
    }
  }
  findNearby() {
    const p = {
      x: this.player.x + this.player.w / 2,
      y: this.player.y + this.player.h,
    };
    const candidates = [
      ...this.room.entities.filter(
        (e) =>
          e.type !== "enemy" &&
          !(
            e.flag &&
            this.flags.includes(e.flag) &&
            ["pickup", "ability"].includes(e.type)
          ),
      ),
      ...this.room.exits,
    ];
    const rank = (e) =>
      e.type === "ability"
        ? 0
        : e.type === "pickup"
          ? 1
          : e.type === "rest"
            ? 2
            : e.type === "npc"
              ? 3
              : e.type === "lever"
                ? 4
                : 5;
    return (
      candidates
        .filter(
          (e) =>
            (e.type !== "passage" || !conditionMet(e.condition, this.flags)) &&
            accessibleInteraction(this.player, e, this.surfaces),
        )
        .sort(
          (a, b) => rank(a) - rank(b) || distance(p, a) - distance(p, b),
        )[0] || null
    );
  }
  hurt(amount, direction = 1, cause = "enemy") {
    const p = this.player;
    if (
      this.mode !== "playing" ||
      this.transition ||
      p.invulnerable > 0 ||
      this.debug.god ||
      (this.config.dashInvulnerable && p.dashTime > 0)
    )
      return false;
    this.health -= this.progress.settings.assist ? amount * 0.5 : amount;
    record(this,'damage',{cause,amount});
    p.invulnerable = this.config.hurtInvulnerability;
    p.hurtTime = 0.23;
    p.dashTime = 0;
    p.vx = direction * 245;
    p.vy = -230;
    this.shake = 0.22;
    this.emit("sound", "hurt");
    this.burst(p.x + p.w / 2, p.y + 20, 15, "#cb927c");
    if (this.health <= 0) this.die(cause);
    return true;
  }
  die(cause = "enemy") {
    if (this.mode === "death") return;
    this.mode = "death";
    this.player.state = "dead";
    this.player.vx = 0;
    this.player.vy = 0;
    this.progress.deaths++;
    record(this, "death", { cause });
    this.defeatedOrdinary.clear();
    this.save();
    this.emit("sound", "death");
    this.emit("mode", "death");
  }
  respawn(forceRest = false) {
    if (forceRest) this.progress.retryCheckpoint = null;
    this.health = maxHealth(this.progress);
    const { roomId, spawnPointId } =
      !forceRest &&
      this.progress.retryCheckpoint &&
      !this.flags.includes("boss.courtyard_keeper")
        ? this.progress.retryCheckpoint
        : this.progress.lastRest;
    this.defeatedOrdinary.clear();
    this.loadRoom(roomId, spawnPointId);
    this.player.invulnerable = 1.5;
    this.mode = "playing";
    if (forceRest) this.save();
    this.emit("mode", "playing");
  }
  localReturn() {
    if (this.mode !== "playing") return;
    record(this, "fall");
    this.hurt(1, 1, "fall");
    if (this.mode === "death") return;
    const recoverySurfaces = [
      ...this.surfaces,
      ...this.enemies.filter((e) => e.hp > 0).map((e) => ({
        id: e.id + ".avoid",
        x: e.x - 20,
        y: e.y - 10,
        w: e.w + 40,
        h: e.h + 10,
        kind: "hazard",
      })),
    ];
    const point = safeReturnPoint(
      this.player,
      recoverySurfaces,
      this.room.worldBounds,
      [
        this.safePoint,
        ...this.safeHistory.slice().reverse(),
        ...Object.values(this.room.spawnPoints),
      ],
    );
    if (!point) {
      this.respawn();
      return;
    }
    Object.assign(this.player, {
      x: point.x,
      y: point.y,
      vx: 0,
      vy: 0,
      dashTime: 0,
      dashReady: true,
      invulnerable: 1,
      support: null,
      dropTime: 0,
      dropSurfaces: [],
      attackTime: 0,
    });
    this.player.grounded = true;
    this.snapCamera();
  }
  burst(x, y, count, color) {
    if (this.progress.settings.reducedFlash) count = Math.ceil(count * 0.4);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2,
        s = 30 + Math.random() * 130;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.4 + Math.random() * 0.5,
        maxLife: 1,
        color,
        size: 1 + Math.random() * 2,
      });
    }
    if (this.particles.length > 160)
      this.particles.splice(0, this.particles.length - 160);
  }
  update(dt, input) {
    if (this.mode !== "playing") return;
    if(!['left','right','up','down','interact'].some(k=>input.down(k)||input.pressed(k)))this.blockedExitLatch=null;
    this.time += dt;
    this.progress.playTime += dt;
    this.progress.stats || (this.progress.stats = newStats());
    this.progress.stats.roomTime[this.room.roomId] =
      (this.progress.stats.roomTime[this.room.roomId] || 0) + dt;
    this.transitionCooldown = Math.max(0, (this.transitionCooldown || 0) - dt);
    for (const m of this.mechanisms.values()) {
      const target = this.flags.includes(m.flag) ? 1 : 0;
      m.value = approach(m.value, target, dt / (m.duration || 0.7));
    }
    this.shake = Math.max(0, this.shake - dt);
    if (this.demonstration) {
      this.demonstration.t += dt;
      if (this.demonstration.t > 1) this.demonstration = null;
    }
    if (this.transition) {
      this.transition.elapsed += dt;
      if (
        !this.transition.loaded &&
        this.transition.elapsed >= this.transition.duration / 2
      ) {
        const { exit } = this.transition;
        this.loadRoom(exit.targetRoomId, exit.spawnPointId);
        if (exit.type === "passage") this.player.vx = this.transition.velocity;
        this.transition.loaded = true;
      }
      if (this.transition.elapsed >= this.transition.duration)
        this.transition = null;
      return;
    }
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return;
    }
    this.surfaces = this.currentSurfaces();
    const p = this.player;
    // A moving support carries its rider before player-controlled movement.
    if (p.grounded && p.support) {
      const s = this.surfaces.find((s) => s.id === p.support.id);
      if (s?.motion) {
        p.x += s.x - p.support.x;
        p.y += s.y - p.support.y;
      }
    }
    if (this.debug.fly) {
      p.vx = 0;
      p.vy = 0;
      p.x = clamp(
        p.x +
          (Number(input.down("right")) - Number(input.down("left"))) * 550 * dt,
        0,
        this.room.worldBounds.w - p.w,
      );
      p.y = clamp(
        p.y +
          (Number(input.down("down")) - Number(input.down("up"))) * 550 * dt,
        0,
        this.room.worldBounds.h - p.h,
      );
    } else
      updatePlayer(
        p,
        input,
        dt,
        this.surfaces,
        this.config,
        this.abilities,
        this.room.worldBounds,
        (event) => {
          if (event === "fallOut" || event === "hazard") this.localReturn();
          else {
            const learned = {
              dash: "dash",
              wallJump: "wall",
              jump: "jump",
              wallGrip: "grip",
              platformDrop: "drop",
            }[event];
            if (
              learned &&
              !this.progress.hints.includes("training." + learned)
            ) {
              this.progress.hints.push("training." + learned);
              this.save();
            }
            this.emit("sound", event);
            if (event === "dash")
              this.burst(p.x + p.w / 2, p.y + 24, 16, "#8ec3c2");
            if (event === "land") this.burst(p.x + 12, p.y + p.h, 5, "#a7a68d");
          }
        },
      );
    const support = this.surfaces.find((s) => s.id === p.contact?.surface);
    p.support = support ? { id: support.id, x: support.x, y: support.y } : null;
    if (
      p.grounded &&
      safeStandingPoint(p, this.surfaces, this.room.worldBounds)
    ) {
      if (
        !this.safePoint ||
        Math.hypot(p.x - this.safePoint.x, p.y - this.safePoint.y) > 32
      ) {
        this.safeHistory.push(this.safePoint);
        if (this.safeHistory.length > 12) this.safeHistory.shift();
      }
      this.safePoint = { x: p.x, y: p.y };
    }
    if (p.state === "run" && p.grounded) {
      p.stepTimer += dt;
      if (p.stepTimer > 0.32) {
        p.stepTimer = 0;
        this.emit("sound", "step");
      }
    }
    if (p.dashTime > 0) {
      if (p.trail.length === 0 || p.trail.at(-1).life < 0.13)
        p.trail.push({ x: p.x, y: p.y, facing: p.facing, life: 0.17 });
    }
    for (const t of p.trail) t.life -= dt;
    p.trail = p.trail.filter((t) => t.life > 0);
    if (input.pressed("attack") && p.attackTime <= 0 && p.hurtTime <= 0) {
      p.attackTime =
        this.config.attackWindup +
        this.config.attackActive +
        this.config.attackRecovery;
      p.attackId++;
      this.emit("sound", "attack");
    }
    if (p.attackTime > 0) {
      p.attackTime -= dt;
      const active =
        p.attackTime > this.config.attackRecovery &&
        p.attackTime <= this.config.attackRecovery + this.config.attackActive;
      if (active) {
        const box = attackBox(p, this.config);
        for (const e of this.enemies) {
          if (
            e.hp <= 0 ||
            e.lastHit === p.attackId ||
            !overlaps(e, box) ||
            lineBlocked(
              { x: p.x + p.w / 2, y: p.y + p.h / 2 },
              { x: e.x + e.w / 2, y: p.y + p.h / 2 },
              this.surfaces,
            )
          )
            continue;
          e.lastHit = p.attackId;
          e.hp -= this.config.attackDamage;
          e.flash = 0.15;
          if (e.enemyType !== "keeper") {
            e.vx = p.facing * 190;
            e.state = "stunned";
            e.timer = 0.32;
          }
          this.burst(e.x + e.w / 2, e.y + e.h / 2, 12, "#e0c88f");
          this.emit("sound", "hit");
          this.hitStop = 0.035;
          this.shake = 0.08;
          if (e.hp <= 0) {
            if (!e.defeatedFlag) this.defeatedOrdinary.add(e.id);
            this.projectiles = this.projectiles.filter((s) => s.owner !== e.id);
            this.burst(e.x + e.w / 2, e.y + e.h / 2, 25, "#b6a16d");
            if (e.defeatedFlag && this.flag(e.defeatedFlag)) {
              this.progress.retryCheckpoint = null;
              this.arenaActive = false;
              this.emit(
                "toast",
                "Смотритель повержен. Лестница и механизм моста свободны.",
              );
            }
          }
        }
      }
    }
    for (const e of this.enemies) updateEnemy(e, p, dt, this.surfaces, this);
    for (const shot of this.projectiles) {
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
      if (overlaps(p, shot)) {
        if (this.hurt(1, shot.vx >= 0 ? 1 : -1,shot.wave?'keeper_wave':'parasite_projectile')) shot.life = 0;
      }
      if (
        this.surfaces.some(
          (s) =>
            s.kind !== "oneWay" && s.kind !== "hazard" && overlaps(shot, s),
        )
      )
        shot.life = 0;
    }
    this.projectiles = this.projectiles.filter(
      (s) => s.life > 0 && s.x > -100 && s.x < this.room.worldBounds.w + 100,
    );
    for (const s of this.particles) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 120 * dt;
      s.life -= dt;
    }
    this.particles = this.particles.filter((s) => s.life > 0);
    this.nearby = this.findNearby();
    if (input.pressed("interact")) this.interact();
    if (!this.transition && this.transitionCooldown <= 0)
      for (const exit of this.room.exits) {
        const moving =
          exit.direction === "left"
            ? input.down("left")
            : exit.direction === "right"
              ? input.down("right")
              : false;
        const activate =
          exit.type === "passage"
            ? moving && overlaps(p, exit.triggerZone)
            : exit.type === "stairs" &&
              input.pressed(exit.direction) &&
              accessibleInteraction(p, exit, this.surfaces);
        if (activate) {
          this.tryExit(exit);
          break;
        }
      }
    updateCamera(this, dt, input);
    const view = {
      x: this.camera.x,
      y: this.camera.y,
      w: this.viewport.w,
      h: this.viewport.h,
    };
    if (this.room.roomId === "R08")
      for (const e of this.room.entities)
        if (
          e.id.startsWith("horizon.") &&
          Math.abs(e.x - p.x) < 170 &&
          !this.ambientSeen.has(e.id)
        ) {
          this.ambientSeen.add(e.id);
          this.emit(
            "sound",
            e.title === "Висячие сады"
              ? "horizonGardens"
              : e.title === "Литейные"
                ? "horizonForge"
                : "horizonArchive",
          );
        }
    for (const exit of this.room.exits) {
      const point = { x: exit.x - 10, y: exit.y - 65, w: 20, h: 65 };
      if (
        !this.progress.seenExits.includes(exit.exitId) &&
        overlaps(view, point) &&
        (!exit.hidden || Math.abs(exit.x - p.x) < 60) &&
        !lineBlocked(
          { x: p.x + p.w / 2, y: p.y + p.h / 2 },
          { x: exit.x, y: exit.y - 30 },
          this.surfaces,
          { ignoreId: exit.colliderId },
        )
      )
        this.progress.seenExits.push(exit.exitId);
    }
  }
}
