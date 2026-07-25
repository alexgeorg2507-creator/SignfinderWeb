# TASK: SignfinderLand v2.0.0 Deal Cycle — Эпик E1 (Модель Deal + миграция + приватные API)

## Методология

- Работать в репозитории `signfinder-api` — там весь backend кабинета
- Feature-ветка `feature/e1-deals-model`, PR в `main`, ADR-008 (агент не деплоит на prod)
- Тесты гоняются только в CI против `signfinder-cab-test` — см. `SignfinderLand/docs/GIT_WORKFLOW.md`
- После merge в `main` → `deploy-test.yml` авто, проверить smoke
- На prod — ТОЛЬКО с явного разрешения владельца, стандартной фразой из GIT_WORKFLOW №2

## Модель кодера

Claude Sonnet 5 через Claude Code или аналог. Filesystem MCP с доступом ко всем 6 каталогам:
`SignPDFMVP\SignPDFMVP`, `signfinder-core`, `signfinder-api`, `SignPDFMVPLocal`,
`SignfinderLand`, `договора примеры\PL`.

**«Текущего рабочего каталога» нет**. Все 6 доступны одновременно. Работать
конкретно в `signfinder-api` — там код backend'а.

---

## §1. READING GATE — обязательное первое действие

**До первой строки кода** прочитать в указанном порядке и ответить владельцу
одним сообщением подтверждение по шаблону ниже. **Без этого сообщения код не пишется.**

### 1.1 Что прочитать

1. `C:\work\SignfinderLand\docs\GIT_WORKFLOW.md` — **особое внимание** секции
   §Явные запреты и §Не изобретай инфраструктуру. Правила №1, №2, №3 из шапки.
2. `C:\work\SignfinderLand\docs\DEAL_CYCLE_SPEC.md` — вся спека v1.2, особое
   внимание §0, §4, §4.5, §5, §5.5, §5.6, §5.7
3. `C:\work\SignfinderLand\docs\THREAT_MODEL_DEAL_CYCLE.md` — §3.B, §3.C, §3.E, §3.F
4. `C:\work\SignfinderLand\docs\ADR.md` — ADR-007 (security), ADR-009, ADR-010
5. `C:\work\SignfinderLand\docs\RUNBOOK_TESTING.md` — секция «v2.0.0 Deal
   Cycle — тесты», подсекция `test_deals_crud.py`
6. `C:\work\SignfinderLand\docs\DB_SCHEMA_AND_BACKUP.md` — миграция 003 в
   журнале, ADR-006 (tenant_id)
7. `C:\work\SignfinderLand\docs\SECRETS_REGISTRY.md` — реестр доступов
8. `C:\work\signfinder-api\app\routers\me.py` — образец стиля для нового
   роутера. Копируй паттерны, не изобретай.
9. `C:\work\signfinder-api\alembic\versions\` (все существующие миграции) —
   образец для 003
10. Все `.yml` в `C:\work\signfinder-api\.github\workflows\` (`ci.yml`,
    `deploy-test.yml`, `deploy-prod.yml`) — понять что автоматизировано и
    где могут быть дыры (см. §5 ниже)

### 1.2 Шаблон подтверждающего сообщения

```
Прочитал:
- GIT_WORKFLOW.md § Явные запреты — понял: локальный Postgres/Docker/SQLite = ЗАПРЕЩЕНО.
  conftest.py, alembic.ini, pyproject.toml dev-deps не трогать.
  Ручных инструкций владельцу по инфре не выдавать — чинить в CI/CD.
- DEAL_CYCLE_SPEC.md v1.2 — понял модель Deal, share_token nanoid 32, §5.7 IDOR-защита
- ADR-007, ADR-009, ADR-010
- THREAT_MODEL §3.B, §3.C, §3.E, §3.F
- me.py как образец роутера
- ci.yml — [обнаружено X / всё на месте]

План действий:
1. [шаг]
2. [шаг]
...

Начинаю с [первого шага]. Ожидаю подтверждения владельца или коррекций.
```

**Владелец либо говорит «ок, поехали», либо корректирует. До подтверждения — код не пишешь.**

---

## §2. Задача — что реализовать

Эпик E1 из спеки — модель Deal, миграция БД, приватные API инициатора,
5 тестов. Публичная страница (E2), кнопки передачи (E3), кабинет (E4),
cron (E5), опросник (E6), юр. блок (E7) — **НЕ ТВОЯ ЗАДАЧА в этом эпике**.

### 2.1 Alembic-миграция 003_deals

```powershell
cd C:\work\signfinder-api
alembic revision -m "003_deals_table"
# редактируешь получившийся файл в alembic/versions/
```

Схема — точно как в спеке §4:

```sql
CREATE TABLE deals (
    id                          UUID PRIMARY KEY,
    initiator_tenant_id         TEXT NOT NULL REFERENCES users(tenant_id),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at                  TIMESTAMPTZ NOT NULL,
    status                      TEXT NOT NULL,
    share_token                 VARCHAR(32) UNIQUE NOT NULL,
    share_channel_used          TEXT,
    original_pdf_path           TEXT NOT NULL,
    initiator_signed_pdf_path   TEXT NOT NULL,
    final_pdf_path              TEXT,
    saved_anchors               JSONB NOT NULL,
    audit_log                   JSONB NOT NULL DEFAULT '[]',
    counterparty_signature_meta JSONB
);

CREATE INDEX ix_deals_initiator ON deals(initiator_tenant_id, created_at DESC);
CREATE UNIQUE INDEX ix_deals_share_token ON deals(share_token);
CREATE INDEX ix_deals_expires ON deals(expires_at)
  WHERE status IN ('draft','sent','viewed');
```

**Внимание:** в спеке §4 SQL написан с `initiator_user_id UUID REFERENCES users(id)`.
**Это ошибка спеки — использовать `initiator_tenant_id TEXT REFERENCES users(tenant_id)`**
по образцу существующих таблиц `profiles`, `parties` и ADR-006. Обязательно
исправить спеку в том же PR (см. §4 «Правки в документации»).

Обязательно написать `downgrade()` — DROP TABLE и индексов.

### 2.2 Pydantic-модели в `C:\work\signfinder-api\app\models\deal.py`

Обязательно `model_config = ConfigDict(extra='forbid')` на **всех** схемах.

```python
class DealStatus(str, Enum):
    DRAFT = "draft"
    SENT = "sent"
    VIEWED = "viewed"
    SIGNED = "signed"
    EXPIRED = "expired"
    REJECTED = "rejected"

class ShareChannel(str, Enum):
    COPY_LINK = "copy_link"
    TELEGRAM = "telegram"
    WHATSAPP = "whatsapp"

class DealCreate(BaseModel):
    """POST /v1/deals payload"""
    model_config = ConfigDict(extra='forbid')
    original_pdf_b64: str
    initiator_signed_pdf_b64: str
    saved_anchors: list[dict]

class Deal(BaseModel):
    """GET /v1/deals/{id} — для инициатора, полная модель"""
    model_config = ConfigDict(extra='forbid')
    id: UUID
    initiator_tenant_id: str
    created_at: datetime
    expires_at: datetime
    status: DealStatus
    share_token: str
    share_url: str  # computed: f"https://signfinder.app/sign/{share_token}"
    share_channel_used: Optional[ShareChannel]
    audit_log: list[dict]
    has_final_pdf: bool

class DealListItem(BaseModel):
    """GET /v1/deals — компактная версия для списка"""
    model_config = ConfigDict(extra='forbid')
    id: UUID
    created_at: datetime
    expires_at: datetime
    status: DealStatus
    share_channel_used: Optional[ShareChannel]

class MarkSharedRequest(BaseModel):
    """POST /v1/deals/{id}/mark-shared payload"""
    model_config = ConfigDict(extra='forbid')
    channel: ShareChannel
```

`DealPublicView` для контрагента — **в этом эпике НЕ пишешь**, это E2.

### 2.3 Генератор share_token

Установить зависимость `nanoid>=2.0` в `signfinder-api/pyproject.toml`.

`C:\work\signfinder-api\app\utils\share_token.py` (или прямо в `models/deal.py`):

```python
from nanoid import generate

_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"

def generate_share_token() -> str:
    """32 символа, ~192 бита энтропии."""
    return generate(_ALPHABET, size=32)
```

Коллизии проверяются `INSERT` на `UNIQUE INDEX ix_deals_share_token`. При
IntegrityError — retry с новым токеном (лимит 3 попытки, дальше — 500 в лог).

### 2.4 Роутер `C:\work\signfinder-api\app\routers\deals.py`

Все эндпоинты за Firebase Auth (dependency из существующего `auth.py`, паттерн из `me.py`).

**POST `/v1/deals`** — создать сделку
- Принимает `DealCreate`
- `tenant_id` из JWT, не из body — принцип ADR-007
- Сохраняет PDF в StorageBackend по путям `deals/{deal_id}/original.pdf` и
  `deals/{deal_id}/initiator_signed.pdf`
- INSERT в БД, share_token, expires_at=now()+7d, status='draft'
- audit_log первое событие: `{"event": "created", "at": "...", "actor": "initiator"}`
- Проверить лимит `usage_counters` для tenant_id, как в существующих эндпоинтах кабинета
- Возвращает `Deal`

**GET `/v1/deals`** — список сделок
- Query: `limit: int = 20`, `offset: int = 0`
- SELECT WHERE `initiator_tenant_id` = $1 ORDER BY created_at DESC
- Возвращает `list[DealListItem]`

**GET `/v1/deals/{id}`** — детали
- SELECT WHERE id=$1 AND `initiator_tenant_id`=$2 (from JWT)
- Не совпало → **404, не 403** (ADR-007, threat model §3.C)
- Возвращает `Deal`

**POST `/v1/deals/{id}/mark-shared`** — отметить что инициатор нажал кнопку передачи
- Принимает `MarkSharedRequest` с `channel`
- Атомарно:
  ```sql
  UPDATE deals SET status='sent', share_channel_used=$1,
                   audit_log=audit_log || $2::jsonb
  WHERE id=$3 AND initiator_tenant_id=$4 AND status='draft'
  RETURNING id
  ```
- 0 строк обновлено → 409 Conflict
- Возвращает обновлённый `Deal`

**GET `/v1/deals/{id}/final-pdf`** — скачать финальный PDF (инициатор)
- SELECT final_pdf_path WHERE id=$1 AND `initiator_tenant_id`=$2
- final_pdf_path IS NULL → 404
- Streaming PDF, `Content-Type: application/pdf`,
  `Content-Disposition: attachment; filename="signed_{deal_id}.pdf"`

### 2.5 Тесты `C:\work\signfinder-api\tests\test_deals_crud.py`

5 тестов:

- `test_create_deal_from_signed_pdf` — 201, share_token 32 символа, status='draft',
  expires_at через 7 дней ±1 минута
- `test_list_deals_own_only` — IDOR: USER_A создал → USER_B `GET /v1/deals`
  возвращает пустой список
- `test_get_deal_details_own_only` — USER_A создал → USER_B пытается
  `GET /v1/deals/{A_deal_id}` → **404 не 403**
- `test_mark_shared_updates_status` — POST mark-shared с channel='whatsapp' →
  GET показывает status='sent', share_channel_used='whatsapp', в audit_log
  событие 'sent'
- `test_deal_create_extra_fields_422` — Pydantic `extra='forbid'` на `DealCreate`,
  попытка передать `initiator_tenant_id` в body → 422 (threat model §3.B)

Использовать существующий `conftest.py` (USER_A, USER_B, mocked JWT).
**Не трогать `conftest.py` под предлогом «локально запустить» — см.
GIT_WORKFLOW § Явные запреты, пункт 2.**

### 2.6 Storage — путь `deals/{deal_id}/`

Посмотреть в существующем коде `signfinder-api` как сейчас работает
StorageBackend (`app/tenant_storage.py`, `app/db.py`). Использовать тот же
интерфейс, добавить префикс `deals/`. **Никаких новых storage-абстракций** —
переиспользуй существующее.

Второй GCS bucket `signfinder-prod-deals` — followup infra task, **не в E1**.
На CI/test пока писать в тот же bucket с префиксом. Отметить в PR
description: «Followup: создать отдельный bucket `signfinder-prod-deals`
с `uniformBucketLevelAccess: true` перед прод-деплоем E2».

### 2.7 Бамп версии `signfinder-api`

`C:\work\signfinder-api\pyproject.toml`: `1.18.4` → **`1.19.0`**.

Minor bump (новый функционал). Следующие эпики E2..E7 будут `1.19.1`,
`1.19.2` и т.д. Не путать с `SignfinderLand/version.txt` (там будет
`2.0.0` в E7).

Проверить что `/v1/version` эндпоинт отдаёт новую версию.

---

## §3. Что делать НЕ надо (границы E1)

**Явные запреты по GIT_WORKFLOW §Явные запреты:**
- Локальный Postgres / SQLite / SQLite-in-memory / testcontainers — **никогда**
- `docker run postgres` — **никогда**
- Модификация `conftest.py`, `alembic.ini`, `pyproject.toml` dev-dependencies
  «под локальный запуск» — **никогда**
- Просьбы владельцу выключить классификатор / дать пароль / положить SA-ключ
  на диск — **никогда**
- Ручные инструкции владельцу «примени миграцию сам», «настрой bucket сам»,
  «положи секрет сам» — **никогда**. Автоматизируешь в CI/CD.

**Границы эпика E1:**
- Публичные эндпоинты `/v1/public/deals/*` — это E2
- Публичная страница подписания — это E2
- 3 кнопки в кабинете — это E3
- Раздел «Мои сделки» в фронте — это E4
- Cron ретенции — это E5
- Telegram-бот опросника — это E6
- Юр. блок в PDF — это E7
- Изменения в `signfinder-core` — никогда в этой версии Deal Cycle
- Изменения в `SignPDFMVPLocal` — это другой продукт, не трогать
- Создание GCS bucket с настройкой ACL — followup, отдельным PR перед E2

Если по ходу реализации спека/threat model/ADR окажутся противоречивыми
или неполными — **останавливаешься и спрашиваешь владельца**. Не изобретаешь
своё решение.

---

## §4. Правки в документации (тоже часть E1)

Обязательно в том же PR:

1. **Исправить `SignfinderLand/docs/DEAL_CYCLE_SPEC.md` §4** — SQL
   должен быть `initiator_tenant_id TEXT REFERENCES users(tenant_id)`,
   не `initiator_user_id UUID REFERENCES users(id)`. Соответствует ADR-006.
2. **Обновить `SignfinderLand/docs/BACKLOG.md`** — поставить `[x]` на пункт E1
   в блоке P1 Deal Cycle с датой.
3. Если что-то из «Связанных обновлений» затронул — пометить `[x]`.

---

## §5. Инфра-фикс — CI применяет миграции автоматически

**Обнаружено при подготовке E1:** `ci.yml` в `signfinder-api` гоняет
`pytest` без `alembic upgrade head`. Миграция 003 не применится на
test-БД, тесты упадут с `UndefinedTableError`.

**Это часть E1**, чинишь сам через код (см. GIT_WORKFLOW §Не изобретай инфраструктуру).

Открой `.github/workflows/ci.yml`, добавь шаг перед `pytest`:

```yaml
- name: Apply Alembic migrations to signfinder-cab-test
  run: alembic upgrade head
  env:
    DATABASE_URL: ${{ env.DATABASE_URL_TEST }}
```

Точное имя env-переменной — смотри в существующем `ci.yml`, что реально
используется для pytest. Cloud-sql-proxy к тому моменту уже поднят —
переиспользуй ту же env-переменную.

Логика копируется из `deploy-prod.yml`, где `alembic upgrade head` уже есть.
**Копируй паттерн один-в-один**, не изобретай.

В PR description отметить: «Фикс дыры в `ci.yml` — миграции теперь
применяются автоматически перед pytest. Следствие первой post-alembic
миграции 003_deals. Journal 2026-07-24 в GIT_WORKFLOW.md».

Обновить `SignfinderLand/docs/BACKLOG.md` в P2 Governance Этап 2 —
добавить закрытый пункт про этот фикс.

---

## §6. Definition of Done для E1

- [ ] Reading gate пройден: подтверждающее сообщение отправлено, владелец подтвердил
- [ ] Alembic-миграция 003 создана, есть `downgrade()`
- [ ] `ci.yml` применяет миграции перед pytest (шаг добавлен)
- [ ] Все 4 эндпоинта работают, покрыты 5 тестами
- [ ] Все Pydantic-схемы имеют `extra='forbid'`
- [ ] `tenant_id` только из JWT, никогда из body — проверяемо в коде
- [ ] IDOR-запросы возвращают 404, не 403
- [ ] `mark-shared` атомарный (SQL WHERE с проверкой status)
- [ ] `pyproject.toml` → `1.19.0`
- [ ] Спека `DEAL_CYCLE_SPEC.md` §4 исправлена (initiator_tenant_id)
- [ ] `BACKLOG.md` обновлён (галка E1, фикс ci.yml в P2)
- [ ] CI зелёный на feature-ветке
- [ ] PR оформлен: что сделано, что затронул, followup для инфры (bucket)
- [ ] После merge — `deploy-test.yml` прошёл, smoke зелёный
- [ ] **На prod ничего не деплоил** — это делает владелец после ручной проверки

---

## §7. Что делать когда закончил

1. Отчитайся владельцу: «E1 готов, CI зелёный на test, PR # смёржен,
   `deploy-test.yml` прошёл. Ждать ли команды на E2 или проверку на test-контуре?»
2. **Не начинай E2 автоматически** — владелец скажет когда.
3. Не прикасайся к prod даже если владелец скажет «хорошо». Только на
   прямое «деплой на prod» и только после его проверки на test.

---

**Автор задачи:** владелец + Claude Opus (2026-07-24)
**Целевой релиз:** SignfinderLand v2.0.0 (в `SignfinderWeb/version.txt` бампается в E7)
**Целевая версия API:** `signfinder-api` v1.19.0
