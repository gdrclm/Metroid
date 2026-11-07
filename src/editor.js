import { validateWorld, clamp } from "./core.js";
import { createPlayer, updatePlayer } from "./physics.js";

export class RoomEditor {
  constructor(game, setMode) {
    this.game = game;
    this.setMode = setMode;
    this.active = false;
    this.history = [];
    this.selected = null;
    this.drag = null;
    this.kind = "collisionLayers";
    const panel = document.createElement("aside");
    panel.id = "room-editor";
    panel.hidden = true;
    panel.innerHTML = `<h3>Редактор комнаты</h3><label>Комната <select data-field="room"></select></label><label>Объекты <select data-field="kind"><option value="collisionLayers">Коллайдеры</option><option value="entities">Сущности</option><option value="exits">Выходы</option><option value="spawnPoints">Точки появления</option></select></label><label>Выбор <select data-field="object"></select></label><div class="editor-numbers"><label>X <input data-field="x" type="number"></label><label>Y <input data-field="y" type="number"></label><label>W <input data-field="w" type="number" min="8"></label><label>H <input data-field="h" type="number" min="4"></label></div><label>Тип <select data-field="type"></select></label><label>Условие JSON <textarea data-field="condition" rows="3"></textarea></label><label>Комната выхода <select data-field="target"></select></label><label>Точка входа <select data-field="spawn"></select></label><label><input data-field="trajectory" type="checkbox" checked> Траектории прыжка и рывка</label><p>Перетащите объект. У коллайдера потяните правый нижний угол для изменения размера. Сетка 8 px.</p><div class="editor-buttons"><button data-do="add">Добавить платформу</button><button data-do="remove">Удалить</button><button data-do="undo">Отменить</button><button data-do="reset">Переиграть комнату</button><button data-do="save">Сохранить локальный черновик</button><button data-do="load">Открыть черновик</button><button data-do="export">Экспорт комнаты</button><button data-do="world">Экспорт мира</button><label>Импорт JSON <input data-field="import" type="file" accept="application/json,.json"></label><button data-do="close">Закрыть редактор</button></div><pre data-field="status"></pre>`;
    document.getElementById("app").append(panel);
    this.panel = panel;
    this.field = (k) => panel.querySelector(`[data-field="${k}"]`);
    for (const room of game.rooms.values())
      for (const select of [this.field("room"), this.field("target")]) {
        const o = document.createElement("option");
        o.value = room.roomId;
        o.textContent = room.roomId + " · " + room.name;
        select.append(o);
      }
    this.field("room").onchange = () => {
      this.game.loadRoom(this.field("room").value);
      this.refresh();
    };
    this.field("kind").onchange = () => {
      this.kind = this.field("kind").value;
      this.selected = null;
      this.refresh();
    };
    this.field("object").onchange = () => {
      this.selected = this.items()[Number(this.field("object").value)]?.object;
      this.sync();
    };
    for (const key of ["x", "y", "w", "h"])
      this.field(key).onchange = () => {
        if (!this.selected) return;
        this.backup();
        this.selected[key] = Number(this.field(key).value);
        this.changed();
      };
    this.field("condition").onchange = () => {
      if (!this.selected) return;
      try {
        const condition = JSON.parse(this.field("condition").value || "null");
        this.backup();
        this.selected[this.kind === "exits" ? "condition" : "requires"] =
          condition;
        this.changed();
      } catch (e) {
        this.status("Ошибка JSON: " + e.message);
      }
    };
    this.field("type").onchange = () => {
      if (this.selected) {
        this.backup();
        this.selected[this.kind === "collisionLayers" ? "kind" : "type"] =
          this.field("type").value;
        this.changed();
      }
    };
    this.field("target").onchange = () => {
      if (this.kind === "exits" && this.selected) {
        this.backup();
        this.selected.targetRoomId = this.field("target").value;
        this.selected.spawnPointId = Object.keys(
          this.game.rooms.get(this.selected.targetRoomId).spawnPoints,
        )[0];
        this.changed();
        this.sync();
      }
    };
    this.field("spawn").onchange = () => {
      if (this.selected) {
        this.backup();
        this.selected.spawnPointId = this.field("spawn").value;
        this.changed();
      }
    };
    panel
      .querySelectorAll("[data-do]")
      .forEach((b) => (b.onclick = () => this.action(b.dataset.do)));
    this.field("import").onchange = async () => {
      const file = this.field("import").files[0];
      if (file)
        try {
          this.import(JSON.parse(await file.text()));
        } catch (e) {
          this.status(e.message);
        }
    };
    const canvas = document.getElementById("game");
    const point = (e) => {
      const r = canvas.getBoundingClientRect(),
        v = this.game.viewport,
        s = Math.min(r.width / v.w, r.height / v.h);
      return {
        x: (e.clientX - r.left - (r.width - v.w * s) / 2) / s + game.camera.x,
        y: (e.clientY - r.top - (r.height - v.h * s) / 2) / s + game.camera.y,
      };
    };
    canvas.addEventListener("pointerdown", (e) => {
      if (!this.active) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      const p = point(e),
        items = this.items().slice().reverse(),
        hit = items.find((i) => {
          const q = this.rect(i.object);
          return (
            p.x >= q.x - 5 &&
            p.x <= q.x + q.w + 5 &&
            p.y >= q.y - 5 &&
            p.y <= q.y + q.h + 5
          );
        });
      if (!hit) return;
      this.selected = hit.object;
      this.backup();
      const r = this.rect(hit.object);
      this.drag = {
        p,
        x: hit.object.x,
        y: hit.object.y,
        w: r.w,
        h: r.h,
        resize:
          this.kind === "collisionLayers" &&
          Math.hypot(p.x - r.x - r.w, p.y - r.y - r.h) < 18,
      };
      this.sync();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.active || !this.drag) return;
      const p = point(e),
        d = this.drag,
        s = this.selected,
        dx = Math.round((p.x - d.p.x) / 8) * 8,
        dy = Math.round((p.y - d.p.y) / 8) * 8;
      if (d.resize) {
        s.w = Math.max(8, d.w + dx);
        s.h = Math.max(4, d.h + dy);
      } else {
        s.x = clamp(d.x + dx, 0, game.room.worldBounds.w - 8);
        s.y = clamp(d.y + dy, 0, game.room.worldBounds.h - 4);
      }
      this.changed();
      this.sync();
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      canvas.addEventListener(type, () => (this.drag = null));
    window.addEventListener("keydown", (e) => {
      if (!this.active) return;
      if (e.code === "Escape") this.toggle(false);
      if (e.ctrlKey && e.code === "KeyZ") {
        e.preventDefault();
        this.action("undo");
      }
    });
  }
  items() {
    const values = this.game.room[this.kind];
    return this.kind === "spawnPoints"
      ? Object.entries(values).map(([id, object]) => ({ id, object }))
      : values.map((object, i) => ({
          id: object.id || object.exitId || String(i),
          object,
        }));
  }
  rect(o) {
    return this.kind === "collisionLayers"
      ? o
      : this.kind === "spawnPoints"
        ? { x: o.x, y: o.y, w: 24, h: 44 }
        : { x: o.x - 12, y: o.y - 44, w: 24, h: 44 };
  }
  status(text) {
    this.field("status").textContent = text;
  }
  backup() {
    this.history.push({
      id: this.game.room.roomId,
      room: structuredClone(this.game.room),
    });
    if (this.history.length > 40) this.history.shift();
  }
  changed() {
    this.game.surfaces = this.game.currentSurfaces();
    const errors = validateWorld(this.game.world, this.game.config);
    this.status(
      errors.length
        ? errors.join("\n")
        : "Ссылки, география и точки появления: OK",
    );
  }
  refresh() {
    this.field("room").value = this.game.room.roomId;
    const select = this.field("object");
    select.replaceChildren();
    this.items().forEach((i, n) => {
      const o = document.createElement("option");
      o.value = n;
      o.textContent = i.id;
      select.append(o);
    });
    this.selected = this.items()[0]?.object;
    this.sync();
    this.changed();
  }
  sync() {
    const s = this.selected;
    if (!s) return;
    this.field("object").value = this.items().findIndex((i) => i.object === s);
    for (const key of ["x", "y", "w", "h"]) {
      this.field(key).disabled = s[key] === undefined;
      this.field(key).value = s[key] ?? "";
    }
    this.field("condition").value = JSON.stringify(
      s.requires || s.condition || null,
    );
    const type = this.field("type");
    type.replaceChildren();
    for (const value of this.kind === "collisionLayers"
      ? ["solid", "oneWay", "hazard"]
      : this.kind === "exits"
        ? ["door", "passage", "stairs", "lift"]
        : [s.type || "spawn"]) {
      const o = document.createElement("option");
      o.value = value;
      o.textContent = value;
      type.append(o);
    }
    type.value = s.kind || s.type || "spawn";
    this.field("target").disabled = this.kind !== "exits";
    this.field("spawn").disabled = this.kind !== "exits";
    if (this.kind === "exits") {
      this.field("target").value = s.targetRoomId;
      this.field("spawn").replaceChildren();
      for (const id of Object.keys(
        this.game.rooms.get(s.targetRoomId)?.spawnPoints || {},
      )) {
        const o = document.createElement("option");
        o.value = id;
        o.textContent = id;
        this.field("spawn").append(o);
      }
      this.field("spawn").value = s.spawnPointId;
    }
  }
  action(type) {
    if (type === "close") return this.toggle(false);
    if (type === "undo") {
      const snapshot = this.history.pop();
      if (snapshot) {
        Object.assign(this.game.rooms.get(snapshot.id), snapshot.room);
        this.game.loadRoom(snapshot.id);
        this.refresh();
      }
      return;
    }
    if (type === "reset") {
      this.game.loadRoom(this.game.room.roomId);
      this.refresh();
      return;
    }
    if (type === "add") {
      this.backup();
      this.kind = "collisionLayers";
      this.field("kind").value = this.kind;
      const r = this.game.room;
      r.collisionLayers.push({
        id: r.roomId + ".platform." + Date.now(),
        x: Math.round(this.game.player.x / 8) * 8,
        y: Math.round((this.game.player.y - 70) / 8) * 8,
        w: 160,
        h: 16,
        kind: "oneWay",
        grippable: false,
      });
      this.refresh();
      this.selected = r.collisionLayers.at(-1);
      this.sync();
      return;
    }
    if (type === "remove" && this.selected) {
      this.backup();
      if (this.kind === "spawnPoints") {
        const item = this.items().find((i) => i.object === this.selected);
        delete this.game.room.spawnPoints[item.id];
      } else
        this.game.room[this.kind] = this.game.room[this.kind].filter(
          (o) => o !== this.selected,
        );
      this.refresh();
      return;
    }
    if (type === "save") {
      try {
        localStorage.setItem(
          "last-harbour.editor.v1",
          JSON.stringify(this.game.world),
        );
        this.status(
          "Черновик сохранён локально. Исходный world.json не изменён.",
        );
      } catch (e) {
        this.status("Не удалось сохранить: " + e.message);
      }
      return;
    }
    if (type === "load") {
      try {
        const text = localStorage.getItem("last-harbour.editor.v1");
        if (text) this.import(JSON.parse(text));
        else this.status("Локального черновика нет.");
      } catch (e) {
        this.status(e.message);
      }
      return;
    }
    if (type === "export" || type === "world") {
      const object = type === "world" ? this.game.world : this.game.room;
      const a = document.createElement("a"),
        url = URL.createObjectURL(
          new Blob([JSON.stringify(object, null, 2) + "\n"], {
            type: "application/json",
          }),
        );
      a.href = url;
      a.download =
        type === "world"
          ? "world.edited.json"
          : this.game.room.roomId + ".edited.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  import(value) {
    const next = structuredClone(this.game.world);
    if (value.rooms) {
      if (
        value.rooms.length !== next.rooms.length ||
        value.rooms.some((r) => !next.rooms.some((current) => current.roomId === r.roomId))
      )
        throw Error("Импорт мира должен сохранять существующие ID комнат.");
      Object.assign(next, value);
    } else if (value.roomId === next.testRoom?.roomId) next.testRoom = value;
    else {
      const index = next.rooms.findIndex((r) => r.roomId === value.roomId);
      if (index < 0) throw Error("Нет такой комнаты");
      next.rooms[index] = value;
    }
    const errors = validateWorld(next, this.game.config);
    if (errors.length) throw Error(errors.join("\n"));
    for (const room of [...next.rooms, ...(next.testRoom ? [next.testRoom] : [])])
      Object.assign(this.game.rooms.get(room.roomId), room);
    const rooms = this.game.world.rooms;
    Object.assign(this.game.world, next, {
      rooms,
      testRoom: this.game.rooms.get(next.testRoom?.roomId),
    });
    this.game.loadRoom(this.game.room.roomId);
    this.refresh();
  }
  toggle(value = !this.active) {
    this.active = value;
    this.panel.hidden = !value;
    this.game.debug.collisions = value;
    if (value) {
      this.setMode("editor");
      this.refresh();
    } else this.setMode("playing");
  }
  draw(c) {
    if (!this.active) return;
    for (const item of this.items()) {
      const r = this.rect(item.object);
      c.strokeStyle = item.object === this.selected ? "#ffe495" : "#a6bfa080";
      c.lineWidth = 2;
      c.strokeRect(r.x, r.y, r.w, r.h);
      if (item.object === this.selected && this.kind === "collisionLayers") {
        c.fillStyle = "#ffe495";
        c.fillRect(r.x + r.w - 5, r.y + r.h - 5, 10, 10);
      }
    }
    if (!this.field("trajectory").checked) return;
    for (const dash of [false, true]) {
      const p = createPlayer(this.game.player, this.game.config);
      p.grounded = true;
      p.vx = this.game.player.facing * this.game.config.maxSpeed;
      const direction = p.facing > 0 ? "right" : "left";
      c.beginPath();
      c.moveTo(p.x + 12, p.y + 22);
      for (let i = 0; i < 150; i++) {
        updatePlayer(
          p,
          {
            down: (k) => k === direction || k === "jump",
            pressed: (k) =>
              (k === "jump" && i === 0) || (dash && k === "dash" && i === 30),
          },
          this.game.config.fixedStep,
          this.game.surfaces,
          this.game.config,
          { dash, wall_grip: true },
          this.game.room.worldBounds,
        );
        c.lineTo(p.x + 12, p.y + 22);
        if (i > 3 && p.grounded) break;
      }
      c.strokeStyle = dash ? "#f1c47c" : "#7ed9ce";
      c.lineWidth = 2;
      c.setLineDash([5, 4]);
      c.stroke();
      c.setLineDash([]);
    }
  }
}
