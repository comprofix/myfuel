import type { CapacitorConfig } from '@capacitor/cli';

// No fixed server.url: the app works with anyone's self-hosted server. On first
// launch it shows the bundled connect page (capacitor-www/index.html), which
// saves the server URL through the native ServerConfig plugin. MainActivity
// then points the WebView at that URL on every launch (see MainActivity.java).
const config: CapacitorConfig = {
  appId: 'com.comprofix.myfuel',
  appName: 'MyFuel',
  webDir: 'capacitor-www',
};

export default config;
