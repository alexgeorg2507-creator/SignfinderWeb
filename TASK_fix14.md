# TASK Fix-14 — Детерминированные reverse-underscore паттерны для роли/юрлица

## Методология
- `signfinder-core` (один файл, зеркалит существующую функцию)
- Push → api подтягивает через `pip install ...@main` при следующем деплое
- Перед prod: "Fix-14 стабильно на тесте. Запрашиваю деплой на прод."

---

## Контекст — что подтверждено сравнением двух реальных прогонов

Один и тот же документ (`1Договор_Лебедев_А_П_.docx`, роль "Заказчик"),
два независимых запуска `/v1/me/analyze`:

- **Прогон A (рабочий, зафиксирован в `debug_fix8_final_patterns.json`)** —
  LLM самостоятельно сгенерировал `_{3,}[^\n]{0,50}Заказчик` — reverse-паттерн
  (линия → роль). Нашёл 5+ футерных подписей.
- **Прогон B (сегодняшний, регрессия)** — LLM такой паттерн НЕ сгенерировал.
  В `final_patterns` есть reverse-underscore только по ФИО подписанта
  (`_{3,}...Лебедев`, `...Алексей`, `...Петрович` — из детерминированной
  `_signer_underscore_patterns`), но ни одного reverse-underscore по роли
  "Заказчик" или юрлицу. `step5_matches_count: 1` вместо ожидаемых 6+.

**Причина:** LLM (`run_step4`) недетерминирован — генерация паттернов не
гарантирует одинаковый набор на одинаковый вход. Прогон A работал благодаря
удаче, не благодаря коду. Fix-8 в своё время починил **нормализацию**
уже сгенерированных reverse-паттернов (не резать `[\s\S]` до `[^\n]`), но
не гарантировал, что такой паттерн вообще будет сгенерирован.

**Существующая частичная страховка** — `_add_reverse_dot_patterns` в
`auto1.py` — детерминированно достраивает reverse-паттерны для точечных линий
(`\.{5,}`) по легал-энтити и ролям, **не завися от LLM**. Аналогичной функции
для подчёркиваний (`_{3,}`) на роль/юрлицо **не существует** — есть только
`_signer_underscore_patterns` (по ФИО подписанта). Ровно это и есть дыра.

---

## Fix-14.1 — Новая функция, зеркалит `_add_reverse_dot_patterns`

**Файл:** `signfinder-core/signfinder/pipeline/auto1.py`

Разместить сразу после `_add_reverse_dot_patterns`:

```python
def _add_reverse_underscore_patterns(
    final_patterns: list,
    our_side,
) -> list:
    """Добавить паттерны _{3,}...X для случаев когда подчёркнутая линия ПЕРЕД
    ролью/названием (типичный футер 'Заказчик_______  Подрядчик________').

    Детерминированная страховка — LLM (run_step4) недетерминирован и не всегда
    сам генерирует reverse-underscore паттерн на роль/юрлицо, даже когда он
    структурно нужен документу. _signer_underscore_patterns уже покрывает ФИО
    подписанта; здесь закрываем роли и юрлицо тем же способом, каким
    _add_reverse_dot_patterns уже закрывает точечные линии. Без этой страховки
    футер-подписи находятся только когда LLM «повезёт» — подтверждено
    сравнением двух реальных прогонов на одном документе (Fix-14 diagnostics).

    Работает для всех документов, не только dual_column — тот же принцип,
    что и у reverse-dot версии.
    """
    if not our_side:
        return final_patterns

    anchors_to_check = []
    le = (our_side.get("legal_entity") or "").strip()
    if le:
        anchors_to_check.append(le[:15])
    for role in (our_side.get("roles") or []):
        r = (role or "").strip()
        if r and len(r) > 3:
            anchors_to_check.append(r)

    extras = []
    for anchor in anchors_to_check:
        try:
            esc = re.escape(anchor)
            p_underscore_nl = rf"_{{3,}}\n[^\n]{{0,20}}{esc}"
            p_underscore_same = rf"_{{3,}}[^\n]{{0,50}}{esc}"
            for p in [p_underscore_nl, p_underscore_same]:
                re.compile(p, re.IGNORECASE | re.UNICODE)
                if p not in final_patterns:
                    extras.append(p)
        except re.error:
            pass

    return final_patterns + extras
```

Окна подобраны по уже подтверждённым рабочим величинам: `{0,50}` для
однострочного варианта — ровно то, что сработало в прогоне A;
`{0,20}` для кросс-строчного — по аналогии с `_signer_underscore_patterns`.

---

## Fix-14.2 — Подключить в пайплайн

**Файл:** тот же `auto1.py`, в `run_pipeline_auto_1`, сразу после существующего
вызова `_add_reverse_dot_patterns`:

**Было:**
```python
    # Обратные паттерны для точечных линий (\.{5,} → название компании)
    # Работает для всех документов, не только dual_column
    final_patterns = _add_reverse_dot_patterns(final_patterns, our_side)
    patterns = final_patterns

    # DocuSign tab-маркеры (\t1\, \e1\) — место подписи без текстовых подчёркиваний
    page_texts_for_tabs = [p.text or "" for p in doc.pages]
    final_patterns = _add_docusign_tab_patterns(final_patterns, our_side, page_texts_for_tabs)
    patterns = final_patterns
```

**Стало:**
```python
    # Обратные паттерны для точечных линий (\.{5,} → название компании)
    # Работает для всех документов, не только dual_column
    final_patterns = _add_reverse_dot_patterns(final_patterns, our_side)
    patterns = final_patterns

    # Fix-14: обратные паттерны для подчёркнутых линий (_{3,} → роль/юрлицо) —
    # детерминированная страховка, не зависит от того, сгенерировал ли LLM
    # такой паттерн сам. См. докстринг _add_reverse_underscore_patterns.
    before_reverse_underscore = len(final_patterns)
    final_patterns = _add_reverse_underscore_patterns(final_patterns, our_side)
    debug["reverse_underscore_patterns_added"] = len(final_patterns) - before_reverse_underscore
    patterns = final_patterns

    # DocuSign tab-маркеры (\t1\, \e1\) — место подписи без текстовых подчёркиваний
    page_texts_for_tabs = [p.text or "" for p in doc.pages]
    final_patterns = _add_docusign_tab_patterns(final_patterns, our_side, page_texts_for_tabs)
    patterns = final_patterns
```

Новое debug-поле `reverse_underscore_patterns_added` — по той же логике, что
и остальные debug-поля этого пайплайна (уже не раз спасали от гадания в этой
сессии) — на будущее, чтобы сразу было видно, сработала ли страховка.

---

## Проверка

На test — тот же документ, `1Договор_Лебедев_А_П_.docx`, роль "Заказчик":
1. Загрузить, посмотреть "Мест для подписи" — ожидание 6+ (было 1 в регрессии)
2. В ответе `/v1/me/analyze` → `pipeline_debug.reverse_underscore_patterns_added`
   должно быть > 0 (страховка сработала) **или** LLM сама сгенерировала
   нужный паттерн (страховка добавила бы 0, но `step5_matches_count` всё
   равно должен быть 6+) — оба исхода нормальны, важен итоговый счётчик
   якорей, не факт срабатывания страховки
3. Прогнать 2-3 раза подряд — раз LLM недетерминирован, именно повторяемость
   результата (не только единичное совпадение) подтверждает что страховка
   реально работает, а не просто повезло снова

Если после этого фикса результат стабильно 6+ на каждом прогоне — считать
подтверждённым. Если всё ещё нестабильно — значит проблема глубже (например,
`_cluster_signature_blocks` или `_drop_marker_only_when_signer_present`
что-то отфильтровывают уже после генерации) — не гадать, смотреть
`pipeline_debug` по шагам (`step5_matches_count` → `our_side_filter` →
`signer_priority_drop` → `clustering`), там всё уже видно.

---

## Definition of Done Fix-14

- [ ] `_add_reverse_underscore_patterns` добавлена, зеркалит dot-версию
- [ ] Подключена в `run_pipeline_auto_1` сразу после reverse-dot вызова
- [ ] Debug-поле `reverse_underscore_patterns_added` пишется
- [ ] 3 прогона подряд на тестовом документе — стабильно 6+ мест подписи
- [ ] CI зелёный
- [ ] Запросить деплой на прод

## Что НЕ делать
- Не трогать `_add_reverse_dot_patterns` — образец, не меняется
- Не трогать `_signer_underscore_patterns` — покрывает ФИО, отдельная зона
  ответственности, не пересекается с этим фиксом
- Не деплоить на прод без подтверждения
