# TASK: Обновить sandbox-демо — финальные договоры с подписями

## Шаг 1: Скопировать файлы

Скопируй из Downloads в C:\work\SignfinderLand\ все 8 файлов:
- demo_en_base.pdf
- demo_en_signed.pdf
- demo_ru_base.pdf
- demo_ru_signed.pdf
- demo_en_base.jpg
- demo_en_signed.jpg
- demo_ru_base.jpg
- demo_ru_signed.jpg

## Шаг 2: Обновить sandbox в index.html и index-enterprise.html

Найти функцию signDemo() (или аналог) в sandbox-секции обоих файлов.

### Логика показа документа

RU (lang === 'ru'):
- До нажатия: показать demo_ru_base.jpg (Лебедев уже подписал слева, Петров — пустая линия справа)
- После нажатия: показать demo_ru_signed.jpg (Петров появился справа)
- Скачать: demo_ru_signed.pdf

EN (lang !== 'ru'):
- До нажатия: показать demo_en_base.jpg (Vadimov уже подписал слева, Crawford — пустая линия справа)
- После нажатия: показать demo_en_signed.jpg (Crawford появился справа)
- Скачать: demo_en_signed.pdf

### Текст под превью (до нажатия)

RU: «Исполнитель подписал. Нажмите, чтобы подписать за Клиента.»
EN: «Contractor has signed. Click to sign for the Customer.»

### Текст кнопки

RU: «Подписать за Клиента»
EN: «Sign for Customer»

### Анимация появления подписи

При показе signed-версии:
- Не просто заменить картинку, а сделать появление с opacity 0 -> 1 за 0.6 сек
- Можно наложить два img друг на друга (base под, signed сверху), signed делает fadeIn

## Шаг 3: Убедиться что sandbox есть на обеих страницах

- index.html (cloud) — sandbox секция
- index-enterprise.html (enterprise) — та же sandbox секция

## Шаг 4: Деплой

cd C:\work\SignfinderLand
firebase deploy --only hosting
