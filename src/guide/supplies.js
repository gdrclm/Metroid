import { accessibleInteraction } from "../safety.js";

export class Supplies {
  constructor(director) {
    this.director = director;
  }
  get available() {
    const d = this.director;
    if (!d.enabled) return [];
    return (d.game.world.guideCaches || [])
      .filter(
        (c) =>
          c.roomId === d.game.room.roomId &&
          !d.state.collectedSupplies.includes(c.id),
      )
      .map((c) => ({
        ...c,
        type: "supply",
        interactionPoint: { x: c.x, y: c.y - 16 },
      }));
  }
  collect(id) {
    const d = this.director,
      g = d.game,
      target = this.available.find((c) => c.id === id);
    if (
      g.mode !== "playing" ||
      !target ||
      !accessibleInteraction(g.player, target, g.surfaces)
    )
      return { ok: false, reason: "Подведите героя к припасам" };
    if (
      Object.entries(target.contents).some(
        ([item, count]) => d.state.inventory[item] + count > 99,
      )
    )
      return { ok: false, reason: "В запасе нет места для всех припасов" };
    for (const [item, count] of Object.entries(target.contents))
      d.state.inventory[item] += count;
    d.state.collectedSupplies.push(target.id);
    d.worldRevision++;
    d.message =
      "Найдено: " +
      Object.entries(target.contents)
        .map(
          ([item, count]) =>
            `${item === "beans" ? "зёрна" : "припасы"} +${count}`,
        )
        .join(" · ");
    g.save();
    g.emit("sound", "pickup");
    g.emit("toast", d.message);
    g.emit("progress");
    return { ok: true };
  }
}
