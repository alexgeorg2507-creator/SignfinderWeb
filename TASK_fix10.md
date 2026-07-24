# TASK Fix-10 — Remember/forget: полные якоря + диагностика неприменения

## Методология
- `SignfinderLand/app/index.html` (подтверждённый баг) + возможно `signfinder-api`
  (по итогам диагностики)
- Push → test авто. Перед prod: "Fix-10 стабильно на тесте. Запрашиваю деплой."

---

## Fix-10.1 — ПОДТВЕРЖДЁНО КОДОМ: remember не сохраняет ручные подписи и exclude_pages

**Файл:** `SignfinderLand/app/index.html`, функция `toggleRememberTemplate()`.

**Текущий баг:**
```javascript
const body = {
  fingerprint: fp,
  anchors: _workAnchors || [],   // BUG: только LLM/шаблонные якоря
  language: fp.language || 'ru',
  synonyms_used: (_workAnalyzeResult && _workAnalyzeResult.synonyms_used) || {},
};
```

`_manualAnchors` (ручные простановки) и `_excludePages` (удалённые пользователем
страницы) полностью игнорируются при формировании тела запроса. Пользователь
жмёт «Запомнить» после того как удалил подпись со страницы и поставил свою
вручную — а сервер сохраняет исходные, нетронутые anchors.

**Исправление:** перед отправкой remember — построить итоговый список anchors
так же, как это делает `workSign()` перед вызовом `/v1/me/sign`: исходные
`_workAnchors`, отфильтрованные по `_excludePages` (та же функция
`_anchorSurvivesExclude`, уже существует в файле), плюс `_manualAnchors`.

```javascript
window.toggleRememberTemplate = async function() {
  if (!_workAnalyzeResult) return;
  const btn = document.getElementById('btn-remember');
  if (btn) btn.disabled = true;
  try {
    if (_rememberedTemplateId) {
      // forget — без изменений
      ...
    } else {
      const fp = (_workAnalyzeResult && _workAnalyzeResult.fingerprint) || {};
      // Fix-10.1: merge surviving auto-anchors + manual placements — same
      // set that workSign() actually stamps, not the raw LLM/template output.
      const survivingAuto = (_workAnchors || []).filter(_anchorSurvivesExclude);
      const manualAsAnchors = _manualAnchors.map(m => ({
        id: `manual_${m.page}_${Math.round(m.x)}_${Math.round(m.y)}`,
        anchor_level: 1,
        anchor_text: '',
        position: 'manual_exact',
        generated_pattern: '',
        bbox: [m.x, m.y, m.x + m.width, m.y + m.height],
        added_by: 'manual',
        page_hint: String(m.page - 1),  // template anchors are 0-indexed page_hint
      }));
      const body = {
        fingerprint: fp,
        anchors: [...survivingAuto, ...manualAsAnchors],
        language: fp.language || 'ru',
        synonyms_used: (_workAnalyzeResult && _workAnalyzeResult.synonyms_used) || {},
      };
      const res = await apiFetch('/v1/me/templates/remember', { method: 'POST', body: JSON.stringify(body) });
      ...
    }
  } ...
};
```

Сверить точный формат `bbox`/`position: 'manual_exact'` с тем, как backend
`/v1/me/sign` обрабатывает `manual_anchors_json` (`app/routers/me.py`,
`TextAnchor` построение) — чтобы сохранённый через remember якорь потом
применялся так же, как применяется live ручная подпись. Если формат не
совпадает — привести к общему.

---

## Fix-10.2 — ДИАГНОСТИКА: свежий документ не матчится даже без ручных правок

**Симптом (владелец подтвердил отдельно от 10.1):** загрузка документа →
«Запомнить шаблон» → повторная загрузка ТОГО ЖЕ файла БЕЗ каких-либо ручных
правок → всё равно идёт через LLM заново, `from_template` не приходит `true`.

**Первый шаг — не чинить, а посмотреть готовую диагностику.** Она уже в коде
(`_tenant_template_match`, Fix-9 B.1): `templates_listed_count`,
`templates_traffic_light`, `templates_listed_languages`, `best_match_score_details`.

На test:
1. Загрузить `1Договор_Лебедев_А_П_.docx`, дождаться анализа, нажать
   «Запомнить шаблон» (без ручных правок)
2. DevTools → Network → **новый** запрос `/v1/me/analyze` для повторной
   загрузки того же файла
3. Скопировать **весь** JSON-ответ, включая `pipeline_debug` — там теперь
   лежат все поля из Fix-9 B.1

**Дальнейшие действия определяются содержимым `pipeline_debug`:**
- `templates_listed_count: 0` → шаблон физически не сохранился ИЛИ
  сохранился по другому pref��ксу. Проверить в GCS напрямую (bucket console
  или `gsutil ls`) — есть ли файл `me/{uid}/templates/{id}.json`
- `templates_listed_count: 1`, но `templates_traffic_light: "yellow"` или
  `"red"` → шаблон найден, но score матчера ниже порога green. Смотреть
  `best_match_score_details.score_breakdown` — какой конкретно компонент
  (page_count / header_simhash / chars_per_page / synonyms) не совпал
- `templates_listed_count: 1`, `traffic_light: "green"`, но `from_template`
  всё равно `false` в корне ответа → баг в `me_analyze()` между вызовом
  `_tenant_template_match` и формированием ответа (маловероятно по коду,
  но проверить)

Прислать конкретный найденный кейс — тогда точечный фикс, не гадание.

---

## Definition of Done Fix-10
- [ ] Remember отправляет merged anchors (LLM/шаблон minus excluded + manual)
- [ ] Формат manual anchor в remember совместим с форматом в sign
- [ ] Диагностика 10.2 проведена, найдена конкретная причина непримен��ния
- [ ] Причина устранена точечно (без гадания)
- [ ] Реальный тест: загрузка → remember → повторная загрузка того же файла
      без правок → `from_template: true`, зелёный, LLM не вызывается
- [ ] Реальный тест: та же схема, но с ручной правкой перед remember →
      повторная загрузка воспроизводит ручную правку
- [ ] CI зелёный, запросить деплой на прод

## Что НЕ делать
- Не переписывать матчер/fingerprint без данных из 10.2
- Не деплоить на прод без подтверждения
