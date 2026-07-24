# TASK Fix-4 — Layout, persistence, profile cleanup

## Методология
- Только `SignfinderLand/app/index.html`
- Push → test авто
- Перед prod: "Fix-4 стабильно на тесте. Запрашиваю деплой на прод."

---

## Fix-4.1 — Убрать поле Реквизиты из профиля

В `TABS.profile` удалить:
```html
<textarea class="input" id="pf-req" rows="3" placeholder="Реквизиты (ИНН, адрес, ...)" style="resize:vertical"></textarea>
```

В `saveProfile()` убрать `requisites` из body:
```javascript
// БЫЛО:
const body = { full_name: ..., company: ..., requisites: ... };
// СТАЛО:
const body = { full_name: ..., company: ..., requisites: "" };
```
(Пустая строка — чтобы не ломать существующий API-контракт.)

В `loadProfile()` убрать строку:
```javascript
if (r) r.value = data.requisites || "";
```

---

## Fix-4.2 — Нет скролла страницы на work-табе, превью вписывается в viewport

Цель: при открытии work-таба браузер не должен давать вертикальный скролл страницы.
Левая колонка скроллируется внутри себя если контент не влезает.
Превью занимает всю оставшуюся высоту.

### CSS изменения:

```css
/* main-content в wide-режиме (work таб) */
.main-content.wide {
  max-width: none;
  padding: 1rem 1.5rem;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 56px);  /* 56px = topbar */
}

/* work layout занимает всю высоту */
.work-layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 1.5rem;
  align-items: start;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* левая колонка — скролл внутри */
.work-left-col {
  overflow-y: auto;
  height: 100%;
  padding-right: 4px;
}

/* превью — 100% высоты контейнера */
.pdf-preview-panel {
  background: #fff;
  border: 1px solid var(--c-border);
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* убрать sticky и фиксированную высоту — не нужны */
/* (были: position:sticky, height:calc(100vh-90px)) */

@media (max-width: 900px) {
  .main-content.wide {
    height: auto;
    overflow: visible;
  }
  .work-layout {
    grid-template-columns: 1fr;
    overflow: visible;
  }
  .work-left-col { height: auto; overflow: visible; }
  .pdf-preview-panel { height: 60vw; min-height: 300px; }
}
```

### HTML изменения в `TABS.work`:

Обернуть левую колонку в `<div class="work-left-col">...</div>`:

```html
<div class="work-layout">
  <div class="work-left-col">
    <!-- весь существующий контент левой части (usage, privacy-note, upload-card, spinner, result-card) -->
  </div>
  <div class="pdf-preview-panel" id="pdf-preview-panel">
    <!-- превью как есть -->
  </div>
</div>
```

---

## Fix-4.3 — Документ не сбрасывается при переключении вкладок

Текущая проблема: `showTab()` делает `_workFile = null; _workAnchors = null; _signedBlob = null;` при каждом вызове. Документ теряется при переходе в Профиль и обратно.

### Изменение в `showTab()`:

```javascript
window.showTab = (tab) => {
  // Сбрасываем только состояние обработки подписи
  _processedSigB64 = null;
  // НЕ сбрасываем _workFile, _workAnchors, _signedBlob — они живут всю сессию

  document.querySelectorAll(".nav-item, .mobile-nav-item")
    .forEach(el => el.classList.remove("active"));
  const navEl = document.getElementById("nav-" + tab);
  const mnavEl = document.getElementById("mnav-" + tab);
  if (navEl) navEl.classList.add("active");
  if (mnavEl) mnavEl.classList.add("active");

  const mainEl = document.getElementById("main-content");
  mainEl.innerHTML = TABS[tab] || "";
  mainEl.classList.toggle("wide", tab === "work");

  if (tab === "profile")   { loadProfile(); initSignatureTab(); }
  if (tab === "signature") { initSignatureTab(); }
  if (tab === "party")     { loadParty(); }
  if (tab === "work")      { initWorkTab(); }
};
```

### Восстановление состояния при возврате на work-таб:

В конце `initWorkTab()`, после регистрации событий, добавить восстановление:

```javascript
// Restore document state if returning to work tab
if (_signedBlob) {
  const firstSignedPage = (_workAnchors && _workAnchors.length > 0)
    ? (parseInt(_workAnchors[0].page_hint || "0", 10) + 1)
    : 1;
  showPdfPreview(_signedBlob, firstSignedPage, "Подписанный документ");
  const actionsEl = document.getElementById("preview-actions");
  if (actionsEl) {
    actionsEl.style.display = "flex";
    const btnShare = document.getElementById("btn-share");
    if (btnShare && !navigator.canShare) btnShare.style.display = "none";
  }
  if (_workAnchors) {
    document.getElementById("work-result-card").style.display = "block";
    renderAnalysisResult({ traffic_light: "green", anchors: _workAnchors, matches: [] });
  }
} else if (_workFile) {
  // File was loaded but signing not done yet — restore original preview
  const isDocx = /\.(doc|docx)$/i.test(_workFile.name);
  if (isDocx) {
    showDocxPreview(_workFile);
  } else {
    showPdfPreview(_workFile, 1, "Исходный документ");
  }
  if (_workAnchors) {
    document.getElementById("work-result-card").style.display = "block";
    renderAnalysisResult({ traffic_light: "yellow", anchors: _workAnchors, matches: [] });
  }
}
```

---

## Fix-4.4 — Поля ввода: убрать цветные рамки по умолчанию

Если агент видит оранжевые/красные рамки вокруг полей ввода в профиле —
проверить нет ли CSS правила добавляющего `border-color` не через `:focus`.
Ожидаемое поведение: граница `var(--c-border)` (#e4e4e0) в покое,
`var(--c-accent)` (#2563eb) только при фокусе.

```css
.input {
  border: 1px solid var(--c-border);
  /* нет других border-color правил вне :focus */
}
.input:focus { border-color: var(--c-accent); }
```

Если `capture="environment"` на file input добавляет нативную оранжевую рамку —
убедиться что `display:none` установлен на input (он скрыт за label).

---

## Definition of Done Fix-4

- [ ] Поле "Реквизиты" убрано из Профиля
- [ ] Work-таб не вызывает скролл страницы браузера на десктопе 15"
- [ ] Превью вписывается в оставшуюся высоту viewport
- [ ] Левая колонка скроллируется внутри при большом результате анализа
- [ ] Переключение Профиль ↔ Подписать договор не сбрасывает документ
- [ ] При возврате на work-таб показывается предыдущий результат
- [ ] Поля ввода без лишних цветных рамок
- [ ] CI зелёный на test
- [ ] Запросить деплой на прод

## Что НЕ делать

- Не трогать бэкенд
- Не деплоить на прод без подтверждения
