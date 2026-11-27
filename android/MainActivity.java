package com.bay2peak.peakcast;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.content.res.Resources;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.LayerDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.animation.DecelerateInterpolator;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.window.OnBackInvokedDispatcher;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * Peakcast runs entirely on the phone: the web app ships inside the APK (assets/app)
 * and is served from a reserved local origin, so nothing is fetched from a server.
 *
 * Launch: the launch screen (system splash on Android 12+, the same mark laid over the
 * page below that) stays until the page has painted its first content and the mark's
 * animation has finished, then fades into the web boot logo, which sits at the same
 * size and place. Nothing between the icon tap and the first page is a bare white or
 * black frame.
 */
public class MainActivity extends Activity {
 /** Android's reserved host for app-bundled content; requests to it never leave the device. */
 private static final String ORIGIN = "https://appassets.androidplatform.net";
 private static final int SAVE_FILE = 1;
 /** res/values/colors.xml and res/values-night/colors.xml app_background. */
 private static final int LIGHT = 0xFFF7F8FA;
 private static final int DARK = 0xFF000000;
 /** windowSplashScreenAnimationDuration in res/values-v31/themes.xml. */
 private static final long ICON_ANIMATION_MS = 950;
 /** If the page never reports a paint (a script error), the launch screen still goes this long after it was handed over. */
 private static final long SPLASH_TIMEOUT_MS = 6000;
 private static final long SPLASH_FADE_MS = 220;
 /**
  * Injected once the document has loaded: waits until the page has put something on
  * screen (the boot logo or the app), then lets two frames paint and reports back.
  * The web app may call PeakcastAndroid.ready() itself; the first report wins.
  */
 private static final String PAINT_WATCH = "(function(){var b=window.PeakcastAndroid;if(!b||!document.body)return;"
  + "function painted(){var r=document.getElementById('root');return (r&&r.childElementCount>0)||document.body.childElementCount>1}"
  + "function go(){requestAnimationFrame(function(){requestAnimationFrame(function(){b.ready()})})}"
  + "if(painted())return go();var o=new MutationObserver(function(){if(painted()){o.disconnect();go()}});"
  + "o.observe(document.body,{childList:true,subtree:true})})()";
 private static final Map<String, String> TYPES = new HashMap<>();
 static {
  TYPES.put("html", "text/html");
  TYPES.put("js", "text/javascript");
  TYPES.put("css", "text/css");
  TYPES.put("wasm", "application/wasm");
  TYPES.put("json", "application/json");
  TYPES.put("webmanifest", "application/manifest+json");
  TYPES.put("svg", "image/svg+xml");
  TYPES.put("png", "image/png");
  TYPES.put("ico", "image/x-icon");
  TYPES.put("woff2", "font/woff2");
  TYPES.put("mp4", "video/mp4");
  TYPES.put("webm", "video/webm");
  TYPES.put("jpg", "image/jpeg");
  TYPES.put("webp", "image/webp");
 }
 private final Handler main = new Handler(Looper.getMainLooper());
 private SharedPreferences prefs;
 private FrameLayout root;
 private WebView web;
 private String pendingFile;
 /** The launch screen still on top of the page (see holdLaunchScreen). */
 private View cover;
 /** Android 12+: the system splash once handed over, and its animated icon, which is its own surface and does not fade with it. */
 private View splash;
 private View splashIcon;
 private Runnable removeSplash;
 private final Runnable timeout = this::onPainted;
 private boolean painted;
 /** When the launch mark's animation started (wall clock), for the web boot logo to continue it. */
 private volatile long iconStart = System.currentTimeMillis() - (SystemClock.uptimeMillis() - Process.getStartUptimeMillis());
 private long iconDuration = ICON_ANIMATION_MS;

 private boolean night() {
  return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
 }

 /** The theme chosen in the app when it differs from the phone's, else the phone's. */
 private boolean dark() {
  return prefs.contains("dark") ? prefs.getBoolean("dark", false) : night();
 }

 @Override
 public void onCreate(Bundle state) {
  super.onCreate(state);
  prefs = getSharedPreferences("peakcast", MODE_PRIVATE);
  root = new FrameLayout(this);
  web = new WebView(this);
  web.setVerticalScrollBarEnabled(false);
  web.setHorizontalScrollBarEnabled(false);
  root.addView(web);
  setContentView(root);
  edgeToEdge();
  applyTheme(dark());
  syncLaunchTheme();
  holdLaunchScreen();
  configureWebView();
  // Android 13+: back goes through goBack() too. ponytail: the system's own root back
  // (with its back-to-home preview) finishes the activity on Android 16, so reopening
  // would reload the page; keeping the app running is worth more than the preview.
  if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
  // After Android ends the app in the background, reopen the page the user was
  // on. WebView.restoreState() would leave a blank black screen with bundled pages.
  String last = state == null ? null : state.getString("url");
  web.loadUrl(last != null && last.startsWith(ORIGIN + "/") ? last : ORIGIN + "/markets");
 }

 /** Draws behind the system bars and keyboard and pads the page clear of them (Android 11+). */
 @SuppressWarnings("deprecation")
 private void edgeToEdge() {
  if (Build.VERSION.SDK_INT < 30) return; // older versions resize the window (adjustResize)
  Window window = getWindow();
  window.setDecorFitsSystemWindows(false);
  window.setStatusBarColor(Color.TRANSPARENT);
  window.setNavigationBarColor(Color.TRANSPARENT);
  // The page colour shows through the bars; no grey scrim behind three-button navigation.
  window.setNavigationBarContrastEnforced(false);
  window.setStatusBarContrastEnforced(false);
  root.setOnApplyWindowInsetsListener((view, insets) -> {
   Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
   view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
   return WindowInsets.CONSUMED;
  });
 }

 /** Window, page and system bar colours for a light or dark page. */
 @SuppressWarnings("deprecation")
 private void applyTheme(boolean dark) {
  int background = dark ? DARK : LIGHT;
  Window window = getWindow();
  window.setBackgroundDrawable(new ColorDrawable(background));
  root.setBackgroundColor(background);
  if (web != null) web.setBackgroundColor(background);
  if (Build.VERSION.SDK_INT >= 30) {
   WindowInsetsController bars = window.getInsetsController();
   int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
   if (bars != null) bars.setSystemBarsAppearance(dark ? 0 : light, light);
   return;
  }
  View decor = window.getDecorView();
  int flags = decor.getSystemUiVisibility() & ~(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
  if (!dark) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | (Build.VERSION.SDK_INT >= 26 ? View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : 0);
  decor.setSystemUiVisibility(flags);
  window.setStatusBarColor(background);
  // Android 7.x cannot draw dark navigation buttons: keep that bar black.
  window.setNavigationBarColor(dark || Build.VERSION.SDK_INT >= 26 ? background : Color.BLACK);
 }

 /**
  * Android 13+: the system draws the next launch screen in the theme chosen in the app,
  * or the phone's. Set on every start too: the system keeps it even after app data is cleared.
  */
 private void syncLaunchTheme() {
  if (Build.VERSION.SDK_INT < 33) return;
  String style = !prefs.contains("dark") ? null : prefs.getBoolean("dark", false) ? "Theme.Peakcast.Splash.Dark" : "Theme.Peakcast.Splash.Light";
  getSplashScreen().setSplashScreenTheme(style == null ? Resources.ID_NULL : getResources().getIdentifier(style, "style", getPackageName()));
 }

 /**
  * Keeps the launch screen over the page until it has painted (see PAINT_WATCH). A cover in
  * the app's own window draws the finished mark exactly where the launch screen has it.
  * Below Android 12 it is the launch screen. On 12+ it sits under the system splash, whose
  * animated icon can go missing for a few frames while it is handed to the app.
  */
 private void holdLaunchScreen() {
  Drawable mark = getDrawable(getResources().getIdentifier("launch_mark", "drawable", getPackageName()));
  int size = Math.round(288 * getResources().getDisplayMetrics().density); // the system splash icon size
  // The colour the launch screen was drawn in: before Android 13 it always follows the phone.
  boolean launchDark = Build.VERSION.SDK_INT >= 33 ? dark() : night();
  LayerDrawable launch = new LayerDrawable(new Drawable[] { new ColorDrawable(launchDark ? DARK : LIGHT), mark });
  launch.setLayerGravity(1, Gravity.CENTER);
  launch.setLayerSize(1, size, size);
  cover = new View(this);
  cover.setBackground(launch);
  ((ViewGroup) getWindow().getDecorView()).addView(cover, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
  // Below Android 12 the mark is still: it counts as having finished its animation.
  if (Build.VERSION.SDK_INT < 31) iconStart = System.currentTimeMillis() - ICON_ANIMATION_MS;
  else getSplashScreen().setOnExitAnimationListener(view -> {
   if (view.getIconAnimationStart() != null && view.getIconAnimationDuration() != null) {
    iconStart = view.getIconAnimationStart().toEpochMilli();
    iconDuration = view.getIconAnimationDuration().toMillis();
   }
   splash = view;
   splashIcon = view.getIconView();
   removeSplash = view::remove;
   // A slow first frame should not use up the page's time to paint.
   if (!painted) {
    main.removeCallbacks(timeout);
    main.postDelayed(timeout, SPLASH_TIMEOUT_MS);
   }
   hideLaunchScreenWhenReady();
  });
  main.postDelayed(timeout, SPLASH_TIMEOUT_MS);
 }

 private void onPainted() {
  painted = true;
  hideLaunchScreenWhenReady();
 }

 /** Once the page has painted, lets the mark finish its animation, then fades the launch screen out. */
 private void hideLaunchScreenWhenReady() {
  if (!painted || (cover == null && splash == null)) return;
  View[] views = { cover, splash, splashIcon };
  Runnable removeSystemSplash = removeSplash;
  cover = splash = splashIcon = null;
  removeSplash = null;
  long wait = Math.max(0, iconStart + iconDuration - System.currentTimeMillis());
  main.postDelayed(() -> {
   for (View view : views) {
    if (view != null) view.animate().alpha(0f).setDuration(SPLASH_FADE_MS).setInterpolator(new DecelerateInterpolator());
   }
   main.postDelayed(() -> {
    if (views[0] != null) ((ViewGroup) getWindow().getDecorView()).removeView(views[0]);
    if (removeSystemSplash != null) removeSystemSplash.run();
    applyTheme(dark()); // the system splash may leave its own bar colours behind
   }, SPLASH_FADE_MS);
  }, wait);
 }

 private void configureWebView() {
  WebSettings settings = web.getSettings();
  settings.setJavaScriptEnabled(true);
  // IndexedDB and localStorage hold the user's on-device data.
  settings.setDomStorageEnabled(true);
  settings.setAllowFileAccess(false);
  settings.setAllowContentAccess(false);
  settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  // Rasterises just beyond the viewport so fast scrolls and the first frame after
  // returning to the app do not show unpainted tiles.
  settings.setOffscreenPreRaster(true);
  // The layout is sized for the phone already; the system font scale still
  // applies for accessibility, but is capped so large defaults do not blow it up.
  float scale = getResources().getConfiguration().fontScale;
  settings.setTextZoom(Math.round(Math.max(85f, Math.min(scale * 100f, 115f))));
  // ponytail: text zoom is left at WebView's default, which follows the phone's font size (accessibility).
  web.addJavascriptInterface(new Bridge(), "PeakcastAndroid");
  web.setWebViewClient(new WebViewClient() {
   @Override
   public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
    Uri uri = request.getUrl();
    if (!ORIGIN.equals(uri.getScheme() + "://" + uri.getAuthority())) return null;
    return asset(uri.getPath());
   }

   @Override
   public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
    Uri uri = request.getUrl();
    if ("mailto".equals(uri.getScheme())) {
     if (request.hasGesture()) open(new Intent(Intent.ACTION_SENDTO, uri));
     return true;
    }
    if (ORIGIN.equals(uri.getScheme() + "://" + uri.getAuthority())) return false;
    // Market sources and evidence open in the phone's browser, only when tapped.
    if ("https".equals(uri.getScheme()) && request.hasGesture()) open(new Intent(Intent.ACTION_VIEW, uri));
    return true;
   }

   @Override
   public void onPageFinished(WebView view, String url) {
    if (!painted) view.evaluateJavascript(PAINT_WATCH, null);
   }

   @Override
   public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
    // The page's renderer crashed or was reclaimed: start again on the same page
    // instead of letting the whole app crash.
    recreate();
    return true;
   }
  });
 }

 /** A bundled file, or the app shell for client-side routes such as /markets/fed-rate. */
 private WebResourceResponse asset(String path) {
  String file = path == null || path.equals("/") ? "index.html" : path.substring(1);
  if (file.contains("..")) return notFound();
  int dot = file.lastIndexOf('.');
  boolean route = dot < file.lastIndexOf('/') + 1;
  if (route) file = "index.html";
  String type = TYPES.get(dot < 0 || route ? "html" : file.substring(dot + 1));
  try {
   InputStream body = getAssets().open("app/" + file);
   WebResourceResponse response = new WebResourceResponse(type == null ? "application/octet-stream" : type, "utf-8", body);
   Map<String, String> headers = new HashMap<>();
   headers.put("Cache-Control", "no-cache");
   headers.put("X-Content-Type-Options", "nosniff");
   response.setResponseHeaders(headers);
   return response;
  } catch (IOException missing) {
   return notFound();
  }
 }

 private WebResourceResponse notFound() {
  WebResourceResponse response = new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
  response.setStatusCodeAndReasonPhrase(404, "Not Found");
  return response;
 }

 private void open(Intent intent) {
  try {
   startActivity(intent);
  } catch (ActivityNotFoundException missing) {
   // No mail app or browser installed: nothing to hand the link to.
  }
 }

 private void goBack() {
  if (web != null && web.canGoBack()) web.goBack();
  // Like Android 12+, leave the app running in the background instead of closing it,
  // so reopening it is instant and keeps the page.
  else moveTaskToBack(true);
 }

 @Override
 @SuppressWarnings("deprecation")
 public void onBackPressed() {
  goBack();
 }

 @Override
 public void onConfigurationChanged(Configuration config) {
  super.onConfigurationChanged(config);
  // Rotation, resizing and the phone's dark mode are handled in place (manifest
  // configChanges), so the page keeps its state; only the colours follow.
  applyTheme(dark());
 }

 @Override
 public void onSaveInstanceState(Bundle state) {
  if (web != null) state.putString("url", web.getUrl());
  super.onSaveInstanceState(state);
 }

 @Override
 protected void onDestroy() {
  main.removeCallbacksAndMessages(null);
  if (web != null) {
   root.removeView(web);
   web.destroy();
   web = null;
  }
  super.onDestroy();
 }

 /** Called by the web app as window.PeakcastAndroid (src/haptics.ts, src/pages/Portfolio.tsx, src/theme.ts). */
 private class Bridge {
  /** Touch feedback from src/haptics.ts; follows the phone's haptics setting. */
  @JavascriptInterface
  public void haptic(String kind) {
   String name = kind == null ? "" : kind;
   int feedback;
   if (Build.VERSION.SDK_INT >= 30) {
    switch (name) {
     case "success": feedback = HapticFeedbackConstants.CONFIRM; break;
     case "warning": feedback = HapticFeedbackConstants.REJECT; break;
     case "impact": feedback = HapticFeedbackConstants.CONTEXT_CLICK; break;
     default: feedback = HapticFeedbackConstants.CLOCK_TICK;
    }
   } else {
    switch (name) {
     case "warning": feedback = HapticFeedbackConstants.LONG_PRESS; break;
     case "impact": case "success": feedback = HapticFeedbackConstants.VIRTUAL_KEY; break;
     default: feedback = HapticFeedbackConstants.CLOCK_TICK;
    }
   }
   runOnUiThread(() -> {
    if (web != null) web.performHapticFeedback(feedback);
   });
  }

  /**
   * The page has painted its first content. The launch screen goes once the WebView has
   * drawn that frame: while the page's script is still busy starting up (no new frames),
   * the launch screen's own animation stays on screen instead of a stalled page.
   */
  @JavascriptInterface
  public void ready() {
   runOnUiThread(() -> {
    if (painted || web == null) return;
    web.postVisualStateCallback(0, new WebView.VisualStateCallback() {
     @Override
     public void onComplete(long requestId) {
      onPainted();
     }
    });
   });
  }

  /**
   * The page's theme (true for dark), so the window and system bars match it. Remembered
   * when it differs from the phone's, so the next launch screen uses it too.
   */
  @JavascriptInterface
  public void setSystemTheme(boolean dark) {
   runOnUiThread(() -> {
    boolean followsPhone = dark == night();
    boolean changed = followsPhone ? prefs.contains("dark") : !prefs.contains("dark") || prefs.getBoolean("dark", false) != dark;
    if (changed) {
     if (followsPhone) prefs.edit().remove("dark").apply();
     else prefs.edit().putBoolean("dark", dark).apply();
     syncLaunchTheme();
    }
    applyTheme(dark);
   });
  }

  /** Milliseconds since the launch mark began animating, so the web boot logo can continue it instead of restarting. */
  @JavascriptInterface
  public long launchElapsedMs() {
   return System.currentTimeMillis() - iconStart;
  }

  @JavascriptInterface
  public void saveFile(String name, String mimeType, String text) {
   runOnUiThread(() -> {
    // Only the app's own pages may ask to save a file.
    String page = web == null ? null : web.getUrl();
    if (page == null || !page.startsWith(ORIGIN + "/")) return;
    pendingFile = text;
    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType(mimeType);
    intent.putExtra(Intent.EXTRA_TITLE, name);
    try {
     startActivityForResult(intent, SAVE_FILE);
    } catch (ActivityNotFoundException missing) {
     pendingFile = null;
    }
   });
  }
 }

 @Override
 @SuppressWarnings("deprecation")
 protected void onActivityResult(int requestCode, int resultCode, Intent data) {
  super.onActivityResult(requestCode, resultCode, data);
  if (requestCode != SAVE_FILE || pendingFile == null) return;
  String text = pendingFile;
  pendingFile = null;
  if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
  try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
   if (out != null) out.write(text.getBytes(StandardCharsets.UTF_8));
  } catch (IOException error) {
   if (web != null) web.evaluateJavascript("alert('The statement could not be saved.')", null);
  }
 }
}
