import { accessibleInteraction } from "../safety.js";

// Physical stations never create a rest point, respawn stock or a remote action.
export function useCareStation(g, id) {
  const target = g.room.entities.find((e) => e.id === id && e.type === "care");
  const d = g.guide,
    inventory = d.state.inventory;
  if (
    !d.enabled ||
    g.mode !== "playing" ||
    !target ||
    !accessibleInteraction(g.player, target, g.surfaces)
  )
    return { ok: false, reason: "Подведите героя к предмету" };
  if (target.action === "donate" && g.flags.includes(target.flag))
    return { ok: false, reason: "Паёк уже передан жителям" };
  if (target.action === "food" && d.state.needs.satiety >= 95)
    return { ok: false, reason: "Герой пока сыт. Припасы пригодятся позже" };
  if (target.action === "coffee" && d.state.caffeine)
    return { ok: false, reason: "Кофе уже приготовлен" };
  const item = target.action === "coffee" ? "beans" : "rations";
  if (!["food", "coffee", "donate"].includes(target.action))
    return { ok: false, reason: "Предмет не готов к использованию" };
  if (inventory[item] < 1)
    return {
      ok: false,
      reason:
        item === "beans" ? "Для кофе нужны зёрна" : "Нужен хотя бы один паёк",
    };
  inventory[item]--;
  if (target.action === "food") d.needs.eat();
  if (target.action === "coffee") d.needs.coffee();
  if (target.action === "donate") {
    d.state.needs.stress = Math.max(0, d.state.needs.stress - 8);
    g.flag(target.flag);
  }
  if (!g.progress.hints.includes(target.id)) g.progress.hints.push(target.id);
  d.worldRevision++;
  d.message =
    target.action === "food"
      ? "Похлёбка готова: потрачен один паёк"
      : target.action === "coffee"
        ? "Кофе приготовлен: потрачена порция зёрен"
        : "Паёк оставлен жителям. Раздатчица узнает об этом";
  g.save();
  g.emit("sound", target.action === "coffee" ? "kettle" : "rest");
  g.emit("toast", d.message);
  g.emit("progress");
  return { ok: true };
}
