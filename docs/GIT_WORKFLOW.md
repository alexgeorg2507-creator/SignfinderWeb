# SignFinder — Git-воркфлоу и CI/CD

> Правило №1 (ADR-008): агент деплоит на test. На prod — только человек,
> `workflow_dispatch` кнопкой в GitHub Actions, после зелёных тестов.
> Без исключений.

---

## Ветки

```
main            — автодеплой на test при каждом merge. Живая ветка разработки.
feature/*       — фичи, PR в main
hotfix/*        — срочные фиксы, PR в main с приоритетным ревью
release/*       — заморозка перед крупным prod-релизом (опционально)
```

Прямые пуши в `main` — запрещены. Всегда через PR, даже если ревьюер — ты сам.

---

## Definition of Done для PR

- [ ] CI зелёный (18 тестов, см. `RUNBOOK_TESTING.md`)
- [ ] Если менялась схема БД — Alembic-миграция есть (`alembic revision -m "..."`)
- [ ] Если новый эндпоинт — ИБ-чеклист (ADR-007): 401 без токена, данные только из JWT, `extra='forbid'`
- [ ] Если менялась версия `signfinder-core` — версия забампана (`pyproject.toml` + `__init__.py`)
- [ ] Если менялась версия `signfinder-api` — `pyproject.toml` единственное место
- [ ] Если менялся веб-клиент — `version.txt` в `SignfinderLand/` забампан
- [ ] Диф прочитан целиком

---

## CI/CD — полная схема (реальная, актуальна на 2026-07-04)

Три независимых деплоя. Каждый в своём репо, каждый шлёт Telegram.

```
┌─────────────────────────────────────────────────────────────────┐
│  Репо: signfinder-api                                           │
│                                                                  │
│  git push → main                                                 │
│      │                                                           │
│      ▼                                                           │
│  ci.yml (авто)                                                   │
│  ├── pip install + signfinder-core@github/main                   │
│  ├── cloud-sql-proxy → signfinder-cab-test DB                    │
│  ├── pytest 18 тестов → JUnit XML artifact                      │
│  └── pass →                                                      │
│      ▼                                                           │
│  deploy-test.yml (авто, после ci.yml)                           │
│  ├── gcloud builds submit cloudbuild-test.yaml                   │
│  ├── smoke: /health → 200, /v1/me/profile → 401                 │
│  └── логирует версии из /v1/version                             │
│                                                                  │
│  deploy-prod.yml (ТОЛЬКО вручную, workflow_dispatch)            │
│  ├── alembic upgrade head (prod DB)                              │
│  ├── gcloud builds submit cloudbuild-prod.yaml                   │
│  ├── smoke: /health → 200, /v1/me/profile → 401                 │
│  └── Telegram: ✅ API vX.Y + Core vX.Y                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Репо: SignfinderWeb                                             │
│                                                                  │
│  git push → main                                                 │
│      │                                                           │
│      ▼                                                           │
│  deploy.yml (авто)                                               │
│  ├── inject window.__SF_VERSION__ из version.txt в index.html   │
│  ├── firebase deploy --only hosting --project=signfinder-prod   │
│  └── Telegram: ✅ Web vX.Y → signfinder.app                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  signfinder-core — НЕ деплоится отдельно                        │
│  Подтягивается при каждой сборке api:                           │
│  Dockerfile: pip install из github.com/...signfinder-core@main  │
│  Версия видна в /v1/version → signfinder_core_version           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Telegram нотификации

| Событие | Сообщение |
|---------|-----------|
| Prod API deploy | `✅/🚨 PROD — API deployed · API: vX.Y · Core: vX.Y · Status · Run #N` |
| Prod Web deploy | `✅/🚨 PROD — Web deployed · Web: vX.Y · signfinder.app · Run #N` |
| Cloud Monitoring alert | `🚨 SignFinder Alert · Condition · State · Summary` |

Нотификация приходит **всегда** (`if: always()`) — включая провальные деплои.

---

## Версии — где живут и как менять

| Компонент | Файл | Как |
|-----------|------|-----|
| `signfinder-api` | `signfinder-api/pyproject.toml`, поле `version` | Вручную перед деплоем. Единственное место. |
| `signfinder-core` | `signfinder-core/pyproject.toml` + `signfinder/__init__.py` | При каждом коммите в core. Оба файла. |
| Web-клиент | `SignfinderLand/version.txt` | Вручную перед деплоем. |

Версии в нотификации и в `/v1/version` — автоматически из этих файлов.
`BUILD_NUMBER` (номер GitHub Actions run) отображается в нотификации.

---

## Деплой на prod — чеклист перед нажатием кнопки

**API (`signfinder-api`):**
1. CI зелёный на `main`
2. `deploy-test.yml` прошёл + smoke test
3. Ручная проверка на test: логин → профиль → подпись → договор → скачать
4. `git log` — посмотреть что идёт в деплой
5. GitHub Actions → `deploy-prod.yml` → Run workflow
6. Пришло Telegram ✅ с версиями
7. `git tag prod-YYYY-MM-DD && git push --tags`
8. Обновить журнал ниже

**Web (`SignfinderWeb`):**
1. Поправить `version.txt` если нужна новая версия
2. `git push` → `deploy.yml` запускается автоматически
3. Пришло Telegram ✅ с Web версией
4. Проверить `signfinder.app` в браузере — бейдж версии в topbar

---

## GitHub Secrets

| Репо | Secret | Назначение |
|------|--------|------------|
| `signfinder-api` | `GOOGLE_CREDENTIALS_TEST` | SA JSON для signfinder-cab-test |
| `signfinder-api` | `GOOGLE_CREDENTIALS_PROD` | SA JSON для signfinder-prod |
| `signfinder-api` | `TELEGRAM_BOT_TOKEN` | Bot token |
| `signfinder-api` | `TELEGRAM_CHAT_ID` | Chat ID |
| `SignfinderWeb` | `GOOGLE_CREDENTIALS_PROD` | SA JSON для signfinder-prod (отдельный ключ, тот же SA) |
| `SignfinderWeb` | `TELEGRAM_BOT_TOKEN` | то же |
| `SignfinderWeb` | `TELEGRAM_CHAT_ID` | то же |

---

## Миграции БД

```powershell
alembic revision -m "describe_change"   # создать
alembic upgrade head                     # применить
alembic downgrade -1                     # откатить на шаг
alembic current                          # текущее состояние
alembic stamp head                       # fake-apply на существующей БД
```

`deploy-prod.yml` запускает `alembic upgrade head` до `gcloud builds submit`.
Миграция упала → деплой не стартует.

---

## Rollback

**API (секунды):**
```powershell
gcloud run services update-traffic signfinder-api `
  --to-revisions=PREVIOUS_REVISION=100 --project=signfinder-prod --region=europe-west1
```

**Web:**
```powershell
firebase hosting:clone SOURCE_VERSION signfinder-prod:live
```

**БД:** `DB_SCHEMA_AND_BACKUP.md`. Деструктивные миграции требуют `downgrade()`.

---

## Журнал prod-релизов

| Тег | Дата | Что | Кто |
|-----|------|-----|-----|
| prod-2026-07-03 | 2026-07-03 | Первый деплой: M0-M4 кабинет, Alembic, CI/CD, monitoring | агент + владелец |
| prod-2026-07-04 | 2026-07-04 | Версионирование, Telegram нотификации, веб-деплой workflow | агент + владелец |
