// Authoring source for P10–P18. Runtime consumes the resulting world.json only.
// Existing room geometry and exits are preserved; this command is idempotent.
import { readFile, writeFile } from "node:fs/promises";
import { validateWorld } from "../src/core.js";
const url = new URL("../data/world.json", import.meta.url);
const world = JSON.parse(await readFile(url, "utf8"));
const physics = JSON.parse(
  await readFile(new URL("../data/physics.json", import.meta.url), "utf8"),
);
const addedIds = Array.from({ length: 9 }, (_, i) => `P${i + 10}`);
const added = new Set(addedIds);
const baseRoomIds =
  world.actOne?.baseRoomIds ||
  world.rooms.filter((r) => !added.has(r.roomId)).map((r) => r.roomId);
world.rooms = world.rooms.filter((r) => !added.has(r.roomId));
for (const r of world.rooms) {
  r.exits = r.exits.filter((e) => !added.has(e.targetRoomId));
  for (const id of addedIds) delete r.spawnPoints["from." + id];
}
world.guideCaches = (world.guideCaches || []).filter(
  (c) => !added.has(c.roomId),
);
const surface = (id, x, y, w, h, kind = "solid", extra = {}) => ({
  id,
  x,
  y,
  w,
  h,
  kind,
  grippable: true,
  material: "wetWood",
  ...extra,
});
const npc = (id, x, y, title, text, repeatText) => ({
  id,
  type: "npc",
  x,
  y,
  title,
  text,
  repeatText,
});
const inspect = (id, x, y, title, text, extra = {}) => ({
  id,
  type: "inspect",
  x,
  y,
  title,
  text,
  ...extra,
});
const lever = (id, x, y, title, flag, text) => ({
  id,
  type: "lever",
  x,
  y,
  title,
  flag,
  text,
});
function room(
  id,
  name,
  w,
  h,
  map,
  ground,
  kind,
  purpose,
  journal,
  exposure = 0.4,
) {
  return {
    roomId: id,
    regionId: "pier",
    revision: 1,
    act: 1,
    contentBatch: "act1.pier.expansion",
    name,
    worldBounds: { x: 0, y: 0, w, h },
    mapShape: {
      x: map[0],
      y: map[1],
      w: +(w / 1280).toFixed(3),
      h: +(h / 720).toFixed(3),
    },
    collisionLayers: [surface(id + ".floor", 0, ground, w, h - ground)],
    cameraZones: [
      {
        x: 0,
        y: 0,
        w,
        h,
        profile:
          kind === "lighthouse" || kind === "balcony" ? "shaft" : "street",
      },
    ],
    exits: [],
    spawnPoints: {
      start: { x: 80, y: ground - 44, safeRadius: 28, facing: 1 },
    },
    entities: [],
    triggers: [],
    persistentFlags: [],
    resetRules: {
      enemies: "on_rest_or_death",
      unique: "persistent",
      projectiles: "on_exit",
    },
    audioProfile: "pier",
    streamingGroup: "pier",
    debugTags: ["act1-expansion", kind],
    decoration: {
      style: kind,
      seed: 310 + Number(id.slice(1)),
      groundY: ground,
      event: "hanging_light",
    },
    tutorialSigns: [],
    purpose,
    note: purpose,
    journalEntry: journal,
    expansionScene: { kind },
    narrative: {
      past: name,
      change: "Пристань перестроили, когда нижние пути ушли под воду",
      present: purpose,
      mainClue: "",
      secondaryClue: "",
      action: "",
      reward: "",
      soundLandmark: "",
      environmentEffect: "",
      afterVisit: "",
    },
    atmosphere: {
      exposure,
      reverb: exposure < 0.3 ? 0.07 : 0.035,
      sheltered: exposure < 0.3,
    },
    audioSources: [
      {
        id: id + ".sound.water",
        sound: "water",
        x: w * 0.3,
        y: ground - 8,
        radius: 620,
        gain: exposure < 0.3 ? 0.2 : 0.65,
        loop: true,
        filter: 380,
      },
      {
        id: id + ".sound.rope",
        sound: "rope",
        x: w * 0.7,
        y: ground - 130,
        radius: 440,
        gain: 0.35,
        interval: [8, 16],
      },
    ],
    emitters: [
      {
        id: id + ".fx.drips",
        effect: "drip",
        x: w * 0.6,
        y: ground - 220,
        direction: { x: 0, y: 1 },
        rate: 0.5,
        life: [0.6, 1.3],
        layer: "middle",
        mode: "continuous",
        spread: 0.12,
        speed: [2, 8],
        floor: ground,
      },
    ],
    storyEvents: [],
    storyProps: [
      { kind: "floodMarks", x: 90, y: ground - 65 },
      { kind: "patchedPlanks", x: w * 0.6, y: ground - 4 },
    ],
  };
}
function narrative(r, data) {
  Object.assign(r.narrative, data);
  return r;
}
const rooms = [
  narrative(
    room(
      "P10",
      "Таможенный навес",
      1100,
      720,
      [4, 12],
      620,
      "customs",
      "Отклониться от знакомой дороги и пройти под навесом к старому грузовому кольцу.",
      "За навесом лежат мокрые бланки. На каждом отмечен груз, который так и не забрали. Служащий узнаёт форму печати, но не название конторы. Здесь можно спросить дорогу у сторожа и решить, идти ли дальше в пакгауз.",
      0.18,
    ),
    {
      mainClue: "Стрелка «Грузовое кольцо» под перечёркнутым тарифом",
      secondaryClue: "Жетоны разгрузки сложены в пустую чашку",
      action: "Перелезть через стойку и поговорить со сторожем",
      reward: "Вход в новый круг Причала и сухой паёк",
      soundLandmark: "Вода за крышей и скрип печати",
      environmentEffect: "С крыши капает мимо сухой стойки",
      afterVisit: "Следы ног соединяют склад с пакгаузом",
    },
  ),
  narrative(
    room(
      "P11",
      "Пакгауз",
      1420,
      720,
      [6, 12],
      620,
      "packhouse",
      "Выбрать между нижним проходом через ящики и верхними полками с припасами.",
      "На верхних полках ещё сухо. Хозяева поднимали вещи всё выше, пока ящики внизу не стали похожи на ступени. Служащий различает два пути: осторожный низ и короткий подъём к двери маяка.",
      0.08,
    ),
    {
      mainClue: "Номера этажей написаны прямо на штабелях",
      secondaryClue: "Сухие мешки хранятся выше линии соли",
      action: "Пройти склад или подняться к верхней двери",
      reward: "Кофе, верфь и поздний путь к маяку",
      soundLandmark: "Глухой удар подвеса о балку",
      environmentEffect: "Пыль остаётся в узком свете верхнего окна",
      afterVisit: "Знакомые полки помогают найти обратную дорогу",
    },
  ),
  narrative(
    room(
      "P12",
      "Осевшая верфь",
      1400,
      760,
      [8, 12],
      650,
      "shipyard",
      "Пересечь разрыв на уровне палубы или спуститься к безопасному обходу и затопленному дому.",
      "Корпус судна осел между опорами. По палубе путь короче, но между досками не хватает целого пролёта. Внизу остались рабочие ступени и дверь дома, которому вода давно закрыла главный вход.",
      0.75,
    ),
    {
      mainClue: "Две половины палубы ещё держатся на опорах",
      secondaryClue: "Ступени под килем ведут к боковой двери",
      action: "Применить рывок или восстановить высоту по нижним ступеням",
      reward: "Два подхода к рыбацкому настилу и дому под водой",
      soundLandmark: "Редкий глухой удар корпуса",
      environmentEffect: "Блики воды ложатся на нижний путь",
      afterVisit: "Верфь становится развилкой, а не тупиком падения",
    },
  ),
  narrative(
    room(
      "P13",
      "Старый маяк",
      1280,
      1100,
      [8, 9],
      1000,
      "lighthouse",
      "Вернуться с когтями, подняться по стенам и увидеть обратную сторону грузового балкона.",
      "Ступени разобрали, чтобы чинить нижние дома. В камне остались скобы, а на каждом привале — следы чьих-то ладоней. Только сверху видно, что маяк связан галереей с балконом подъёмника.",
      0.7,
    ),
    {
      mainClue: "Медные царапины чередуются на стенах",
      secondaryClue: "Пустой фонарь указывает на восточную галерею",
      action: "Чередовать стеновые прыжки и площадки отдыха",
      reward:
        "Верхняя петля к грузовому балкону и свидетельство прежней службы",
      soundLandmark: "Ветер в пустой линзе",
      environmentEffect: "Сор движется только в прорезях башни",
      afterVisit: "Верхняя галерея связывает две вертикальные комнаты",
    },
  ),
  narrative(
    room(
      "P14",
      "Настил рыбаков",
      1280,
      720,
      [10, 12],
      620,
      "fishing",
      "Встретить жителя и опустить лестницу к знакомому убежищу.",
      "Рыбацкие сети пусты, но на столе лежит починенная рукавица. Здесь всё ещё собираются люди. Они давно видят свет дома смотрителя, хотя короткая лестница к нему поднята с этой стороны.",
      0.45,
    ),
    {
      mainClue: "Огонь дома виден между сетями",
      secondaryClue: "На лестнице осталась свежая верёвка",
      action: "Опустить лестницу и выслушать рыбака",
      reward: "Новая постоянная короткая связь с убежищем",
      soundLandmark: "Шорох сетей и чайник за окном",
      environmentEffect: "Лоскуты сетей движутся вместе с ветром",
      afterVisit: "Лестница даёт людям короткую дорогу к огню",
    },
  ),
  narrative(
    room(
      "P15",
      "Подвесная разгрузка",
      1500,
      860,
      [12, 12],
      760,
      "cargo",
      "Сопоставить движение подвеса с прыжком; внизу остаётся безопасный путь восстановления.",
      "Подвес продолжает ходить над пустой разгрузкой. Он возвращается с одним и тем же усилием ремня. Служащий слушает скрип, а вы можете остановить момент и выбрать, где встретить опору. Внизу лежат старые ступени.",
      0.85,
    ),
    {
      mainClue: "Подвес проходит между двумя неподвижными краями",
      secondaryClue: "Возвратная галерея сложена за лебёдкой",
      action: "Пересечь верх или подняться по нижним ступеням",
      reward: "Доступ к лебёдке и постоянному обратному настилу",
      soundLandmark: "Ровный скрип подвеса и редкий плевок паразита",
      environmentEffect: "Крошка сыплется в полосе под ремнём",
      afterVisit: "После запуска лебёдки появляется ровный обратный настил",
    },
  ),
  narrative(
    room(
      "P16",
      "Обход лебёдки",
      1120,
      720,
      [14, 12],
      620,
      "winch",
      "Освободить привод и открыть обратный настил и проход к старой решётке.",
      "У лебёдки есть рукоять для человека. Достаточно повернуть её, чтобы подвесная разгрузка получила обычный настил. За тягами узнаётся знакомая решётка; путь замыкается там, где раньше приходилось делать длинный обход.",
      0.2,
    ),
    {
      mainClue: "Две тяги идут к разгрузке и знакомой решётке",
      secondaryClue: "На рукояти нет соли",
      action: "Повернуть привод и дождаться раскрытия настила",
      reward: "Вторая новая короткая связь и быстрый возврат через разгрузку",
      soundLandmark: "Медленный скрежет натянутого привода",
      environmentEffect: "Ржавчина осыпается при первом движении",
      afterVisit: "Путь перестаёт зависеть от времени движения подвеса",
    },
  ),
  narrative(
    room(
      "P17",
      "Дом под ватерлинией",
      1000,
      900,
      [8, 14],
      800,
      "tidehouse",
      "Выбрать сухие балки или мокрый низ, прочитать свидетельство и увидеть обещание Насосных.",
      "На стене отмечены несколько уровней воды. Чем ниже путь, тем мокрее пальто. На балках можно сохранить одежду сухой, а у стола осталась ведомость служащего, который пытался понять, почему вода не уходит.",
      0.05,
    ),
    {
      mainClue: "Сухая полоса идёт по балкам над ватерлинией",
      secondaryClue: "Труба скрывается за заслонкой с надписью «Насосные»",
      action: "Выбрать высоту пути и прочитать ведомость",
      reward: "Припасы и история городского механизма",
      soundLandmark: "Гул трубы под водой и тихий стук посуды",
      environmentEffect: "Блики доходят до нижних стен; верхние балки сухие",
      afterVisit:
        "Ведомость сохраняется в памяти, запасы не появляются повторно",
    },
  ),
  narrative(
    room(
      "P18",
      "Грузовой балкон",
      1280,
      900,
      [10, 9],
      800,
      "balcony",
      "Применить поздний зацеп и соединить нижнее грузовое кольцо с подъёмником.",
      "Снизу балкон кажется недоступным. Теперь когти находят на стенах такие же следы, как в жилых кварталах. Наверху встречаются галерея маяка и служебный выход к подъёмнику — старое место становится частью нового круга.",
      0.8,
    ),
    {
      mainClue: "Тросы идут от нижней двери к верхнему выходу",
      secondaryClue: "У стены те же медные следы, что в шахте",
      action: "Подняться по стенам и выйти к старому подъёмнику",
      reward: "Поздняя связь с подъёмником и обратная петля через маяк",
      soundLandmark: "Ветер и натяжение подъёмных канатов",
      environmentEffect:
        "Сверху сыплется сор, но середина прохода остаётся видимой",
      afterVisit: "Балкон соединяет два освоенных способа подъёма",
    },
  ),
];
world.rooms.push(...rooms);
const byId = new Map(world.rooms.map((r) => [r.roomId, r]));
function add(id, suffix, x, y, w, h, kind = "solid", extra = {}) {
  byId
    .get(id)
    .collisionLayers.push(surface(id + "." + suffix, x, y, w, h, kind, extra));
}
add("P10", "counter", 420, 560, 120, 60);
byId
  .get("P10")
  .entities.push(
    npc(
      "npc.customs_keeper",
      720,
      620,
      "Таможенный сторож",
      "Грузы ушли наверх, а печати остались здесь. Через пакгауз можно обойти весь старый причал. Только не пытайся пробежать его одним дыханием.",
      "Навес всё ещё сухой. Складской круг начинается за стойкой; наверху есть места, куда вернёшься с цепкими руками.",
    ),
  );
add("P11", "crate_a", 340, 550, 90, 70);
add("P11", "crate_b", 620, 510, 100, 110);
add("P11", "step", 470, 470, 150, 16, "oneWay");
add("P11", "gallery", 760, 390, 420, 18, "oneWay");
add("P11", "hoist", 650, 455, 120, 14, "oneWay", {
  motion: { axis: "x", distance: 75, speed: 0.65 },
});
add("P12", "deck_left", 0, 500, 380, 24);
add("P12", "deck_right", 700, 500, 700, 150);
add("P12", "lower_step", 440, 580, 110, 14, "oneWay");
add("P12", "return_step", 570, 530, 130, 14, "oneWay");
for (const [id, ground, lower, top] of [
  ["P13", 1000, 900, 220],
  ["P18", 800, 710, 220],
]) {
  add(id, "shaft_left", 500, 260, 24, lower - 260);
  add(id, "shaft_right", 680, 150, 24, lower - 150);
  for (const [n, y] of (id === "P13" ? [760, 580, 400] : [590, 430]).entries())
    add(id, "rest_" + n, 524, y, 156, 14, "oneWay");
  add(id, "balcony", 524, top, 756, 18, "oneWay");
}
byId
  .get("P13")
  .entities.push(
    inspect(
      "note.old_beacon",
      940,
      220,
      "Осмотреть пустую линзу",
      "На оправе сохранились следы прежнего света. Внизу отмечены грузовые приливы, а не часы. Маяк был частью городского механизма, а не только ориентиром для судов.",
    ),
  );
byId
  .get("P14")
  .entities.push(
    npc(
      "npc.fisher",
      620,
      620,
      "Рыбак с пустой сетью",
      "Сети теперь чинят чаще, чем ставят. Лестница слева ведёт к огню смотрителя. Опусти её — туда снова можно будет носить еду.",
      "Теперь от дома до сетей короткий путь. Если устанешь, не стесняйся вернуться к чужому огню.",
    ),
  );
byId
  .get("P14")
  .entities.push(
    lever(
      "lever.fish_ladder",
      390,
      620,
      "Опустить лестницу к дому",
      "shortcut.fish_ladder",
      "Лестница опущена. Дом смотрителя снова связан с рыбацким настилом.",
    ),
  );
byId.get("P14").mechanisms = [
  {
    id: "mechanism.fish_ladder",
    kind: "ladder",
    flag: "shortcut.fish_ladder",
    x: 240,
    y: 620,
    w: 34,
    h: 150,
    duration: 0.8,
    controlledExits: ["P14.to.P02"],
    vista: "Дом смотрителя",
  },
];
add("P15", "launch", 0, 520, 350, 22, "oneWay");
add("P15", "moving_cargo", 470, 560, 150, 16, "oneWay", {
  motion: { axis: "x", distance: 110, speed: 0.8 },
});
add("P15", "middle", 750, 470, 190, 16, "oneWay");
add("P15", "landing", 1120, 520, 380, 22, "oneWay");
add("P15", "recovery_one", 380, 670, 150, 14, "oneWay");
add("P15", "recovery_two", 600, 590, 140, 14, "oneWay");
add("P15", "recovery_three", 920, 590, 150, 14, "oneWay");
add("P15", "return_bridge", 350, 520, 770, 18, "oneWay", {
  requires: { flag: "shortcut.pier_winch" },
  mechanismId: "mechanism.cargo_bridge",
});
byId.get("P15").mechanisms = [
  {
    id: "mechanism.cargo_bridge",
    kind: "bridge",
    flag: "shortcut.pier_winch",
    x: 350,
    y: 520,
    w: 770,
    h: 18,
    duration: 1.2,
    controlledExits: [],
  },
];
byId.get("P15").entities.push({
  id: "P15.parasite",
  type: "enemy",
  enemyType: "parasite",
  x: 880,
  y: 395,
  hp: 2,
  patrol: [800, 960],
});
byId
  .get("P16")
  .entities.push(
    lever(
      "lever.pier_winch",
      640,
      620,
      "Освободить привод лебёдки",
      "shortcut.pier_winch",
      "Лебёдка опустила обратный настил. Открылся путь к знакомой решётке.",
    ),
  );
byId.get("P16").mechanisms = [
  {
    id: "mechanism.winch_ladder",
    kind: "ladder",
    flag: "shortcut.pier_winch",
    x: 220,
    y: 620,
    w: 34,
    h: 140,
    duration: 0.9,
    controlledExits: ["P16.to.P07"],
    vista: "Обратная сторона",
  },
];
for (const [n, x, y, w] of [
  [0, 210, 710, 160],
  [1, 400, 660, 200],
  [2, 650, 660, 170],
])
  add("P17", "dry_" + n, x, y, w, 16, "oneWay");
byId.get("P17").survival = { darkness: 0.8, grimeRate: 0.18, wetBelowY: 720 };
byId
  .get("P17")
  .entities.push(
    inspect(
      "note.tide_ledger",
      500,
      660,
      "Прочитать ведомость воды",
      "Ведомость подписана такой же служебной печатью, как твой пропуск. Насосы замедляются после каждого нижнего колокола. Последняя строка не закончена: «Если вода снова поднимется, проверьте общую тягу…».",
    ),
  );
byId.get("P17").entities.push({
  id: "future.pier_pumps",
  type: "barrier",
  x: 860,
  y: 800,
  title: "Заслонка Насосных",
  text: "За заслонкой гудит вода. Пока здесь можно увидеть только начало трубы: сами Насосные лежат за пределами первого акта.",
});
function connect(
  a,
  b,
  {
    ax,
    ay,
    bx,
    by,
    kind = "door",
    adir = "down",
    bdir = "up",
    condition = null,
    reason = "",
    aSpawn,
    bSpawn,
  } = {},
) {
  const ra = byId.get(a),
    rb = byId.get(b);
  ax ??= ra.worldBounds.w - 24;
  ay ??= ra.decoration.groundY;
  bx ??= 24;
  by ??= rb.decoration.groundY;
  function exit(from, to, x, y, dir) {
    const z =
      kind === "passage"
        ? {
            x: dir === "left" ? 0 : from.worldBounds.w - 40,
            y: y - 90,
            w: 40,
            h: 100,
          }
        : { x: x - 54, y: y - 76, w: 108, h: 84 };
    return {
      exitId: from.roomId + ".to." + to.roomId,
      x,
      y,
      w: 42,
      h: 76,
      direction: dir,
      type: kind,
      targetRoomId: to.roomId,
      spawnPointId: "from." + from.roomId,
      condition,
      lockedReason: condition
        ? reason || "Нужна способность для этой дороги"
        : "",
      label: to.name,
      interactionZone: { x: x - 54, y: y - 76, w: 108, h: 84 },
      triggerZone: z,
      lockKind: condition
        ? condition.flag?.startsWith("ability.")
          ? "ability"
          : "other_side"
        : null,
      hidden: false,
      indirect: true,
      indirectReason:
        "Служебная галерея связывает разные стороны грузового кольца",
    };
  }
  ra.exits.push(exit(ra, rb, ax, ay, adir));
  rb.exits.push(exit(rb, ra, bx, by, bdir));
  ra.spawnPoints["from." + b] = {
    x:
      aSpawn?.x ??
      Math.max(
        60,
        Math.min(ra.worldBounds.w - 84, ax + (adir === "right" ? -100 : 48)),
      ),
    y: (aSpawn?.feet ?? ay) - 44,
    safeRadius: 28,
    facing: adir === "right" ? -1 : 1,
  };
  rb.spawnPoints["from." + a] = {
    x:
      bSpawn?.x ??
      Math.max(
        60,
        Math.min(rb.worldBounds.w - 84, bx + (bdir === "right" ? -100 : 48)),
      ),
    y: (bSpawn?.feet ?? by) - 44,
    safeRadius: 28,
    facing: bdir === "right" ? -1 : 1,
  };
}
const dash = { flag: "ability.dash" },
  grip = { flag: "ability.wall_grip" };
connect("P03", "P10", {
  ax: 1100,
  ay: 620,
  bx: 100,
  by: 620,
  condition: dash,
  reason:
    "Сначала найдите Порыв ветра: грузовое кольцо требует воздушного рывка.",
});
connect("P10", "P11", { kind: "passage", adir: "right", bdir: "left" });
connect("P11", "P12", {
  kind: "passage",
  adir: "right",
  bdir: "left",
  by: 500,
});
connect("P12", "P14", {
  kind: "passage",
  adir: "right",
  bdir: "left",
  ay: 500,
});
connect("P14", "P15", {
  kind: "passage",
  adir: "right",
  bdir: "left",
  by: 520,
});
connect("P15", "P16", {
  kind: "passage",
  adir: "right",
  bdir: "left",
  ay: 520,
});
connect("P12", "P17", {
  ax: 520,
  ay: 650,
  bx: 100,
  by: 800,
  aSpawn: { x: 520, feet: 650 },
});
connect("P11", "P13", {
  ax: 1030,
  ay: 390,
  bx: 100,
  by: 1000,
  condition: grip,
  reason: "К лестнице маяка можно вернуться с Медными когтями.",
  aSpawn: { x: 1050, feet: 390 },
});
connect("P13", "P18", {
  ax: 1160,
  ay: 220,
  bx: 900,
  by: 220,
  adir: "right",
  bdir: "left",
  condition: grip,
  aSpawn: { x: 1060, feet: 220 },
  bSpawn: { x: 1020, feet: 220 },
});
connect("P11", "P18", {
  ax: 1260,
  ay: 620,
  bx: 100,
  by: 800,
  condition: grip,
  reason: "Высокий балкон требует Медных когтей.",
});
connect("P16", "P18", {
  ax: 980,
  ay: 620,
  bx: 300,
  by: 800,
  condition: grip,
  reason: "Скобы балкона рассчитаны на Медные когти.",
});
connect("P14", "P02", {
  ax: 240,
  ay: 620,
  bx: 240,
  by: 620,
  condition: { flag: "shortcut.fish_ladder" },
  reason: "Лестница опускается с рыбацкого настила.",
});
connect("P16", "P07", {
  ax: 220,
  ay: 620,
  bx: 610,
  by: 620,
  condition: { flag: "shortcut.pier_winch" },
  reason: "Проход откроется после освобождения лебёдки.",
  bSpawn: { x: 555, feet: 620 },
});
connect("P18", "P08", {
  ax: 1160,
  ay: 220,
  bx: 820,
  by: 620,
  condition: grip,
  reason: "Грузовой балкон требует Медных когтей.",
  bSpawn: { x: 800, feet: 620 },
  aSpawn: { x: 1100, feet: 220 },
});
for (const [id, flag] of [
  ["P14", "shortcut.fish_ladder"],
  ["P16", "shortcut.pier_winch"],
])
  byId.get(id).persistentFlags.push(flag);
for (const [id, roomId, x, y, contents, title] of [
  ["guide.cache.p10", "P10", 840, 620, { rations: 1 }, "Паёк под навесом"],
  ["guide.cache.p11", "P11", 900, 390, { beans: 1 }, "Зёрна на сухой полке"],
  ["guide.cache.p13", "P13", 790, 220, { beans: 1 }, "Кофе у пустой линзы"],
  ["guide.cache.p15", "P15", 810, 470, { rations: 1 }, "Ящик над разгрузкой"],
  [
    "guide.cache.p17",
    "P17",
    760,
    660,
    { rations: 2, beans: 1 },
    "Сухая корзина на балке",
  ],
])
  world.guideCaches.push({ id, roomId, x, y, contents, title });
for (const r of rooms)
  for (const e of r.entities)
    if (e.type === "npc")
      e.reactions = [
        {
          need: "energy",
          below: 12,
          text: "Ты держишься на одном усилии. Вернись к огню, прежде чем следующий шаг окажется последним.",
        },
        {
          need: "satiety",
          below: 15,
          text: "Не отдавай дороге последние силы натощак. Поищи сухой ящик или знакомый очаг.",
        },
      ];
Object.assign(byId.get("R08").narrative, {
  secondaryClue:
    "Водовод уходит к Насосным, тросы — к садам, над крышами видны колокольни",
  soundLandmark:
    "Насосные, Висячие сады и Колокольный район имеют разные сигналы",
});
world.actOne = {
  targetRooms: 66,
  regionalTargets: { pier: 18, station: 16, quarter: 32 },
  baseRoomIds,
  implementedBatches: [
    ...new Set([
      ...(world.actOne?.implementedBatches || []),
      "base22",
      "pier-expansion9",
    ]),
  ],
};
for (const [id, title, text, soundCue] of [
  [
    "horizon.400",
    "Висячие сады",
    "Над северными дворами видны тросы и зелень. Дорога к Висячим садам начинается за пределами первого акта.",
    "horizonGardens",
  ],
  [
    "horizon.760",
    "Насосные",
    "Внизу медленно движутся трубы. Служебные ведомости связывают их с уровнем воды. Сами Насосные ещё впереди.",
    "horizonPumps",
  ],
  [
    "horizon.1060",
    "Колокольный район",
    "За восточными крышами стоят башни. Иногда оттуда доходит низкий колокол. Этот путь продолжится после первого акта.",
    "horizonBells",
  ],
]) {
  Object.assign(
    byId.get("R08").entities.find((e) => e.id === id),
    { title, text, soundCue },
  );
}
const errors = validateWorld(world, physics);
if (errors.length) throw Error(errors.join("\n"));
await writeFile(url, JSON.stringify(world, null, 2) + "\n");
console.log(
  `Authored ${rooms.length} rooms; world now ${world.rooms.length} rooms, ${world.rooms.reduce((n, r) => n + r.exits.length, 0)} exits.`,
);
