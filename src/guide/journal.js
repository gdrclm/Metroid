import { GUIDE_HELP, PLACE_VOICES } from "../story.js";
import { objectiveFor } from "../core.js";

const timeLabel = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
export class JournalUI {
  constructor(game, setMode) {
    this.game = game;
    this.setMode = setMode;
    this.parent = "tactical";
    this.section = "path";
    this.selection = {};
    const screen = document.createElement("section");
    screen.id = "journal-screen";
    screen.className = "screen journal-screen";
    screen.hidden = true;
    screen.innerHTML = `<header class="journal-header"><div><span class="eyebrow">АКТ I · ТОНКАЯ НИТЬ</span><h2>Записки на полях</h2></div><button id="journal-close" class="close-button">Вернуться <kbd>Tab / Esc</kbd></button></header><div class="journal-goal"><span class="eyebrow">СЛЕДУЮЩИЙ ШАГ</span><p id="journal-objective"></p></div><nav class="journal-tabs" aria-label="Разделы журнала"><button data-journal-tab="path">Наш путь</button><button data-journal-tab="places">Места</button><button data-journal-tab="help">Помощь герою</button></nav><div class="journal-layout"><nav id="journal-pages" aria-label="Страницы журнала"></nav><article id="journal-page" tabindex="0" aria-labelledby="journal-title"><span id="journal-chapter" class="eyebrow"></span><h3 id="journal-title"></h3><div id="journal-text"></div><p id="journal-note"></p></article></div><footer class="journal-footer"><span id="journal-count"></span><span>Во время чтения мир остановлен</span></footer>`;
    document.getElementById("app").append(screen);
    this.screen = screen;
    document.getElementById("journal-close").onclick = () => this.close();
    screen.querySelectorAll("[data-journal-tab]").forEach(
      (b) =>
        (b.onclick = () => {
          this.section = b.dataset.journalTab;
          this.render();
        }),
    );
    // These entry points stay outside the changing page list, preserving focus.
    for (const [parent, id, label] of [
      [document.querySelector(".guide-tools"), "guide-journal", "Журнал · Tab"],
      [
        document.querySelector(".safehouse-panel"),
        "safehouse-journal",
        "Открыть журнал",
      ],
      [
        document.querySelector("#pause-screen .panel"),
        "pause-journal",
        "Записки на полях",
      ],
      [
        document.querySelector("#complete-screen .panel"),
        "completion-journal",
        "Прочитать наш путь",
      ],
    ]) {
      const button = document.createElement("button");
      button.id = id;
      button.textContent = label;
      button.className = "text-button journal-entry";
      button.onclick = () => this.open();
      parent.append(button);
    }
  }
  open() {
    const g = this.game;
    if (
      !g.guide.enabled ||
      !["playing", "tactical", "pause", "safehouse", "complete"].includes(
        g.mode,
      )
    )
      return;
    this.parent = g.mode;
    this.section = "path";
    const unread = g.guide.story.entries.filter(
      (e) => !g.guide.story.state.read.includes(e.id),
    );
    if (unread.length) this.selection.path = unread.at(-1).id;
    this.render();
    this.setMode("journal");
  }
  close() {
    if (this.game.mode === "journal") this.setMode(this.parent);
  }
  toggle() {
    if (this.game.mode === "journal") this.close();
    else this.open();
  }
  sync() {
    const d = this.game.guide;
    for (const id of ["pause-journal", "completion-journal"])
      document.getElementById(id).hidden = !d.enabled;
    const count = d.enabled ? d.story.unread : 0;
    document.getElementById("guide-journal").textContent =
      `Журнал${count ? " · " + count : ""} · Tab`;
  }
  pages() {
    const g = this.game,
      s = g.guide.story.state;
    if (this.section === "path")
      return g.guide.story.entries.map((e) => ({
        ...e,
        read: s.read.includes(e.id),
        note: `${e.chapter} · ${timeLabel(e.at)}`,
      }));
    if (this.section === "help")
      return GUIDE_HELP.map((e) => ({
        ...e,
        chapter: "Рядом с героем",
        read: s.helpRead.includes(e.id),
        note: "Можно вернуться к этой странице в любой момент",
      }));
    return g.world.rooms
      .filter((r) => g.progress.visited.includes(r.roomId))
      .map((r) => ({
        id: r.roomId,
        title: r.name,
        chapter: g.world.regions[r.regionId].name,
        read: s.placesRead.includes(r.roomId),
        text: [
          PLACE_VOICES[r.roomId] || r.journalEntry || r.note,
          r.narrative?.present,
          r.narrative?.mainClue,
        ],
        note: "Увидено своими глазами",
      }));
  }
  render() {
    const g = this.game,
      pages = this.pages();
    const selected =
      pages.find((e) => e.id === this.selection[this.section]) || pages[0];
    this.selection[this.section] = selected?.id;
    document.getElementById("journal-objective").textContent = objectiveFor(
      g.flags,
    );
    this.screen
      .querySelectorAll("[data-journal-tab]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(b.dataset.journalTab === this.section),
        ),
      );
    const list = document.getElementById("journal-pages");
    const sameSection = this.renderedSection === this.section;
    const scroll = {
      x: sameSection ? list.scrollLeft : 0,
      y: sameSection ? list.scrollTop : 0,
    };
    this.renderedSection = this.section;
    list.replaceChildren();
    for (const page of pages) {
      const button = document.createElement("button");
      button.dataset.pageId = page.id;
      button.setAttribute("aria-current", String(page.id === selected?.id));
      const name = document.createElement("span"),
        meta = document.createElement("small");
      name.textContent = page.title;
      meta.textContent = page.read ? "Прочитано" : "Новая запись";
      button.append(name, meta);
      button.onclick = () => {
        this.selection[this.section] = page.id;
        this.render();
        document
          .querySelector(`[data-page-id="${page.id}"]`)
          ?.focus({ preventScroll: true });
      };
      list.append(button);
    }
    list.scrollLeft = scroll.x;
    list.scrollTop = scroll.y;
    list
      .querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    document.getElementById("journal-title").textContent =
      selected?.title || "Пока только тишина";
    document.getElementById("journal-chapter").textContent =
      selected?.chapter || "АКТ I";
    document.getElementById("journal-note").textContent =
      selected?.note || "Новые записи появятся во время путешествия";
    const body = document.getElementById("journal-text");
    body.replaceChildren();
    for (const text of selected?.text || []) {
      if (!text) continue;
      const p = document.createElement("p");
      p.textContent = text;
      body.append(p);
    }
    document.getElementById("journal-count").textContent =
      this.section === "places"
        ? `Увидено мест: ${pages.length} / ${g.world.rooms.length}`
        : `Страниц: ${pages.length}`;
    document.getElementById("journal-page").scrollTop = 0;
    if (selected) {
      g.guide.story.markRead(this.section, selected.id);
      const current = list.querySelector('[aria-current="true"] small');
      if (current) current.textContent = "Прочитано";
    }
    this.sync();
  }
}
