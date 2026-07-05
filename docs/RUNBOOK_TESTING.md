# SignFinder — Тесты: описание и запуск

> 18 тестов, pytest, против реальной `signfinder-cab-test` БД через Cloud SQL Auth Proxy.
> Результат — JUnit XML в `test-results/results.xml`, доступен как GitHub Actions artifact.

---

## Запуск

### Локально

Требования: `gcloud auth application-default login`, cloud-sql-proxy на PATH.

```powershell
cd C:\work\signfinder-api
pip install -e ".[dev]"
pytest tests/ -v
```

### В CI (GitHub Actions)

Автоматически при каждом `push`/`PR` в `main` — workflow `ci.yml`.
Результаты: вкладка Actions → конкретный run → Artifacts → `test-results`.

---

## Инфраструктура тестов (`conftest.py`)

**Два тестовых пользователя:**
- `USER_A = "test-uid-alice"`
- `USER_B = "test-uid-bob"`

Строки создаются и удаляются вокруг каждого теста (`autouse` fixture `_cleanup_test_users`) — тестовая БД остаётся чистой.

**Cloud SQL Auth Proxy** — запускается автоматически из `conftest.py` на `127.0.0.1:5432`. Пароль берётся из Secret Manager через `gcloud` CLI. Требует ADC.

**Firebase mock** — `_verify_token` переопределяется через `app.dependency_overrides` — реальных JWT не нужно. В `test_auth.py` — отдельно через `monkeypatch` для проверки реального пути верификации.

**signfinder-core mock** — LLM не вызывается. `analyze()` возвращает дефолтный `AnalysisResponse`, `sign()` возвращает `b"%PDF-fake"`.

---

## Список тестов

### `test_auth.py` — ИБ: Auth bypass (3 теста)

| Тест | Что проверяет | Ожидаемый результат |
|------|---------------|---------------------|
| `test_no_auth_header_401` | GET `/v1/me/profile` без заголовка Authorization | 401 |
| `test_invalid_token_401` | GET `/v1/me/profile` с невалидным токеном (monkeypatch: `verify_id_token` → `ValueError`) | 401 |
| `test_valid_token_200` | GET `/v1/me/profile` с валидным (моковым) токеном | 200 |

---

### `test_idor.py` — ИБ: IDOR между пользователями (2 теста)

| Тест | Что проверяет | Ожидаемый результат |
|------|---------------|---------------------|
| `test_profile_idor` | USER_A создаёт профиль → USER_B читает свой профиль → получает пустые поля, не данные A | B: `{full_name:"", company:"", requisites:""}` |
| `test_signature_idor` | USER_A загружает подпись → USER_B пытается GET подпись | B: 404 |

---

### `test_profile.py` — CRUD: профиль (4 теста)

| Тест | Что проверяет | Ожидаемый результат |
|------|---------------|---------------------|
| `test_get_profile_new_user_empty` | GET профиля нового пользователя | 200, все поля пустые |
| `test_put_profile_valid_persists` | PUT → GET: данные сохранились | 200, данные идентичны |
| `test_put_profile_extra_fields_422` | PUT с лишним полем `is_admin: true` | 422 (Pydantic `extra='forbid'`) |
| `test_put_profile_sql_injection_stored_as_text` | PUT с SQL-инъекцией в `full_name` | 200, строка сохранена как текст, `users` не дропнута |

---

### `test_signature.py` — CRUD: подпись (4 теста)

| Тест | Что проверяет | Ожидаемый результат |
|------|---------------|---------------------|
| `test_get_signature_no_upload_404` | GET подписи без предварительной загрузки | 404 |
| `test_put_signature_invalid_base64_422` | PUT с невалидным base64 (`"a"`) | 422 |
| `test_put_signature_valid_png_204` | PUT с корректным PNG base64 (1x1 пиксель) | 204 |
| `test_get_signature_after_upload_200_png` | PUT → GET: Content-Type `image/png`, тело начинается с `\x89PNG` | 200 |

---

### `test_usage.py` — Лимиты (2 теста)

| Тест | Что проверяет | Ожидаемый результат |
|------|---------------|---------------------|
| `test_get_usage_new_user` | GET `/v1/me/usage` для нового пользователя | `{doc_count:0, limit:10, period:"YYYY-MM"}` |
| `test_analyze_429_when_at_limit` | Прямая запись `doc_count=10` в БД → POST `/v1/me/analyze` | 429, счётчик остался 10 (не инкрементирован) |

---

### `test_party.py` — CRUD: party (3 теста)

| Тест | Что проверяет | Ожидаемый результат |
|------|---------------|---------------------|
| `test_get_party_new_user_empty` | GET party нового пользователя | 200, `{name:"", role:""}` |
| `test_put_party_valid_200` | PUT → GET: данные сохранились | 200 |
| `test_put_party_extra_fields_422` | PUT с лишним полем | 422 |

---

## Что НЕ покрыто (следующая итерация)

- `signfinder-core` unit-тесты (fingerprint, matcher, overlay) — roadmap v1.15, не сделано
- `/v1/me/analyze` happy path (нужен реальный PDF + мок LLM с валидным ответом)
- `/v1/me/sign` happy path
- Тесты на `signfinder-prod` (smoke only через GitHub Actions deploy-prod.yml)
- Rate limiting / повторные запросы
