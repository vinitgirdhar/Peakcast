package com.wildcatter.app;
import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.webkit.*;
public class MainActivity extends Activity {
 private WebView web;
 private static final String ORIGIN = "__ORIGIN__";
 @Override public void onCreate(Bundle state) {
  super.onCreate(state); web = new WebView(this); setContentView(web); web.setVerticalScrollBarEnabled(false); web.setHorizontalScrollBarEnabled(false);
  WebSettings settings=web.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true); settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  web.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){Uri uri=request.getUrl(); if(!"https".equals(uri.getScheme()))return true;if(ORIGIN.equals(uri.getScheme()+"://"+uri.getAuthority()))return false;if(request.hasGesture())startActivity(new Intent(Intent.ACTION_VIEW,uri));return true;}});
  web.setDownloadListener((url,userAgent,disposition,mime,length)->{if(url.startsWith(ORIGIN+"/downloads/"))startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));});
  if(state==null)web.loadUrl(ORIGIN+"/markets");else web.restoreState(state);
 }
 @Override public void onSaveInstanceState(Bundle state){web.saveState(state);super.onSaveInstanceState(state);}
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
}
