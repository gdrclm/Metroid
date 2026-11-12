import { drawParticles } from "./particles.js";
import { drawAtmosphere, drawAtmosphereDebug } from "./atmosphere-render.js";
import { clamp, conditionMet } from "./core.js";
import { attackBox } from "./physics.js";
import { signText } from "./tutorial.js";
import { drawGuide } from "./guide/render.js";
import { drawPierExpansion } from "./pier-expansion-render.js";
import { drawStationExpansion } from "./station-expansion-render.js";

const TAU = Math.PI * 2;
function rng(seed) {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function path(c, points, fill, stroke, width = 1) {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  if (fill) {
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = width;
    c.stroke();
  }
}
function line(c, x1, y1, x2, y2, color, width = 1) {
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.strokeStyle = color;
  c.lineWidth = width;
  c.stroke();
}
function glow(c, x, y, r, color, alpha = 0.4) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(
    0,
    color +
      Math.round(alpha * 255)
        .toString(16)
        .padStart(2, "0"),
  );
  g.addColorStop(1, color + "00");
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}
function rect(c, x, y, w, h, color) {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
}
function ellipse(c, x, y, rx, ry, color) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, TAU);
  c.fillStyle = color;
  c.fill();
}
function lamp(c, x, y, scale = 1, t = 0) {
  glow(c, x, y, 60 * scale, "#e5b66b", 0.17 + Math.sin(t * 3 + x) * 0.02);
  rect(c, x - 4 * scale, y - 7 * scale, 8 * scale, 13 * scale, "#ddb777");
  rect(c, x - 6 * scale, y - 9 * scale, 12 * scale, 3 * scale, "#1d3036");
  rect(c, x - 6 * scale, y + 7 * scale, 12 * scale, 2 * scale, "#24373b");
  line(c, x, y - 10 * scale, x, y - 24 * scale, "#22373d", 2 * scale);
}
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.backgrounds = new Map();
    this.fps = 60;
    this.worst = 0;
  }
  background(room) {
    const key = room.regionId + room.decoration.style;
    if (this.backgrounds.has(key)) return this.backgrounds.get(key);
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const c = canvas.getContext("2d"),
      random = rng(room.decoration.seed),
      station = room.regionId === "station",
      quarter = room.regionId === "quarter";
    const g = c.createLinearGradient(0, 0, 0, 720);
    g.addColorStop(0, station ? "#14252c" : quarter ? "#172830" : "#102933");
    g.addColorStop(0.55, station ? "#4a5147" : quarter ? "#52635c" : "#567575");
    g.addColorStop(1, "#192f37");
    c.fillStyle = g;
    c.fillRect(0, 0, 1280, 720);
    glow(c, 990, 150, 290, "#b4c7ae", 0.12);
    ellipse(c, 990, 145, 38, 38, "#a9b9a64d");
    ellipse(c, 977, 134, 39, 39, station ? "#344443" : "#2e4b52");
    // Layers of distant buildings, chimneys and the railway viaduct.
    for (let layer = 0; layer < 3; layer++) {
      const base = layer === 0 ? 440 : layer === 1 ? 510 : 570,
        color = ["#597471", "#3f6062", "#29494e"][layer];
      let x = -40;
      while (x < 1320) {
        const w = 40 + random() * 90,
          h = 60 + random() * (layer === 0 ? 200 : 170);
        rect(c, x, base - h, w, h, color);
        if (random() > 0.55) {
          rect(c, x + w * 0.25, base - h - 45, 10, 45, color);
          rect(c, x + w * 0.2, base - h - 47, 20, 5, color);
        }
        if (random() > 0.7)
          path(
            c,
            [
              [x - 5, base - h],
              [x + w * 0.5, base - h - 35],
              [x + w + 5, base - h],
            ],
            color,
          );
        for (let wx = x + 10; wx < x + w - 10; wx += 14)
          for (let wy = base - h + 22; wy < base - 15; wy += 24)
            if (random() > 0.53)
              rect(c, wx, wy, 3, 6, layer === 2 ? "#b9af8055" : "#9db6a829");
        x += w + 7 + random() * 25;
      }
    }
    rect(c, 0, 405, 1280, 13, "#345358");
    for (let x = 20; x < 1280; x += 130) {
      rect(c, x, 418, 19, 160, "#345358");
      c.beginPath();
      c.arc(x + 72, 475, 54, Math.PI, 0);
      c.lineWidth = 15;
      c.strokeStyle = "#345358";
      c.stroke();
    }
    // Water catches the city's last remaining lights.
    const water = c.createLinearGradient(0, 530, 0, 720);
    water.addColorStop(0, "#35585b");
    water.addColorStop(1, "#102a34");
    c.fillStyle = water;
    c.fillRect(0, 553, 1280, 167);
    for (let i = 0; i < 130; i++) {
      const x = random() * 1280,
        y = 560 + random() * 160;
      rect(
        c,
        x,
        y,
        10 + random() * 65,
        1,
        random() > 0.8 ? "#c3b27d36" : "#779c9820",
      );
    }
    if (station) {
      // Great glass-and-iron roof: repeated structural ribs, warm windows.
      rect(c, 0, 90, 1280, 23, "#172e34");
      for (let x = 0; x < 1280; x += 160) {
        line(c, 640, 6, x, 340, "#21393e", 10);
        line(c, x, 120, x, 590, "#1a3339", 11);
        rect(c, x - 9, 300, 18, 12, "#344d4c");
      }
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.ellipse(640, 355, 520 + i * 90, 290 + i * 35, 0, Math.PI, TAU);
        c.strokeStyle = "#253e41";
        c.lineWidth = 7;
        c.stroke();
      }
      rect(c, 0, 450, 1280, 150, "#283e3e");
      for (let x = 40; x < 1280; x += 170) {
        rect(c, x, 463, 112, 92, "#1a3035");
        rect(c, x + 7, 470, 98, 72, "#a5965a22");
        line(c, x + 54, 470, x + 54, 543, "#263b3c", 5);
      }
      c.beginPath();
      c.arc(650, 220, 42, 0, TAU);
      c.fillStyle = "#233b40";
      c.fill();
      c.strokeStyle = "#acac7e80";
      c.lineWidth = 3;
      c.stroke();
      line(c, 650, 220, 650, 194, "#b8b38b", 3);
      line(c, 650, 220, 674, 232, "#b8b38b", 2);
      rect(c, 520, 352, 260, 44, "#22383d");
      c.fillStyle = "#bdb58a";
      c.font = "15px Georgia";
      c.textAlign = "center";
      c.fillText("ПОСЛЕДНИЙ ПОЕЗД", 650, 379);
    } else {
      const craneX = quarter ? 1030 : 830;
      this.crane(c, craneX, 565, 1.2, "#223e45");
      this.crane(c, 370, 533, 0.68, "#39595c");
      if (quarter || room.decoration.style === "overlook") {
        rect(c, 940, 260, 12, 290, "#273f43");
        rect(c, 1040, 260, 12, 290, "#273f43");
        line(c, 940, 540, 1050, 300, "#273f43", 5);
        line(c, 1047, 540, 945, 300, "#273f43", 5);
        rect(c, 912, 175, 170, 105, "#344c4c");
        ellipse(c, 997, 175, 85, 15, "#45615a");
        ellipse(c, 997, 278, 85, 12, "#253d41");
        path(
          c,
          [
            [904, 169],
            [997, 123],
            [1091, 169],
          ],
          "#30484a",
        );
        line(c, 1080, 165, 1080, 470, "#73817a", 2);
      } else {
        // A stranded cargo boat, framed by the crane.
        path(
          c,
          [
            [880, 540],
            [1170, 540],
            [1138, 582],
            [922, 582],
          ],
          "#1c373e",
        );
        rect(c, 995, 495, 96, 45, "#2d4a4c");
        rect(c, 1010, 503, 52, 20, "#7e8c7166");
        rect(c, 1048, 468, 13, 28, "#25434a");
        line(c, 1103, 442, 1103, 540, "#213f48", 3);
        line(c, 1103, 442, 1151, 536, "#314e54", 1);
        rect(c, 884, 534, 284, 5, "#7a83705c");
      }
    }
    // Thin clouds soften the silhouetted skyline.
    for (let i = 0; i < 8; i++) {
      const x = random() * 1280,
        y = 220 + random() * 320;
      const fog = c.createRadialGradient(x, y, 0, x, y, 260);
      fog.addColorStop(0, "#acbdb012");
      fog.addColorStop(1, "#acbdb000");
      c.save();
      c.translate(0, y * 0.7);
      c.scale(1, 0.3);
      c.fillStyle = fog;
      c.fillRect(x - 260, y - 260, 520, 520);
      c.restore();
    }
    // Bound retained scenery to eight rooms, independent of repeated transitions.
    if (this.backgrounds.size >= 8)
      this.backgrounds.delete(this.backgrounds.keys().next().value);
    this.backgrounds.set(key, canvas);
    return canvas;
  }
  crane(c, x, base, s, color) {
    c.save();
    c.translate(x, base);
    c.scale(s, s);
    const top = -300;
    path(
      c,
      [
        [-35, 0],
        [-17, top],
        [7, top],
        [27, 0],
      ],
      null,
      color,
      8,
    );
    line(c, -25, -35, 16, -120, color, 4);
    line(c, 16, -120, -19, -205, color, 4);
    line(c, -19, -205, 5, top, color, 4);
    path(
      c,
      [
        [-110, top + 12],
        [165, top - 44],
        [172, top - 25],
        [-108, top + 31],
      ],
      null,
      color,
      7,
    );
    line(c, 0, top - 22, 164, top - 44, color, 2);
    line(c, 0, top - 22, -110, top + 12, color, 2);
    for (let i = 0; i < 7; i++)
      line(
        c,
        -90 + i * 36,
        top + 8 - i * 7,
        -65 + i * 36,
        top + 22 - i * 7,
        color,
        2,
      );
    line(c, 145, top - 32, 145, -130, color, 2);
    line(c, 151, top - 32, 151, -130, color, 1);
    path(
      c,
      [
        [140, -130],
        [148, -120],
        [157, -130],
      ],
      null,
      color,
      3,
    );
    rect(c, -24, -226, 46, 35, color);
    rect(c, -15, -219, 24, 13, "#88a19a30");
    c.restore();
  }
  draw(game, dt) {
    const c = this.ctx,
      room = game.room,
      t = game.time,
      menu = game.mode === "title";
    const { w: viewW, h: viewH } = game.viewport;
    const d = game.guide;
    const inspection =
      game.mode === "tactical"
        ? [
            game.time,
            viewW,
            viewH,
            game.camera.x,
            game.camera.y,
            d.generation,
            d.worldRevision,
            d.commands.revision,
            d.pointer?.x,
            d.pointer?.y,
            d.selectedTool,
            game.player.x,
            game.player.y,
            d.state.needs.energy,
          ].join(":")
        : null;
    if (
      inspection &&
      inspection === this.inspectionKey &&
      d.forecast === this.inspectionForecast
    )
      return;
    this.inspectionKey = inspection;
    this.inspectionForecast = d?.forecast;
    if (this.canvas.width !== viewW || this.canvas.height !== viewH) {
      this.canvas.width = viewW;
      this.canvas.height = viewH;
    }
    c.clearRect(0, 0, viewW, viewH);
    c.filter = "none";
    c.drawImage(this.background(room), 0, 0, viewW, viewH);
    const camera = game.camera;
    let sx = 0,
      sy = 0;
    if (game.shake > 0 && game.progress.settings.shake) {
      sx = Math.sin(t * 125) * game.shake * 10;
      sy = Math.cos(t * 94) * game.shake * 6;
    }
    c.save();
    c.translate(-camera.x + sx, -camera.y + sy);
    drawParticles(c, game, "back");
    c.save();
    c.scale(room.worldBounds.w / 1280, 1);
    this.roomDecor(c, room, t, game);
    c.restore();
    drawPierExpansion(c, game);
    drawStationExpansion(c, game);
    for (const s of game.surfaces) {
      if (
        game.debug.atmospherePreview &&
        game.debug.atmospherePreview !== "live" &&
        (s.mechanismId || s.id.endsWith(".collider"))
      )
        continue;
      this.surface(c, s, room, t);
    }
    if (!menu && !game.guide.enabled)
      for (const sign of room.tutorialSigns || []) {
        if (game.progress.hints.includes("training." + sign.action)) continue;
        c.save();
        c.globalAlpha = 0.78;
        c.fillStyle = "#d4c49c";
        c.font = "20px Arial";
        c.textAlign = "center";
        c.fillText(
          signText(sign.action, game.controlDevice),
          sign.x + sign.w / 2,
          sign.y,
          sign.w,
        );
        c.restore();
      }
    for (const e of room.exits) this.exit(c, e, game, t);
    this.mechanisms(c, game, t);
    drawAtmosphere(c, game);
    drawParticles(c, game, "middle");
    if (game.editor?.active) game.editor.draw(c);
    for (const e of room.entities) {
      if (e.type === "enemy") continue;
      if (
        e.flag &&
        game.flags.includes(e.flag) &&
        ["pickup", "ability"].includes(e.type)
      )
        continue;
      this.entity(c, e, game, t);
    }
    for (const e of game.enemies) if (e.hp > 0) this.enemy(c, e, t, game);
    for (const p of game.projectiles) {
      glow(c, p.x, p.y, 35, "#cf9c75", 0.25);
      if (p.wave) {
        path(
          c,
          [
            [p.x, p.y + p.h],
            [p.x + 10, p.y],
            [p.x + 24, p.y + 10],
            [p.x + p.w, p.y + p.h],
          ],
          "#d9b985",
        );
      } else {
        ellipse(c, p.x + 6, p.y + 8, 5, 9, "#b6c79c");
      }
    }
    const hero = menu
      ? {
          ...game.player,
          x: viewW * 0.67,
          y: 576,
          facing: 1,
          state: "idle",
          attackTime: 0,
          invulnerable: 0,
          trail: [],
        }
      : game.player;
    for (const trail of hero.trail) {
      c.save();
      c.globalAlpha = (trail.life / 0.17) * 0.22;
      this.hero(c, { ...hero, ...trail }, t, game);
      c.restore();
    }
    this.hero(c, hero, t, game);
    if (game.demonstration) {
      const d = game.demonstration;
      c.save();
      c.globalAlpha = 0.35 * (1 - d.t);
      const ghost = {
        ...hero,
        x: d.x + (d.type === "dash" ? d.t * 220 : Math.sin(d.t * 5) * 60),
        y: d.y - 44 - (d.type === "dash" ? 30 : Math.sin(d.t * Math.PI) * 130),
        facing: 1,
        state: d.type === "dash" ? "dash" : "wall",
        invulnerable: 0,
        attackTime: 0,
      };
      this.hero(c, ghost, t, game);
      c.restore();
    }
    drawParticles(c, game, "gameplay");
    drawParticles(c, game, "front");
    if (game.debug.collisions) this.debug(c, game);
    drawAtmosphereDebug(c, game);
    c.restore();
    // Desaturate the completed world once. Filtering every primitive makes
    // tactical inspection needlessly expensive on software Canvas renderers.
    if (game.mode === "tactical") {
      c.filter = "saturate(0.2)";
      c.drawImage(this.canvas, 0, 0);
    }
    c.filter = "none";
    c.save();
    c.translate(-camera.x + sx, -camera.y + sy);
    drawGuide(c, game);
    c.restore();
    const vignette = c.createRadialGradient(
      viewW / 2,
      viewH / 2,
      100,
      viewW / 2,
      viewH / 2,
      Math.max(viewW, viewH) * 0.65,
    );
    vignette.addColorStop(0, "#05121b00");
    vignette.addColorStop(1, "#05121b88");
    c.fillStyle = vignette;
    c.fillRect(0, 0, viewW, viewH);
    const keeper = game.enemies.find(
      (e) => e.enemyType === "keeper" && e.hp > 0,
    );
    if (keeper && game.arenaActive) {
      c.fillStyle = "#b8b9a3";
      c.font = "11px Arial";
      c.textAlign = "center";
      c.fillText("С М О Т Р И Т Е Л Ь   Д В О Р А", viewW / 2, 116);
      rect(c, viewW / 2 - 150, 130, 300, 3, "#172a30");
      rect(
        c,
        viewW / 2 - 150,
        130,
        (300 * keeper.hp) / keeper.maxHp,
        3,
        "#c6a579",
      );
    }
    if (game.transition) {
      const { elapsed, duration, exit } = game.transition;
      const a = Math.sin(Math.PI * clamp(elapsed / duration, 0, 1));
      c.fillStyle = `rgba(8,20,28,${a})`;
      c.fillRect(0, 0, viewW, viewH);
      if (exit.type === "lift" && a > 0.5) {
        c.globalAlpha = (a - 0.5) * 2;
        c.fillStyle = "#c4b586";
        c.font = "11px Arial";
        c.textAlign = "center";
        c.fillText("П О Д Ъ Ё М Н И К", viewW / 2, viewH / 2);
        c.fillText("·  ·  ·", viewW / 2, viewH / 2 + 28);
        c.globalAlpha = 1;
      }
      if (exit.type === "lift") {
        c.save();
        c.globalAlpha = Math.min(1, a * 1.5);
        const cx = viewW / 2,
          floor = viewH * 0.83;
        rect(c, cx - 160, 40, 320, floor - 20, "#173039");
        for (let i = 0; i < 8; i++) {
          const yy =
            (((i * 95 + elapsed * 190 * (exit.direction === "up" ? 1 : -1)) %
              (floor + 95)) +
              floor +
              95) %
            (floor + 95);
          rect(c, cx - 145, yy, 290, 7, "#44645b");
        }
        this.lift(c, cx, floor, t, true);
        this.hero(
          c,
          {
            ...game.player,
            x: cx - 12,
            y: floor - 44,
            facing: 1,
            state: "idle",
            invulnerable: 0,
            attackTime: 0,
          },
          t,
          game,
        );
        c.restore();
      }
    }
    if (dt > 0) {
      this.fps = this.fps * 0.96 + Math.min(240, 1 / dt) * 0.04;
      this.worst = Math.max(this.worst, dt * 1000);
    }
  }
  surface(c, s, room, t) {
    if (s.kind === "hazard") {
      for (let x = s.x; x < s.x + s.w; x += 16)
        path(
          c,
          [
            [x, s.y + s.h],
            [x + 8, s.y],
            [x + 16, s.y + s.h],
          ],
          "#aa8c73",
        );
      return;
    }
    if (s.kind === "oneWay") {
      rect(c, s.x, s.y, s.w, s.h, "#20383e");
      rect(c, s.x, s.y, s.w, 3, "#9fa98c");
      rect(c, s.x, s.y + 4, s.w, 3, "#49615d");
      for (let x = s.x + 5; x < s.x + s.w; x += 28)
        line(c, x, s.y + 3, x + 13, s.y + s.h, "#576d6455", 1);
      if (s.w > 200) {
        for (let x = s.x + 15; x < s.x + s.w; x += 65) {
          line(c, x, s.y, x, s.y - 34, "#45635f", 2);
          line(
            c,
            x,
            s.y - 34,
            Math.min(s.x + s.w, x + 65),
            s.y - 34,
            "#45635f",
            2,
          );
        }
      }
      return;
    }
    const gradient = c.createLinearGradient(0, s.y, 0, s.y + s.h);
    gradient.addColorStop(0, "#20363b");
    gradient.addColorStop(1, "#0a1c26");
    c.fillStyle = gradient;
    c.fillRect(s.x, s.y, s.w, s.h);
    rect(c, s.x, s.y, s.w, 5, "#819080");
    rect(c, s.x, s.y + 5, s.w, 4, "#435951");
    if (s.w < 50) {
      rect(c, s.x, s.y, 3, s.h, "#a0ac8c");
      for (let y = s.y + 10; y < s.y + s.h; y += 32) {
        line(c, s.x + 7, y, s.x + s.w - 5, y, "#647c6b", 2);
        rect(c, s.x + 9, y + 4, 3, 3, "#1b3037");
      }
      return;
    }
    for (let x = s.x + 12; x < s.x + s.w; x += 66) {
      rect(c, x, s.y + 7, 4, 18, "#152b33");
      rect(c, x, s.y + 8, 2, 2, "#8b947e");
      line(
        c,
        x + 8,
        s.y + 32,
        Math.min(s.x + s.w, x + 58),
        s.y + 32,
        "#47605744",
      );
    }
    if (s.h > 50) {
      for (let x = s.x + 24; x < s.x + s.w; x += 145) {
        rect(c, x, s.y + 33, 14, s.h - 33, "#0a1a23");
        rect(c, x, s.y + 33, 3, s.h - 33, "#354c4a");
        line(c, x - 8, s.y + 45, x + 73, s.y + 100, "#263e40", 5);
      }
    }
    if (s.h < 60) line(c, s.x, s.y + s.h, s.x + s.w, s.y + s.h, "#071821", 3);
  }
  mechanisms(c, game, t) {
    for (const actual of game.mechanisms.values()) {
      const preview = game.debug.atmospherePreview;
      const m =
        preview && preview !== "live"
          ? { ...actual, value: preview === "after" ? 1 : 0 }
          : actual;
      const x = m.x,
        y = m.y;
      if (m.vista) {
        rect(c, x - 70, y - 180, 140, 92, "#162f38");
        rect(c, x - 65, y - 175, 130, 82, "#53695b33");
        ellipse(c, x, y - 100, 30, 5, "#142c33");
        glow(c, x, y - 120, 55, "#e6b477", 0.2);
        c.fillStyle = "#c4bd96";
        c.font = "11px Georgia";
        c.textAlign = "center";
        c.fillText(m.vista, x, y - 193);
      }
      if (m.kind === "gate") {
        const top = y - m.h - m.value * m.h;
        for (let a = x - m.w / 2; a < x + m.w / 2; a += 10)
          line(c, a, top, a, top + m.h, "#81917b", 3);
        rect(c, x - m.w / 2 - 4, top + 30, m.w + 8, 5, "#5d7365");
        line(c, x - m.w / 2 - 7, y - m.h * 2, x - m.w / 2 - 7, y, "#3e5a54", 4);
        line(c, x + m.w / 2 + 7, y - m.h * 2, x + m.w / 2 + 7, y, "#3e5a54", 4);
      } else if (m.kind === "ladder") {
        const top = y - m.h,
          bottom = top + m.h * m.value;
        line(c, x - 20, top, x - 20, bottom, "#889778", 4);
        line(c, x + 20, top, x + 20, bottom, "#889778", 4);
        for (let a = top; a < bottom; a += 15)
          line(c, x - 20, a, x + 20, a, "#a1a684", 2);
      } else if (m.kind === "bridge") {
        rect(c, x, y, m.w * m.value, m.h, "#798b71");
        for (let a = x; a < x + m.w * m.value; a += 32)
          line(c, a, y, a + 20, y + m.h, "#233e43", 2);
      }
    }
    if (game.room.roomId === "P05") {
      const x = 500,
        y = 440;
      rect(c, x - 6, y - 95, 12, 95, "#52685c");
      lamp(c, x, y - 90, 1.1, t);
      c.fillStyle = "#d7c793";
      c.font = "14px Georgia";
      c.textAlign = "center";
      c.fillText("Дальний настил", x, y - 115);
    }
    const event = game.room.decoration.event,
      floor = game.room.decoration.groundY;
    if (event === "clockwork") {
      c.save();
      c.translate(555, floor - 85);
      c.rotate(
        game.flags.includes("mechanism.clockwork")
          ? t * 0.7
          : Math.sin(t) * 0.02,
      );
      for (let i = 0; i < 8; i++) {
        c.rotate(Math.PI / 4);
        rect(c, 18, -3, 9, 6, "#a89f72");
      }
      c.beginPath();
      c.arc(0, 0, 19, 0, TAU);
      c.strokeStyle = "#b3ad7b";
      c.lineWidth = 4;
      c.stroke();
      c.restore();
    }
    if (event === "kitchen_steam")
      for (let i = 0; i < 4; i++)
        ellipse(
          c,
          340 + Math.sin(t + i) * 7,
          floor - 65 - ((t * 15 + i * 20) % 70),
          5 + i,
          12,
          "#b8c5a718",
        );
    if (event === "train_shadow")
      rect(
        c,
        ((t * 34) % game.room.worldBounds.w) - 250,
        310,
        160,
        100,
        "#0b202b1f",
      );
    if (event === "lift_sway" && game.room.roomId === "P01") {
      c.save();
      c.translate(1080 + Math.sin(t * 0.4) * 4, 350);
      this.lift(c, 0, 0, t, true);
      c.restore();
    }
    if (event === "chain_sway")
      for (let x = 130; x < game.room.worldBounds.w; x += 170) {
        const offset = Math.sin(t * 0.6 + x) * 5;
        line(c, x, 0, x + offset, 250, "#728a7680", 2);
        for (let y = 20; y < 250; y += 17) {
          c.beginPath();
          c.ellipse(x + (offset * y) / 250, y, 4, 7, 0, 0, TAU);
          c.strokeStyle = "#88947a60";
          c.lineWidth = 1;
          c.stroke();
        }
      }
    if (event === "water_pipe") {
      line(
        c,
        0,
        floor - 160,
        game.room.worldBounds.w,
        floor - 160,
        "#456d6b",
        18,
      );
      line(
        c,
        0,
        floor - 163,
        game.room.worldBounds.w,
        floor - 163,
        "#71917c60",
        3,
      );
      for (let i = 0; i < 3; i++)
        ellipse(
          c,
          230 + i * 180,
          floor - 140 + ((t * 38 + i * 40) % 130),
          1.5,
          4,
          "#a6c9b36a",
        );
    }
  }
  roomDecor(c, room, t, game) {
    const floor = room.decoration.groundY,
      style = room.decoration.style;
    // Foreground mooring posts and ironwork frame the walkable plane.
    for (const x of [32, 1240]) {
      rect(c, x, floor - 145, 11, 145, "#152c34");
      rect(c, x - 5, floor - 148, 21, 6, "#52665a");
      lamp(c, x + 5, floor - 120, 1, t);
    }
    if (room.regionId === "pier") {
      for (let x = 60; x < 1280; x += 157) {
        line(c, x, floor - 46, x + 157, floor - 46, "#46625d", 2);
        rect(c, x, floor - 50, 4, 50, "#38534f");
      }
      if (["warehouse", "shelter", "gate"].includes(style)) {
        rect(c, 120, 220, 570, 400, "#233c41");
        path(
          c,
          [
            [98, 230],
            [403, 115],
            [718, 230],
          ],
          "#29434a",
        );
        rect(c, 105, 230, 605, 12, "#577068");
        for (const x of [160, 480]) {
          rect(c, x, 295, 145, 200, "#1a3037");
          rect(c, x + 8, 302, 129, 180, "#9b9e6b17");
          line(c, x + 72, 302, x + 72, 482, "#3d5651", 5);
          line(c, x + 8, 390, x + 137, 390, "#3d5651", 5);
          lamp(c, x + 72, 372, 0.6, t);
        }
        for (let x = 150; x < 680; x += 61)
          line(c, x, 250, x, 610, "#74816c0d");
      }
      if (style === "crane") {
        this.crane(c, 770, 620, 1.7, "#1a333c");
        rect(c, 370, 500, 180, 120, "#1b343b");
        rect(c, 386, 516, 148, 22, "#788575");
        c.fillStyle = "#182f36";
        c.font = "11px Arial";
        c.textAlign = "center";
        c.fillText("ПРИВОД 04", 460, 532);
      }
      if (style === "lift") {
        this.lift(c, 1000, 620, t, game.flags.includes("mechanism.pier_lift"));
      }
      if (style === "arrival") {
        this.crate(c, 340, 620, 64, 66);
        this.crate(c, 388, 620, 49, 47);
        rect(c, 1050, 455, 9, 165, "#1b343b");
        line(c, 1054, 464, 1100, 464, "#334c4c", 4);
        lamp(c, 1100, 483, 1, t);
        c.save();
        c.translate(1010, 594);
        c.rotate(-0.09);
        rect(c, -25, -12, 50, 12, "#243d42");
        c.restore();
      }
      if (style === "warehouse") {
        this.crate(c, 520, 620, 85, 72);
        this.crate(c, 200, 620, 70, 75);
        this.crate(c, 225, 545, 44, 42);
      }
    } else if (room.regionId === "quarter") {
      if (!["roofs", "shaft", "overlook"].includes(style)) {
        rect(c, 115, 170, 1050, 450, "#273e40");
        for (let x = 145; x < 1130; x += 185) {
          rect(c, x, 200, 140, 420, "#2d4443");
          for (let y = 235; y < 560; y += 105) {
            rect(c, x + 25, y, 83, 68, "#152d34");
            rect(c, x + 31, y + 6, 71, 55, "#aeb17a26");
            line(c, x + 67, y + 6, x + 67, y + 61, "#354d48", 5);
            line(c, x + 31, y + 32, x + 102, y + 32, "#354d48", 3);
            if ((x + y) % 3 === 0) lamp(c, x + 65, y + 38, 0.6, t);
          }
        }
        line(c, 100, 185, 1180, 185, "#5c706250", 4);
      }
      if (style === "laundry") {
        c.beginPath();
        c.moveTo(120, 350);
        c.quadraticCurveTo(620, 455, 1200, 345);
        c.strokeStyle = "#9ca58b80";
        c.lineWidth = 1;
        c.stroke();
        for (let i = 0; i < 7; i++) {
          const x = 190 + i * 135,
            y = 360 + Math.sin((i / 7) * Math.PI) * 45;
          path(
            c,
            [
              [x, y],
              [x + 65, y + 4],
              [x + 67 + Math.sin(t + i) * 4, y + 113],
              [x - 6 + Math.sin(t + i) * 3, y + 107],
            ],
            i % 2 ? "#6d7b681f" : "#9ca68a50",
          );
        }
      }
      if (style === "arena") {
        rect(c, 250, 540, 770, 80, "#223b3d");
        line(c, 210, 545, 1080, 545, "#6d796351", 3);
        rect(c, 594, 230, 90, 310, "#273e40");
        rect(c, 586, 215, 108, 22, "#667767");
        ellipse(c, 640, 190, 74, 32, "#2d4648");
        line(c, 640, 195, 640, 529, "#152d36", 3);
      }
      if (style === "shaft") {
        rect(c, 110, 0, 50, 1000, "#1b333a");
        rect(c, 1100, 0, 55, 1000, "#1b333a");
        for (let y = 100; y < 1000; y += 170) {
          line(c, 110, y, 1150, y, "#425b572f", 6);
          lamp(c, 200, y + 15, 0.8, t);
        }
      }
      if (style === "overlook") {
        // Act I ends with a view of gardens, pumps and the bell district.
        for (let i = 0; i < 5; i++) {
          const x = 80 + i * 38;
          ellipse(c, x, 330 + Math.sin(i) * 15, 35, 23, "#638b6b80");
          line(c, x, 343, x - 12, 415 + i * 8, "#6b927660", 3);
        }
        glow(c, 1170, 390, 160, "#a7b6a2", 0.1);
        for (let i = 0; i < 3; i++) {
          const x = 1060 + i * 65,
            y = 300 - i * 40;
          rect(c, x, y, 44, 240, "#284047");
          path(
            c,
            [
              [x - 7, y],
              [x + 22, y - 38],
              [x + 51, y],
            ],
            "#304b4d",
          );
          rect(c, x + 11, y + 18, 22, 34, "#102a34");
          ellipse(c, x + 22, y + 44, 8, 7, "#8b987967");
        }
        glow(c, 790, 570, 100, "#82bbc5", 0.12);
        for (let i = 0; i < 4; i++) {
          const x = 700 + i * 52;
          line(c, x, 610, x, 500 + i * 10, "#4f747c80", 12);
          line(c, x, 500 + i * 10, x + 42, 500 + i * 10, "#678d8e70", 10);
          ellipse(c, x + 14, 556 + i * 4, 17, 17, "#345d66");
        }
        for (let x = 300; x < 1000; x += 65) {
          rect(c, x, 470, 5, 60, "#2e4949");
          line(c, x, 470, x + 65, 470, "#71816c", 2);
        }
        this.crane(c, 1140, 620, 0.8, "#284348");
      }
    }
    if (style === "platform")
      this.lift(c, 155, 620, t, game.flags.includes("mechanism.pier_lift"));
    if (style === "workshop") {
      for (let x = 480; x < 780; x += 90) {
        c.beginPath();
        c.arc(x, 414, 27, 0, TAU);
        c.strokeStyle = "#8a8b6880";
        c.lineWidth = 7;
        c.stroke();
        line(c, x, 414, x + 12, 397, "#beb180", 2);
      }
      this.crate(c, 850, 620, 160, 65);
      lamp(c, 930, 430, 1, t);
    }
    // Hanging cable curves, recognisable across regions.
    c.beginPath();
    c.moveTo(0, 165);
    c.bezierCurveTo(400, 270, 900, 250, 1280, 130);
    c.strokeStyle = "#122b35b0";
    c.lineWidth = 2;
    c.stroke();
    for (const x of [260, 1060]) {
      const y = x === 260 ? 207 : 192;
      line(c, x, y, x, y + 38, "#223b42", 1);
      lamp(c, x, y + 43, 0.65, t);
    }
  }
  crate(c, x, floor, w, h) {
    rect(c, x, floor - h, w, h, "#344a45");
    rect(c, x + 5, floor - h + 5, w - 10, h - 10, "#293f3d");
    path(
      c,
      [
        [x + 4, floor - 5],
        [x + w - 4, floor - h + 5],
      ],
      null,
      "#5a6853",
      4,
    );
    rect(c, x, floor - h, w, 4, "#7c8165");
    rect(c, x, floor - 5, w, 5, "#1a3036");
  }
  lift(c, x, floor, t, active) {
    for (const dx of [-64, 64]) {
      rect(c, x + dx, 0, 10, floor, "#263e42");
      line(c, x + dx + 4, 0, x + dx + 4, floor, "#80907c", 1);
    }
    line(c, x - 34, 0, x - 34, floor - 165, "#8e9a7e", 2);
    line(c, x + 34, 0, x + 34, floor - 165, "#8e9a7e", 2);
    rect(c, x - 59, floor - 160, 118, 160, "#132c34");
    rect(c, x - 64, floor - 169, 138, 10, "#6c7b66");
    rect(c, x - 66, floor - 3, 142, 9, "#7b866e");
    for (let i = 0; i < 7; i++) {
      line(
        c,
        x - 55 + i * 17,
        floor - 154,
        x + 52 - i * 17,
        floor - 8,
        "#586d6270",
        2,
      );
    }
    lamp(c, x + 5, floor - 135, 0.7, t);
    glow(c, x + 80, floor - 60, 22, active ? "#b4cf99" : "#d89b75", 0.2);
    rect(c, x + 77, floor - 65, 5, 9, active ? "#afc792" : "#b07f66");
  }
  exit(c, e, game, t) {
    const open = conditionMet(e.condition, game.flags),
      x = e.x,
      y = e.y;
    if (e.type === "lift") return;
    c.save();
    if (e.type === "passage") {
      line(c, x, y, x, y - 70, "#637d6c", 2);
      c.fillStyle = "#c3bf97";
      c.font = "13px Georgia";
      c.textAlign = x < 100 ? "left" : "right";
      c.fillText(e.label, x < 100 ? x + 18 : x - 18, y - 90);
    } else if (e.type === "stairs") {
      if (e.direction === "down") {
        rect(c, x - 24, y - 5, 48, 5, "#061d29");
        for (let yy = y; yy < y + 65; yy += 12)
          line(c, x - 16, yy, x + 16, yy, "#62796d", 2);
      } else {
        for (let yy = y - 110; yy < y; yy += 16) {
          line(c, x - 16, yy, x + 16, yy, "#667b6b", 2);
        }
        line(c, x - 19, y - 110, x - 19, y, "#536d63", 3);
        line(c, x + 19, y - 110, x + 19, y, "#536d63", 3);
      }
    } else {
      rect(c, x - 26, y - 90, 52, 90, "#152d36");
      rect(c, x - 21, y - 86, 42, 86, "#0b212c");
      rect(c, x - 28, y - 94, 56, 6, "#61776b");
      rect(c, x - 28, y - 90, 5, 90, "#45615b");
      rect(c, x + 23, y - 90, 5, 90, "#314b4a");
      if (open) {
        const g = c.createLinearGradient(x - 20, 0, x + 20, 0);
        g.addColorStop(0, "#9bac7f00");
        g.addColorStop(0.5, "#9bac7f16");
        g.addColorStop(1, "#9bac7f00");
        c.fillStyle = g;
        c.fillRect(x - 20, y - 85, 40, 85);
      }
    }
    if (!open) {
      for (let xx = x - 20; xx < x + 24; xx += 10)
        line(c, xx, y - 84, xx, y, "#778272", 3);
      rect(c, x - 25, y - 48, 50, 4, "#586b5e");
      rect(c, x - 5, y - 54, 10, 13, "#ac956d");
    }
    glow(c, x, y - 94, 34, open ? "#c8b77d" : "#9d7967", open ? 0.15 : 0.08);
    c.fillStyle = open ? "#c7bd91" : "#8d9a84";
    c.font = "16px Georgia";
    c.textAlign = "center";
    c.fillText(
      e.direction === "up"
        ? "↑"
        : e.direction === "down"
          ? "↓"
          : e.direction === "left"
            ? "‹"
            : "›",
      x,
      y - 111,
    );
    c.font = "8px Arial";
    c.fillStyle = "#bac6acb0";
    if (game.debug.enabled) c.fillText(e.targetRoomId, x, y - 128);
    if (game.nearby?.exitId === e.exitId) {
      c.fillStyle = "#dfd4b0";
      c.font = "12px Georgia";
      c.fillText(e.label, x < 160 ? x + 50 : x > 1120 ? x - 45 : x, y - 149);
    }
    c.restore();
  }
  entity(c, e, game, t) {
    const active = e.flag && game.flags.includes(e.flag);
    if (e.type === "care") {
      const coffee = e.action === "coffee",
        basket = e.action === "donate";
      rect(c, e.x - 24, e.y - 29, 48, 28, basket ? "#756849" : "#3c4b43");
      if (coffee) {
        ellipse(c, e.x, e.y - 34, 14, 9, "#baad82");
        line(c, e.x + 12, e.y - 34, e.x + 23, e.y - 28, "#c1b185", 3);
      } else if (basket) {
        for (let i = 0; i < 4; i++)
          line(
            c,
            e.x - 21,
            e.y - 25 + i * 6,
            e.x + 21,
            e.y - 25 + i * 6,
            "#b5a16b",
            2,
          );
        if (active) ellipse(c, e.x, e.y - 30, 13, 5, "#cfbd85");
      } else {
        ellipse(c, e.x, e.y - 30, 23, 6, "#958a64");
        glow(c, e.x, e.y - 8, 70, "#e0a35a", 0.16);
      }
      return;
    }
    if (e.type === "inspect") {
      rect(c, e.x - 11, e.y - 30, 22, 27, "#b5ad88");
      for (let i = 0; i < 3; i++)
        line(
          c,
          e.x - 7,
          e.y - 23 + i * 6,
          e.x + 7,
          e.y - 23 + i * 6,
          "#56635b",
          1,
        );
      return;
    }
    if (e.type === "retry") {
      lamp(c, e.x, e.y - 55, 1.2, t);
      line(c, e.x, e.y - 65, e.x, e.y, "#536d60", 4);
      c.fillStyle = "#c9b17c";
      c.font = "10px Georgia";
      c.textAlign = "center";
      c.fillText("Повторная попытка", e.x, e.y - 95);
    } else if (e.type === "rest") {
      rect(c, e.x - 43, e.y - 20, 86, 9, "#344a45");
      rect(c, e.x - 38, e.y - 11, 8, 11, "#253f3d");
      rect(c, e.x + 28, e.y - 11, 8, 11, "#253f3d");
      glow(c, e.x, e.y - 32, 120, "#eab773", 0.23);
      ellipse(c, e.x, e.y - 6, 22, 5, "#192f35");
      for (let i = 0; i < 6; i++) {
        const f = Math.sin(t * 9 + i * 5);
        path(
          c,
          [
            [e.x - 14 + i * 5, e.y - 10],
            [e.x - 8 + i * 4 + f * 3, e.y - 32 - Math.sin(t * 7 + i) * 10],
            [e.x - 1 + i * 4, e.y - 8],
          ],
          i % 2 ? "#cf9b56" : "#e6c28b",
        );
      }
      if (game.progress.rests.includes(e.id)) {
        c.fillStyle = "#d9c190";
        c.font = "15px Georgia";
        c.textAlign = "center";
        c.fillText("◉", e.x, e.y - 66);
      }
    } else if (e.type === "ability" || e.type === "pickup") {
      const bob = Math.sin(t * 2.2 + e.x) * 4;
      glow(
        c,
        e.x,
        e.y + bob,
        75,
        e.type === "ability" ? "#d9c58d" : "#9bc4ae",
        0.2,
      );
      if (e.type === "ability") {
        ellipse(c, e.x, e.y + 39, 36, 5, "#0c2430");
        rect(c, e.x - 25, e.y + 21, 50, 12, "#4b6054");
        rect(c, e.x - 17, e.y + 4, 34, 17, "#2a4443");
        c.save();
        c.translate(e.x, e.y - 19 + bob);
        c.rotate(e.reward === "dash" ? t * 0.5 : Math.sin(t) * 0.08);
        if (e.reward === "wall_grip") {
          path(
            c,
            [
              [-15, -8],
              [-4, -16],
              [12, -9],
              [16, 4],
              [7, 14],
              [-5, 10],
            ],
            "#8b987d",
            "#e3d6a6",
            2,
          );
          for (let i = 0; i < 3; i++)
            line(c, 4 + i * 5, -7, 10 + i * 5, -23, "#e4dac0", 3);
        } else {
          for (let i = 0; i < 3; i++) {
            c.beginPath();
            c.arc(0, i * 6 - 6, 18 + i * 4, 0.2, Math.PI * 1.6);
            c.strokeStyle = "#a7d0c7";
            c.lineWidth = 2;
            c.stroke();
          }
          path(
            c,
            [
              [-20, -4],
              [12, -11],
              [23, -5],
              [2, 1],
              [-10, 12],
            ],
            "#b7cab1",
          );
        }
        c.globalAlpha = 0.2;
        path(
          c,
          [
            [0, -21],
            [14, 0],
            [0, 21],
            [-14, 0],
          ],
          null,
          "#e2c88b",
          2,
        );
        path(
          c,
          [
            [0, -11],
            [6, 0],
            [0, 11],
            [-6, 0],
          ],
          "#d7c190",
        );
        c.restore();
        for (let i = 0; i < 7; i++) {
          const a = t * 0.5 + (i * TAU) / 7;
          ellipse(
            c,
            e.x + Math.cos(a) * 37,
            e.y - 20 + bob + Math.sin(a) * 17,
            1,
            1,
            "#e3d29b90",
          );
        }
      } else {
        path(
          c,
          [
            [e.x, e.y - 9 + bob],
            [e.x + 7, e.y + bob],
            [e.x, e.y + 9 + bob],
            [e.x - 7, e.y + bob],
          ],
          e.reward === "health" ? "#ddb38d" : "#b3c5a3",
          "#e3d8a9",
          1,
        );
      }
    } else if (e.type === "lever" || e.type === "repair") {
      rect(c, e.x - 15, e.y - 42, 30, 42, "#2a4344");
      rect(c, e.x - 11, e.y - 38, 22, 24, "#152f37");
      line(c, e.x, e.y - 25, e.x + (active ? 16 : -15), e.y - 58, "#b6ae7f", 4);
      ellipse(
        c,
        e.x + (active ? 16 : -15),
        e.y - 58,
        6,
        6,
        active ? "#a9c7a1" : "#c7a57a",
      );
      rect(c, e.x - 20, e.y - 4, 40, 4, "#667761");
      if (!conditionMet(e.requires, game.flags))
        rect(c, e.x - 10, e.y - 24, 20, 3, "#a27966");
    } else if (e.type === "npc") {
      c.save();
      c.translate(e.x, e.y);
      path(
        c,
        [
          [-12, 0],
          [-9, -38],
          [0, -49],
          [10, -38],
          [16, 0],
        ],
        "#738576",
      );
      ellipse(c, 1, -52, 8, 9, "#c3b797");
      path(
        c,
        [
          [-13, -59],
          [0, -65],
          [15, -58],
        ],
        "#344d4c",
      );
      line(c, -2, -5, -4, 0, "#172e37", 5);
      line(c, 8, -5, 9, 0, "#172e37", 5);
      c.restore();
      lamp(c, e.x + 22, e.y - 23, 0.55, t);
      c.fillStyle = "#c9c49f";
      c.textAlign = "center";
      c.font = "16px Georgia";
      c.fillText("· · ·", e.x, e.y - 84);
    } else if (e.type === "barrier") {
      if (e.id.startsWith("horizon.")) {
        line(c, e.x, e.y - 45, e.x, e.y, "#718575", 3);
        line(c, e.x - 20, e.y - 45, e.x + 20, e.y - 45, "#718575", 5);
        return;
      }
      if (e.id === "future.diving") {
        rect(c, e.x - 45, e.y - 95, 90, 95, "#183943");
        ellipse(c, e.x, e.y - 48, 31, 34, "#527e7e4d");
        for (let i = 0; i < 6; i++) {
          const yy = e.y - 87 + ((t * 12 + i * 14) % 83);
          ellipse(c, e.x + Math.sin(i + t) * 20, yy, 2, 3, "#b7d5c570");
        }
        for (let i = 0; i < 3; i++) {
          c.beginPath();
          c.moveTo(e.x - 25, e.y - 15 - i * 13);
          c.quadraticCurveTo(
            e.x,
            e.y - 22 - i * 13,
            e.x + 25,
            e.y - 15 - i * 13,
          );
          c.strokeStyle = "#95c3bb70";
          c.stroke();
        }
        return;
      }
      if (e.id === "future.archive") {
        rect(c, e.x - 50, e.y - 155, 100, 155, "#253539");
        path(
          c,
          [
            [e.x - 58, e.y - 155],
            [e.x, e.y - 188],
            [e.x + 58, e.y - 155],
          ],
          "#5a6858",
        );
        for (let i = 0; i < 3; i++) {
          const a = t * 0.07 + (i * TAU) / 3;
          c.save();
          c.translate(e.x, e.y - 85);
          c.rotate(a);
          rect(c, -3, -36, 6, 72, "#a99d6f70");
          c.restore();
        }
        glow(c, e.x, e.y - 85, 60, "#bdb179", 0.12);
        ellipse(c, e.x, e.y - 85, 11, 11, "#ccbe84");
        return;
      }
      rect(c, e.x - 34, e.y - 105, 68, 105, "#1c353e");
      rect(c, e.x - 25, e.y - 95, 50, 86, "#3e666343");
      for (let y = e.y - 89; y < e.y - 10; y += 17)
        line(c, e.x - 25, y, e.x + 25, y, "#738e7d80", 2);
      c.fillStyle = "#c0a779";
      c.font = "19px Georgia";
      c.textAlign = "center";
      c.fillText("◇", e.x, e.y - 49);
    } else if (e.type === "ending") {
      glow(c, e.x, e.y - 50, 150, "#d6c491", 0.12);
      rect(c, e.x - 24, e.y - 35, 48, 9, "#536c60");
      rect(c, e.x - 7, e.y - 26, 14, 26, "#3a554e");
      c.fillStyle = "#cfc391";
      c.font = "22px Georgia";
      c.textAlign = "center";
      c.fillText("✧", e.x, e.y - 62);
    }
  }
  hero(c, p, t, game) {
    if (
      p.invulnerable > 0 &&
      game.mode !== "title" &&
      !game.progress.settings.reducedFlash &&
      Math.floor(t * 14) % 2
    )
      return;
    c.save();
    c.translate(p.x + p.w / 2, p.y + p.h);
    c.scale(p.facing, 1);
    if (p.rollTime > 0) c.scale(1, 0.62);
    const run = p.state === "run" ? Math.sin(t * 18) : 0,
      air = ["rise", "fall", "dash", "wall"].includes(p.state),
      lean = p.state === "dash" ? 11 : p.state === "run" ? 3 : 0;
    ellipse(c, 0, 2, 18, 4, "#081c2380");
    // A warm scarf is the player's constant landmark against the cold city.
    path(
      c,
      [
        [-4, -32],
        [
          -20 - lean * 2,
          -31 + Math.sin(t * 9) * (2 + game.atmosphere.wind.gust * 2),
        ],
        [
          -35 - lean,
          -24 + Math.sin(t * 8 + 1) * (3 + game.atmosphere.wind.gust * 3),
        ],
        [-22 - lean, -24],
        [-2, -27],
      ],
      game.flags.includes("story.clockmaker_memory") ? "#d9b85e" : "#b98a5f",
    );
    path(
      c,
      [
        [-10, -31],
        [-9, -16],
        [-12 - run * 5, air ? -4 : 0],
        [-4 - run * 4, air ? -3 : 0],
        [1, -16],
        [6 + run * 5, air ? -6 : 0],
        [12 + run * 5, air ? -5 : 0],
        [9, -31],
      ],
      "#142b36",
    );
    path(
      c,
      [
        [-8, -37],
        [4, -40],
        [10 + lean, -18],
        [-12 + lean, -14],
      ],
      "#718879",
    );
    path(
      c,
      [
        [-7, -33],
        [1, -36],
        [3 + lean, -19],
        [-10 + lean, -17],
      ],
      "#92a18a",
    );
    line(c, 7, -32, 14 + (p.attackTime > 0 ? 18 : 0), -20, "#6f8272", 5);
    rect(c, 11 + (p.attackTime > 0 ? 18 : 0), -21, 6, 5, "#c7b893");
    path(
      c,
      [
        [-10, -44],
        [-7, -51],
        [4, -52],
        [11, -45],
        [8, -35],
        [-5, -35],
      ],
      "#243f46",
    );
    path(
      c,
      [
        [-7, -44],
        [7, -44],
        [6, -36],
        [-5, -36],
      ],
      "#c3c1a0",
    );
    rect(c, 3, -42, 4, 2, "#213941");
    path(
      c,
      [
        [-12, -45],
        [-9, -53],
        [5, -54],
        [12, -46],
      ],
      "#3b5654",
    );
    line(c, -9, -47, 12, -47, "#92a087", 2);
    rect(c, -7, -34, 15, 4, "#c09a68");
    if (
      p.attackTime > game.config.attackRecovery &&
      p.attackTime < game.config.attackRecovery + game.config.attackActive
    ) {
      c.save();
      c.translate(16, -24);
      c.rotate(-0.2);
      const g = c.createLinearGradient(0, 0, 75, 0);
      g.addColorStop(0, "#e1d0a840");
      g.addColorStop(1, "#f6e9bb");
      c.beginPath();
      c.arc(0, 0, 65, -1.0, 0.85);
      c.lineWidth = 6;
      c.strokeStyle = g;
      c.stroke();
      c.restore();
    } else {
      line(c, 15, -22, 22, -8, "#b0b39b", 3);
      line(c, 16, -23, 12, -18, "#a28b64", 3);
    }
    c.restore();
  }
  enemy(c, e, t, game) {
    c.save();
    c.translate(e.x + e.w / 2, e.y + e.h);
    c.scale(e.facing, 1);
    if (e.kneelTime > 0) c.scale(1, e.h / e.standingHeight);
    const windup = e.state === "windup",
      keeper = e.enemyType === "keeper";
    if (windup) glow(c, 0, -30, 85, "#d59b69", 0.23);
    if (e.enemyType === "parasite") {
      line(c, 0, -e.h, 0, -110, "#567e71", 2);
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.moveTo(-12 + i * 6, -15);
        c.quadraticCurveTo(
          -20 + i * 9,
          5 + Math.sin(t * 4 + i) * 8,
          -15 + i * 8,
          17,
        );
        c.strokeStyle = "#829580";
        c.lineWidth = 3;
        c.stroke();
      }
      ellipse(c, 0, -23, 17, 16, e.flash > 0 ? "#d9c391" : "#627d71");
      ellipse(c, 0, -22, 6, 7, windup ? "#e1b17b" : "#182f37");
    } else {
      const s = keeper ? 1.45 : 1;
      c.scale(s, s);
      const run =
        e.state === "chase" || e.state === "patrol" ? Math.sin(t * 8) * 4 : 0;
      line(c, -7, -16, -9 - run, 0, "#152c35", 8);
      line(c, 6, -16, 9 + run, 0, "#142b34", 8);
      path(
        c,
        [
          [-13, -40],
          [7, -44],
          [16, -18],
          [-17, -15],
        ],
        e.flash > 0 ? "#d4c299" : keeper ? "#826e55" : "#596a5e",
      );
      path(
        c,
        [
          [-11, -43],
          [-5, -51],
          [9, -48],
          [13, -39],
          [5, -32],
          [-7, -34],
        ],
        e.flash > 0 ? "#e4d1a2" : "#30494a",
      );
      rect(c, 2, -43, 9, 3, windup ? "#edd0a2" : "#d4b584");
      const wave = keeper && e.attackKind === "wave";
      if (windup && wave) {
        ellipse(c, 12, -5, 35, 5, "#d1a16f70");
        path(
          c,
          [
            [5, -40],
            [18, -20],
            [30, -7],
          ],
          null,
          "#c6ac78",
          5,
        );
      } else if (windup && keeper)
        path(
          c,
          [
            [-14, -42],
            [-29, -27],
            [-43, -26],
          ],
          null,
          "#d9bd85",
          5,
        );
      const lunging = keeper && e.state === "attack" && !wave,
        armX = windup ? (wave ? 22 : -24) : 22,
        armY = windup ? (wave ? -14 : -45) : lunging ? -36 : -20,
        tipX = windup ? (wave ? 30 : -43) : 28,
        tipY = windup ? (wave ? -7 : -70) : lunging ? -29 : 5;
      line(c, 10, -31, armX, armY, "#5a6b5c", 6);
      line(c, armX, armY, tipX, tipY, "#a9a17b", 3);
      if (keeper) rect(c, tipX - 9, tipY - 5, 22, 9, "#7b8c74");
      if (windup) {
        c.fillStyle = "#e6bc83";
        c.font = "15px Georgia";
        c.textAlign = "center";
        c.fillText("!", 0, -68);
      }
    }
    c.restore();
    if (!keeper && e.hp < e.maxHp) {
      rect(c, e.x - 2, e.y - 12, e.w + 4, 2, "#1c3035");
      rect(c, e.x - 2, e.y - 12, ((e.w + 4) * e.hp) / e.maxHp, 2, "#c6b687");
    }
  }
  debug(c, game) {
    c.save();
    c.lineWidth = 1;
    c.font = "9px monospace";
    c.textAlign = "left";
    for (const s of game.surfaces) {
      c.strokeStyle = s.kind === "oneWay" ? "#ffff00" : "#00ffbf";
      c.strokeRect(s.x, s.y, s.w, s.h);
      c.fillStyle = "#00ffbf";
      c.fillText(s.id, s.x + 3, s.y + 12);
    }
    c.strokeStyle = "#ff7777";
    c.strokeRect(game.player.x, game.player.y, game.player.w, game.player.h);
    const box = attackBox(game.player, game.config);
    c.strokeStyle = "#ffaaaa";
    c.strokeRect(box.x, box.y, box.w, box.h);
    for (const e of [...game.room.entities, ...game.room.exits]) {
      c.strokeStyle = "#ccccff";
      c.strokeRect(e.x - 78, e.y - 88, 156, 88);
    }
    for (const [id, s] of Object.entries(game.room.spawnPoints)) {
      c.strokeStyle = "#ffaa00";
      c.strokeRect(s.x, s.y, 24, 44);
      c.fillStyle = "#ffaa00";
      c.fillText(id, s.x, s.y - 5);
    }
    c.strokeStyle = "#fff";
    c.strokeRect(0, 0, game.room.worldBounds.w, game.room.worldBounds.h);
    c.restore();
  }
}
