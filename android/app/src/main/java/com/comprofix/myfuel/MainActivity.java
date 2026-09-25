package com.comprofix.myfuel;

import android.content.SharedPreferences;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.appcompat.app.AlertDialog;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    public static final String PREFS_NAME = "MyFuelServerConfig";
    public static final String SERVER_URL_PREF_KEY = "server_url";

    // Only a failed main navigation shows the "can't reach server" dialog, not a
    // sub-resource error (e.g. a map tile) on a page that already loaded.
    private boolean pageLoadedSuccessfully = false;
    private boolean errorDialogShown = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ServerConfigPlugin.class);

        // With a saved server URL, point the bridge there instead of the bundled
        // connect page (capacitor-www/). With none, a null config loads the default,
        // which serves the bundled page.
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String savedUrl = prefs.getString(SERVER_URL_PREF_KEY, null);
        if (savedUrl != null) {
            config = new CapConfig.Builder(this).setServerUrl(savedUrl).create();
        }

        super.onCreate(savedInstanceState);

        // A native dialog rather than Capacitor's errorPath page: plugins aren't
        // available on an errorPath page, so a "change server" button there couldn't work.
        if (savedUrl != null) {
            getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public void onPageStarted(WebView webView) {
                    pageLoadedSuccessfully = false;
                }

                @Override
                public void onPageLoaded(WebView webView) {
                    pageLoadedSuccessfully = true;
                }

                @Override
                public void onReceivedError(WebView webView) {
                    maybeShowConnectionError();
                }

                @Override
                public void onReceivedHttpError(WebView webView) {
                    maybeShowConnectionError();
                }
            });
        }
    }

    private void maybeShowConnectionError() {
        if (pageLoadedSuccessfully || errorDialogShown) return;
        errorDialogShown = true;

        runOnUiThread(() -> new AlertDialog.Builder(MainActivity.this)
            .setTitle("Can't reach your server")
            .setMessage("The MyFuel server you connected to isn't responding right now.")
            .setCancelable(false)
            .setPositiveButton("Try Again", (dialog, which) -> recreate())
            .setNegativeButton("Change Server", (dialog, which) -> {
                getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().remove(SERVER_URL_PREF_KEY).apply();
                recreate();
            })
            .show());
    }
}
