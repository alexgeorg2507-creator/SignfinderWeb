# TASK: Fix-19 — «Мои сделки»: контрагент, дата договора, одна фраза (fix-15 §4)

> Отложенный кусок из `TASK_fix15.md` §4. Пока он ждал очереди, я прочитал
> `tasks.py`/`job_processors.py`/`internal.py`/`db.py` вместо того чтобы
> просто сказать «используй существующую job-систему» как в fix-15 —
> **эта рекомендация была неточной, ниже другая**. Объясняю почему, не
> прошу поверить на слово.

---

## §0. Почему не через `tasks.py`/`job_processors.py`, как советовал fix-15

Существующий async-job паттерн (`process_analyze_job`) устроен так:
`_execute_job_locally()` в `tasks.py` вызывает процессор **синхронно,
без await** — это нормально для `sf.analyze()`, потому что весь
`LLMClient.complete_structured()` в `signfinder-core` тоже синхронный
(`signfinder/llm/base.py` — ни одного `async def`). Но нашей задаче
дополнительно нужно **писать в Postgres** (`asyncpg` — только async),
а `_execute_job_locally` синхронный. Засунуть туда `await` некуда, а
`asyncio.run()` изнутри — верный способ поймать `RuntimeError: asyncio.run()
cannot be called from a running event loop`, потому что вызывается это
всё изнутри уже работающего FastAPI async-хендлера.

Городить асинхронный диспатч в общий `tasks.py` — трогать код, которым
пользуется `/analyze/async`, ради фичи которая не обязана жить в
Cloud Tasks вообще. Вместо этого — штатный FastAPI-механизм:

```python
from fastapi import BackgroundTasks

@router.post("/deals")
async def create_deal(..., background_tasks: BackgroundTasks, ...):
    ...
    background_tasks.add_task(extract_deal_metadata, deal.id)
    return deal
```

`BackgroundTasks` спокойно принимает `async def`, выполняется после
ответа, `await pool.acquire()` работает без плясок. Плата за простоту:
если Cloud Run убьёт инстанс между ответом и завершением таска — для
этой одной сделки поля просто останутся пустыми, не более. Для
необязательного обогащения (не критичных данных, не юр. следа) это
нормальная цена за то, чтобы не трогать общую job-инфраструктуру.

---

## §1. Миграция — три nullable колонки

```sql
ALTER TABLE deals ADD COLUMN counterparty_name TEXT;
ALTER TABLE deals ADD COLUMN contract_date DATE;
ALTER TABLE deals ADD COLUMN summary TEXT;
```

Все nullable — старые сделки просто не имеют, ничего не бэкафиллим.

---

## §2. Экстракция — новый модуль в `signfinder-api`, не в core

`sf.llm` уже доступен через `get_signfinder()` (используется в
`main.py` для лога при старте) — вызывать `sf.llm.complete_structured()`
напрямую, без нового метода в `signfinder-core`. Deal Cycle весь и так
живёт в `signfinder-api` (прецедент — юр.блок в E7, `deals_public.py`),
это не исключение из паттерна, а его продолжение.

Сигнатура (`signfinder/llm/base.py`):
```python
complete_structured(system: str, user: str, expected_json_schema: dict, max_tokens: int = 1024) -> dict
```

Новый файл, например `app/deal_metadata.py`:

```python
async def extract_deal_metadata(deal_id: str) -> None:
    from app.db import get_pool
    from app.dependencies import get_signfinder

    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM deals WHERE id = $1", deal_id)
        if row is None:
            return
        pdf_bytes = ...  # тот же storage-путь что уже использует create_deal/get_deal
                          # для чтения PDF сделки — не изобретать новый, найти в deals.py

        from signfinder.pdf import parse_pdf_bytes
        doc = parse_pdf_bytes(pdf_bytes, filename="document.pdf")
        text = "\n".join(p.text for p in doc.pages[:2])  # первых 1-2 страниц достаточно

        sf = get_signfinder()
        schema = {"type": "object", "properties": {
            "counterparty_name": {"type": "string"},
            "contract_date": {"type": "string", "description": "YYYY-MM-DD, пусто если не найдено"},
            "summary": {"type": "string", "description": "одно предложение, макс ~15 слов"},
        }}
        try:
            result = sf.llm.complete_structured(
                system="...",  # см. ниже
                user=text,
                expected_json_schema=schema,
            )
        except Exception:
            logger.exception("deal metadata extraction failed for %s", deal_id)
            return  # тихо — это необязательное обогащение, не роняем ничего

        await conn.execute(
            "UPDATE deals SET counterparty_name=$1, contract_date=$2, summary=$3 WHERE id=$4",
            result.get("counterparty_name") or None,
            result.get("contract_date") or None,
            result.get("summary") or None,
            deal_id,
        )
```

Псевдокод, не копировать буквально — подгони под реальную сигнатуру
`Deal`/storage-хелперы, которые уже есть в `deals.py`.

**Промпт (`system`) — на твоё усмотрение, не диктую дословно**, но
учти: документ содержит **обе** стороны, включая нашу собственную (имя
инициатора известно из его профиля — можно передать в промпт как
контекст, чтобы LLM не перепутал кто есть кто и вернул именно
контрагента, не нас самих).

---

## §3. Использовать существующее хранение текста, если оно уже есть

Прежде чем гонять `parse_pdf_bytes` второй раз на том же файле —
проверь, не сохраняется ли текст уже где-то в процессе `/v1/analyze`
или `create_deal`. Если нет (а по архитектуре "stateless, PDF не
хранится между запросами" — вероятно нет, деньги на повторный парсинг
здесь не те же деньги что LLM-вызов, это дёшево) — просто парсь заново
из уже сохранённого PDF сделки.

---

## §4. API + фронт

`DealListItem`/`Deal` — добавить `counterparty_name`, `contract_date`,
`summary` (все `Optional`). Пока `None` — фронт показывает как есть,
не выдумывая «обрабатывается» с таймером/поллингом — это лишняя
сложность ради необязательного поля. Просто прочерк, обновится при
следующей загрузке списка.

«Мои сделки» — показать имя файла (уже в fix-15 §3.1) + контрагента +
дату договора + одну строку выжимки под названием.

---

## §5. DoD

- [ ] Миграция применена на test
- [ ] Новая сделка на test получает заполненные поля в течение
  нескольких секунд после создания (реальная проверка — создать сделку,
  подождать, GET `/v1/deals/{id}`, увидеть непустые значения — не
  «код написан», а «значение реально появилось»)
- [ ] Ошибка LLM/парсинга не роняет `create_deal` и не показывает
  ошибку пользователю — молча остаётся `None`
- [ ] «Мои сделки» показывает новые поля
- [ ] Бампнуть `signfinder-api/pyproject.toml`
