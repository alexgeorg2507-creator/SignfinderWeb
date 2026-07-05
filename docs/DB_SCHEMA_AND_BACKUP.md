# SignFinder — Схема БД, версионирование, бэкапы

---

## Текущая схема (после миграций 001, 002)

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
```

**Не в схеме намеренно (см. ADR-002):** таблицы для хранения договоров.
Договоры не персистятся нигде.

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

### Журнал миграций

| № | Файл | Дата | Применено test | Применено prod |
|---|------|------|-----------------|-----------------|
| 001 | init.sql (users, profiles, parties, usage_counters) | июнь 2026 | ✅ | ⏳ |
| 002 | signatures BYTEA | июнь 2026 | ✅ | ⏳ |

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

### Restore-дрель (сделать один раз, чтобы знать что работает)

1. Создать тестовый инстанс из бэкапа prod:
   ```
   gcloud sql backups restore BACKUP_ID --restore-instance=signfinder-db-restore-test \
     --backup-instance=signfinder-db --project=signfinder-prod
   ```
2. Подключиться, проверить что данные на месте
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
