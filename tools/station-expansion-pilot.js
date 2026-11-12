// Deterministic test route; no writes to positions, flags, resources or physics.
import {
  PierExpansionPilot,
  pierExpansionTasks,
} from "./pier-expansion-pilot.js";
const go = (room) => ({ room, kind: "arrive" });
const use = (room, id, flag) => ({ room, id, flag, kind: "use" });
export function stationExpansionTasks({ care = true } = {}) {
  return [
    ...pierExpansionTasks(),
    go("V01"),
    go("V05"),
    go("V06"),
    use("V06", "npc.settler"),
    use("V06", "note.settler_case"),
    go("V07"),
    use("V07", "npc.soup_server"),
    go("V08"),
    ...(care
      ? [
          use("V08", "guide.cache.v08"),
          use("V08", "care.station_basket", "story.station_meal"),
        ]
      : []),
    use("V08", "lever.station_canteen", "shortcut.station_canteen"),
    go("V02"),
    go("V03"),
    go("V09"),
    use("V09", "lever.dispatch_grid", "mechanism.dispatch_grid"),
    use("V09", "npc.dispatcher"),
    go("V10"),
    use("V10", "note.clock_timing"),
    go("V11"),
    use("V11", "npc.signal_repairer"),
    use("V11", "lever.station_signal", "mechanism.station_signal"),
    go("V06"),
    go("V12"),
    use("V12", "note.undelivered_letter"),
    go("V13"),
    use("V13", "lever.station_service_lift", "shortcut.station_service_lift"),
    go("V02"),
    go("V13"),
    go("V14"),
    use("V14", "lever.station_gallery", "shortcut.station_gallery"),
    go("V09"),
    go("V14"),
    go("V15"),
    use("V15", "note.bell_schedule"),
    go("V16"),
    use("V16", "note.archive_register"),
    go("V04"),
    go("R08"),
  ];
}
export class StationExpansionPilot extends PierExpansionPilot {
  constructor(tasks = stationExpansionTasks()) {
    super(tasks);
  }
  dispatch(g, targetX = 1100) {
    const p = g.player,
      feet = p.y + p.h;
    if (feet > 730) return this.walk(g, 515, 690);
    if (feet > 640) return this.walk(g, 765, 600);
    if (feet > 550) return this.walk(g, 980, 500);
    if (
      targetX > 850 &&
      p.x < 890 &&
      !g.flags.includes("mechanism.dispatch_grid")
    ) {
      if (p.grounded && p.x < 360) return this.walk(g, 390);
      return this.action(
        g,
        ["right", "jump"],
        p.grounded ? ["jump"] : p.dashReady && p.vy > -150 ? ["dash"] : [],
      );
    }
    return null;
  }
  clockGallery(g) {
    const p = g.player,
      feet = p.y + p.h,
      s = g.surfaces.find((s) => s.id === "V10.pendulum_carriage");
    if (p.grounded || this.state.clockStage === undefined)
      this.state.clockStage =
        feet > 710 ? 0 : feet > 630 ? 1 : feet > 550 ? 2 : feet > 485 ? 3 : 4;
    if (this.state.clockStage === 0) return this.walk(g, 325, 680);
    if (this.state.clockStage === 1) return this.walk(g, s.x + 80, 590);
    if (this.state.clockStage === 2) {
      if (p.grounded && p.support?.id === s.id && s.x + s.w < 610)
        return this.action(g);
      return this.walk(g, 755, 500);
    }
    if (this.state.clockStage === 3) return this.walk(g, 1020, 460);
    return null;
  }
  liftTower(g) {
    const p = g.player,
      feet = p.y + p.h;
    if (feet <= 202 && p.grounded) return null;
    if (p.y < 140) return this.action(g, ["right", "jump"]);
    if (feet > 938 && Math.abs(p.x + 12 - 622) > 20) return this.walk(g, 622);
    if (p.wall) this.state.liftDir = -p.wall;
    const dir = (this.state.liftDir ||= p.x + 12 < 622 ? 1 : -1);
    return this.action(
      g,
      [dir > 0 ? "right" : "left", "jump"],
      p.grounded || (p.wall && p.wallLock <= 0) ? ["jump"] : [],
    );
  }
  travel(g, target) {
    const id = g.room.roomId,
      p = g.player,
      feet = p.y + p.h,
      path = this.route(g, target),
      e = g.room.exits.find((e) => e.targetRoomId === path[1]);
    if (!e) return this.action(g);
    if (id === "V05") {
      if (e.y === 840 && feet < 838)
        return this.action(g, ["down"], p.grounded ? ["jump"] : []);
      if (e.y === 520) {
        if (feet > 800) return this.walk(g, 325, 760);
        if (feet > 720) return this.walk(g, 515, 680);
        if (feet > 640) return this.walk(g, 705, 600);
        if (feet > 560) return this.walk(g, 940, 520);
      }
    }
    if (id === "V09") {
      if (e.y === 780 && feet < 778)
        return this.action(g, ["down"], p.grounded ? ["jump"] : []);
      if (e.y === 500) {
        const a = this.dispatch(g, e.x);
        if (a) return a;
      }
    }
    if (id === "V13") {
      if (e.y === 200) {
        const a = this.liftTower(g);
        if (a) return a;
      } else if (feet < 938)
        return this.action(g, ["down"], p.grounded ? ["jump"] : []);
    }
    return super.travel(g, target);
  }
  next(g) {
    const task = this.tasks[this.index];
    if (!g.transition && task?.room === g.room.roomId && task.kind === "use") {
      if (g.room.roomId === "V09") {
        const a = this.dispatch(g);
        if (a) return a;
      }
      if (g.room.roomId === "V10") {
        const a = this.clockGallery(g);
        if (a) return a;
      }
    }
    return super.next(g);
  }
}
