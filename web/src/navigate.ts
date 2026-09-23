/**
 * Open turn-by-turn directions in the device's own maps app.
 *
 * - Android: a geo: URI goes to the user's default navigation app,
 *   which is usually Google Maps.
 * - iPhone/iPad: Apple Maps, the system default.
 * - Desktop: Google Maps directions in a new tab.
 */
export function navigateTo(lat: number, lng: number, label: string) {
  const ua = navigator.userAgent;
  const dest = `${lat},${lng}`;
  if (/Android/i.test(ua)) {
    window.location.href = `geo:${dest}?q=${dest}(${encodeURIComponent(label)})`;
  } else if (/iPhone|iPad|iPod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)) {
    window.location.href = `https://maps.apple.com/?daddr=${dest}&dirflg=d`;
  } else {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`, '_blank', 'noopener');
  }
}
