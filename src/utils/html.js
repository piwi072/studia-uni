export function esc(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function vibrate(ms = 10) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    // Ignore on unsupported devices
  }
}
