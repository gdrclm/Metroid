const keys = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  Space: "jump",
  KeyZ: "jump",
  KeyJ: "attack",
  KeyX: "attack",
  ShiftLeft: "dash",
  ShiftRight: "dash",
  KeyK: "dash",
  KeyE: "interact",
  Enter: "confirm",
  Escape: "pause",
  KeyM: "map",
  Backquote: "debug",
};
export class Input {
  constructor(target = window) {
    this.keys = new Set();
    this.touch = new Set();
    this.pointers = new Map();
    this.pad = new Set();
    this.blockedPad = new Set();
    this.previous = new Set();
    this.edges = new Set();
    this.held = new Set();
    this.device = "keyboard";
    this.onBlur = () => {};
    target.addEventListener("keydown", (e) => {
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (keys[e.code]) {
        e.preventDefault();
        if (e.repeat) return;
        if (!this.keys.has(e.code)) this.edges.add(keys[e.code]);
        this.keys.add(e.code);
        this.device = "keyboard";
      }
    });
    target.addEventListener("keyup", (e) => this.keys.delete(e.code));
    target.addEventListener("blur", () => {
      this.clear();
      this.onBlur();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.clear();
        this.onBlur();
      }
    });
    window.addEventListener("gamepaddisconnected", () => {
      this.pad.clear();
      this.clear();
      this.onBlur();
    });
    document.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        try {
          button.setPointerCapture(e.pointerId);
        } catch {
          /* Synthetic tests have no active pointer capture. */
        }
        this.edges.add(button.dataset.action);
        this.pointers.set(e.pointerId, button.dataset.action);
        this.touch = new Set(this.pointers.values());
        button.classList.add("pressed");
        this.device = "touch";
      });
      const release = (e) => {
        this.pointers.delete(e.pointerId);
        this.touch = new Set(this.pointers.values());
        button.classList.toggle(
          "pressed",
          this.touch.has(button.dataset.action),
        );
      };
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", release);
    });
  }
  poll() {
    this.pad.clear();
    const pad = Array.from(navigator.getGamepads?.() || []).find(Boolean);
    if (pad) {
      const b = (n) => pad.buttons[n]?.pressed;
      if (pad.axes[0] < -0.25 || b(14)) this.pad.add("left");
      if (pad.axes[0] > 0.25 || b(15)) this.pad.add("right");
      if (pad.axes[1] < -0.5 || b(12)) this.pad.add("up");
      if (pad.axes[1] > 0.5 || b(13)) this.pad.add("down");
      for (const [i, name] of [
        [0, "jump"],
        [2, "attack"],
        [1, "dash"],
        [3, "interact"],
        [9, "pause"],
        [8, "map"],
      ])
        if (b(i)) this.pad.add(name);
      if (this.pad.size) this.device = "gamepad";
    }
    for (const action of this.blockedPad)
      if (!this.pad.has(action)) this.blockedPad.delete(action);
    this.held = new Set(
      [...this.keys]
        .map((k) => keys[k])
        .concat([
          ...this.touch,
          ...[...this.pad].filter((action) => !this.blockedPad.has(action)),
        ]),
    );
    for (const name of this.held)
      if (!this.previous.has(name)) this.edges.add(name);
    this.previous = new Set(this.held);
  }
  down(name) {
    return this.held.has(name);
  }
  pressed(name) {
    return this.edges.has(name);
  }
  consume() {
    this.edges.clear();
  }
  clear() {
    for (const action of this.pad) this.blockedPad.add(action);
    this.keys.clear();
    this.touch.clear();
    this.pointers.clear();
    document
      .querySelectorAll("[data-action]")
      .forEach((b) => b.classList.remove("pressed"));
    this.pad.clear();
    this.held.clear();
    this.edges.clear();
    this.previous.clear();
  }
}
