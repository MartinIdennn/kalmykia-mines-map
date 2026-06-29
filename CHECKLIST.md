# Чек-лист задачи

> Общая «доска» команды агентов. Все агенты читают её, оркестратор обновляет статусы.
> Статусы: `[ ]` — ждёт, `[~]` — в работе, `[x]` — готово (принято ревьюером), `[!]` — заблокировано/провалено.

## Задача
Сайт-карта рудников Калмыкии: интерактивная карта (Leaflet + OpenStreetMap) с метками рудников.
По клику на рудник — описание, галерея фото, смета (на что тратятся деньги), сбор донатов (заглушка,
без реальных платежей) и список донатеров, обновляемый вживую. Данные — через бэкенд + БД.

**Уровень:** MVP-прототип. Донаты — мок (без реальных денег), но сохраняются в БД и донатеры видны live.
**Стек:** фронт — vanilla HTML/JS + Leaflet; бэкенд — Node.js + Express + SQLite (better-sqlite3).

## API-контракт (общий для бэкенда и фронта)
- `GET /api/mines` → `[{ id, name, lat, lng, short, raised, goal }]`
- `GET /api/mines/:id` → `{ id, name, lat, lng, description, photos:[url], budget:[{item, amount}], goal, raised, donors:[{name, amount, at}] }`
- `POST /api/mines/:id/donate` body `{ name, amount }` → `{ ok, raised, donor:{name, amount, at} }` (мок: просто пишет в БД)
- Статика фронта раздаётся тем же сервером из `public/`.

## БД (SQLite)
- `mines(id, name, lat, lng, short, description, goal)`
- `photos(id, mine_id, url)`
- `budget_items(id, mine_id, item, amount)`
- `donations(id, mine_id, name, amount, created_at)`  // raised = SUM(amount)
- Сид: 3–4 реальных рудника/месторождения Калмыкии с координатами, описанием, сметой, демо-донатерами.

## Пункты

- [x] T1. Каркас проекта: package.json, структура (server/, public/, data/), .gitignore — kind: code — owner: implementer
- [x] T2. Бэкенд: Express-сервер, схема SQLite, сид-данные рудников Калмыкии — kind: code — owner: implementer
- [x] T3. Бэкенд: API-эндпоинты по контракту (mines, mine, donate) + раздача статики — kind: code — owner: implementer
- [x] T4. Фронт: index.html + Leaflet-карта Калмыкии с метками рудников из /api/mines — kind: code — owner: implementer
- [x] T5. Фронт: панель рудника — описание, галерея фото, смета, форма доната, live-список донатеров — kind: code — owner: implementer
- [x] T6. Стили (styles.css): адаптивная вёрстка карты и панели — kind: code — owner: implementer
- [x] T7. Smoke-тесты API (mines/mine/donate) — kind: test — owner: tester
- [x] T8. README: установка и запуск (npm i && npm start) — kind: docs — owner: implementer

## Журнал
- Оркестратор: разбил задачу на T1–T8, зафиксировал API-контракт на доске.
- implementer #1: T1–T3 (бэкенд) — Express+SQLite, 4 рудника Калмыкии, API по контракту, curl-проверки PASS.
- implementer #2: T4–T6 (фронт) — Leaflet-карта, панель, смета, донаты без перезагрузки, live-донатеры.
- tester: T7 — интеграционный smoke-тест, 6/6 групп PASS, сверка полей фронт↔бэк сошлась (`at`/`created_at` ок).
- reviewer: принял T1–T6 как done; 3 некритичных замечания (таймзона, экранирование попапа, порядок демо-донатеров).
- Оркестратор: исправил таймзону (парсинг UTC) и экранирование попапа (escapeHtml) в app.js; написал README (T8); финальный smoke после правок PASS (донат 20000→23000).
- Все пункты закрыты. Осталась 1 косметика (порядок демо-донатеров в сиде) — задокументирована в README как known limitation.
