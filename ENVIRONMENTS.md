# SignFinder — среды деплоя (test / prod)

> Актуально на 2026-07-02. Собрано командами `gcloud`/`firebase` напрямую из GCP —
> не по памяти. Секреты (пароли/ключи) здесь НЕ хранятся, только их имена и
> команда для получения значения из Secret Manager.

---

## Схема

```
                    ┌─────────────────────────┐
                    │  Локальная машина        │
                    │  signfinder-api/app/     │
                    │  SignfinderLand/          │
                    └────────────┬─────────────┘
                                 │ gcloud builds submit (вручную,
                                 │ отдельно для test и для prod)
                    ┌────────────▼─────────────┐
                    │      Cloud Build          │
                    │  docker build:            │
                    │   COPY app/ (локально)    │
                    │   pip install core        │
                    │   из GitHub@main           │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │ gcr.io/<project>/          │
                    │   signfinder-api           │
                    │ (свой образ на проект,      │
                    │  общего registry нет)       │
                    └──────┬──────────────┬──────┘
                           │              │
                  ┌────────▼──────┐ ┌─────▼──────────┐
                  │  Cloud Run     │ │   Cloud Run     │
                  │  test          │ │   prod          │
                  └────────┬───────┘ └─────┬───────────┘
                           │               │
                  ┌────────▼───────┐ ┌─────▼───────────┐
                  │  Cloud SQL      │ │  Cloud SQL       │
                  │  test           │ │  prod            │
                  └────────────────┘ └──────────────────┘

  Firebase Hosting (test)          Firebase Hosting (prod)
  signfinder-cab-test.web.app      signfinder.app (custom domain)
                                   signfinder-prod.web.app (default)
```

**Важно:** test и prod — это два независимых прогона одной и той же сборки,
не promotion одного образа. GitHub участвует только для `signfinder-core`
(тянется при каждой сборке из `main`); код `signfinder-api` в Docker берётся
из локальной папки, а не из GitHub — пуш в GitHub деплой не блокирует.

---

## TEST — signfinder-cab-test

| Параметр | Значение |
|---|---|
| GCP project ID | `signfinder-cab-test` |
| Cloud Run service | `signfinder-api`, регион `europe-west1` |
| Cloud Run URL | `https://signfinder-api-svmlmbccma-ew.a.run.app` |
| Service account | `signfinder-api@signfinder-cab-test.iam.gserviceaccount.com` |
| Cloud SQL instance | `signfinder-db` (Postgres 15, db-f1-micro, europe-west1-d) |
| Cloud SQL connection name | `signfinder-cab-test:europe-west1:signfinder-db` |
| Cloud SQL public IP | `34.77.161.124` |
| DB name / DB user | `signfinder` / `signfinder` |
| GCS bucket (config) | `signfinder-test-config` |
| Firebase project | `signfinder-cab-test` |
| Firebase authDomain | `signfinder-cab-test.firebaseapp.com` |
| Firebase Hosting URL | `https://signfinder-cab-test.web.app` |
| Кастомный домен | нет |
| Firebase Auth провайдеры | Google, Email/Password (verification on) |
| Cloud Build config | `signfinder-api/cloudbuild-test.yaml` |

**Secret Manager (`signfinder-cab-test`):**
| Имя секрета | Назначение |
|---|---|
| `api-key` | статичный API-ключ для `/v1/analyze`, `/v1/sign` |
| `db-password` | пароль пользователя `signfinder` в Cloud SQL |
| `deepseek-api-key` | ключ DeepSeek (LLM) |
| `firebase-admin-sa` | Firebase Admin SDK JSON (не используется рантаймом — auth идёт через ADC сервис-аккаунта) |

Получить значение (никогда не печатать в чат/лог, только для локального использования):
```powershell
gcloud secrets versions access latest --secret=<имя> --project=signfinder-cab-test
```

---

## PROD — signfinder-prod

> Создан 2026-07-02 с нуля (не путать с legacy-проектом `signfinder-c1163` —
> старый Cloud Run API от 27.06, без cabinet-эндпоинтов, сейчас не используется
> кабинетом, но не удалён).

| Параметр | Значение |
|---|---|
| GCP project ID | `signfinder-prod` |
| Billing account | `0125D3-AC752E-487783` |
| Cloud Run service | `signfinder-api`, регион `europe-west1` |
| Cloud Run URL | `https://signfinder-api-cvuz6bbb7a-ew.a.run.app` |
| Service account | `signfinder-api@signfinder-prod.iam.gserviceaccount.com` |
| Cloud SQL instance | `signfinder-db` (Postgres 15, db-f1-micro, europe-west1) |
| Cloud SQL connection name | `signfinder-prod:europe-west1:signfinder-db` |
| Cloud SQL public IP | `34.77.10.172` |
| DB name / DB user | `signfinder` / `signfinder` |
| GCS bucket (config) | `signfinder-prod-config` |
| Firebase project | `signfinder-prod` |
| Firebase authDomain | `signfinder-prod.firebaseapp.com` |
| Firebase Hosting URL (default) | `https://signfinder-prod.web.app` |
| Кастомный домен | `https://signfinder.app` (SSL провижининг завершён) |
| Firebase Auth провайдеры | Google, Email/Password (verification on) |
| Authorized domains | `localhost`, `signfinder-prod.firebaseapp.com`, `signfinder-prod.web.app`, `signfinder.app` |
| Cloud Build config | `signfinder-api/cloudbuild-prod.yaml` |

**DNS (Cloudflare, registrar = Cloudflare):**
| Тип | Имя | Значение | Proxy |
|---|---|---|---|
| A | `@` (signfinder.app) | `199.36.158.100` | DNS only (обязательно, иначе SSL не провижинится) |
| TXT | `@` (signfinder.app) | `hosting-site=signfinder-prod` | — |

**Secret Manager (`signfinder-prod`):**
| Имя секрета | Назначение | Источник значения |
|---|---|---|
| `api-key` | статичный API-ключ | сгенерирован отдельно для prod |
| `db-password` | пароль пользователя `signfinder` в Cloud SQL | сгенерирован отдельно для prod |
| `deepseek-key` | ключ DeepSeek (LLM) | **скопирован из test** (`deepseek-api-key`) — тот же аккаунт DeepSeek |
| `firebase-admin-sa` | Firebase Admin SDK JSON | сгенерирован в консоли `signfinder-prod`, загружен вручную |

⚠️ Имя секрета для DeepSeek **не совпадает** между средами: `deepseek-api-key` на test,
`deepseek-key` на prod. Исторически так сложилось (test создавался раньше по другому
неймингу) — работает, но неконсистентно, при рефакторинге стоит унифицировать.

Получить значение:
```powershell
gcloud secrets versions access latest --secret=<имя> --project=signfinder-prod
```

---

## Общее для обеих сред

- **Миграции**: `signfinder-api/migrations/001_init.sql`, `002_signature_bytea.sql` — применены в обеих БД (таблицы `users`, `profiles`, `signatures.png_bytes` bytea, `parties`, `usage_counters`)
- **Core версия**: `signfinder-core` v1.20.0 (обе среды, тянется из `github.com/alexgeorg2507-creator/signfinder-core.git@main` при каждой сборке)
- **PostHog**: единый EU-проект `phc_sfzS6t6xSSifT8ibLFjNpwxg6gjY8yAd6HK9DfPoYHJD`, `api_host: eu.i.posthog.com` — события кабинета (`signup_started`, `signup_completed`, `profile_filled`, `signature_uploaded`, `document_signed`, `limit_reached`) и лендинга (`cta_click`, `$pageview` и др.) живут в обеих средах, т.к. деплоятся из одного `app/index.html` / `index.html`
- **Лимиты кабинета**: 5 МБ / 3 стр. на документ, 10 документов в месяц на пользователя (`usage_counters`, атомарная проверка через `SELECT ... FOR UPDATE`)
- **IAM**: `roles/run.invoker` для `allUsers` выдан явно на обоих Cloud Run сервисах (флаг `--allow-unauthenticated` сам по себе биндинг не создаёт — известный баг gcloud)

---

## Известные пробелы (не сделано в рамках M0–M4)

1. **Нет CI/CD** — деплой запускается вручную (`gcloud builds submit`), нет триггера на push, нет автотестов перед раскаткой
2. **Образ не привязан к git-коммиту** — по работающей ревизии Cloud Run нельзя однозначно определить, какой именно коммит задеплоен
3. **test и prod пересобираются независимо** — не единый образ, продвинутый через окружения, а два отдельных билда из одного и того же состояния диска
4. **`signfinder-c1163`** — legacy-проект с устаревшим API (без cabinet-эндпоинтов), не выключен, не используется кабинетом; кандидат на decommission после подтверждения, что нигде не задействован
5. **Неймингом секретов** DeepSeek (см. выше) стоит унифицировать
