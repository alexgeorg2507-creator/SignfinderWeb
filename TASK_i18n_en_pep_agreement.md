# TASK: i18n-EN — `/en/pep-agreement`, реальный перевод, не заглушка

> В отличие от `terms`/`privacy`/`cookies` (`TASK_fix20.md`, в долге) —
> `pep-agreement.html` **уже живой**, на него линкует чекбокс согласия
> на `/sign/{token}`. Для EN-сделки контрагент сейчас видит RU-only
> текст под чекбоксом, на который его просят согласиться, — дыра в
> самом механизме получения согласия, не косметика. Текст ниже — писать
> 1-в-1, не пересказывать (правило то же, что в `TASK_fix20.md`).

## §1. Новый файл `pep-agreement-en.html`

Тот же `<style>` блок что в `pep-agreement.html` (RU) один в один, не
менять. Меняется только текст внутри `<body>`.

```
# SignFinder — Electronic Signature Agreement (Simple Electronic Signature)

⚠️ This is a draft version of this document, prepared by the service,
and it has not yet been reviewed by a lawyer. Do not treat the text
below as final legal advice — in the event of a dispute, applicable law
and the terms of the specific agreement between the parties will govern.

🌐 This English version is a direct translation of the Russian-language
original, which relies specifically on Russian Federal Law No. 63-FZ
"On Electronic Signatures" as its legal basis. If you are located
outside Russia, this legal basis may not be the correct one for your
jurisdiction — this question has not yet been resolved by the operator.
Please treat this document as informational only until it is updated.

## Consent text signed by the counterparty

I agree that the signature placed on this document constitutes a
simple electronic signature within the meaning of Article 5 of Federal
Law No. 63-FZ, and I acknowledge it as equivalent to a handwritten
signature on a paper document.

## What is a simple electronic signature (SES)

A simple electronic signature is one of the types of electronic
signature provided for by Federal Law No. 63-FZ "On Electronic
Signatures." Under Article 5 of this law, an SES confirms the fact that
an electronic signature was created by a specific person. The parties
to an agreement may agree to treat a document signed with an SES as
equivalent to a document signed by hand on paper — this is exactly the
consent recorded by the checkbox on the signing page.

## How the signature is created in SignFinder

The counterparty receives a temporary link to the document, reviews it,
provides a signature (photo, uploaded file, or hand-drawn), and
confirms agreement with the terms above. The service records in the
legal block of the final PDF: the initiator's email address, the date
and time each party signed, the IP address and browser/device
information for each party, and the method the counterparty used to
provide their signature — together, this forms the audit trail of the
signing.

## Document storage

Deal documents (the original, the version with the initiator's
signature, and the final signed version) are stored for 7 days from the
moment the deal is created, after which they are automatically deleted
from SignFinder's servers — regardless of whether the counterparty has
signed. During these 7 days, the link to the signed document remains
available for viewing and downloading. We recommend downloading the
final PDF to your own device immediately after signing rather than
relying on the link remaining available later.

## Questions

If you have questions about this document or the signing process,
contact us on Telegram @SignFinder (https://t.me/SingFinder) or at
alexgeorg2507@gmail.com.
```

Второй предупреждающий блок (🌐, про юрисдикцию) — своя карточка
(`.draft-notice` — переиспользовать этот же класс, не заводить новый
только ради второго блока), отдельно от первой ⚠️. Это ответ на то же
самое, что уже отложено для `terms`/`privacy`/`cookies` — юрисдикционное
основание для не-РФ контрагентов не решено (`TASK_i18n_en.md` §0,
`BACKLOG.md`). Отличие в том, что здесь мы **не можем просто не
публиковать** — документ обязателен для работы согласия на EN-сделках,
поэтому идёт с явным предупреждением вместо каркаса-заглушки.

## §2. Роутинг

`firebase.json`:
```json
{ "source": "/en/pep-agreement", "destination": "/pep-agreement-en.html" }
```
RU-версия (`/pep-agreement` → `pep-agreement.html`) не трогается.

## §3. Ссылки — по языку сделки/кабинета, не хардкод

Везде где сейчас `<a href="/pep-agreement">` — сделать условной:
- `sign/index.html` — по `deal.language` (уже есть в API-ответе с
  `TASK_i18n_en.md` §1/§4)
- `app/index.html` (футер кабинета) — по `users.language`/текущему
  выбранному языку интерфейса

## §4. DoD

- [ ] `/en/pep-agreement` открывается, текст английский, не 404
- [ ] EN-сделка на `/sign/{token}` — ссылка в чекбоксе ведёт на
  `/en/pep-agreement`, не на RU-версию
- [ ] Футер EN-кабинета — та же логика
- [ ] RU-поведение не изменилось (RU-сделки как были)
- [ ] Бампнуть `SignfinderLand/version.txt`
