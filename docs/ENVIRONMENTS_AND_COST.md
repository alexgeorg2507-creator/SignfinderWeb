# SignFinder — Среды деплоя, стоимость

> Актуально на 2026-07-02. Источник основной части — сводка кодера, собранная
> `gcloud`/`firebase` напрямую из GCP, не по памяти. Независимо перепроверено
> (см. раздел "Сверено отдельно" внизу) — два источника сошлись.
> Секреты (значения) здесь НЕ хранятся, только имена и команда получения.

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
```

**Важно:** test и prod — два независимых прогона одной и той же сборки, не
promotion одного образа. GitHub участвует только для `signfinder-core`
(тянется при каждой сборке из `main`); код `signfinder-api` берётся из
локальной папки, а не из GitHub — пуш в GitHub деплой не блокирует и не
триггерит (CI/CD нет вообще, см. "Известные пробелы").

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
| Firebase Hosting URL | `https://signfinder-cab-test.web.app` |
| Кастомный домен | нет |
| Firebase Auth провайдеры | Google, Email/Password (verification on) |
| Cloud Build config | `signfinder-api/cloudbuild-test.yaml` |

**Secret Manager (`signfinder-cab-test`):**
| Имя | Назначение |
|---|---|
| `api-key` | статичный API-ключ для `/v1/analyze`, `/v1/sign` |
| `db-password` | пароль пользователя `signfinder` в Cloud SQL |
| `deepseek-api-key` | ключ DeepSeek (LLM) |
| `firebase-admin-sa` | Firebase Admin SDK JSON — **не используется рантаймом**, auth идёт через ADC сервис-аккаунта |

```powershell
gcloud secrets versions access latest --secret=<имя> --project=signfinder-cab-test
```

---

## PROD — signfinder-prod

> Создан 2026-07-02 с нуля. Не путать с `signfinder-c1163` — старым Cloud Run
> API от 27.06 без cabinet-эндпоинтов, кабинетом не используется, но не удалён.

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
| Имя | Назначение | Источник |
|---|---|---|
| `api-key` | статичный API-ключ | сгенерирован отдельно для prod |
| `db-password` | пароль Cloud SQL | сгенерирован отдельно для prod |
| `deepseek-key` | ключ DeepSeek (LLM) | скопирован из test (`deepseek-api-key`), тот же аккаунт DeepSeek |
| `firebase-admin-sa` | Firebase Admin SDK JSON | загружен вручную — **не используется рантаймом**, см. ниже |

⚠️ **Имя секрета DeepSeek не совпадает между средами**: `deepseek-api-key` на
test, `deepseek-key` на prod. Исторический нейминг, работает, но
неконсистентно — унифицировать при рефакторинге.

```powershell
gcloud secrets versions access latest --secret=<имя> --project=signfinder-prod
```

---

## Общее для обеих сред

- **Миграции**: `signfinder-api/migrations/001_init.sql`, `002_signature_bytea.sql`
  — применены в обеих БД (`users`, `profiles`, `signatures.png_bytes` bytea,
  `parties`, `usage_counters`)
- **Core версия**: `signfinder-core` v1.20.0 (обе среды, тянется из
  `github.com/alexgeorg2507-creator/signfinder-core.git@main` при каждой сборке)
- **PostHog**: единый EU-проект (`eu.i.posthog.com`) — события кабинета и
  лендинга живут в обеих средах, т.к. деплоятся из одного HTML
- **Лимиты кабинета**: 5 МБ / 3 стр. на документ, 10 документов/мес на
  пользователя (`usage_counters`, атомарно через `SELECT ... FOR UPDATE`)
- **IAM**: `roles/run.invoker` для `allUsers` выдан явно на обоих Cloud Run —
  флаг `--allow-unauthenticated` сам по себе биндинг не создаёт, известный
  баг `gcloud`. Если когда-нибудь права слетят при передеплое — не сюрприз,
  проверить именно это первым

---

## Известные пробелы (не сделано в рамках M0-M4)

1. **Нет CI/CD** — деплой вручную (`gcloud builds submit`), нет триггера на
   push, нет автотестов перед раскаткой
2. **Образ не привязан к git-коммиту** — по живой ревизии Cloud Run нельзя
   определить, какой коммит задеплоен
3. **test и prod пересобираются независимо** — два отдельных билда из одного
   состояния диска, не promotion одного образа
4. **`signfinder-c1163`** — legacy, без cabinet-эндпоинтов, не выключен.
   Статус декоммишна и проверка данных — `SECRETS_REGISTRY.md`, `BACKLOG.md` P0
5. **Нейминг секретов DeepSeek** — унифицировать (см. выше)

---

## Сверено отдельно (независимый аудит, не со слов кодера)

- **`firebase-admin-sa` не используется** — подтверждено не только пометкой
  в этой сводке, но и чтением кода: `app/auth.py::init_firebase()` вызывает
  `firebase_admin.initialize_app()` без явных credentials, чистый ADC. Два
  независимых источника сошлись — можно удалять секрет из Secret Manager
  на обеих средах без риска
- **Cloud Build триггеров нет** — `gcloud builds triggers list` пуст на обеих
  средах, подтверждает пункт 1 выше буквально (не просто "no CI", а
  проверено пустым списком)
- **Четвёртый GCP-проект `signfinder`** (голый id, номер 753184980506,
  создан 25.06 — раньше всех) в сводке кодера не упомянут вообще. Не закрыт,
  не блокирует ничего текущего

---

## Free trial — когда кончается и что происходит

- $300 кредита, действует **90 дней** от создания billing account (не от
  первого использования сервиса)
- Cloud SQL **не входит** в Always Free — с исчерпанием кредита списывается
  сразу по стандартным тарифам
- Cloud Run **входит** в Always Free (2 млн запросов/мес) — скорее всего
  $0/мес при низком трафике даже после trial
- Когда кредит/90 дней кончается без апгрейда — ресурсы **останавливаются**,
  30 дней на восстановление после апгрейда

---

## Ожидаемая стоимость (низкий трафик, MVP-стадия)

| Позиция | $/мес |
|---------|-------|
| Cloud SQL db-f1-micro | $7-10 |
| Cloud SQL storage (~10GB SSD) | ~$1.70 |
| Cloud Run | $0-3 (Always Free покрывает MVP-трафик) |
| Secret Manager (~3 секрета) | ~$0.20 |
| Artifact Registry (~1GB) | ~$0.10 |
| Firebase Hosting/Auth | $0 (Always Free) |
| **Итого на одну среду** | **~$10-15** |
| **test + prod** | **~$20-30** |

**Не включено:** `signfinder-c1163` — третий, лишний, живой стек той же
конфигурации (см. пробел 4 выше). Пока не декоммишнен — фактическая
суммарная стоимость выше расчётной на ~$10-15/мес, не $20-30.

### Когда пересматривать

- Cloud Run начал выставлять счёт — трафик вырос, это хороший знак, не паника
- Один из проектов простаивает — можно остановить Cloud SQL между сессиями
  (`gcloud sql instances patch --activation-policy=NEVER`), экономит ~$8/мес,
  добавляет трение на старте сессии

---

## Действие перед тем как free trial кончится

- [ ] Billing budget alert: $20 (warning), $50 (critical)
  ```powershell
  gcloud billing budgets create --billing-account=0125D3-AC752E-487783 `
    --display-name="SignFinder monthly" --budget-amount=50 `
    --threshold-rule=percent=40 --threshold-rule=percent=100
  ```
- [ ] Записать дату создания billing account, посчитать дедлайн 90 дней
- [ ] За неделю до дедлайна — решить: апгрейд на paid или пауза проекта
