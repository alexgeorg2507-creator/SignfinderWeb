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

    // app/index.html — Профиль tab (TASK_i18n_en.md §3, dynamic content).
    // Static markup (TABS.profile) uses data-i18n, decorated by applyI18n()
    // right after showTab() injects it; JS-rendered pieces (signature
    // status/messages) call t() directly, same as sign/index.html.
    profile_sub: "Ваши данные, по которым я ищу место подписи",
    profile_name_placeholder: "ФИО подписанта для поиска подписи",
    profile_company_placeholder: "Именование компании в договоре (для юрлиц)",
    profile_autosave_hint: "Данные сохраняются автоматически",
    profile_sig_title: "Подпись",
    profile_sig_sub: "Будет проставляться на договоры автоматически",
    profile_sig_upload_label: "📷 Загрузить или сфотографировать",
    profile_sig_upload_hint_1: "На телефоне открывает камеру. На десктопе — выбор файла.",
    profile_sig_processed_transparent: "После обработки (прозрачный фон)",
    profile_sig_save_btn: "Сохранить подпись",
    profile_sig_saving: "Сохранение...",
    profile_sig_loading: "⏳ Загружаем подпись...",
    profile_sig_no_connection: "⚠️ Нет связи с сервером",
    profile_sig_current_label: "Текущая подпись",
    profile_sig_uploaded_badge: "✓ Подпись загружена",
    profile_sig_not_uploaded: "Подпись ещё не загружена",
    profile_sig_load_failed: "⚠️ Не удалось загрузить текущую подпись",
    profile_sig_process_err: "Ошибка обработки",
    profile_sig_saved: "Подпись сохранена",
    err_save_failed: "Ошибка сохранения",

    // app/index.html — Мои сделки tab (TASK_i18n_en.md §3, dynamic content).
    // Entirely JS-rendered (renderDealsList/_renderDealDetail build the DOM
    // from template strings), so all keys here are read via direct t()
    // calls, same pattern as sign/index.html.
    deals_sub: "Статус переданных на подпись договоров",
    deals_load_failed: "Не удалось загрузить сделки",
    deals_hide_failed: "Не удалось скрыть сделку",
    deals_empty: "Сделок пока нет — подпишите договор во вкладке «Подписать договор», появится кнопка передачи контрагенту.",
    deals_hide_title: "Скрыть из списка",
    deals_default_filename: "Договор",
    deals_detail_load_failed: "Не удалось загрузить детали",
    deals_history_title: "История",
    deals_no_events: "Событий пока нет.",
    deals_copy_link_again: "📋 Скопировать ссылку ещё раз",
    deals_link_copied: "✓ Ссылка скопирована",
    deal_status_draft: "Черновик",
    deal_status_sent: "Отправлено",
    deal_status_viewed: "Контрагент открыл",
    deal_status_signed: "Подписано",
    deal_status_expired: "Истекло",
    deal_status_rejected: "Отклонено",
    audit_created: "Сделка создана",
    audit_sent: "Ссылка передана контрагенту",
    audit_viewed: "Контрагент открыл ссылку",
    audit_signed: "Контрагент подписал",
    deal_expired_label: "истекла",
    deal_expires_in: "истекает через",
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

    profile_sub: "Your info — used to find where to sign",
    profile_name_placeholder: "Signer's full name (used to find the signature spot)",
    profile_company_placeholder: "Company name as it appears in contracts (for legal entities)",
    profile_autosave_hint: "Changes save automatically",
    profile_sig_title: "Signature",
    profile_sig_sub: "Will be applied to contracts automatically",
    profile_sig_upload_label: "📷 Upload or take a photo",
    profile_sig_upload_hint_1: "Opens the camera on a phone. Opens a file picker on desktop.",
    profile_sig_processed_transparent: "After processing (transparent background)",
    profile_sig_save_btn: "Save signature",
    profile_sig_saving: "Saving...",
    profile_sig_loading: "⏳ Loading signature...",
    profile_sig_no_connection: "⚠️ No connection to the server",
    profile_sig_current_label: "Current signature",
    profile_sig_uploaded_badge: "✓ Signature uploaded",
    profile_sig_not_uploaded: "No signature uploaded yet",
    profile_sig_load_failed: "⚠️ Failed to load the current signature",
    profile_sig_process_err: "Processing error",
    profile_sig_saved: "Signature saved",
    err_save_failed: "Save failed",

    deals_sub: "Status of contracts sent out for signature",
    deals_load_failed: "Failed to load deals",
    deals_hide_failed: "Failed to hide the deal",
    deals_empty: "No deals yet — sign a contract in the “Sign a contract” tab and a button to send it to the counterparty will appear.",
    deals_hide_title: "Hide from list",
    deals_default_filename: "Contract",
    deals_detail_load_failed: "Failed to load details",
    deals_history_title: "History",
    deals_no_events: "No events yet.",
    deals_copy_link_again: "📋 Copy link again",
    deals_link_copied: "✓ Link copied",
    deal_status_draft: "Draft",
    deal_status_sent: "Sent",
    deal_status_viewed: "Counterparty opened it",
    deal_status_signed: "Signed",
    deal_status_expired: "Expired",
    deal_status_rejected: "Rejected",
    audit_created: "Deal created",
    audit_sent: "Link sent to counterparty",
    audit_viewed: "Counterparty opened the link",
    audit_signed: "Counterparty signed",
    deal_expired_label: "expired",
    deal_expires_in: "expires in",
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
