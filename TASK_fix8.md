# TASK Fix-8 — Позиция подписи + пересечение newline в паттернах + препроцессор DOCX

## Методология
- Затрагивает `signfinder-core` (позиция подписи, нормализация паттернов)
  и `signfinder-api` (препроцессор DOCX перед LibreOffice)
- Push signfinder-core в PyPI/GitHub (main) → signfinder-api Docker rebuild подтянет
- Push signfinder-api → CI/CD деплоит на test авто
- Перед prod: "Fix-8 стабильно на тесте. Запрашиваю деплой на прод."
- Прогнать `debug_fix8_pattern_test.py` **после** Fix-8.B чтобы подтвердить
  что новые паттерны находят футер-подписи

---

## Контекст — что подтверждено экспериментом

Тест `debug_fix8_pattern_test.py` на реальном PDF (`debug_fix8_converted.pdf`,
5 страниц, конвертированный из DOCX через LibreOffice) с реальными
`final_patterns` из `/v1/me/analyze`:

- Продакшн находит **3 матча** (страница 4: подпись Лебедева в реквизитах —
  ok; страница 3: ложный матч на "своей подписью")
- **5 футер-подписей теряются**: паттерн `_{3,}[^\n]{0,50}Заказчик` не пересекает
  `\n` между линией подчёркивания и словом "Заказчик" на следующей строке.
  С multi-line версией `_{3,}[\s\S]{0,50}Заказчик` — **находит все 5 футеров**

Пункты кодера по причинам:
- **Descender подписи overcorrected в v1.20.9**: `min(sig_h * 0.45, 22.0)` = ~18.9pt
  → подпись сидит ниже линии. Надо ~11pt чтобы центр подписи оказался НА линии.
- **`_normalize_sameline` (auto1.py)** — тупая замена `[\s\S]` → `[^\n]` без
  разбора направления паттерна. Убивает reverse-паттерны (`_{3,}...Заказчик`),
  нужные для футеров.
- **`is_reverse and has_multiline: continue` (finder.py)** — исторический
  предохранитель против жадности `.*`. Не найден чем прикрыт тестами, git blame
  пустой. Может остаться как страховка ИЛИ быть удалён — см. Fix-8.B ниже.

---

## Fix-8.A — Descender подписи

**Файл:** `signfinder-core/signfinder/pdf/overlay.py`, строки 94-99

**Текущий код:**
```python
# 45% высоты (кап 22pt) сдвигает ink к baseline подчёркивания.
descender = min(sig_h * 0.45, 22.0)
```

**Заменить на:**
```python
# v1.20.10: descender=0.18*sig_h (кап 8pt) — типичный визуальный descender
# рукописного росчерка. При sig_h=42pt: descender=7.5pt, подпись центром
# садится на линию подчёркивания. v1.20.9 был 0.45 (overcorrection после
# фикса "подпись висит над линией" — уехало в другую крайность).
descender = min(sig_h * 0.18, 8.0)
```

**Проверка после деплоя:** тот же документ `1Договор_Лебедев_А_П_.docx`,
подпись Лебедева на странице 5 (реквизиты) — центр росчерка должен оказаться
**на линии** `________________`, не под ней.

---

## Fix-8.B — Нормализация паттернов с сохранением reverse-направления

**Файл:** `signfinder-core/signfinder/pipeline/auto1.py`, функция
`_normalize_sameline` в `run_pipeline_auto_1` (около строки 826).

**Текущий код:**
```python
def _normalize_sameline(p: str) -> str:
    return p.replace("[\\s\\S]", "[^\\n]").replace("[\\S\\s]", "[^\\n]")
```

Плюс цикл ниже применяет это ко ВСЕМ 15 паттернам без различия.

**Заменить блок на:**
```python
def _is_reverse_pattern(p: str) -> bool:
    """Reverse = линия/точки идут ПЕРЕД именем/ролью.

    В таких паттернах защита от .*-жадности не критична: линия сама по себе
    редкая, и вариант с одним переносом строки (\n\Роль) — типичный
    двухколоночный футер, который мы обязаны находить.
    """
    ps = re.sub(r'^\(\?:', '', p)
    return ps.startswith('_') or ps.startswith('\\.') or ps.startswith('.')

def _normalize_sameline(p: str) -> str:
    """[\\s\\S] → [^\\n] с сохранением ОДНОГО пересечения newline.

    Мотивация: паттерн 'Роль[\\s\\S]{0,50}_{3,}' в оригинале нужен для
    подвалов 'Клиент ________'. Но '[\\s\\S]' в двухколоночном блоке
    'Компания\\n____ ФИО' тянется через перенос и садится на строку
    компании.

    Решение: 'Роль[\\s\\S]{0,N}_{3,}' → 'Роль[^\\n]{0,N//2}\\n?[^\\n]{0,N//2}_{3,}'
    Разрешает ровно ОДИН \\n посередине (для случая когда роль и линия
    на соседних строках), запрещает больше — исключает прыжок в тело
    следующего абзаца.
    """
    def _replace(match):
        # Пытаемся найти квантор {0,N} сразу после [\s\S]/[\S\s]
        n_str = match.group(1)
        try:
            n = int(n_str)
        except (TypeError, ValueError):
            n = 50
        half = max(5, n // 2)
        return f"[^\\n]{{0,{half}}}\\n?[^\\n]{{0,{half}}}"

    # [\s\S]{0,N} → [^\n]{0,N/2}\n?[^\n]{0,N/2}
    p = re.sub(r"\[\\s\\S\]\{0,(\d+)\}", _replace, p)
    p = re.sub(r"\[\\S\\s\]\{0,(\d+)\}", _replace, p)
    # Fallback: голый [\s\S] без квантора → просто [^\n]
    p = p.replace("[\\s\\S]", "[^\\n]").replace("[\\S\\s]", "[^\\n]")
    return p

normalized_llm: list[str] = []
norm_count = 0
for p in patterns:
    # Для reverse-паттернов НЕ нормализуем — сохраняем [\s\S] чтобы
    # ловить футеры вида '___\nЗаказчик'
    if _is_reverse_pattern(p):
        try:
            re.compile(p, re.IGNORECASE | re.UNICODE)
            normalized_llm.append(p)
        except re.error:
            sys.stderr.write(f"[auto1] bad reverse pattern '{p}'\n")
        continue
    # Для forward-паттернов (роль→линия) — умная нормализация с одним \n
    np = _normalize_sameline(p)
    if np != p:
        norm_count += 1
    try:
        re.compile(np, re.IGNORECASE | re.UNICODE)
        normalized_llm.append(np)
    except re.error:
        sys.stderr.write(f"[auto1] bad normalized pattern '{np}'\n")
debug["patterns_crossline_normalized"] = norm_count
```

**Файл:** `signfinder-core/signfinder/anchors/finder.py`, строки 383-398
(функция `find_signatures`).

Блок `if is_reverse and has_multiline: continue` — оставить как есть.
Он теперь снова получит реальные reverse-multiline паттерны (мы их
перестали нормализовывать) и **отфильтрует** их. Это не то что мы хотим.

**Заменить блок:**
```python
for pat in party.get("patterns", []):
    try:
        pat_stripped = re.sub(r'^\(\?:', '', pat)
        is_reverse = (pat_stripped.startswith('_') or
                      pat_stripped.startswith('\\.') or
                      pat_stripped.startswith('.'))
        has_multiline = '\\s\\S' in pat or '\\S\\s' in pat
        if is_reverse and has_multiline:
            continue
        compiled.append((pat, re.compile(pat, re.IGNORECASE | re.UNICODE)))
    except re.error:
        continue
```

**На:**
```python
for pat in party.get("patterns", []):
    # v1.20.10: reverse+multiline паттерны (line→role через \s\S) более НЕ
    # блокируются. Исторический предохранитель против .*-жадности убран,
    # т.к. auto1._normalize_sameline теперь пропускает reverse-паттерны
    # как есть (с оригинальным [\s\S]{0,N} — жадность ограничена квантором),
    # а без них не находятся футер-подписи вида '___\nЗаказчик'.
    try:
        compiled.append((pat, re.compile(pat, re.IGNORECASE | re.UNICODE)))
    except re.error:
        continue
```

**Проверка:** после деплоя запустить `debug_fix8_pattern_test.py` на том же
`debug_fix8_converted.pdf`. Ожидание: количество `[MATCH]` вырастет
с 3 до 8+ (5 футеров × страницы 1-5 = 5 новых матчей минимум).

Плюс визуальная проверка в кабинете: тот же документ — должно найтись
не 1 место подписи, а 6+ (по одной на каждой странице в футере + одна
в реквизитах).

---

## Fix-8.C — Препроцессор DOCX перед LibreOffice

**Файл:** `signfinder-api/app/routers/me.py`, функция `_convert_to_pdf_if_needed`.

Перед вызовом `soffice` пробегаемся по DOCX (это ZIP с XML внутри) и
применяем три XML-замены к `word/footer*.xml`:

1. `<w:ptab .* w:alignment="right" .* />` — заменить на `<w:tab/>` с явной
   правой tab-stop в родительском `<w:pPr>`. LibreOffice не умеет `ptab`
   с правым выравниванием.
2. Атрибуты `w:themeColor="accent2"` вместе с `w:themeShade="7F"` — заменить
   на `w:val="808080"` (серый) без themeShade. LO игнорирует themeShade
   и рендерит чистый accent2 (красный).
3. Атрибуты `w:asciiTheme="minorHAnsi"`, `w:hAnsiTheme="minorHAnsi"` в
   контексте `<w:ftr>` — заменить на явный шрифт `w:ascii="Liberation Serif"`,
   `w:hAnsi="Liberation Serif"` (metric-compatible с Times New Roman,
   входит в базовый набор LibreOffice, гарантированно рендерится).

**Реализация:**

Добавить в `me.py` рядом с `_convert_to_pdf_if_needed`:

```python
def _preprocess_docx_for_libreoffice(docx_bytes: bytes) -> bytes:
    """Preprocess DOCX to work around known LibreOffice rendering issues.

    Three targeted XML rewrites in word/footer*.xml:
      1. <w:ptab align="right"> → <w:tab/> with right tab-stop (LO doesn't
         handle w:ptab right-align correctly, centers text instead)
      2. w:themeColor="accent2" + w:themeShade="7F" → w:val="808080" (LO
         ignores themeShade modifier, renders pure red accent2 instead of
         darkened gray)
      3. w:asciiTheme/w:hAnsiTheme="minorHAnsi" in footers → explicit
         Liberation Serif (metric-compatible with Cambria/Times)

    Returns modified DOCX bytes. If parsing fails — returns input unchanged
    (fail-safe, LibreOffice will render as-is).
    """
    import io
    import re
    import zipfile

    try:
        buf_in = io.BytesIO(docx_bytes)
        buf_out = io.BytesIO()
        with zipfile.ZipFile(buf_in, "r") as zin, \
             zipfile.ZipFile(buf_out, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)
                if item.filename.startswith("word/footer") and item.filename.endswith(".xml"):
                    text = data.decode("utf-8", errors="ignore")

                    # 1. <w:ptab ... w:alignment="right" ... /> → <w:tab/>
                    text = re.sub(
                        r'<w:ptab\b[^/]*w:alignment="right"[^/]*/>',
                        '<w:tab/>',
                        text,
                    )

                    # 2. themeColor="accent2" + themeShade="7F" → val="808080"
                    # Replace both attributes on the same element with a single val
                    text = re.sub(
                        r'w:themeColor="accent2"(\s+w:themeTint="[^"]*")?(\s+w:themeShade="7F")?',
                        'w:val="808080"',
                        text,
                    )

                    # 3. asciiTheme/hAnsiTheme minorHAnsi → explicit Liberation Serif
                    text = re.sub(
                        r'w:asciiTheme="minorHAnsi"',
                        'w:ascii="Liberation Serif"',
                        text,
                    )
                    text = re.sub(
                        r'w:hAnsiTheme="minorHAnsi"',
                        'w:hAnsi="Liberation Serif"',
                        text,
                    )

                    data = text.encode("utf-8")
                zout.writestr(item, data)
        return buf_out.getvalue()
    except (zipfile.BadZipFile, UnicodeDecodeError, Exception) as e:
        logger.warning(f"DOCX preprocessing failed: {e}, using original bytes")
        return docx_bytes
```

Изменить внутри `_convert_to_pdf_if_needed` — сразу после проверки `is_docx`:
```python
if not is_docx:
    return raw

# v1.20.10: precondition DOCX to work around LibreOffice OOXML gaps
raw = _preprocess_docx_for_libreoffice(raw)

with tempfile.TemporaryDirectory(prefix="sf-conv-") as tmpdir:
    ...
```

**Проверка:** тот же документ — на подписанном PDF на страницах 1-4:
- "Страница N" должна быть справа, а не по центру
- Линия-разделитель должна быть серая, а не красная
- Шрифт "Заказчик"/"Подрядчик" в футере должен быть похож на Times, а не
  моноширинный Caladea

---

## Definition of Done Fix-8

- [ ] `overlay.py:94-99` — descender=0.18*sig_h, cap=8pt
- [ ] `auto1.py::_normalize_sameline` — умная замена с одним `\n?`,
  reverse-паттерны не нормализуются
- [ ] `finder.py::find_signatures` — блок `is_reverse and has_multiline`
  удалён
- [ ] `me.py::_preprocess_docx_for_libreoffice` — 3 XML-замены в
  `word/footer*.xml`
- [ ] `debug_fix8_pattern_test.py` перезапустить: `[MATCH]` должно быть >=8
  (было 3), `[WOULD-MATCH-IF-ML]` должно быть 0 (было 5)
- [ ] Реальная проверка в кабинете: тот же `1Договор_Лебедев_А_П_.docx`
  находит 6+ мест подписи, все на линиях (не под и не над)
- [ ] Футер визуально ближе к оригинальному Word: "Страница N" справа,
  линия серая, шрифт похож на Times
- [ ] CI зелёный на test
- [ ] Запросить деплой на прод

## Что НЕ делать

- Не менять формулу descender ещё раз без визуальной проверки на реальной
  подписи Лебедева — легко перекрутить в третий раз
- Не убирать проверку `_has_real_signature_line` в `find_signatures` —
  она защищает от матчей на "проверяет и своей **подпись**ю" (ложный
  матч, который мы уже видим для pat#16)
- Не деплоить на прод без подтверждения владельца
- Не расширять препроцессор XML без реальной жалобы — эти три правки
  покрывают конкретно этот документ, следующий может выявить другие,
  добавлять по факту
