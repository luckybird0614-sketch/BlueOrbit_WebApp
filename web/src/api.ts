export type User = {
  id: number;
  email: string;
  preferredName: string;
  medicationName: string;
  storageLowF: number;
  storageHighF: number;
  useCelsius: boolean;
  tagName: string;
  deviceId: string;
  deviceName: string;
};

export type HistoryPoint = {
  timestampMillis: number;
  temperatureFahrenheit: number;
  humidityPercent: number | null;
  level: "High" | "Low";
};

export type Reading = {
  deviceId: string;
  deviceName: string;
  timestampMillis: number;
  telemetry: {
    temperatureFahrenheit: number;
    temperatureCelsius: number;
    humidityPercent: number | null;
    batteryPercentage: number;
    mut: boolean;
  } | null;
};

const apiRoot = import.meta.env.PROD ? import.meta.env.BASE_URL.replace(/\/$/, "") : "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiRoot}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return body;
}

export const api = {
  health: () => request<{ ok: boolean; hubbleConfigured: boolean }>("/api/health"),
  me: () => request<{ user: User }>("/api/auth/me"),
  register: (email: string, password: string, preferredName: string) =>
    request<{ verificationSent: true }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, preferredName }),
    }),
  verifyEmail: (token: string) =>
    request<{ ok: true }>("/api/auth/verify", { method: "POST", body: JSON.stringify({ token }) }),
  resendVerification: (email: string) =>
    request<{ ok: true }>("/api/auth/resend", { method: "POST", body: JSON.stringify({ email }) }),
  forgotPassword: (email: string) =>
    request<{ ok: true; message: string }>("/api/auth/forgot", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    request<{ ok: true }>("/api/auth/reset", { method: "POST", body: JSON.stringify({ token, password }) }),
  login: (email: string, password: string) =>
    request<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  saveProfile: (profile: {
    preferredName: string;
    medicationName: string;
    storageLowF: number;
    storageHighF: number;
    useCelsius: boolean;
  }) => request<{ user: User }>("/api/profile", { method: "PUT", body: JSON.stringify(profile) }),
  resolveTag: (name: string) =>
    request<{ user: User }>("/api/tags/resolve", { method: "POST", body: JSON.stringify({ name }) }),
  reading: () => request<Reading>("/api/tags/reading"),
  history: () => request<{ points: HistoryPoint[] }>("/api/tags/history"),
};
