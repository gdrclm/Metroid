import { Game } from "./game.js";
import { Input } from "./input.js";
import { SaveStore, maxHealth, fragmentCount } from "./save.js";
import { Renderer } from "./render.js";
import { Audio } from "./audio.js";
import { WorldMap } from "./map.js";
import { validateWorld, objectiveFor, conditionMet } from "./core.js";
import { GuideUI } from "./guide/ui.js";
import { HeroDirector } from "./hero/director.js";
import { JournalUI } from "./guide/journal.js";

const $ = (id) => document.getElementById(id);
async function boot() {
  const fetchJSON = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Не удалось загрузить ${url} (${r.status})`);
    return r.json();
  };
  const [world, config] = await Promise.all([
    fetchJSON(new URL("../data/world.json", import.meta.url)),
    fetchJSON(new URL("../data/physics.json", import.meta.url)),
  ]);
  const errors = validateWorld(world, config);
  if (errors.length) throw new Error(errors.join("\n"));
  $("world-count").textContent =
    `АКТ I · ${world.rooms.length} / ${world.actOne?.targetRooms || world.rooms.length} КОМНАТ`;
  // Rest spawns are stable data derived from the immutable rest entity IDs.
  for (const room of world.rooms)
    for (const e of room.entities)
      if (e.type === "rest")
        room.spawnPoints["rest." + e.id] = {
          x: e.x - 12,
          y: e.y - config.height,
          safeRadius: 28,
        };
  let saveTimer,
    toastTimer,
    captionTimer,
    settingsParent = "title",
    mapParent = "playing",
    pauseParent = "playing",
    newGuide = false;
  const classicStore = new SaveStore(
    {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
    },
    (text, error) => {
      clearTimeout(saveTimer);
      $("save-status").textContent = text;
      $("save-status").style.color = error ? "#d2a88a" : "#b8b494";
      if (!error)
        saveTimer = setTimeout(() => ($("save-status").textContent = ""), 1800);
    },
  );
  const guideStore = new SaveStore(
    classicStore.storage,
    classicStore.onStatus,
    "last-harbour.guide.v1",
  );
  guideStore.load();
  let store = classicStore;
  const input = new Input();
  const touchScreen = matchMedia("(pointer: coarse)");
  input.device = touchScreen.matches ? "touch" : "keyboard";
  let audio, map, guideUI, journal;
  const game = new Game(world, config, store, {
    toast: (text) => toast(text),
    sound: (name, options) => audio?.play(name, options),
    room: (room) => roomCaption(room),
    progress: () => {
      map?.draw();
      syncHUD();
    },
    dialogue: (speaker, text) => {
      $("speaker").textContent = speaker;
      $("dialogue-text").textContent = text;
      setMode("dialogue");
    },
    complete: () => {
      const guide = game.guide.enabled,
        ending = game.guide.state.story?.ending;
      $("completion-eyebrow").textContent = guide
        ? "АКТ I · ПЕРВЫЙ СВЕТ"
        : "ПЕРВЫЙ СВЕТ";
      $("completion-title").textContent = guide
        ? "Мы дошли.\nВместе."
        : "Город больше,\nчем казалось.";
      $("completion-text").textContent = guide
        ? "Он стоит у края башни и слушает три далёких горизонта. «Я всё ещё слышу тебя. Пойдём вместе, когда я отдышусь». Открытые пути ждут возвращения; наш путь записан в журнале."
        : "За крышами — Насосные, Висячие сады и Колокольный район. Путешествие только начинается.";
      $("completion-stats").textContent =
        `Исследовано: ${game.progress.visited.length} / ${game.world.rooms.length} · Осколки: ${fragmentCount(game.progress)} / 3 · Секрет сердца: ${game.flags.includes("pickup.p03_upper") ? "найден" : "ещё ждёт"}` +
        (guide && ending
          ? ` · До первого света: ${Math.floor(ending.time / 60)}:${String(Math.floor(ending.time % 60)).padStart(2, "0")} · Приказов: ${ending.commands} · Смертей: ${ending.deaths}`
          : "");
      setMode("complete");
    },
    mode: (mode) => setMode(mode),
    story: (entry) => toast("Запись в журнале: " + entry.title),
  });
  audio = new Audio(game.progress.settings);
  const renderer = new Renderer($("game"));
  function resizeViewport() {
    const box = $("game").getBoundingClientRect();
    const h = touchScreen.matches
      ? innerWidth > innerHeight
        ? 540
        : Math.min(
            720,
            Math.max(
              440,
              Math.round((600 * box.height) / Math.max(1, box.width)),
            ),
          )
      : 720;
    const w = touchScreen.matches
      ? Math.round(
          Math.max(
            520,
            Math.min(1280, (h * box.width) / Math.max(1, box.height)),
          ),
        )
      : 1280;
    if ($("game").width !== w || $("game").height !== h) {
      $("game").width = w;
      $("game").height = h;
      game.setViewport(w, h);
    }
  }
  new ResizeObserver(resizeViewport).observe($("game"));
  window.addEventListener("resize", () => {
    input.clear();
    resizeViewport();
  });
  touchScreen.addEventListener("change", () => {
    input.clear();
    setMode(game.mode);
  });
  map = new WorldMap($("world-map"), game);
  guideUI = new GuideUI(game, $("game"), setMode, toast);
  journal = new JournalUI(game, setMode);
  function toast(text) {
    $("toast").textContent = text;
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("toast").hidden = true), 4500);
  }
  function roomCaption(room) {
    audio?.setRegion(room.regionId);
    $("caption-index").textContent =
      world.regions[room.regionId].name.toUpperCase() +
      (game.debug.enabled ? " / " + room.roomId : "");
    $("caption-name").textContent = room.name;
    const el = $("room-caption");
    el.hidden = true;
    void el.offsetWidth;
    el.hidden = false;
    clearTimeout(captionTimer);
    captionTimer = setTimeout(() => (el.hidden = true), 4500);
    syncHUD();
  }
  const screens = {
    title: "title-screen",
    pause: "pause-screen",
    map: "map-screen",
    settings: "settings-screen",
    dialogue: "dialogue-screen",
    death: "death-screen",
    complete: "complete-screen",
    confirm: "confirm-screen",
    safehouse: "safehouse-screen",
    journal: "journal-screen",
  };
  function setMode(mode) {
    if (mode === "pause" && ["playing", "tactical"].includes(game.mode))
      pauseParent = game.mode;
    game.mode = mode;
    input.guideMode =
      game.guide.enabled && ["playing", "tactical"].includes(mode);
    input.guideJournal =
      game.guide.enabled &&
      [
        "playing",
        "tactical",
        "pause",
        "safehouse",
        "complete",
        "journal",
      ].includes(mode);
    $("app").dataset.mode = mode;
    input.clear();
    if (mode === "dialogue") {
      game.player.vx = 0;
      game.player.vy = 0;
    }
    for (const [m, id] of Object.entries(screens)) $(id).hidden = m !== mode;
    for (const id of ["hud", "controls", "abilities", "objective"])
      $(id).hidden =
        mode === "title" ||
        mode === "confirm" ||
        (game.guide.enabled && id === "controls");
    $("touch-controls").hidden =
      game.guide.enabled || mode !== "playing" || !touchScreen.matches;
    resizeViewport();
    $("interaction").hidden = mode !== "playing" || !game.nearby;
    if (mode !== "playing") $("room-caption").hidden = true;
    if (mode === "title") {
      $("play").innerHTML =
        (classicStore.hasSave
          ? "Классическое прохождение"
          : "Прямое управление") + " <span>⟶</span>";
      $("new-game").hidden = !classicStore.hasSave;
      $("guide-play").innerHTML =
        (guideStore.hasSave ? "Продолжить Проводником" : "Стать Проводником") +
        " <span>⟶</span>";
      $("guide-new").hidden = !guideStore.hasSave;
    }
    if (mode === "map") {
      map.open();
    }
    guideUI?.sync();
    journal?.sync();
    resizeViewport();
    if (mode === "playing" || mode === "tactical")
      $("game").focus({ preventScroll: true });
    else if (screens[mode])
      $(screens[mode]).querySelector("button")?.focus({ preventScroll: true });
    audio?.update(mode !== "playing" && mode !== "title");
    syncHUD();
  }
  let lastHealth = "",
    lastObjective = "";
  function syncHUD() {
    if (!game) return;
    $("region").textContent =
      world.regions[game.room.regionId].name.toUpperCase();
    $("room-name").textContent = game.room.name;
    const hp = game.health ?? maxHealth(game.progress),
      max = maxHealth(game.progress),
      key = hp + "/" + max;
    if (key !== lastHealth) {
      lastHealth = key;
      $("health").replaceChildren(
        ...Array.from({ length: max }, (_, i) => {
          const span = document.createElement("span");
          span.className = "health-pip" + (i >= Math.ceil(hp) ? " empty" : "");
          return span;
        }),
      );
      $("health").setAttribute(
        "aria-label",
        `Здоровье: ${Math.ceil(hp)} из ${max}`,
      );
    }
    $("fragments").textContent =
      "◇ " + String(fragmentCount(game.progress)).padStart(2, "0");
    const objective = objectiveFor(game.flags);
    if (lastObjective !== objective) {
      lastObjective = objective;
      $("objective-text").textContent = objective;
    }
    $("dash-control").classList.toggle("unavailable", !game.abilities.dash);
    $("dash-icon").classList.toggle("active", game.abilities.dash);
    $("dash-icon").classList.toggle("spent", !game.player.dashReady);
    $("grip-icon").classList.toggle("active", game.abilities.wall_grip);
    const nearby = game.nearby,
      el = $("interaction");
    el.hidden = game.mode !== "playing" || !nearby || Boolean(game.transition);
    if (nearby) {
      const label = nearby.exitId
        ? conditionMet(nearby.condition, game.flags)
          ? (nearby.type === "lift" ? "Вызвать подъёмник · " : "") +
            nearby.label
          : nearby.lockedReason
        : nearby.title;
      el.querySelector("span").textContent = label;
      el.querySelector("kbd").textContent =
        nearby.type === "stairs"
          ? nearby.direction === "up"
            ? "↑"
            : "↓"
          : input.device === "gamepad"
            ? "Y"
            : "E";
      el.onclick = () => {
        if (game.guide.enabled) guideUI.issue("interact");
        else game.interact();
      };
    }
    map?.mini($("mini-map"));
    if (game.mode === "map") map.draw();
    $("app").classList.toggle("large-text", game.progress.settings.largeText);
    $("app").classList.toggle("touch-layout", touchScreen.matches);
    for (const action of ["dash", "interact"]) {
      const button = document.querySelector(`[data-action="${action}"]`);
      button.disabled = action === "dash" ? !game.abilities.dash : !game.nearby;
      button.classList.toggle(
        "spent",
        action === "dash" && !game.player.dashReady,
      );
    }
    guideUI?.sync();
    journal?.sync();
  }
  function start(fresh = false, guideMode = false) {
    game.guide.commands.clear();
    game.guide.tools.leave();
    if (store.hasSave) game.save();
    store = guideMode ? guideStore : classicStore;
    game.store = store;
    game.progress = store.load();
    game.guide = new HeroDirector(game);
    game.atmosphere.active.clear();
    guideUI.oracle.reset();
    guideUI.queueKey = "";
    audio.settings = game.progress.settings;
    audio.unlock();
    if (fresh) audio.resetJourney();
    game.start(fresh, guideMode);
    if (guideMode) {
      setMode("tactical");
      toast(
        "Клик — путь или цель. Space — исполнить план. Tab — журнал и помощь герою.",
      );
    }
    audio.settings = game.progress.settings;
    audio.update();
    syncSettings();
    roomCaption(game.room);
  }
  $("play").onclick = () => start(false);
  $("guide-play").onclick = () => start(false, true);
  $("guide-new").onclick = () => {
    newGuide = true;
    setMode("confirm");
  };
  $("new-game").onclick = () => {
    newGuide = false;
    setMode("confirm");
  };
  $("confirm-new").onclick = () => start(true, newGuide);
  $("cancel-new").onclick = () => setMode("title");
  $("resume").onclick = () => setMode(pauseParent);
  $("pause-button").onclick = () => setMode("pause");
  $("to-title").onclick = () => {
    game.guide.commands.clear();
    game.guide.tools.leave();
    game.save();
    game.atmosphere.active.clear();
    if (!game.guide.enabled) game.loadRoom("P01", "start", false);
    setMode("title");
  };
  function openMap() {
    mapParent = ["pause", "tactical"].includes(game.mode)
      ? game.mode
      : "playing";
    setMode("map");
  }
  $("map-button").onclick = openMap;
  $("open-map").onclick = openMap;
  $("close-map").onclick = () => setMode(mapParent);
  $("zoom-in").onclick = () => map.scale(0.2);
  $("zoom-out").onclick = () => map.scale(-0.2);
  $("map-center").onclick = () => map.center();
  $("map-marker-type").onchange = () =>
    (map.pinType = $("map-marker-type").value);
  $("return-rest").onclick = () => {
    game.respawn(true);
    toast("Возвращение к месту отдыха");
  };
  $("respawn").onclick = () => game.respawn();
  $("dialogue-close").onclick = () => setMode("playing");
  $("keep-exploring").onclick = () => setMode("playing");
  const settingFields = {
    "sound-setting": "sound",
    "volume-setting": "volume",
    "shake-setting": "shake",
    "flash-setting": "reducedFlash",
    "assist-setting": "assist",
    "text-setting": "largeText",
  };
  function syncSettings() {
    for (const [id, key] of Object.entries(settingFields)) {
      if (key === "volume") $(id).value = game.progress.settings[key] * 100;
      else $(id).checked = game.progress.settings[key];
    }
    for (const key of ["music", "ambience", "actions", "interface"])
      $("mix-" + key).value = game.progress.settings.mix[key] * 100;
    $("particle-quality").value = game.progress.settings.particleQuality;
  }
  for (const key of ["music", "ambience", "actions", "interface"])
    $("mix-" + key).oninput = () => {
      game.progress.settings.mix[key] = Number($("mix-" + key).value) / 100;
      audio.settings = game.progress.settings;
      audio.unlock();
      audio.update();
      game.save();
    };
  $("particle-quality").onchange = () => {
    game.progress.settings.particleQuality = $("particle-quality").value;
    game.save();
  };
  document.addEventListener("click", (e) => {
    if (e.target.closest("button")) audio.play("ui", { channel: "interface" });
  });
  function settings() {
    settingsParent = game.mode;
    syncSettings();
    setMode("settings");
  }
  $("title-settings").onclick = settings;
  $("open-settings").onclick = settings;
  $("close-settings").onclick = () => setMode(settingsParent);
  for (const [id, key] of Object.entries(settingFields))
    $(id).addEventListener("input", () => {
      game.progress.settings[key] =
        key === "volume" ? Number($(id).value) / 100 : $(id).checked;
      audio.settings = game.progress.settings;
      audio.unlock();
      audio.update(game.mode !== "playing");
      game.save();
      syncHUD();
    });
  input.onBlur = () => {
    if (["playing", "tactical"].includes(game.mode)) setMode("pause");
  };
  window.addEventListener("pagehide", () => {
    if (store.hasSave) game.save();
  });
  const debugAllowed =
    document.querySelector('meta[name="build-mode"]').content ===
      "development" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) &&
    new URLSearchParams(location.search).get("debug") === "1";
  if (debugAllowed) {
    game.debug.enabled = true;
    const editorButton = document.createElement("button");
    editorButton.textContent = "Редактор комнаты";
    editorButton.id = "debug-editor";
    editorButton.onclick = async () => {
      if (!game.editor) {
        const { RoomEditor } = await import("./editor.js");
        game.editor = new RoomEditor(game, setMode);
      }
      game.editor.toggle();
    };
    $("debug").append(editorButton);
    const reportButton = document.createElement("button");
    reportButton.textContent = "Экспорт плейтеста";
    reportButton.onclick = () => {
      const a = document.createElement("a"),
        url = URL.createObjectURL(
          new Blob(
            [
              JSON.stringify(
                { version: 2, stats: game.progress.stats, flags: game.flags },
                null,
                2,
              ),
            ],
            { type: "application/json" },
          ),
        );
      a.href = url;
      a.download = "playtest.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    $("debug").append(reportButton);
    for (const room of game.rooms.values()) {
      const option = document.createElement("option");
      option.value = room.roomId;
      option.textContent = room.roomId + " · " + room.name;
      $("debug-room").append(option);
    }
    $("debug-warp").onclick = () => {
      game.loadRoom($("debug-room").value);
      setMode("playing");
    };
    $("debug-reset").onclick = () => game.loadRoom(game.room.roomId);
    for (const [id, key] of [
      ["debug-god", "god"],
      ["debug-fly", "fly"],
      ["debug-collision", "collisions"],
    ])
      $(id).onchange = () => (game.debug[key] = $(id).checked);
    for (const [id, flag] of [
      ["debug-dash", "ability.dash"],
      ["debug-grip", "ability.wall_grip"],
    ])
      $(id).onchange = () => {
        game.progress.flags = game.flags.filter((f) => f !== flag);
        if ($(id).checked) game.progress.flags.push(flag);
        game.save();
      };
    // The test harness uses the same public simulation and interactions as the UI.
    window.__game = game;
    window.__setMode = setMode;
    window.__audio = audio;
    window.__guideUI = guideUI;
    const atmospherePanel = document.createElement("div");
    atmospherePanel.innerHTML = `<h3>Атмосфера</h3><label><input type="checkbox" data-atmosphere="audioSources"> Источники и радиусы звука</label><label><input type="checkbox" data-atmosphere="emitters"> Области частиц</label><label>Состояние <select id="atmosphere-preview"><option value="live">Игра</option><option value="before">До события</option><option value="after">После события</option></select></label><p id="atmosphere-card"></p>`;
    $("debug").append(atmospherePanel);
    atmospherePanel
      .querySelectorAll("[data-atmosphere]")
      .forEach(
        (input) =>
          (input.onchange = () =>
            (game.debug[input.dataset.atmosphere] = input.checked)),
      );
    $("atmosphere-preview").onchange = () => {
      game.debug.atmospherePreview = $("atmosphere-preview").value;
      setMode(
        game.debug.atmospherePreview === "live" ? "playing" : "atmosphere",
      );
    };
  }
  function handleMenus() {
    if (input.pressed("debug") && debugAllowed)
      $("debug").hidden = !$("debug").hidden;
    if (input.pressed("pause")) {
      if (["playing", "tactical"].includes(game.mode)) setMode("pause");
      else if (game.mode === "pause") setMode(pauseParent);
      else if (game.mode === "safehouse") setMode("tactical");
      else if (game.mode === "journal") journal.close();
      else if (game.mode === "map") setMode(mapParent);
      else if (game.mode === "settings") setMode(settingsParent);
      else if (game.mode === "dialogue") setMode("playing");
      else if (game.mode === "confirm") setMode("title");
    }
    if (input.pressed("journal") && game.guide.enabled) {
      journal.toggle();
      input.consume();
      return;
    }
    if (
      input.pressed("map") &&
      ["playing", "tactical", "pause", "map"].includes(game.mode)
    ) {
      if (game.mode === "map") setMode(mapParent);
      else openMap();
    }
    if (game.mode === "playing" || game.mode === "tactical") return;
    if (
      game.mode === "dialogue" &&
      (input.pressed("interact") ||
        input.pressed("confirm") ||
        input.pressed("jump"))
    ) {
      setMode("playing");
      return;
    }
    const screen = $(screens[game.mode]);
    if (!screen) return;
    const buttons = [...screen.querySelectorAll("button,input,select")].filter(
      (b) => !b.hidden && !b.disabled && b.offsetParent !== null,
    );
    const current = Math.max(0, buttons.indexOf(document.activeElement));
    if (input.pressed("down") || input.pressed("right"))
      buttons[(current + 1) % buttons.length]?.focus();
    if (input.pressed("up") || input.pressed("left"))
      buttons[(current - 1 + buttons.length) % buttons.length]?.focus();
    if (input.pressed("confirm") || input.pressed("jump"))
      buttons.includes(document.activeElement)
        ? document.activeElement.click()
        : buttons[0]?.click();
  }
  let previous = performance.now(),
    accumulator = 0,
    uiElapsed = 0,
    autoSaveElapsed = 0;
  function frame(now) {
    const elapsed = (now - previous) / 1000,
      dt = Math.min(0.1, elapsed);
    previous = now;
    input.poll();
    handleMenus();
    guideUI.handleInput(input);
    if (game.mode === "playing") {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= config.fixedStep && steps < 12) {
        game.update(config.fixedStep, input);
        input.consume();
        accumulator -= config.fixedStep;
        steps++;
        if (game.mode !== "playing") {
          accumulator = 0;
          break;
        }
      }
      autoSaveElapsed += dt;
      if (autoSaveElapsed > 30) {
        autoSaveElapsed = 0;
        game.save();
      }
    } else {
      accumulator = 0;
      input.consume();
      if (game.mode === "title") game.time += dt;
    }
    game.controlDevice = input.device;
    audio.updateScene(game, dt);
    game.audioDebugSources = audio.debugSources;
    renderer.draw(game, elapsed);
    uiElapsed += dt;
    if (uiElapsed > 0.08) {
      uiElapsed = 0;
      syncHUD();
      if (debugAllowed && !$("debug").hidden) {
        $("debug-state").textContent = JSON.stringify(
          {
            room: game.room.roomId,
            state: game.player.state,
            heroBrain: game.guide.enabled ? game.guide.brain.describe() : null,
            x: Math.round(game.player.x),
            y: Math.round(game.player.y),
            velocity: [Math.round(game.player.vx), Math.round(game.player.vy)],
            contact: game.player.contact,
            flags: game.flags,
            stats: game.progress.stats,
            audio: audio.summary(),
            wind: game.atmosphere.wind,
            scenes: game.progress.scenes,
            objects:
              game.enemies.length +
              game.projectiles.length +
              game.particles.length,
            fps: Math.round(renderer.fps),
            worstMs: Math.round(renderer.worst),
            closed: game.room.exits
              .filter((e) => !conditionMet(e.condition, game.flags))
              .map((e) => e.lockedReason),
          },
          null,
          2,
        );
        $("debug-dash").checked = game.abilities.dash;
        $("debug-grip").checked = game.abilities.wall_grip;
        $("atmosphere-card").textContent = Object.entries(
          game.room.narrative || {},
        )
          .map(([key, value]) => key + ": " + value)
          .join(" · ");
      }
    }
    requestAnimationFrame(frame);
  }
  syncSettings();
  setMode("title");
  $("loading").hidden = true;
  requestAnimationFrame(frame);
}
boot().catch((error) => {
  console.error(error);
  const el = $("loading");
  el.replaceChildren();
  el.classList.add("error-message");
  const text = document.createElement("div");
  text.textContent = "Не удалось зажечь огни. " + error.message;
  el.append(text);
  const button = document.createElement("button");
  button.textContent = "Попробовать снова";
  button.onclick = () => location.reload();
  text.append(button);
});
