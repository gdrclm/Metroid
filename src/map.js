import { conditionMet, clamp } from "./core.js";
import { questNavigation } from "./navigation.js";
const pins = { return: "↶", secret: "◇", danger: "!", unknown: "?" };
export function mapLayout(world, width = 1120, height = 540) {
  const shapes = world.rooms.map((r) => r.mapShape),
    minX = Math.min(...shapes.map((s) => s.x)),
    minY = Math.min(...shapes.map((s) => s.y));
  const maxX = Math.max(...shapes.map((s) => s.x + s.w)),
    maxY = Math.max(...shapes.map((s) => s.y + s.h));
  const sx = (width - 100) / (maxX - minX),
    sy = (height - 85) / (maxY - minY);
  const rect = (r) => ({
    x: 45 + (r.mapShape.x - minX) * sx,
    y: 40 + (r.mapShape.y - minY) * sy,
    w: r.mapShape.w * sx,
    h: r.mapShape.h * sy,
  });
  return { width, height, rect };
}
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
function port(room, exit, layout) {
  const r = layout.rect(room),
    t = Math.max(0.12, Math.min(0.88, exit.x / room.worldBounds.w));
  return exit.direction === "left"
    ? { x: r.x, y: r.y + r.h / 2 }
    : exit.direction === "right"
      ? { x: r.x + r.w, y: r.y + r.h / 2 }
      : exit.direction === "up"
        ? { x: r.x + r.w * t, y: r.y }
        : { x: r.x + r.w * t, y: r.y + r.h };
}
export class WorldMap {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.pointers = new Map();
    this.drag = null;
    this.pinType = "";
    const logical = (e) => {
      const r = canvas.getBoundingClientRect(),
        s = Math.min(r.width / 1120, r.height / 540);
      return {
        x: (e.clientX - r.left - (r.width - 1120 * s) / 2) / s,
        y: (e.clientY - r.top - (r.height - 540 * s) / 2) / s,
      };
    };
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.scale(e.deltaY > 0 ? -0.2 : 0.2);
      },
      { passive: false },
    );
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, logical(e));
      this.drag = { start: logical(e), point: logical(e), moved: false };
      if (this.pointers.size === 2) this.beginPinch();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const p = logical(e),
        old = this.pointers.get(e.pointerId);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.zoom = clamp(
          (this.pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
            this.pinch.distance,
          0.65,
          4,
        );
        this.drag.moved = true;
      } else {
        this.pan.x += p.x - old.x;
        this.pan.y += p.y - old.y;
        if (Math.hypot(p.x - this.drag.start.x, p.y - this.drag.start.y) > 5)
          this.drag.moved = true;
      }
      this.draw();
    });
    const end = (e) => {
      if (
        this.drag &&
        !this.drag.moved &&
        this.pointers.size === 1 &&
        e.type === "pointerup" &&
        this.pinType
      )
        this.placePin(logical(e));
      this.pointers.delete(e.pointerId);
      this.drag = null;
      if (this.pointers.size === 1) {
        const p = [...this.pointers.values()][0];
        this.drag = { start: p, point: p, moved: true };
      }
    };
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"])
      canvas.addEventListener(t, end);
  }
  beginPinch() {
    const [a, b] = [...this.pointers.values()];
    this.pinch = {
      zoom: this.zoom,
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    };
  }
  scale(amount) {
    this.zoom = clamp(this.zoom + amount, 0.65, 4);
    this.draw();
  }
  center() {
    const r = center(mapLayout(this.game.world).rect(this.game.room));
    this.zoom = Math.max(1.5, this.zoom);
    this.pan = { x: (560 - r.x) * this.zoom, y: (270 - r.y) * this.zoom };
    this.draw();
  }
  open() {
    const nav = questNavigation(
        this.game.world,
        this.game.room.roomId,
        this.game.flags,
      ),
      layout = mapLayout(this.game.world),
      a = layout.rect(this.game.room),
      b = nav.target ? layout.rect(nav.target) : a;
    const minX = Math.min(a.x, b.x) - 60,
      maxX = Math.max(a.x + a.w, b.x + b.w) + 60,
      minY = Math.min(a.y, b.y) - 50,
      maxY = Math.max(a.y + a.h, b.y + b.h) + 50;
    this.zoom = clamp(
      Math.min(1000 / (maxX - minX), 440 / (maxY - minY)),
      0.8,
      2.2,
    );
    this.pan = {
      x: (560 - (minX + maxX) / 2) * this.zoom,
      y: (270 - (minY + maxY) / 2) * this.zoom,
    };
    this.draw();
  }
  placePin(p) {
    const x = (p.x - 560 - this.pan.x) / this.zoom + 560,
      y = (p.y - 270 - this.pan.y) / this.zoom + 270,
      layout = mapLayout(this.game.world);
    const room = this.game.world.rooms.find((r) => {
      const q = layout.rect(r);
      return x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h;
    });
    if (!room || !this.game.progress.visited.includes(room.roomId)) return;
    const list = this.game.progress.markers;
    const old = list.find((m) => m.roomId === room.roomId);
    this.game.progress.markers = list.filter((m) => m.roomId !== room.roomId);
    if (this.pinType !== "erase" && old?.type !== this.pinType)
      this.game.progress.markers.push({
        roomId: room.roomId,
        type: this.pinType,
      });
    this.game.save();
    this.draw();
  }
  draw() {
    const c = this.canvas.getContext("2d"),
      box = this.canvas.getBoundingClientRect(),
      scale = Math.max(0.1, Math.min(box.width / 1120, box.height / 540));
    c.clearRect(0, 0, 1120, 540);
    c.save();
    c.translate(560 + this.pan.x, 270 + this.pan.y);
    c.scale(this.zoom, this.zoom);
    c.translate(-560, -270);
    drawMap(
      c,
      this.game,
      mapLayout(this.game.world),
      true,
      10 / (scale * this.zoom),
    );
    c.restore();
    const nav = questNavigation(
      this.game.world,
      this.game.room.roomId,
      this.game.flags,
    );
    this.canvas.dataset.questRoom = nav.target?.roomId || "";
    this.canvas.dataset.nextRoom = nav.next?.roomId || "";
    const title = document.getElementById("map-goal-title"),
      route = document.getElementById("map-goal-route");
    if (title)
      title.textContent = nav.target
        ? nav.target.name +
          (this.game.debug.enabled ? " · " + nav.target.roomId : "")
        : "Все цели выполнены";
    if (route)
      route.textContent = !nav.target
        ? "Можно продолжить исследование."
        : nav.next
          ? "Следующий переход: " + nav.next.name
          : nav.route.length === 1
            ? "Вы в нужной комнате. Найдите отмеченный объект."
            : "Проход к цели пока закрыт.";
    this.canvas.setAttribute(
      "aria-label",
      `Сейчас: ${this.game.room.name}. Цель: ${nav.target?.name || "исследование"}. Отметки: ${this.game.progress.markers.length}.`,
    );
  }
  mini(canvas) {
    const c = canvas.getContext("2d");
    c.clearRect(0, 0, 148, 72);
    c.save();
    c.scale(148 / 1120, 72 / 540);
    drawMap(c, this.game, mapLayout(this.game.world), false, 15);
    c.restore();
  }
}
function drawMap(c, game, layout, labels, radius) {
  const visited = new Set(game.progress.visited),
    seen = new Set(visited),
    seenExits = new Set(game.progress.seenExits || []),
    nav = questNavigation(game.world, game.room.roomId, game.flags),
    rooms = game.rooms;
  if (nav.target) seen.add(nav.target.roomId);
  for (const room of game.world.rooms)
    for (const e of room.exits)
      if (seenExits.has(e.exitId)) seen.add(e.targetRoomId);
  for (const room of game.world.rooms)
    for (const e of room.exits) {
      if (!seenExits.has(e.exitId)) continue;
      const target = rooms.get(e.targetRoomId);
      if (!target) continue;
      const a = port(room, e, layout),
        back = target.exits.find((x) => x.targetRoomId === room.roomId),
        b = back ? port(target, back, layout) : center(layout.rect(target)),
        open = conditionMet(e.condition, game.flags);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.strokeStyle = open ? "#8eaa9170" : "#9d7f6d";
      c.lineWidth = 2;
      c.setLineDash(open ? [] : [5, 5]);
      c.stroke();
      c.setLineDash([]);
      if (labels && !open) {
        const symbol =
          e.lockKind === "ability"
            ? JSON.stringify(e.condition).includes("wall_grip")
              ? "⋮"
              : "➝"
            : e.lockKind === "other_side"
              ? "↶"
              : "⚙";
        c.fillStyle = "#d8b17f";
        c.font = "14px Arial";
        c.textAlign = "center";
        c.fillText(symbol, (a.x + b.x) / 2, (a.y + b.y) / 2 + 5);
      }
      if (e.oneWay && labels) {
        c.fillStyle = "#c7bc91";
        c.font = "14px Arial";
        c.fillText("›", (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
    }
  if (nav.next) {
    const exit = game.room.exits.find(
      (e) => e.targetRoomId === nav.next.roomId,
    );
    if (exit && seenExits.has(exit.exitId)) {
      const a = center(layout.rect(game.room)),
        b = center(layout.rect(nav.next));
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.strokeStyle = "#e2c387";
      c.lineWidth = 3;
      c.stroke();
    }
  }
  for (const room of game.world.rooms) {
    if (!seen.has(room.roomId)) continue;
    const q = layout.rect(room),
      known = visited.has(room.roomId),
      goal = room === nav.target,
      current = room === game.room;
    c.fillStyle = goal ? "#56472d" : known ? "#20373d" : "#10222b";
    c.fillRect(q.x, q.y, q.w, q.h);
    c.strokeStyle = goal
      ? "#f1cf83"
      : current
        ? "#dcc28c"
        : known
          ? game.world.regions[room.regionId].color
          : "#647c6b70";
    c.lineWidth = current || goal ? 2 : 1;
    c.setLineDash(known || goal ? [] : [4, 4]);
    c.strokeRect(q.x, q.y, q.w, q.h);
    c.setLineDash([]);
    if (labels) {
      c.textAlign = "left";
      c.fillStyle = goal ? "#ffe4ac" : "#c1c8b4";
      c.font = "10px Georgia";
      c.fillText(
        known || goal ? room.name : "Неизведанное",
        q.x + 5,
        q.y + 15,
        q.w - 9,
      );
      if (game.debug.enabled) {
        c.font = "8px Arial";
        c.fillText(room.roomId, q.x + 5, q.y + 27);
      }
      if (current) {
        c.textAlign = "right";
        c.font = "12px Georgia";
        c.fillText("◆", q.x + q.w - 4, q.y + 15);
      }
      const rest = room.entities.find((e) => e.type === "rest");
      if (known && rest) {
        c.textAlign = "right";
        c.fillStyle = game.progress.rests.includes(rest.id)
          ? "#efd195"
          : "#769c99";
        c.font = "12px Georgia";
        c.fillText(
          game.progress.rests.includes(rest.id) ? "◉" : "○",
          q.x + q.w - 4,
          q.y + q.h - 5,
        );
      }
      const pin = game.progress.markers.find((m) => m.roomId === room.roomId);
      if (pin) {
        c.fillStyle = "#edc6aa";
        c.font = "14px Arial";
        c.textAlign = "left";
        c.fillText(pins[pin.type], q.x + 5, q.y + q.h - 4);
      }
      if (known && room.entities.some((e) => e.type === "barrier")) {
        c.fillStyle = "#8caaa6";
        c.font = "10px Arial";
        c.textAlign = "center";
        c.fillText("◇", q.x + q.w / 2, q.y + q.h - 4);
      }
    } else if (current) {
      c.fillStyle = "#f6dca1";
      c.fillRect(q.x + q.w / 2 - 5, q.y + q.h / 2 - 5, 10, 10);
    }
  }
  if (nav.target) {
    const q = layout.rect(nav.target),
      x = q.x + q.w / 2,
      y = q.y - 8;
    c.beginPath();
    c.arc(x, y, radius, 0, Math.PI * 2);
    c.fillStyle = "#17252b";
    c.fill();
    c.strokeStyle = "#ffe1a0";
    c.lineWidth = Math.max(1, radius * 0.2);
    c.stroke();
    c.beginPath();
    c.arc(x, y, radius * 0.35, 0, Math.PI * 2);
    c.fillStyle = "#ffe1a0";
    c.fill();
  }
}
