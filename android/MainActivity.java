package com.bay2peak.peakcast;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.HapticFeedbackConstants;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
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
 */
public class MainActivity extends Activity {
 /** Android's reserved host for app-bundled content; requests to it never leave the device. */
 private static final String ORIGIN = "https://appassets.androidplatform.net";
 private static final int SAVE_FILE = 1;
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
 private WebView web;
 private String pendingFile;

 private boolean night() {
  return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
 }

 @Override
 public void onCreate(Bundle state) {
  super.onCreate(state);
  int background = night() ? Color.BLACK : Color.parseColor("#F7F8FA");
  FrameLayout root = new FrameLayout(this);
  root.setBackgroundColor(background);
  web = new WebView(this);
  web.setBackgroundColor(background);
  web.setVerticalScrollBarEnabled(false);
  web.setHorizontalScrollBarEnabled(false);
  root.addView(web);
  setContentView(root);

  // Android 15+ draws edge to edge: keep content clear of the bars, cutout and keyboard.
  if (Build.VERSION.SDK_INT >= 30) {
   root.setOnApplyWindowInsetsListener((view, insets) -> {
    Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
    view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
    return WindowInsets.CONSUMED;
   });
   WindowInsetsController bars = getWindow().getInsetsController();
   if (bars != null) {
    int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
    bars.setSystemBarsAppearance(night() ? 0 : light, light);
   }
  }

  WebSettings settings = web.getSettings();
  settings.setJavaScriptEnabled(true);
  // IndexedDB and localStorage hold the user's on-device data.
  settings.setDomStorageEnabled(true);
  settings.setAllowFileAccess(false);
  settings.setAllowContentAccess(false);
  settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
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
  });

  if (Build.VERSION.SDK_INT >= 33) {
   getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
  }
  // After Android ends the app in the background, reopen the page the user was
  // on. WebView.restoreState() would leave a blank black screen with bundled pages.
  String last = state == null ? null : state.getString("url");
  web.loadUrl(last != null && last.startsWith(ORIGIN + "/") ? last : ORIGIN + "/markets");
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
  if (web.canGoBack()) web.goBack();
  else finish();
 }

 @Override
 @SuppressWarnings("deprecation")
 public void onBackPressed() {
  goBack();
 }

 @Override
 public void onSaveInstanceState(Bundle state) {
  state.putString("url", web.getUrl());
  super.onSaveInstanceState(state);
 }

 /** Saves exported files (the CSV statement) where the user chooses. */
 private class Bridge {
  /** Touch feedback from src/haptics.ts; follows the phone's haptics setting. */
  @JavascriptInterface
  public void haptic(String kind) {
   int feedback;
   if (Build.VERSION.SDK_INT >= 30) {
    switch (kind) {
     case "success": feedback = HapticFeedbackConstants.CONFIRM; break;
     case "warning": feedback = HapticFeedbackConstants.REJECT; break;
     case "impact": feedback = HapticFeedbackConstants.CONTEXT_CLICK; break;
     default: feedback = HapticFeedbackConstants.CLOCK_TICK;
    }
   } else {
    feedback = "selection".equals(kind) ? HapticFeedbackConstants.CLOCK_TICK : HapticFeedbackConstants.VIRTUAL_KEY;
   }
   runOnUiThread(() -> web.performHapticFeedback(feedback));
  }

  @JavascriptInterface
  public void saveFile(String name, String mimeType, String text) {
   runOnUiThread(() -> {
    // Only the app's own pages may ask to save a file.
    String page = web.getUrl();
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
   web.evaluateJavascript("alert('The statement could not be saved.')", null);
  }
 }
}
