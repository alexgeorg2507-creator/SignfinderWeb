# SignFinder — Backlog

> Приоритизированный, привязан к ADR где уместно. Обновлять при закрытии
> пункта — дата + что сделали, не просто вычёркивать.
> P0 = блокирует прод/безопасность. P1 = блокирует M4/запуск. P2 = после
> первых данных. P3 = когда-нибудь.

---

## Известные проблемы, не в скоупе текущих фиксов

- [ ] **«page 3 not in document» — странная красная полоса над PDF-превью (2026-07-21,
  прод):** воспроизведено на `Enclosure_2_TM_EUR_Innowise_Group_redacted.pdf` (из PL-корпуса).
  Строки нет нигде в нашем JS (проверено чтением всего `app/index.html`) — не наш
  код. Гипотеза (не подтверждена до конца): документ редактирован (имя с суффиксом
  redacted) — могла остаться битая внутренняя PDF-ссылка (OpenAction/внутренняя
  навигация на страницу, которой уже нет после удаления части страниц при
  редактировании), и pdf.js при загрузке выводит предупреждение об этом.
  Гипотеза про расширение-переводчик отвергнута владельцем (воспроизвелось без
  расширения). Функционально не мешает — анализ и подпись на этом же файле
  отработали верно. Не воспроизводилось на основном тестовом документе (Лебедев),
  только на этом одном PL-файле. Если всплывёт снова на других документах —
  смотреть DevTools Console в момент загрузки файла.

- [ ] **Fix-12 edge case (найдено при реализации Fix-12, не чинить внутри
  него):** ручной якорь с текстовой привязкой (`context_before` + offset),
  примененный через шаблон на документ B (`apply_template_anchors`), при
  повторном нажатии «Запомнить» на этом же документе теряет привязку —
  откатывается на голый bbox. Причина: `SignMatch`
  (`signfinder-core/signfinder/anchors/models.py`, расшаренный dataclass)
  не имеет поля для переноса `context_before`/offset между reapply
  (`apply_template_anchors`) и повторной конвертацией в анкер
  (`manual_match_to_anchor`) — та же природа бага, что чинили в Fix-10.4
  (`_to_match`), по другую сторону конвертации. Основной DoD-сценарий Fix-12
  (разместить → запомнить → загрузить документ B) не задет, работает штатно.
  Задевает только повторное «Запомнить» ПОСЛЕ reapply. Нужно отдельным
  TASK — трогает расшаренную модель, не локальная правка.

---

## P1 — SignfinderLand v2.0.0 Deal Cycle (блокер go-live) — утверждено 2026-07-23

> Полная спека: `DEAL_CYCLE_SPEC.md` (v1.2, статус «готова к реализации»).
> Модель угроз: `THREAT_MODEL_DEAL_CYCLE.md` (v1.0).
>
> **Стратегия:** переходим от «инструмент подписи» к «инструмент закрытия
> сделки». Major bump SignfinderLand (1.0 → 2.0.0) обоснован сменой
> позиционирования продукта. Ядро (`signfinder-core` 1.20.18,
> `signfinder-api` 1.18.4) не меняется — используются существующие
> `/v1/analyze` и `/v1/sign`.
>
> **Ключевое архитектурное решение:** SignFinder не отправляет писем и
> сообщений от своего имени. Инициатор получает временную ссылку и передаёт
> её контрагенту сам через любой канал. Backend только генерирует ссылку
> и следит за статусом. Причины и последствия — в спеке §0, ADR-010.
>
> Без замкнутого цикла первые платящие клиенты дадут шумный фидбек про
> костыли отправки, а не про реальные фичи.

**Эпики:**

- [x] ~~**E1** Модель Deal + Alembic-миграция + приватные API~~ —
  `POST/GET /v1/deals`, `POST /v1/deals/{id}/mark-shared`,
  `GET /v1/deals/{id}/final-pdf` + генератор share_token nanoid 32.
  Смёржено, задеплоено на test, подтверждено (`signfinder-api#1`)
- [x] ~~**E2** Публичная страница `/sign/{token}`~~ — без auth,
  фото/файл/canvas, ПЭП-чекбокс, публичные API + кнопка «Скачать
  финальный PDF», security-заголовки CSP/X-Frame-Options, rate limits
  SlowAPI. Смёржено 2026-07-25 (`signfinder-api#8`, `SignfinderWeb#1`),
  задеплоено на test (`api_version: 1.19.1`), смок-тест пройден на живом
  контуре. **Полный golden path (реальное подписание) не проверен** —
  нет UI для создания Deal (это E3), см. `DEAL_CYCLE_SPEC.md` E2
- [ ] **E3** Три кнопки передачи в кабинете: Скопировать / TG / WA (1д)
- [ ] **E4** Кабинет «Мои сделки» со статусами и drill-down, кнопка
  «Скопировать ссылку ещё раз», опциональный бейдж в topbar (1-2д)
- [x] **E5** Ретенция: 7 дней PDF (включая signed), 30 дней запись —
  `signfinder-api` PR#10 (эндпоинты) + PR#11 (auth-фикс) смёржены,
  задеплоены на test. Cloud Scheduler, не APScheduler (см.
  `DEAL_CYCLE_SPEC.md` §8 E5 — правка архитектуры до реализации).
  **Инцидент, закрыт:** Cloud Scheduler `--headers` не может передать
  `Authorization` (GCP резервирует имя под свой oauth_token/oidc_token
  oneof в `HttpTarget`, молча обнуляет значение) — решено через
  `X-Deals-Cron-Key` вместо `Authorization: Bearer`, тот же секрет
  `API_KEY`. См. `TASK_e5_scheduler_auth_followup.md`. Провизионирование
  Cloud Scheduler заданий на test/prod с новым заголовком — за владельцем
  (`monitoring/setup_deals_retention_cron.py` в signfinder-api генерирует
  команды)
- [ ] **E6** Опросник «Что улучшить?» → Telegram владельца (0.5д)
- [ ] **E7** Юр. блок в финальном PDF + мобильная косметика + iOS Safari
  тесты + бамп `version.txt` → `2.0.0` (1-2д)

**Итого: 8-13 рабочих дней.**

**Не входит (осознанно):**
- Любые backend-рассылки email — уведомления инициатору, копии контрагенту,
  «истекает через 24ч». Ни одной. SMTP/Postmark/SES интеграция не нужна.
- Multi-signer >2 сторон, напоминания контрагенту, отмена сделки после
  отправки, SMS-подтверждение усиления ПЭП, массовая рассылка
- Изменения в signfinder-core / signfinder-api
- mailto: как отдельная кнопка отправки (инициатор при желании скопирует
  ссылку в почту сам — но по умолчанию мессенджеры)

**Все ключевые вопросы закрыты:**

- [x] Q1: Email-провайдер — не нужен, backend не шлёт писем
- [x] Q2: Якоря контрагента — переиспользуем сохранённые от первого анализа
- [x] Q3: Сценарий expired — Deal → expired в БД, инициатор видит в кабинете,
  никаких автоуведомлений
- [x] Q4: Юр. уровень ПЭП — вариант B (без регистрации, дисклеймер + чекбокс)
- [x] Q5: Уведомления контрагенту — не шлём вообще
- [x] Q6: Копия финального PDF контрагенту — только кнопка «Скачать» на странице
- [x] Q7: Каналы передачи — Скопировать / Telegram / WhatsApp (3 кнопки)
- [x] Q8: Поведение после signed — ссылка живёт 7 дней, PDF viewer + скачивание
  открыты. Threat model §3.G разбирает риски и митигации.

**Критерии готовности:**

- Владелец подписывает и передаёт арендатору за ≤3 клика (подписать →
  скопировать → вставить в WhatsApp)
- Арендатор с телефона без регистрации подписывает за ≤5 кликов и ≤2 минут
- Оба могут скачать финальный PDF (инициатор из кабинета, контрагент со
  своей страницы)
- Работает на iPhone Safari и Android Chrome
- Опросник доставляет сообщение в личный TG владельца
- Истёкшие сделки корректно чистятся
- Бейдж версии в topbar показывает `v2.0.0+{BUILD}`
- **Ни одной backend-рассылки email никому и никогда** — проверить в коде
- **Все security-тесты из THREAT_MODEL_DEAL_CYCLE.md §6 зелёные** (8 тестов
  распределены по эпикам E1, E2, E7)
- GCS bucket `signfinder-prod-deals` подтверждён без публичных ACL
  (`gsutil iam get`)

**Связанные обновления в других документах:**

- [x] `THREAT_MODEL_DEAL_CYCLE.md` — модель угроз, разбор атак A-H, security-тесты
  (создан 2026-07-23)
- [x] `DEAL_CYCLE_SPEC.md` v1.2 — добавлены §4.5, §5.5, §5.6, §5.7 + ссылки
  на threat model (2026-07-23)
- [x] `DB_SCHEMA_AND_BACKUP.md` — добавлена таблица `deals` в описание схемы,
  миграция 003 (2026-07-23)
- [x] `ADR.md` — ADR-009 (7-дневное хранение PDF, уточнение ADR-002)
  и ADR-010 (отказ от backend-рассылок email) добавлены (2026-07-23)
- [x] `RUNBOOK_TESTING.md` — блок «v2.0.0 Deal Cycle — тесты»,
  15 планируемых тестов + отдельно security-тесты (2026-07-23)
- [x] `SECRETS_REGISTRY.md` — добавлены `tg-feedback-bot-token`
  и `tg-feedback-chat-id` со статусом «⏳ создаётся в E6», явно указано
  что POSTMARK/SES/SendGrid НЕ добавляются (2026-07-23)
- [ ] `TASK_versioning.md` — бамп `SignfinderLand/version.txt` → `2.0.0`
  в E7 (перед деплоем) — сделать в момент E7

---

## Fix-2 — 2026-07-05 (UX overhaul work tab)

- [ ] **Fix-2.1** Мигание версии в футере Профиля — кэшировать
- [ ] **Fix-2.2** Убрать заголовок, обновить тексты на табе договора
- [ ] **Fix-2.3** Авто-подписание при загрузке
- [ ] **Fix-2.4** DOC/DOCX превью через mammoth.js
- [ ] **Fix-2.5** Toolbar: Download + Web Share API
- [ ] **Fix-2.6** Превью на полную высоту viewport, sticky
- [ ] **Fix-2.7** max-width для work таба

---


- [ ] **Fix-1.1** Bug: LLM не отвечает (Шаг 3) — см. `TASK_fix1.md`.
  **Переоткрыт 2026-07-25** с другой причиной, чем исходно: секрет
  `DEEPSEEK_API_KEY` подтверждён живым (`gcloud run services describe`)
  как реально подключённый `secretKeyRef` на текущей ready-ревизии
  `signfinder-cab-test` — не проблема секрета/IAM. Реальная причина —
  Cloud Logging: `DeepSeek API call failed: Error code: 400 - The
  supported API model names are deepseek-v4-pro or deepseek-v4-flash,
  but you passed deepseek-chat`. Хардкод `DEFAULT_MODEL = "deepseek-chat"`
  в `signfinder-core/signfinder/llm/deepseek_client.py` — провайдер
  сменил список поддерживаемых имён моделей, `deepseek-chat` больше не
  принимается. Требует правки `signfinder-core` (не `signfinder-api`) —
  вне скоупа `TASK_bugfix_llm_step3.md`, передано владельцу отдельным
  решением (см. `TASK_bugfix_llm_step3.md` отчёт). Владелец выбрал
  `deepseek-v4-flash`, фикс в core v1.20.19 (2026-07-25).
  **Важное наблюдение (`TASK_bugfix_llm_step4.md`):** смена модели
  почини́ла Шаг 3, но сломала Шаг 4 («LLM не вернул паттерны») — тот же
  провайдер/клиент, но более крупный промпт (до 15 regex-паттернов,
  `max_tokens=3000`) получает от `deepseek-v4-flash` пустой `content`
  при HTTP 200 (`json.JSONDecodeError: Expecting value: char 0`). Шаг 3
  (меньше промпт, `max_tokens=1500`) не задет. Гипотезы (не подтверждены):
  reasoning-модель тратит токены на скрытый reasoning вместо видимого
  ответа на сложную задачу, либо контент-фильтр. Диагностическое
  логирование добавлено в core v1.20.20 (не фикс) — ждём ещё один живой
  прогон на test чтобы увидеть `finish_reason`/`usage` и определить
  причину точно. **Для будущего выбора дефолтной модели проекта:**
  `deepseek-v4-flash`, похоже, не тянет более сложные/длинные
  структурированные JSON-задачи этого пайплайна — при выборе замены
  учитывать не только Шаг 3, но и весь пайплайн целиком.
  **Решено 2026-07-25 (`TASK_fix_reasoning_model_step4.md`, core
  v1.20.21):** причина точно подтверждена диагностическим логом —
  `finish_reason=length`, `reasoning_tokens=3000` из `3000` бюджета,
  `accepted_prediction_tokens=None`. Не подняли `max_tokens` (владелец
  отверг — лечит симптом, растит стоимость), вместо этого отключили
  DeepSeek thinking-режим точечно для Шага 4
  (`extra_body={"thinking": {"type": "disabled"}}`, официально
  задокументировано для `v4-pro`/`v4-flash` — отдельной non-reasoning
  модели у провайдера больше нет, `deepseek-chat` deprecated).
  `LLMClient.complete()` получил параметр `reasoning: bool = True`
  (все 4 клиента, действует только DeepSeek). Шаг 3 не тронут.
  Таблица по пайплайну (`/v1/me/analyze` = `run_pipeline_auto_1`):

  | Шаг | Reasoning нужен? | Почему |
  |-----|------------------|--------|
  | Step 3 (`extraction.py`, найти нашу сторону) | Оставлен `True` | Смысловая неопределённость — сопоставить нас среди нескольких поимённых сторон по алиасам/ролям/контексту; сейчас укладывается в 1500 токенов, не трогали без причины |
  | Step 4 (`regex_generation.py`, генерация паттернов) | `False` (этот фикс) | Механическая задача по чёткому шаблону, смысловой неопределённости нет — reasoning только жёг токены |
  | Step 5 (`auto1.run_step5`) | LLM не используется | Чистый детерминированный regex-матчинг |
  | `pipeline/party_resolver.py`, `pipeline/validator.py`, `pipeline/pattern_extractor.py`, `review/reviewer.py` | Не в hot path `/v1/me/analyze` | Свои LLM-вызовы есть, но не вызываются из `run_pipeline_auto_1` — не трогали, та же уязвимость к reasoning-моделям остаётся если когда-то попадут под неё |

  **Уточнение 2026-07-25 (core v1.20.22, тот же TASK):** владелец решил
  не ограничиваться Шагом 4 — reasoning выключен **по умолчанию на всём
  `LLMClient.complete()`** (обоснование: `reasoning_content` нигде в
  кодовой базе не читается, платить за него смысла нет ни на одном шаге,
  включая Шаг 3 несмотря на его смысловую неопределённость). Дефолт
  `reasoning: bool = False` на базовом классе + всех 4 клиентах покрыл
  разом все вызовы `complete()` в пакете — включая перечисленные выше
  `party_resolver.py`/`validator.py`/`pattern_extractor.py`/
  `review/reviewer.py`, а также `pipeline/llm_finder.py` и
  `pdf/language.py` — ни один явно `reasoning=` не передавал, все
  унаследовали новый дефолт без правки вызовов по отдельности.
- [ ] **Fix-1.2** Лимит страниц: 3 → 10 (бэкенд + UI)
- [ ] **Fix-1.3** Убрать версию из topbar

---


- [x] ~~Выяснить реальный prod GCP project id~~ — **решено:** `signfinder-prod`,
  подтверждено `.firebaserc` + живым Cloud Run. `signfinder-c1163` — легаси.
- [x] ~~Починить `cloudbuild-test.yaml`: добавить `DEEPSEEK_API_KEY` и
  `API_KEY` в `--set-secrets`~~ — **подтверждено закрытым 2026-07-25**:
  `gcloud run services describe` на живой ready-ревизии
  `signfinder-api-00059-sb5` показывает оба секрета подключены как
  `secretKeyRef`. (Ранее `SECRETS_REGISTRY.md` утверждал обратное —
  документ был устаревшим относительно реального состояния, поправлено
  там же.)
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
- [ ] ~~Удалить орфанный секрет `deepseek-api-key` в `signfinder-cab-test`
  (дублирует по смыслу `deepseek-key`, нигде не подключён)~~ —
  **неверно, не удалять:** подтверждено 2026-07-25 живым `gcloud run
  services describe` — `deepseek-api-key` реально подключён
  `secretKeyRef` на текущей ready-ревизии test. Не орфан. Осталось
  только выбрать единое имя секрета на все проекты (test использует
  `deepseek-api-key`, prod — `deepseek-key`) — чисто косметическая
  унификация, не удаление
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
  юридического документа нет (флаг из `00_INDEX.md`, не закрыт).
  **С v2.0.0 Deal Cycle актуальность растёт:** финальный PDF со сделки
  содержит IP обеих сторон. Одновременно упрощается — SignFinder не оператор
  рассылок (не шлёт email), так что часть требований к Privacy Policy отпадает.
  Плюс новый пункт: явно прописать 7-дневный срок жизни ссылки после signed
  (см. THREAT_MODEL_DEAL_CYCLE.md §3.G).
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
- [x] ~~Миграции применялись только вручную на prod (`deploy-prod.yml`), не на
  test/CI~~ — `ci.yml` гонял pytest против той схемы, что уже была на
  `signfinder-cab-test`, без `alembic upgrade head`; PR с новой миграцией не
  мог получить её применённой до того как его же тесты запустятся.
  Исправлено в PR E1 (2026-07-24, первая пост-Alembic миграция `003_deals`
  это обнаружила): добавлен шаг применения миграций в `ci.yml` перед pytest,
  тем же паттерном что и в `deploy-prod.yml`.
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
- [x] ~~`signfinder-core/tests/`~~ — уже закрыто в ядре (см. `signfinder-core/signfinder/__init__.py`
  changelog v1.15.0 и далее — автотесты в CI, 156 passed на v1.20.18)

**Примечание:** агент задокументировал эти пункты раньше чем сделал. Фактически
выполнено через `setup_monitoring.py` 2026-07-04.

---

## Технический долг

- [ ] **Dockerfile сирота от `pyproject.toml`** — `signfinder-api/Dockerfile`
  устанавливает зависимости захардкоженным `pip install` списком, не
  через `pip install .` из `pyproject.toml`. Каждое добавление
  зависимости требует двойной правки в двух местах, легко забыть
  (случилось в E1 → `nanoid` пропущен → упал `deploy-test.yml #33`,
  2026-07-24, пофикшено хотфиксом в тот же день). Дополнительно
  сверено 2026-07-24: `alembic`, `sqlalchemy`, `mammoth`, `weasyprint`
  тоже есть в `pyproject.toml` и тоже отсутствуют в Dockerfile, но не
  критичны — grep по `app/` не находит ни одного импорта ни одного из
  них ни на каком уровне (alembic/sqlalchemy — только CLI-миграции вне
  контейнера; mammoth/weasyprint — мёртвый путь, DOC/DOCX конвертация
  сейчас идёт через LibreOffice/`soffice` subprocess, см. `me.py`).
  Отдельный TASK на рефактор: переписать Dockerfile на
  `COPY pyproject.toml . && pip install .` с промежуточным слоем.
  Приоритет P2 — чинить после Deal Cycle v2.0.0.

## P2 — Продуктовый бэклог (после первых данных по воронке)

- [ ] 20 правок RU-лендинга (список у владельца, не в репо)
- [ ] EN-перевод — заморожен до отдельной итерации
- [ ] Договоры в sandbox: подписи владельца вместо синтетических
- [ ] Pricing / биллинг — только после первых `limit_reached` в PostHog **и**
  первых 3-5 разговоров с платящими пользователями Deal Cycle
  (см. `RUNBOOK_MARKETING.md`, `DEAL_CYCLE_SPEC.md`)
- [x] ~~Multi-party (второй подписант)~~ — переехало в SignfinderLand v2.0.0
  Deal Cycle, см. `DEAL_CYCLE_SPEC.md`
- [ ] IMAP-агент — уже реализован в ядре (`signfinder-core` v1.16+),
  но не подключён к SignfinderLand-кабинету

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
