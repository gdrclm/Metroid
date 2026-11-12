// Authoring source for the twelve station rooms. Runtime reads world.json.
// Re-running replaces this batch only; original rooms and other batches survive.
import { readFile, writeFile } from "node:fs/promises";
import { validateWorld } from "../src/core.js";
const url = new URL("../data/world.json", import.meta.url);
const world = JSON.parse(await readFile(url, "utf8"));
const physics = JSON.parse(
  await readFile(new URL("../data/physics.json", import.meta.url), "utf8"),
);
const ids = new Set(
  Array.from({ length: 12 }, (_, i) => `V${String(i + 5).padStart(2, "0")}`),
);
world.rooms = world.rooms.filter((r) => !ids.has(r.roomId));
for (const r of world.rooms) {
  r.exits = r.exits.filter((e) => !ids.has(e.targetRoomId));
  for (const id of ids) delete r.spawnPoints["from." + id];
}
world.guideCaches = world.guideCaches.filter((c) => !ids.has(c.roomId));
const rooms = new Map(world.rooms.map((r) => [r.roomId, r]));
function create(
  id,
  name,
  kind,
  w,
  h,
  ground,
  map,
  purpose,
  journal,
  clue,
  action,
  reward,
  sound = "clock",
) {
  const r = {
    roomId: id,
    regionId: "station",
    revision: 1,
    act: 1,
    contentBatch: "act1.station.expansion",
    name,
    worldBounds: { x: 0, y: 0, w, h },
    mapShape: {
      x: map[0],
      y: map[1],
      w: +(w / 1280).toFixed(3),
      h: +(h / 720).toFixed(3),
    },
    collisionLayers: [],
    cameraZones: [{ x: 0, y: 0, w, h, profile: h > 900 ? "shaft" : "street" }],
    spawnPoints: {
      start: { x: 80, y: ground - 44, safeRadius: 28, facing: 1 },
    },
    exits: [],
    entities: [],
    triggers: [],
    persistentFlags: [],
    resetRules: {
      enemies: "on_rest_or_death",
      unique: "persistent",
      projectiles: "on_exit",
    },
    audioProfile: "station",
    streamingGroup: "station",
    debugTags: ["act1-expansion", kind],
    decoration: {
      style: kind,
      seed: 470 + Number(id.slice(1)),
      groundY: ground,
      event: "station_life",
    },
    expansionScene: { kind },
    tutorialSigns: [],
    purpose,
    note: purpose,
    journalEntry: journal,
    narrative: {
      past: name,
      change: "Пассажирские пути стали общими дорогами жителей",
      present: purpose,
      mainClue: clue,
      secondaryClue: journal,
      action,
      reward,
      soundLandmark: sound,
      environmentEffect:
        kind === "canteen"
          ? "Тёплый пар у холодных окон"
          : "Пыль в боковом свете",
      afterVisit: "Знакомый путь остаётся доступным для возвращения",
    },
    atmosphere: {
      exposure: kind === "bellway" ? 0.6 : 0.12,
      reverb: 0.065,
      sheltered: kind !== "bellway",
    },
    audioSources: [
      {
        id: id + ".sound",
        sound,
        x: w * 0.65,
        y: ground - 80,
        radius: 500,
        gain: 0.32,
        interval: sound === "bell" ? [12, 21] : [7, 14],
      },
    ],
    emitters: [],
    storyEvents: [],
    storyProps: [{ kind: "patchedPlanks", x: w * 0.3, y: ground - 4 }],
  };
  rooms.set(id, r);
  world.rooms.push(r);
  add(id, "floor", 0, ground, w, h - ground);
  return r;
}
function add(id, key, x, y, w, h, kind = "solid", extra = {}) {
  const s = {
    id: id + "." + key,
    x,
    y,
    w,
    h,
    kind,
    grippable: true,
    material: "iron",
    ...extra,
  };
  rooms.get(id).collisionLayers.push(s);
  return s;
}
function entity(id, e) {
  rooms.get(id).entities.push(e);
  return e;
}
function npc(id, key, x, y, title, text, repeatText, extra = {}) {
  return entity(id, {
    id: key,
    type: "npc",
    x,
    y,
    title,
    text,
    repeatText,
    reactions: [
      {
        need: "energy",
        below: 12,
        text: "Ты едва держишься. В зале ожидания ещё есть место у огня.",
      },
      {
        need: "satiety",
        below: 15,
        text: "Голодного дорога обманывает. В столовой можно сварить свои припасы.",
      },
    ],
    ...extra,
  });
}
function note(id, key, x, y, title, text) {
  return entity(id, { id: key, type: "inspect", x, y, title, text });
}
function lever(id, key, x, y, title, flag, text) {
  rooms.get(id).persistentFlags.push(flag);
  return entity(id, { id: key, type: "lever", x, y, title, flag, text });
}
create(
  "V05",
  "Лестница прибывших",
  "arrival_stairs",
  1100,
  940,
  840,
  [2, 4],
  "Подняться с платформы по сохранившимся пролётам; каждый неудачный прыжок оставляет безопасный возврат.",
  "На стенах всё ещё написано, куда идти прибывшим. Ступени провалились, но площадки остались. На каждой кто-то оставил мелкую вещь, которую было тяжело нести дальше. Служащий останавливается у детской варежки.",
  "Четыре площадки поднимаются к освещённой двери",
  "Связать несколько коротких прыжков",
  "Вход на жилую платформу и обратный спуск",
  "footstepsAbove",
);
for (const [i, x, y] of [
  [0, 240, 760],
  [1, 430, 680],
  [2, 620, 600],
  [3, 810, 520],
])
  add("V05", "step" + i, x, y, i === 3 ? 290 : 170, 18, "oneWay");
create(
  "V06",
  "Платформа переселенцев",
  "settlers",
  1500,
  720,
  620,
  [0, 4],
  "Встретить жителей и увидеть, что зал ожидания связан с обжитой стороной станции.",
  "Поезда здесь заменили занавесками. Под каждой — несколько вещей, расставленных так, будто люди останутся только до утра. Женщина у чемодана помнит расписание по звуку, хотя давно не ждёт отправления.",
  "Номера вагонов стали номерами семей",
  "Пройти платформу и поговорить с переселенкой",
  "Знакомство с жилой петлёй и конечный паёк",
  "cloth",
);
add("V06", "bench", 500, 560, 100, 60);
npc(
  "V06",
  "npc.settler",
  880,
  620,
  "Женщина с чемоданом",
  "Мы не уезжаем. Просто пока не решили, где остаться. За очередью есть столовая; там ещё можно греть воду.",
  "Если услышишь, что снова звонит сигнал, не пугайся. Иногда здесь чинят то, что давно перестали ждать.",
  {
    dialogueVariants: [
      {
        condition: { flag: "mechanism.station_signal" },
        text: "Сигнал снова слышно. Теперь дети узнают, когда закрывают нижние ворота. Значит, мастер всё-таки закончил работу.",
      },
    ],
  },
);
note(
  "V06",
  "note.settler_case",
  250,
  620,
  "Осмотреть раскрытый чемодан",
  "В чемодане сложены ложки и служебная рубашка. Дорога отняла столько места, что человек оставил себе только привычку садиться за общий стол.",
);
create(
  "V07",
  "Очередь за горячим",
  "soup_queue",
  1000,
  720,
  620,
  [-2, 4],
  "Увидеть чужой голод перед выбором: сохранить паёк себе или оставить его в общей корзине столовой.",
  "Очередь почти не движется. Люди стоят не за едой, а за местом, где её можно согреть. Служащий сначала прячет руки в рукава, потом замечает такую же позу у каждого второго. Наблюдатель не может приказать ему перестать мёрзнуть.",
  "На доске написано: «Принеси, что можешь»",
  "Поговорить с раздатчицей и найти общую корзину",
  "Бытовой выбор с постоянным последствием",
  "crockery",
);
npc(
  "V07",
  "npc.soup_server",
  560,
  620,
  "Раздатчица",
  "Котёл не пустой, пока кто-нибудь приносит своё. В столовой есть общая корзина. Только не отдавай последнее: ты тоже человек.",
  "Своё можно сварить у левого очага. Кофейник стоит дальше, у окна.",
  {
    dialogueVariants: [
      {
        condition: { flag: "story.station_meal" },
        text: "Твой паёк разделили на несколько мисок. Не велико угощение, зато никто не ушёл с одной горячей водой. Спасибо, служащий.",
      },
    ],
  },
);
create(
  "V08",
  "Столовая",
  "canteen",
  1300,
  720,
  620,
  [-2, 2],
  "Приготовить собственную еду и кофе у настоящих предметов; открыть короткий путь к убежищу.",
  "У плиты пахнет крупой. Здесь можно согреть то, что принёс с собой, а чужую миску не принять за собственную. В общей корзине лежит записка: «Оставь, если у тебя есть лишнее». Огонь даёт передышку, но кровать осталась в зале ожидания.",
  "Плита, кофейник и общая корзина стоят отдельно",
  "Распорядиться конечными припасами и открыть дверь",
  "Восстановление, помощь жителям и сокращение к V02",
  "kettle",
);
for (const [id, x, action, title] of [
  ["care.station_stove", 410, "food", "Сварить похлёбку · 1 паёк"],
  ["care.station_coffee", 630, "coffee", "Приготовить кофе · 1 зёрна"],
  ["care.station_basket", 850, "donate", "Оставить паёк жителям"],
])
  entity("V08", {
    id,
    type: "care",
    x,
    y: 620,
    action,
    title,
    ...(action === "donate" ? { flag: "story.station_meal" } : {}),
  });
lever(
  "V08",
  "lever.station_canteen",
  1050,
  620,
  "Открыть дверь к залу ожидания",
  "shortcut.station_canteen",
  "Засов поднят. Из столовой теперь можно вернуться прямо к месту отдыха.",
);
rooms.get("V08").mechanisms = [
  {
    id: "mechanism.canteen_door",
    kind: "ladder",
    flag: "shortcut.station_canteen",
    x: 1180,
    y: 620,
    w: 34,
    h: 150,
    duration: 0.8,
    controlledExits: ["V08.to.V02"],
  },
];
rooms.get("V08").emitters = [
  {
    id: "V08.steam",
    effect: "steam",
    x: 410,
    y: 580,
    direction: { x: 0, y: -1 },
    rate: 1.3,
    life: [1, 2.5],
    layer: "middle",
    mode: "continuous",
    spread: 0.2,
    speed: [7, 12],
  },
];
create(
  "V09",
  "Диспетчерский мост",
  "dispatch",
  1400,
  880,
  780,
  [2, 0],
  "Пересечь повреждённый мост по воздуху или восстановить высоту по нижним опорам; запустить обратный настил.",
  "Под стеклом диспетчера лежат линии всех районных путей. Одна тонкая тяга идёт под вокзал, другая — к дворам. Служащий впервые видит город как работу, которую кто-то ежедневно продолжает выполнять, не понимая целиком.",
  "Сломанный пролёт и рычаг на дальней стороне",
  "Достичь пульта и освободить привод",
  "Ровный обратный мост и проход к часам",
  "coupling",
);
add("V09", "left_deck", 0, 500, 400, 18, "oneWay");
add("V09", "right_deck", 900, 500, 500, 18, "oneWay");
add("V09", "low_step", 430, 690, 170, 16, "oneWay");
add("V09", "high_step", 680, 600, 170, 16, "oneWay");
add("V09", "service_cradle", 530, 590, 150, 16, "oneWay", {
  motion: { axis: "x", distance: 90, speed: 0.6 },
});
add("V09", "return_bridge", 400, 500, 500, 18, "oneWay", {
  requires: { flag: "mechanism.dispatch_grid" },
  mechanismId: "mechanism.dispatch_bridge",
});
lever(
  "V09",
  "lever.dispatch_grid",
  1050,
  500,
  "Освободить привод моста",
  "mechanism.dispatch_grid",
  "Привод пошёл. Настил соединяет обе стороны моста, а дверь к часам больше не заклинена.",
);
rooms.get("V09").mechanisms = [
  {
    id: "mechanism.dispatch_bridge",
    kind: "bridge",
    flag: "mechanism.dispatch_grid",
    x: 400,
    y: 500,
    w: 500,
    h: 18,
    duration: 1.2,
    controlledExits: ["V09.to.V10"],
  },
];
npc(
  "V09",
  "npc.dispatcher",
  1230,
  500,
  "Диспетчер без смены",
  "Не трогай стрелки вслепую. Этот привод только вернёт мост на место. Подача сигнала чинится дальше, в мастерской.",
  "Теперь можно вернуться по ровному. Иногда это и есть вся хорошая новость за день.",
);
create(
  "V10",
  "Зал часов",
  "clock_hall",
  1400,
  860,
  760,
  [0, 0],
  "Выбрать безопасный низ или подняться к записке и кофе через движущуюся опору, наблюдая её настоящий ритм.",
  "Часы показывают разное время, но нижние передачи двигаются вместе. Служащий слушает их дольше, чем смотрит на циферблаты. Площадка возвращается в одно и то же место; приходится дождаться не тишины, а знакомого усилия механизма.",
  "Подвижная опора проходит рядом с неподвижными площадками",
  "Спланировать момент прыжка либо обойти снизу",
  "Запись о ритме городской машины и кофе",
  "clock",
);
add("V10", "first_step", 240, 680, 170, 16, "oneWay");
add("V10", "pendulum_carriage", 460, 590, 160, 16, "oneWay", {
  motion: { axis: "x", distance: 105, speed: 0.7 },
});
add("V10", "middle", 700, 500, 170, 16, "oneWay");
add("V10", "reading_gallery", 900, 460, 270, 18, "oneWay");
note(
  "V10",
  "note.clock_timing",
  1030,
  460,
  "Прочитать пометки регулировщика",
  "«Не верьте стрелке, пока не увидите тягу. По звуку можно узнать возврат, но не прочность опоры». Последняя поправка написана рукой, которая торопилась меньше остальных.",
);
create(
  "V11",
  "Мастерская",
  "signal_shop",
  1000,
  720,
  620,
  [-2, 0],
  "Восстановить станционный сигнал и затем увидеть последствия на обжитой платформе.",
  "В маленькой мастерской ремонтируют не часы, а возможность услышать друг друга через каменные стены. Новая катушка обмотана старой тканью. Мастер не обещает, что сигнал запустит поезда: достаточно, чтобы люди снова знали о закрытии ворот.",
  "Провод тянется к платформе переселенцев",
  "Включить собранную катушку",
  "Сохранённое изменение света и реплик на V06",
  "pipe",
);
add("V11", "workbench", 650, 560, 120, 60);
npc(
  "V11",
  "npc.signal_repairer",
  320,
  620,
  "Мастер сигналов",
  "Катушка уже готова. Рычаг рядом. Я столько раз проверял соединение, что теперь всё жду, кто первым решится его включить.",
  "Если будешь на жилой платформе, послушай: они заметили сигнал раньше, чем я.",
  {
    dialogueVariants: [
      {
        condition: { flag: "mechanism.station_signal" },
        text: "Слышишь? Негромко, зато дошло до всей платформы. Не каждый ремонт должен разбудить целый город.",
      },
    ],
  },
);
lever(
  "V11",
  "lever.station_signal",
  520,
  620,
  "Включить станционный сигнал",
  "mechanism.station_signal",
  "Сигнал снова работает. На платформе переселенцев загорелся общий фонарь.",
);
create(
  "V12",
  "Грузовая почта",
  "mail",
  1280,
  800,
  700,
  [-4, 0],
  "Пройти между грузами и прочитать необязательную историю; поздняя ветвь требует когтей.",
  "Посылки разобраны по адресам, которых больше нет на дверях. На нижней полке лежит письмо без получателя. Служащий узнаёт привычку подчёркивать номер дома дважды — так делают люди, которым важно, чтобы хоть что-нибудь дошло.",
  "Письма лежат выше старой линии сырости",
  "Перебраться через грузы и осмотреть письмо",
  "Сухой запас и поздний лифт",
  "board",
);
add("V12", "cart", 320, 630, 100, 70);
add("V12", "mail_crate", 630, 620, 100, 80);
note(
  "V12",
  "note.undelivered_letter",
  950,
  700,
  "Прочитать письмо без адреса",
  "«Мама, здесь ещё кормят на вокзале. Когда починят сигнал, ты услышишь его из нашего старого вагона. Я оставлю тебе место у окна». Письмо так и не закрыли.",
);
create(
  "V13",
  "Глухой лифт",
  "service_lift",
  1200,
  1040,
  940,
  [-4, -2],
  "Вернуться с когтями, открыть лифт к убежищу и подняться по стенам к верхней галерее.",
  "Кабина стоит внизу, словно давно ждёт одного последнего пассажира. Выше сохранились скобы и площадки техников. Служащий проверяет их осторожно: знакомый металл ещё не обещает, что он выдержит всё остальное.",
  "Рычаг кабины внизу, зацепы и выход наверху",
  "Запустить обратный лифт и чередовать стеновые прыжки",
  "Поздняя вертикальная петля и быстрый возврат к V02",
  "liftStop",
);
add("V13", "shaft_left", 520, 260, 24, 590);
add("V13", "shaft_right", 700, 150, 24, 700);
for (const [i, y] of [700, 520, 340].entries())
  add("V13", "rest" + i, 544, y, 156, 16, "oneWay");
add("V13", "balcony", 544, 200, 656, 18, "oneWay");
lever(
  "V13",
  "lever.station_service_lift",
  300,
  940,
  "Включить лифт зала ожидания",
  "shortcut.station_service_lift",
  "Кабина отозвалась. Теперь из шахты можно вернуться прямо в зал ожидания.",
);
rooms.get("V13").mechanisms = [
  {
    id: "mechanism.service_lift",
    kind: "ladder",
    flag: "shortcut.station_service_lift",
    x: 150,
    y: 940,
    w: 34,
    h: 140,
    duration: 1,
    controlledExits: ["V13.to.V02"],
  },
];
create(
  "V14",
  "Верхняя галерея",
  "upper_gallery",
  1500,
  720,
  620,
  [-2, -2],
  "Связать верх шахты с диспетчерским мостом и открыть позднее сокращение.",
  "Вдоль окон идут кабели и высохшие растения в жестяных банках. Отсюда видно, как маленький общий фонарь внизу теряется среди огромных конструкций. Служащий всё равно находит его взглядом: теперь это знакомое место.",
  "Лестница к диспетчерскому мосту поднята с этой стороны",
  "Опустить лестницу и выбрать путь к звонарям",
  "Позднее сокращение и обзор связей станции",
  "cloth",
);
add("V14", "cable_spool", 730, 560, 100, 60);
lever(
  "V14",
  "lever.station_gallery",
  420,
  620,
  "Опустить лестницу к мосту",
  "shortcut.station_gallery",
  "Лестница закреплена. Верхняя галерея связана с нижней стороной диспетчерского моста.",
);
rooms.get("V14").mechanisms = [
  {
    id: "mechanism.gallery_ladder",
    kind: "ladder",
    flag: "shortcut.station_gallery",
    x: 230,
    y: 620,
    w: 34,
    h: 160,
    duration: 1,
    controlledExits: ["V14.to.V09"],
  },
];
create(
  "V15",
  "Переход звонарей",
  "bellway",
  1200,
  720,
  620,
  [0, -2],
  "Услышать следующий район, сохраняя возможность закончить исследование в первом акте.",
  "Колокол доходит сюда позже ветра. Между ударами слышно, как тросы трутся о камень. Служащий больше не пытается угадать, откуда придёт следующий звук: достаточно, что у него появилось направление, к которому можно вернуться.",
  "Тросы ведут за крыши, но дальний путь ещё закрыт",
  "Осмотреть расписание и пройти к техническому порогу",
  "Обещание Колокольного района, без входа в него",
  "bell",
);
note(
  "V15",
  "note.bell_schedule",
  600,
  620,
  "Осмотреть расписание звонарей",
  "Отметки повторяются через неравные промежутки. Рядом приписано: «Слушайте последний удар. Остальные зовут машину». Дальше бумага стёрта верёвкой.",
);
create(
  "V16",
  "Технический порог Архива",
  "archive_threshold",
  1050,
  900,
  800,
  [2, -2],
  "Увидеть закрытую будущую область и замкнуть петлю к городским воротам, не покидая первый акт.",
  "За решёткой ровно гудит механизм. На пороге нет просьбы предъявить пропуск: только места для недостающих регуляторов. Служащий убирает документ обратно. Некоторые двери сначала нужно научиться оставлять закрытыми.",
  "Запечатанная машина и боковой проход к воротам",
  "Осмотреть порог и вернуться в знакомый район",
  "Завершённая петля Вокзала и обещание будущего",
  "coupling",
);
entity("V16", {
  id: "future.archive_technical",
  type: "barrier",
  x: 660,
  y: 800,
  title: "Техническая печать Архива",
  text: "Тяги уходят за пределы доступных районов. В первом акте эту печать не открыть. Боковая галерея возвращает к городским воротам.",
});
note(
  "V16",
  "note.archive_register",
  400,
  800,
  "Осмотреть ведомость регуляторов",
  "На схеме рядом стоят контуры Насосных, садов и колокольных тяг. Это не проходы за ближайшей стеной, а продолжения машины далеко за пределами вокзала. Пустые крепления пока ничего не принимают.",
);

function link(
  a,
  b,
  {
    ax,
    ay,
    bx,
    by,
    kind = "door",
    adir = "right",
    bdir = "left",
    condition = null,
    reason = "",
    aSpawn,
    bSpawn,
  } = {},
) {
  const ra = rooms.get(a),
    rb = rooms.get(b);
  ax ??= ra.worldBounds.w - 24;
  ay ??= ra.decoration.groundY;
  bx ??= 24;
  by ??= rb.decoration.groundY;
  function exit(from, to, x, y, direction) {
    return {
      exitId: from.roomId + ".to." + to.roomId,
      x,
      y,
      w: 42,
      h: 76,
      direction,
      type: kind,
      targetRoomId: to.roomId,
      spawnPointId: "from." + from.roomId,
      condition,
      lockedReason: condition ? reason : "",
      label: to.name,
      interactionZone: { x: x - 54, y: y - 76, w: 108, h: 84 },
      triggerZone:
        kind === "passage"
          ? {
              x: direction === "left" ? 0 : from.worldBounds.w - 40,
              y: y - 90,
              w: 40,
              h: 100,
            }
          : { x: x - 54, y: y - 76, w: 108, h: 84 },
      lockKind: condition
        ? condition.flag?.startsWith("ability.")
          ? "ability"
          : "other_side"
        : null,
      hidden: false,
      indirect: true,
      indirectReason:
        "Внутренняя станционная галерея связывает пассажирские и технические уровни",
    };
  }
  ra.exits.push(exit(ra, rb, ax, ay, adir));
  rb.exits.push(exit(rb, ra, bx, by, bdir));
  const spawn = (r, x, y, dir, override) => ({
    x:
      override?.x ??
      Math.max(
        60,
        Math.min(r.worldBounds.w - 84, x + (dir === "right" ? -100 : 48)),
      ),
    y: (override?.feet ?? y) - 44,
    safeRadius: 28,
    facing: dir === "right" ? -1 : 1,
  });
  ra.spawnPoints["from." + b] = spawn(ra, ax, ay, adir, aSpawn);
  rb.spawnPoints["from." + a] = spawn(rb, bx, by, bdir, bSpawn);
}
const grip = { flag: "ability.wall_grip" };
link("V01", "V05", {
  ax: 810,
  ay: 620,
  bx: 100,
  by: 840,
  kind: "stairs",
  adir: "up",
  bdir: "down",
});
link("V05", "V06", { ax: 1000, ay: 520, bx: 90, by: 620 });
link("V06", "V07", { kind: "passage" });
link("V07", "V08", { kind: "passage" });
link("V08", "V02", {
  ax: 1180,
  ay: 620,
  bx: 1390,
  by: 620,
  condition: { flag: "shortcut.station_canteen" },
  reason: "Дверь открывается из столовой.",
  bSpawn: { x: 1340, feet: 620 },
});
link("V03", "V09", {
  ax: 180,
  ay: 620,
  bx: 100,
  by: 500,
  condition: { flag: "mechanism.clockwork" },
  reason: "Сначала поверните маховик часовщика.",
});
link("V09", "V10", {
  kind: "passage",
  ay: 500,
  by: 760,
  condition: { flag: "mechanism.dispatch_grid" },
  reason: "Дверь удерживает привод диспетчерского моста.",
});
link("V10", "V11", { kind: "passage" });
link("V11", "V12", { kind: "passage", by: 700 });
link("V12", "V13", {
  ax: 1160,
  ay: 700,
  bx: 100,
  by: 940,
  kind: "lift",
  adir: "up",
  bdir: "down",
  condition: grip,
  reason: "У верхнего выхода нужны Медные когти.",
});
link("V13", "V14", {
  ax: 1100,
  ay: 200,
  bx: 100,
  by: 620,
  condition: grip,
  reason: "Подъём требует Медных когтей.",
  aSpawn: { x: 1000, feet: 200 },
});
link("V14", "V09", {
  ax: 230,
  ay: 620,
  bx: 1140,
  by: 780,
  condition: { and: [grip, { flag: "shortcut.station_gallery" }] },
  reason: "Лестница опускается из верхней галереи.",
  bSpawn: { x: 1080, feet: 780 },
});
link("V14", "V15", { kind: "passage" });
link("V15", "V16", { ax: 1100, ay: 620, bx: 100, by: 800 });
link("V16", "V04", {
  ax: 940,
  ay: 800,
  bx: 700,
  by: 620,
  condition: grip,
  reason: "Верхний технический путь требует Медных когтей.",
  bSpawn: { x: 730, feet: 620 },
});
link("V13", "V02", {
  ax: 150,
  ay: 940,
  bx: 250,
  by: 620,
  kind: "lift",
  adir: "down",
  bdir: "up",
  condition: { and: [grip, { flag: "shortcut.station_service_lift" }] },
  reason: "Лифт запускается снизу, из технической шахты.",
  bSpawn: { x: 260, feet: 620 },
});
for (const [id, roomId, x, y, contents, title] of [
  ["guide.cache.v06", "V06", 1290, 620, { rations: 1 }, "Паёк у жилого вагона"],
  [
    "guide.cache.v08",
    "V08",
    1000,
    620,
    { rations: 2, beans: 1 },
    "Сухой запас столовой",
  ],
  ["guide.cache.v09", "V09", 960, 500, { beans: 1 }, "Кофе диспетчера"],
  ["guide.cache.v10", "V10", 940, 460, { beans: 1 }, "Зёрна на галерее часов"],
  ["guide.cache.v11", "V11", 860, 620, { beans: 1 }, "Зёрна у катушки"],
  ["guide.cache.v12", "V12", 1050, 700, { rations: 2 }, "Неотправленный паёк"],
  ["guide.cache.v15", "V15", 850, 620, { beans: 1 }, "Кофе звонарей"],
])
  world.guideCaches.push({ id, roomId, x, y, contents, title });
world.actOne.implementedBatches = [
  ...new Set([...world.actOne.implementedBatches, "station-expansion12"]),
];
const errors = validateWorld(world, physics);
if (errors.length) throw Error(errors.join("\n"));
await writeFile(url, JSON.stringify(world, null, 2) + "\n");
console.log(
  `Authored 12 station rooms; world now ${world.rooms.length} rooms, ${world.rooms.reduce((n, r) => n + r.exits.length, 0)} exits.`,
);
