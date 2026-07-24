# TASK Fix-2 — UX overhaul: work tab, auto-sign, preview, share

## Методология
- Агент деплоит через CI/CD (push → test авто)
- Перед prod: "Fix-2 на тесте стабильно. Запрашиваю деплой на прод."
- Ждать явного "деплой" от владельца

---

## Контекст

Работаем только в `SignfinderLand/app/index.html`.
Бэкенд не трогаем (Fix-1 уже задеплоен, API работает).

Структура кабинета:
- **Профиль** — ФИО, компания, реквизиты + название/роль в договоре (Fix-1 уже объединил)
- **Подпись** — загрузка и хранение PNG подписи
- **Подписать договор** — загрузка файла → авто-анализ → авто-подписание → превью

---

## Fix-2.1 — Версия: убрать мигание

**Проблема:** при переключении на таб Профиль сначала показывается "Web v1.0.15",
потом после async fetch меняется на "Web v1.0.15 · API v... · Core v...".

**Решение:** кешировать API версию в module-level переменной.

```javascript
// Module-level (рядом с другими let _xxx)
let _cachedVersionStr = null;

function _updateVersionFooter() {
  const footer = document.getElementById("profile-version-footer");
  if (!footer) return;
  const webV = (typeof window.__SF_VERSION__ !== 'undefined') ? window.__SF_VERSION__ : 'dev';
  footer.textContent = _cachedVersionStr
    ? `Web v${webV} · ${_cachedVersionStr}`
    : `Web v${webV}`;
}

// В loadProfile() — заменить блок с apiFetch("/v1/version") на:
_updateVersionFooter();  // показать сразу то что есть
if (!_cachedVersionStr) {
  apiFetch("/v1/version").then(r => r.ok ? r.json() : null).then(d => {
    if (d) {
      const apiVer = d.api_build ? `${d.api_version}.${d.api_build}` : (d.api_version || '?');
      _cachedVersionStr = `API v${apiVer} · Core v${d.signfinder_core_version || '?'}`;
      _updateVersionFooter();
    }
  }).catch(() => {});
}
```

---

## Fix-2.2 — Work tab: убрать заголовок, поменять subtitle

Убрать:
```html
<div class="section-title">Подписать договор</div>
```

Заменить subtitle:
```html
<div class="section-sub" style="margin-bottom:1rem">
  Загрузите документ (PDF, DOCX) — найдём места подписания и проставим вашу подпись
</div>
```

Заменить privacy note:
```
"Документ не сохраняется в облаке. Обрабатывается в памяти и удаляется сразу после окончания сессии"
```

---

## Fix-2.3 — Авто-подписание при загрузке документа

**Новая логика `handleWorkFile()`:**

```
1. Загрузить файл
2. Показать превью (PDF → iframe, DOC/DOCX → mammoth.js HTML в iframe)
3. Проверить готовность:
   - GET /v1/me/profile → есть pt-name (название в договоре)?
   - GET /v1/me/signature → 200 или 404?
4. Spinner: "Анализируем документ..."
5. POST /v1/me/analyze → получить anchors
6. Если anchors.length > 0 И подпись загружена (sig_ready=true):
   - Spinner: "Подписываем..."
   - POST /v1/me/sign → получить signed PDF blob
   - Показать signed PDF в превью (открыть на первой странице с подписью)
   - Показать toolbar с кнопками: скачать, поделиться
   - loadWorkUsage()
7. Если anchors.length > 0 И подпись НЕ загружена (sig_ready=false):
   - Оставить в превью оригинал
   - Показать инфо-блок: "✏️ Найдено N мест для подписи. Подпись не загружена —
     перейдите в раздел Подпись для загрузки."
8. Если anchors.length == 0:
   - Показать: "Мест для подписи не найдено."
9. При ошибке /analyze или /sign — показать текст ошибки, не крашиться
```

**Убрать:**
- Кнопку "Подписать и скачать" (не нужна в новом флоу)
- Блок `work-result-card` с отдельными кнопками действий

**Оставить:**
- Счётчик документов (work-usage)
- Spinner с текстом
- Инфо-блок с результатом анализа (стороны, найдено/не найдено)
- Превью справа

---

## Fix-2.4 — DOC/DOCX превью через mammoth.js

Подключить в `<head>` (перед закрывающим `</head>`):
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"></script>
```

В `handleWorkFile()`, для DOC/DOCX файлов (не PDF):
```javascript
async function showDocxPreview(file) {
  const arrayBuffer = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
  const styledHtml = `<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <style>
      body { font-family: -apple-system, 'Segoe UI', sans-serif;
             font-size: 14px; line-height: 1.6; padding: 1.5rem;
             color: #1a1a18; max-width: 100%; }
      p { margin: 0 0 0.75rem; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 1rem; }
      td, th { border: 1px solid #ccc; padding: 4px 8px; }
    </style>
    </head><body>${html}</body></html>`;
  const blob = new Blob([styledHtml], { type: 'text/html' });
  showPdfPreview(blob, 1, 'Предпросмотр документа');
}
```

Вызывать в `handleWorkFile()`:
```javascript
const isDocx = /\.(doc|docx)$/i.test(file.name);
if (isDocx) {
  await showDocxPreview(file);
} else {
  showPdfPreview(file, 1, 'Исходный документ');
}
```

---

## Fix-2.5 — Превью: toolbar с действиями

После успешного подписания — показать toolbar над превью (или под ним):

```html
<div id="pdf-preview-toolbar">
  <span id="pdf-preview-label">Подписанный документ</span>
  <div class="preview-actions">
    <button onclick="downloadSignedPdf()" title="Скачать">⬇️ Скачать</button>
    <button onclick="shareSignedPdf()" title="Поделиться" id="btn-share">↗️ Поделиться</button>
  </div>
</div>
```

CSS:
```css
.preview-actions { display: flex; gap: 0.5rem; }
.preview-actions button {
  font-size: 12px; padding: 0.3rem 0.65rem;
  border: 1px solid var(--c-border); border-radius: 8px;
  background: var(--c-surface); cursor: pointer; font-family: inherit;
  color: var(--c-text); transition: background .15s;
}
.preview-actions button:hover { background: var(--c-bg); }
```

**JavaScript:**
```javascript
let _signedBlob = null;
let _signedFilename = null;

function downloadSignedPdf() {
  if (!_signedBlob) return;
  const url = URL.createObjectURL(_signedBlob);
  const a = document.createElement('a');
  a.href = url; a.download = _signedFilename || 'signed.pdf';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function shareSignedPdf() {
  if (!_signedBlob) return;
  const file = new File([_signedBlob], _signedFilename || 'signed.pdf',
                        { type: 'application/pdf' });
  // Web Share API — opens native share sheet (mobile: TG, WA, email, etc.)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: _signedFilename });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // user cancelled
    }
  }
  // Desktop fallback: just download
  downloadSignedPdf();
}
```

**После успешного /sign:**
```javascript
_signedBlob = blob;
_signedFilename = 'signed_' + (_workFile?.name || 'document.pdf').replace(/\.[^.]+$/, '') + '.pdf';
// показать toolbar
document.getElementById('pdf-preview-toolbar').style.display = 'flex';
document.getElementById('pdf-preview-label').textContent = 'Подписанный документ';
```

Кнопка "Поделиться" — скрыть если `!navigator.canShare` (десктоп без Web Share API):
```javascript
const btnShare = document.getElementById('btn-share');
if (btnShare && !(navigator.canShare)) {
  btnShare.style.display = 'none';
}
```

---

## Fix-2.6 — Превью: размер и layout

Превью должно занимать примерно половину экрана по высоте на 15" ноуте.

```css
/* Work layout */
.work-layout {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(0, 1fr);
  gap: 1.5rem;
  align-items: start;
}

/* Preview panel */
.pdf-preview-panel {
  position: sticky;
  top: 1rem;
  height: calc(100vh - 80px);  /* 80px = topbar height + padding */
  min-height: 480px;
  max-height: 900px;
}

.pdf-preview-iframe {
  flex: 1;
  border: none;
  width: 100%;
  height: 100%;
}

@media (max-width: 900px) {
  .work-layout { grid-template-columns: 1fr; }
  .pdf-preview-panel { position: static; height: 60vw; min-height: 300px; }
}
```

---

## Fix-2.7 — main-content.wide

Work таб использует `.main-content.wide` (max-width: 900px).
Увеличить до `max-width: none` или `max-width: 1100px` для work таба,
чтобы превью получило достаточно места.

```javascript
mainEl.classList.toggle("wide", tab === "work");
```

В CSS:
```css
.main-content.wide { max-width: 1100px; }
```

---

## Definition of Done Fix-2

- [ ] Версия не мигает при переключении на Профиль (кешируется)
- [ ] Заголовок "Подписать договор" убран с таба, subtitle обновлён
- [ ] Privacy note обновлён
- [ ] DOC/DOCX показывает HTML превью через mammoth.js сразу после загрузки
- [ ] PDF показывает превью сразу после загрузки
- [ ] Авто-анализ + авто-подписание при загрузке (если профиль и подпись готовы)
- [ ] Если подпись не загружена — показать места подписи + сообщение "Подпись не загружена"
- [ ] Если мест нет — "Мест для подписи не найдено"
- [ ] Toolbar с Download + Share после подписания
- [ ] Web Share API на мобиле, Download fallback на десктопе
- [ ] Превью занимает полную высоту viewport - topbar (sticky)
- [ ] На мобиле — стек, превью 60vw высотой
- [ ] CI зелёный на test
- [ ] Запросить деплой на прод

## Что НЕ делать

- Не трогать бэкенд (`signfinder-api`)
- Не трогать Dockerfile, тесты, cloudbuild-*.yaml
- Не деплоить на прод без подтверждения владельца
- Не добавлять новые зависимости кроме mammoth.js CDN
