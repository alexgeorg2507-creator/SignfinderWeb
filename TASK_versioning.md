# TASK: Сквозное версионирование — API, Core, Web, CI/CD

## Контекст и проблема

`signfinder-api/pyproject.toml` → `1.9.0`
`signfinder-api/app/main.py` → FastAPI `version="1.18.3"`, docstring `v1.18.4`
→ три разных значения. Источник истины — `pyproject.toml`. Привести к согласованности.

`/v1/version` эндпоинт уже существует в `app/routers/system.py`.
Нужно расширить, не переписывать.

Web-клиент (`SignfinderLand/app/index.html`) — версия нигде не отображается.

---

## Задача 1 — Единый источник истины для версии API

### 1.1 pyproject.toml
Установить версию `1.18.4` (последняя ручная из docstring).
Дальше — единственное место где меняется версия.

### 1.2 app/main.py
Убрать хардкод `version="1.18.3"` и `v1.18.4` из docstring.
Читать через `importlib.metadata`:

```python
from importlib.metadata import version as _pkg_version
_API_VERSION = _pkg_version("signfinder-api")
```

Передавать в FastAPI: `version=_API_VERSION`

### 1.3 app/routers/system.py — расширить /v1/version и /health

`/v1/version` должен вернуть:
```json
{
  "api_version": "1.18.4",
  "api_build": "42",
  "api_sha": "abc1234",
  "signfinder_core_version": "1.20.7",
  "environment": "production"
}
```

`/health` должен вернуть:
```json
{
  "status": "ok",
  "api_version": "1.18.4",
  "api_build": "42",
  "core_version": "1.20.7"
}
```

`api_build` и `api_sha` — из env vars `BUILD_NUMBER` и `BUILD_SHA`
(пустые строки если не заданы — локальная разработка).

### 1.4 Логировать при старте в lifespan (main.py):
```
SignFinder API v1.18.4 (build #42, sha: abc1234) starting up...
SignFinder Core v1.20.7 loaded.
```

---

## Задача 2 — Версия в web-клиенте

### 2.1 SignfinderLand/app/index.html

Добавить в topbar (рядом с `.topbar-logo`) маленький бейдж с версией.
Версия читается из `window.__SF_VERSION__` — переменная, которую CI
инжектит перед деплоем.

HTML в topbar:
```html
<div class="topbar-logo">
  SignFinder
  <span id="app-version-badge" style="font-size:11px;font-weight:400;color:var(--c-muted);margin-left:6px"></span>
</div>
```

JavaScript (добавить в блок `<script type="module">`):
```javascript
// Version badge — injected by CI, fallback to 'dev'
const _sfVersion = (typeof window.__SF_VERSION__ !== 'undefined') ? window.__SF_VERSION__ : 'dev';
const _vBadge = document.getElementById('app-version-badge');
if (_vBadge) _vBadge.textContent = 'v' + _sfVersion;
```

### 2.2 SignfinderLand/version.txt
Создать файл `SignfinderLand/version.txt` с содержимым `1.0.0`.
CI будет перезаписывать его перед деплоем.

---

## Задача 3 — GitHub Actions: inject BUILD_NUMBER и BUILD_SHA

### 3.1 ci.yml — добавить шаг после checkout, до install:
```yaml
- name: Extract versions
  run: |
    API_VERSION=$(python3 -c "import tomllib; d=tomllib.load(open('pyproject.toml','rb')); print(d['project']['version'])")
    CORE_VERSION=$(pip show signfinder-core 2>/dev/null | grep Version | awk '{print $2}' || echo "unknown")
    echo "API_VERSION=$API_VERSION" >> $GITHUB_ENV
    echo "CORE_VERSION=$CORE_VERSION" >> $GITHUB_ENV
    echo "BUILD_SHA=${GITHUB_SHA::7}" >> $GITHUB_ENV
    echo "BUILD_NUMBER=$GITHUB_RUN_NUMBER" >> $GITHUB_ENV
```

Добавить после шага "Run tests":
```yaml
- name: Log versions
  run: |
    echo "API: ${{ env.API_VERSION }} build #${{ env.BUILD_NUMBER }} (${{ env.BUILD_SHA }})"
    echo "Core: ${{ env.CORE_VERSION }}"
```

### 3.2 deploy-test.yml — передавать BUILD_NUMBER и BUILD_SHA в Cloud Build

После шага checkout добавить:
```yaml
- name: Extract versions
  run: |
    API_VERSION=$(python3 -c "import tomllib; d=tomllib.load(open('pyproject.toml','rb')); print(d['project']['version'])")
    echo "API_VERSION=$API_VERSION" >> $GITHUB_ENV
    echo "BUILD_SHA=${GITHUB_SHA::7}" >> $GITHUB_ENV
    echo "BUILD_NUMBER=$GITHUB_RUN_NUMBER" >> $GITHUB_ENV
```

В шаге "Deploy to Cloud Run" перед `gcloud builds submit` добавить
инъекцию env vars через `--substitutions` или как дополнительный шаг
после деплоя — обновить Cloud Run env vars:
```bash
gcloud run services update signfinder-api \
  --project=signfinder-cab-test \
  --region=europe-west1 \
  --update-env-vars="BUILD_NUMBER=${BUILD_NUMBER},BUILD_SHA=${BUILD_SHA}" \
  --quiet
```

Финальный шаг — логировать версии (не отправлять в Telegram):
```yaml
- name: Log deployed versions
  run: |
    sleep 10
    VERSIONS=$(curl -sf https://signfinder-api-svmlmbccma-ew.a.run.app/v1/version || echo '{}')
    echo "Deployed to test:"
    echo "$VERSIONS"
```

### 3.3 deploy-prod.yml — inject + Telegram нотификация

После шага "Extract versions" (аналогично test) и после успешного smoke test
добавить шаг:

```yaml
- name: Get live versions from prod
  run: |
    sleep 15
    VERSIONS=$(curl -sf https://signfinder-api-cvuz6bbb7a-ew.a.run.app/v1/version || echo '{}')
    API_V=$(echo "$VERSIONS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('api_version','?'))")
    API_B=$(echo "$VERSIONS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('api_build','?'))")
    API_S=$(echo "$VERSIONS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('api_sha','?'))")
    CORE_V=$(echo "$VERSIONS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('signfinder_core_version','?'))")
    echo "LIVE_API_V=$API_V" >> $GITHUB_ENV
    echo "LIVE_API_B=$API_B" >> $GITHUB_ENV
    echo "LIVE_API_S=$API_S" >> $GITHUB_ENV
    echo "LIVE_CORE_V=$CORE_V" >> $GITHUB_ENV

- name: Notify Telegram — prod deployed
  env:
    TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
    TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
  run: |
    WEB_VERSION=$(cat SignfinderLand/version.txt 2>/dev/null || echo "?")
    TEXT="✅ SignFinder PROD deployed%0A"
    TEXT="${TEXT}API: ${{ env.LIVE_API_V }} (build %23${{ env.LIVE_API_B }}, ${{ env.LIVE_API_S }})%0A"
    TEXT="${TEXT}Core: ${{ env.LIVE_CORE_V }}%0A"
    TEXT="${TEXT}Web: ${WEB_VERSION}%0A"
    TEXT="${TEXT}Run: %23${{ github.run_number }} by ${{ github.actor }}"
    curl -sf -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TELEGRAM_CHAT_ID}&text=${TEXT}"
```

Также добавить `--update-env-vars` для prod аналогично test:
```bash
gcloud run services update signfinder-api \
  --project=signfinder-prod \
  --region=europe-west1 \
  --update-env-vars="BUILD_NUMBER=${BUILD_NUMBER},BUILD_SHA=${BUILD_SHA}" \
  --quiet
```

---

## Задача 4 — Web deploy: inject версию в HTML

**SignfinderLand деплоится отдельно через Firebase Hosting** (`firebase deploy`).
В `deploy-prod.yml` добавить шаг ПЕРЕД `firebase deploy`:

```yaml
- name: Inject version into web client
  run: |
    WEB_VERSION=$(cat SignfinderLand/version.txt 2>/dev/null || echo "1.0.0")
    BUILD_INFO="${WEB_VERSION}+${BUILD_NUMBER}"
    # inject window.__SF_VERSION__ в index.html
    sed -i "s|window\.__SF_VERSION__\s*=[^;]*;|window.__SF_VERSION__ = '${BUILD_INFO}';|g" \
      SignfinderLand/app/index.html
    # если переменная ещё не объявлена — добавить перед </head>
    if ! grep -q '__SF_VERSION__' SignfinderLand/app/index.html; then
      sed -i "s|</head>|<script>window.__SF_VERSION__ = '${BUILD_INFO}';</script></head>|" \
        SignfinderLand/app/index.html
    fi
```

Примечание: если Firebase Hosting деплой пока не в `deploy-prod.yml` —
добавить его после `gcloud builds submit`:
```yaml
- name: Deploy Firebase Hosting (prod)
  run: firebase deploy --only hosting --project=signfinder-prod
```

Установить `firebase-tools` если нужно:
```yaml
- name: Install firebase-tools
  run: npm install -g firebase-tools
```

---

## Definition of Done

- [ ] `pyproject.toml` версия `1.18.4`, единственное место для изменения
- [ ] `main.py` читает версию через `importlib.metadata`, хардкод убран
- [ ] `GET /v1/version` возвращает `api_version`, `api_build`, `api_sha`, `signfinder_core_version`, `environment`
- [ ] `GET /health` возвращает `api_version`, `api_build`, `core_version`
- [ ] Startup log содержит версии api и core с build номером
- [ ] `version.txt` существует в `SignfinderLand/`
- [ ] Бейдж версии виден в topbar кабинета
- [ ] `ci.yml` логирует версии api и core
- [ ] `deploy-test.yml` логирует задеплоенные версии из живого `/v1/version`
- [ ] `deploy-prod.yml` после успешного деплоя отправляет в Telegram сообщение с версиями api, core, web
- [ ] `deploy-prod.yml` инжектит `BUILD_NUMBER` и `BUILD_SHA` в Cloud Run env
- [ ] Тест: `curl https://signfinder-api-cvuz6bbb7a-ew.a.run.app/v1/version` возвращает все поля
- [ ] Тест: в кабинете в topbar виден бейдж `vX.Y.Z+NN`
- [ ] Тест: после prod-деплоя в Telegram пришло сообщение с версиями

## Что НЕ делать

- Не трогать `cloudbuild-*.yaml` и `Dockerfile` — версии инжектятся после деплоя через `gcloud run services update`
- Не хранить Telegram токен нигде кроме GitHub Secrets
- Не менять схему БД, не трогать тесты (pytest), не трогать `monitoring/`
- Не автоматически инкрементировать семантическую версию в `pyproject.toml` — только developer это делает руками
