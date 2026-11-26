# Google Play release guide

What the app already does to meet the [Developer Programme Policies](https://play.google.com/about/developer-content-policy.html), and what to enter in each Play Console section. Checked against the build on 2026-11-26.

## What the app does for policy

| Policy area                | How Peakcast meets it                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Real-money gambling        | None. Practice credits only: no purchases, no cash-out, no prizes. The Terms and Help pages say so and promise no future real money.                                                                   |
| Simulated gambling         | Trading yes/no questions with virtual credits counts. The app is 18+ only (onboarding requires an 18+ confirmation), and the content rating answers below declare it.                                  |
| User data                  | Nothing leaves the phone: no server, analytics, ads or crash reporting, and no `INTERNET` permission in `android/AndroidManifest.xml`. Source links open in the browser only when tapped.              |
| Permissions                | None. Haptics use the system haptic engine, which needs no permission.                                                                                                                                 |
| Privacy policy             | In the app (Settings → About this app → Privacy Policy) and on the web at `/privacy`. It states that nothing is collected.                                                                             |
| Account deletion           | Settings → Account → Delete account in the app, and `/delete-account`, which explains that data exists only on the device and how uninstalling erases it.                                              |
| Deceptive behaviour        | The sample players are labelled on the leaderboard as sample players, not real people.                                                                                                                 |
| User-generated content     | Comments and markets stay on the device; nobody else sees them, so there is no shared UGC to moderate.                                                                                                 |
| Target API level           | `targetSdkVersion` 36 (Play requires 35 or higher for new apps); `minSdkVersion` 24.                                                                                                                   |
| 16 KB page size            | No native libraries, so nothing to align.                                                                                                                                                              |
| App format                 | Android App Bundle, built and validated by `scripts/build-android.ps1 -Bundle`.                                                                                                                        |
| Export compliance (US EAR) | The app implements no encryption. It hashes its local sign-in token with SHA-256, which is not encryption, and makes no network connections. It qualifies for the exemption; tick the acknowledgement. |
| Developer contact          | `girdharvinit786@gmail.com`, shown in the Terms, Privacy Policy and account-deletion pages. Use the same address in the Play Console.                                                                  |

## Before you upload

1. **Deploy the web app** so the privacy policy URL works: push to `main`, let Render build the static site, then open `https://wildcatter-welcome.onrender.com/privacy` in a private window.
2. **Create your upload key** once. Keep the file and its passwords in a password manager, never in the repository.
   ```powershell
   & "C:\Program Files\Java\jdk-17\bin\keytool.exe" -genkeypair -keystore "$HOME\peakcast-upload.jks" -alias peakcast-upload -keyalg RSA -keysize 2048 -validity 10000
   ```
3. **Build the bundle** with that key. Set the variables in the same PowerShell window; the script reads the passwords from them:
   ```powershell
   $env:PEAKCAST_KEYSTORE = "$HOME\peakcast-upload.jks"; $env:PEAKCAST_KEY_ALIAS = "peakcast-upload"
   ```
   ```powershell
   $env:PEAKCAST_STORE_PASS = Read-Host "Keystore password"; $env:PEAKCAST_KEY_PASS = Read-Host "Key password"
   ```
   ```powershell
   npm run build; powershell -File scripts/build-android.ps1 -Bundle
   ```
   Upload `release/downloads/Peakcast-Android.aab`. Keep Play App Signing on (the default): Google holds the app signing key and you upload with yours.
4. **Bump the version** for every later upload: `android:versionCode` (must increase) and `android:versionName` in `android/AndroidManifest.xml`, and `version` in `package.json`, which Settings shows.
5. **New personal developer accounts** must run a closed test with at least 12 testers for 14 continuous days before applying for production access.

## Play Console answers

| Section                         | Answer                                                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Privacy policy                  | `https://wildcatter-welcome.onrender.com/privacy`                                                                                                                                 |
| App access                      | All functionality is available without special access                                                                                                                             |
| Ads                             | No, the app does not contain ads                                                                                                                                                  |
| Content rating (IARC)           | Not a game. Simulated gambling: **Yes**. No violence, sexual content, drugs or profanity; no interaction between users, no location sharing, no purchases.                        |
| Target audience                 | 18 and over only; not designed for children                                                                                                                                       |
| News, health, government, COVID | No                                                                                                                                                                                |
| Financial features              | My app doesn't provide any financial features                                                                                                                                     |
| Data safety                     | Collects or shares required user data: **No**. Display name, trades and drafts are processed only on the device and never transmitted, which Google does not count as collection. |
| Data safety: accounts           | The app has no sign-in account. If a deletion URL is requested anyway: `https://wildcatter-welcome.onrender.com/delete-account`                                                   |
| US export laws                  | Tick the acknowledgement (see the table above)                                                                                                                                    |

## Store listing

- **App name:** Peakcast
- **Short description** (80 characters max): `Practice forecasting with demo credits. No money, no sign-up, works offline.`
- **Full description:**

  > Peakcast is a practice app for forecasting. Every market is a yes-or-no question about something that hasn't happened yet. Buy YES or NO with demo credits and watch the price move.
  >
  > • Start with 5,000 practice credits and a daily bonus
  > • Read clear rules for how each question resolves
  > • Write your own questions; a built-in rule checker flags vague wording
  > • Track your portfolio, accuracy and place on the leaderboards
  > • Private by design: no account, no ads, no tracking. Everything stays on your phone and works offline
  >
  > Practice credits have no cash value. They cannot be bought, sold, withdrawn or exchanged for money or prizes. For people aged 18 and over.

- **App icon:** `docs/brand/play-store-icon-512.png` (512×512, no transparency)
- **Feature graphic:** `docs/brand/play-feature-graphic-1024x500.png`
- **Phone screenshots:** `docs/brand/play-screenshots/` (1080×1920), made by `node scripts/make-store-screenshots.mjs`
- **Category:** Education. Avoid Finance, which brings extra financial-services review.

Avoid these words in the listing: bet, wager, win money, earn, payout, cash, guaranteed profit, and other companies' names. Store text that suggests real money can lead to a gambling-policy rejection.
