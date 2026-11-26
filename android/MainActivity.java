package com.wildcatter.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.window.OnBackInvokedDispatcher;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
 private static final String ORIGIN = "__ORIGIN__";
 private static final String START_ORIGIN = "__START_ORIGIN__";
 private static final int SAVE_FILE = 1;
 private WebView web;
 private String pendingFile;

 private String startUrl() {
  return START_ORIGIN.isEmpty() ? ORIGIN + "/markets" : START_ORIGIN + "/?app=1";
 }

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
  settings.setDomStorageEnabled(true);
  settings.setAllowFileAccess(false);
  settings.setAllowContentAccess(false);
  settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  // Only the app's own origin ever loads here; other links open the browser.
  web.addJavascriptInterface(new Bridge(), "WildcatterAndroid");
  web.setWebViewClient(new WebViewClient() {
   @Override
   public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
    Uri uri = request.getUrl();
    if ("mailto".equals(uri.getScheme())) {
     if (request.hasGesture()) open(new Intent(Intent.ACTION_SENDTO, uri));
     return true;
    }
    if (!"https".equals(uri.getScheme())) return true;
    String origin = uri.getScheme() + "://" + uri.getAuthority();
    if (ORIGIN.equals(origin) || START_ORIGIN.equals(origin)) return false;
    if (request.hasGesture()) open(new Intent(Intent.ACTION_VIEW, uri));
    return true;
   }

   @Override
   public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
    if (request.isForMainFrame()) view.loadDataWithBaseURL(null, offlinePage(), "text/html", "utf-8", null);
   }
  });
  web.setDownloadListener((url, userAgent, disposition, mime, length) -> {
   if (url.startsWith(ORIGIN + "/downloads/")) open(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
  });

  if (Build.VERSION.SDK_INT >= 33) {
   getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
  }
  if (state == null) web.loadUrl(startUrl());
  else web.restoreState(state);
 }

 private String offlinePage() {
  String ink = night() ? "#f5f5f7" : "#202124";
  String canvas = night() ? "#000" : "#f7f8fa";
  return "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
   + "<body style='margin:0;min-height:100vh;display:grid;place-items:center;font-family:sans-serif;background:" + canvas + ";color:" + ink + "'>"
   + "<main style='text-align:center;padding:24px'><h1 style='font-size:22px'>You're offline</h1>"
   + "<p style='opacity:.7'>Check your connection, then try again.</p>"
   + "<a href='" + startUrl() + "' style='display:inline-block;margin-top:12px;padding:12px 22px;border-radius:12px;background:" + ink + ";color:" + canvas + ";text-decoration:none'>Retry</a>"
   + "</main></body>";
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
  web.saveState(state);
  super.onSaveInstanceState(state);
 }

 /** Saves exported files (the CSV statement) where the user chooses. */
 private class Bridge {
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
  } catch (Exception error) {
   web.evaluateJavascript("alert('The statement could not be saved.')", null);
  }
 }
}
