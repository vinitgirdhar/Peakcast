# Wildcatter interface

Revised on November 16, 2026 around the supplied monochrome financial-workspace reference. The shared React interface serves the web, installable PWA, Windows Electron app, and Android WebView. White surfaces, slim navigation, generous spacing, black selected states and restrained outcome colors carry through every screen.

## Visual system

`src/styles.css` contains component structure and responsive behavior. `src/design.css` defines shared visual tokens and presentation. Canvas `#f7f8fa`, white surfaces, ink `#202124`, secondary text `#64676d`, and borders `#e7e8eb` establish the light appearance. Dark mode uses a black canvas and neutral elevated surfaces. Green and rose retain their meaning for YES, NO, gains and losses.

Typography uses the system font on Apple devices and locally bundled Inter Variable elsewhere. No external font request or redistributed Apple font is required. Headings use close spacing and moderate weights; prices use tabular numerals. Content panels have 14–16px corners; controls use smaller 8–10px corners. Shadows are limited to gentle elevation and floating menus.

Opaque surfaces replace the previous SVG refraction effects. The third-party glass runtime is no longer loaded. Readable prices and lower rendering overhead take priority over decorative material effects.

## Navigation and responsive layout

- Wide desktop screens (1100px and above) show a persistent sidebar with the current destination selected.
- Intermediate screens use a modal drawer with focus containment, Escape dismissal and focus restoration.
- Mobile and touch tablets up to 1024px use a safe-area-aware bottom tab bar with all six destinations. Short landscape viewports can scroll above it.
- Markets include a compact charcoal feature with live demo activity totals and an upcoming-deadlines list on larger screens. Totals come from actual market data; closed or expired markets are excluded from upcoming deadlines. The available balance stays in the header. Search and filtering cover the full list, with six results per page. Mobile cards retain outcome prices and deadlines.
- Forecasts, rules, portfolios, leaderboards, studio, saved drafts, developer tools and settings share the same surfaces and controls. An unfinished trade survives switching between forecast and rules.
- The landing hero offers web entry, Windows desktop download and Android download together. The page introduces the product through a clearly labeled illustrative workspace. Its example chart and probabilities are presentation content, not live market data.
- Scrollbars are visually hidden across browser, PWA and native app content, while wheel, touch, keyboard and programmatic scrolling remain enabled.

## Motion and accessibility

Motion is part of the shared interface: staggered landing copy, viewport reveals, an introductory chart trace, sliding sidebar and tab selections, market-card entrances, probability-bar fills, chart updates, animated values, notification badges and inbox rows, expandable panels, dropdown entrances, provider-editor reveals, and button and icon feedback. Timing stays between 180–450ms for interactions; the illustrative chart takes 1.2 seconds. Only loading indicators repeat. Avoid ambient animation and refraction. Motion's user preference support and CSS reduced-motion rules suppress nonessential movement; reduced-motion users see landing sections immediately. Keep keyboard focus visible, selected states explicit, error messages actionable, and form controls readable. Forced-color users receive explicit selected-control borders.

## Server warm-up

The official demo starts at `https://wildcatter-welcome.onrender.com`, a separate Render static site that does not depend on the sleeping API process. It displays the branded halo and indeterminate progress animation, checks a fresh application image, and opens the existing app when the image decodes. A platform HTML loading page cannot pass that check and is never embedded in the entry screen. The backend address itself is still subject to Render's initial loading page, so share the official entry URL.

After three seconds the screen explains: “The server is warming up. (Please allow a minute or two.)” Checks stop after three minutes and offer a retry. Offline failures have a separate message. Reduced-motion users see a static indicator. No arbitrary progress percentages, background cron or permanent keep-alive traffic are used.

The React app also gates startup on a read-only readiness check. Slow background refreshes retain the current screen and show a compact warm-up notice. If the free service has lost an ephemeral demo account, startup creates a fresh session with a visible notice. Startup retry does not reload the document or automatically replay trades. The Android production entry uses the same static screen; custom backend builds retain direct entry.

## Verification

`npm run review:ui` captures every app route and the landing page at desktop and mobile widths in light and dark mode, checking WCAG A/AA rules, console errors and horizontal overflow. Browser journeys exercise search, trading, drafts, resolution, themes, mobile navigation and the tablet drawer. `npm run test:desktop` checks the packaged Windows app and session persistence. Screenshots and browser emulation do not establish physical Android or iPhone behavior; installed-device checks remain separate.

## Native distribution

The Windows package bundles the current compiled frontend and local API. Rebuild it after frontend changes. The Android app displays its configured HTTPS origin, so frontend changes appear when that origin is updated. Build with `powershell -File scripts/build-android.ps1`; pass `-Origin https://your-host.example` to use another host. The default is the documented hosted demo, rather than an expiring preview tunnel. Rebuilding an APK alone does not publish the frontend to that host.
