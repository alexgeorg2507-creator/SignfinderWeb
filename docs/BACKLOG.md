# SignFinder — Backlog

> Приоритизированный, привязан к ADR где уместно. Обновлять при закрытии
> пункта — дата + что сделали, не просто вычёркивать.
> P0 = блокирует прод/безопасность. P1 = блокирует M4/запуск. P2 = после
> первых данных. P3 = когда-нибудь.

---

## Fix-1 — 2026-07-04 (активный релиз)

- [ ] **Fix-1.1** Bug: LLM не отвечает (Шаг 3) — см. `TASK_fix1.md`
- [ ] **Fix-1.2** Лимит страниц: 3 → 10 (бэкенд + UI)
- [ ] **Fix-1.3** Убрать версию из topbar

---


- [x] ~~Выяснить реальный prod GCP project id~~ — **решено:** `signfinder-prod`,
  подтверждено `.firebaserc` + живым Cloud Run. `signfinder-c1163` — легаси.
- [ ] **Починить `cloudbuild-test.yaml`: добавить `DEEPSEEK_API_KEY` и
  `API_KEY` в `--set-secrets`.** Подтверждено и живым env, и кодом: легаси/внутренний
  API-слой (`pipeline`, `templates`, `signers`, `parties`) отвечает 500 без
  `API_KEY`, LLM молча не работает без `DEEPSEEK_API_KEY`. Кабинет (`/v1/me/*`,
  то что видит пользователь) не затронут — у него отдельный Firebase-auth.
  Не P0-инцидент безопасности, но всё равно ломает часть API на test
- [x] ~~Проверить в коде signfinder-api, как обрабатывается отсутствие API_KEY~~ —
  **решено:** `RuntimeError` → 500, не fail-open. Безопасности нет, есть
  только баг доступности
- [x] ~~Обновить `.env.prod.example` в `signfinder-api`~~ — сделано, теперь
  указывает на `signfinder-prod`
- [x] ~~Удалить/пометить мёртвым легаси cloudbuild.yaml~~ — сделано,
  уехал в `signfinder-api/_archive/cloudbuild.yaml.legacy`
- [x] ~~c1163 — деплой 27 июня, Cloud Run + Cloud SQL RUNNABLE~~ — **снесено
  2026-07-03**: БД пустая (миграции не гонялись), Cloud Run deleted, Cloud SQL
  deleted, все 5 секретов удалены. Проект-оболочка `signfinder-c1163` остался
  (без ресурсов), удалить через GCP Console если нужно
- [ ] Выяснить назначение проекта `signfinder` (голый id, номер
  753184980506) — не в `.firebaserc`, не проверен
- [x] ~~Удалить `firebase-admin-sa` из Secret Manager на test и prod~~ —
  не существует ни на одном, NOT_FOUND. Закрыто.
- [ ] Удалить орфанный секрет `deepseek-api-key` в `signfinder-cab-test`
  (дублирует по смыслу `deepseek-key`, нигде не подключён) — или выбрать
  одно имя на все проекты
- [x] ~~GitHub Secrets~~ — `GOOGLE_CREDENTIALS_TEST` + `GOOGLE_CREDENTIALS_PROD`
  добавлены в `signfinder-api`. SA JSON удалён с диска.
- [x] ~~Billing budget alert~~ — создан на $50/мес, пороги на 40% и 100%.
  `billingbudgets.googleapis.com` включён на `signfinder-prod`.

---

## P1 — закрыть M4 (см. TECH_SPEC_landing_cabinet.md, TASK_MVP_Lite_Client.md)

- [ ] Кнопка «Войти» на лендинге → /app
- [ ] Sandbox-дропзона на лендинге → переход в /app, не дублировать анализ
- [ ] Прод-проект: Cloud SQL + Firebase Auth + Cloud Run (зависит от P0 —
  сначала разрешить, какой это проект)
- [ ] DNS: signfinder.app → Firebase Hosting, Cloudflare proxy **OFF**
  (серая тучка — иначе Firebase SSL не выпустится)
- [ ] Smoke-тест полного цикла на prod руками (владелец, не агент —
  см. ADR-008 / GIT_WORKFLOW.md)
- [ ] IDOR-проверка двумя аккаунтами (ИБ-чеклист, `TASK_MVP_Lite_Client.md`)
- [ ] PostHog-события уже описаны в `RUNBOOK_MARKETING.md` — сверить, что
  реально шлются с фронта, не только задокументированы

---

## P1 — Governance, оставшееся (Этап 1 документов почти закрыт)

- [x] `ADR.md`, `ENVIRONMENTS_AND_COST.md`, `SECRETS_REGISTRY.md`,
  `DB_SCHEMA_AND_BACKUP.md`, `GIT_WORKFLOW.md`, `RUNBOOK_TECH_SECURITY.md`,
  `RUNBOOK_MARKETING.md`, `00_INDEX.md` — существуют
- [ ] **Data Retention (GDPR)** — упоминается в исходном плане governance,
  отдельного документа нет. Договоры не персистятся (ADR-002) — снимает
  большую часть поверхности, но профиль/подпись/email в Postgres всё равно
  требуют политики: сколько хранить после удаления аккаунта, как удалить
  по запросу пользователя. Не описано нигде.
- [ ] Privacy Policy / ToS — на проде реальные email и подписи людей,
  юридического документа нет (флаг из `00_INDEX.md`, не закрыт)
- [ ] Реестр секретов обновлён этим аудитом, но три пункта отмечены ⚠️/❓ —
  закрыть после ручной проверки (`gcloud secrets list` и т.д.)

---

## P2 — Governance Этап 2 (CI/CD) — закрыто 2026-07-03

- [x] ~~GitHub Actions: CI + деплой test/prod~~ — `ci.yml`, `deploy-test.yml`,
  `deploy-prod.yml`. CI зелёный, `deploy-test.yml` прошёл smoke енд-то-енд.
  `deploy-prod.yml` — `workflow_dispatch`-only, ещё не запускался
- [x] ~~pytest: 18 тестов~~ — auth, IDOR, CRUD, лимиты, SQL-инъекция.
  Зелёные локально и в CI. JUnit XML генерируется, доступен как GitHub Actions artifact
- [x] ~~Alembic~~ — инициализирован, обе существующие миграции конвертированы,
  `stamp head` выполнен на обеих БД
- [x] ~~SignfinderLand → SignfinderWeb~~ — запушен в `SignfinderWeb`
- [x] ~~cloudbuild-test.yaml: все три секрета~~ — `DB_PASSWORD`, `DEEPSEEK_API_KEY`, `API_KEY`
- [x] ~~prod IAM: `github-actions` SA~~ — `storage.admin` + `iam.serviceAccountUser`
  на `449403012307-compute@` применены. `deploy-prod.yml` ещё не
  запускался, проверится при первом прод-деплое

## P2 — Governance Этап 3 (мониторинг) — закрыто 2026-07-04

- [x] ~~Uptime check~~ — `signfinder-api-health-mk1gO_Rzo_M`, проверяет `/health` каждую минуту
- [x] ~~Notification channel~~ — `16603814915883900505`, Pub/Sub → `signfinder-alerts` → `alert-to-telegram`
- [x] ~~Alert policies (4 штуки)~~ — API down (CRITICAL), Cloud Run error rate (ERROR),
  Cloud SQL disk (WARNING), Firebase Auth anomaly (WARNING)
- [x] ~~Log-based metric~~ — `firebase-auth-failures` в Cloud Logging
- [x] ~~GCS bucket versioning~~ — включён на `signfinder-prod-config`
- [x] ~~Firebase Auth weekly export~~ — Cloud Function + Cloud Scheduler по понедельникам
- [x] ~~Скрипт создания ресурсов~~ — `signfinder-api/monitoring/setup_monitoring.py`
  (запускается разово при пересоздании GCP проекта, хранится в git)
- [ ] Restore-дрель Cloud SQL — ни разу не проводилась,
  сделать до первого платящего пользователя
- [ ] `signfinder-core/tests/` — заложено в roadmap v1.15, не сделано

**Примечание:** агент задокументировал эти пункты раньше чем сделал. Фактически
выполнено через `setup_monitoring.py` 2026-07-04.

---

## P2 — Продуктовый бэклог (после первых данных по воронке)

- [ ] 20 правок RU-лендинга (список у владельца, не в репо)
- [ ] EN-перевод — заморожен до отдельной итерации
- [ ] Договоры в sandbox: подписи владельца вместо синтетических
- [ ] Pricing / биллинг — только после первых `limit_reached` в PostHog,
  не раньше (см. `RUNBOOK_MARKETING.md`)
- [ ] Multi-party (второй подписант)
- [ ] IMAP-агент (v1.16 в roadmap `signfinder-core`)

---

## P3 — Этап REVIEW (после 2 недель данных, `TASK_MVP_Lite_Client.md`)

Явно не сейчас, зафиксировано, чтобы не забыть:

- [ ] Архитектурная ревизия под реальную нагрузку, полноценная
  мультитенантность если появится спрос (ADR-006 — задел уже есть)
- [ ] Идемпотентность запросов, если появятся ретраи/агенты
- [ ] Диаграмма архитектуры (лендинг → auth → кабинет → API → ядро → БД)
  для собеса
- [ ] README уровня senior + нарратив продукта для интервью

---

## Закрытые пункты (для истории — не удалять из бэклога, просто отмечать)

- [x] M0-M3 (инфра, auth, профиль/подпись/сторона, рабочий экран) — по
  `session_summary_jun2026.md`
