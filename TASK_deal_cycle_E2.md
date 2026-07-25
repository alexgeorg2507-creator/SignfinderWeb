# TASK: SignfinderLand v2.0.0 Deal Cycle — Эпик E2 (Публичная страница подписания)

## Контекст

E1 закрыт: модель `Deal`, миграция 003, приватные API инициатора —
задеплоено на test, подтверждено. Отдельно закрыт баг LLM-пайплайна
(reasoning-модель на Шаге 4) — не связан с Deal Cycle, не трогать.

**E2 — самый крупный эпик (3-4 дня), затрагивает ДВА репозитория:**

1. **Backend** (`signfinder-api`) — публичные API-эндпоинты без auth,
   защищённые `share_token`
2. **Frontend** (`SignfinderLand`, git remote `SignfinderWeb`) — новая
   публичная HTML-страница `/sign/{token}`

Работать над ними можно последовательно (backend → frontend) или
параллельно если удобнее, но **два разных PR в двух разных репозиториях**.
Не смешивать.

---

## §1. READING GATE — обязательное первое действие

До первой строки кода прочитать и отправить подтверждающее сообщение по
шаблону ниже.

### 1.1 Что прочитать

**Общее:**
1. `C:\work\SignfinderLand\docs\GIT_WORKFLOW.md` — целиком, особенно
   §Явные запреты (все 7 пунктов теперь), §Не изобретай инфраструктуру,
   §Известные технические дыры, §CI/CD (обновлено 2026-07-25 — веб-деплой
   на push идёт на **test**, не на prod, это важно для этого эпика)
2. `C:\work\SignfinderLand\docs\DEAL_CYCLE_SPEC.md` v1.2 — весь §5, §5.5,
   §5.6, §5.7, §6, §7, §8 (раздел E2), §9 (критерии 12, 13)
3. `C:\work\SignfinderLand\docs\THREAT_MODEL_DEAL_CYCLE.md` — весь
   документ, это твоя техническая спецификация защиты. Особое внимание
   §3.A, §3.B, §3.D, §3.E, §3.G, §3.H и §6 (список тестов)
4. `C:\work\SignfinderLand\docs\RUNBOOK_TESTING.md` — секция
   `test_deals_public.py`, `test_deals_public_ratelimit.py`

**Backend:**
5. `C:\work\signfinder-api\app\routers\deals.py` — твой же код из E1,
   образец стиля для приватных эндпоинтов
6. `C:\work\signfinder-api\app\models\deal.py` — существующие модели,
   сюда добавишь `DealPublicView`
7. `C:\work\signfinder-api\app\routers\signature_process.py` — как
   устроен `POST /v1/signers/{id}/signature/process` (OpenCV-обработка),
   это то что будешь дёргать для контрагента с временным signer_id

**Frontend:**
8. `C:\work\SignfinderLand\app\index.html` — **не читать целиком (89KB),
   но открыть и посмотреть**: секцию `<style>` (CSS-переменные `--c-bg`,
   `--c-accent` и т.д., классы `.upload-label`, `.sig-img-processed`,
   `.msg`, `.btn`, `.card`) — переиспользуй этот дизайн-язык, не изобретай
   свой. Также глянь как вызывается PostHog (`posthog.init(...)` в начале
   `<head>`) и как оформлены fetch-вызовы к `/api/v1/...`
9. `C:\work\SignfinderLand\firebase.json` — текущие `rewrites`, увидишь
   паттерн `/app/**` → `/app/index.html`, по нему добавишь `/sign/**`
10. `C:\work\SignfinderLand\.github\workflows\deploy.yml` и
    `deploy-prod.yml` — как версия инжектится в HTML, куда деплоится

### 1.2 Шаблон подтверждающего сообщения

```
Прочитал:
- GIT_WORKFLOW.md — все 7 пунктов §Явные запреты, §CI/CD (веб деплоится
  на push на TEST, не prod), §Известные технические дыры
- DEAL_CYCLE_SPEC.md v1.2 §5, §5.5-5.7, §6-9
- THREAT_MODEL_DEAL_CYCLE.md — весь, понимаю атаки A/B/D/E/G/H и что
  конкретно от них защищает мой код
- deals.py, deal.py, signature_process.py (backend референсы)
- app/index.html дизайн-система, firebase.json rewrites (frontend референсы)

План действий:
Backend:
1. [шаг]
...
Frontend:
1. [шаг]
...

Начинаю с [шага]. Ожидаю подтверждения владельца или коррекций.
```

**Без этого сообщения — не начинать.**

---

## §2. Backend — signfinder-api

### 2.1 Pydantic-модель `DealPublicView` в `app/models/deal.py`

Строгий whitelist (спека §5.5, threat model §3.F):

```python
class DealPublicView(BaseModel):
    """GET /v1/public/deals/{token} — то что видит анонимный контрагент"""
    model_config = ConfigDict(extra='forbid')
    initiator_email: str
    status: DealStatus
    expires_at: datetime
    counterparty_anchors: list[dict]  # только сторона контрагента, отфильтровано
    has_pdf: bool
    has_final_pdf: bool

class DealSignRequest(BaseModel):
    """POST /v1/public/deals/{token}/sign payload"""
    model_config = ConfigDict(extra='forbid')
    signature_png_b64: str
    consent_pep: bool  # обязательно True, валидатором
    signature_source: Literal['camera', 'file', 'canvas']

    @field_validator('consent_pep')
    @classmethod
    def must_consent(cls, v):
        if not v:
            raise ValueError('ПЭП-согласие обязательно')
        return v
```

**Явный тест что НЕ содержится** в сериализованном `DealPublicView`:
`initiator_tenant_id`, `initiator_firebase_uid`, storage-пути, полный
`audit_log` — см. threat model §3.F. Тест `test_public_view_no_sensitive_fields`
(§4 ниже) это проверяет — держи схему такой чтобы тест естественно проходил.

### 2.2 Роутер `app/routers/deals_public.py` (новый файл, отдельный от `deals.py`)

Отдельный файл — приватные и публичные эндпоинты физически разделены,
чтобы не перепутать зависимость авторизации по недосмотру.

**GET `/v1/public/deals/{share_token}`**
- Найти deal по `share_token`. Не найден → **404** (не 403 — threat model §3.A/§3.C)
- Если `status == 'sent'` и это первый просмотр → атомарно перевести в `viewed`,
  добавить событие в `audit_log` с IP+UA (спека §5.7 — атомарный UPDATE)
- Отфильтровать `saved_anchors` по `party_role` — отдать только сторону контрагента
- Вернуть `DealPublicView`

**GET `/v1/public/deals/{share_token}/pdf`**
- PDF с подписью инициатора (`initiator_signed_pdf_path`), либо финальный
  если уже `signed` (см. §2.5 ниже — после подписания viewer показывает
  финальный)
- Streaming, `Content-Type: application/pdf`
- Deal не найден → 404

**POST `/v1/public/deals/{share_token}/sign`**
- Принимает `DealSignRequest`
- **ID сделки только из URL** (`share_token`), никогда из body — спека §5.7,
  threat model §3.B. Убедиться что `DealSignRequest` физически не содержит
  поля с идентификаторами (Pydantic `extra='forbid'` плюс явно не добавлять
  такие поля в схему)
- Вызвать `POST /v1/signers/{tmp_id}/signature/process` из уже существующего
  `signature_process.py` — `tmp_id` генерируется на лету (uuid4), не
  персистится как реальный signer, только для обработки этого конкретного
  base64 PNG через OpenCV pipeline
- Наложить обработанную подпись на PDF инициатора через существующий
  `/v1/sign` (внутренний вызов, не HTTP — как это сейчас организовано,
  смотри как `deals.py` из E1 обращается к storage/core, повтори паттерн)
  используя якоря стороны контрагента из `saved_anchors`
- Сгенерировать финальный PDF с юр. блоком (спека §7 — это можно сделать
  в E2 сразу, не откладывать на E7, раз всё равно пишешь код наложения;
  если решишь отложить формат самого текста блока до E7 — минимум оставь
  точку интеграции, TODO с ссылкой на §7)
- Сохранить `deals/{deal_id}/final.pdf` в storage
- **Атомарный UPDATE** (спека §5.7, точный SQL уже есть в спеке — скопировать):
  ```sql
  UPDATE deals
  SET status='signed', final_pdf_path=$1, counterparty_signature_meta=$2,
      audit_log = audit_log || $3::jsonb
  WHERE share_token=$4 AND status IN ('sent','viewed')
  RETURNING id
  ```
  0 строк обновлено → **409 Conflict** (двойная подпись, threat model §3.E)
- Вернуть подтверждение (не обязательно полный `Deal`, минимум — `{status: "signed"}`)

**GET `/v1/public/deals/{share_token}/final-pdf`**
- Только если `status == 'signed'`, иначе 404
- Streaming, `Content-Type: application/pdf`

### 2.3 Rate limiting — SlowAPI

Установить `slowapi` в `pyproject.toml`. **Немедленно сверить с
Dockerfile** (см. §Известные технические дыры пункт 1 в GIT_WORKFLOW —
это тот самый класс бага что уже случился с `nanoid`).

- 10 req/min на `share_token`
- 60 req/min на IP (ключ — `X-Forwarded-For` с фоллбеком на RemoteAddr,
  учти что Cloud Run стоит за прокси)
- Применить ко всем 4 публичным эндпоинтам

### 2.4 Security headers

На публичных эндпоинтах (или глобально через middleware, если проще):
- `Content-Security-Policy: default-src 'self'`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`

Смотри threat model §3.H для обоснования каждого.

### 2.5 Что происходит с PDF viewer после signed

Спека §3 (обновлено в v1.2): после `signed` страница показывает финальный
PDF в viewer (не только кнопку «Скачать» — полный просмотр). Значит GET
`/pdf` эндпоинт (§2.2) должен возвращать `final_pdf_path` если он есть,
иначе `initiator_signed_pdf_path`. Не два разных вызова с разной логикой
на фронте — один эндпоинт умный по состоянию.

### 2.6 GCS bucket — НЕ создавать в этом эпике

Как договорились в E1 — separate `signfinder-prod-deals` bucket с
`uniformBucketLevelAccess` это followup infra task перед prod-деплоем
всего Deal Cycle, не блокер для E2 на test. Продолжай писать в тот же
bucket с префиксом `deals/` как в E1.

### 2.7 Тесты `tests/test_deals_public.py` и `test_deals_public_ratelimit.py`

Из `RUNBOOK_TESTING.md`, 7 тестов:

- `test_get_public_deal_by_token_no_auth`
- `test_get_public_deal_invalid_token_404`
- `test_viewed_status_on_first_get`
- `test_sign_without_consent_checkbox_422`
- `test_sign_valid_updates_status_and_creates_final_pdf`
- `test_share_token_ratelimit_10_per_min`
- `test_ip_ratelimit_60_per_min`

Плюс из threat model §6, если ещё не покрыты выше:
- `test_public_view_no_sensitive_fields`
- `test_sign_race_condition_409` (двойной параллельный POST)
- `test_sign_extra_fields_422` (Pydantic `extra='forbid'`)

### 2.8 Бамп версии

`pyproject.toml`: `1.19.0` → `1.19.1`.

---

## §3. Frontend — SignfinderLand (веб-клиент)

### 3.1 Новый файл `C:\work\SignfinderLand\sign\index.html`

Одноэкранный вариант, макет уже согласован с владельцем (ASCII-兀скетч
в предыдущем обсуждении, воспроизвожу структуру):

```
┌──────────────────────────────────┐
│ SignFinder (минимальный topbar)  │
├──────────────────────────────────┤
│ Договор от {initiator_email}     │
│ на подпись                       │
│                                  │
│ [PDF viewer, скролл внутри]      │  ← из GET /pdf (или final после signed)
│                                  │
│ ──────────────────────────────── │
│ ⓘ ПЭП-дисклеймер [читать далее]  │
│ ☐ Обязательный чекбокс ПЭП       │
│ ──────────────────────────────── │
│ Ваша подпись:                    │
│ [📷 Фото][📁 Файл][✏️ Нарис.]   │  ← 3 таба
│ [активная зона выбранного таба]  │
│ ──────────────────────────────── │
│ Как будет выглядеть подпись:     │
│ [spinner → результат OpenCV]     │  ← вызов /v1/signers/.../process
│ Уверенность: X% ⓘ                │     через backend (не напрямую)
│ [Загрузить другую]               │
│ ──────────────────────────────── │
│ [Подписать] (disabled пока нет   │
│  чекбокса + обработанной подписи)│
│                                  │
│ powered by SignFinder             │
│ Соглашение об ПЭП | Политика     │
└──────────────────────────────────┘
```

После успешного `POST /sign` — экран меняется на «✓ Готово» +
кнопка «Скачать финальный PDF» (спека §3, финальный вариант).

**Технические детали:**
- Vanilla JS, без фреймворков — как `app/index.html`. Не подключай React/Vue/сборщик.
- Извлечение `share_token` из URL: `window.location.pathname.split('/sign/')[1]`
- PDF viewer — переиспользуй тот же механизм что в `app/index.html`
  (посмотри как он там рендерит PDF — вероятно pdf.js, скопируй подход)
- Обработка подписи (фото/файл/canvas → PNG base64 → `POST
  /v1/signers/{tmp_id}/signature/process` → превью с confidence) —
  переиспользуй CSS-классы `.sig-img-processed` (шахматный фон для
  прозрачности), `.upload-label`, паттерн из `app/index.html` секции
  подписи в профиле — та же идея, тот же визуальный язык, но на новом
  экране без auth
- PostHog — тот же `posthog.init(...)` блок скопировать в `<head>`,
  чтобы аналитика публичной страницы тоже собиралась (просмотры, подписания)
- CSS-переменные (`--c-bg`, `--c-accent`, `--radius`, `--shadow` и т.д.) —
  скопировать `:root` блок из `app/index.html`, не изобретай новую палитру

### 3.2 `firebase.json` — новый rewrite

Добавить в массив `rewrites` (по образцу существующего `/app/**`):

```json
{ "source": "/sign/**", "destination": "/sign/index.html" }
```

### 3.3 Мобильный UX — обязательно, не откладывать на E7

Спека прямо требует (§9 критерий 5) что публичная страница работает на
iPhone Safari и Android Chrome. Раз всё равно пишешь эту страницу сейчас —
тач-цели ≥44px, `<input type="file" accept="image/*" capture="environment">`
для камеры, canvas с pointer events (не только mouse events) для рисования
подписи пальцем.

### 3.4 Не трогать `app/index.html`

Новая страница — отдельный файл `sign/index.html`. Существующий кабинет
не меняется в этом эпике (кроме E3/E4, отдельные задачи).

### 3.5 Бамп версии

`SignfinderLand/version.txt` — **не бампать** до полного релиза v2.0.0
в E7 (см. `DEAL_CYCLE_SPEC.md` §8 E7 — там явно «Обновить version.txt →
2.0.0», один раз в конце всего цикла). До этого — версия остаётся как есть,
E2/E3/E4 деплоятся на test без изменения основного номера, но
`deploy.yml` всё равно инжектит `{version.txt}.{RUN_NUMBER}` — этого
достаточно для отслеживания какая сборка на test.

---

## §4. Definition of Done для E2

**Backend (signfinder-api):**
- [ ] Reading gate пройден, подтверждение отправлено, владелец подтвердил
- [ ] `DealPublicView`, `DealSignRequest` в `app/models/deal.py`, `extra='forbid'`
- [ ] `app/routers/deals_public.py` — 4 эндпоинта
- [ ] Rate limiting (SlowAPI) на всех публичных эндпоинтах
- [ ] Security headers (CSP, X-Content-Type-Options, X-Frame-Options)
- [ ] Атомарный UPDATE при подписании, 409 при повторе
- [ ] IDOR: ID только из URL, никогда из body — проверяемо в коде
- [ ] 10 тестов зелёных (7 из RUNBOOK + 3 из threat model §6)
- [ ] Новая зависимость `slowapi` — сверена в `pyproject.toml` И `Dockerfile`
- [ ] `pyproject.toml` → `1.19.1`
- [ ] CI зелёный, PR открыт, смёржен владельцем
- [ ] `deploy-test.yml` дошёл до конца — мониторишь сам (Правило №4)

**Frontend (SignfinderLand):**
- [ ] Reading gate пройден для frontend-части
- [ ] `sign/index.html` создан, одноэкранный макет реализован
- [ ] `firebase.json` — добавлен rewrite `/sign/**`
- [ ] Дизайн-система переиспользована (CSS-переменные, классы), не изобретена заново
- [ ] PostHog подключён
- [ ] Мобильный UX: тач-цели, камера, canvas pointer events
- [ ] `app/index.html` не тронут
- [ ] `version.txt` не бампан (это в E7)
- [ ] CI зелёный (если есть, или просто ручная проверка синтаксиса HTML),
      PR открыт, смёржен владельцем
- [ ] `deploy.yml` дошёл до конца на **test**-проект — мониторишь сам

**Общее:**
- [ ] Полный e2e-прогон на test вручную: создать сделку (через существующий
      флоу E1) → открыть `/sign/{token}` в браузере → пройти все 3 способа
      ввода подписи → подписать → увидеть финальный PDF → скачать. Хотя бы
      один раз каждым способом (камера можно эмулировать файлом на десктопе,
      если нет доступа к реальному телефону для теста — но отметь это
      ограничение в отчёте)
- [ ] На prod ничего не задеплоено ни в одном из двух репозиториев

---

## §5. Что НЕ делать

Всё из `GIT_WORKFLOW.md` §Явные запреты (все 7 пунктов) плюс:

- Не создавать GCS bucket `signfinder-prod-deals` — followup, не в E2
- Не менять `app/index.html` — отдельная задача
- Не бампать `version.txt` — это E7
- Не реализовывать E3 (кнопки передачи), E4 (раздел «Мои сделки»),
  E5 (ретенция), E6 (опросник), E7 (юр. блок финального текста, если
  решил отложить — см. §2.2) — это отдельные TASK-файлы
- Не запускать `workflow_dispatch` ни в одном репозитории (prod-деплой)
- Не изобретать свой JS-фреймворк/сборщик для новой страницы — vanilla,
  как весь остальной проект

---

## §6. После завершения

Отчёт по обоим репозиториям: что сделано, что смёржено, что подтверждено
на test (backend `/v1/version` = 1.19.1, frontend — живая страница
`/sign/{тестовый_token}` открывается и работает). Не начинать E3 без
команды владельца.

---

**Автор задачи:** владелец + Claude Opus (2026-07-25)
**Целевые версии:** `signfinder-api` v1.19.1, веб-клиент — без бампа до E7
