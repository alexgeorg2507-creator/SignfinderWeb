# SignFinder — Реестр секретов и доступов

> Здесь НЕТ значений секретов. Только где они лежат, кто может их видеть,
> и что делать при компрометации. Сам файл можно смело коммитить в git.
>
> **Обновлено:** июль 2026, подтверждено живыми `gcloud secrets list` /
> `gcloud run services describe`, не только конфигами в репо.
> Статусы: ✅ подтверждено live · ⚠️ подтверждённая проблема · ❓ требует проверки

---

## Project id — решено

`.firebaserc` в `SignfinderLand` — источник правды:
```json
{ "default": "signfinder-prod", "prod": "signfinder-prod",
  "test": "signfinder-cab-test", "c1163-legacy": "signfinder-c1163" }
```
**`signfinder-prod` — реальный прод**, `signfinder-cab-test` — реальный test.
`signfinder-c1163` явно помечен легаси в самом конфиге. Подтверждено живым
`gcloud run services describe` на `signfinder-prod` — сервис работает,
секреты подключены (таблица ниже).

**Долг:** `.env.prod.example` в `signfinder-api` всё ещё указывает Cloud SQL
на `signfinder-c1163` — устаревший шаблон, вводит в заблуждение при локальной
настройке. Задача в `BACKLOG.md`.

**Не закрыто:** есть четвёртый GCP-проект — голый `signfinder` (id без
суффиксов, номер 753184980506). Не в `.firebaserc`, не проверен на
секреты/сервисы. Возможно исходный org-level проект. Низкий приоритет.

```powershell
# что в c1163 ещё живого и сколько это стоит — кандидат на декоммишнинг
gcloud run services list --project=signfinder-c1163 --region=europe-west1
gcloud sql instances list --project=signfinder-c1163

# что такое голый проект "signfinder"
gcloud projects describe signfinder
gcloud run services list --project=signfinder --region=europe-west1

# монтируется ли firebase-admin-sa как файл (не как env-переменная)
gcloud run services describe signfinder-api --project=signfinder-prod --region=europe-west1 --format="yaml(spec.template.spec.volumes,spec.template.spec.containers[0].volumeMounts)"
```

---

## Секреты — облачный контур (signfinder-api / Cloud Run)

Подтверждено `gcloud secrets list` + `gcloud run services describe` на живых
ревизиях. Колонка "в env" = реально подключено к текущей ревизии на момент
проверки, не то, что написано в yaml.

| Секрет | signfinder-cab-test | signfinder-prod | Статус |
|--------|----------------------|-------------------|--------|
| Cloud SQL пароль | `db-password` — ✅ в env | `db-password` — ✅ в env | Работает на обеих средах |
| DeepSeek API key | `deepseek-api-key` существует в Secret Manager, но **❌ НЕТ в env** | `deepseek-key` — ✅ в env | 🟡 Подтверждено кодом (`main.py::_init_llm_config`): при отсутствии ключа — тихий `return`, без краха. LLM молча не работает на test, эндпоинты пайплайна отвечают ошибкой на уровне signfinder-core, не 500 на старте |
| Внутренний API_KEY | `api-key` существует, но **❌ НЕТ в env** | `api-key` — ✅ в env | 🟡 Подтверждено кодом (`dependencies.py::verify_api_key`): при отсутствии кидает необработанный `RuntimeError` → FastAPI отдаёт 500. **НЕ fail-open**, дыры без замка нет. Ломает только легаси/внутренний API-слой (`pipeline`, `templates`, `signers`, `parties`...) — кабинетные `/v1/me/*` используют отдельный Firebase-auth, не задеты |
| Firebase Admin SDK | секрет `firebase-admin-sa` существует, **не в env** | секрет `firebase-admin-sa` существует, **не в env** | ✅ Подтверждено кодом (`auth.py::init_firebase`) — `firebase_admin.initialize_app()` без явных credentials, чистый ADC через `--service-account`. Секрет практически наверняка не используется — кандидат на удаление, не только на проверку |
| `deepseek-api-key` (вариант имени) | секрет существует, нигде не используется | — | ⚠️ Орфанный секрет, дублирует `deepseek-key`/`deepseek-api-key` в других проектах. Унифицировать имя, удалить лишнее |
| `anthropic-api-key` / `signfinder-api-key` | — | — | Легаси-имена только в старом `cloudbuild.yaml` без суффикса. Не проверено, существуют ли в Secret Manager — искать не в этих двух проектах, а во всех четырёх |
| PostHog project key | вшит в HTML лендинга/кабинета | тот же ключ | ✅ Не секрет by design — client-side, публичный |

---

## signfinder-c1163 (легаси) — ПОДТВЕРЖДЕНО: ЖИВОЙ Cloud Run + Cloud SQL

**Не мёртвый проект.** Подтверждено `gcloud run services list` +
`gcloud sql instances list`:
- Cloud Run `signfinder-api` — работает, последний деплой 27 июня
  (`alexgeorg2507@gmail.com`). URL: `https://signfinder-api-550139861345.europe-west1.run.app`
- Cloud SQL `signfinder-db` (Postgres 15, `db-f1-micro`) — `RUNNABLE`,
  платный публичный IP

Секреты (5 штук, включая дубль `deepseek-key`/`deepseek-api-key`) — активно
используются этим живым сервисом, не сироты.

**Перед декоммишном — проверить данные.** С 27 июня туда могли писаться
реальные profile/signature (договоры не персистятся по ADR-002, остальное — да).
Снести не глядя — риск потерять данные, если это не пустышка из ранней разработки.

```powershell
gcloud sql connect signfinder-db --project=signfinder-c1163 --user=signfinder
# внутри psql: \dt   затем SELECT count(*) FROM <таблица>;
```

**Решение после проверки:**
- Пусто/тестовые данные → `gcloud run services delete signfinder-api --project=signfinder-c1163`
  + `gcloud sql instances delete signfinder-db --project=signfinder-c1163`
- Есть реальные строки → сначала `gcloud sql export sql` в GCS, ручный
  разбор что мигрировать в `signfinder-prod`, потом уже снос

До решения — ничего не удалять.

---

## Легаси cloudbuild.yaml — риск понижен, не закрыт

`gcloud builds triggers list` пуст и для prod, и для test — автоматических
триггеров нет. Легаси `signfinder-api/cloudbuild.yaml` (без Cloud SQL,
без `DB_PASSWORD`, с `ANTHROPIC_API_KEY` вместо `DEEPSEEK_API_KEY`) сам по
себе от `git push` не выстрелит. Деплой явно ручной.

**Следствие:** `GIT_WORKFLOW.md` описывает автоматический деплой на test
через Cloud Build trigger при мерже в `main` — по факту этого не существует.
Документ описывает целевой процесс, не реальный. Актуально для
Governance Этап 2 (CI/CD), см. `BACKLOG.md`.

**Остаточный риск:** если кто-то (человек или агент) вручную запустит
`gcloud builds submit --config=cloudbuild.yaml` по привычке — снесёт Cloud
SQL attachment и секреты. Файл стоит удалить или явно пометить как мёртвый.

---

## Локальный контур (SignPDFMVPLocal — не облачный, не Secret Manager)

Отдельный периметр, не пересекается с cloud-инфраструктурой кабинета.

| Секрет | Где | Статус |
|--------|-----|--------|
| DeepSeek API key (локальный) | `SignPDFMVPLocal/data/api/llm_config.json`, plaintext | ✅ найден на диске, `data/` в `.gitignore`. Значение не публикуется здесь |
| `API_KEY` / `ACCESS_CODE` (auth локального UI) | `SignPDFMVPLocal/.env`, реальный файл существует | ✅ найден, gitignored |
| IMAP/SMTP пароли (mail-агент) | `SignPDFMVPLocal/.env`, опционально | ❓ не проверено, заполнены ли реальные значения |

Plaintext на диске одной машины — приемлемо для соло-разработки, но это
отдельная политика от облачного контура выше, не путать в презентациях.

---

## Что НЕ нашлось (хорошая новость)

Поиск по `signfinder-api`, `signfinder-core`, `SignfinderLand` (`**/*.json`,
`.env*`) не выявил ни одного файла сервис-аккаунта (`firebase-sa.json` и
подобных). Реальных (не `.example`) `.env.prod` / `.env.test` в
`signfinder-api` нет — только шаблоны. Утечки через файлы в репо не
обнаружено.

---

## Кто имеет доступ

| Кто | Доступ | Уровень |
|-----|--------|---------|
| Владелец (ты) | Owner на GCP-проектах | Полный |
| AI-агент (Claude Code/кодер) | Виртуальный — через твою `gcloud CLI` сессию | Столько, сколько разрешает текущая `gcloud auth`-сессия |

Агент не имеет собственных учётных данных — всё под твоей авторизацией.
Ограничение только процессное (`GIT_WORKFLOW.md`), не техническое.

---

## Политика ротации

| Секрет | Когда ротировать |
|--------|-------------------|
| DeepSeek key | При подозрении на утечку. Иначе — не чаще раза в год |
| Cloud SQL пароль | При компрометации немедленно |
| Firebase Admin SDK | Неприменимо, если подтвердится ADC — нет ключа для ротации |
| Орфанные/легаси секреты (`anthropic-api-key`, `deepseek-api-key` дубли) | Не ротировать — удалить после подтверждения, что не используются |

## При подозрении на утечку секрета

1. Немедленно инвалидировать старый ключ у провайдера (DeepSeek console / GCP)
2. Создать новую версию в Secret Manager
3. `gcloud run deploy` с `--update-secrets` (не `--set-secrets`, если меняешь
   только один секрет — `--set-secrets` заменяет список целиком)
4. Проверить логи на аномальное использование за период утечки
5. Записать инцидент в `RUNBOOK_TECH_SECURITY.md`
