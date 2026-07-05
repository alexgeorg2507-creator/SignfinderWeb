# TASK: Governance Этап 2 — CI/CD, Alembic, тесты

## Контекст

Два активных GCP-проекта: `signfinder-cab-test`, `signfinder-prod`.  
Три репо:
- `signfinder-api` → `github.com/alexgeorg2507-creator/signfinder-api`
- `signfinder-core` → `github.com/alexgeorg2507-creator/signfinder-core`
- `SignfinderLand` (лендинг + кабинет frontend) → `github.com/alexgeorg2507-creator/SignfinderWeb` (пустое репо, remote ещё не добавлен локально)

Деплой сейчас: вручную через `gcloud builds submit`. CI/CD триггеров нет.  
Миграции: `migrations/001_init.sql`, `002_signature_bytea.sql` — применены вручную.  
Тестов нет. `pyproject.toml` уже содержит `[project.optional-dependencies] dev = [pytest, pytest-asyncio, httpx]`.

---

## Задача 1 — SignfinderLand → SignfinderWeb

В `C:\work\SignfinderLand`:
```powershell
git remote add origin https://github.com/alexgeorg2507-creator/SignfinderWeb.git
git push -u origin main
```

Если ветки нет — создать и запушить. Убедиться что `.gitignore` не пропускает
секреты (`.firebase/` и реальные `.env` файлы не должны пушиться).

---

## Задача 2 — Alembic в signfinder-api

### 2.1 Добавить зависимость

В `pyproject.toml` в `dependencies` добавить:
```
"alembic>=1.13",
"sqlalchemy[asyncio]>=2.0",
```

### 2.2 Инициализировать Alembic

```powershell
cd C:\work\signfinder-api
alembic init alembic
```

### 2.3 Настроить alembic/env.py

- Читать `DATABASE_URL` из переменной окружения
- Использовать async-режим (`asyncpg`)
- `target_metadata = None` (не нужно — схема уже существует, миграции пишем вручную)

### 2.4 Конвертировать существующие SQL-миграции

Создать две Alembic-ревизии:

**revision 001** (`001_init`) — содержит `upgrade()` с SQL из `migrations/001_init.sql`,
`downgrade()` дропает все таблицы в обратном порядке.

**revision 002** (`002_signature_bytea`) — содержит `upgrade()` с SQL из
`migrations/002_signature_bytea.sql`, `downgrade()` откатывает: добавляет `gcs_path TEXT`,
дропает `png_bytes`.

### 2.5 Fake-применить на существующих БД

Обе БД уже содержат актуальную схему. Нужна команда для fake-apply (чтобы
Alembic не пытался повторно создавать таблицы):
```powershell
alembic stamp head
```

Добавить в `README.md` раздел "Миграции":
```
# Применить на новой БД:
alembic upgrade head

# Fake-apply на уже существующей:
alembic stamp head

# Откат на шаг:
alembic downgrade -1
```

---

## Задача 3 — pytest: структура и тесты

### 3.1 Структура

```
signfinder-api/
  tests/
    conftest.py          # фикстуры: TestClient, мок Firebase, мок DB
    test_auth.py         # ИБ: auth bypass, token validation
    test_idor.py         # ИБ: IDOR между двумя пользователями
    test_profile.py      # CRUD: profile get/put
    test_signature.py    # CRUD: signature upload/get
    test_usage.py        # лимиты: счётчик, 429 при превышении
    test_party.py        # CRUD: party get/put
```

### 3.2 Стратегия моков

**Firebase auth** — мокировать `app.auth._verify_token`. Два фиктивных uid:
- `USER_A = "test-uid-alice"`
- `USER_B = "test-uid-bob"`

**База данных** — использовать реальную тестовую БД (`signfinder-cab-test`).
`DATABASE_URL` читается из `TEST_DATABASE_URL` env var.  
Альтернатива если нет доступа к БД в CI: SQLite + asyncio (через `aiosqlite`).

**SignFinder core** — мокировать `app.dependencies.get_signfinder` возвращает
`MagicMock` с `.analyze()` → дефолтный `AnalysisResponse`, `.sign()` → `b"%PDF-fake"`.

### 3.3 Тест-кейсы (обязательный минимум)

**test_auth.py:**
```python
# 401 без Authorization header на /v1/me/profile
# 401 с невалидным токеном
# 200 с валидным (моковым) токеном
```

**test_idor.py:**
```python
# USER_A создаёт profile
# USER_B делает GET /v1/me/profile — получает СВОЙ пустой, не данные A
# USER_A делает PUT /v1/me/signature — сохраняет подпись
# USER_B делает GET /v1/me/signature — 404 (не чужую подпись!)
```

**test_profile.py:**
```python
# GET /v1/me/profile на новом юзере → пустые поля, 200
# PUT /v1/me/profile с валидными данными → 200, данные сохранились
# PUT /v1/me/profile с лишними полями (extra='forbid') → 422
# PUT /v1/me/profile с инъекцией в full_name → сохраняется как текст, не выполняется
```

**test_signature.py:**
```python
# GET /v1/me/signature без предварительного upload → 404
# PUT /v1/me/signature с невалидным base64 → 422
# PUT /v1/me/signature с валидным PNG b64 → 204
# GET /v1/me/signature после upload → 200, Content-Type: image/png
```

**test_usage.py:**
```python
# GET /v1/me/usage → {doc_count: 0, limit: 10, period: "YYYY-MM"}
# Напрямую выставить doc_count = 10 в БД
# POST /v1/me/analyze → 429
# doc_count не должен увеличиться сверх 10
```

**test_party.py:**
```python
# GET /v1/me/party → пустые поля, 200
# PUT /v1/me/party → 200
# PUT /v1/me/party с extra fields → 422
```

### 3.4 Формат вывода

В `pyproject.toml` добавить:
```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
addopts = "--tb=short -v --junit-xml=test-results/results.xml"
```

`test-results/` добавить в `.gitignore`.

---

## Задача 4 — GitHub Actions

### 4.1 Файл: `.github/workflows/ci.yml` в `signfinder-api`

Триггеры:
- `push` на `main`
- `pull_request` на `main`
- `workflow_dispatch` (ручной запуск)

Шаги:
1. `checkout`
2. `python 3.11`
3. `pip install -e ".[dev]"` + `pip install signfinder-core` из GitHub
4. `pytest tests/` → JUnit XML
5. `actions/upload-artifact` с `test-results/results.xml`
6. При `workflow_dispatch` с input `environment: test|prod` → `gcloud builds submit`

### 4.2 Файл: `.github/workflows/deploy-test.yml`

Триггер: автоматически после зелёного `ci.yml` на `main`.

Шаги:
1. `gcloud auth` через `GOOGLE_CREDENTIALS_TEST` (Workload Identity или SA key в secrets)
2. `gcloud builds submit --config=cloudbuild-test.yaml --project=signfinder-cab-test`
3. **Smoke test** — после деплоя:
   ```bash
   curl -sf https://signfinder-api-svmlmbccma-ew.a.run.app/health || exit 1
   # 401 на защищённый эндпоинт без токена:
   STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://signfinder-api-svmlmbccma-ew.a.run.app/v1/me/profile)
   [ "$STATUS" = "403" ] || [ "$STATUS" = "401" ] || exit 1
   ```

### 4.3 Файл: `.github/workflows/deploy-prod.yml`

Триггер: **только `workflow_dispatch`** (кнопка в GitHub Actions UI, руками).

Шаги:
1. `gcloud auth` через `GOOGLE_CREDENTIALS_PROD`
2. `alembic upgrade head` (против prod DB через Cloud SQL Proxy)
3. `gcloud builds submit --config=cloudbuild-prod.yaml --project=signfinder-prod`
4. Smoke test на `https://signfinder-api-cvuz6bbb7a-ew.a.run.app/health`

### 4.4 GitHub Secrets (добавить вручную в Settings → Secrets):

| Secret | Значение |
|--------|---------|
| `GOOGLE_CREDENTIALS_TEST` | SA JSON для `signfinder-cab-test` |
| `GOOGLE_CREDENTIALS_PROD` | SA JSON для `signfinder-prod` |
| `TEST_DATABASE_URL` | connection string для test БД (для pytest) |

---

## Задача 5 — cloudbuild-test.yaml: починить секреты

В `signfinder-api/cloudbuild-test.yaml` в шаге `gcloud run deploy` добавить
`DEEPSEEK_API_KEY` и `API_KEY` в `--set-secrets`:

```
--set-secrets=DB_PASSWORD=db-password:latest,DEEPSEEK_API_KEY=deepseek-api-key:latest,API_KEY=api-key:latest
```

---

## Что НЕ делать

- Не трогать `Dockerfile` и `cloudbuild-prod.yaml`
- Не добавлять зависимости в `Dockerfile` — только через `pyproject.toml`
- Не коммитить реальные значения секретов, `.env` файлы, SA JSON
- Не менять схему БД без новой Alembic-ревизии

---

## Definition of Done

- [ ] `SignfinderLand` запушен в `SignfinderWeb`
- [ ] `alembic upgrade head` отрабатывает на чистой БД
- [ ] `pytest tests/` → все тесты зелёные локально
- [ ] JUnit XML генерируется в `test-results/results.xml`
- [ ] GitHub Actions `ci.yml` проходит на `main`
- [ ] `cloudbuild-test.yaml` содержит все три секрета в `--set-secrets`
- [ ] `deploy-test.yml` деплоит и проходит smoke test
- [ ] `deploy-prod.yml` существует, запускается только вручную
