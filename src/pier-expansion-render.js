const rect = (c, x, y, w, h, color) => {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
};
const line = (c, x, y, xx, yy, color, width = 2) => {
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(xx, yy);
  c.strokeStyle = color;
  c.lineWidth = width;
  c.stroke();
};
const polygon = (c, points, color) => {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fillStyle = color;
  c.fill();
};
function wheel(c, x, y, r, t) {
  c.save();
  c.translate(x, y);
  c.rotate(t);
  c.strokeStyle = "#64776b";
  c.lineWidth = 5;
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    line(c, 0, 0, Math.cos(a) * r, Math.sin(a) * r, "#536b63", 3);
  }
  c.restore();
}

// Decorative forms use world coordinates. Colliders and moving supports remain
// exclusively in world.json / Game.currentSurfaces, never in this renderer.
export function drawPierExpansion(c, g) {
  const kind = g.room.expansionScene?.kind;
  if (!kind) return;
  const w = g.room.worldBounds.w,
    floor = g.room.decoration.groundY,
    t = g.time;
  c.save();
  c.globalAlpha = 0.85;
  if (kind === "customs") {
    rect(c, 210, 315, 740, 22, "#53645b");
    polygon(
      c,
      [
        [170, 315],
        [315, 235],
        [890, 235],
        [985, 315],
      ],
      "#243e42",
    );
    for (const x of [235, 900]) rect(c, x, 320, 16, 300, "#29454a");
    rect(c, 590, 355, 175, 120, "#20383d");
    rect(c, 605, 368, 145, 96, "#a7a27a17");
    c.fillStyle = "#a6aa8a";
    c.font = "15px Georgia";
    c.fillText("ГРУЗОВОЕ КОЛЬЦО →", 610, 402);
    for (let i = 0; i < 5; i++)
      rect(c, 445 + i * 12, 548 + (i % 2) * 3, 19, 8, "#beb590");
  } else if (kind === "packhouse") {
    rect(c, 220, 150, 980, 470, "#20393f");
    for (let x = 280; x < 1200; x += 185) {
      rect(c, x, 180, 12, 440, "#3b514b");
      for (const y of [280, 390, 500]) rect(c, x - 40, y, 205, 9, "#586b5e");
    }
    for (let i = 0; i < 8; i++)
      rect(c, 320 + i * 105, 205, 57, 65, "#74806b35");
    line(c, 710, 140, 710, 440, "#778271", 3);
  } else if (kind === "shipyard") {
    polygon(
      c,
      [
        [125, 525],
        [350, 580],
        [1130, 580],
        [1300, 510],
        [1170, 690],
        [340, 690],
      ],
      "#203a40",
    );
    for (let x = 360; x < 1170; x += 110)
      line(c, x, 592, x + 40, 680, "#4b6258", 4);
    line(c, 285, 220, 300, 570, "#4a625d", 8);
    line(c, 300, 260, 700, 320, "#60746a", 2);
    polygon(
      c,
      [
        [320, 275],
        [620, 323],
        [325, 470],
      ],
      "#86917b16",
    );
  } else if (kind === "lighthouse") {
    rect(c, 470, 150, 245, 850, "#263e41");
    for (let y = 260; y < 1000; y += 115)
      line(c, 477, y, 706, y - 15, "#425b52", 2);
    polygon(
      c,
      [
        [430, 150],
        [590, 55],
        [750, 150],
      ],
      "#334b4a",
    );
    rect(c, 460, 145, 270, 70, "#6d7964");
    rect(c, 485, 152, 220, 55, "#a7b49825");
    wheel(c, 595, 180, 28, 0);
    line(c, 715, 220, w, 220, "#526c61", 4);
  } else if (kind === "fishing") {
    line(c, 220, 320, 980, 350, "#89917b", 3);
    for (let i = 0; i < 14; i++) {
      const x = 235 + i * 50;
      line(c, x, 330, x - 55, 535, "#69837655", 1);
      line(c, x, 330, x + 55, 535, "#69837655", 1);
    }
    for (let y = 370; y < 535; y += 30)
      line(c, 200, y, 920, y + 13, "#73897740", 1);
    rect(c, 550, 585, 200, 12, "#59695a");
    for (const x of [565, 720]) rect(c, x, 597, 7, 23, "#475c50");
  } else if (kind === "cargo") {
    for (const x of [220, 1240]) {
      line(c, x, 200, x, floor, "#2e494b", 15);
      wheel(c, x, 205, 45, Math.sin(t * 0.15) * 0.08);
    }
    line(c, 220, 155, 1240, 155, "#4d635a", 5);
    const moving = g.surfaces.find((s) => s.id === "P15.moving_cargo");
    if (moving) {
      for (const x of [moving.x + 18, moving.x + moving.w - 18])
        line(c, x, 190, x, moving.y, "#7c8775", 2);
      rect(c, moving.x + 35, moving.y + 5, 80, 35, "#586d5c");
    }
  } else if (kind === "winch") {
    rect(c, 430, 355, 380, 265, "#233d41");
    wheel(
      c,
      620,
      465,
      90,
      g.flags.includes("shortcut.pier_winch")
        ? t * 0.12
        : Math.sin(t * 0.2) * 0.015,
    );
    line(c, 710, 410, 1060, 255, "#809078", 3);
    line(c, 530, 465, 220, 480, "#667b67", 3);
  } else if (kind === "tidehouse") {
    rect(c, 180, 290, 650, 510, "#263b3d");
    for (const x of [260, 560]) {
      rect(c, x, 365, 140, 160, "#172f37");
      rect(c, x + 10, 375, 120, 140, "#899a7b0d");
    }
    rect(c, 0, 720, w, 80, "#83a9a21b");
    line(c, 0, 720, w, 720, "#96b9a547", 2);
    for (let x = 0; x < w; x += 80)
      line(c, x, 760 + Math.sin(t * 0.6 + x) * 2, x + 36, 760, "#9bb8a428", 1);
    rect(c, 825, 590, 38, 210, "#3e625c");
    line(c, 845, 610, 930, 610, "#5e7d69", 7);
  } else if (kind === "balcony") {
    for (const x of [460, 730]) {
      line(c, x, 80, x, 780, "#536b63", 3);
      wheel(c, x, 120, 28, t * 0.03);
    }
    line(c, 500, 240, w, 240, "#5a7366", 4);
    for (let x = 570; x < w; x += 105) line(c, x, 220, x, 145, "#4b685d", 3);
    rect(c, 950, 80, 190, 115, "#233e42");
    rect(c, 964, 92, 160, 85, "#adba8e16");
  }
  c.restore();
}
