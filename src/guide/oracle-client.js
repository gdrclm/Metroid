import { captureSimulation } from "./oracle.js";
export class Oracle {
  constructor(game) {
    this.game = game;
    this.serial = 0;
    this.pending = false;
    this.lastStamp = "";
    this.error = "";
    this.resultStamp = "";
    try {
      this.worker = new Worker(new URL("./oracle-worker.js", import.meta.url), {
        type: "module",
      });
      this.worker.postMessage({
        type: "init",
        world: game.world,
        config: game.config,
      });
      this.worker.onmessage = ({ data }) => {
        if (data.id !== this.serial) return;
        this.pending = false;
        if (data.stamp !== this.stamp()) return;
        this.error = data.error || "";
        this.resultStamp = data.stamp;
        game.guide.forecast = data.result || null;
      };
      this.worker.onerror = () => {
        this.error = "Прогноз временно недоступен";
        this.pending = false;
        this.worker.terminate();
        this.worker = null;
      };
    } catch {
      this.error = "Браузер не поддерживает прогноз в отдельном потоке";
    }
  }
  stamp() {
    const g = this.game;
    return [
      g.guide.generation,
      g.guide.commands.revision,
      g.guide.worldRevision,
      g.time,
      g.viewport.w,
      g.viewport.h,
      g.camera.x,
      g.camera.y,
    ].join(":");
  }
  reset() {
    this.serial++;
    this.pending = false;
    this.lastStamp = "";
    this.resultStamp = "";
    this.game.guide.forecast = null;
  }
  update() {
    if (!this.worker || this.game.mode !== "tactical") return;
    const stamp = this.stamp();
    if (this.resultStamp !== stamp) this.game.guide.forecast = null;
    if (this.lastStamp === stamp || this.pending) return;
    this.lastStamp = stamp;
    this.pending = true;
    this.game.guide.forecast = null;
    this.worker.postMessage({
      type: "forecast",
      id: ++this.serial,
      stamp,
      snapshot: captureSimulation(this.game),
    });
  }
}
