# TASK Fix-3 — Profile consolidation + preview width

## Методология
- Только `SignfinderLand/app/index.html`
- Push → test авто
- Перед prod: "Fix-3 стабильно на тесте. Запрашиваю деплой на прод."

---

## Fix-3.1 — Убрать таб "Подпись", перенести в Профиль

### Sidebar + mobile nav

Удалить nav-signature из sidebar:
```html
<!-- УДАЛИТЬ -->
<div class="nav-item" onclick="showTab('signature')" id="nav-signature">
  <span class="nav-icon">✍️</span> Подпись
</div>
```

Удалить mnav-signature из mobile nav:
```html
<!-- УДАЛИТЬ -->
<div class="mobile-nav-item" onclick="showTab('signature')" id="mnav-signature">
  <span class="mobile-nav-icon">✍️</span>Подпись
</div>
```

### Profile tab — добавить секцию подписи

В `TABS.profile`, после кнопки "Сохранить" и перед `profile-version-footer`,
добавить секцию подписи:

```html
<div style="height:1px;background:var(--c-border);margin:1.25rem 0"></div>
<div style="font-size:15px;font-weight:600;margin-bottom:0.25rem">Подпись</div>
<div style="font-size:13px;color:var(--c-muted);margin-bottom:1rem">
  Будет проставляться на договоры автоматически
</div>
<div id="sig-msg" class="msg"></div>
<div id="sig-current"></div>
<label class="upload-label">
  📷 Загрузить или сфотографировать
  <input type="file" id="sig-file" accept="image/*" capture="environment" style="display:none">
</label>
<div class="hint" style="margin-top:0.5rem">
  На телефоне открывает камеру. На десктопе — выбор файла.<br>
  Подпись на белом листе, хорошее освещение.
</div>
<div id="sig-processing" style="display:none;text-align:center;color:var(--c-muted);font-size:14px;padding:0.5rem 0">
  ⏳ Обработка...
</div>
<div id="sig-preview" style="display:none;margin-top:1rem">
  <div class="sig-grid">
    <div class="sig-col">
      <div class="sig-col-label">Оригинал</div>
      <img id="sig-original" class="sig-img">
    </div>
    <div class="sig-col">
      <div class="sig-col-label">После обработки (прозрачный фон)</div>
      <img id="sig-processed" class="sig-img sig-img-processed">
    </div>
  </div>
  <div id="sig-meta" class="sig-meta"></div>
  <button class="btn btn-primary" onclick="saveSignature()" id="btn-save-sig">
    Сохранить подпись
  </button>
</div>
```

### showTab: добавить initSignatureTab при открытии профиля

```javascript
if (tab === "profile") { loadProfile(); initSignatureTab(); }
// Убрать:
// if (tab === "signature") { initSignatureTab(); }
```

### TABS.signature — оставить объект но не убирать (может использоваться внутри)

Можно оставить `TABS.signature` в объекте как есть — он просто не будет вызываться
из nav. Либо удалить — на усмотрение, главное не сломать `initSignatureTab()`.

---

## Fix-3.2 — Убрать поля pt-name и pt-role из профиля

Удалить из `TABS.profile`:
```html
<!-- УДАЛИТЬ всё это -->
<div style="font-size:12px;...">Название и роль в договоре...</div>
<input class="input" id="pt-name" placeholder="Название в договоре...">
<input class="input" id="pt-role" placeholder="Роль: ПРОДАВЕЦ...">
```

В `loadProfile()` — удалить блок загрузки party:
```javascript
// УДАЛИТЬ:
const rp = await apiFetch("/v1/me/party");
if (rp.ok) { ... }
```

В `saveProfile()` — убрать party из Promise.all, сохранять только профиль:
```javascript
// БЫЛО:
const [res, rp] = await Promise.all([
  apiFetch("/v1/me/profile", {...}),
  apiFetch("/v1/me/party", {...}),
]);
const ok = res.ok && rp.ok;

// СТАЛО:
const res = await apiFetch("/v1/me/profile", { method: "PUT", body: JSON.stringify(body) });
const ok = res.ok;
```

---

## Fix-3.3 — Превью: убрать чёрные поля, увеличить масштаб

Изменить grid layout work-таба — левая панель фиксированная узкая,
правая получает весь остаток:

```css
.work-layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 1.5rem;
  align-items: start;
}
@media (max-width: 900px) {
  .work-layout { grid-template-columns: 1fr; }
}
```

PDF preview panel — убрать внутренний padding и border-radius который создаёт
отступы вокруг iframe, фон белый:

```css
.pdf-preview-panel {
  background: #fff;
  border: 1px solid var(--c-border);
  border-radius: 10px;
  overflow: hidden;
  position: sticky;
  top: 1rem;
  height: calc(100vh - 90px);
  min-height: 500px;
  display: flex;
  flex-direction: column;
}

.pdf-preview-iframe {
  flex: 1;
  border: none;
  width: 100%;
  height: 100%;
  background: #fff;
  display: block;
}
```

Toolbar тонкий, без лишних отступов:
```css
.pdf-preview-toolbar {
  padding: 0.4rem 0.75rem;
  font-size: 12px;
  color: var(--c-muted);
  border-bottom: 1px solid var(--c-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--c-surface);
  flex-shrink: 0;
}
```

---

## Definition of Done Fix-3

- [ ] Таб "Подпись" убран из sidebar и mobile nav
- [ ] Функционал подписи (upload/preview/save) работает в Profile табе
- [ ] Поля pt-name и pt-role удалены из Profile
- [ ] saveProfile сохраняет только /v1/me/profile (не /v1/me/party)
- [ ] PDF превью шире, меньше чёрных полос по бокам
- [ ] CI зелёный на test
- [ ] Запросить деплой на прод

## Что НЕ делать

- Не трогать бэкенд
- Не трогать Dockerfile, тесты, cloudbuild-*.yaml
- Не деплоить на прод без подтверждения
