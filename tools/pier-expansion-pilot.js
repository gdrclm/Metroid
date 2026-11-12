// Authored regression route. This is test tooling, not autonomous in-game AI.
import { JourneyPilot, journeyTasks } from "./pilot.js";
const go = (room) => ({ room, kind: "arrive" });
const use = (room, id, flag) => ({ room, kind: "use", id, flag });
export function pierExpansionTasks() {
  return [
    ...journeyTasks(),
    go("P03"),
    go("P10"),
    use("P10", "npc.customs_keeper"),
    go("P11"),
    go("P12"),
    go("P17"),
    use("P17", "note.tide_ledger"),
    go("P12"),
    go("P14"),
    use("P14", "lever.fish_ladder", "shortcut.fish_ladder"),
    go("P02"),
    go("P14"),
    go("P15"),
    go("P16"),
    use("P16", "lever.pier_winch", "shortcut.pier_winch"),
    go("P07"),
    go("P16"),
    go("P18"),
    go("P08"),
    go("P11"),
    go("P13"),
    use("P13", "note.old_beacon"),
    go("P18"),
    go("P08"),
    go("R08"),
  ];
}
export class PierExpansionPilot extends JourneyPilot {
  constructor(tasks = pierExpansionTasks()) {
    super(tasks);
  }
  tower(g) {
    const p = g.player,
      feet = p.y + p.h,
      ground = g.room.decoration.groundY;
    if (feet <= 222 && p.grounded) return null;
    if (p.y < 160) return this.action(g, ["right", "jump"]);
    if (feet > ground - 2 && Math.abs(p.x + 12 - 600) > 20)
      return this.walk(g, 600);
    if (p.wall) this.state.towerDir = -p.wall;
    const dir = (this.state.towerDir ||= p.x + 12 < 602 ? 1 : -1);
    return this.action(
      g,
      [dir > 0 ? "right" : "left", "jump"],
      p.grounded || (p.wall && p.wallLock <= 0) ? ["jump"] : [],
    );
  }
  highWarehouse(g) {
    const feet = g.player.y + g.player.h;
    if (feet > 560) return this.walk(g, 385, 550);
    if (feet > 480) return this.walk(g, 540, 470);
    if (feet > 400) return this.walk(g, 780, 390);
    return null;
  }
  travel(g, target) {
    const r = g.room.roomId,
      p = g.player,
      feet = p.y + p.h,
      path = this.route(g, target),
      exit = g.room.exits.find((e) => e.targetRoomId === path[1]);
    if (!exit) return this.action(g);
    if (r === "P12" && exit.targetRoomId === "P17" && feet < 645) {
      if (Math.abs(p.x + 12 - 520) > 20) return this.walk(g, 520);
      return this.action(g, ["down"], p.grounded ? ["jump"] : []);
    }
    if ((r === "P13" || r === "P18") && exit.y === 220) {
      const climb = this.tower(g);
      if (climb) return climb;
    }
    if (r === "P11" && exit.y === 390) {
      const climb = this.highWarehouse(g);
      if (climb) return climb;
    }
    if (r === "P12" && exit.targetRoomId === "P14" && feet > 505) {
      if (feet > 600) return this.walk(g, 500, 580);
      if (feet > 550) return this.walk(g, 620, 530);
      return this.walk(g, 760, 500);
    }
    if (
      r === "P15" &&
      exit.targetRoomId === "P16" &&
      !g.flags.includes("shortcut.pier_winch")
    ) {
      if (feet > 680) return this.walk(g, 455, 670);
      if (feet > 600) return this.walk(g, 670, 590);
      if (feet > 530) return this.walk(g, 840, 470);
      if (p.x < 350) {
        if (p.grounded && p.x + 12 < 300) return this.walk(g, 300);
        return this.action(
          g,
          ["right", "jump"],
          p.grounded ? ["jump"] : p.dashReady && p.vy > -150 ? ["dash"] : [],
        );
      }
      if (p.x < 1120)
        return this.action(
          g,
          ["right", "jump"],
          p.grounded ? ["jump"] : p.dashReady && p.vy > -150 ? ["dash"] : [],
        );
    }
    return super.travel(g, target);
  }
  next(g) {
    const task = this.tasks[this.index];
    if (!g.transition && task?.room === g.room.roomId && task.kind === "use") {
      if (g.room.roomId === "P13") {
        const climb = this.tower(g);
        if (climb) return climb;
      }
      if (g.room.roomId === "P17") {
        const feet = g.player.y + g.player.h;
        if (feet > 715) return this.walk(g, 280, 710);
        if (feet > 665) return this.walk(g, 480, 660);
      }
    }
    return super.next(g);
  }
}
