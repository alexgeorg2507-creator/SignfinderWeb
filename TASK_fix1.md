# TASK Fix-1 — полная версия

## Методология
- Агент деплоит через CI/CD (push → test авто)
- Перед prod написать: "Fix-1 на тесте стабильно. Запрашиваю деплой на прод."
- Ждать явного "деплой" от владельца

---

## Fix-1.1 — Bug: ключ DeepSeek (РЕШЕНО владельцем)
Ключ обновлён в Secret Manager на prod и test. Cloud Run передеплоен.
Агенту: убедиться что `cloudbuild-test.yaml` содержит `DEEPSEEK_API_KEY=deepseek-api-key:latest`
в `--set-secrets`. Если нет — добавить.

---

## Fix-1.2 — Лимит страниц 3 → 10 + поддержка DOC/DOCX

### signfinder-api: `app/routers/me.py`

1. Изменить константу:
```python
_MAX_DOC_PAGES = 10  # было 3
```

2. Обновить сообщение об ошибке в `_check_doc()`:
```python
detail=f"Слишком много страниц ({n}). Лимит кабинета: {_MAX_DOC_PAGES} страниц.",
```

3. Добавить поддержку DOC/DOCX в `me_analyze()` и `me_sign()`:
- Принимать `.doc`, `.docx` помимо `.pdf`
- Конвертировать DOCX → PDF через `mammoth` (HTML) + `weasyprint` (PDF):
  ```python
  import mammoth, weasyprint
  html = mammoth.convert_to_html(docx_stream).value
  pdf_bytes = weasyprint.HTML(string=html).write_pdf()
  ```
- Добавить зависимости в `pyproject.toml`: `mammoth>=1.6`, `weasyprint>=62`
- В `_check_doc()` добавить проверку MIME: принимать `application/pdf`,
  `application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
  `application/msword`
- После конвертации — дальше обычный пайплайн (тот же `_check_doc`, `sf.analyze`, `sf.sign`)
- Возвращать подписанный PDF независимо от типа входного файла

### SignfinderWeb: `app/index.html`

Найти текст `до 3 страниц` → заменить на `до 10 страниц`.
Найти `accept=".pdf"` в `work-file` input → заменить на `accept=".pdf,.doc,.docx"`.
Найти hint → `PDF, DOC, DOCX · до 5 МБ · до 10 страниц`.

---

## Fix-1.3 — Убрать версию из topbar

### SignfinderWeb: `app/index.html`

1. Удалить из topbar:
```html
<span id="app-version-badge" style="..."></span>
```

2. Удалить JS строки:
```javascript
const _vBadge = document.getElementById('app-version-badge');
if (_vBadge) _vBadge.textContent = 'v' + _sfVersion;
```

Версия остаётся только в `profile-version-footer` (футер страницы Профиль).

---

## Fix-1.4 — PDF превью в правой панели

### SignfinderWeb: `app/index.html`

#### Макет work-таба

Текущий work-таб — одна колонка. Нужно разбить на две:

```
┌─────────────────────────┬─────────────────────────┐
│  Левая колонка          │  Правая колонка          │
│  (существующий контент) │  (PDF preview)           │
│  - счётчик              │                          │
│  - загрузка файла       │  [PDF viewer]            │
│  - результат анализа    │  Страница N из M         │
│  - кнопка подписать     │  < >  навигация          │
└─────────────────────────┴─────────────────────────┘
```

На мобильном (< 768px) — стек: левая сверху, превью снизу.

CSS:
```css
.work-layout { display: grid; grid-template-columns: 1fr 380px; gap: 1.5rem; }
@media (max-width: 900px) { .work-layout { grid-template-columns: 1fr; } }
.pdf-preview-panel { background: var(--c-surface); border: 1px solid var(--c-border);
  border-radius: 14px; overflow: hidden; min-height: 480px;
  display: flex; flex-direction: column; }
.pdf-preview-toolbar { padding: 0.5rem 1rem; font-size: 12px; color: var(--c-muted);
  border-bottom: 1px solid var(--c-border); display: flex;
  align-items: center; justify-content: space-between; }
.pdf-preview-iframe { flex: 1; border: none; width: 100%; min-height: 440px; }
.pdf-preview-empty { flex: 1; display: flex; align-items: center; justify-content: center;
  color: var(--c-muted); font-size: 13px; padding: 2rem; text-align: center; }
```

TABS.work template — обернуть в `.work-layout`:
```html
<div class="work-layout">
  <div><!-- существующий контент левой колонки --></div>
  <div class="pdf-preview-panel" id="pdf-preview-panel">
    <div class="pdf-preview-toolbar" id="pdf-preview-toolbar" style="display:none">
      <span id="pdf-preview-label">Предпросмотр</span>
      <span id="pdf-preview-pages"></span>
    </div>
    <iframe class="pdf-preview-iframe" id="pdf-preview-iframe"
      style="display:none"></iframe>
    <div class="pdf-preview-empty" id="pdf-preview-empty">
      📄 Здесь появится<br>предпросмотр документа
    </div>
  </div>
</div>
```

#### JavaScript — функция showPdfPreview

```javascript
function showPdfPreview(pdfBlob, pageNumber, label) {
  const iframe = document.getElementById('pdf-preview-iframe');
  const empty  = document.getElementById('pdf-preview-empty');
  const toolbar = document.getElementById('pdf-preview-toolbar');
  const lbl    = document.getElementById('pdf-preview-label');
  const pages  = document.getElementById('pdf-preview-pages');
  if (!iframe) return;

  // Revoke previous blob URL
  if (iframe._blobUrl) URL.revokeObjectURL(iframe._blobUrl);

  const url = URL.createObjectURL(pdfBlob);
  iframe._blobUrl = url;
  // Open on specific page using PDF fragment identifier
  iframe.src = url + (pageNumber > 1 ? '#page=' + pageNumber : '');
  iframe.style.display = 'block';
  empty.style.display = 'none';
  toolbar.style.display = 'flex';
  lbl.textContent = label || 'Предпросмотр';
}
```

#### Вызовы showPdfPreview

**После получения файла (в `handleWorkFile`, до `apiFetch analyze`):**
```javascript
// Показать оригинал сразу после выбора файла
showPdfPreview(file, 1, 'Исходный документ');
```
Но `file` это File объект (не Blob) — использовать напрямую:
```javascript
iframe.src = URL.createObjectURL(file) + '#page=1';
```

**После успешного `workSign` (после получения blob):**
```javascript
// Определить первую страницу с подписью из anchors
const firstSignedPage = _workAnchors.length > 0
  ? (parseInt(_workAnchors[0].page_hint || '0') + 1)  // page_hint 0-indexed
  : 1;
showPdfPreview(blob, firstSignedPage, 'Подписанный документ');
```

**При сбросе (кнопка "загрузить другой"):**
```javascript
const iframe = document.getElementById('pdf-preview-iframe');
if (iframe) {
  if (iframe._blobUrl) URL.revokeObjectURL(iframe._blobUrl);
  iframe.src = '';
  iframe.style.display = 'none';
}
document.getElementById('pdf-preview-empty').style.display = 'flex';
document.getElementById('pdf-preview-toolbar').style.display = 'none';
```

---

## Definition of Done Fix-1

- [ ] `cloudbuild-test.yaml` содержит все 3 секрета в `--set-secrets`
- [ ] `_MAX_DOC_PAGES = 10` в me.py
- [ ] DOCX принимается и конвертируется в PDF на бэкенде
- [ ] Hint в UI: "PDF, DOC, DOCX · до 5 МБ · до 10 страниц"
- [ ] Версия убрана из topbar, осталась только в футере профиля
- [ ] Правая панель с PDF превью отображается в work-табе
- [ ] После выбора файла — превью исходного PDF справа
- [ ] После подписания — превью подписанного PDF, открывается на первой странице с подписью
- [ ] На мобильном — стек (не grid)
- [ ] CI зелёный на test
- [ ] Запросить деплой на прод у владельца

## Что НЕ делать

- Не трогать `Dockerfile` без крайней необходимости
- Не менять схему БД
- Не деплоить на прод без подтверждения владельца
- Не ломать существующие 18 тестов
