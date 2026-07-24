# TASK Fix-11 — Индикатор источника в шапке превью: имя файла + распознано/шаблон

## Методология
- Только `SignfinderLand/app/index.html`
- Push → test авто. Перед prod: "Fix-11 стабильно на тесте. Запрашиваю деплой."
- Цель — визуальная диагностика без DevTools: сразу видно, LLM нашёл места
  подписи заново или применился ранее запомненный шаблон (и какой).

---

## Контекст

В `pdf-preview-toolbar` уже есть `<span id="pdf-preview-label">`, сейчас туда
подставляется статичный текст (`"Исходный документ"` / `"Подписанный документ"`)
через параметр `label` в `showPdfPreview(pdfBlobOrFile, pageNumber, label)`.

`_workAnalyzeResult` (уже хранится в состоянии) содержит `from_template`,
`template_id`, `template_name` из ответа `/v1/me/analyze` — этого достаточно,
ничего нового с бэкенда не требуется.

---

## Fix-11.1 — Хелперы

Добавить рядом с другими хелпер-функциями:

```javascript
function _truncateFilename(name, maxLen = 30) {
  if (!name) return '';
  if (name.length <= maxLen) return name;
  const extMatch = name.match(/\.[^.]+$/);
  const ext = extMatch ? extMatch[0] : '';
  const base = ext ? name.slice(0, -ext.length) : name;
  const keep = maxLen - ext.length - 1; // -1 под символ "…"
  if (keep <= 0) return name.slice(0, maxLen) + '…';
  return base.slice(0, keep) + '…' + ext;
}

function _buildPreviewLabel(analyzeResult, filename) {
  const fname = _truncateFilename(filename, 30);
  if (analyzeResult && analyzeResult.from_template) {
    const tplName = analyzeResult.template_name
      ? _truncateFilename(analyzeResult.template_name, 24)
      : (analyzeResult.template_id || '').slice(0, 8);
    return `${fname} · Применён шаблон: ${tplName}`;
  }
  if (analyzeResult) {
    return `${fname} · Распознано`;
  }
  return fname;  // до завершения анализа — просто имя файла
}
```

---

## Fix-11.2 — Использовать в местах где сейчас статичные строки

**В `handleWorkFile()`:**

1. Сразу после выбора файла (до результата анализа) — превью показывает
   просто truncated filename, без статуса:
   ```javascript
   // было: showPdfPreview(_workFile, 1, "Исходный документ");
   showPdfPreview(_workFile, 1, _buildPreviewLabel(null, _workFile.name));
   // (аналогично во второй ветке, для DOCX-пути после конвертации)
   ```

2. После получения `result` от `/v1/me/analyze` и установки
   `_workAnalyzeResult = result` — если подписи ещё нет (сигнатура не готова,
   превью остаётся на оригинале) — обновить только текст лейбла без
   пересборки canvas:
   ```javascript
   const lblEl = document.getElementById('pdf-preview-label');
   if (lblEl) lblEl.textContent = _buildPreviewLabel(_workAnalyzeResult, _workFile.name);
   ```

**В `workSign()`, при успешном подписании:**
```javascript
// было: showPdfPreview(blob, _firstSignedPageNum(), "Подписанный документ");
showPdfPreview(blob, _firstSignedPageNum(), _buildPreviewLabel(_workAnalyzeResult, _workFile.name));
```

**В `initWorkTab()`, при восстановлении состояния (переключение вкладок туда-обратно):**
```javascript
// оба места, где сейчас "Подписанный документ" / "Исходный документ" —
// заменить на _buildPreviewLabel(_workAnalyzeResult, _workFile.name)
```

---

## Definition of Done Fix-11

- [ ] Имя файла в шапке превью обрезано до 30 символов (с сохранением
      расширения через "…")
- [ ] После загрузки, до ответа анализа — просто имя файла
- [ ] После свежего LLM-анализа (`from_template: false`) — "{имя} · Распознано"
- [ ] После применения шаблона (`from_template: true`) — "{имя} · Применён
      шаблон: {имя шаблона или id}"
- [ ] Переключение вкладок Профиль↔Договор и обратно — лейбл не сбрасывается
      на дефолтный текст, показывает актуальный статус
- [ ] CI зелёный на test
- [ ] Запросить деплой на прод

## Что НЕ делать
- Не трогать бэкенд — все нужные поля уже есть в ответе analyze
- Не переписывать логику матчинга шаблонов — это отдельная задача, пока
  только делаем её результат видимым
- Не деплоить на прод без подтверждения
