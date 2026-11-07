const VERSION = 1;
export const SAVE_KEY = "last-harbour.save.v1";
const BACKUP_KEY = SAVE_KEY + ".backup";
export const defaultSettings = () => ({
  sound: true,
  volume: 0.4,
  shake: true,
  reducedFlash: false,
  assist: false,
  largeText: false,
  particleQuality: "high",
  mix: { music: 0.65, ambience: 0.85, actions: 1, interface: 0.65 },
});
export const newProgress = () => ({
  version: VERSION,
  flags: [],
  visited: ["P01"],
  rests: [],
  hints: [],
  seenExits: [],
  markers: [],
  scenes: {},
  stats: {
    roomTime: {},
    falls: 0,
    deaths: [],
    blockedExits: {},
    shortcuts: {},
    bossAttempts: 0,
    lateSecretReturns: 0,
    events: [],
  },
  retryCheckpoint: null,
  lastRest: { roomId: "P01", spawnPointId: "start" },
  settings: defaultSettings(),
  playTime: 0,
  deaths: 0,
});
function checksum(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
export function encodeSave(data) {
  const payload = JSON.stringify(data);
  return JSON.stringify({
    version: VERSION,
    payload,
    checksum: checksum(payload),
  });
}
export function decodeSave(text) {
  if (!text) return null;
  try {
    const envelope = JSON.parse(text);
    if (
      envelope.version !== VERSION ||
      checksum(envelope.payload) !== envelope.checksum
    )
      return null;
    const p = JSON.parse(envelope.payload);
    if (
      p.version !== VERSION ||
      !["flags", "visited", "rests", "hints"].every(
        (k) => Array.isArray(p[k]) && p[k].every((v) => typeof v === "string"),
      ) ||
      typeof p.lastRest?.roomId !== "string" ||
      typeof p.lastRest?.spawnPointId !== "string"
    )
      return null;
    p.flags = [...new Set(p.flags)];
    p.visited = [...new Set(p.visited)];
    p.seenExits = Array.isArray(p.seenExits)
      ? p.seenExits.filter((x) => typeof x === "string")
      : [];
    p.markers = Array.isArray(p.markers)
      ? p.markers.filter(
          (m) =>
            typeof m?.roomId === "string" &&
            ["return", "secret", "danger", "unknown"].includes(m.type),
        )
      : [];
    const defaults = newProgress().stats;
    p.stats = {
      ...defaults,
      ...(p.stats && typeof p.stats === "object" ? p.stats : {}),
    };
    for (const key of ["roomTime", "blockedExits", "shortcuts"])
      if (
        !p.stats[key] ||
        typeof p.stats[key] !== "object" ||
        Array.isArray(p.stats[key])
      )
        p.stats[key] = {};
    for (const key of ["deaths", "events"])
      if (!Array.isArray(p.stats[key])) p.stats[key] = [];
    if (
      !p.retryCheckpoint ||
      typeof p.retryCheckpoint.roomId !== "string" ||
      typeof p.retryCheckpoint.spawnPointId !== "string"
    )
      p.retryCheckpoint = null;
    if (!p.scenes || typeof p.scenes !== "object" || Array.isArray(p.scenes)) {
      p.scenes = {};
      if (p.playTime > 0) p.scenes["scene.boat_departed"] = true;
      if (p.rests.includes("rest.pier")) p.scenes["scene.warm_house"] = true;
    }
    p.settings = { ...defaultSettings(), ...p.settings };
    p.settings.mix = { ...defaultSettings().mix, ...p.settings.mix };
    for (const key of Object.keys(defaultSettings().mix))
      p.settings.mix[key] = Number.isFinite(p.settings.mix[key])
        ? Math.max(0, Math.min(1, p.settings.mix[key]))
        : defaultSettings().mix[key];
    p.settings.particleQuality =
      p.settings.particleQuality === "low" ? "low" : "high";
    p.playTime = Number.isFinite(p.playTime) ? Math.max(0, p.playTime) : 0;
    p.deaths = Number.isFinite(p.deaths) ? Math.max(0, p.deaths) : 0;
    p.settings.volume = Number.isFinite(p.settings.volume)
      ? Math.max(0, Math.min(1, p.settings.volume))
      : 0.4;
    return p;
  } catch {
    return null;
  }
}
export class SaveStore {
  constructor(storage, onStatus = () => {}) {
    this.storage = storage;
    this.onStatus = onStatus;
    this.hasSave = false;
  }
  load() {
    try {
      const raw = this.storage.getItem(SAVE_KEY),
        backup = this.storage.getItem(BACKUP_KEY);
      const primary = decodeSave(raw),
        recovery = decodeSave(backup);
      this.hasSave = Boolean(primary || recovery);
      if (!primary && recovery)
        this.onStatus(
          "Основное сохранение повреждено. Восстановлена резервная копия.",
          true,
        );
      else if (raw && !primary)
        this.onStatus(
          "Сохранение не читается. Начато новое путешествие.",
          true,
        );
      return primary || recovery || newProgress();
    } catch {
      this.onStatus(
        "Хранилище недоступно. Прогресс сохранится только до закрытия страницы.",
        true,
      );
      return newProgress();
    }
  }
  write(progress) {
    try {
      const current = this.storage.getItem(SAVE_KEY);
      const encoded = encodeSave(progress);
      // Each localStorage setItem is atomic. Keep the last valid record before replacing it.
      this.storage.setItem(BACKUP_KEY, decodeSave(current) ? current : encoded);
      this.storage.setItem(SAVE_KEY, encoded);
      this.hasSave = true;
      this.onStatus("Сохранено");
      return true;
    } catch {
      this.onStatus(
        "Не удалось сохранить прогресс. Проверьте доступ к хранилищу браузера.",
        true,
      );
      return false;
    }
  }
}
export function setFlag(progress, flag) {
  if (progress.flags.includes(flag)) return false;
  progress.flags.push(flag);
  return true;
}
export const maxHealth = (progress) =>
  5 + Number(progress.flags.includes("pickup.p03_upper"));
export const fragmentCount = (progress) =>
  ["pickup.p03_lower", "pickup.p06_dash", "pickup.clockmaker"].filter((f) =>
    progress.flags.includes(f),
  ).length;
