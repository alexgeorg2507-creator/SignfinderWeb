# TASK: Fix-16 — canvas-подпись не рисуется (0×0 при инициализации)

> Срочно, блокирует ручное QA (`TASK_deal_cycle_E7.md` §3) целиком — нельзя
> протестировать путь «Нарисовать» ни мышью, ни пальцем, пока не починено.

## Причина

`sign/index.html`, `setupCanvas()`:

```js
function setupCanvas() {
  const canvas = el('sign-canvas');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();   // ← вызывается пока вкладка скрыта
  canvas.width = rect.width * dpr;                // ← 0, т.к. rect.width === 0
  canvas.height = rect.height * dpr;               // ← 0
  ...
```

Вызывается из `wireSigningForm()` сразу при рендере формы — в этот момент
активна вкладка «📷 Фото» (`_activeTab = 'camera'` по умолчанию), вкладка
«✏️ Нарисовать» имеет `display:none` (класс `.tab-panel` без `.active`).
У элемента с `display:none` `getBoundingClientRect()` всегда возвращает
нулевые размеры — canvas получает битмап `0×0` пикселей раз и навсегда.
`switchTab()` дальше только переключает CSS-классы, `setupCanvas()`
повторно не вызывает — размер так и остаётся `0×0` весь остаток сессии.
Pointer-события (`pointerdown`/`pointermove`) при этом отрабатывают
нормально, `ctx.stroke()` вызывается без ошибок — просто рисовать
физически некуда.

## Фикс

Разделить `setupCanvas()` на два шага: развесить обработчики событий
(можно сразу, не зависит от видимости) и замерить/выставить размер
канваса (только когда вкладка реально видима). Второе — лениво, один
раз, по флагу, **не при каждом переключении на вкладку** — иначе любой
повторный заход на «Нарисовать» будет стирать уже нарисованное:

```js
let _canvasInitialized = false;

function sizeCanvas() {
  const canvas = el('sign-canvas');
  if (!canvas || _canvasInitialized) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;  // всё ещё скрыт, выходим
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1a1a18';
  _canvasInitialized = true;
}
```

`setupCanvas()` (переименовать по смыслу, например `wireCanvasEvents()`)
оставляет только навешивание `pointerdown`/`pointermove`/`pointerup`/
`pointerleave`/`pointercancel` — убрать оттуда блок с `rect`/`canvas.width`/
`canvas.height`/`ctx.scale`, он переезжает в `sizeCanvas()` целиком.

В `switchTab()` добавить вызов при переключении на canvas-вкладку:

```js
window.switchTab = (tab) => {
  _activeTab = tab;
  for (const t of ['camera', 'file', 'canvas']) {
    el(`tab-btn-${t}`).classList.toggle('active', t === tab);
    el(`tab-${t}`).classList.toggle('active', t === tab);
  }
  if (tab === 'canvas') sizeCanvas();
};
```

`wireSigningForm()` продолжает звать `wireCanvasEvents()` (бывший
`setupCanvas`) как раньше — просто без части с размерами.

## Проверка

Открыть `/sign/{token}` → сразу кликнуть «✏️ Нарисовать» (не заходя на
другие вкладки) → провести мышью по канвасу → линия должна появиться.
Переключиться на «📁 Файл» и обратно на «✏️ Нарисовать» → нарисованное
не должно стереться. Отдельно проверить на телефоне пальцем — это тот
же баг, должен чиниться той же правкой.

## DoD

- [ ] Мышь на десктопе — рисует
- [ ] Палец на реальном телефоне — рисует (часть ручного QA §3, можно
  сразу закрыть этот пункт заодно)
- [ ] Переключение вкладок туда-обратно не стирает уже нарисованное
- [ ] `SignfinderWeb` — бампнуть `version.txt` (это фронтенд-only фикс)
