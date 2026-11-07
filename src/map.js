import { conditionMet, clamp } from "./core.js";
import { questNavigation } from "./navigation.js";

export class WorldMap {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.drag = null;
    const logical = (e) => {
      const r = canvas.getBoundingClientRect(),
        scale = Math.min(r.width / 1120, r.height / 540);
      return {
        x: (e.clientX - r.left - (r.width - 1120 * scale) / 2) / scale,
        y: (e.clientY - r.top - (r.height - 540 * scale) / 2) / scale,
      };
    };
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.scale(e.deltaY > 0 ? -0.12 : 0.12);
      },
      { passive: false },
    );
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.drag = logical(e);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.drag) return;
      const p = logical(e);
      this.pan.x += p.x - this.drag.x;
      this.pan.y += p.y - this.drag.y;
      this.drag = p;
      this.draw();
    });
    canvas.addEventListener("pointerup", () => (this.drag = null));
    canvas.addEventListener("pointercancel", () => (this.drag = null));
  }
  scale(amount) {
    this.zoom = clamp(this.zoom + amount, 0.65, 2);
    this.draw();
  }
  center() {
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.draw();
  }
  draw() {
    const c = this.canvas.getContext("2d");
    const box = this.canvas.getBoundingClientRect();
    const pixelScale = Math.max(
      0.1,
      Math.min(box.width / 1120, box.height / 540),
    );
    c.clearRect(0, 0, 1120, 540);
    c.save();
    c.translate(560 + this.pan.x, 270 + this.pan.y);
    c.scale(this.zoom, this.zoom);
    c.translate(-560, -270);
    drawMap(c, this.game, {
      sx: 120,
      sy: 70,
      ox: 80,
      oy: 110,
      w: 96,
      h: 44,
      labels: true,
      markerSize: 10 / (pixelScale * this.zoom),
    });
    c.restore();
    const navigation = questNavigation(
      this.game.world,
      this.game.room.roomId,
      this.game.flags,
    );
    this.canvas.dataset.questRoom = navigation.target?.roomId || "";
    this.canvas.dataset.nextRoom = navigation.next?.roomId || "";
    const title = document.getElementById("map-goal-title");
    const route = document.getElementById("map-goal-route");
    if (title)
      title.textContent = navigation.target
        ? `${navigation.target.name} · ${navigation.target.roomId}`
        : "Все цели выполнены";
    if (route)
      route.textContent = !navigation.target
        ? "Можно продолжить исследование."
        : navigation.next
          ? `Следующий переход: ${navigation.next.name} → к цели`
          : navigation.route.length === 1
            ? "Вы в нужной комнате. Найдите отмеченную способность или механизм."
            : "Проход к цели пока закрыт.";
    this.canvas.setAttribute(
      "aria-label",
      `Исследовано ${this.game.progress.visited.length} из 20 комнат. Сейчас: ${this.game.room.name}. ${navigation.target ? "Цель: " + navigation.target.name + ". " + (navigation.next ? "Следующий переход: " + navigation.next.name : "") : ""}`,
    );
  }
  mini(canvas) {
    const c = canvas.getContext("2d");
    c.clearRect(0, 0, 148, 72);
    drawMap(c, this.game, {
      sx: 17,
      sy: 9,
      ox: 8,
      oy: 17,
      w: 12,
      h: 5,
      labels: false,
    });
  }
}
function drawMap(c, game, layout) {
  const { sx, sy, ox, oy, w, h, labels } = layout,
    visited = new Set(game.progress.visited),
    seen = new Set(visited);
  const navigation = questNavigation(game.world, game.room.roomId, game.flags);
  if (navigation.target) seen.add(navigation.target.roomId);
  const point = (r) => ({
    x: ox + r.mapShape.x * sx,
    y: oy + r.mapShape.y * sy,
  });
  for (const room of game.world.rooms)
    if (visited.has(room.roomId))
      for (const e of room.exits) seen.add(e.targetRoomId);
  for (const room of game.world.rooms) {
    if (!visited.has(room.roomId)) continue;
    const a = point(room);
    for (const e of room.exits) {
      if (
        !e.oneWay &&
        e.targetRoomId < room.roomId &&
        visited.has(e.targetRoomId)
      )
        continue;
      const target = game.rooms.get(e.targetRoomId);
      if (!target) continue;
      const b = point(target),
        open = conditionMet(e.condition, game.flags);
      c.beginPath();
      c.moveTo(a.x + w / 2, a.y + h / 2);
      c.lineTo(b.x + w / 2, b.y + h / 2);
      c.strokeStyle = open ? "#8eaa9180" : "#8b765d70";
      c.lineWidth = labels ? 2 : 1;
      c.setLineDash(open ? [] : [labels ? 5 : 2, labels ? 5 : 2]);
      c.stroke();
      c.setLineDash([]);
      if (labels && e.oneWay) {
        c.save();
        c.translate((a.x + b.x + w) / 2, (a.y + b.y + h) / 2);
        c.rotate(Math.atan2(b.y - a.y, b.x - a.x));
        c.beginPath();
        c.moveTo(5, 0);
        c.lineTo(-4, -4);
        c.lineTo(-4, 4);
        c.closePath();
        c.fillStyle = "#c7bc91";
        c.fill();
        c.restore();
      }
      if (labels && !open) {
        c.fillStyle = "#b99d70";
        c.font = "12px Georgia";
        c.textAlign = "center";
        c.fillText("×", (a.x + b.x + w) / 2, (a.y + b.y + h) / 2 + 4);
      }
      if (labels && e.type === "lift") {
        c.fillStyle = "#819b90";
        c.font = "8px Arial";
        c.fillText("ЛИФТ", a.x + w / 2 + 26, (a.y + b.y + h) / 2);
      }
    }
  }
  if (navigation.next) {
    const a = point(game.room),
      b = point(navigation.next);
    c.beginPath();
    c.moveTo(a.x + w / 2, a.y + h / 2);
    c.lineTo(b.x + w / 2, b.y + h / 2);
    c.strokeStyle = "#e2c387";
    c.lineWidth = labels ? 3 : 1;
    c.stroke();
    if (labels) {
      c.save();
      c.translate((a.x + b.x + w) / 2, (a.y + b.y + h) / 2);
      c.rotate(Math.atan2(b.y - a.y, b.x - a.x));
      c.beginPath();
      c.moveTo(7, 0);
      c.lineTo(-5, -5);
      c.lineTo(-5, 5);
      c.closePath();
      c.fillStyle = "#f2d79a";
      c.fill();
      c.restore();
    }
  }
  for (const room of game.world.rooms) {
    if (!seen.has(room.roomId)) continue;
    const p = point(room),
      current = room.roomId === game.room.roomId,
      isGoal = room.roomId === navigation.target?.roomId,
      known = visited.has(room.roomId);
    c.fillStyle = isGoal
      ? "#56472d"
      : known
        ? current
          ? "#bba37222"
          : "#20373d"
        : "#10222b";
    c.fillRect(p.x, p.y, w, h);
    c.strokeStyle = isGoal
      ? "#f1cf83"
      : current
        ? "#dcc28c"
        : known
          ? game.world.regions[room.regionId].color + "aa"
          : "#647c6b50";
    c.lineWidth = current ? 1.5 : 1;
    c.setLineDash(known || isGoal ? [] : [4, 4]);
    c.strokeRect(p.x, p.y, w, h);
    c.setLineDash([]);
    if (labels) {
      c.textAlign = "left";
      c.fillStyle = isGoal ? "#ffe4ac" : known ? "#c1c8b4" : "#6c8277";
      c.font = "9px Arial";
      c.fillText(known || isGoal ? room.roomId : "◇", p.x + 9, p.y + 14);
      c.font = "10px Georgia";
      c.fillText(
        known || isGoal ? room.name : "Неизведанное",
        p.x + 9,
        p.y + 31,
        w - 15,
      );
      if (current) {
        c.fillStyle = "#dfc68f";
        c.textAlign = "right";
        c.font = "11px Georgia";
        c.fillText("◆", p.x + w - 8, p.y + 14);
      }
      if (known && room.entities.some((e) => e.type === "rest")) {
        c.fillStyle = "#d2ba83";
        c.textAlign = "right";
        c.font = "10px Georgia";
        c.fillText("◉", p.x + w - 8, p.y + 31);
      }
    } else if (current) {
      c.fillStyle = "#e0c38b";
      c.fillRect(p.x + w / 2 - 1, p.y + h / 2 - 1, 3, 3);
    }
  }
  if (navigation.target) {
    const p = point(navigation.target),
      r = layout.markerSize || (labels ? 10 : 3),
      x = p.x + w / 2,
      y = p.y - (labels ? 8 : 2);
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = "#17252bf0";
    c.fill();
    c.strokeStyle = "#ffe1a0";
    c.lineWidth = labels ? r * 0.2 : 1;
    c.stroke();
    c.beginPath();
    c.arc(x, y, r * 0.35, 0, Math.PI * 2);
    c.fillStyle = "#ffe1a0";
    c.fill();
    if (labels) {
      c.beginPath();
      c.moveTo(x - r * 1.4, y);
      c.lineTo(x - r * 0.7, y);
      c.moveTo(x + r * 0.7, y);
      c.lineTo(x + r * 1.4, y);
      c.moveTo(x, y - r * 1.4);
      c.lineTo(x, y - r * 0.7);
      c.moveTo(x, y + r * 0.7);
      c.lineTo(x, y + r * 1.4);
      c.stroke();
    }
  }
  if (labels) {
    c.textAlign = "left";
    c.font = "9px Arial";
    c.fillStyle = "#789b95";
    c.fillText("Н И Ж Н И Й   П Р И Ч А Л", 80, 535);
    c.fillStyle = "#c3ad79";
    c.fillText("В О К З А Л", 275, 220);
    c.fillStyle = "#b6816d";
    c.fillText("Р А Б О Ч И Е   К В А Р Т А Л Ы", 710, 30);
  }
}
