# SignFinder — Сессия июнь 2026: выжимка для нового чата

## ТЕКУЩИЙ СТАТУС ПРОЕКТА

### Что задеплоено
- **signfinder.app** — продовый домен (Cloudflare, `.app`)
- **Лендинг cloud**: signfinder-c1163.web.app / signfinder.app (Firebase Hosting)
- **Лендинг enterprise**: signfinder.app/enterprise
- **Hero-анимация**: hero.html (iframe, RU/EN, 37 сек петля)
- **Sandbox**: мок-демо (наши договоры) + real API (свои документы)
- **Кабинет test**: signfinder-cab-test.web.app/app/index.html
- **API test**: Cloud Run europe-west1, core v1.20.7, DeepSeek в Secret Manager

### Среды
- `signfinder-test` — test, Cloud SQL Postgres, Firebase Auth test
- `signfinder-prod` (= signfinder-c1163 или новый) — в процессе M4
- Два проекта GCP, полная изоляция данных

### Кабинет MVP-Lite — статус этапов
| Этап | Статус |
|------|--------|
| M0 — инфра, 2 среды | ✅ |
| M1 — Firebase Auth + пустой кабинет | ✅ ИБ-чеклист пройден |
| M2 — профиль / подпись (bytea) / сторона | ✅ |
| M3 — рабочий экран (analyze→sign→download) | ✅ |
| M4 — PostHog + prod + домен | 🔨 В работе |

### Незакрытые задачи M4
- Добавить кнопку «Войти» на лендинге → /app
- Sandbox-дропзона на лендинге → переделать в переход в /app (не дублировать)
- Smoke-тест на prod руками (владелец)
- IDOR-проверка двумя аккаунтами

---

## GOVERNANCE — ЧТО РЕШЕНО, ЧТО НУЖНО СДЕЛАТЬ

### Проблема
Прод без сетки: агент деплоит напрямую, миграции руками, откат «помолиться». При трафике взорвётся.

### Решение — 4 этапа
**Этап 1 — Документы (3-4 дня)**
Схема сред и стоимость, реестр секретов, ADR-индекс, политика миграций/бэкапов, data retention.

**Этап 2 — Git и CI/CD (3-4 дня, кодер)**
GitHub Actions: PR checks → test deploy → ручной prod gate (кнопка владельца). Alembic. Smoke-тесты в pipeline.

**Этап 3 — Runbooks (2-3 дня)**
Tech Support, Incident Response, Rollback, Marketing (PostHog), Security Review.

**Этап 4 — Мониторинг и алерты**
Cloud Run error rate, Cloud SQL disk, Firebase Auth anomalies.

### Документы к созданию
- Схема сред test/prod (сервисы, связи)
- Стоимость после free tier (~$22/мес оба проекта, Cloud SQL — главный cost driver)
- Реестр секретов
- ADR-индекс (~8 решений из истории)
- Политика миграций (Alembic, нумерация, запрет деструктивных без окна)
- Политика бэкапов + процедура восстановления
- Data Retention (GDPR)
- Runbook Tech Support
- Runbook Incident Response
- Runbook Rollback
- Runbook Marketing (PostHog)
- Security Review (онгоинг)

### Порядок
Сначала документы (Этап 1), потом CI/CD (Этап 2). CI/CD без стандартов — автоматизированный хаос.

---

## АРХИТЕКТУРА КАБИНЕТА (зафиксировано)

```
signfinder.app/
├── /           → лендинг cloud (Firebase Hosting)
├── /enterprise → лендинг enterprise
├── /app        → кабинет SPA (vanilla JS, responsive)
│     ├── Firebase Auth (Google + email-verify)
│     ├── Профиль (ФИО, компания, реквизиты)
│     ├── Подпись (upload/camera → OpenCV → bytea в Postgres)
│     ├── Шаблон стороны (один)
│     └── Рабочий экран (analyze → sign → download, in-memory)
└── /api/**     → Cloud Run signfinder-api (JWT-protected)
      ├── GET/PUT /v1/me/profile|signature|party|usage
      ├── POST /v1/me/analyze (лимит 3стр/5МБ/10мес)
      └── POST /v1/me/sign (подпись из DB, not from request)

Postgres (Cloud SQL):
  users, profiles, signatures(bytea), parties, usage_counters
  Договоры НЕ хранятся — in-memory only
```

## ИБ (зафиксировано)
1. tenant_id только из JWT, никогда из body (IDOR невозможен by design)
2. Pydantic extra='forbid', JWT в заголовке (не куки)
3. Текст договора → untrusted input в LLM, system/user разделены, якоря сверяются с PDF

---

## СТОИМОСТЬ СРЕД ПОСЛЕ FREE TIER

| Сервис | test/мес | prod/мес |
|--------|----------|----------|
| Cloud SQL db-f1-micro | ~$8 | ~$8 |
| Cloud Run | ~$0 | ~$1-3 |
| Firebase Hosting/Auth | $0 | $0 |
| Прочее (secrets, registry) | <$2 | <$2 |
| **Итого** | **~$10** | **~$12** |

~$22/мес оба проекта при 0-500 пользователях.

---

## ЧТО СКОПИРОВАТЬ В НОВЫЙ ЧАТ

1. Содержимое `DEPLOY_CONSTRAINTS.md` (C:\work\SignPDFMVPLocal\DEPLOY_CONSTRAINTS.md)
2. Содержимое `SignFinder_Concept_v2.0.md` (уже есть в project files)
3. Этот файл целиком
4. `TASK_MVP_Lite_Client.md` (C:\work\SignfinderLand\TASK_MVP_Lite_Client.md)

Системный промпт нового чата:
> Ты помогаешь Delivery Manager (Алексей, Тбилиси) развивать SaaS SignFinder.
> Стиль: коротко, технично, цинично, по-русски.
> Перед любыми инструкциями по деплою читать DEPLOY_CONSTRAINTS.md.
> При изменении кода: файлы на диск через MCP (C:\work\...), код в чате не выводить.
> Контекст проекта: читай приложенный session_summary.md.
