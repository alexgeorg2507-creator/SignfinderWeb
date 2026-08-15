# TASK: i18n-EN — перевести опросник «Что улучшить?»

> Отменяет прежнее решение из `TASK_i18n_en.md` §0 («опросник остаётся
> только RU, внутренний инструмент») — владелец пересмотрел, увидев
> живой EN-кабинет. Backend не трогать вообще — только фронт-форма.

## Backend — без изменений

`app/routers/feedback.py` — `UsageType`/`PremiumFeature` это ключи
enum (`"local_deployment"`, `"legal_dept"` и т.п.), не текст для
показа — они одинаковые независимо от языка интерфейса. Telegram-
сообщение владельцу (`_format_message`) остаётся на русском всегда —
это твой личный инструмент, не пользовательский интерфейс, переводить
незачем. Ничего в этом файле не трогать.

## Frontend — добавить в словарь + `data-i18n` на форму

Форма `app/index.html`, вкладка «Что улучшить?» — она была намеренно
пропущена в первом проходе i18n (`TASK_i18n_en.md`), теперь довести до
той же логики что и весь остальной кабинет.

Ключ → RU (уже есть в разметке) → EN (добавить):

| Ключ | RU | EN |
|------|-----|-----|
| `fb_usage_q` | Как вы используете SignFinder? | How do you use SignFinder? |
| `fb_usage_freelancer` | Фрилансер / ИП | Freelancer / Sole proprietor |
| `fb_usage_small_business` | Малый бизнес | Small business |
| `fb_usage_legal_dept` | Юридический отдел / агентство | Legal department / agency |
| `fb_usage_other` | Другое | Other |
| `fb_premium_q` | Какая из этих возможностей повысит вероятность что вы станете платящим? | Which of these would increase the likelihood you'd become a paying user? |
| `fb_premium_local` | Локальная установка — документы не покидают вашу инфраструктуру | Local / on-premise installation — documents never leave your infrastructure |
| `fb_premium_limits` | Расширенные лимиты объёма документов | Higher document volume limits |
| `fb_premium_api` | API/интеграции (Cursor, Claude Desktop и т.п.) | API / integrations (Cursor, Claude Desktop, etc.) |
| `fb_premium_mailbox` | Интеграция с почтовым ящиком и обработка в фоновом режиме | Mailbox integration with background processing |
| `fb_premium_other_placeholder` | Другое | Other |
| `fb_referred_q` | Вы уже порекомендовали коллеге? | Have you already recommended it to a colleague? |
| `fb_referred_yes` | Да | Yes |
| `fb_referred_no` | Нет | No |
| `fb_submit` | Отправить | Send |

**Значения `PremiumFeature`/`UsageType` которые реально уходят в
`POST /v1/feedback`** — те же enum-ключи (`"local_deployment"` и т.п.)
независимо от того на каком языке показывалась форма. Переводится
только то, что видит человек, не то что летит на бэкенд.

## DoD

- [ ] Опросник на `/en/app` — вопросы и варианты на английском
- [ ] Реальная отправка формы на EN → в Telegram владельцу приходит
  тот же формат на русском, что и раньше (не сломалось)
- [ ] RU-кабинет — опросник не изменился
- [ ] Бампнуть `SignfinderLand/version.txt`
