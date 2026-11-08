# Записанные инструменты для боя со смотрителем

В `boss/` включены записи настоящих инструментов Karoryfer Lecolds под **CC0 1.0 Universal**. Записи гитар сделал Brian Wood. Все файлы распространяются вместе с игрой; загрузка с внешних сервисов во время игры не требуется.

| Файлы | Источник |
|---|---|
| `guitar-left-*` | [Black And Green Guitars — Gretsch Anniversary](https://github.com/sfzinstruments/karoryfer.black-and-green-guitars) |
| `guitar-right-*` | Та же библиотека — отдельные записи Hofner Club |
| `bass-e` | [Black And Blue Basses — Darkblack](https://github.com/sfzinstruments/karoryfer.black-and-blue-basses) |
| `kick`, `snare`, `hat`, `crash` | [Big Rusty Drums](https://github.com/sfzinstruments/karoryfer.big-rusty-drums) |

Полный текст лицензии: [CC0-1.0.txt](CC0-1.0.txt). Точные upstream-коммиты, пути к исходным WAV/FLAC, SHA-256 исходников и готовых MP3, цепочки обработки: [sources.json](sources.json).

Обработка: ограничение длины, выравнивание пика до −2 dBFS, плавное затухание последних 250 мс, кодирование MP3 через FFmpeg/libmp3lame (`-ar 44100 -q:a 3`). Натуральные атака, шум струн и затухание записей сохранены. В игре гитары и бас дополнительно проходят через перегруз и фильтры усилителя; гитары — через резонанс кабинета. Пауэр-аккорды складываются из записанных струн; семплы установки не заменяются синусами или белым шумом.

Гитарные исходники с именами `e3` и `a3` в этой библиотеке соответствуют MIDI 40 (E2, ~82,4 Гц) и 45 (A2, 110 Гц); басовый `e2` — MIDI 28 (E1, ~41,2 Гц). Привязка проверена по исходной SFZ-карте и используется при транспонировании.
