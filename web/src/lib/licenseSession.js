const DEVICE_ID_KEY = "opentakeoff.license-device-id";

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

export function getLicenseDeviceId(storage = globalThis.localStorage, cryptoApi = globalThis.crypto) {
  try {
    const saved = storage?.getItem(DEVICE_ID_KEY);
    if (validUuid(saved)) return saved;
    const created = cryptoApi?.randomUUID?.();
    if (!validUuid(created)) throw new Error("A secure device identifier could not be created.");
    storage?.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch (error) {
    const created = cryptoApi?.randomUUID?.();
    if (validUuid(created)) return created;
    throw error;
  }
}

export function licenseDeviceName(navigatorApi = globalThis.navigator) {
  const platform = String(navigatorApi?.userAgentData?.platform || navigatorApi?.platform || "Computer").trim();
  const mobile = navigatorApi?.userAgentData?.mobile || /iPhone|iPad|Android/i.test(String(navigatorApi?.userAgent || ""));
  return `${platform || "Computer"}${mobile ? " mobile device" : " computer"}`.slice(0, 120);
}

export function currentLicenseDevice() {
  return { deviceId: getLicenseDeviceId(), deviceName: licenseDeviceName() };
}

export const LICENSE_HEARTBEAT_MS = 45_000;
export const LICENSE_LEASE_SECONDS = 120;

