# TASK Fix-6 — PDF.js rendering (Вариант A)

## Методология
- Только `SignfinderLand/app/index.html`
- Push → test авто
- Перед prod: "Fix-6 стабильно на тесте. Запрашиваю деплой на прод."

---

## Цель

Убрать встроенный браузерный PDF-плагин (`<iframe>` с тёмным тулбаром/полями).
PDF рендерится через PDF.js в `<canvas>` — полный контроль над фоном, отступами,
масштабом. DOCX-превью (через mammoth.js) не трогаем — оно уже выглядит правильно,
эталон стиля для PDF тоже.

Заменяем **оба** места использования iframe: превью исходного PDF при выборе файла
И превью подписанного PDF после `/v1/me/sign`.

---

## Fix-6.1 — Подключить PDF.js

В `<head>`, рядом с mammoth.js:
```html
<script type="module">
  import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs';
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
  window._pdfjsLib = pdfjsLib;
</script>
```
(модульный импорт кладёт lib в `window._pdfjsLib`, доступен из обычных `<script>` ниже
после загрузки — обернуть вызовы в проверку `if (window._pdfjsLib)`).

---

## Fix-6.2 — Заменить iframe на canvas-контейнер

В HTML превью-панели (`pdf-preview-panel`) заменить:
```html
<!-- УДАЛИТЬ -->
<iframe class="pdf-preview-iframe" id="pdf-preview-iframe" style="display:none"></iframe>
```
на:
```html
<div class="pdf-canvas-scroll" id="pdf-canvas-scroll" style="display:none"></div>
```

CSS:
```css
.pdf-canvas-scroll {
  flex: 1;
  overflow-y: auto;
  background: #f0f0ee;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.pdf-canvas-page {
  background: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.12);
  max-width: 100%;
}
```

---

## Fix-6.3 — Функция рендера

Заменить текущую `showPdfPreview(pdfBlob, pageNumber, label)` на PDF.js версию.
Сохранить ту же сигнатуру и те же вызовы (не менять call sites без необходимости).

```javascript
let _currentRenderToken = 0;

async function showPdfPreview(pdfBlobOrFile, pageNumber, label) {
  const scrollEl = document.getElementById('pdf-canvas-scroll');
  const empty    = document.getElementById('pdf-preview-empty');
  const toolbar  = document.getElementById('pdf-preview-toolbar');
  const lbl      = document.getElementById('pdf-preview-label');
  const pagesLbl = document.getElementById('pdf-preview-pages');
  if (!scrollEl) return;

  const myToken = ++_currentRenderToken;  // race-condition guard

  if (!window._pdfjsLib) {
    // Fallback: если PDF.js не загрузился — старое поведение через iframe
    _fallbackIframePreview(pdfBlobOrFile, pageNumber, label);
    return;
  }

  scrollEl.innerHTML = '';
  scrollEl.style.display = 'flex';
  empty.style.display = 'none';
  toolbar.style.display = 'flex';
  lbl.textContent = label || 'Предпросмотр';

  const arrayBuffer = await pdfBlobOrFile.arrayBuffer();
  if (myToken !== _currentRenderToken) return;  // superseded by newer call

  const pdf = await window._pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  if (myToken !== _currentRenderToken) return;

  pagesLbl.textContent = `${pdf.numPages} стр.`;

  const containerWidth = scrollEl.clientWidth - 32;  // minus padding
  const dpr = window.devicePixelRatio || 1;
  let targetPageEl = null;

  for (let i = 1; i <= pdf.numPages; i++) {
    if (myToken !== _currentRenderToken) return;
    const page = await pdf.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(containerWidth / baseViewport.width, 1.6);
    const viewport = page.getViewport({ scale: scale * dpr });

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-canvas-page';
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = (viewport.width / dpr) + 'px';
    canvas.style.height = (viewport.height / dpr) + 'px';
    canvas.dataset.pageNum = i;

    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    scrollEl.appendChild(canvas);

    if (i === pageNumber) targetPageEl = canvas;
  }

  if (targetPageEl) {
    requestAnimationFrame(() => {
      targetPageEl.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  }
}

function _fallbackIframePreview(pdfBlobOrFile, pageNumber, label) {
  // Старая реализация через iframe — оставить как резервный вариант
  // на случай если pdf.js CDN недоступен
  const scrollEl = document.getElementById('pdf-canvas-scroll');
  const toolbar  = document.getElementById('pdf-preview-toolbar');
  const empty    = document.getElementById('pdf-preview-empty');
  const url = URL.createObjectURL(pdfBlobOrFile);
  scrollEl.innerHTML = `<iframe src="${url}${pageNumber>1?'#page='+pageNumber:''}"
    style="width:100%;height:100%;border:none;flex:1"></iframe>`;
  scrollEl.style.display = 'flex';
  empty.style.display = 'none';
  toolbar.style.display = 'flex';
}
```

---

## Fix-6.4 — Сброс состояния при очистке (кнопка "загрузить другой")

Обновить код сброса превью — теперь чистим `pdf-canvas-scroll` вместо iframe:
```javascript
const scrollEl = document.getElementById('pdf-canvas-scroll');
if (scrollEl) { scrollEl.innerHTML = ''; scrollEl.style.display = 'none'; }
document.getElementById('pdf-preview-empty').style.display = 'flex';
document.getElementById('pdf-preview-toolbar').style.display = 'none';
_currentRenderToken++;  // отменить текущий рендер если он ещё идёт
```

---

## Fix-6.5 — DOCX-превью не трогать

`showDocxPreview()` (mammoth.js → HTML → iframe) остаётся как есть — это не PDF,
браузерный PDF-плагин там ни при чём, текущий рендер уже выглядит правильно
(см. Fix-5, скрин 1 — эталон).

---

## Проверка после реализации

1. Загрузить PDF на 3+ страницы — превью должно показать белые страницы на
   светло-сером фоне, без тёмных полос, без браузерного PDF-тулбара
2. Подписать — превью подписанного документа должно выглядеть **идентично** по
   стилю превью до подписания, открыться на странице с первой подписью
3. Прокрутка внутри `pdf-canvas-scroll` — не должна скроллить всю страницу
   (см. Fix-4.2, оверфлоу должен быть локальным)
4. DOCX — рендерится как раньше, без изменений
5. Скачать/Поделиться — работают как раньше (используют `_signedBlob`, не canvas)

---

## Definition of Done Fix-6

- [ ] PDF.js подключён через CDN
- [ ] PDF рендерится в canvas, не в iframe
- [ ] Стиль превью PDF идентичен стилю превью DOCX (белый фон, нормальный масштаб)
- [ ] Открытие на нужной странице работает (scrollIntoView)
- [ ] Fallback на iframe если CDN недоступен
- [ ] Сброс состояния корректно очищает canvas-контейнер
- [ ] Race condition при быстрой смене файлов не ломает рендер (token guard)
- [ ] CI зелёный на test
- [ ] Запросить деплой на прод

## Что НЕ делать

- Не трогать бэкенд
- Не трогать DOCX-рендер (mammoth.js)
- Не добавлять интерактивную постраничную навигацию (кнопки next/prev) — пока
  достаточно непрерывного скролла, это следующая итерация при необходимости
- Не деплоить на прод без подтверждения
