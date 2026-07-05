# TASK: Настройка Cloud Monitoring — uptime check, alert policies, notification channel

## Контекст

Проект: `signfinder-prod`, регион `europe-west1`.
Cloud Run API URL: `https://signfinder-api-cvuz6bbb7a-ew.a.run.app`
Pub/Sub topic: `projects/signfinder-prod/topics/signfinder-alerts` — **уже существует**
Cloud Function `alert-to-telegram` — **уже задеплоена, работает**

Нужно создать:
1. Notification channel (Pub/Sub → уже существующий topic)
2. Uptime check для `/health`
3. 4 alert policies

---

## Задача 1 — Notification Channel

```bash
gcloud components install beta --quiet

CHANNEL_NAME=$(gcloud beta monitoring channels create \
  --display-name="SignFinder Telegram" \
  --type=pubsub \
  --channel-labels="topic=projects/signfinder-prod/topics/signfinder-alerts" \
  --project=signfinder-prod \
  --format="value(name)")

echo "Channel: $CHANNEL_NAME"
```

Сохранить `CHANNEL_NAME` — нужен для alert policies.

---

## Задача 2 — Uptime Check

```bash
UPTIME_ID=$(gcloud monitoring uptime create \
  --display-name="SignFinder API health" \
  --resource-type=uptime-url \
  --hostname=signfinder-api-cvuz6bbb7a-ew.a.run.app \
  --path=/health \
  --check-interval=60 \
  --project=signfinder-prod \
  --format="value(name)")

echo "Uptime check: $UPTIME_ID"
```

---

## Задача 3 — Alert Policies (4 штуки через JSON файлы)

Создать файлы в `monitoring/alert_policies/` и применить через API.
Использовать Python + google-auth для REST вызовов (не beta gcloud).

### 3.1 Uptime check failure

```python
policy = {
  "displayName": "SignFinder — API down",
  "conditions": [{
    "displayName": "Uptime check failed",
    "conditionThreshold": {
      "filter": 'resource.type="uptime_url" AND metric.type="monitoring.googleapis.com/uptime_check/check_passed"',
      "comparison": "COMPARISON_LT",
      "thresholdValue": 1,
      "duration": "60s",
      "aggregations": [{"alignmentPeriod": "60s", "perSeriesAligner": "ALIGN_NEXT_OLDER", "crossSeriesReducer": "REDUCE_COUNT_FALSE", "groupByFields": ["resource.label.host"]}]
    }
  }],
  "alertStrategy": {"notificationRateLimit": {"period": "300s"}},
  "notificationChannels": [CHANNEL_NAME],
  "severity": "CRITICAL"
}
```

### 3.2 Cloud Run error rate > 5%

```python
policy = {
  "displayName": "SignFinder — High error rate",
  "conditions": [{
    "displayName": "5xx rate > 5%",
    "conditionThreshold": {
      "filter": 'resource.type="cloud_run_revision" AND resource.labels.service_name="signfinder-api" AND metric.type="run.googleapis.com/request_count" AND metric.labels.response_code_class="5xx"',
      "comparison": "COMPARISON_GT",
      "thresholdValue": 5,
      "duration": "300s",
      "aggregations": [{"alignmentPeriod": "300s", "perSeriesAligner": "ALIGN_RATE"}]
    }
  }],
  "notificationChannels": [CHANNEL_NAME],
  "severity": "ERROR"
}
```

### 3.3 Cloud SQL disk > 80%

```python
policy = {
  "displayName": "SignFinder — Cloud SQL disk high",
  "conditions": [{
    "displayName": "Disk utilization > 80%",
    "conditionThreshold": {
      "filter": 'resource.type="cloudsql_database" AND metric.type="cloudsql.googleapis.com/database/disk/utilization"',
      "comparison": "COMPARISON_GT",
      "thresholdValue": 0.8,
      "duration": "300s",
      "aggregations": [{"alignmentPeriod": "300s", "perSeriesAligner": "ALIGN_MEAN"}]
    }
  }],
  "notificationChannels": [CHANNEL_NAME],
  "severity": "WARNING"
}
```

### 3.4 Firebase Auth failed logins > 50 за 10 мин

Сначала создать log-based metric:
```bash
gcloud logging metrics create firebase-auth-failures \
  --description="Firebase Auth failed login attempts" \
  --log-filter='protoPayload.serviceName="identitytoolkit.googleapis.com" severity>=WARNING' \
  --project=signfinder-prod
```

Потом policy:
```python
policy = {
  "displayName": "SignFinder — Auth anomaly",
  "conditions": [{
    "displayName": "Failed logins > 50 / 10min",
    "conditionThreshold": {
      "filter": 'resource.type="project" AND metric.type="logging.googleapis.com/user/firebase-auth-failures"',
      "comparison": "COMPARISON_GT",
      "thresholdValue": 50,
      "duration": "600s",
      "aggregations": [{"alignmentPeriod": "600s", "perSeriesAligner": "ALIGN_SUM"}]
    }
  }],
  "notificationChannels": [CHANNEL_NAME],
  "severity": "WARNING"
}
```

Применить все 4 политики через REST API:
```python
import json, urllib.request, subprocess

token = subprocess.check_output(['gcloud','auth','print-access-token']).decode().strip()
project = 'signfinder-prod'
url = f'https://monitoring.googleapis.com/v3/projects/{project}/alertPolicies'

for policy in [policy_1, policy_2, policy_3, policy_4]:
    data = json.dumps(policy).encode()
    req = urllib.request.Request(url, data=data, headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    })
    resp = json.loads(urllib.request.urlopen(req).read())
    print(f"Created: {resp.get('displayName')} — {resp.get('name')}")
```

---

## Задача 4 — Проверка (smoke test мониторинга)

После создания всех ресурсов:

```bash
# Uptime checks
gcloud monitoring uptime list-configs --project=signfinder-prod --format="table(displayName,name)"

# Notification channels
gcloud beta monitoring channels list --project=signfinder-prod --format="table(displayName,type)"

# Alert policies  
gcloud beta monitoring policies list --project=signfinder-prod --format="table(displayName,enabled)"

# Тест нотификации через Pub/Sub
python3 monitoring/send_test_alert.py
```

В Telegram должно прийти сообщение `🚨 SignFinder Alert`.

---

## Definition of Done

- [ ] Notification channel типа `pubsub` создан, указывает на `signfinder-alerts` topic
- [ ] Uptime check для `/health` активен
- [ ] 4 alert policies созданы и enabled
- [ ] Log-based metric `firebase-auth-failures` создана
- [ ] Тест через `send_test_alert.py` → сообщение в Telegram
- [ ] Обновить `BACKLOG.md` — отметить мониторинг как закрытый

## Что НЕ делать

- Не трогать `alert-to-telegram` Cloud Function — она работает
- Не пересоздавать Pub/Sub topic
- Не трогать Dockerfile, тесты, cloudbuild-*.yaml
