const ANDROID_TABLET_CLASS = "android-tablet";
const TABLET_DEVICE_CLASS = "tablet-device";

function isAndroidUserAgent(): boolean {
  return /Android/i.test(navigator.userAgent);
}

export function prefersTouchPrimaryDevice(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

export function isAndroidTablet(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  if (!isAndroidUserAgent() || !prefersTouchPrimaryDevice()) {
    return false;
  }

  const minTabletWidth = window.matchMedia("(min-width: 600px)").matches;
  const uaLooksLikePhone = /Mobile/i.test(navigator.userAgent);

  return minTabletWidth && (!uaLooksLikePhone || window.matchMedia("(min-width: 768px)").matches);
}

export function isTabletDevice(): boolean {
  if (typeof window === "undefined" || !prefersTouchPrimaryDevice()) {
    return false;
  }

  return window.matchMedia("(min-width: 600px) and (max-width: 1366px)").matches;
}

export function markAndroidTabletDocument(): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.classList.toggle(TABLET_DEVICE_CLASS, isTabletDevice());

  if (isAndroidTablet()) {
    document.documentElement.classList.add(ANDROID_TABLET_CLASS);
    return;
  }

  document.documentElement.classList.remove(ANDROID_TABLET_CLASS);
}
