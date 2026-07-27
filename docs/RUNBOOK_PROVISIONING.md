# SignFinder — Runbook: Provisioning (секреты, доступы, ручные шаги)

> Всё что агент/кодер не может сделать сам — значения секретов, кнопка
> prod-деплоя, регистрация внешних сервисов (Telegram-боты и т.п.) —
> ложится на владельца руками (`GIT_WORKFLOW.md` §Явные запреты, п.4-5).
> Этот файл — как делать это одинаково каждый раз, не изобретая заново
> и не гадая через полгода "а как я это в прошлый раз настраивал".

---

## §1. Два хранилища секретов — не путать

| | GitHub Actions Secrets | GCP Secret Manager |
|---|---|---|
| Где | Repo → Settings → Secrets and variables → Actions | `gcloud secrets` в конкретном GCP-проекте |
| Кто читает | Только сам workflow, только во время его выполнения, на GitHub-раннере | Работающий Cloud Run контейнер, в рантайме запроса |
| Доступ из живого API | **Нет, никогда.** Раннер и контейнер — разные процессы в разных системах | Да — если секрет примонтирован через `--update-secrets` |
| Можно прочитать значение обратно | **Нет.** Только перезаписать | Да — `gcloud secrets versions access latest` |
| Пример использования в проекте | `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` — деплой-уведомления из `deploy-prod.yml` | `tg-feedback-bot-token`, `db-password`, `api-key` — то, что нужно коду `signfinder-api` в момент обработки HTTP-запроса |

**Правило:** если секрет нужен коду, который отвечает на реальный запрос
пользователя (не CI-шагу) — он идёт только в GCP Secret Manager +
`--update-secrets` на Cloud Run. GitHub Secrets для этого не подходят
структурно, не только по вкусу.

Реестр что где лежит — `SECRETS_REGISTRY.md`. Этот файл — только *как*
заводить, тот — *что* уже заведено.

---

## §2. Общий паттерн — новый секрет для Cloud Run

Работает для любого будущего секрета, не только Telegram.

```powershell
# 1. Создать секрет (первая версия)
"<VALUE>" | gcloud secrets create <SECRET_NAME> --data-file=- --project=<PROJECT>

# 2. Примонтировать к Cloud Run как env-переменную
gcloud run services update signfinder-api --project=<PROJECT> --region=europe-west1 `
  --update-secrets=<ENV_VAR_NAME>=<SECRET_NAME>:latest

# 3. Подтвердить что примонтировано на АКТУАЛЬНОЙ ревизии (не задекларировано,
#    а реально там — см. урок в SECRETS_REGISTRY.md, "было в env" не всегда
#    значит "видно на ready-ревизии")
gcloud run services describe signfinder-api --project=<PROJECT> --region=europe-west1 `
  --format="yaml(status.latestReadyRevisionName,spec.template.spec.containers[0].env)"
```

`--update-secrets` **добавляет/обновляет** секреты, не трогая остальные.
`--set-secrets` **заменяет весь список** — случайно снесёшь остальные
секреты сервиса. Использовать `--update-secrets`, если явно не нужно
полностью пересобрать список с нуля.

Порядок test → prod всегда: сначала `--project=signfinder-cab-test`,
проверка что фича реально работает (не просто "команда прошла"), потом
то же самое с `--project=signfinder-prod`.

---

## §3. Telegram-бот — конкретный пример

### 3.1 Решение: переиспользовать существующий бот или завести новый

Существующий бот (`TELEGRAM_BOT_TOKEN` в GitHub Secrets) уже шлёт
деплой-уведомления в личный чат владельца. Токен — просто строка, не
привязан к хранилищу, физически можно переиспользовать для второго
канала сообщений (фидбек от клиентов) — Telegram не ограничивает
`sendMessage` от нескольких источников одновременно (конфликтует только
`getUpdates`-polling, тут его нет).

| Вариант | Когда |
|---|---|
| Переиспользовать бот | Значение токена сохранено где-то (менеджер паролей/заметки) вне GitHub Secrets. По умолчанию — этот, дешевле |
| Новый бот через `/newbot` | Значения токена нет под рукой (из GitHub Secrets прочитать нельзя, только перезаписать), ИЛИ осознанно хочешь разделить потоки (деплой-алерты отдельно от клиентского фидбека, чтобы мьютить по отдельности) |

### 3.2 Новый бот (если решили заводить)

1. Telegram → `@BotFather` → `/newbot` → сохранить `HTTP API token`
2. Написать `/start` этому боту от своего аккаунта
3. Забрать `chat_id`:
   ```powershell
   curl "https://api.telegram.org/bot<TOKEN>/getUpdates"
   ```
   Взять `result[0].message.chat.id` из ответа

### 3.3 Заведение секретов + подключение (по паттерну §2)

```powershell
"<TOKEN>" | gcloud secrets create tg-feedback-bot-token --data-file=- --project=signfinder-cab-test
"<CHAT_ID>" | gcloud secrets create tg-feedback-chat-id --data-file=- --project=signfinder-cab-test

gcloud run services update signfinder-api --project=signfinder-cab-test --region=europe-west1 `
  --update-secrets=TG_FEEDBACK_BOT_TOKEN=tg-feedback-bot-token:latest,TG_FEEDBACK_CHAT_ID=tg-feedback-chat-id:latest
```

Прод — то же самое с `--project=signfinder-prod`, после подтверждения на test.

### 3.4 Проверка — не "команда не упала", а реальная доставка

Открыть кабинет на test → «Что улучшить?» → заполнить → отправить →
убедиться что сообщение реально пришло в Telegram-чат. Команда без
ошибки ≠ секрет реально работает (см. §5, инцидент с Cloud Scheduler).

---

## §4. Обновление GitHub Actions Secrets (для деплой-уведомлений)

Repo → Settings → Secrets and variables → Actions → New/Update secret.
CLI-аналог: `gh secret set TELEGRAM_BOT_TOKEN --repo <owner>/<repo>`.

Секреты объявлены **отдельно на каждый репозиторий** (`signfinder-api` и
`SignfinderWeb`) — если меняешь токен общего бота, обновить в обоих, не
только там, где вспомнил.

Значение прочитать обратно нельзя — если забыл и не сохранил отдельно,
единственный путь — сгенерировать новое через `@BotFather` → `/revoke` и
обновить везде, где оно использовалось (GitHub Secrets в обоих репо +
GCP Secret Manager, если бот тот же).

---

## §5. Известные грабли провижининга

- **Cloud Scheduler + заголовок `Authorization`** — `--headers`/
  `--update-headers` молча не сохраняет значение для этого конкретного
  имени заголовка (подозрение — зарезервирован под встроенный
  OIDC-механизм). Живой открытый кейс, детали и варианты решения —
  `TASK_e5_scheduler_auth_followup.md`. Урок общий: после провижининга
  через `gcloud` — всегда `describe`/`run` проверка что значение реально
  долетело, не полагаться что "команда без ошибки" значит "применилось".
- **`--set-secrets` вместо `--update-secrets`** — заменяет весь список
  секретов сервиса, не добавляет. См. `SECRETS_REGISTRY.md`, §При
  подозрении на утечку, п.3.
- **CI/CD-пайплайн сам использует `--set-secrets` — ручное
  `--update-secrets` переживает только до следующего деплоя.**
  (2026-07-27, найдено живьём на `tg-feedback-*`.) `signfinder-api`'s
  `cloudbuild-{test,prod}.yaml` деплоит через `gcloud run deploy
  --set-secrets=<жёстко прописанный список>` — это не то же самое что
  ручной `gcloud run services update --update-secrets=...`. Владелец
  примонтировал `tg-feedback-bot-token`/`tg-feedback-chat-id` вручную,
  форма реально сработала — а затем следующий (совершенно не связанный)
  PR смёржился, CI/CD передеплоил сервис через `cloudbuild-test.yaml`, и
  секреты пропали, потому что их не было в захардкоженном
  `--set-secrets`-списке файла. **Правило: если секрет должен быть
  постоянным (не разовым тестом) — его нужно добавить в
  `--set-secrets` внутри `cloudbuild-test.yaml` (и `cloudbuild-prod.yaml`
  когда дойдёт очередь до прода), не только примонтировать вручную.**
  Ручной `--update-secrets` подходит только для разовой проверки перед
  тем как закоммитить постоянную правку в cloudbuild-файл.
- **GitHub Secrets нельзя прочитать обратно** — см. §4 выше. Если такое
  значение нужно ещё где-то (например, скопировать в GCP Secret Manager)
  — сохранять его в момент создания, не полагаться на возможность достать
  позже.

---

## §6. Чеклист "после провижининга"

- [ ] Секрет создан в правильном GCP-проекте (test ≠ prod, легаси
  `signfinder-c1163` — не тот проект вообще, см. `SECRETS_REGISTRY.md`)
- [ ] `--update-secrets`, не `--set-secrets` (если не пересобираешь список нарочно)
- [ ] `gcloud run services describe` подтверждает переменную на
  **актуальной ready-ревизии**, не просто "должна быть"
- [ ] Живая функциональная проверка (реальное действие в UI/API, не
  просто "деплой прошёл") — команда прошла без ошибки ≠ работает
- [ ] Если секрет общий с GitHub Actions (например, тот же бот-токен) —
  значение сохранено где-то читаемом (не только в GitHub Secrets), на
  случай если понадобится ещё раз
- [ ] `SECRETS_REGISTRY.md` обновлён — статус секрета из ⏳ в ✅, с датой подтверждения
- [ ] Если секрет должен пережить следующий CI/CD-деплой — добавлен в
  `--set-secrets` внутри `cloudbuild-{test,prod}.yaml` (кодер делает
  отдельным PR), не только примонтирован вручную через
  `--update-secrets`

---

## См. также

- `SECRETS_REGISTRY.md` — реестр: что уже заведено, где лежит, политика ротации, что делать при утечке
- `GIT_WORKFLOW.md` §Явные запреты — что агент не делает никогда (руками секреты не передавать)
- `TASK_e5_scheduler_auth_followup.md` — открытый кейс с Cloud Scheduler auth
