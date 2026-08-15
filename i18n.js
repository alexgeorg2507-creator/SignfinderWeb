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

    // sign/index.html (TASK_i18n_en.md §4) — language comes from the deal
    // itself (GET /v1/public/deals/{token}.language), not the URL, so these
    // keys are read via direct t() calls in the render functions rather
    // than data-i18n attributes (the page has no static markup to decorate,
    // it's all built from template strings).
    sign_loading: "Загрузка…",
    sign_invalid_link: "Неверная ссылка.",
    sign_no_connection: "Нет связи с сервером. Обновите страницу.",
    sign_link_invalid_404: "Ссылка недействительна или сделка удалена.",
    sign_rate_limited: "Слишком много попыток. Попробуйте через минуту.",
    sign_load_failed: "Не удалось загрузить сделку.",
    sign_deal_from: "Договор от",
    sign_for_signature: "на подпись",
    sign_signed_badge: "✓ Договор подписан",
    sign_download_final: "Скачать финальный PDF",
    sign_pdf_loading: "Загрузка документа…",
    sign_footer_powered: "powered by SignFinder · Ссылка действует до",
    sign_pep_agreement_link: "Соглашение об ПЭП",
    sign_disclaimer: "ⓘ Подписывая ниже, вы ставите простую электронную подпись (ПЭП) — она юридически равнозначна собственноручной подписи на бумаге при согласии обеих сторон.",
    sign_consent_pep: "Я согласен, что моя подпись, поставленная в этом документе, является простой электронной подписью в понимании ст. 5 ФЗ-63, и признаю её равнозначной собственноручной подписи на бумажном документе.",
    sign_your_signature: "Ваша подпись",
    sign_tab_camera: "📷 Фото",
    sign_tab_file: "📁 Файл",
    sign_tab_canvas: "✏️ Нарисовать",
    sign_take_photo: "📷 Сделать фото подписи",
    sign_camera_hint: "Подпись на белом листе, хорошее освещение.",
    sign_choose_file: "📁 Выбрать файл",
    sign_file_hint: "PNG или JPG с уже отсканированной подписью.",
    sign_canvas_hint: "Нарисуйте подпись пальцем или мышью.",
    sign_clear: "Очистить",
    sign_done: "Готово",
    sign_processing: "⏳ Обработка…",
    sign_original: "Оригинал",
    sign_processed: "После обработки",
    sign_quality: "Качество",
    sign_processing_success: "✓ Обработка успешна",
    sign_btn_sign: "Подписать",
    sign_btn_signing: "Подписание…",
    sign_err_draw_first: "Сначала нарисуйте подпись",
    sign_err_connection: "Ошибка соединения",
    sign_err_process_failed: "Не удалось обработать подпись",
    sign_err_already_signed: "Эта сделка уже подписана. Обновите страницу.",
    sign_err_sign_failed: "Не удалось подписать",
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

    sign_loading: "Loading…",
    sign_invalid_link: "Invalid link.",
    sign_no_connection: "No connection to the server. Refresh the page.",
    sign_link_invalid_404: "This link is invalid or the deal was deleted.",
    sign_rate_limited: "Too many attempts. Try again in a minute.",
    sign_load_failed: "Failed to load the deal.",
    sign_deal_from: "Contract from",
    sign_for_signature: "for signature",
    sign_signed_badge: "✓ Contract signed",
    sign_download_final: "Download final PDF",
    sign_pdf_loading: "Loading document…",
    sign_footer_powered: "powered by SignFinder · Link valid until",
    sign_pep_agreement_link: "PEP Agreement",
    sign_disclaimer: "ⓘ By signing below, you are applying a simple electronic signature (PEP) — under Russian law (63-FZ), it is legally equivalent to a handwritten signature on paper when both parties agree.",
    sign_consent_pep: "I agree that the signature I place on this document is a simple electronic signature under Article 5 of Russian Federal Law 63-FZ, and I recognize it as equivalent to a handwritten signature on paper.",
    sign_your_signature: "Your signature",
    sign_tab_camera: "📷 Photo",
    sign_tab_file: "📁 File",
    sign_tab_canvas: "✏️ Draw",
    sign_take_photo: "📷 Take a photo of your signature",
    sign_camera_hint: "Sign on plain white paper, good lighting.",
    sign_choose_file: "📁 Choose a file",
    sign_file_hint: "A PNG or JPG of your already-scanned signature.",
    sign_canvas_hint: "Draw your signature with your finger or mouse.",
    sign_clear: "Clear",
    sign_done: "Done",
    sign_processing: "⏳ Processing…",
    sign_original: "Original",
    sign_processed: "Processed",
    sign_quality: "Quality",
    sign_processing_success: "✓ Processed successfully",
    sign_btn_sign: "Sign",
    sign_btn_signing: "Signing…",
    sign_err_draw_first: "Draw your signature first",
    sign_err_connection: "Connection error",
    sign_err_process_failed: "Failed to process the signature",
    sign_err_already_signed: "This deal has already been signed. Refresh the page.",
    sign_err_sign_failed: "Failed to sign",
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
