const rect = (c, x, y, w, h, color) => {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
};
const line = (c, x, y, xx, yy, color, width = 1) => {
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(xx, yy);
  c.strokeStyle = color;
  c.lineWidth = width;
  c.stroke();
};
function warm(c, x, y, r, strength = 0.2) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(220,173,93,${strength})`);
  g.addColorStop(1, "rgba(220,173,93,0)");
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}
function person(c, x, y, activity, t, wind = 0) {
  c.save();
  c.translate(x, y);
  const arm =
    activity === "tea" ? Math.sin(t * 0.8) * 3 : Math.sin(t * 0.5) * 5;
  rect(c, -9, -34, 18, 31, "#536b61");
  rect(c, -7, -48, 14, 14, "#aaa98c");
  rect(c, -9, -51, 19, 6, "#2f4b4a");
  line(c, -5, -3, -6, 0, "#203943", 5);
  line(c, 6, -3, 7, 0, "#203943", 5);
  line(c, 6, -28, 21, -20 + arm, "#889781", 4);
  if (activity === "tea") {
    rect(c, 17, -23 + arm, 9, 7, "#c4b68d");
    line(c, 24, -23 + arm, 27, -21 + arm, "#b9b08c", 2);
  } else {
    rect(c, 9, -22 + arm, 27, 9, "#acaf94");
    line(c, 8, -19 + arm, 35 + wind * 0.03, -18 + arm, "#6e8c80", 2);
  }
  c.restore();
}
function prop(c, p, g) {
  const { x, y } = p;
  switch (p.kind) {
    case "floodMarks":
      rect(c, x - 35, y - 85, 120, 105, "#84a9a012");
      for (let i = 0; i < 3; i++) {
        line(c, x, y - i * 28, x + 42 + i * 15, y - i * 28, "#6c97915a", 2);
        line(c, x - 3, y - i * 28 - 4, x - 3, y - i * 28 + 4, "#a6b49b70", 2);
      }
      break;
    case "boardedDoor":
      rect(c, x - 24, y - 94, 48, 94, "#152d33");
      for (let i = 0; i < 3; i++) {
        rect(c, x - 30, y - 80 + i * 26, 61, 11, "#4e655b");
        line(c, x - 28, y - 79 + i * 26, x + 29, y - 73 + i * 26, "#8d907453");
      }
      break;
    case "raisedStorage":
      line(c, x - 45, y + 4, x + 55, y + 4, "#85917a", 4);
      for (let i = 0; i < 3; i++) {
        rect(
          c,
          x - 34 + i * 27,
          y - 30 - (i % 2) * 10,
          23,
          29 + (i % 2) * 10,
          "#5c6e5b",
        );
        line(c, x - 33 + i * 27, y - 25, x - 12 + i * 27, y - 4, "#9fa18366");
      }
      break;
    case "patchedPlanks":
      for (let i = 0; i < 5; i++)
        rect(c, x + i * 21, y, 18, 4, ["#758572", "#8e9475", "#506b63"][i % 3]);
      break;
    case "lightBeam":
      c.save();
      c.globalAlpha = 0.08;
      c.fillStyle = "#e1d4a5";
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + p.w, y);
      c.lineTo(x + p.w + 42, y + p.h);
      c.lineTo(x - 28, y + p.h);
      c.fill();
      c.restore();
      break;
    case "stationHome":
      rect(c, x, y - 37, 105, 12, "#4b635d");
      rect(c, x + 5, y - 47, 75, 12, "#8b9c83");
      rect(c, x + 73, y - 48, 25, 10, "#c3bd9a");
      rect(c, x + 120, y - 56, 18, 5, "#b2b48f");
      line(c, x + 129, y - 51, x + 129, y, "#6e8576", 3);
      break;
    case "platformAddress":
      rect(c, x - 55, y - 14, 125, 27, "#263e40");
      c.fillStyle = "#b5ba97";
      c.font = "10px Arial";
      c.textAlign = "center";
      c.fillText("ПЛАТФОРМА II · ЖИЛЬЁ", x + 7, y + 3);
      break;
    case "ticketWindow":
      rect(c, x - 50, y - 48, 100, 96, "#142e35");
      for (let i = 0; i < 6; i++)
        line(c, x - 46 + i * 18, y - 43, x - 46 + i * 18, y + 30, "#6b8273", 2);
      rect(c, x - 60, y + 34, 120, 9, "#778777");
      c.fillStyle = "#aeb58e";
      c.font = "12px Georgia";
      c.textAlign = "center";
      c.fillText("КАССА", x, y - 61);
      break;
    case "sharedWire":
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + p.w * 0.5, y + 26, x + p.w, y - 8);
      c.strokeStyle = "#9b9d7d70";
      c.lineWidth = 2;
      c.stroke();
      for (let i = 0; i < 3; i++) {
        const xx = x + (p.w * (i + 1)) / 4,
          sway = g.atmosphere.wind.gust * 4 * Math.sin(g.time * 0.7 + i);
        rect(c, xx, y + 14, 18, 27, "#80948745");
        line(c, xx, y + 14, xx + 18 + sway, y + 40, "#b5b89d55");
      }
      break;
    case "windowBridge":
      for (let i = 0; i < 8; i++) rect(c, x + i * 17, y, 15, 5, "#78907a70");
      line(c, x, y - 32, x + 135, y - 32, "#9da58b60", 2);
      line(c, x, y - 32, x, y, "#627d6b", 2);
      line(c, x + 135, y - 32, x + 135, y, "#627d6b", 2);
      break;
    case "sharedKitchen":
      rect(c, x - 70, y - 50, 140, 8, "#7c8a6d");
      line(c, x - 60, y - 42, x - 60, y, "#536c5e", 4);
      line(c, x + 60, y - 42, x + 60, y, "#536c5e", 4);
      for (let i = 0; i < 4; i++)
        rect(c, x - 46 + i * 28, y - 61, 10, 10, "#bac19f");
      break;
  }
}
export function drawAtmosphere(c, game) {
  const g = game,
    a = g.atmosphere,
    t = g.time,
    room = g.room,
    floor = room.decoration.groundY;
  for (const p of room.storyProps || [])
    if (a.condition(p.requires)) prop(c, p, g);
  if (room.roomId === "P01") {
    const phase = a.phase("scene.boat_departed");
    if (phase < 1) {
      const x = 110 - Math.pow(phase, 1.4) * 400,
        y = floor - 18 + Math.sin(t * 1.4) * 2;
      c.save();
      c.globalAlpha = 1 - Math.max(0, (phase - 0.75) * 4);
      c.translate(x, y);
      c.fillStyle = "#24444a";
      c.beginPath();
      c.moveTo(-88, -10);
      c.lineTo(82, -10);
      c.lineTo(56, 17);
      c.lineTo(-65, 17);
      c.closePath();
      c.fill();
      line(c, -76, -11, 70, -11, "#93a286", 3);
      person(c, 0, -11, "cloth", t);
      line(c, 25, -42, phase < 0.15 ? 95 : 65, 18, "#809381", 3);
      for (let i = 0; i < 3; i++)
        line(
          c,
          -70 - i * 22,
          20 + i * 5,
          55 - i * 22,
          20 + i * 5,
          "#92bab158",
          1,
        );
      c.restore();
      if (phase < 0.12) line(c, 320, floor - 20, x + 64, y - 8, "#7b9380", 2);
    }
    line(
      c,
      320,
      floor - 18,
      327 + Math.sin(t * 0.4) * 2,
      floor - 5,
      "#879b82",
      2,
    );
  }
  if (room.roomId === "P02") {
    const phase = a.phase("scene.warm_house");
    warm(c, 375, floor - 55, 145, phase > 0.1 ? 0.25 : 0.17);
    rect(c, 349, floor - 57, 52, 57, "#273d3d");
    rect(c, 358, floor - 43, 34, 31, "#b1804c");
    line(c, 375, floor - 57, 375, 300, "#344c4b", 14);
    rect(c, 476, floor - 20, 55, 15, "#9aa48a");
    person(c, 565, floor, phase > 0.25 ? "tea" : "cloth", t, a.wind.x);
    if (phase > 0.25) {
      rect(c, 508, floor - 48, 47, 5, "#718575");
      rect(c, 522, floor - 56, 10, 8, "#c7c39f");
    }
  }
  if (room.roomId === "V01") {
    const phase = a.phase("scene.first_ascent");
    warm(c, 265, 365, 150, 0.04 + phase * 0.07);
    // Reclaimed advertising panels partition beds without closing the route.
    rect(c, 930, floor - 138, 125, 100, "#3e575350");
    line(c, 928, floor - 140, 1058, floor - 140, "#82947a66", 3);
    c.fillStyle = "#b7b18b66";
    c.font = "13px Georgia";
    c.textAlign = "center";
    c.fillText("ПУТЕШЕСТВУЙТЕ", 992, floor - 99);
  }
  if (room.roomId === "R02") {
    const phase = a.phase("scene.fire_ladder");
    if (phase > 0) {
      warm(c, 860, floor - 190, 115, phase * 0.18);
      rect(c, 833, floor - 220, 60, 62, `rgba(202,175,107,${0.22 * phase})`);
      rect(c, 754, floor - 29, 40, 29, "#8b8260");
      for (let i = 0; i < 4; i++)
        line(c, 758 + i * 9, floor - 27, 758 + i * 9, floor - 2, "#b6ac7b", 1);
      person(
        c,
        900 - Math.min(1, phase * 1.7) * 185,
        floor,
        "cloth",
        t,
        a.wind.x,
      );
    }
  }
  if (room.roomId === "R07" && a.phase("scene.fire_ladder") > 0) {
    warm(c, 115, floor - 130, 110, 0.13);
    rect(c, 83, floor - 170, 46, 49, "#b6a87540");
  }
}
export function drawAtmosphereDebug(c, g) {
  c.save();
  c.font = "12px monospace";
  c.lineWidth = 1;
  if (g.debug.audioSources)
    for (const s of g.audioDebugSources || g.room.audioSources || []) {
      c.strokeStyle = s.blocked ? "#d29579" : "#8ec4b0";
      c.setLineDash([5, 8]);
      c.beginPath();
      c.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = c.strokeStyle;
      c.fillRect(s.x - 3, s.y - 3, 6, 6);
      c.fillText(s.id, s.x + 6, s.y - 8);
    }
  if (g.debug.emitters)
    for (const e of g.room.emitters || []) {
      c.strokeStyle = "#d3bd82";
      c.strokeRect(
        e.x - 3,
        e.y - 3,
        Math.max(6, e.area?.w || 0),
        Math.max(6, e.area?.h || 0),
      );
      line(
        c,
        e.x,
        e.y,
        e.x + e.direction.x * 35,
        e.y + e.direction.y * 35,
        "#d3bd82",
        2,
      );
      c.fillStyle = "#d3bd82";
      c.fillText(e.id, e.x + 8, e.y + 14);
    }
  c.restore();
}
