# Language Implementation

## Scope

DuroMoney supports five application languages:

- English (`en`)
- Spanish (`es`)
- French (`fr`)
- German (`de`)
- Italian (`it`)

The language setting controls the web interface, AI dashboard/chat output, daily email reports, SMS alerts, and cached translation behavior.

## Frontend

The frontend implementation lives in:

- `i18n.ts`
- `components/LanguageSelector.tsx`
- `components/Dashboard.tsx`
- `components/Profile.tsx`
- `components/SettingsModal.tsx`
- `components/AIConsole.tsx`
- `components/Charts.tsx`
- `components/Widgets.tsx`
- `components/TransactionList.tsx`

`i18n.ts` defines:

- `SUPPORTED_LANGUAGES`
- `LanguageCode`
- `detectDeviceLanguage()`
- `getTranslations()`
- local UI copy dictionaries

On first load, the app checks browser/device language via `navigator.languages`. If the language is supported, it becomes the initial recommendation. Otherwise, the app falls back to English.

The selected language is saved in local storage as `finai_language` for immediate UI continuity, and persisted in AWS through the user profile as `preferred_language`.

## Language Selector

The profile and onboarding modal use a single dropdown-style selector. It displays:

- the current language name
- a small styled flag-color mark
- a chevron to indicate the dropdown behavior

The selector intentionally avoids emoji flags. The visual markers are CSS color stripes based on each country's flag palette so they remain consistent with the app UI.

## Backend Profile Field

The backend persists language in DynamoDB on the user profile item:

```json
{
  "preferred_language": "es"
}
```

Supported values are validated against:

```python
{"en", "es", "fr", "de", "it"}
```

Invalid or missing values fall back to `en`.

Relevant backend files:

- `backend/lambda_function.py`
- `backend/scoring.py`

## AI Output

New AI responses are generated directly in the selected language. This applies to:

- dashboard AI console summary
- user questions in the AI console
- daily email AI analysis

The backend passes `language` into `invoke_nova_ai()`, which instructs Amazon Nova to write naturally in the selected language while preserving merchant names, exact amounts, dates, and currency codes.

Relevant file:

- `backend/ai_engine.py`

## Cached Translation For Language Switching

Changing the UI language must not regenerate a financial analysis.

When the user changes language, the frontend sends only the last visible AI console message to:

```http
POST ?action=translate_message
```

The backend translates that exact message once and caches it in `FinanceAgent-Cache` using:

```text
translation#{sha256(target_language + source_text)}
```

Cache TTL is 30 days.

Behavior:

- First translation of a specific message into a language calls Bedrock.
- Repeating the same translation returns `cache_hit: true`.
- Switching back and forth between languages does not regenerate analysis.
- The frontend also keeps an in-memory map of already translated messages during the session.

This keeps the cost bounded and prevents malicious repeated language toggles from causing repeated AI analysis calls.

## Daily Email Reports

Daily reports use `preferred_language` from the user's profile.

The AI analysis is generated directly in that language during the normal daily report cycle. Static email labels are localized in `backend/email_engine.py`.

Examples of localized labels:

- daily report heading
- expenses
- income and credits
- yesterday's activity
- open dashboard
- unsubscribe

## SMS Alerts

SMS alert copy uses `preferred_language` from the user profile. SMS messages do not call AI for translation; they use static localized templates and phrase lists in `backend/email_engine.py`.

## Cost Model

No cost:

- switching static UI language
- rendering translated UI labels
- selecting or saving language
- reopening an already cached translation

Small controlled cost:

- first translation of a specific AI console message into a specific language

Normal existing cost:

- a new dashboard analysis
- a new AI console question
- a scheduled daily report

Changing language never regenerates the financial analysis by itself.

## Deployment Notes

Backend deployment updates `FinanceAgent-Brain`.

Frontend deployment builds Vite output and syncs `dist/` to:

```text
s3://finagent-dashboard-eric-2026
```

CloudFront distribution:

```text
E4IMHFINBIN5N
```

Must be invalidated after frontend metadata or UI changes.
