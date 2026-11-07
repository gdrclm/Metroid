// Stencilled on platform faces in world space. No overlay or interruption.
const labels = {
  keyboard: {
    move: "A / D — идти",
    jump: "Пробел — прыжок",
    attack: "J — удар",
    interact: "E — действие",
    map: "M — карта",
    dash: "Прыжок → Shift",
    wall: "К стене + Пробел",
    drop: "↓ + Пробел — нижний путь",
  },
  touch: {
    move: "← / → — идти",
    jump: "↑ — прыжок",
    attack: "⚔ — удар",
    interact: "E — действие",
    map: "Карта — вверху",
    dash: "В прыжке → ➝",
    wall: "К стене + ↑",
    drop: "↓ + ↑ — нижний путь",
  },
  gamepad: {
    move: "Стик — идти",
    jump: "A — прыжок",
    attack: "X — удар",
    interact: "Y — действие",
    map: "View — карта",
    dash: "В прыжке → B",
    wall: "К стене + A",
    drop: "Вниз + A — нижний путь",
  },
};
export function signText(action, device = "keyboard") {
  return (labels[device] || labels.keyboard)[action] || "";
}
