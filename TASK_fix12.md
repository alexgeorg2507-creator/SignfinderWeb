# TASK Fix-12 — Текстовая привязка для ручных якорей (manual_click)

## Методология
- `signfinder-api` (новый лёгкий эндпоинт) + `signfinder-core` (apply-логика)
  + `SignfinderLand` (фронт зовёт новый эндпоинт при подтверждении клика)
- Push → test авто. Перед prod: "Fix-12 стабильно на тесте. Запрашиваю деплой."

---

## Принцип — сохраняем текст + смещение, не просто текст

**Наивный вариант (НЕ делать):** сохранить ближайший текст, при повторном
применении ставить подпись прямо на найденный текст. Проблема: пользователь
обычно кликает РЯДОМ с текстом (например, правее слова "Заказчик"), не поверх
него — если просто сесть на найденный текст, подпись визуально уедет со своего
места даже когда текст никуда не двигался.

**Правильный вариант:** при сохранении — запомнить (а) ближайший текст-ориентир
и (б) смещение (dx, dy в pt) от угла этого текста до угла bbox, куда реально
поставил пользователь. При повторном применении — найти текст заново на новой
странице, и наложить то же смещение от его новой позиции.

Если текст не находится вообще (документ радикально другой) — откат на старое
поведение: абсолютный bbox как есть (то, что уже работает сейчас).

---

## Fix-12.1 — Backend: новый эндпоинт "определить якорь для точки клика"

**Файл:** `signfinder-api/app/routers/me.py`

```python
class ManualAnchorProbeOut(BaseModel):
    anchor_text: str
    anchor_bbox: list[float] | None  # [x0,y0,x1,y1] pt, найденного текста-ориентира
    offset_dx: float                  # смещение от anchor_bbox.x0 до placed bbox.x
    offset_dy: float                  # смещение от anchor_bbox.y0 до placed bbox.y

@router.post("/me/manual-anchor/probe", response_model=ManualAnchorProbeOut)
async def probe_manual_anchor(
    user: UserDep,
    file: UploadFile = File(...),
    page: int = Form(...),          # 1-indexed
    x: float = Form(...),
    y: float = Form(...),
    width: float = Form(...),
    height: float = Form(...),
) -> Any:
    """Найти ближайший текст-ориентир для точки, куда пользователь поставил
    подпись вручную, и вернуть смещение placed-bbox относительно него.

    Вызывается один раз при подтверждении клика (кнопка ✓ в UI) — до того как
    точка попадёт в _manualAnchors. Не имеет побочных эффектов, файл не
    сохраняется (тот же принцип что /me/signature/process).
    """
    raw = await file.read()
    filename = file.filename or "document.pdf"
    pdf_bytes = _convert_to_pdf_if_needed(raw, filename, file.content_type)

    import fitz
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        page_idx = page - 1
        if page_idx < 0 or page_idx >= len(doc):
            raise HTTPException(status_code=422, detail="Неверный номер страницы")
        pdf_page = doc[page_idx]

        # Искать ближайшее "слово" (текстовый блок) в радиусе — сначала узкий,
        # расширяем если пусто. Использовать get_text("words") — даёт bbox на слово.
        words = pdf_page.get_text("words")  # [(x0,y0,x1,y1,text,...), ...]
        click_cx, click_cy = x + width / 2, y + height / 2

        def _dist(w):
            wx0, wy0, wx1, wy1 = w[0], w[1], w[2], w[3]
            wcx, wcy = (wx0 + wx1) / 2, (wy0 + wy1) / 2
            return ((wcx - click_cx) ** 2 + (wcy - click_cy) ** 2) ** 0.5

        # Радиус поиска — 150pt, дальше считаем что рядом ничего значимого нет
        nearby = [w for w in words if _dist(w) <= 150 and len(w[4].strip()) >= 2]
        if not nearby:
            return ManualAnchorProbeOut(
                anchor_text="", anchor_bbox=None, offset_dx=0.0, offset_dy=0.0,
            )

        nearest = min(nearby, key=_dist)
        nx0, ny0 = nearest[0], nearest[1]
        return ManualAnchorProbeOut(
            anchor_text=nearest[4],
            anchor_bbox=[nearest[0], nearest[1], nearest[2], nearest[3]],
            offset_dx=x - nx0,
            offset_dy=y - ny0,
        )
    finally:
        doc.close()
```

Сверить сигнатуру `page.get_text("words")` с реальной версией PyMuPDF в
проекте — формат кортежа может отличаться по номеру версии, проверить перед
использованием индексов.

---

## Fix-12.2 — Frontend: вызвать probe при подтверждении клика

**Файл:** `SignfinderLand/app/index.html`, функция `_confirmPlacer()`.

После вычисления `topLeftPdf` (уже есть, через `canvasToPdfCoords`) — перед
`_manualAnchors.push(...)` добавить вызов probe:

```javascript
async function _confirmPlacer() {
  if (!_activePlacer) return;
  const { el, wrap, canvas } = _activePlacer;
  const left = parseFloat(el.style.left);
  const top = parseFloat(el.style.top);
  const w = parseFloat(el.style.width);
  const h = parseFloat(el.style.height);
  const scale = canvas._pdfScale || 1;
  const topLeftPdf = canvasToPdfCoords(left, top, canvas);
  const pageNum = parseInt(wrap.dataset.pageNum, 10);
  const widthPt = w / scale, heightPt = h / scale;

  // Fix-12: определить текст-ориентир и смещение для устойчивой повторной
  // простановки через шаблон (переживает небольшой реflow документа)
  let anchorProbe = { anchor_text: '', anchor_bbox: null, offset_dx: 0, offset_dy: 0 };
  try {
    const fd = new FormData();
    fd.append('file', _workFile);
    fd.append('page', pageNum);
    fd.append('x', topLeftPdf.x);
    fd.append('y', topLeftPdf.y);
    fd.append('width', widthPt);
    fd.append('height', heightPt);
    const res = await apiFetch('/v1/me/manual-anchor/probe', { method: 'POST', body: fd });
    if (res.ok) anchorProbe = await res.json();
  } catch { /* probe необязателен — при неудаче просто нет текстовой привязки */ }

  _manualAnchors.push({
    page: pageNum,
    x: topLeftPdf.x,
    y: topLeftPdf.y,
    width: widthPt,
    height: heightPt,
    anchor_text: anchorProbe.anchor_text || '',
    anchor_bbox: anchorProbe.anchor_bbox || null,
    offset_dx: anchorProbe.offset_dx || 0,
    offset_dy: anchorProbe.offset_dy || 0,
  });

  el.remove();
  _activePlacer = null;
  _manualPlaceMode = false;
  const btn = document.getElementById('btn-manual-place');
  if (btn) btn.classList.remove('active');
  _detachPlacementClickHandlers();

  showWorkSpinner('Подписываем...');
  await workSign();
  hideWorkSpinner();
}
```

**В `toggleRememberTemplate()`** — прокинуть новые поля в `manualAsAnchors`:

```javascript
const manualAsAnchors = _manualAnchors.map(m => ({
  id: `manual_${m.page}_${Math.round(m.x)}_${Math.round(m.y)}`,
  anchor_level: 1,
  anchor_text: m.anchor_text || '',
  position: 'on',
  generated_pattern: '',
  bbox: [m.x, m.y, m.x + m.width, m.y + m.height],
  added_by: 'manual_click',
  page_hint: String(m.page - 1),
  // Fix-12: смещение от текста-ориентира — для устойчивого повторного применения
  context_before: m.anchor_bbox ? JSON.stringify({
    anchor_bbox: m.anchor_bbox, offset_dx: m.offset_dx, offset_dy: m.offset_dy,
  }) : '',
}));
```

Использовать `context_before` как контейнер для этой доп. информации — поле
уже есть в `TextAnchor`, отдельную миграцию схемы делать не нужно. Если
предпочтёте отдельные явные поля в `TextAnchor` — можно, но тогда нужна
проверка обратной совместимости со старыми сохранёнными шаблонами
(`_ANCHOR_DEFAULTS` в `finder.py` уже даёт паттерн как это делать).

---

## Fix-12.3 — Backend apply-логика: искать текст перед откатом на bbox

**Файл:** `signfinder-core/signfinder/anchors/finder.py`,
функция `apply_template_anchors`, ветка `added_by == "manual_click"`.

**Текущий код (только это менять):**
```python
if getattr(anchor, "added_by", "") == "manual_click":
    bbox = anchor.bbox
    fb_page = page_range[0] if page_range else 0
    if (isinstance(bbox, (list, tuple)) and len(bbox) == 4
            and 0 <= fb_page < len(doc.pages)):
        counter += 1
        matches.append(SignMatch(...))
    continue
```

**Заменить на:**
```python
if getattr(anchor, "added_by", "") == "manual_click":
    fb_page = page_range[0] if page_range else 0
    bbox = anchor.bbox
    resolved_bbox = None

    # Fix-12: попробовать найти текст-ориентир на новой странице документа —
    # если найден, применить сохранённое смещение вместо примороженных
    # абсолютных координат. Переживает небольшой реflow (документ чуть другой
    # длины/вёрстки), в отличие от старого поведения.
    probe_data = None
    if anchor.context_before:
        try:
            import json as _json
            probe_data = _json.loads(anchor.context_before)
        except (ValueError, TypeError):
            probe_data = None

    if probe_data and anchor.anchor_text and 0 <= fb_page < len(doc.pages):
        try:
            search_page = pdf_doc[fb_page]
            found = search_page.search_for(anchor.anchor_text)
            if found:
                # Ближайший найденный к исходной позиции текста-ориентира —
                # на случай если слово встречается на странице несколько раз
                orig_bbox = probe_data.get("anchor_bbox")
                if orig_bbox:
                    def _d(r):
                        return ((r.x0 - orig_bbox[0]) ** 2 + (r.y0 - orig_bbox[1]) ** 2) ** 0.5
                    best = min(found, key=_d)
                else:
                    best = found[0]
                dx = probe_data.get("offset_dx", 0.0)
                dy = probe_data.get("offset_dy", 0.0)
                w = bbox[2] - bbox[0] if isinstance(bbox, (list, tuple)) else 100
                h = bbox[3] - bbox[1] if isinstance(bbox, (list, tuple)) else 30
                resolved_bbox = [
                    best.x0 + dx, best.y0 + dy,
                    best.x0 + dx + w, best.y0 + dy + h,
                ]
        except Exception as e:
            sys.stderr.write(f"[finder] manual-anchor text-search failed: {e}\n")

    final_bbox = resolved_bbox or bbox
    if (isinstance(final_bbox, (list, tuple)) and len(final_bbox) == 4
            and 0 <= fb_page < len(doc.pages)):
        counter += 1
        matches.append(SignMatch(
            id=f"tpl_{counter:03d}",
            page=fb_page,
            bbox=tuple(final_bbox),
            context=(anchor.anchor_text or "")[:120],
            party=getattr(template, "name", "template"),
            pattern=pattern_str or "",
            added_by="manual_click",
        ))
        sys.stderr.write(
            f"[finder] manual-anchor {'text-resolved' if resolved_bbox else 'frozen-bbox'} "
            f"page={fb_page} text={repr((anchor.anchor_text or '')[:40])}\n"
        )
    continue
```

---

## Definition of Done Fix-12

- [ ] `/v1/me/manual-anchor/probe` — возвращает текст-ориентир + смещение
- [ ] Frontend вызывает probe при подтверждении ручного клика
- [ ] `context_before` несёт JSON со смещением при сохранении шаблона
- [ ] `apply_template_anchors` сначала пробует текстовый поиск, откатывается
      на bbox только если текст не найден
- [ ] Реальный тест: поставить подпись вручную на документ A → запомнить
      шаблон → загрузить документ B (тот же тип, но текст выше на 1 строку
      длиннее) → подпись должна сдвинуться вместе с текстом-ориентиром, не
      остаться на старом абсолютном месте
- [ ] Обратная совместимость: старые шаблоны без `context_before`
      (сохранённые до Fix-12) продолжают работать через bbox-fallback
- [ ] CI зелёный, запросить деплой на прод

## Что НЕ делать
- Не трогать путь для авто-найденных (regex) якорей — там уже есть
  сопоставимая логика через `context_before`/regex, не нужно объединять
- Не деплоить на прод без подтверждения
