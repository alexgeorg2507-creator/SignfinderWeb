// TASK_i18n_en.md §0 — shared between app/index.html and sign/index.html.
// One dictionary, not duplicated files per language: app/index.html is
// ~2400 lines and gets edited every 2-3 days (fix15-22 history) - keeping
// two copies in sync by hand would fall apart within weeks.
//
// Loaded as a classic (non-module) <script src="/i18n.js">, deliberately
// not wrapped in an IIFE: STRINGS/currentLang/t/applyI18n need to be
// visible to the page's own separate <script> tags (toggle handler,
// initial-load language detection) - classic scripts on the same page
// share one global scope, so top-level declarations here are just as
// reachable from those as if they'd been written inline.

const STRINGS = {
  ru: {
    // auth screen
    auth_sub: "Подпись договоров за минуту",
    btn_google: "Войти через Google",
    divider_or_email: "или через email",
    inp_pass_placeholder: "Пароль",
    btn_signin: "Войти",
    link_no_account: "Нет аккаунта? Зарегистрироваться",
    inp_reg_pass_placeholder: "Пароль (минимум 8 символов)",
    btn_register: "Создать аккаунт",
    link_have_account: "Уже есть аккаунт? Войти",

    // verify-email screen
    verify_title: "Подтвердите email",
    verify_text_1: "Мы отправили письмо на ",
    verify_text_2: ".",
    verify_text_3: "Перейдите по ссылке в письме, затем вернитесь сюда.",
    verify_btn_confirmed: "Я подтвердил",
    verify_btn_resend: "Отправить письмо повторно",

    // shared
    signout: "Выйти",
    menu: "Меню",

    // nav / topbar
    nav_profile: "Профиль",
    nav_work: "Подписать договор",
    nav_deals: "Мои сделки",
    nav_feedback: "Что улучшить?",
  },
  en: {
    auth_sub: "Sign contracts in a minute",
    btn_google: "Sign in with Google",
    divider_or_email: "or with email",
    inp_pass_placeholder: "Password",
    btn_signin: "Sign in",
    link_no_account: "No account? Sign up",
    inp_reg_pass_placeholder: "Password (min. 8 characters)",
    btn_register: "Create account",
    link_have_account: "Already have an account? Sign in",

    verify_title: "Confirm your email",
    verify_text_1: "We sent a confirmation link to ",
    verify_text_2: ".",
    verify_text_3: "Follow the link in the email, then come back here.",
    verify_btn_confirmed: "I've confirmed",
    verify_btn_resend: "Resend email",

    signout: "Log out",
    menu: "Menu",

    nav_profile: "Profile",
    nav_work: "Sign a contract",
    nav_deals: "My deals",
    nav_feedback: "What to improve?",
  },
};

let currentLang = 'ru';

function t(key) {
  return (STRINGS[currentLang] && STRINGS[currentLang][key]) || STRINGS.ru[key] || key;
}

function applyI18n(root) {
  root = root || document;
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-aria-label]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel)); });
}

// TASK_i18n_en.md §1: which language a brand-new user's account gets is
// decided once, by which URL prefix they first loaded from (/en/app vs
// /app) - not by browser locale or anything else guessable later.
function detectLangFromPath() {
  return location.pathname.startsWith('/en/') ? 'en' : 'ru';
}
