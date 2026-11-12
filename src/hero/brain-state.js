import { clamp } from "../core.js";

export const newAutonomyState = () => ({
  walkSuccesses: 0,
  jumpSuccesses: 0,
  independentMoves: 0,
  hazards: [],
});
export function normalizeAutonomyState(raw) {
  const state = newAutonomyState();
  for (const key of ["walkSuccesses", "jumpSuccesses", "independentMoves"])
    if (Number.isFinite(raw?.[key]))
      state[key] = Math.floor(clamp(raw[key], 0, 1000));
  state.hazards = (Array.isArray(raw?.hazards) ? raw.hazards : [])
    .filter(
      (h) =>
        h &&
        typeof h.roomId === "string" &&
        ["wall", "edge", "hazard", "unknown"].includes(h.kind) &&
        Number.isFinite(h.x) &&
        Number.isFinite(h.y),
    )
    .slice(-24)
    .map(({ roomId, kind, x, y }) => ({ roomId, kind, x, y }));
  return state;
}
