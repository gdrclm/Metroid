import { clamp } from "../core.js";
import { heroInput, COMMAND_NAMES } from "./commands.js";
import { newAutonomyState } from "./brain-state.js";
import { perceive, immediateThreat } from "./perception.js";
import { scanWalk, safeFooting, simpleJump } from "./navigation.js";

const LABELS = {
  observe: "Осматривается",
  walk: "Осторожно идёт",
  inspect: "Изучает место",
  seek_rest: "Ищет отдых",
  retreat: "Отходит от угрозы",
  guard: "Прикрывается",
  dodge: "Уклоняется",
  jump: "Преодолевает препятствие",
  recover: "Восстанавливает равновесие",
  blocked: "Ждёт нового пути",
  obey: "Выполняет приказ",
};
const NAVIGATION = ["walk", "inspect", "seek_rest"];
export class HeroBrain {
  constructor(director) {
    this.director = director;
    this.reset();
  }
  get game() {
    return this.director.game;
  }
  get learning() {
    return (this.director.state.autonomy ||= newAutonomyState());
  }
  reset() {
    this.anchor = null;
    this.intent = {
      kind: "observe",
      reason: "Прислушивается к городу",
      target: null,
    };
    this.sense = null;
    this.senseClock = 0;
    this.idleTime = 0;
    this.lookTime = 0;
    this.balance = 0;
    this.wasGrounded = true;
    this.directiveHold = false;
    this.failure = "";
    this.lastCommand = null;
    this.jumpTrial = null;
    this.dodgeCooldown = 0;
    this.jumpCooldown = 0;
    this.guardTime = 0;
    this.guardCooldown = 0;
    this.seenObjects = [];
  }
  roomEntered() {
    this.reset();
    const g = this.game,
      p = g.player;
    if (p)
      this.anchor = {
        roomId: g.room.roomId,
        x: p.x + p.w / 2,
        y: p.y + p.h,
        direction: p.facing,
      };
  }
  setIntent(kind, reason, target = null) {
    this.intent = { kind, reason, target };
  }
  holdPosition(reason = "Сохраняет выбранное вами место") {
    const g = this.game,
      p = g.player;
    this.directiveHold = true;
    this.failure = "";
    this.anchor = {
      roomId: g.room.roomId,
      x: p.x + p.w / 2,
      y: p.y + p.h,
      direction: p.facing,
    };
    this.setIntent("observe", reason);
  }
  remember(kind, x) {
    const g = this.game,
      list = this.learning.hazards;
    if (
      list.some(
        (h) =>
          h.roomId === g.room.roomId &&
          h.kind === kind &&
          Math.abs(h.x - x) < 28,
      )
    )
      return;
    list.push({
      roomId: g.room.roomId,
      kind,
      x: Math.round(x),
      y: Math.round(g.player.y + g.player.h),
    });
    if (list.length > 24) list.shift();
    g.save();
  }
  observe(dt) {
    const g = this.game,
      p = g.player,
      c = this.director.commands.current;
    if (this.anchor?.roomId !== g.room.roomId) this.roomEntered();
    this.lookTime = Math.max(0, this.lookTime - dt);
    this.balance = Math.max(0, this.balance - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    this.guardCooldown = Math.max(0, this.guardCooldown - dt);
    this.senseClock -= dt;
    if (!this.sense || this.senseClock <= 0) {
      this.sense = perceive(g);
      this.senseClock = 0.1;
    }
    if (c) {
      this.idleTime = 0;
      if (this.lastCommand !== c.id) {
        this.lastCommand = c.id;
        this.directiveHold = true;
        this.failure = "";
        if (c.type === "jump")
          this.jumpTrial = {
            x: p.x,
            y: p.y,
            health: g.health,
            airborne: false,
            elapsed: 0,
            autonomous: false,
          };
      }
      this.setIntent("obey", COMMAND_NAMES[c.type]);
    } else this.idleTime = p.grounded ? this.idleTime + dt : 0;
    if (this.jumpTrial) {
      this.jumpTrial.elapsed += dt;
      if (!p.grounded) this.jumpTrial.airborne = true;
      if (p.grounded && this.jumpTrial.airborne) {
        if (
          g.health >= this.jumpTrial.health &&
          !safeFooting(g, this.sense, p.x + p.w / 2)
        ) {
          this.learning.jumpSuccesses = Math.min(
            1000,
            this.learning.jumpSuccesses + 1,
          );
          g.save();
        }
        this.jumpTrial = null;
      } else if (this.jumpTrial.elapsed > 3 || g.health < this.jumpTrial.health)
        this.jumpTrial = null;
    }
    if (p.grounded && !this.wasGrounded) this.balance = 0.24;
    this.wasGrounded = p.grounded;
  }
  commandEnded(command, status, reason) {
    const p = this.game.player;
    this.directiveHold = true;
    this.anchor = {
      roomId: this.game.room.roomId,
      x: p.x + p.w / 2,
      y: p.y + p.h,
      direction: p.facing,
    };
    if (status === "failed") {
      this.failure = reason;
      this.setIntent("blocked", reason);
      if (command.type === "move" && command.stuckFor >= 0.16)
        this.remember(
          "wall",
          p.x + p.w / 2 + Math.sign(command.x - p.x - p.w / 2) * 20,
        );
    } else {
      this.failure = "";
      this.setIntent("observe", "Сохраняет выбранное вами место");
      if (status === "succeeded" && command.type === "move")
        this.learning.walkSuccesses = Math.min(
          1000,
          this.learning.walkSuccesses + 1,
        );
    }
  }
  follow(x, kind, reason, id = null) {
    const g = this.game,
      p = g.player,
      cx = p.x + p.w / 2,
      route = scanWalk(g, this.sense, x);
    if (!route.safe && Math.abs(route.x - cx) < 18) {
      this.remember(route.reason, route.blockedX);
      this.setIntent(
        "observe",
        route.reason === "wall"
          ? "Впереди преграда: оценивает другой способ"
          : "Перед краем останавливается и проверяет опору",
      );
      this.lookTime = 0.8;
      return heroInput();
    }
    const target = route.safe ? x : route.x,
      dx = target - cx;
    if (Math.abs(dx) < 10 && Math.abs(p.vx) < 35) {
      if (NAVIGATION.includes(this.intent.kind)) {
        this.learning.independentMoves = Math.min(
          1000,
          this.learning.independentMoves + 1,
        );
        g.save();
      }
      if (id && !this.seenObjects.includes(id)) this.seenObjects.push(id);
      this.setIntent("observe", "Проверяет то, что увидел");
      this.lookTime = 0.8;
      return heroInput();
    }
    this.setIntent(kind, reason, { x: target, id });
    const stopping = (p.vx * p.vx) / (2 * g.config.braking) + 3;
    if (Math.sign(dx) === Math.sign(p.vx) && Math.abs(dx) <= stopping)
      return heroInput();
    return heroInput([dx > 0 ? "right" : "left"]);
  }
  react(threat, dt) {
    const g = this.game,
      p = g.player,
      n = this.director.state.needs,
      cx = p.x + p.w / 2,
      away = threat.x > cx ? -1 : 1;
    if (threat.time < 0.18 && n.stamina >= 28 && this.dodgeCooldown <= 0) {
      const route = scanWalk(g, this.sense, cx + away * 80);
      if (route.safe) {
        this.dodgeCooldown = 2;
        this.setIntent("dodge", "Реагирует на близкую атаку");
        return heroInput([away > 0 ? "right" : "left"], ["roll"]);
      }
    }
    if (threat.kind !== "enemy" && n.stamina >= 12 && this.guardCooldown <= 0) {
      this.guardTime += dt;
      if (this.guardTime < 1.1) {
        p.guard = true;
        p.facing = threat.x >= cx ? 1 : -1;
        this.setIntent("guard", "Распознал подготовку атаки");
        return heroInput();
      }
      this.guardTime = 0;
      this.guardCooldown = 0.9;
    }
    const choices = [80, 120]
      .map((distance) => scanWalk(g, this.sense, cx + away * distance))
      .filter((r) => Math.abs(r.x - cx) > 25);
    if (choices.length)
      return this.follow(
        choices.at(-1).x,
        "retreat",
        "Ищет безопасный участок рядом",
      );
    this.setIntent(
      "observe",
      "Опасность рядом: безопасного отступления не видно",
    );
    return heroInput();
  }
  idle(dt) {
    const g = this.game,
      p = g.player,
      d = this.director,
      n = d.state.needs;
    if (!this.sense) this.sense = perceive(g);
    if (p.hurtTime > 0 || d.needs.microSleep > 0) {
      this.setIntent("recover", "Приходит в себя после потрясения");
      return heroInput();
    }
    if (p.rollTime > 0) {
      this.setIntent("dodge", "Заканчивает уклонение");
      return heroInput();
    }
    if (!p.grounded) {
      if (this.jumpTrial?.autonomous) {
        const t = this.jumpTrial;
        return heroInput([
          t.direction > 0 ? "right" : "left",
          ...(t.elapsed < 0.35 ? ["jump"] : []),
        ]);
      }
      this.setIntent("recover", "Следит за приземлением");
      return heroInput();
    }
    const threat = immediateThreat(g, this.sense);
    if (threat) return this.react(threat, dt);
    this.guardTime = 0;
    if (this.balance > 0) {
      this.setIntent("recover", "Проверяет опору после приземления");
      return heroInput();
    }
    if (this.sense.heard.length) {
      this.setIntent("observe", "Слышит угрозу, но ещё не видит её");
      return heroInput();
    }
    if (n.energy < 28 || n.satiety < 18 || n.stress > 70) {
      const rest = this.sense.objects
        .filter((e) => e.type === "rest" && Math.abs(e.y - p.y - p.h) < 8)
        .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      if (rest && Math.abs(rest.x - p.x - p.w / 2) > 60)
        return this.follow(
          rest.x,
          "seek_rest",
          "Нужна передышка: видит место отдыха",
          rest.id,
        );
    }
    const lure = d.tools.lure;
    if (lure && Math.abs(lure.x - p.x - p.w / 2) > 18)
      return this.follow(lure.x, "walk", "Следует за знакомым присутствием");
    if (this.directiveHold) {
      this.setIntent(
        this.failure ? "blocked" : "observe",
        this.failure || "Ждёт следующего указания, не покидая выбранное место",
      );
      return heroInput();
    }
    if (this.lookTime > 0) return heroInput();
    if (NAVIGATION.includes(this.intent.kind) && this.intent.target)
      return this.follow(
        this.intent.target.x,
        this.intent.kind,
        this.intent.reason,
        this.intent.target.id,
      );
    if (this.idleTime < 1) {
      this.setIntent("observe", "Прислушивается и оценивает ближайшую дорогу");
      return heroInput();
    }
    const cx = p.x + p.w / 2;
    const interesting = this.sense.objects
      .filter(
        (e) =>
          ["npc", "inspect"].includes(e.type) &&
          !this.seenObjects.includes(e.id) &&
          Math.abs(e.y - p.y - p.h) < 8 &&
          Math.abs(e.x - cx) > 90 &&
          Math.abs(e.x - cx) < 240,
      )
      .sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx))[0];
    if (interesting)
      return this.follow(
        interesting.x - Math.sign(interesting.x - cx) * 80,
        "inspect",
        "Осторожно приближается к знакомой детали",
        interesting.id,
      );
    if (!g.room.exits.length) {
      this.setIntent("observe", "Не видит причины покидать безопасное место");
      return heroInput();
    }
    const radius =
        240 +
        Math.min(
          320,
          this.learning.walkSuccesses * 8 + this.learning.jumpSuccesses * 160,
        ),
      direction = this.anchor.direction;
    const target = clamp(
      cx + direction * 140,
      this.anchor.x - radius,
      this.anchor.x + radius,
    );
    if (Math.abs(target - cx) < 18) {
      this.setIntent("observe", "Дальше без указания не решается идти");
      return heroInput();
    }
    const route = scanWalk(g, this.sense, target);
    if (!route.safe) {
      this.remember(route.reason, route.blockedX);
      if (
        route.reason === "wall" &&
        Math.abs(route.x - cx) < 45 &&
        this.learning.jumpSuccesses >= 2 &&
        n.energy >= 30 &&
        n.stamina >= 20 &&
        this.jumpCooldown <= 0
      ) {
        this.jumpCooldown = 0.6;
        const jump = simpleJump(g, this.sense, direction);
        if (jump && Math.abs(jump.x - this.anchor.x) <= radius) {
          this.jumpTrial = {
            x: p.x,
            y: p.y,
            health: g.health,
            airborne: false,
            elapsed: 0,
            autonomous: true,
            direction,
          };
          this.setIntent(
            "jump",
            "Вспомнил освоенный прыжок; проверил опору за преградой",
            jump,
          );
          return heroInput(
            [direction > 0 ? "right" : "left", "jump"],
            ["jump"],
          );
        }
      }
      if (Math.abs(route.x - cx) < 25) {
        this.setIntent(
          "observe",
          route.reason === "wall"
            ? "Безопасный путь преграждён: ждёт помощи"
            : "Незнакомый край: дальше не идёт",
        );
        return heroInput();
      }
    }
    return this.follow(route.x, "walk", "Проходит видимый безопасный участок");
  }
  describe() {
    return {
      state: this.intent.kind,
      label: LABELS[this.intent.kind],
      reason: this.intent.reason,
      target: this.intent.target,
      visibleEnemies: this.sense?.enemies.map((e) => e.id) || [],
      heardWarnings: this.sense?.heard.length || 0,
      knownSupports: this.sense?.surfaces.length || 0,
      walkSuccesses: this.learning.walkSuccesses,
      jumpSuccesses: this.learning.jumpSuccesses,
    };
  }
  snapshot() {
    const { director, ...runtime } = this;
    return structuredClone(runtime);
  }
  restore(snapshot) {
    if (snapshot) Object.assign(this, structuredClone(snapshot));
    else this.roomEntered();
  }
}
