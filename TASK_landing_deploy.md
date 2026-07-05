# SignFinder Landing — Финальная подготовка к деплою

## ЧТО НУЖНО СДЕЛАТЬ

### 1. Дофиксить index-enterprise.html (JS-блок в конце)

Заменить последний `<script>...</script>` блок (начинается с `const I18N = {`) на этот:

```javascript
// [весь блок I18N остаётся без изменений]

function setLang(l) {
  sessionStorage.setItem('sf_lang', l);
  document.querySelectorAll(".nav-lang button").forEach(b => b.classList.toggle("active", b.dataset.lang === l));
  document.querySelectorAll("[data-i]").forEach(el => { const k = el.dataset.i; if (I18N[l][k] !== undefined) el.innerHTML = I18N[l][k]; });
  document.documentElement.lang = l;
  document.querySelectorAll("iframe").forEach(fr => {
    try { fr.contentWindow.postMessage({type:"setLang",lang:l},"*"); } catch(e){}
  });
  if (window.posthog) posthog.capture('lang_switch', {lang: l, page: 'enterprise'});
}
function requestDemo() {
  const lang = document.documentElement.lang || 'ru';
  const msg = lang === 'en'
    ? 'Hi! I would like a SignFinder Enterprise demo 🙂'
    : 'Добрый день! Хотим демо SignFinder для бизнеса 🙂';
  try { navigator.clipboard.writeText(msg); } catch(e) {}
  if (window.posthog) posthog.capture('cta_click', {button: 'demo_telegram', page: 'enterprise', lang});
  window.open('https://t.me/SingFinder', '_blank');
}
function scrollToDemo() { document.getElementById('demo-section').scrollIntoView({ behavior: 'smooth' }); }
function openSandbox() {
  const lang = document.documentElement.lang || 'ru';
  if (window.posthog) posthog.capture('cta_click', {button: 'sandbox', page: 'enterprise', lang});
  alert('Sandbox будет доступен завтра.');
}
const _autoLang = sessionStorage.getItem('sf_lang') || ((navigator.language || 'ru').startsWith('ru') ? 'ru' : 'en');
setLang(_autoLang);
if (window.posthog) posthog.capture('$pageview', {page: 'enterprise', lang: _autoLang});
```

Изменения vs текущего кода:
- setLang: добавить `sessionStorage.setItem` + `posthog.capture`
- requestDemo: добавить `posthog.capture`  
- openSandbox: добавить `posthog.capture`, убрать alert со старым текстом
- последняя строка: `setLang("ru")` → авто-детект из sessionStorage/navigator.language

---

## ДЕПЛОЙ — ПОШАГОВЫЕ КОМАНДЫ

### Шаг 0: Проверить окружение

```powershell
# gcloud
gcloud --version
gcloud auth list                    # → должен быть твой email со *
gcloud config get-value project     # → должно быть: signfinder

# Если проект не тот:
gcloud config set project signfinder

# Включить Firebase API (если не включён)
gcloud services enable firebase.googleapis.com firebasehosting.googleapis.com
```

### Шаг 1: Установить Firebase CLI

```powershell
npm install -g firebase-tools
firebase --version   # → проверить что установился
```

### Шаг 2: Логин и связка с проектом

```powershell
firebase login       # откроется браузер
firebase projects:list   # должен появиться signfinder
```

### Шаг 3: Деплой

```powershell
cd C:\work\SignfinderLand
firebase deploy --only hosting
```

Ожидаемый вывод:
```
✔ Deploy complete!
Hosting URL: https://signfinder.web.app
```

### Шаг 4: Проверить

- https://signfinder.web.app          → cloud лендинг (авто-язык)
- https://signfinder.web.app/enterprise → enterprise лендинг
- https://signfinder.web.app/hero.html  → анимация

---

## POSTHOG — ПОЛУЧИТЬ КЛЮЧ

1. Зайти на https://eu.posthog.com
2. Sign up → организация "SignFinder"
3. Создать проект "landing"
4. Скопировать API key (формат: phc_XXXXXXXX)
5. Заменить YOUR_POSTHOG_KEY в обоих файлах:
   - index-cloud.html: строка `posthog.init('YOUR_POSTHOG_KEY', ...`
   - index-enterprise.html: та же строка
6. Задеплоить снова: `firebase deploy --only hosting`

---

## ЗАВТРА: Добавить API на Cloud Run

После деплоя signfinder-api на Cloud Run добавить в firebase.json:
```json
{
  "source": "/api/**",
  "run": {
    "serviceId": "signfinder-api",
    "region": "europe-west1"
  }
}
```
Тогда sandbox будет обращаться к `/api/v1/analyze` — на том же домене, без CORS.

---

## URL-структура готово

| URL | Файл | Язык |
|-----|------|------|
| signfinder.web.app/ | index-cloud.html | авто (RU/EN) |
| signfinder.web.app/enterprise | index-enterprise.html | авто |
| signfinder.web.app/hero.html | hero.html | авто |

Когда появится домен (через 3 дня): добавить в Firebase Hosting → Custom domain.
Займёт 10 минут + DNS propagation (до 48ч, реально 1-2ч с Cloudflare).
