# SignFinder — Техническое задание: Landing + Web Cabinet

## 1. Продукт

SignFinder — автоматический поиск мест подписи в PDF/DOCX + наложение факсимиле + LLM-ревью договора.
Целевой сегмент: ИП/фрилансеры (cloud), агентства/юротделы (enterprise/локальная установка).
URL: signfinder.app

---

## 2. Landing Pages (задеплоено, требует доработки)

### 2.1 Cloud лендинг (signfinder.app)
- **Стек**: HTML/JS/CSS, Firebase Hosting, hero.html в iframe
- **Язык**: RU (основной), EN (заморожен до отдельной итерации)
- **Пути**: `/` авто-детект, `/ru` принудительный RU, `/en` принудительный EN
- **Файлы**: `C:\work\SignfinderLand\index.html`

**Структура страницы:**
1. Шапка: логотип + «Войти» → /app + «Для бизнеса →» + RU/EN
2. Hero: H1 «Подпишите договор и отправьте за минуту», CTA «Попробовать бесплатно» → /app
3. Hero-анимация (iframe hero.html, 16:7, 37 сек, двуязычная)
4. Как это работает (3 шага)
5. «Как юрист которого у вас нет» (ключевой эмоциональный блок)
6. Для кого (4 карточки: ремонт, дизайн, аренда, почасовые)
7. **Sandbox-секция** — мок-демо (наши договоры) + дропзона-переход в /app
8. «Начните бесплатно» + disclaimer про факсимиле
9. Футер: Contacts: Telegram @SignFinder + email

**Sandbox (текущее состояние M4):**
- Демо: demo_ru.jpg (base) → demo_ru_signed.jpg (signed) после нажатия
- Подписывает за Клиента (справа), Лебедев слева уже стоит
- Дропзона → переход в /app (не загрузка документа на лендинге)
- PostHog: sandbox_demo_click, cta_click button=dropzone_to_app

### 2.2 Enterprise лендинг (signfinder.app/enterprise)
- **Файлы**: `C:\work\SignfinderLand\index-enterprise.html`
- **Стиль**: тёмный (#0a0e14), синий акцент (#3b6fd4)
- **Отличие от cloud**: H1 «Договоры на потоке — под вашим контролем», CTA «Запросить демо» → Telegram
- **Тот же sandbox** (demo-договор), вторичен

### 2.3 Hero анимация (hero.html)
- `C:\work\SignfinderLand\hero.html`
- 8 кадров: стопка (боль) → профиль → загрузка → сканирование+ревью → места подписи → подпись → пакет → готово
- Язык из URL ?lang=ru/en, слушает postMessage от родителя
- Петля ~37 сек (×1.2 от оригинала)

### 2.4 Аналитика лендинга
- PostHog EU, ключ в коде
- События: $pageview, cta_click, lang_switch, sandbox_demo_click, sandbox_demo_download
- Воронка: $pageview → sandbox_demo_click → download → telegram

---

## 3. Web Cabinet (signfinder.app/app)

### 3.1 Стек
- Frontend: vanilla JS SPA, responsive (380px mobile)
- Auth: Firebase Auth SDK v11.9.0 (Google + email/password + verification)
- Backend: Cloud Run signfinder-api (FastAPI), JWT-protected эндпоинты /v1/me/*
- DB: Cloud SQL Postgres 15 (asyncpg, unix socket)

### 3.2 Путь пользователя
```
signfinder.app → «Войти» → Firebase Auth
  → Google OAuth OR email + verify letter
  → email_verified=true → кабинет открыт
  → Профиль → Подпись → Сторона → Рабочий экран
```

### 3.3 Разделы кабинета

**Профиль**
- ФИО, компания, реквизиты (plain text)
- GET/PUT /v1/me/profile

**Подпись**
- `<input type="file" accept="image/*" capture="environment">` (камера на телефоне)
- OpenCV обработка: crop, HSV+adaptive, RGBA, прозрачный фон
- Хранение: bytea в Postgres (таблица signatures), одна на user_id
- GET/PUT /v1/me/signature, POST /v1/me/signature/process

**Шаблон стороны**
- Название + роль, один на user_id
- GET/PUT /v1/me/party

**Рабочий экран**
- Progress bar лимита (X из 10/месяц)
- Дропзона: PDF/DOCX, лимит 3 стр / 5 МБ
- POST /v1/me/analyze → найденные стороны (предвыбор из шаблона)
- POST /v1/me/sign → подпись из DB, атомарный чек+инкремент → PDF
- Договор in-memory, НЕ персистируется
- GET /v1/me/usage → {doc_count, limit, period}

### 3.4 Лимиты
- 10 документов в месяц (usage_counters, period=YYYY-MM)
- Превышение → 429, UI «лимит исчерпан»
- Атомарная транзакция FOR UPDATE (нет race condition)

### 3.5 Аналитика кабинета
- PostHog те же EU события:
  signup_started, signup_completed, profile_filled, signature_uploaded, document_signed, limit_reached
- Воронка: signup_started → signup_completed → signature_uploaded → document_signed

### 3.6 БД схема (текущая)
```sql
users          (firebase_uid PK, email, created_at)
profiles       (user_id FK→users, full_name, company, requisites_json)
signatures     (user_id FK→users, png_bytes BYTEA, created_at)
parties        (user_id FK→users, name, role, patterns_json)
usage_counters (user_id FK→users, period VARCHAR, doc_count INT)
```
Миграции: 001_init.sql, 002_signatures_bytea.sql (обе применены на test)

---

## 4. Инфраструктура

### 4.1 Среды
| Компонент | test | prod |
|-----------|------|------|
| GCP Project | signfinder-test | signfinder-prod |
| Cloud Run | signfinder-api | signfinder-api |
| Cloud SQL | europe-west1 | europe-west1 |
| Firebase Hosting | signfinder-cab-test.web.app | signfinder.app |
| Firebase Auth | test project | prod project |
| Secret Manager | deepseek-key | deepseek-key |

### 4.2 API
- Base: `/api/**` → Cloud Run через Firebase rewrite
- Auth: Firebase JWT в Authorization: Bearer
- Ключевые эндпоинты:
  - `POST /api/v1/analyze` — анализ договора
  - `POST /api/v1/sign` — подписание
  - `GET/PUT /v1/me/*` — кабинет (JWT required)

### 4.3 Файловая структура (единственная точка истины)
```
C:\work\
├── .dockerignore              ← в корне C:\work\
├── signfinder-core\           ← pip-пакет, бизнес-логика
├── signfinder-api\app\        ← ЕДИНСТВЕННЫЙ источник кода API
├── SignPDFMVPLocal\
│   ├── api\Dockerfile
│   └── docker-compose.yml
└── SignfinderLand\            ← лендинг + кабинет
    ├── index.html
    ├── index-enterprise.html
    ├── hero.html
    ├── firebase.json
    └── app\index.html         ← кабинет SPA
```

---

## 5. Открытые задачи (следующий чат)

### M4 (незакрыто)
- [ ] Кнопка «Войти» на лендинге → /app
- [ ] Sandbox-дропзона → переход в /app (не дублировать анализ)
- [ ] Prod-проект signfinder-prod: Cloud SQL + Firebase Auth + Cloud Run
- [ ] DNS: signfinder.app → Firebase Hosting (Cloudflare proxy OFF — серая тучка!)
- [ ] Smoke-тест полного цикла на prod руками (владелец)
- [ ] IDOR-проверка двумя аккаунтами

### Governance (следующий этап)
- CI/CD: GitHub Actions PR → test → ручной prod gate
- Alembic для миграций
- Runbooks: Tech Support, Incident Response, Rollback, Marketing
- Реестр секретов
- ADR-индекс (~8 решений)
- Политика бэкапов + восстановление
- Data Retention (GDPR)
- Мониторинг: Cloud Run error rate, Cloud SQL disk

### Продуктовый беклог
- 20 правок RU-лендинга (список у владельца)
- EN-перевод (заморожен)
- Договоры: подписи владельца вместо синтетических
- Pricing / биллинг (после первых регистраций)
- Multi-party (второй подписант)
- IMAP-агент (v1.16 в roadmap core)
