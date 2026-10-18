export const LOW_BATTERY_PCT = 10;
export const TEMP_ALERT_COOLDOWN_MS = 5 * 60 * 1000;
export const EXCURSION_REMINDER_MS = 6 * 60 * 60 * 1000;

export type AlertKind = "A" | "B" | "C" | "D";

export type AlertState = {
  deviceId: string;
  basicTempF: number | null;
  outsideAlertFired: boolean;
  lastExcursionAlertAt: number;
  nextCheckAt: number;
};

export type FiredAlert = {
  deviceId: string;
  kind: AlertKind;
  title: string;
  message: string;
  sound: string;
};

const TITLES: Record<AlertKind, string> = {
  A: "Temperature is within range",
  B: "Temperature has changed",
  C: "Temperature is outside your range",
  D: "Tag battery is low",
};

const SOUNDS: Record<AlertKind, string> = {
  A: "/sounds/a.mp3",
  B: "/sounds/b.mp3",
  C: "/sounds/c.mp3",
  D: "/sounds/d.mp3",
};

export function emptyAlertState(deviceId: string): AlertState {
  return {
    deviceId,
    basicTempF: null,
    outsideAlertFired: false,
    lastExcursionAlertAt: 0,
    nextCheckAt: 0,
  };
}

function stateKey(userId: number): string {
  return `bo-alert:${userId}`;
}

function openKey(userId: number): string {
  return `bo-alert-open:${userId}`;
}

function rangeKey(userId: number): string {
  return `bo-range:${userId}`;
}

export function loadAlertState(userId: number, deviceId: string): AlertState {
  const raw = localStorage.getItem(stateKey(userId));
  if (!raw) {
    return emptyAlertState(deviceId);
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AlertState>;
    if (parsed.deviceId !== deviceId) {
      return emptyAlertState(deviceId);
    }
    return {
      ...emptyAlertState(deviceId),
      ...parsed,
      deviceId,
      lastExcursionAlertAt: Number(parsed.lastExcursionAlertAt) || 0,
      nextCheckAt: Number(parsed.nextCheckAt) || 0,
    };
  } catch {
    return emptyAlertState(deviceId);
  }
}

export function saveAlertState(userId: number, state: AlertState): void {
  localStorage.setItem(stateKey(userId), JSON.stringify(state));
}

export function resetAlertState(userId: number, deviceId: string): AlertState {
  const state = emptyAlertState(deviceId);
  saveAlertState(userId, state);
  sessionStorage.removeItem(openKey(userId));
  return state;
}

export function loadOpenAlert(userId: number, deviceId: string): FiredAlert | null {
  const raw = sessionStorage.getItem(openKey(userId));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as FiredAlert;
    return parsed.deviceId === deviceId ? parsed : null;
  } catch {
    return null;
  }
}

export function saveOpenAlert(userId: number, alert: FiredAlert | null): void {
  if (!alert) {
    sessionStorage.removeItem(openKey(userId));
    return;
  }
  sessionStorage.setItem(openKey(userId), JSON.stringify(alert));
}

export function isRangeConfirmed(userId: number, lowF: number, highF: number): boolean {
  const raw = localStorage.getItem(rangeKey(userId));
  if (!raw) {
    return false;
  }
  try {
    const saved = JSON.parse(raw) as { lowF: number; highF: number };
    return Math.abs(saved.lowF - lowF) < 0.05 && Math.abs(saved.highF - highF) < 0.05;
  } catch {
    return false;
  }
}

export function confirmRange(userId: number, lowF: number, highF: number): void {
  localStorage.setItem(rangeKey(userId), JSON.stringify({ lowF, highF }));
}

export function isWithinRange(tempF: number, lowF: number, highF: number): boolean {
  return Number.isFinite(tempF) && tempF + 1e-9 >= lowF && tempF - 1e-9 <= highF;
}

export function formatRange(lowF: number, highF: number): string {
  return `${Math.round(lowF)}°F and ${Math.round(highF)}°F`;
}

export function evaluateReading(
  state: AlertState,
  reading: {
    deviceId: string;
    temperatureFahrenheit: number;
    batteryPercentage: number;
    storageLowF: number;
    storageHighF: number;
    rangeConfirmed: boolean;
  },
  preferredName: string,
  now: number,
): { state: AlertState; alert: FiredAlert | null } {
  const next: AlertState =
    state.deviceId === reading.deviceId ? { ...state } : emptyAlertState(reading.deviceId);
  if (next.basicTempF == null || !Number.isFinite(next.basicTempF)) {
    next.basicTempF = reading.temperatureFahrenheit;
    return { state: next, alert: null };
  }
  if (now < next.nextCheckAt || !Number.isFinite(reading.temperatureFahrenheit)) {
    return { state: next, alert: null };
  }

  const current = reading.temperatureFahrenheit;
  const within = isWithinRange(current, reading.storageLowF, reading.storageHighF);
  if (reading.rangeConfirmed && !within) {
    if (!next.outsideAlertFired) {
      next.outsideAlertFired = true;
      next.lastExcursionAlertAt = now;
      return { state: next, alert: buildAlert("B", reading, preferredName, next.basicTempF) };
    }
    if (next.lastExcursionAlertAt > 0 && now - next.lastExcursionAlertAt < EXCURSION_REMINDER_MS) {
      return { state: next, alert: null };
    }
    next.lastExcursionAlertAt = now;
    return { state: next, alert: buildAlert("C", reading, preferredName, next.basicTempF) };
  }
  if (reading.rangeConfirmed && within && next.outsideAlertFired) {
    next.outsideAlertFired = false;
    next.lastExcursionAlertAt = 0;
    return { state: next, alert: buildAlert("A", reading, preferredName, next.basicTempF) };
  }
  if (Number.isFinite(reading.batteryPercentage) && reading.batteryPercentage + 1e-9 < LOW_BATTERY_PCT) {
    return { state: next, alert: buildAlert("D", reading, preferredName, next.basicTempF) };
  }
  return { state: next, alert: null };
}

export function dismissAlert(state: AlertState, now: number): AlertState {
  return { ...state, nextCheckAt: now + TEMP_ALERT_COOLDOWN_MS };
}

function buildAlert(
  kind: AlertKind,
  reading: {
    deviceId: string;
    temperatureFahrenheit: number;
    batteryPercentage: number;
    storageLowF: number;
    storageHighF: number;
  },
  preferredName: string,
  basicTempF: number,
): FiredAlert {
  const name = preferredName.trim() || "friend";
  const temp = formatTemp(reading.temperatureFahrenheit);
  const change = formatTemp(Math.abs(reading.temperatureFahrenheit - basicTempF));
  const range = formatRange(reading.storageLowF, reading.storageHighF);
  const battery = `${Math.round(reading.batteryPercentage)}%`;
  const message =
    kind === "A"
      ? `Hi ${name}, Your medication is at ${temp}. That is within your set range of ${range}.`
      : kind === "B"
        ? `Hi ${name}, The temperature of your medication has changed by ${change}. Please check where it is stored. Your set range is ${range}.`
        : kind === "C"
          ? `Hi ${name}, The temperature of your medication is now ${temp}. That is outside your set range of ${range}. If you are unsure whether your medication is still safe to use, contact your pharmacist or doctor.`
          : `Hi ${name}, The battery in your BlueOrbit tag is low (${battery}). When the battery runs out the tag stops reporting, and your medication will no longer be monitored. To arrange a replacement tag, contact Ask@BlueOrbit.com`;
  return { deviceId: reading.deviceId, kind, title: TITLES[kind], message, sound: SOUNDS[kind] };
}

function formatTemp(tempF: number): string {
  return `${tempF.toFixed(1)}°F`;
}
