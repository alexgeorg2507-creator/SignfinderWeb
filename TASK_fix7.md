# TASK Fix-7 — Шаблоны (запомнить/забыть), ручная простановка, удаление по странице

## Принцип — maximum reuse, не новый функционал

Вся матч-логика, фингерпринтинг и хранение шаблонов уже написаны и
работают в `signfinder-core` (см. ниже). Задача — подключить это к
кабинету, НЕ писать альтернативную версию матчинга, свой fingerprint или
свою логику наложения PNG-подписи на PDF. Если в процессе покажется,
что готового не хватает для какой-то части — остановиться и спросить, не
додумывать самостоятельно.

**Генуинно новое в этой задаче — только:**
- тонкий tenant-scoping прокси над storage (Phase A.1) — потому что core не
  был рассчитан на мульти-тенантность
- два тонких API-эндпоинта, которые просто зовут существующие core-функции
- UI ручной простановки (drag/resize) — этого реально нет нигде, но это
  только презентационный слой — координаты уходят в тот же самый
  механизм простановки подписи, что и для LLM-anchors

## Методология
- Затрагивает `signfinder-api`, `signfinder-core` (возможно), `SignfinderLand`
- Push → test авто (для api и web раздельно)
- Перед prod: "Fix-7 стабильно на тесте. Запрашиваю деплой на прод."
- Порядок обязателен: сначала Phase A и B (бэкенд), потом Phase C (фронт) —
  фронту нужны реальные эндпоинты, не заглушки

---

## Контекст — что уже есть, не переизобретать

В `signfinder-core/signfinder/templates/` **уже реализована** полноценная
система матчинга шаблонов:
- `models.py` — `DocumentTemplate`, `MatchResult`, `MatcherResult`
- `matcher.py` — `find_matching_templates(doc, language, storage, our_synonyms, fingerprint, config)`
  → возвращает `MatcherResult` с `traffic_light: "green"|"yellow"`, `best_match`
- `storage.py` — `save_template`, `load_template`, `list_templates`, `delete_template`,
  `new_template(language, anchors, fingerprint, synonyms_used, created_by)`,
  `update_usage_stats`
- `signfinder/fingerprint/` — `compute_fingerprint(doc, language)`

**Проблема:** всё это работает через `storage: StorageBackend`, который
пишет в единый плоский префикс `templates/` в GCS-бакете **без разделения
по тенантам**. Легаси-роутер `signfinder-api/app/routers/templates.py`
(`/v1/templates/*`, auth через `ApiKeyDep`) использует это как есть —
**не трогать этот роутер**, он для внутреннего пайплайна, не для кабинета.

Для кабинета (`/v1/me/*`, Firebase JWT, tenant-scoped) нужна изоляция по
`tenant_id` — БЕЗ изменения core. Способ: обернуть `sf.storage` в
tenant-namespaced прокси-класс перед передачей в `find_matching_templates`/
`save_template`/etc.

---

## Phase A — Backend: tenant-scoped template storage + wiring в analyze

### A.1 — TenantScopedStorage wrapper

Прочитать `signfinder-core/signfinder/storage/base.py` — узнать точный
интерфейс `StorageBackend` (методы вроде `read_json`, `write_json`,
`read_bytes`, `write_bytes`, `list_prefix`, `delete`, `exists`).

Создать в `signfinder-api/app/` (например `app/tenant_storage.py`) класс,
реализующий тот же интерфейс, который принимает `(inner_storage, tenant_id)`
и префиксует **все** пути вида `templates/...` → `me/{tenant_id}/templates/...`
перед делегированием в `inner_storage`. Остальные пути (не templates)
можно пропускать без изменений, если storage используется где-то ещё —
но для этой задачи он нужен только для template-функций.

Не менять `signfinder-core` вообще, если получается обойтись прокси на
уровне API.

### A.2 — Расширить `/v1/me/analyze`

Прочитать текущую реализацию `/v1/me/analyze` в `app/routers/me.py` —
эта задача расширяет её, не переписывает.

Добавить перед вызовом LLM:
1. Вычислить `fingerprint` документа (`compute_fingerprint` из
   `signfinder.fingerprint`, если ещё не вычисляется в пайплайне)
2. Вызвать `find_matching_templates(doc, language, storage=tenant_storage, ...)`
   с tenant-scoped storage из A.1
3. Если `result.traffic_light == "green"` — использовать
   `result.best_match` anchors вместо вызова LLM. Пометить в usage_stats
   через `update_usage_stats(tenant_storage, template_id, "applied")`
4. Если жёлтый/нет совпадений — существующий путь через LLM как сейчас

Ответ `/v1/me/analyze` дополнить полями:
```json
{
  "from_template": true,
  "template_id": "abc123",
  "template_name": "Договор аренды с ООО Ромашка ru (08.06.2026)",
  "fingerprint": {...},
  "synonyms_used": {...}
}
```
`fingerprint` и `synonyms_used` возвращать **всегда** (даже при LLM-пути) —
понадобятся для Phase A.3 без повторной загрузки файла.

### A.3 — Новые эндпоинты: remember / forget

`POST /v1/me/templates/remember`
```json
// body
{ "fingerprint": {...}, "anchors": [...], "language": "ru", "synonyms_used": {...} }
// response
{ "template_id": "...", "name": "..." }
```
Реализация: `new_template(...)` + `save_template(tenant_storage, tpl)`.
Файл повторно не загружается — все данные уже есть у фронта из ответа analyze.

`DELETE /v1/me/templates/{template_id}`
Реализация: `delete_template(tenant_storage, template_id)`. Так как storage
tenant-scoped через префикс — чужой template_id физически не найдётся
(естественная изоляция), 404 если не найден.

Оба — под Firebase JWT (как остальные `/v1/me/*`), НЕ под `ApiKeyDep`.

---

## Phase B — Backend: ручная простановка + удаление по странице

Прочитать текущую реализацию `/v1/me/sign` перед изменением.

### B.1 — Расширить `/v1/me/sign`

Добавить опциональные поля в запрос:
```json
{
  "manual_anchors": [
    { "page": 3, "x": 150, "y": 600, "width": 110, "height": 44 }
  ],
  "exclude_pages": [2]
}
```
- `manual_anchors` — координаты в points PDF-страницы (не пиксели canvas —
  преобразование на фронте, см. Phase C.3). Слить с anchors от LLM/шаблона
  перед вызовом функции простановки подписи (той же, что уже используется
  для обычных anchors — искать в `signfinder-core` функцию simм. `sign`/
  `stamp` пайплайна, переиспользовать, не дублировать логику наложения PNG).
- `exclude_pages` — страницы, anchors на которых нужно исключить перед
  простановкой (для "удалить подпись на текущей странице" — фронт присылает
  номер страницы, бэкенд просто не проставляет туда подпись).

Если и `manual_anchors`, и обычные (LLM/шаблон) anchors одновременно —
складывать оба списка, `exclude_pages` применяется к обычным anchors
(ручные, размещённые явно, не исключаются автоматически).

---

## Phase C — Frontend (SignfinderLand/app/index.html)

### C.1 — Убрать подсказку-строку, поднять контент

Удалить:
```html
<div class="section-sub" style="margin-bottom:1rem">
  Загрузите документ (PDF, DOCX) — найдём места подписания и проставим вашу подпись
</div>
```
Убрать/уменьшить верхний отступ левой колонки соответственно.

### C.2 — Тулбар: иконки вместо текста

Заменить кнопки "Скачать" / "Поделиться" на иконки с `title`
(нативный tooltip на hover) — например через inline SVG или простые
unicode-глифы, единый стиль. Добавить три новые кнопки в том же ряду:

| Иконка | title | Поведение |
|--------|-------|-----------|
| bookmark | "Запомнить шаблон" / "Забыть шаблон" (меняется) | Toggle, см. C.4 |
| pencil/plus | "Поставить подпись вручную" | Toggle режима, см. C.5 |
| eraser | "Удалить подпись на текущей странице" | См. C.6 |

### C.3 — Координаты canvas → PDF points

В существующем PDF.js рендере (Fix-6) уже есть `scale` для каждой
страницы. Формула перевода клика/рамки в canvas-координатах в PDF
points: `pdf_x = canvas_x / scale`, `pdf_y = pageHeight - (canvas_y / scale)`
(PDF Y растёт снизу вверх, canvas — сверху вниз). Написать хелпер-функцию
`canvasToPdfCoords(canvasX, canvasY, pageCanvas, pageViewport)`.

### C.4 — Bookmark toggle (запомнить/забыть)

После успешного `/v1/me/analyze`:
- Если `from_template === true` — кнопка в состоянии "активна" (шаблон уже
  запомнен), клик → `DELETE /v1/me/templates/{template_id}` → состояние
  сбрасывается
- Если `from_template === false` — кнопка неактивна, клик →
  `POST /v1/me/templates/remember` с `fingerprint`/`anchors`/`synonyms_used`
  из ответа analyze → состояние переключается на "активна"

Активное состояние — заливка/цвет иконки (например `var(--c-accent)`),
неактивное — `var(--c-muted)`.

### C.5 — Ручная простановка (клик + drag + resize)

По клику на кнопку — режим "разместить подпись": следующий клик по
видимой странице в превью создаёт draggable/resizable прямоугольник
(overlay `<div>` поверх canvas текущей страницы) с превью PNG подписи
пользователя внутри (взять из `/v1/me/signature`, уже используется в
Профиле). Перетаскивание — через pointerdown/pointermove/pointerup,
resize — через угловой хэндл (см. подход из мокапа этой сессии — простой
кастомный drag без библиотек, PDF.js worker не трогать).

Кнопка подтверждения размещения (или авто-подтверждение при следующем
действии) — конвертирует координаты overlay в PDF points (C.3), добавляет
в массив `_manualAnchors` на фронте, и **немедленно вызывает `/v1/me/sign`
заново** с этим массивом в `manual_anchors`, обновляя превью подписанного
документа.

Можно разместить несколько подписей за сессию — накапливать в
`_manualAnchors`, каждое новое размещение = новый вызов `/v1/me/sign` с
полным текущим списком (не инкрементально на бэкенде, инкрементально
на фронте — бэкенд stateless).

### C.6 — Удалить подпись на текущей странице

"Текущая страница" — определяется через `IntersectionObserver` на
canvas-страницах внутри `pdf-canvas-scroll` (та, что больше всего видна
в viewport прямо сейчас). Хранить `_currentVisiblePage` в переменной,
обновляемой обсёрвером.

По клику на ластик — добавить номер текущей страницы в `_excludePages`
(фронтовый массив) → вызвать `/v1/me/sign` заново с `exclude_pages`.
Если на этой странице была вручную поставленная подпись (не LLM/шаблон) —
удалить её из `_manualAnchors` вместо добавления в `_excludePages`.

### C.7 — Мигание при рендере/пересборке

Не чистить `pdf-canvas-scroll.innerHTML = ''` перед началом нового рендера
(Fix-6 логика) — вместо этого рендерить новый набор canvas-ов в отдельный
detached-фрагмент (`DocumentFragment`) и подменять содержимое контейнера
одним `replaceChildren()` только когда все страницы готовы. Так старое
превью остаётся видимым до появления нового вместо кадра пустоты.

---

## Definition of Done Fix-7

- [ ] `TenantScopedStorage` — templates изолированы по tenant_id, легаси
  `/v1/templates/*` не затронут
- [ ] `/v1/me/analyze` пропускает LLM при зелёном match, возвращает
  `from_template`, `fingerprint`, `synonyms_used`
- [ ] `POST /v1/me/templates/remember`, `DELETE /v1/me/templates/{id}` —
  работают, tenant-изолированы
- [ ] `/v1/me/sign` принимает `manual_anchors` и `exclude_pages`
- [ ] Подсказка-строка убрана, контент поднят
- [ ] Тулбар — иконки с tooltip, без подписей
- [ ] Bookmark toggle работает, реальные запросы, не заглушка
- [ ] Ручная простановка — клик, drag, resize, реальный `/v1/me/sign`
- [ ] Удаление подписи с текущей страницы — IntersectionObserver + реальный запрос
- [ ] Мигание при рендере устранено (`replaceChildren` вместо `innerHTML=''`)
- [ ] CI зелёный на test (оба репо)
- [ ] Запросить деплой на прод

## Что НЕ делать

- Не трогать легаси `/v1/templates/*` роутер и его auth-модель
- Не менять `signfinder-core`, если tenant-изоляция решается прокси на
  уровне API (см. A.1) — если реально не получится без core-изменений,
  остановиться и написать в чат почему, не коммитить в core без обсуждения
- Не персистить сам документ на сервере — только fingerprint/anchors
  (соответствует ADR-002)
- Не деплоить на прод без подтверждения владельца
