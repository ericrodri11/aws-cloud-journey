# DuroMoney Design Redesign - 2026-05-23

## Scope

First full visual redesign pass for the DuroMoney platform, focused on the authenticated app shell, theme system, savings/dashboard layout, mobile behavior, and login screen.

## Brand System

- Primary accent: `#CCFF00`.
- Black theme base: `#171717`.
- Light theme base: warm off-white `#f4f5f0`.
- Logo assets moved into `public/`:
  - `duroyellow.svg` for black mode.
  - `duroblack.svg` for light mode.
- Typography changed to a stable product-style stack:
  - `Inter`, `Manrope`, Apple/System UI fallbacks.
  - No remote font loading, to avoid visual font swap/jump.

## Theme Preferences

- Added appearance modes:
  - `System`
  - `Light`
  - `Black`
- `System` follows `prefers-color-scheme`.
- User-selected appearance is saved in `localStorage`.
- Appearance is also sent to backend preferences as `appearance_preference`, so it can persist across app sessions/devices after deployment.

## App Shell

- Replaced top-only navigation with a desktop app shell:
  - Sticky left sidebar.
  - Center content area.
  - Right insight panel on desktop.
- Sidebar includes:
  - Centered Duro logo.
  - Panel.
  - Ahorro.
  - Insights placeholder.
  - Settings.
  - Sign Out.
- Removed the profile/agent-active block from the bottom of the sidebar.
- Mobile header keeps compact navigation and now exposes Settings/Profile.

## Dashboard Layout

- AI Agent remains the first widget.
- Balance moved to the desktop right panel.
- Financial Health moved under Balance in the right panel.
- Transactions moved back to the left column.
- Spending Overview sits in the main area.
- Month-End Projection sits below Spending Overview.
- Credit/recommendation cards remain in the main flow.

## Savings Layout

- Savings Analysis card received brand-color treatment.
- Rules badge and daily report advice block use `#CCFF00` accents.
- Contrast was adjusted for dark mode and light mode, especially around days-on-goal numbers and advice text.

## Interaction And Scrolling

- Body/root background now follows the active theme to avoid blue overscroll on bounce.
- `overscroll-behavior: none` added to reduce browser rubber-band background exposure.
- Changing app views scrolls the page to the top.
- Transactions scrolling:
  - Desktop keeps internal widget scroll.
  - Mobile avoids nested scroll trapping, so the page scroll remains natural.

## PIN Lock

- PIN modal now uses blurred dark backdrop consistently.
- PIN input is focused automatically when the modal opens.
- The invisible input sits over the PIN dots so tapping the dots opens the keyboard on mobile.
- Added a frontend PBKDF2 fallback for browsers where `crypto.subtle` is unavailable on local HTTP mobile testing.
- Added backend endpoint support for server-side PIN verification as an extra fallback after deployment.

## Login

- Login was adapted to the DuroMoney black/yellow brand style.
- Uses Duro logo.
- Uses glass-style inputs and yellow primary action.
- Removed testimonial/recommendation cards.
- No "Keep me signed in" checkbox was added because Cognito already manages persistent secure sessions; adding it would be misleading unless session policy changes.

## Verification

- `npm run build` passed.
- `python3 -m py_compile backend/lambda_function.py` passed.
