package com.comprofix.myfuel;

import android.app.Activity;
import android.content.SharedPreferences;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Lets the bundled connect page save the server URL, and the web app clear it
// ("Change server"). Each restarts the Activity so MainActivity re-reads it.
@CapacitorPlugin(name = "ServerConfig")
public class ServerConfigPlugin extends Plugin {

    @PluginMethod
    public void connect(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }
        prefs().edit().putString(MainActivity.SERVER_URL_PREF_KEY, url).apply();
        call.resolve();
        restart();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        prefs().edit().remove(MainActivity.SERVER_URL_PREF_KEY).apply();
        call.resolve();
        restart();
    }

    private SharedPreferences prefs() {
        return getActivity().getSharedPreferences(MainActivity.PREFS_NAME, Activity.MODE_PRIVATE);
    }

    private void restart() {
        Activity activity = getActivity();
        activity.runOnUiThread(activity::recreate);
    }
}
