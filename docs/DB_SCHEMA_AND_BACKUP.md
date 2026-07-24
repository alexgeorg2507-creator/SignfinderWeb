# SignFinder — Схема БД, версионирование, бэкапы

---

## Текущая схема (после миграций 001, 002, 003)

```sql
-- 001_init.sql
users (
  firebase_uid   TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,   -- см. ADR-006, пока = firebase_uid
  email          TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now()
)

profiles (
  tenant_id      TEXT PRIMARY KEY REFERENCES users(tenant_id),
  full_name      TEXT,
  company        TEXT,
  requisites     TEXT,            -- plain text, не JSON (см. M2 итоги)
  updated_at     TIMESTAMPTZ DEFAULT now()
)

parties (
  tenant_id      TEXT PRIMARY KEY REFERENCES users(tenant_id),
  name           TEXT,
  role           TEXT,
  updated_at     TIMESTAMPTZ DEFAULT now()
)

usage_counters (
  tenant_id      TEXT NOT NULL REFERENCES users(tenant_id),
  period         TEXT NOT NULL,   -- 'YYYY-MM'
  doc_count      INT DEFAULT 0,
  PRIMARY KEY (tenant_id, period)
)

-- 002_signatures.sql
signatures (
  tenant_id      TEXT PRIMARY KEY REFERENCES users(tenant_id),
  png_bytes      BYTEA NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now()
)

-- 003_deals.sql (v2.0.0 Deal Cycle, см. DEAL_CYCLE_SPEC.md, ADR-009)
deals (
  id                          UUID PRIMARY KEY,
  initiator_tenant_id         TEXT NOT NULL REFERENCES users(tenant_id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at                  TIMESTAMPTZ NOT NULL,       -- created_at + 7 дней
  status                      TEXT NOT NULL,              -- draft|sent|viewed|signed|expired|rejected
  share_token                 VARCHAR(32) UNIQUE NOT NULL, -- nanoid, публичная ссылка
  share_channel_used          TEXT,                       -- copy_link|telegram|whatsapp|null
  original_pdf_path           TEXT NOT NULL,              -- storage путь
  initiator_signed_pdf_path   TEXT NOT NULL,
  final_pdf_path              TEXT,                       -- null пока не подписан
  saved_anchors               JSONB NOT NULL,             -- якоря первого /v1/analyze
  audit_log                   JSONB NOT NULL DEFAULT '[]',
  counterparty_signature_meta JSONB
)

CREATE INDEX ix_deals_initiator ON deals(initiator_tenant_id, created_at DESC);
CREATE UNIQUE INDEX ix_deals_share_token ON deals(share_token);
CREATE INDEX ix_deals_expires ON deals(expires_at)
  WHERE status IN ('draft','sent','viewed');
```

**Уточнение к ADR-002:** договоры пользователей в общем случае не
персистятся, но в рамках сценария Deal Cycle PDF хранятся 7 дней
в StorageBackend (LocalFS/GCS) по пути `deals/{deal_id}/`. После
истечения — авто-удаление cron'ом, запись Deal без файлов остаётся
ещё 30 дней для аудита, затем удаляется целиком. Полное обоснование —
ADR-009.

**Не в схеме намеренно (и с v2.0.0 остаётся так же):**
- Договоры вне контекста Deal Cycle нигде не хранятся
- Sandbox на лендинге ничего не пишет в БД
- Одноразовое подписание в кабинете (без создания Deal) — не персистится

---

## Версионирование миграций

Формат: `NNN_описание.sql`, номер сквозной, не переиспользуется.

Правила:
- Миграция применяется **вручную** через `psql` или `gcloud sql connect`, не
  автоматически при деплое (на MVP-стадии — сознательный выбор, меньше магии,
  больше контроля перед тем как что-то сломать на живой БД)
- Миграция сначала на test, только после проверки — на prod
- Откат (`NNN_описание_down.sql`) пишется для каждой миграции, которая
  удаляет данные или колонки. Для чисто аддитивных миграций (новая таблица,
  новая nullable-колонка) — опционально
- Файлы миграций хранятся в `signfinder-api/migrations/`, коммитятся в git
- Alembic-инициализация выполнена (см. BACKLOG.md, Governance Этап 2) —
  миграции 001, 002 уже конвертированы, `stamp head` есть на обеих БД.
  Для 003 писать сразу Alembic-миграцию, не `.sql`

### Журнал миграций

| № | Файл | Дата | Применено test | Применено prod |
|---|------|------|-----------------|-----------------|
| 001 | init.sql (users, profiles, parties, usage_counters) | июнь 2026 | ✅ | ⏳ |
| 002 | signatures BYTEA | июнь 2026 | ✅ | ⏳ |
| 003 | deals (v2.0.0 Deal Cycle) | ⏳ E1 | ⏳ | ⏳ |

Обновлять эту таблицу при каждой применённой миграции — иначе через месяц
никто не вспомнит что реально накатано на проде.

---

## Политика резервных копий

### Cloud SQL automated backups — включено на prod (2026-07-03)

```powershell
# Фактическая конфигурация:
gcloud sql instances patch signfinder-db --project=signfinder-prod `
  --backup-start-time=03:00 --enable-point-in-time-recovery `
  --retained-backups-count=3
```

| Параметр | Значение |
|---|---|
| Окно бэкапа | 03:00 UTC |
| Point-in-time recovery | включён |
| Хранить бэкапов | 3 дня |
| Статус | ✅ включено |

**test** — бэкапы не настроены, не нужны (данных нет).

**С v2.0.0 добавляется:** таблица `deals` попадает в те же бэкапы автоматически
(bытes миграция 003 применена на prod). Отдельно PDF-файлы `deals/{id}/*.pdf`
в GCS-бакете `signfinder-prod-config` versioning уже включён (см. BACKLOG.md
Governance Этап 3) — прошлые версии восстанавливаются штатно. Специально
бэкапить PDF-файлы Deal не нужно: их природа временная (7 дней), потеря на
пару часов не критична.

### Restore-дрель (сделать один раз, чтобы знать что работает)

1. Создать тестовый инстанс из бэкапа prod:
   ```
   gcloud sql backups restore BACKUP_ID --restore-instance=signfinder-db-restore-test \
     --backup-instance=signfinder-db --project=signfinder-prod
   ```
2. Подключиться, проверить что данные на месте (в том числе `deals` после v2.0.0)
3. Удалить тестовый инстанс восстановления
4. Записать сюда: дата дрели, сколько заняло, что пошло не так

| Дата дрели | Результат | Заметки |
|------------|-----------|---------|
| — не проводилась — | — | Сделать до первого платящего пользователя |

---

## Что делать при потере/порче данных на prod

1. Не паниковать, не трогать текущий инстанс дальше
2. Определить время инцидента (по логам/жалобам)
3. Point-in-time recovery на момент ДО инцидента:
   ```
   gcloud sql instances clone signfinder-db signfinder-db-recovered \
     --point-in-time='2026-06-15T10:00:00Z' --project=signfinder-prod
   ```
4. Проверить восстановленные данные на клоне
5. Переключить приложение на восстановленный инстанс (смена connection string)
6. Разобраться в причине, записать в RUNBOOK_TECH_SECURITY.md

**Отдельно для v2.0.0:** если восстановление БД сдвигает `expires_at` в
прошлое для активных сделок — cron ретенции при следующем запуске увидит
их как expired и удалит PDF-файлы. При point-in-time restore >7 дней в
прошлое — все восстановленные Deal-записи будут expired. Это ожидаемо и
согласуется с бизнес-логикой («сделка старше 7 дней недействительна»).
Специально ничего не делать.
