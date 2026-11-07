export const newStats = () => ({
  roomTime: {},
  falls: 0,
  deaths: [],
  blockedExits: {},
  shortcuts: {},
  bossAttempts: 0,
  lateSecretReturns: 0,
  events: [],
});
export function record(game, type, detail = {}) {
  const stats = game.progress.stats || (game.progress.stats = newStats());
  stats.events.push({
    type,
    room: game.room?.roomId,
    time: +game.progress.playTime.toFixed(2),
    ...detail,
  });
  if (stats.events.length > 160) stats.events.shift();
  if (type === "fall") stats.falls++;
  if (type === "death")
    stats.deaths.push({
      room: game.room.roomId,
      cause: detail.cause || "damage",
    });
  if (type === "blocked_exit")
    stats.blockedExits[detail.exit] =
      (stats.blockedExits[detail.exit] || 0) + 1;
  if (type === "shortcut")
    stats.shortcuts[detail.exit] = (stats.shortcuts[detail.exit] || 0) + 1;
  if (type === "boss_attempt") stats.bossAttempts++;
  if (type === "late_secret") stats.lateSecretReturns++;
}
