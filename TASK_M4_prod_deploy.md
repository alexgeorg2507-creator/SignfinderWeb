# TASK: M4 — Prod-деплой с доменом signfinder.app

> ПЕРЕД ЛЮБЫМ ДЕПЛОЕМ — прочитать C:\work\DEPLOY_CONSTRAINTS.md.
> Правила: код API только в signfinder-api/app/, .dockerignore в корне C:\work\,
> версия бампится при каждом коммите core, --force-recreate после ребилда.

## Домен

signfinder.app куплен на Cloudflare. DNS — там же.

## Шаг 1 — Чистый prod-проект

```
gcloud projects create signfinder-prod
gcloud config set project signfinder-prod
gcloud services enable run.googleapis.com sqladmin.googleapis.com \
  firebase.googleapis.com firestore.googleapis.com secretmanager.googleapis.com \
  --project=signfinder-prod
```

Билинг подключить сразу (иначе Secret Manager/Cloud Run упадут, как было на test).

## Шаг 2 — Cloud SQL prod

```
gcloud sql instances create signfinder-db \
  --database-version=POSTGRES_15 --tier=db-f1-micro \
  --region=europe-west1 --project=signfinder-prod
```

Прогнать миграции 001_init.sql и 002 (signatures BYTEA) — те же, что на test.

## Шаг 3 — Firebase Auth prod

- Firebase console → добавить signfinder-prod как Firebase-проект
- Включить провайдеры: Google + Email/Password (verification on)
- Authorized domains → добавить signfinder.app
- Google OAuth consent screen настроить заново (client ID новый — это отдельный проект, старый от test не работает)

## Шаг 4 — Secrets prod

```
gcloud secrets create deepseek-key --project=signfinder-prod
```
Боевой DeepSeek-ключ (можно тот же что на test, но лучше отдельный — не мешать квоты).

## Шаг 5 — Deploy API

Тот же образ, что на test, если конфиг вынесен в env — просто передеплой на новый проект:
```
gcloud run deploy signfinder-api \
  --image=europe-west1-docker.pkg.dev/signfinder-c1163/signfinder/api:latest \
  --region=europe-west1 --project=signfinder-prod \
  --set-env-vars="STORAGE_MODE=cloud,ENV=prod" \
  --set-secrets="DEEPSEEK_API_KEY=deepseek-key:latest"
```
Проверь строку подключения к Cloud SQL prod (unix socket path другой — новый инстанс).

## Шаг 6 — Firebase Hosting + домен

- Firebase Hosting init на signfinder-prod
- Deploy /app (кабинет) + лендинг
- Console → Hosting → Add custom domain → signfinder.app
- Firebase выдаст A/TXT записи → добавить в Cloudflare DNS (Cloudflare proxy ОТКЛЮЧИТЬ на этой записи, иначе конфликт с Firebase SSL — orange cloud OFF, серое облако)
- Ждать SSL-провижининг (обычно 15-60 мин)

## Шаг 7 — PostHog события

signup_started, signup_completed, profile_filled, signature_uploaded, document_signed, limit_reached.
Воронка: signup_started → signup_completed → signature_uploaded → document_signed.
Тот же PostHog EU проект, что на лендинге — не плодить новый.

## Шаг 8 — Smoke-тест на проде

Полный цикл руками на signfinder.app:
регистрация → email verify → профиль → подпись (камера или файл) → сторона → загрузить договор → analyze → sign → скачать PDF.

## Чеклист приёмки

- [ ] signfinder.app открывается, SSL валиден
- [ ] Регистрация Google работает на prod
- [ ] Регистрация email + verify работает на prod
- [ ] Кабинет responsive
- [ ] Полный цикл подписания работает
- [ ] PostHog события летят, воронка видна
- [ ] test и prod изолированы (разные БД, разные auth, разные секреты)
- [ ] ИБ-чеклист из основного TASK повторно проверен на prod (401 без токена, IDOR, лимиты)

## После деплоя

СТОП. 2 недели трафика. Смотрим регистрации и document_signed. Не трогаем код, если не критичный баг.
