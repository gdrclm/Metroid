import { conditionMet, distance, overlaps, clamp } from "./core.js";
import {
  createPlayer,
  activeSurfaces,
  updatePlayer,
  attackBox,
  lineBlocked,
} from "./physics.js";
import { createEnemy, updateEnemy } from "./enemies.js";
import { setFlag, maxHealth, newProgress } from "./save.js";

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
    this.camera = { x: 0, y: 0 };
    this.shake = 0;
    this.transition = null;
    this.loadRoom("P01", "start", false);
  }
  get flags() {
    return this.progress.flags;
  }
  setViewport(w, h) {
    this.viewport = { w, h };
    if (this.player) this.snapCamera();
  }
  snapCamera() {
    const { w, h } = this.viewport;
    this.camera = {
      x: clamp(
        this.player.x - w / 2,
        0,
        Math.max(0, this.room.worldBounds.w - w),
      ),
      y: clamp(
        this.player.y - h * 0.61,
        0,
        Math.max(0, this.room.worldBounds.h - h),
      ),
    };
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
    let { roomId, spawnPointId } = this.progress.lastRest;
    if (!this.rooms.get(roomId)?.spawnPoints[spawnPointId]) {
      roomId = "P01";
      spawnPointId = "start";
      this.progress.lastRest = { roomId, spawnPointId };
      this.emit("toast", "Точка отдыха недоступна. Возвращаемся на пристань.");
    }
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
    this.player = createPlayer(spawn, this.config);
    this.player.invulnerable = 0.6;
    this.enemies = room.entities
      .filter((e) => e.type === "enemy" && !this.flags.includes(e.defeatedFlag))
      .map(createEnemy);
    this.projectiles = [];
    this.particles = [];
    this.arenaActive = false;
    this.hitStop = 0;
    this.safePoint = { x: spawn.x, y: spawn.y };
    this.nearby = null;
    this.surfaces = activeSurfaces(room, this.flags, conditionMet, this.time);
    this.snapCamera();
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
      this.emit("toast", exit.lockedReason);
      return false;
    }
    if (!this.rooms.get(exit.targetRoomId)?.spawnPoints[exit.spawnPointId]) {
      this.emit(
        "toast",
        "Проход повреждён. Вернитесь к месту отдыха из меню паузы.",
      );
      return false;
    }
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.attackTime = 0;
    this.player.state = "transition";
    this.transition = {
      exit,
      elapsed: 0,
      duration: exit.type === "lift" ? 1.8 : 0.65,
      loaded: false,
    };
    if (exit.type === "lift") this.emit("toast", "Подъёмник в пути…");
    return true;
  }
  interact() {
    const target = this.nearby;
    if (!target) return;
    if (target.exitId) {
      this.tryExit(target);
      return;
    }
    if (target.requires && !conditionMet(target.requires, this.flags)) {
      this.emit("toast", "Механизм удерживает смотритель двора.");
      return;
    }
    if (target.type === "ability") {
      if (this.flag(target.flag)) {
        this.burst(target.x, target.y, 30, "#ddc58e");
        this.emit("sound", "ability");
        this.emit("toast", target.title + " · способность получена");
      }
    } else if (target.type === "pickup") {
      if (this.flag(target.flag)) {
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
    } else if (target.type === "rest") {
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
    } else if (target.type === "lever") {
      if (this.flag(target.flag)) {
        this.emit("sound", "lever");
        this.emit("toast", target.text);
        this.shake = target.flag.includes("bridge") ? 0.4 : 0.2;
        this.burst(target.x, target.y - 40, 20, "#d4b47b");
      } else this.emit("toast", "Механизм уже работает.");
    } else if (target.type === "npc" || target.type === "barrier") {
      if (target.giftFlag && this.flag(target.giftFlag))
        this.emit("sound", "pickup");
      let text = target.text;
      if (target.id === "npc.station_keeper" && this.abilities.wall_grip)
        text =
          "Ты вернулся с крыш. Значит, город ещё не забыл, как встречать рассвет. Верхняя ниша соляного склада теперь тебе по силам.";
      else if (
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
        .filter((e) => Math.abs(e.x - p.x) < 78 && Math.abs(e.y - p.y) < 88)
        .sort(
          (a, b) => rank(a) - rank(b) || distance(p, a) - distance(p, b),
        )[0] || null
    );
  }
  hurt(amount, direction = 1) {
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
    p.invulnerable = this.config.hurtInvulnerability;
    p.hurtTime = 0.23;
    p.dashTime = 0;
    p.vx = direction * 245;
    p.vy = -230;
    this.shake = 0.22;
    this.emit("sound", "hurt");
    this.burst(p.x + p.w / 2, p.y + 20, 15, "#cb927c");
    if (this.health <= 0) this.die();
    return true;
  }
  die() {
    if (this.mode === "death") return;
    this.mode = "death";
    this.player.state = "dead";
    this.player.vx = 0;
    this.player.vy = 0;
    this.progress.deaths++;
    this.save();
    this.emit("sound", "death");
    this.emit("mode", "death");
  }
  respawn() {
    this.health = maxHealth(this.progress);
    const { roomId, spawnPointId } = this.progress.lastRest;
    this.loadRoom(roomId, spawnPointId);
    this.player.invulnerable = 1.5;
    this.mode = "playing";
    this.emit("mode", "playing");
  }
  localReturn() {
    if (this.mode !== "playing") return;
    this.hurt(1);
    if (this.mode === "death") return;
    Object.assign(this.player, {
      x: this.safePoint.x,
      y: this.safePoint.y,
      vx: 0,
      vy: 0,
      dashTime: 0,
      dashReady: true,
      invulnerable: 1,
    });
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
    this.time += dt;
    this.progress.playTime += dt;
    this.shake = Math.max(0, this.shake - dt);
    if (this.transition) {
      this.transition.elapsed += dt;
      if (
        !this.transition.loaded &&
        this.transition.elapsed >= this.transition.duration / 2
      ) {
        const { exit } = this.transition;
        this.loadRoom(exit.targetRoomId, exit.spawnPointId);
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
    this.surfaces = activeSurfaces(
      this.room,
      this.flags,
      conditionMet,
      this.time,
    );
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
      !this.surfaces.some((s) => s.kind === "hazard" && overlaps(p, s))
    )
      this.safePoint = { x: p.x, y: p.y };
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
            this.projectiles = this.projectiles.filter((s) => s.owner !== e.id);
            this.burst(e.x + e.w / 2, e.y + e.h / 2, 25, "#b6a16d");
            if (e.defeatedFlag && this.flag(e.defeatedFlag)) {
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
        if (this.hurt(1, shot.vx >= 0 ? 1 : -1)) shot.life = 0;
      }
      if (
        !shot.wave &&
        this.surfaces.some((s) => s.kind !== "oneWay" && overlaps(shot, s))
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
    const targetY = clamp(
      p.y - this.viewport.h * (400 / 720) + (p.vy > 300 ? 90 : 0),
      0,
      Math.max(0, this.room.worldBounds.h - this.viewport.h),
    );
    const targetX = clamp(
      p.x - this.viewport.w / 2 + p.facing * (this.viewport.w < 800 ? 160 : 80),
      0,
      Math.max(0, this.room.worldBounds.w - this.viewport.w),
    );
    this.camera.x += (targetX - this.camera.x) * (1 - Math.exp(-dt * 4));
    if (
      Math.abs(targetY - this.camera.y) > 70 ||
      targetY === 0 ||
      targetY === Math.max(0, this.room.worldBounds.h - this.viewport.h)
    )
      this.camera.y += (targetY - this.camera.y) * (1 - Math.exp(-dt * 5));
  }
}
