// Optional integration with the Android app (android/). The web app doesn't
// import @capacitor/core: it works in any browser, and this only detects the
// bridge the app injects, so app-only UI like "Change server" stays hidden elsewhere.
interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: { ServerConfig?: { clear: () => Promise<void> } };
}

const capacitor = (window as { Capacitor?: CapacitorGlobal }).Capacitor;

export const isNativeApp = Boolean(capacitor?.isNativePlatform?.());

/** Forget the saved server; the app restarts on its connect screen */
export function changeServer(): void {
  if (confirm(`Disconnect from ${window.location.host} and enter a different server?`)) {
    void capacitor?.Plugins?.ServerConfig?.clear();
  }
}
