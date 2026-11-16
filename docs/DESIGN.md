# Wildcatter material and motion system

Revised to the user's Apple-inspired reference on 2026-11-11. The supplied image directs the pastel palette, soft rectangular geometry, tinted icon tiles and airy composition. This is a shared web interface in browser/PWA/Electron, not a claim to use Apple's native SwiftUI materials on Windows.

## Materials and typography

Pale pearl foundation, blue/lavender/pink light, dark ink, blue selected states and green/rose outcomes. The system font leads on Apple devices, with bundled Inter Variable on other platforms; no Apple font is redistributed. Mobile uses only the safe-area-aware bottom dock. Desktop uses a modal hamburger drawer with contained focus, Escape, backdrop dismissal and focus restoration. Content uses quieter translucent material for reading prices and rules.

Use real glass refraction for compact navigation/control surfaces, standard frosted material for text-heavy content. This follows [Apple's materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials.md). Text must remain readable over every backdrop. Focus, disabled, error, pending and selected states communicate meaning without relying on motion.

## Mobile hierarchy

Compact market rows prioritize the question and probability. Six results per page reduce scrolling; search and sorting apply to the entire market list. The featured question is a short preview. Detail views separate the forecast/trade form from resolution rules; ambiguous-evidence policy is disclosed on demand. New drafts, saved drafts, API reference and setup have focused routes. Keep the demo status visible, and keep internal roadmap/configuration copy out of forecasting flows. Inputs use readable text sizes and touch controls generally target 44px or more. Short viewports can scroll the full page above the dock.

## Reused glass implementation

Vendored `public/vendor/liquid-glass.js` from [deepika-builds/liquid-glass](https://github.com/deepika-builds/liquid-glass) at commit `98ed97bd99def529493fd37177228810f6422f6d`, MIT, Copyright 2026 Deepika Rao. The upstream source is unchanged and the license ships beside it. `useLiquidGlass` supplies only React mount/unmount lifecycle and bounded usage. SVG displacement, channel-separated refraction, map generation and resize handling remain upstream code.

Chromium gets SVG refraction; Safari/Firefox get the library's frosted fallback. Large panels use CSS frost to bound map costs. Reduced-transparency and forced-color preferences use opaque surfaces. The visual material is decorative and carries no trading information.

The mobile dock uses a clear gradient tint, reflective inset rim and translucent selected-tab pill. Its blur/refraction still comes from the pinned glass library; reduced-transparency mode keeps an opaque dock and selection. The dock follow-up passed navigation and live-preview accessibility checks in mobile Chromium and WebKit.

## Motion

Short page transitions, spring response on interactive cards, animated navigation selection and tactile press/focus states. Motion uses transform/opacity and springs from Motion. Respect OS reduced-motion preferences; avoid continuously moving backgrounds or delaying financial actions behind animations. [Apple motion guidance](https://developer.apple.com/design/human-interface-guidelines/motion.md) informs these choices.

## Verification

Run existing trading/API/browser checks after redesign. Inspect Chromium desktop/mobile and mobile WebKit screens, keyboard focus, narrow-screen overflow, glass filter creation/cleanup and reduced-motion behavior. Exercise Safari/Firefox fallback when engines are available. Hardware-specific smoothness and physical iPhone installation require device testing; no universal frame-rate claim.
