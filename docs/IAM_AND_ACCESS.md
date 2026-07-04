# SignFinder — IAM, Service Accounts, GitHub Secrets

> Кто, что, где имеет доступ. Обновлено 2026-07-03 по факту настройки.
> Значения ключей здесь НЕ хранятся.

---

## GCP Service Accounts

### signfinder-cab-test

| SA | Email | Роли | Назначение |
|----|-------|------|------------|
| Cloud Run runtime | `signfinder-api@signfinder-cab-test.iam.gserviceaccount.com` | `cloudsql.client`, `secretmanager.secretAccessor`, `storage.objectAdmin` | Рантайм API на test |
| Cloud Build default | `625189729599@cloudbuild.gserviceaccount.com` | `cloudbuild.builds.builder`, `run.admin`, `editor` | Сборка и деплой |
| GitHub Actions | `github-actions@signfinder-cab-test.iam.gserviceaccount.com` | `cloudbuild.builds.editor`, `secretmanager.secretAccessor`, `cloudsql.client`, `serviceusage.serviceUsageConsumer`, `storage.admin` (project-level), `iam.serviceAccountUser` on compute SA | CI/CD из GitHub Actions |
| Firebase Admin SDK | `firebase-adminsdk-fbsvc@signfinder-cab-test.iam.gserviceaccount.com` | `firebase.sdkAdminServiceAgent`, `firebaseauth.admin`, `iam.serviceAccountTokenCreator` | Firebase — не используется рантаймом API, только Firebase-консолью |

**Примечание по `signfinder-api-sa`:** В IAM `signfinder-cab-test` есть и `signfinder-api-sa@`, и `signfinder-api@` — оба имеют `cloudsql.client` + `secretmanager.secretAccessor`. Первый, судя по всему, легаси SA от ранней настройки. Актуальный — `signfinder-api@signfinder-cab-test.iam.gserviceaccount.com` (прописан в `cloudbuild-test.yaml`).

---

### signfinder-prod

| SA | Email | Роли | Назначение |
|----|-------|------|------------|
| Cloud Run runtime | `signfinder-api@signfinder-prod.iam.gserviceaccount.com` | `cloudsql.client`, `secretmanager.secretAccessor`, `storage.objectAdmin` | Рантайм API на prod |
| Cloud Build default | `449403012307@cloudbuild.gserviceaccount.com` | `cloudbuild.builds.builder`, `run.admin`, `editor` | Сборка и деплой |
| GitHub Actions | `github-actions@signfinder-prod.iam.gserviceaccount.com` | `cloudbuild.builds.editor`, `storage.admin` (project-level), `iam.serviceAccountUser` on compute SA, `run.developer`, `firebasehosting.admin` | CI/CD из GitHub Actions (API деплой + Firebase Hosting деплой) |

**Ключи SA:** у SA может быть несколько активных ключей одновременно.
`signfinder-api` и `SignfinderWeb` используют разные JSON-ключи одного SA.

---

## GitHub Secrets

**Репо `signfinder-api`:**

| Secret | Что содержит | Когда нужен |
|--------|--------------|-------------|
| `GOOGLE_CREDENTIALS_TEST` | SA JSON для `github-actions@signfinder-cab-test` | `ci.yml`, `deploy-test.yml` |
| `GOOGLE_CREDENTIALS_PROD` | SA JSON для `github-actions@signfinder-prod` (ключ #1) | `deploy-prod.yml` |
| `TELEGRAM_BOT_TOKEN` | Bot token | `deploy-prod.yml` |
| `TELEGRAM_CHAT_ID` | Chat ID | `deploy-prod.yml` |

**Репо `SignfinderWeb`:**

| Secret | Что содержит | Когда нужен |
|--------|--------------|-------------|
| `GOOGLE_CREDENTIALS_PROD` | SA JSON для `github-actions@signfinder-prod` (ключ #2, отдельный) | `deploy.yml` |
| `TELEGRAM_BOT_TOKEN` | то же | `deploy.yml` |
| `TELEGRAM_CHAT_ID` | то же | `deploy.yml` |

SA JSON созданы и удалены с диска сразу после добавления в Secrets.

---

## Firebase Auth (не путать с Firebase Admin SDK)

| Проект | Провайдеры | Authorized domains |
|--------|------------|-------------------|
| `signfinder-cab-test` | Google, Email/Password (verification on) | `signfinder-cab-test.web.app`, `localhost` |
| `signfinder-prod` | Google, Email/Password (verification on) | `signfinder.app`, `signfinder-prod.web.app`, `signfinder-prod.firebaseapp.com`, `localhost` |

---

## Владелец

`alexgeorg2507@gmail.com` — Owner на всех активных проектах (`signfinder-cab-test`, `signfinder-prod`).

---

## Что было удалено / не существует

| Что | Статус |
|-----|--------|
| `signfinder-c1163` — весь проект | Удалён 2026-07-03: Cloud Run, Cloud SQL, 5 секретов. Проект в карантине GCP |
| `signfinder` (голый id) | Удалён 2026-07-03 |
| `firebase-admin-sa` секрет | Не существует ни в `cab-test`, ни в `prod` (NOT_FOUND при попытке удалить) — ADC через SA достаточен |
| SA JSON файлы на диске | Удалены с `C:\work\` сразу после добавления в GitHub Secrets |
