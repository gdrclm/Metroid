import { COMMAND_NAMES } from "../hero/commands.js";
import { accessibleInteraction } from "../safety.js";
import { Oracle } from "./oracle-client.js";

export function canvasPoint(canvas, camera, clientX, clientY) {
  const r = canvas.getBoundingClientRect(),
    scale = Math.min(r.width / canvas.width, r.height / canvas.height);
  const x = (clientX - r.left - (r.width - canvas.width * scale) / 2) / scale;
  const y = (clientY - r.top - (r.height - canvas.height * scale) / 2) / scale;
  return x < 0 || y < 0 || x > canvas.width || y > canvas.height
    ? null
    : { x: x + camera.x, y: y + camera.y };
}
const STATS = {
  energy: "Силы",
  satiety: "Сытость",
  stress: "Стресс",
  corruption: "Скверна",
  stamina: "Выносливость",
  focus: "Фокус",
};
const TOOLS = {
  platform: "Платформа · 16",
  barricade: "Стена · 22",
  rations: "Еда · 5",
  beans: "Кофе · 7",
  lure: "Приманка · 8",
};
export class GuideUI {
  constructor(game, canvas, setMode, toast) {
    this.game = game;
    this.canvas = canvas;
    this.setMode = setMode;
    this.toast = toast;
    this.direction = 1;
    this.limb = "torso";
    this.tool = null;
    this.pointer = null;
    this.enemyId = null;
    this.queueKey = "";
    this.oracle = new Oracle(game);
    const dock = document.createElement("aside");
    dock.id = "guide-dock";
    dock.hidden = true;
    dock.setAttribute("aria-label", "Пульт Проводника");
    dock.innerHTML = `<div class="guide-heading"><button id="guide-time" class="guide-time">Ⅱ План · Space</button><span id="guide-act">Акт I · Послушание 100%</span><div class="guide-direction" role="group" aria-label="Направление приказов"><button id="guide-left" aria-label="Приказы влево">←</button><button id="guide-right" aria-label="Приказы вправо">→</button></div><button id="guide-menu" aria-label="Меню паузы">Меню · Esc</button></div>
      <div class="guide-needs">${Object.entries(STATS)
        .map(
          ([key, label]) =>
            `<label>${label} <output id="guide-${key}-value"></output><meter id="guide-${key}" min="0" max="100" value="100" aria-label="${label}"></meter></label>`,
        )
        .join("")}</div>
      <ol id="guide-queue" aria-label="Очередь из трёх приказов"></ol>
      <div class="guide-palette" role="group" aria-label="Приказы">${Object.entries(
        COMMAND_NAMES,
      )
        .map(
          ([key, label]) =>
            `<button data-command="${key}" title="${label}">${label}</button>`,
        )
        .join(
          "",
        )}<label class="guide-limb">Цель <select id="guide-limb" aria-label="Часть тела"><option value="head">Голова</option><option value="torso" selected>Корпус</option><option value="legs">Ноги</option></select></label></div>
      <div class="guide-palette guide-tools" role="group" aria-label="Вмешательства">${Object.entries(
        TOOLS,
      )
        .map(([key, label]) => `<button data-tool="${key}">${label}</button>`)
        .join("")}<button id="guide-clear">Очистить план</button></div>
      <div class="guide-message"><span id="guide-message" role="status"></span><span id="guide-oracle"></span></div>`;
    document.getElementById("app").append(dock);
    this.dock = dock;
    const jumpUp = document.createElement("button");
    jumpUp.id = "guide-jump-up";
    jumpUp.textContent = "Прыжок ↑";
    jumpUp.title = "Прыжок на месте — ↑ / W";
    jumpUp.onclick = () => {
      this.tool = null;
      this.enqueue("jump", { direction: 0 });
    };
    dock.querySelector('[data-command="jump"]').after(jumpUp);
    const accept = document.createElement("button");
    accept.id = "guide-accept-oracle";
    accept.hidden = true;
    accept.onclick = () => {
      const proposal = game.guide.forecast?.recommendation;
      if (
        !proposal ||
        game.mode !== "tactical" ||
        this.oracle.resultStamp !== this.oracle.stamp()
      )
        return;
      const result = game.guide.commands.replace(proposal.commands);
      if (!result.ok) this.toast(result.reason);
      this.sync();
    };
    dock.querySelector(".guide-tools").append(accept);
    this.conditionKey = "";
    const condition = document.createElement("aside");
    condition.id = "guide-condition";
    condition.hidden = true;
    condition.setAttribute("aria-label", "Состояние и припасы героя");
    condition.setAttribute("aria-live", "polite");
    document.getElementById("app").append(condition);
    const safehouse = document.createElement("section");
    safehouse.id = "safehouse-screen";
    safehouse.className = "screen modal-screen";
    safehouse.hidden = true;
    safehouse.innerHTML = `<div class="panel safehouse-panel"><span class="eyebrow">УБЕЖИЩЕ · АКТ I</span><h2 id="safehouse-name">Тепло среди руин</h2><p>Здесь время остановлено. Подготовьте странника к следующему выходу.</p><div class="safehouse-actions"><button data-rest="bed"><strong>Раскладушка</strong><span>Сон, здоровье и точка отдыха</span></button><button data-rest="food"><strong>Очаг</strong><span>Приготовить похлёбку · 1 припас</span></button><button data-rest="wash"><strong>Таз с водой</strong><span>Смыть скверну, успокоиться</span></button><button data-rest="coffee"><strong>Кофейник</strong><span>Заварить кофе · 1 порция зёрен</span></button></div><p id="safehouse-stats"></p><p id="safehouse-message" role="status"></p><button id="safehouse-leave" class="primary">Продолжить путь <span>⟶</span></button></div>`;
    document.getElementById("app").append(safehouse);
    const $ = (id) => document.getElementById(id);
    $("guide-time").onclick = () => this.toggleTime();
    $("guide-menu").onclick = () => setMode("pause");
    $("guide-left").onclick = () => {
      this.direction = -1;
      this.sync();
    };
    $("guide-right").onclick = () => {
      this.direction = 1;
      this.sync();
    };
    $("guide-limb").onchange = (e) => {
      this.limb = e.target.value;
    };
    dock
      .querySelectorAll("[data-command]")
      .forEach(
        (button) => (button.onclick = () => this.issue(button.dataset.command)),
      );
    dock.querySelectorAll("[data-tool]").forEach(
      (button) =>
        (button.onclick = () => {
          this.tool =
            this.tool === button.dataset.tool ? null : button.dataset.tool;
          game.guide.message = this.tool
            ? "Выберите свободное место в мире. Повторное нажатие отменяет инструмент."
            : "Инструмент убран";
          this.sync();
        }),
    );
    $("guide-clear").onclick = () => {
      game.guide.commands.clear();
      this.tool = null;
      this.sync();
    };
    safehouse.querySelectorAll("[data-rest]").forEach(
      (button) =>
        (button.onclick = () => {
          const result = game.guide.safehouseAction(button.dataset.rest);
          $("safehouse-message").textContent = result.ok
            ? game.guide.message
            : result.reason;
          this.sync();
        }),
    );
    $("safehouse-leave").onclick = () => {
      game.save();
      setMode("tactical");
    };
    canvas.addEventListener("pointermove", (e) => {
      if (game.guide.enabled)
        this.pointer = canvasPoint(canvas, game.camera, e.clientX, e.clientY);
    });
    canvas.addEventListener("pointerleave", () => {
      this.pointer = null;
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (!game.guide.enabled || !["playing", "tactical"].includes(game.mode))
        return;
      e.preventDefault();
      canvas.focus({ preventScroll: true });
      const point = canvasPoint(canvas, game.camera, e.clientX, e.clientY);
      if (!point) return;
      this.pointer = point;
      this.clickWorld(point);
    });
  }
  toggleTime() {
    if (["playing", "tactical"].includes(this.game.mode))
      this.setMode(this.game.mode === "playing" ? "tactical" : "playing");
  }
  enqueue(type, options = {}) {
    const result = this.game.guide.commands.enqueue(type, {
      direction: this.direction,
      ...options,
    });
    if (!result.ok) this.toast(result.reason);
    this.sync();
    return result;
  }
  issue(type) {
    const g = this.game;
    if (!["playing", "tactical"].includes(g.mode)) return;
    this.tool = null;
    if (type === "move")
      return this.enqueue(type, {
        x: g.player.x + g.player.w / 2 + this.direction * 120,
      });
    if (type === "interact") {
      const target = g.findNearby();
      if (!target) {
        this.toast("Подведите героя к объекту или проходу");
        return;
      }
      return this.enqueue(type, { targetId: target.id || target.exitId });
    }
    if (type === "attack") {
      const selected = g.enemies.find((e) => e.id === this.enemyId && e.hp > 0);
      const enemy =
        selected ||
        g.enemies
          .filter(
            (e) =>
              e.hp > 0 && Math.hypot(e.x - g.player.x, e.y - g.player.y) < 180,
          )
          .sort(
            (a, b) => Math.abs(a.x - g.player.x) - Math.abs(b.x - g.player.x),
          )[0];
      return this.enqueue(type, { enemyId: enemy?.id, limb: this.limb });
    }
    return this.enqueue(type);
  }
  clickWorld(point) {
    const g = this.game;
    if (this.tool) {
      const result = g.guide.tools.place(this.tool, point.x, point.y);
      if (!result.ok) this.toast(result.reason);
      else this.tool = null;
      this.sync();
      return;
    }
    const enemy = g.enemies.find(
      (e) =>
        e.hp > 0 &&
        point.x >= e.x - 12 &&
        point.x <= e.x + e.w + 12 &&
        point.y >= e.y - 12 &&
        point.y <= e.y + e.h + 12,
    );
    if (enemy) {
      this.enemyId = enemy.id;
      const relative = (point.y - enemy.y) / enemy.h;
      this.limb = relative < 0.28 ? "head" : relative > 0.64 ? "legs" : "torso";
      document.getElementById("guide-limb").value = this.limb;
      this.enqueue("attack", { enemyId: enemy.id, limb: this.limb });
      return;
    }
    const target = [
      ...g.room.entities.filter(
        (e) => e.type !== "enemy" && (!e.flag || !g.flags.includes(e.flag)),
      ),
      ...g.room.exits,
      ...g.guide.supplies.available,
    ].find((e) => Math.hypot(point.x - e.x, point.y - (e.y - 24)) < 44);
    if (target && accessibleInteraction(g.player, target, g.surfaces)) {
      this.enqueue("interact", { targetId: target.id || target.exitId });
      return;
    }
    this.direction = point.x >= g.player.x + g.player.w / 2 ? 1 : -1;
    this.enqueue("move", { x: point.x });
  }
  handleInput(input) {
    if (
      !this.game.guide.enabled ||
      !["playing", "tactical"].includes(this.game.mode)
    )
      return;
    if (input.pressed("tactical")) {
      this.toggleTime();
      return;
    }
    if (input.pressed("left")) {
      this.direction = -1;
      this.issue("move");
    }
    if (input.pressed("right")) {
      this.direction = 1;
      this.issue("move");
    }
    for (const type of [
      "jump",
      "dash",
      "attack",
      "guard",
      "roll",
      "interact",
      "drop",
    ])
      if (input.pressed(type)) this.issue(type);
    // Gamepad vertical inputs select actual stairs through the same command path.
    if (input.pressed("up") || input.pressed("down")) {
      const target = this.game.findNearby();
      if (target?.type === "stairs")
        this.enqueue("interact", { targetId: target.exitId });
      else if (input.pressed("up")) this.enqueue("jump", { direction: 0 });
      else if (input.pressed("down")) this.issue("drop");
    }
    input.consume();
  }
  sync() {
    const g = this.game,
      d = g.guide,
      visible = d.enabled && ["playing", "tactical"].includes(g.mode);
    this.dock.hidden = !visible;
    const condition = document.getElementById("guide-condition");
    condition.hidden = !visible;
    this.canvas.setAttribute(
      "aria-label",
      d.enabled
        ? "Мир Проводника. Касание или клик — точка пути или часть тела врага. Space — план или исполнение. Z — прыжок. Очередь до трёх приказов находится под миром."
        : "Игровой мир. Стрелки или A D — движение, Space — прыжок, J — удар, Shift — рывок, E — действие.",
    );
    document.getElementById("app").classList.toggle("guide-active", visible);
    if (!d.enabled) return;
    const $ = (id) => document.getElementById(id);
    const effects = d.needs.conditions,
      conditionKey = JSON.stringify([effects, d.state.inventory]);
    if (conditionKey !== this.conditionKey) {
      this.conditionKey = conditionKey;
      condition.replaceChildren();
      const stock = document.createElement("span");
      stock.textContent = `Припасы ${d.state.inventory.rations} · Зёрна ${d.state.inventory.beans}`;
      stock.className = "condition-stock";
      condition.append(stock);
      for (const effect of effects) {
        const badge = document.createElement("span");
        badge.dataset.condition = effect.id;
        badge.dataset.severity = effect.severity;
        badge.textContent = effect.label;
        badge.title = effect.detail;
        condition.append(badge);
      }
    }
    $("guide-time").textContent =
      g.mode === "tactical" ? "▶ Исполнить · Space" : "Ⅱ План · Space";
    $("guide-act").textContent =
      `Акт I · Послушание 100% · Воля ${Math.round(d.state.volition)}`;
    for (const key of Object.keys(STATS)) {
      const value = key === "focus" ? d.state.focus : d.state.needs[key];
      $("guide-" + key).value = value;
      $("guide-" + key + "-value").textContent = Math.round(value);
    }
    $("guide-left").setAttribute("aria-pressed", String(this.direction === -1));
    $("guide-right").setAttribute("aria-pressed", String(this.direction === 1));
    this.dock
      .querySelectorAll("[data-tool]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(this.tool === b.dataset.tool)),
      );
    this.dock.querySelector('[data-command="dash"]').disabled =
      !g.abilities.dash;
    const key = JSON.stringify(
      d.commands.items.map((c) => [c.id, c.type, c.status, c.enemyId, c.limb]),
    );
    if (key !== this.queueKey) {
      this.queueKey = key;
      const cards = [];
      for (let i = 0; i < 3; i++) {
        const c = d.commands.items[i],
          li = document.createElement("li");
        if (c) {
          const label = document.createElement("span");
          label.textContent = `${i + 1}. ${COMMAND_NAMES[c.type]}${c.limb ? " · " + { head: "голова", torso: "корпус", legs: "ноги" }[c.limb] : ""}${c.status === "running" ? " · выполняется" : ""}`;
          const cancel = document.createElement("button");
          cancel.textContent = "×";
          cancel.setAttribute("aria-label", `Отменить приказ ${i + 1}`);
          cancel.onclick = () => {
            d.commands.cancel(c.id);
            this.sync();
          };
          li.append(label, cancel);
        } else {
          li.textContent = `${i + 1}. Свободно`;
          li.className = "empty";
        }
        cards.push(li);
      }
      $("guide-queue").replaceChildren(...cards);
    }
    $("guide-message").textContent = this.tool
      ? "Разместите: " + TOOLS[this.tool]
      : d.message;
    this.oracle.update();
    const f = d.forecast?.queue;
    const proposal = d.forecast?.recommendation;
    $("guide-accept-oracle").hidden = g.mode !== "tactical" || !proposal;
    if (proposal) {
      $("guide-accept-oracle").textContent = "Принять: " + proposal.label;
      $("guide-accept-oracle").title =
        "Заменить очередь: " +
        proposal.commands.map((c) => COMMAND_NAMES[c.type]).join(" → ");
    }
    $("guide-oracle").textContent =
      this.oracle.error ||
      (g.mode === "tactical"
        ? proposal
          ? "Есть безопасный план: " + proposal.label
          : f
            ? f.reason
            : "Оракул рассчитывает 6 секунд…"
        : "Space — остановить время · Z — прыжок · F — щит · R — перекат");
    $("guide-oracle").dataset.risk = String(f?.risk || 0);
    if (g.mode === "safehouse") {
      $("safehouse-name").textContent = g.room.name;
      $("safehouse-stats").textContent =
        `Припасы: ${d.state.inventory.rations} · Зёрна: ${d.state.inventory.beans} · Силы: ${Math.round(d.state.needs.energy)} · Сытость: ${Math.round(d.state.needs.satiety)} · Скверна: ${Math.round(d.state.needs.corruption)}${d.needs.caffeine ? " · Кофе действует до выхода" : d.state.caffeine ? " · Кофе готов к следующей комнате" : ""}`;
      document.querySelector('[data-rest="food"]').disabled =
        d.state.inventory.rations < 1;
      document.querySelector('[data-rest="coffee"]').disabled =
        d.state.inventory.beans < 1;
    }
    g.guide.pointer = this.pointer;
    g.guide.selectedTool = this.tool;
  }
}
