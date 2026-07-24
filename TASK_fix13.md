# TASK Fix-13 — Упростить блок результата анализа: "Наша сторона" вместо traffic light

## Методология
- Только `SignfinderLand/app/index.html`
- Push → test авто. Перед prod: "Fix-13 стабильно на тесте. Запрашиваю деплой."

---

## Контекст

Сейчас в `work-result-card` после анализа показывается:
```
⚠️ Найдено с низкой уверенностью
Стороны в документе:
· Лебедев Алексей Петрович  1 место
Мест для подписи: 1
```

`traffic_light`/"уверенность" — внутренняя dev-метрика, клиенту сервиса она
не нужна и не должна быть видна. Источник результата (свежий анализ или
применённый шаблон) уже показывается в шапке превью отдельно (Fix-11).

**Новый вид, только это и ничего больше:**
```
Наша сторона: Лебедев Алексей Петрович, алиас: Клиент
Мест для подписи: 1
```

Если синонимов несколько (`roles` содержит больше одного) — показывать
**только первый**, остальные не выводить.

---

## Fix-13.1 — HTML: заменить traffic-light + список сторон

В `TABS.work`, внутри `#work-result-card`, заменить:
```html
<div id="work-traffic-light"></div>
<div id="work-parties"></div>
```
на:
```html
<div id="work-our-side"></div>
```

---

## Fix-13.2 — JS: переписать `renderAnalysisResult`

Заменить блоки traffic-light и parties на один блок "Наша сторона". Источник
данных — `result.our_side` (поля `signer`, `legal_entity`, `roles`), с
fallback на `result.synonyms_used` (та же форма полей) если `our_side` пуст —
это бывает, когда анализ пошёл через применённый шаблон.

```javascript
function renderAnalysisResult(result) {
  const card = document.getElementById("work-result-card");
  if (!card) return;
  card.style.display = "block";

  // Fix-13: "Наша сторона" вместо traffic light + полного списка сторон —
  // confidence/traffic_light внутренняя dev-метрика, источник (свежий
  // анализ/шаблон) уже виден в шапке превью (Fix-11).
  const sideEl = document.getElementById("work-our-side");
  const ourSide = result.our_side || {};
  const synonyms = result.synonyms_used || {};
  const displayName = ourSide.signer || ourSide.legal_entity
    || synonyms.signer || synonyms.legal_entity || '';
  const roles = (ourSide.roles && ourSide.roles.length) ? ourSide.roles : (synonyms.roles || []);
  const alias = roles.length ? roles[0] : '';

  if (sideEl) {
    sideEl.innerHTML = displayName
      ? `<div style="font-size:14px;margin-bottom:0.4rem">
           Наша сторона: <strong>${displayName}</strong>${alias ? `, алиас: <strong>${alias}</strong>` : ''}
         </div>`
      : `<div style="font-size:14px;color:var(--c-muted);margin-bottom:0.4rem">Сторона не распознана</div>`;
  }

  const n = _workAnchors.length;
  document.getElementById("work-anchor-info").textContent =
    n > 0 ? `Мест для подписи: ${n}` : "Мест для подписи не найдено.";

  const signArea = document.getElementById("work-sign-area");
  if (n === 0) {
    signArea.innerHTML = `<p style="font-size:13px;color:var(--c-muted)">Попробуйте другой документ или шаблон подписи.</p>`;
  } else {
    signArea.innerHTML = '';
  }

  if (result.error) showWorkMsg(result.error, "info");
}
```

Функцию `_truncateFilename`/иконки/тулбар не трогать — только это тело
функции. CSS-классы `.traffic-pill*`/`.party-row`/`.party-badge` можно
оставить неиспользуемыми в файле (не обязательно вычищать) — минимизируем
диф.

---

## Fix-13.3 — ПОДТВЕРЖДЁННЫЙ БАГ: восстановление при переключении вкладок

В `initWorkTab()` сейчас при возврате на вкладку "Подписать договор" (после
захода в Профиль и обратно) вызывается:

```javascript
renderAnalysisResult({ traffic_light: "green", anchors: _workAnchors, matches: [] });
// и
renderAnalysisResult({ traffic_light: "yellow", anchors: _workAnchors, matches: [] });
```

Это синтетический объект без `our_side`/`synonyms_used` — после Fix-13.2 блок
"Наша сторона" в этом случае покажет "Сторона не распознана", даже если
анализ реально был и сторона была найдена. Заменить оба места на:

```javascript
renderAnalysisResult(_workAnalyzeResult || { anchors: _workAnchors });
```

(`_workAnalyzeResult` — полный сохранённый ответ `/v1/me/analyze`, уже
существует в состоянии, используется в `_buildPreviewLabel` рядом).

---

## Definition of Done Fix-13

- [ ] Блок анализа показывает только "Наша сторона: ИМЯ, алиас: РОЛЬ" +
      "Мест для подписи: N" — никакого traffic light / "уверенности"
- [ ] Если ролей несколько — показан только первый алиас
- [ ] Если сторона не распознана — аккуратное сообщение, не пустое место
- [ ] Восстановление при переключении вкладок показывает реальные
      our_side/synonyms_used, не заглушку
- [ ] CI зелёный на test
- [ ] Запросить деплой на прод

## Что НЕ делать
- Не трогать бэкенд — все нужные поля уже есть в ответе analyze
- Не убирать индикатор источника из шапки превью (Fix-11) — он остаётся,
  это другой, уже решённый вопрос
- Не деплоить на прод без подтверждения
