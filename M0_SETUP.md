# M0 Setup — SignFinder Cabinet Infrastructure

Дата: 2026-06-29  
Статус: В процессе (Cloud SQL создаётся)

---

## Что сделано автоматически

| Шаг | Результат |
|-----|-----------|
| Проект test | `signfinder-cab-test` создан, биллинг привязан |
| Проект prod | `signfinder-c1163` (существующий) |
| APIs в test | run, sqladmin, firebase, firestore, secretmanager, storage, identitytoolkit |
| APIs в prod | sqladmin, firestore, secretmanager, storage, identitytoolkit — **добавлены** |
| Firebase test | Firebase добавлен в `signfinder-cab-test` |
| GCS bucket test | `gs://signfinder-test-signatures` (europe-west1) |
| GCS bucket prod | `gs://signfinder-prod-signatures` (europe-west1) |
| Service account test | `signfinder-api-sa@signfinder-cab-test.iam.gserviceaccount.com` |
| Service account prod | `signfinder-api-sa@signfinder-c1163.iam.gserviceaccount.com` |
| IAM roles test | cloudsql.client, storage.objectAdmin, secretmanager.secretAccessor ✓ |
| Secret Manager test | db-password, firebase-admin-sa, api-key, deepseek-api-key (заглушки) |
| Secret Manager prod | db-password, firebase-admin-sa, api-key, deepseek-api-key (заглушки) |
| Cloud SQL test | `signfinder-db` ✓ RUNNABLE (34.77.161.124) |
| Cloud SQL prod | `signfinder-db` ✓ RUNNABLE (34.78.99.152) |
| БД + юзер test | `signfinder` DB и юзер созданы, пароль в Secret Manager (v3) |
| БД + юзер prod | `signfinder` DB и юзер созданы, пароль в Secret Manager (v3) |
| Миграция test | ✓ Применена — 5 таблиц: users, profiles, signatures, parties, usage_counters |
| Миграция prod | ✓ Применена — 5 таблиц в signfinder-c1163 |
| .env шаблоны | `.env.test.example` и `.env.prod.example` в `signfinder-api/` |
| .firebaserc | Обновлён: test=signfinder-cab-test, prod=signfinder-c1163 |

---

## Выполнено автоматически

Cloud SQL RUNNABLE, DB/user созданы, пароль в Secret Manager, миграция применена к test.

## Шаг 1 — Применить миграцию к prod (1 команда)

БД и юзер уже созданы. Осталось применить схему:

```powershell
# Нужны: pip install "cloud-sql-python-connector[pg8000]" (уже есть в signfinder-api/venv)
$env:PYTHONUTF8 = "1"
$env:GOOGLE_APPLICATION_CREDENTIALS = ""  # использует gcloud credentials
cd C:\work\signfinder-api
.\venv\Scripts\python.exe ..\SignfinderLand\scripts\apply_migration_prod.py
```

Или создать SA key временно (как делал скрипт для test) и удалить после применения.

---

## IAM grants для prod (выполнить вручную — требует явного подтверждения)

```powershell
$sa = "signfinder-api-sa@signfinder-c1163.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding signfinder-c1163 --member="serviceAccount:$sa" --role="roles/cloudsql.client"
gcloud projects add-iam-policy-binding signfinder-c1163 --member="serviceAccount:$sa" --role="roles/storage.objectAdmin"
gcloud projects add-iam-policy-binding signfinder-c1163 --member="serviceAccount:$sa" --role="roles/secretmanager.secretAccessor"
```

---

## Firebase Auth провайдеры — ТОЛЬКО через консоль

Firebase CLI не поддерживает включение провайдеров автоматически.

**test: https://console.firebase.google.com/project/signfinder-cab-test/authentication/providers**

Включить:
1. **Email/Password** → Enable → включить Email link (passwordless) опционально
2. **Google** → Enable → указать Project support email

**prod: https://console.firebase.google.com/project/signfinder-c1163/authentication/providers**

Те же шаги.

---

## Firebase Admin SDK ключ

После настройки Auth необходимо скачать ключ сервисного аккаунта Firebase Admin:

1. Firebase Console → Project Settings → Service Accounts → Generate new private key
2. Записать JSON в Secret Manager:

```powershell
# test
gcloud secrets versions add firebase-admin-sa --data-file=firebase-sa-test.json --project=signfinder-cab-test

# prod
gcloud secrets versions add firebase-admin-sa --data-file=firebase-sa-prod.json --project=signfinder-c1163
```

---

## .env файлы (заполнить после SQL + Firebase)

Скопировать шаблоны и заполнить:
```powershell
cp signfinder-api\.env.test.example signfinder-api\.env.test
cp signfinder-api\.env.prod.example signfinder-api\.env.prod
```

Ключевые значения:
- `DATABASE_URL` — connection string с паролем из Secret Manager
- `CLOUD_SQL_INSTANCE` — `signfinder-cab-test:europe-west1:signfinder-db` / `signfinder-c1163:europe-west1:signfinder-db`
- `FIREBASE_PROJECT_ID` — `signfinder-cab-test` / `signfinder-c1163`
- `GCS_BUCKET_NAME` — `signfinder-test-signatures` / `signfinder-prod-signatures`

---

## Чеклист M0

- [x] signfinder-cab-test создан, API включены
- [x] signfinder-c1163 (prod) готов, API дополнены
- [x] Cloud SQL Postgres test — RUNNABLE, БД + миграция применены
- [x] Cloud SQL Postgres prod — RUNNABLE, БД + юзер созданы
- [x] Миграция prod — применена
- [x] IAM prod — cloudsql.client, storage.objectAdmin, secretmanager.secretAccessor назначены
- [x] Firebase Auth провайдеры — Email/Password + Google включены (test + prod)
- [ ] .env.test и .env.prod заполнены — нужны только для локальной разработки (шаблоны готовы)
