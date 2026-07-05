# TASK: SignFinder Sandbox — Реализация в 4 этапа

> Прочитай демо-договоры в этой же папке:
> - C:\work\SignfinderLand\Contract_en_custom.pdf
> - C:\work\SignfinderLand\Contract_rus_custom.docx

---

## Обзор этапов

| Этап | Что | Результат |
|------|-----|-----------|
| v0.1 | Sandbox-секция с мок-демо | Кнопка «Подписать демо» показывает предзаготовленный результат |
| v0.2 | API Core на Cloud Run | signfinder-api доступен через /api/* |
| v0.3 | Дропзона «свой договор» | Загрузка PDF, реальный API |
| v0.4 | Лимиты и защита | Rate limit, honeypot, валидация |

---

## СЕЙЧАС ДЕЛАЕМ: Этап v0.1 — Sandbox с мок-демо

### Задача

Добавить sandbox-секцию в index.html и index-enterprise.html.
Кнопка «Подписать демо» работает на статике — никакого API.

### Что должно быть на экране

НАЧАЛЬНОЕ СОСТОЯНИЕ:
- PDF-превью демо-договора (статичная картинка первой страницы)
- Справа: сторона Vertex Group Ltd, подписант А.П.Лебедев / Lebedzeu A.
- Одна кнопка «Подписать демо»
- Пометка: демо-режим, документ предустановлен

ПОСЛЕ НАЖАТИЯ (через 1.5 сек спиннер):
- PDF-превью с наложенными подписями (другая картинка)
- Светофоры: зелёный «Места подписи: 2», жёлтый «Ревью: 2 замечания»
- Карточки замечаний (срок не указан, стороны найдены, проверить расчёты)
- Кнопка «Скачать PDF»
- Ниже: дропзона «Попробуйте на своём» с текстом «Скоро» (заглушка)

### Шаги реализации

1. Конвертировать Contract_rus_custom.docx в PDF (через LibreOffice):
   libreoffice --headless --convert-to pdf Contract_rus_custom.docx
   Если LibreOffice не установлен — использовать Contract_en_custom.pdf для обоих языков.

2. Сделать PNG-превью первой страницы каждого договора:
   pdftoppm -jpeg -r 150 -f 1 -l 1 Contract_en_custom.pdf demo_preview_en
   Аналогично для RU.
   Также сделать «подписанную» версию — тот же PNG с наложенным росчерком подписи.

3. Создать demo_result_ru.json и demo_result_en.json:

demo_result_ru.json:
{
  "traffic_light": "green",
  "anchors_count": 2,
  "review": {
    "traffic_light": "yellow",
    "remarks": [
      {"severity": "warning", "text": "Срок действия договора не указан явно (п. 7.1)"},
      {"severity": "ok", "text": "Стороны идентифицированы"},
      {"severity": "warning", "text": "Проверьте порядок расчётов (раздел 5)"}
    ]
  }
}

demo_result_en.json:
{
  "traffic_light": "green",
  "anchors_count": 2,
  "review": {
    "traffic_light": "yellow",
    "remarks": [
      {"severity": "warning", "text": "Contract term not explicitly stated (cl. 7.1)"},
      {"severity": "ok", "text": "Parties identified"},
      {"severity": "warning", "text": "Check payment schedule (section 5)"}
    ]
  }
}

4. Добавить sandbox-секцию в index.html — ЗАМЕНИТЬ текущий блок sandbox-cta + dropzone-mock.
   Sandbox-секция должна:
   - Показывать превью (img, не canvas)
   - При нажатии кнопки: показать спиннер 1.5 сек, потом результат
   - Результат: заменить превью на «подписанную» версию, показать светофоры и замечания
   - Кнопка скачать (пока alert или ссылка на демо-PDF)
   - Дропзона с текстом «Загрузка своего документа — скоро»

5. Скопировать sandbox-секцию в index-enterprise.html (те же данные).

6. PostHog события: sandbox_demo_click при нажатии, sandbox_demo_download при скачивании.

7. Деплой:
   cd C:\work\SignfinderLand
   firebase deploy --only hosting

### Язык sandbox

Sandbox привязан к языку страницы (переменная из setLang).
Демо-договор, превью, результат — все переключаются при смене языка.
RU → demo_preview_ru, demo_result_ru.json
EN → demo_preview_en, demo_result_en.json

### Спиннер

3 фазы текста по 500мс:
- «Анализируем договор...»
- «Проверяем целостность...»
- «Подписываем...»
EN: «Analyzing contract...», «Checking integrity...», «Signing...»

### Стиль

Cloud (index.html): тёплый фон var(--bg-soft), бирюзовый акцент var(--accent)
Enterprise (index-enterprise.html): тёмный фон var(--panel), синий акцент var(--accent)

Светофоры и замечания — такие же как в hero.html анимации:
- Зелёный кружок + текст для мест подписи
- Жёлтый кружок + текст для ревью
- Карточки замечаний с левой полоской (жёлтая = warning, зелёная = ok)

---

## ПОТОМ: Этап v0.2 — API на Cloud Run

### Предварительно

gcloud auth login
gcloud config set project signfinder-c1163
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com

### Artifact Registry

gcloud artifacts repositories create signfinder --repository-format=docker --location=europe-west1 --project=signfinder-c1163

### Сборка и push

cd C:\work
docker build -f SignPDFMVPLocal/api/Dockerfile -t signfinder-api .
docker tag signfinder-api europe-west1-docker.pkg.dev/signfinder-c1163/signfinder/api:latest
gcloud auth configure-docker europe-west1-docker.pkg.dev
docker push europe-west1-docker.pkg.dev/signfinder-c1163/signfinder/api:latest

### Cloud Run deploy

gcloud run deploy signfinder-api --image=europe-west1-docker.pkg.dev/signfinder-c1163/signfinder/api:latest --platform=managed --region=europe-west1 --port=8000 --memory=1Gi --cpu=1 --min-instances=0 --max-instances=3 --timeout=60 --allow-unauthenticated --set-env-vars="STORAGE_MODE=local" --project=signfinder-c1163

### Firebase proxy

Добавить в C:\work\SignfinderLand\firebase.json в rewrites (ПЕРВЫМ, до остальных):
{"source": "/api/**", "run": {"serviceId": "signfinder-api", "region": "europe-west1"}}

firebase deploy --only hosting

### Проверка

curl https://signfinder-c1163.web.app/api/docs
Должна открыться Swagger-документация API.

---

## ПОТОМ: Этап v0.3 — Дропзона

Включить реальную загрузку в sandbox-секции:
- drag & drop + клик на дропзону
- POST /api/v1/analyze (multipart/form-data)
- Показать найденные стороны (radio-кнопки)
- POST /api/v1/sign → скачать blob
- localStorage счётчик 3/день
- Ошибки: файл большой, много страниц, не PDF, лимит, API ошибка

---

## ПОТОМ: Этап v0.4 — Серверные лимиты

Middleware в signfinder-api:
- Rate limit по IP: 3/день (in-memory dict)
- Page count: <= 3
- File size: <= 5 MB
- Sandbox API key
Пересборка image + redeploy Cloud Run.
