# TASK: Fix-18 — прод 422 на `/v1/feedback` + секреты выпадают из cloudbuild-prod.yaml

> Найдено вручную владельцем на живом проде: анкета «Что улучшить?»
> кидает 422. Причина и фикс — ниже, оба пункта в один PR
> (`signfinder-api`), деплой на прод — по обычному правилу, кнопку жмёт
> владелец, не ты (ADR-008).

## §1. Схема формы разъехалась между фронтом и бэком

Прод вернул:

```json
{"detail":[{"type":"extra_forbidden","loc":["body","has_referred"],
  "msg":"Extra inputs are not permitted","input":true}]}
```

Фронтенд (`SignfinderWeb`, `TASK_fix17.md` §3.4) уже шлёт `has_referred` —
эта часть на проде задеплоена. Бэкенд (`signfinder-api`,
`app/routers/feedback.py`) либо ещё не переименован из `would_refer` в
`has_referred` (правка из того же `TASK_fix17.md` §3.4 не сделана/не
смёржена), либо сделана но не задеплоена на прод.

**Сначала проверь факт, не переделывай вслепую:**
- `git log`/PR-история `signfinder-api` — искали `has_referred`. Если
  переименование уже есть в `main` — проблема только в деплое, к §3.
- Если переименования нет — сделай его сейчас, по спеке `TASK_fix17.md`
  §3.4 (то же самое, чтобы не разъезжаться второй раз):
  - `would_refer: Optional[bool]` → `has_referred: Optional[bool]`
  - Telegram-строка `Порекомендовал бы коллеге:` →
    `Уже порекомендовал коллеге:`
  - Заодно свериться что остальные пункты `TASK_fix17.md` §3 (контакт
    убран, `TWO_SIDED_SIGNING` убран, `TEAM_ACCESS` → `MAILBOX_INTEGRATION`)
    тоже реально в `main`, не только в задаче — прод уже один раз показал
    что фронт и бэк могут содержательно разъехаться, не проверять на
    веру.

## §2. `cloudbuild-prod.yaml` теряет Telegram-секреты при каждом полном деплое

```yaml
--set-secrets=DB_PASSWORD=db-password:latest,DEEPSEEK_API_KEY=deepseek-key:latest,API_KEY=api-key:latest
```

`TG_FEEDBACK_BOT_TOKEN`/`TG_FEEDBACK_CHAT_ID` здесь нет. Владелец только
что подключил их вручную через `--update-secrets` — но этот файл
использует `--set-secrets` внутри `gcloud run deploy`, который **заменяет
весь список секретов**, а не дополняет (`RUNBOOK_PROVISIONING.md` §2/§5).
Следующий же обычный прогон `deploy-prod.yml` тихо снесёт оба
Telegram-секрета без единой ошибки — обратка просто перестанет доходить,
и это не будет видно ни в CI, ни в логах деплоя.

Правка — одна строка:

```yaml
--set-secrets=DB_PASSWORD=db-password:latest,DEEPSEEK_API_KEY=deepseek-key:latest,API_KEY=api-key:latest,TG_FEEDBACK_BOT_TOKEN=tg-feedback-bot-token:latest,TG_FEEDBACK_CHAT_ID=tg-feedback-chat-id:latest
```

Сверить `cloudbuild-test.yaml` — если там та же дыра (секреты подключены
вручную, но не прописаны в файле), поправить симметрично, чтобы test не
наступил на то же при следующем полном редеплое.

## §3. Деплой — не твоё

PR открываешь и просишь ревью как обычно. `deploy-prod.yml` запускает
владелец сам, вручную, после мержа — не триггерь и не проси запустить за
тебя.

## DoD

- [ ] `feedback.py` на `main` содержит `has_referred`, соответствует
  фронту 1-в-1 (сверено, не предположено)
- [ ] Остальные пункты `TASK_fix17.md` §3 подтверждены в `main`
- [ ] `cloudbuild-prod.yaml` включает оба `TG_FEEDBACK_*` секрета в
  `--set-secrets`
- [ ] `cloudbuild-test.yaml` проверен на ту же дыру, поправлен если нужно
- [ ] PR готов, задеплоено — дело владельца
