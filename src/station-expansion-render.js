// Background shapes only. Every traversable support comes from Game.surfaces.
const rect = (c, x, y, w, h, color) => {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
};
const line = (c, x, y, xx, yy, color, width = 2) => {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(xx, yy);
  c.stroke();
};
const ellipse = (c, x, y, rx, ry, color) => {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
};
function clock(c, x, y, r, t) {
  c.strokeStyle = "#829480";
  c.lineWidth = 3;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    line(
      c,
      x + Math.cos(a) * (r - 5),
      y + Math.sin(a) * (r - 5),
      x + Math.cos(a) * r,
      y + Math.sin(a) * r,
      "#819079",
      2,
    );
  }
  line(
    c,
    x,
    y,
    x + Math.sin(t * 0.025) * r * 0.7,
    y - Math.cos(t * 0.025) * r * 0.7,
    "#bac2a0",
    2,
  );
  line(
    c,
    x,
    y,
    x + Math.sin(t * 0.003) * r * 0.45,
    y - Math.cos(t * 0.003) * r * 0.45,
    "#a2ae8f",
    3,
  );
}
function text(c, value, x, y) {
  c.fillStyle = "#a6ac8b";
  c.font = "15px Georgia";
  c.fillText(value, x, y);
}
export function drawStationExpansion(c, g) {
  if (g.room.contentBatch !== "act1.station.expansion") return;
  const k = g.room.expansionScene.kind,
    w = g.room.worldBounds.w,
    f = g.room.decoration.groundY,
    t = g.time;
  c.save();
  c.globalAlpha = 0.82;
  if (k === "arrival_stairs") {
    rect(c, 170, 210, 820, 630, "#263c3f");
    for (const [x, y] of [
      [240, 760],
      [430, 680],
      [620, 600],
      [810, 520],
    ]) {
      line(c, x, y - 82, x + 145, y - 82, "#5a7266", 3);
      for (const dx of [0, 145])
        line(c, x + dx, y - 82, x + dx, y, "#496258", 3);
    }
    text(c, "ПРИБЫВШИМ — НАВЕРХ", 460, 280);
    for (let y = 400; y < 850; y += 140) {
      rect(c, 190, y, 45, 65, "#74836c28");
      line(c, 200, y + 15, 225, y + 15, "#a4ae805c", 2);
    }
  } else if (k === "settlers") {
    const lit = g.flags.includes("mechanism.station_signal");
    rect(c, 130, 230, w - 250, 350, "#273e43");
    for (let x = 190; x < w - 120; x += 195) {
      rect(c, x, 275, 130, 170, "#172f36");
      rect(c, x + 8, 280, 50, 158, "#716e5433");
      rect(c, x + 74, 280, 48, 158, "#85866729");
    }
    for (const x of [350, 740, 1100]) {
      rect(c, x, 578, 55, 42, "#6e6a4e");
      line(c, x + 13, 578, x + 40, 578, "#b1a47c", 3);
    }
    rect(c, 1050, 240, 25, 37, lit ? "#dcc48e" : "#5d7662");
    if (lit) {
      c.globalAlpha = 0.15;
      ellipse(c, 1062, 258, 75, 75, "#e2bb72");
      c.globalAlpha = 0.82;
    }
    text(c, "ОБЩАЯ ПЛАТФОРМА", 600, 248);
  } else if (k === "soup_queue") {
    rect(c, 90, 220, 800, 380, "#293f3f");
    rect(c, 490, 285, 260, 170, "#183137");
    text(c, "ПРИНЕСИ, ЧТО МОЖЕШЬ", 500, 340);
    for (let x = 140; x < 480; x += 80) {
      line(c, x, 530, x, 615, "#687864", 4);
      line(c, x, 548, x + 80, 555, "#8a8b6d", 2);
    }
    rect(c, 700, 580, 150, 14, "#63705a");
  } else if (k === "canteen") {
    rect(c, 170, 220, 900, 340, "#35473e");
    for (const x of [240, 750, 950]) {
      rect(c, x, 280, 110, 160, "#1b3336");
      rect(c, x + 9, 290, 92, 140, "#c3a86a12");
    }
    line(c, 410, 280, 410, 555, "#657363", 28);
    rect(c, 370, 500, 80, 80, "#485448");
    rect(c, 610, 570, 38, 45, "#7d7753");
    for (const x of [180, 1140]) {
      rect(c, x, 575, 100, 9, "#637258");
      line(c, x + 10, 584, x + 10, 620, "#4c6354", 5);
    }
    if (g.flags.includes("story.station_meal")) {
      for (let i = 0; i < 4; i++)
        ellipse(c, 805 + i * 21, 554, 8, 3, "#c4b884");
    }
  } else if (k === "dispatch") {
    rect(c, 1010, 210, 320, 260, "#2a4142");
    for (let i = 0; i < 4; i++)
      rect(c, 1030 + i * 72, 235, 54, 100, "#92b2a31b");
    rect(c, 1010, 414, 315, 45, "#3e554b");
    for (let i = 0; i < 5; i++)
      line(c, 1050 + i * 47, 445, 1060 + i * 47, 425, "#b1ac81", 3);
    line(c, 90, 275, w - 100, 275, "#6b7e6b", 6);
    for (const x of [330, 1000]) {
      line(c, x, 275, x, 495, "#5a7266", 3);
      clock(c, x, 310, 25, t);
    }
  } else if (k === "clock_hall") {
    rect(c, 170, 100, 1050, 560, "#253c3f");
    for (const [i, x] of [330, 650, 980].entries()) {
      clock(c, x, 245 + i * 20, 72, t + i * 120);
      line(c, x, 320 + i * 20, x + Math.sin(t * 0.7) * 70, 460, "#7b8a70", 4);
    }
    const s = g.surfaces.find((s) => s.id === "V10.pendulum_carriage");
    if (s) {
      line(c, s.x + 30, 420, s.x + 30, s.y, "#8b967a", 2);
      line(c, s.x + s.w - 30, 420, s.x + s.w - 30, s.y, "#8b967a", 2);
    }
    text(c, "СМОТРИ НА ТЯГУ", 900, 405);
  } else if (k === "signal_shop") {
    rect(c, 130, 250, 710, 330, "#2b4140");
    for (let x = 160; x < 800; x += 120) {
      line(c, x, 285, x + 35, 285, "#6f806b", 6);
      line(c, x + 35, 285, x + 35, 365, "#64775f", 3);
    }
    for (let i = 0; i < 11; i++) ellipse(c, 660 + i * 8, 520, 8, 27, "#8a8c67");
    line(
      c,
      720,
      495,
      900,
      385,
      g.flags.includes("mechanism.station_signal") ? "#b5b788" : "#617660",
      3,
    );
    text(c, "СИГНАЛ — НИЖНЯЯ ПЛАТФОРМА", 195, 423);
  } else if (k === "mail") {
    rect(c, 170, 180, w - 330, 440, "#293f40");
    for (let y = 240; y < 540; y += 95) {
      line(c, 190, y, w - 170, y, "#63745e", 5);
      for (let x = 240; x < w - 150; x += 130)
        rect(c, x, y - 52, 55, 48, "#857b5355");
    }
    text(c, "НЕ ВОСТРЕБОВАНО", 810, 585);
  } else if (k === "service_lift") {
    rect(c, 490, 130, 260, 810, "#283e41");
    for (let y = 220; y < 900; y += 120)
      line(c, 495, y, 745, y - 15, "#506b5c", 2);
    for (const x of [170, 350]) line(c, x, 150, x, 940, "#78896c", 3);
    rect(c, 150, 805, 220, 125, "#48605255");
    for (let x = 170; x < 360; x += 35) line(c, x, 820, x, 930, "#80927380", 2);
    clock(c, 260, 770, 28, t * 0.1);
  } else if (k === "upper_gallery") {
    for (let x = 160; x < w - 80; x += 230) {
      rect(c, x, 180, 150, 275, "#203a40");
      rect(c, x + 8, 188, 134, 259, "#9fb6a80b");
      line(c, x + 75, 190, x + 75, 445, "#506c61", 3);
    }
    for (let i = 0; i < 4; i++) {
      line(c, 180, 230 + i * 15, w - 90, 300 + i * 8, "#708268", 2);
      rect(c, 340 + i * 190, 575, 30, 45, "#6c7253");
    }
    if (g.flags.includes("mechanism.station_signal"))
      rect(c, 1100, 430, 7, 10, "#d3bd84");
  } else if (k === "bellway") {
    for (let x = 150; x < w; x += 250) {
      line(c, x, 140, x, f, "#334e4d", 12);
      line(c, x - 70, 185, x + 90, 185, "#617667", 4);
    }
    line(c, 0, 245, w, 150, "#9ca385", 3);
    line(c, 0, 265, w, 170, "#718b76", 2);
    for (let i = 0; i < 3; i++) {
      rect(c, 850 + i * 80, 320 - i * 25, 35, 180, "#294749");
      ellipse(c, 867 + i * 80, 345 - i * 25, 10, 12, "#78937b42");
    }
  } else if (k === "archive_threshold") {
    rect(c, 480, 280, 340, 520, "#243e42");
    for (let x = 510; x < 800; x += 38) line(c, x, 310, x, 800, "#607d70", 6);
    for (let i = 0; i < 3; i++) {
      ellipse(c, 560 + i * 80, 570, 23, 23, "#142f37");
      ellipse(c, 560 + i * 80, 570, 10, 10, "#71927c33");
    }
    text(c, "РАЙОННЫЕ РЕГУЛЯТОРЫ", 505, 355);
    line(c, 815, 380, w, 380, "#75876f", 9);
    line(c, 815, 420, w, 420, "#4d6f64", 11);
  }
  c.restore();
}
