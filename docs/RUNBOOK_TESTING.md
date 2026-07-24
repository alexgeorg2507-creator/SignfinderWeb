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

## v2.0.0 Deal Cycle — тесты (планируются в E1-E2, покрытие ~15 тестов)

> Все тесты добавляются в `signfinder-api/tests/` вместе с реализацией
> эпика. Полная спека — `DEAL_CYCLE_SPEC.md`.

### `test_deals_crud.py` — CRUD сделки (в E1, 4 теста)

| Тест | Что проверяет | Ожидаемый результат |
|------|---------------|---------------------|
| `test_create_deal_from_signed_pdf` | POST `/v1/deals` с подписанным инициатором PDF | 201, deal_id, share_token, status=`draft`, expires_at через 7 дней |
| `test_list_deals_own_only` | USER_A создал сделку → USER_B `GET /v1/deals` не видит её (IDOR) | B: пустой список |
| `test_get_deal_details_own_only` | USER_A создал → USER_B пытается `GET /v1/deals/{A_deal_id}` | 404 (не 403 — не раскрываем факт существования) |
| `test_mark_shared_updates_status` | POST `/v1/deals/{id}/mark-shared` с channel=`whatsapp` → GET показывает status=`sent`, share_channel_used=`whatsapp`, audit_log содержит `sent` | 200, статус обновлён |

### `test_deals_public.py` — публичная страница (в E2, 5 тестов)

| Тест | Что проверяет | Ожидаемый результат |
|------|---------------|---------------------|
| `test_get_public_deal_by_token_no_auth` | GET `/v1/public/deals/{share_token}` без Authorization header | 200, метаданные без initiator_tenant_id и полного email |
| `test_get_public_deal_invalid_token_404` | GET с невалидным токеном | 404 (не 403) |
| `test_viewed_status_on_first_get` | Первый GET публичной страницы → status → `viewed`, audit_log содержит IP и UA | 200 |
| `test_sign_without_consent_checkbox_422` | POST `/sign` без чекбокса ПЭП | 422 |
| `test_sign_valid_updates_status_and_creates_final_pdf` | POST `/sign` с подписью → status=`signed`, final_pdf_path заполнен, юр. блок в PDF | 200 |

### `test_deals_public_ratelimit.py` — rate limits (в E2, 2 теста)

| Тест | Что проверяет | Ожидаемый результат |
|------|---------------|---------------------|
| `test_share_token_ratelimit_10_per_min` | 11 GET подряд на один share_token | 11-й: 429 |
| `test_ip_ratelimit_60_per_min` | 61 запрос с одного IP на разные токены | 61-й: 429 |

### `test_deals_expired.py` — ретенция (в E5, 2 теста)

| Тест | Что проверяет | Ожидаемый результат |
|------|---------------|---------------------|
| `test_cron_marks_expired_and_deletes_pdf` | Синтетический deal с expires_at=`now()-1h` → запуск cron → status=`expired`, storage путей нет | 200 |
| `test_expired_deal_returns_410` | GET публичной страницы на expired deal | 410 Gone (или 404, обсуждаемо) |

### `test_deals_no_email.py` — критерий готовности №11 (в E7, 1 тест)

| Тест | Что проверяет | Ожидаемый результат |
|------|---------------|---------------------|
| `test_no_smtp_imports_anywhere` | grep по `signfinder-api/app/` на `import smtplib`, `from email.` и подобное | 0 совпадений (кроме tests/) |

### `test_feedback.py` — опросник в TG (в E6, 1 тест)

| Тест | Что проверяет | Ожидаемый результат |
|------|---------------|---------------------|
| `test_feedback_sends_to_telegram_bot_mocked` | POST `/v1/feedback` с моком `requests.post` к api.telegram.org | 200, mock вызван ровно 1 раз с правильным body |

---

## Что НЕ покрыто (следующая итерация)

- `signfinder-core` unit-тесты в `signfinder-api/tests/` — само ядро
  покрыто на своей стороне (см. `signfinder-core/tests/`, 156 passed на
  v1.20.18), но интеграционных тестов «API-эндпоинт → core-функция»
  минимум, только smoke через мок
- `/v1/me/analyze` happy path (нужен реальный PDF + мок LLM с валидным ответом)
- `/v1/me/sign` happy path
- Тесты на `signfinder-prod` (smoke only через GitHub Actions deploy-prod.yml)
- Rate limiting для приватных эндпоинтов (для публичных Deal Cycle — покрыто в v2.0.0)
- E2E-тест «инициатор подписал → передал ссылку → контрагент подписал
  → оба скачали» — на Playwright, не сделано, кандидат в v2.1
