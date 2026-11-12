import { limbBox } from "../hero/commands.js";
const COLORS = ["#8fcba9", "#dfb86f", "#ec837d"];
function trace(c, path, dashed = false, label = "") {
  if (!path?.points.length) return;
  c.save();
  c.lineWidth = dashed ? 2 : 3;
  c.setLineDash(dashed ? [7, 6] : []);
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1],
      b = path.points[i];
    c.beginPath();
    c.strokeStyle = COLORS[Math.max(a.risk, b.risk)];
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
  }
  const end = path.points.at(-1);
  c.fillStyle = COLORS[path.risk];
  c.beginPath();
  c.arc(end.x, end.y, 4, 0, Math.PI * 2);
  c.fill();
  if (label) {
    c.font = "13px Arial";
    c.fillText(label, end.x + 8, end.y - 10);
  }
  c.restore();
}
export function drawGuide(c, game) {
  const d = game.guide;
  if (!d?.enabled || game.mode === "title") return;
  c.save();
  c.font = "13px Arial";
  c.textAlign = "center";
  for (const cache of d.supplies.available) {
    c.fillStyle = "#554b37";
    c.fillRect(cache.x - 14, cache.y - 24, 28, 24);
    c.strokeStyle = "#b6ad84";
    c.lineWidth = 2;
    c.strokeRect(cache.x - 14, cache.y - 24, 28, 24);
    c.fillStyle = "#e0c599";
    c.fillText(cache.contents.beans ? "К" : "Е", cache.x, cache.y - 7);
    if (
      game.mode === "tactical" ||
      Math.abs(pDistance(cache, game.player)) < 140
    ) {
      c.font = "11px Arial";
      c.fillText(cache.title, cache.x, cache.y - 34);
      c.font = "13px Arial";
    }
  }
  for (const s of d.tools.structures) {
    c.fillStyle = s.type === "platform" ? "#8fbfba40" : "#c9b78340";
    c.fillRect(s.x, s.y, s.w, s.h);
    c.strokeStyle = s.life < 0.7 ? "#ec837d" : "#c9d6b5";
    c.lineWidth = 2;
    c.strokeRect(s.x, s.y, s.w, s.h);
    c.fillStyle = "#e4dfd0";
    c.fillText(
      `${s.life.toFixed(1)}с${s.type === "barricade" ? " · " + s.hp + "/4" : ""}`,
      s.x + s.w / 2,
      s.y - 8,
    );
  }
  for (const drop of d.tools.drops) {
    c.fillStyle = drop.item === "beans" ? "#dcab7c" : "#bfc98b";
    c.fillRect(drop.x, drop.y, drop.w, drop.h);
    c.fillStyle = "#101d23";
    c.fillText(drop.item === "beans" ? "К" : "Е", drop.x + 8, drop.y + 13);
  }
  if (d.tools.lure) {
    const l = d.tools.lure;
    c.strokeStyle = "#edcf90";
    c.setLineDash([4, 4]);
    c.beginPath();
    c.arc(l.x, l.y, 15, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = "#edcf90";
    c.fillText("✧", l.x, l.y + 5);
    c.fillText("Приманка", l.x, l.y - 25);
  }
  const p = game.player;
  if (p.guard) {
    c.strokeStyle = "#b9d9d0";
    c.lineWidth = 5;
    c.beginPath();
    const angle = p.facing === 1 ? 0 : Math.PI;
    c.arc(p.x + p.w / 2, p.y + p.h / 2, 32, angle - 1.05, angle + 1.05);
    c.stroke();
  }
  if (d.needs.microSleep > 0) {
    c.fillStyle = "#d3c5bb";
    c.fillText("…", p.x + p.w / 2, p.y - 14);
  }
  // Exhaustion ghosts are visual only: no collider, no Oracle surface.
  if (d.state.needs.energy <= 3) {
    c.globalAlpha = 0.24;
    c.strokeStyle = "#bdc3e0";
    c.setLineDash([8, 9]);
    c.strokeRect(p.x + p.facing * 170 - 50, p.y - 65, 100, 10);
    c.setLineDash([]);
    c.globalAlpha = 1;
  }
  if (game.mode === "tactical") {
    const forecast = d.forecast;
    if (forecast) {
      if (d.commands.items.length) {
        trace(c, forecast.queue);
        if (forecast.recommendation)
          trace(
            c,
            forecast.recommendation,
            true,
            forecast.recommendation.label,
          );
      } else
        for (const alternative of forecast.alternatives)
          trace(c, alternative, true, alternative.label);
    }
    for (const e of game.enemies.filter((e) => e.hp > 0))
      for (const limb of ["head", "torso", "legs"]) {
        const box = limbBox(e, limb),
          x = box.x + box.w / 2,
          y = box.y + box.h / 2;
        c.fillStyle = "#10242c";
        c.strokeStyle = "#e8c68b";
        c.lineWidth = 2;
        c.beginPath();
        c.arc(x, y, 6, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
  }
  if (d.pointer && d.selectedTool) {
    const { x, y } = d.pointer,
      tool = d.selectedTool;
    c.globalAlpha = 0.65;
    c.strokeStyle = "#d1c38a";
    c.setLineDash([6, 4]);
    if (tool === "platform") c.strokeRect(x - 60, y, 120, 12);
    else if (tool === "barricade") c.strokeRect(x - 22, y - 90, 44, 90);
    else {
      c.beginPath();
      c.arc(x, y, 12, 0, Math.PI * 2);
      c.stroke();
    }
  }
  c.restore();
}
function pDistance(point, player) {
  return point.x - player.x - player.w / 2;
}
