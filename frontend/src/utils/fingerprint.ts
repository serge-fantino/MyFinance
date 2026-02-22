/**
 * Browser fingerprint and device info for session tracking.
 * Extracts browser, OS, device type from userAgent + screen/timezone.
 */

let cachedHash: string | null = null;

export function getFingerprint(): string {
  if (cachedHash) return cachedHash;
  const parts = [
    navigator.userAgent,
    `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
  ];
  const str = parts.join("|");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = (hash << 5) - hash + c;
    hash = hash & hash;
  }
  cachedHash = Math.abs(hash).toString(36);
  return cachedHash;
}

export interface DeviceInfo {
  browser: string;
  os: string;
  deviceType: string;
  /** Human-readable summary, e.g. "Chrome 120 sur macOS 14.0 (Ordinateur)" */
  summary: string;
}

/** Parse userAgent to extract browser, OS and device type. */
export function getDeviceInfo(): DeviceInfo {
  const ua = navigator.userAgent;
  let browser = "Navigateur inconnu";
  let os = "OS inconnu";
  let deviceType = "Appareil";

  // Browser (order matters: Edge/Chrome contain "Chrome", CriOS=Fake Chrome, etc.)
  if (ua.includes("Edg/")) {
    const m = ua.match(/Edg\/(\d+)/);
    browser = m ? `Edge ${m[1]}` : "Edge";
  } else if (ua.includes("OPR/") || ua.includes("Opera/")) {
    const m = ua.match(/(?:OPR|Opera)\/(\d+)/);
    browser = m ? `Opera ${m[1]}` : "Opera";
  } else if (ua.includes("CriOS/")) {
    const m = ua.match(/CriOS\/(\d+)/);
    browser = m ? `Chrome ${m[1]} (iOS)` : "Chrome (iOS)";
  } else if (ua.includes("FxiOS/")) {
    const m = ua.match(/FxiOS\/(\d+)/);
    browser = m ? `Firefox ${m[1]} (iOS)` : "Firefox (iOS)";
  } else if (ua.includes("Chrome/") && !ua.includes("Chromium")) {
    const m = ua.match(/Chrome\/(\d+)/);
    browser = m ? `Chrome ${m[1]}` : "Chrome";
  } else if (ua.includes("Firefox/")) {
    const m = ua.match(/Firefox\/(\d+)/);
    browser = m ? `Firefox ${m[1]}` : "Firefox";
  } else if (ua.includes("Safari/") && !ua.includes("Chrome")) {
    const m = ua.match(/Version\/(\d+[.\d]*)/);
    browser = m ? `Safari ${m[1]}` : "Safari";
  }

  // OS
  if (ua.includes("Windows NT 10")) os = "Windows 10/11";
  else if (ua.includes("Windows NT")) os = "Windows";
  else if (ua.includes("Mac OS X")) {
    const m = ua.match(/Mac OS X (\d+[_\d]*)/);
    if (m) {
      const ver = m[1].replace(/_/g, ".");
      os = `macOS ${ver}`;
    } else {
      os = "macOS";
    }
  } else if (ua.includes("iPhone")) {
    const m = ua.match(/OS (\d+[_\d]*)/);
    os = m ? `iOS ${m[1].replace(/_/g, ".")}` : "iOS";
    deviceType = "iPhone";
  } else if (ua.includes("iPad")) {
    const m = ua.match(/OS (\d+[_\d]*)/);
    os = m ? `iPadOS ${m[1].replace(/_/g, ".")}` : "iPadOS";
    deviceType = "iPad";
  } else if (ua.includes("Android")) {
    const m = ua.match(/Android (\d+[.\d]*)/);
    os = m ? `Android ${m[1]}` : "Android";
    deviceType = ua.includes("Mobile") ? "Téléphone" : "Tablette";
  } else if (ua.includes("Linux")) os = "Linux";

  const summary = `${browser} sur ${os} (${deviceType})`;
  return { browser, os, deviceType, summary };
}
