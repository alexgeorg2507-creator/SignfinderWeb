# TASK Fix-5 — Profile UX + autosave + layout after signing

## Методология
- Изменения в двух местах: `SignfinderLand/app/index.html` + `signfinder-api/app/routers/me.py`
- Push signfinder-api → CI/CD деплоит test авто
- Push SignfinderWeb → CI/CD деплоит test авто
- Перед prod: "Fix-5 стабильно на тесте. Запрашиваю деплой на прод."

---

## Fix-5.1 — Тексты в профиле

В `TABS.profile`:

```
subtitle: "Ваши данные, по которым я ищу место подписи"

placeholder ФИО:     "ФИО подписанта для поиска подписи"
placeholder Компания: "Именование компании в договоре (для юрлиц)"
```

---

## Fix-5.2 — Убрать кнопку Сохранить, автосохранение по blur

Удалить из `TABS.profile`:
```html
<button class="btn btn-primary" onclick="saveProfile()">Сохранить</button>
```

Добавить инфо-строку вместо кнопки:
```html
<div class="hint" style="margin-top:0.25rem">Данные сохраняются автоматически</div>
```

В `loadProfile()` в конце добавить:
```javascript
_initProfileAutosave();
```

Новая функция:
```javascript
function _initProfileAutosave() {
  ['pf-name', 'pf-company'].forEach(id => {
    const el = document.getElementById(id);
    if (!el || el._autosaveAttached) return;
    el._autosaveAttached = true;
    el.addEventListener('blur', () => saveProfile());
  });
}
```

`saveProfile()` — убрать PostHog capture или оставить, по усмотрению.
При успехе: `showTabMsg("profile-msg", "Сохранено", "success")` — всплывает и гаснет.

---

## Fix-5.3 — Лимит документов: 10 → 100

Файл: `signfinder-api/app/routers/me.py`

```python
_MONTHLY_LIMIT = 100  # было 10
```

---

## Fix-5.4 — Layout после подписания = layout при анализе

**Проблема:** при показе подписанного PDF через `<iframe>` браузер использует встроенный
PDF viewer с тёмным тулбаром и тёмными полями. Пользователь видит скрин 3 вместо скрин 2.

**Решение A (попробовать первым):** добавить к blob URL фрагмент `#toolbar=0&navpanes=0`:
```javascript
iframe.src = url + '#toolbar=0&navpanes=0' + (pageNumber > 1 ? '&page=' + pageNumber : '');
```
Работает в Safari и некоторых версиях Chrome. Если не помогает — см. B.

**Решение B:** использовать PDF.js из CDN для рендера подписанного PDF.
Добавить в `<head>`:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs" type="module"></script>
```
Это тяжелее — реализовать только если A не сработал. В этом случае создать
`<canvas>` вместо `<iframe>` и рендерить страницы через `pdfjsLib`.

**В любом случае:** после подписания сохранить grid layout (`300px 1fr`),
левая колонка показывает результат анализа и счётчик, правая — подписанный документ.
Кнопки Скачать/Поделиться — в toolbar над превью.
Не растягивать превью на весь экран.

---

## Definition of Done Fix-5

- [ ] Subtitle профиля: "Ваши данные, по которым я ищу место подписи"
- [ ] Placeholder ФИО и Компания обновлены
- [ ] Кнопка Сохранить убрана, стоит hint "Данные сохраняются автоматически"
- [ ] Автосохранение по blur работает (ушёл из поля → сохранилось)
- [ ] `_MONTHLY_LIMIT = 100` в me.py, задеплоено на test
- [ ] После подписания: grid layout сохранён, тёмные поля PDF viewer минимизированы
- [ ] CI зелёный на test (оба репо)
- [ ] Запросить деплой на прод

## Что НЕ делать

- Не менять схему БД
- Не трогать Dockerfile без крайней необходимости
- Не деплоить на прод без подтверждения
