# TASK: Monitoring — Telegram alerts via Pub/Sub + Cloud Function

## Контекст

Проект: `signfinder-prod`, регион `europe-west1`.
Cloud Run API: `https://signfinder-api-cvuz6bbb7a-ew.a.run.app`
Cloud SQL: `signfinder-db`, Postgres 15, `db-f1-micro`
GCS config bucket: `signfinder-prod-config`
Firebase проект: `signfinder-prod`

Telegram Bot: создать через @BotFather, получить `BOT_TOKEN` и `CHAT_ID`.
Значения положить в Secret Manager:
```powershell
gcloud secrets create telegram-bot-token --project=signfinder-prod
gcloud secrets create telegram-chat-id --project=signfinder-prod
```

---

## Архитектура

```
Cloud Monitoring Alert Policy
        │ notification channel (Pub/Sub)
        ▼
Pub/Sub topic: signfinder-alerts
        │ trigger
        ▼
Cloud Function: alert-to-telegram (Python, gen2)
        │ POST
        ▼
Telegram Bot API → твой чат/канал
```

---

## Задача 1 — Pub/Sub топик

```powershell
gcloud pubsub topics create signfinder-alerts --project=signfinder-prod
```

---

## Задача 2 — Cloud Function: alert-to-telegram

### Расположение кода
Создать в `signfinder-api/monitoring/alert_to_telegram/`:
- `main.py`
- `requirements.txt`

### main.py — логика

- Триггер: Pub/Sub push (CloudEvent)
- Декодировать base64 payload из Pub/Sub сообщения
- Распарсить JSON: взять `incident.condition_name`, `incident.state`,
  `incident.summary`, `incident.url`
- Сформировать текст сообщения:
  ```
  🚨 SignFinder Alert
  Condition: <condition_name>
  State: <state> (open/closed)
  Summary: <summary>
  Details: <url>
  ```
  Если `state == "closed"` — префикс `✅` вместо `🚨`
- Взять `BOT_TOKEN` и `CHAT_ID` из переменных окружения (не из кода)
- POST на `https://api.telegram.org/bot{BOT_TOKEN}/sendMessage`
  с `chat_id` и `text`, `parse_mode=HTML`
- При ошибке Telegram API — логировать, не падать (не ретриггерить Pub/Sub)

### requirements.txt
```
functions-framework==3.*
requests==2.*
```

### Деплой

```powershell
gcloud functions deploy alert-to-telegram `
  --gen2 `
  --runtime=python311 `
  --region=europe-west1 `
  --source=monitoring/alert_to_telegram `
  --entry-point=alert_to_telegram `
  --trigger-topic=signfinder-alerts `
  --project=signfinder-prod `
  --set-secrets="BOT_TOKEN=telegram-bot-token:latest,CHAT_ID=telegram-chat-id:latest" `
  --memory=256Mi `
  --timeout=30s
```

---

## Задача 3 — Cloud Monitoring: Notification Channel

```powershell
# Получить topic URI
$TOPIC_URI = "projects/signfinder-prod/topics/signfinder-alerts"

# Создать notification channel через API (gcloud не поддерживает pubsub channel напрямую)
# Использовать: gcloud alpha monitoring channels create
gcloud alpha monitoring channels create `
  --display-name="SignFinder Telegram" `
  --type=pubsub `
  --channel-labels="topic=$TOPIC_URI" `
  --project=signfinder-prod
```

Сохранить вывод — нужен `name` канала (вида `projects/.../notificationChannels/...`)
для использования в alert policies ниже.

---

## Задача 4 — Alert Policies (5 штук)

Для каждой политики: создать через `gcloud alpha monitoring policies create`
или через JSON-файл. Рекомендую JSON-файлы в `monitoring/alert_policies/`.

### 4.1 Uptime Check — `/health` endpoint

Сначала создать uptime check:
```powershell
gcloud monitoring uptime create `
  --display-name="SignFinder API health" `
  --resource-type=uptime-url `
  --hostname=signfinder-api-cvuz6bbb7a-ew.a.run.app `
  --path=/health `
  --check-interval=60 `
  --project=signfinder-prod
```

Затем alert policy: если uptime check failed — триггер немедленно.
Severity: CRITICAL.

### 4.2 Cloud Run error rate >5% за 5 минут

Метрика: `run.googleapis.com/request_count`
Фильтр: `resource.labels.service_name="signfinder-api"`,
`metric.labels.response_code_class="5xx"`
Условие: rate за 5 мин > 0.05 (5% от total requests)
Severity: ERROR.

### 4.3 Cloud SQL disk usage >80%

Метрика: `cloudsql.googleapis.com/database/disk/utilization`
Фильтр: `resource.labels.database_id` содержит `signfinder-db`
Условие: value > 0.8
Severity: WARNING.

### 4.4 Firebase Auth failed logins >50 за 10 минут

Log-based metric (создать отдельно):
```powershell
gcloud logging metrics create firebase-auth-failures `
  --description="Firebase Auth failed login attempts" `
  --log-filter='resource.type="identitytoolkit.googleapis.com/Project" severity=WARNING' `
  --project=signfinder-prod
```
Alert policy: если `logging.googleapis.com/user/firebase-auth-failures` > 50 за 10 мин.
Severity: WARNING.

### 4.5 Cloud Run — нет ни одного успешного запроса за 15 минут (мёртвый сервис)

Метрика: `run.googleapis.com/request_count`
Фильтр: `response_code_class="2xx"`
Условие: sum за 15 мин == 0 (absent или == 0)
Severity: ERROR.
Примечание: может срабатывать ночью при нулевом трафике — добавить
`min-instances=0` защиту или использовать uptime check вместо этой политики
если вызывает шум.

---

## Задача 5 — GCS bucket versioning

```powershell
gcloud storage buckets update gs://signfinder-prod-config `
  --versioning `
  --project=signfinder-prod
```

---

## Задача 6 — Firebase Auth weekly export

### Cloud Function: firebase-auth-export

Создать в `signfinder-api/monitoring/firebase_auth_export/`:
- `main.py`
- `requirements.txt`

Логика:
- Триггер: HTTP (вызывается Cloud Scheduler)
- Запустить `firebase auth:export` через subprocess ИЛИ использовать
  Firebase Admin SDK `auth.list_users()` (предпочтительнее — без CLI)
- Сохранить JSON с полями: `uid`, `email`, `creationTime`, `lastSignInTime`
  (без паролей, без токенов)
- Загрузить в GCS: `gs://signfinder-prod-config/auth-backups/users-YYYY-MM-DD.json`
- Хранить последние 4 файла (один месяц), старые удалять

```powershell
gcloud functions deploy firebase-auth-export `
  --gen2 `
  --runtime=python311 `
  --region=europe-west1 `
  --source=monitoring/firebase_auth_export `
  --entry-point=firebase_auth_export `
  --trigger-http `
  --no-allow-unauthenticated `
  --project=signfinder-prod `
  --service-account=signfinder-api@signfinder-prod.iam.gserviceaccount.com `
  --memory=256Mi `
  --timeout=120s
```

Cloud Scheduler:
```powershell
gcloud scheduler jobs create http firebase-auth-weekly-export `
  --schedule="0 4 * * 1" `
  --uri="https://europe-west1-signfinder-prod.cloudfunctions.net/firebase-auth-export" `
  --http-method=POST `
  --oidc-service-account-email=signfinder-api@signfinder-prod.iam.gserviceaccount.com `
  --project=signfinder-prod `
  --location=europe-west1
```

---

## IAM — что нужно добавить

```powershell
# Cloud Functions SA нужен доступ к Secret Manager (уже есть у signfinder-api SA)
# Pub/Sub publisher для Cloud Monitoring
gcloud projects add-iam-policy-binding signfinder-prod `
  --member="serviceAccount:service-449403012307@gcp-sa-monitoring-notification.iam.gserviceaccount.com" `
  --role="roles/pubsub.publisher"
```

---

## Definition of Done

- [ ] Pub/Sub топик `signfinder-alerts` создан
- [ ] Cloud Function `alert-to-telegram` задеплоена, тест-сообщение в Telegram получено
- [ ] Notification channel создан, привязан к функции
- [ ] 4 alert policies созданы (uptime, error rate, disk, auth failures)
- [ ] GCS versioning включён на `signfinder-prod-config`
- [ ] Cloud Function `firebase-auth-export` задеплоена
- [ ] Cloud Scheduler job создан, первый экспорт прошёл
- [ ] `IAM_AND_ACCESS.md` и `BACKLOG.md` обновлены по результатам

## Что НЕ делать

- Не хранить BOT_TOKEN и CHAT_ID в коде или в репо
- Не давать `allUsers` доступ к `firebase-auth-export` функции
- Не логировать содержимое Pub/Sub payload целиком (может содержать служебные данные)
- Не трогать `cloudbuild-prod.yaml`, `Dockerfile`, существующие тесты
