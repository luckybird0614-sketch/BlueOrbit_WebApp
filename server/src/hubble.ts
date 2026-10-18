export type CloudDevice = {
  id: string;
  name: string;
  rssi: number | null;
  timestampMillis: number;
  payloadBase64: string | null;
};

type Cache = { at: number; devices: CloudDevice[] };
let cache: Cache | null = null;

export function hubbleConfigured(): boolean {
  return Boolean(process.env.HUBBLE_ORG_ID && process.env.HUBBLE_API_TOKEN);
}

let devicesInflight: Promise<CloudDevice[]> | null = null;

export async function recentDevices(): Promise<CloudDevice[]> {
  if (!hubbleConfigured()) {
    throw new Error("Hubble org id and API token are not set in .env");
  }
  if (cache && Date.now() - cache.at < 15_000) {
    return cache.devices;
  }
  if (!devicesInflight) {
    devicesInflight = loadOrgDevices()
      .then((devices) => {
        cache = { at: Date.now(), devices };
        return devices;
      })
      .finally(() => {
        devicesInflight = null;
      });
  }
  return devicesInflight;
}

export async function deviceHistory(deviceId: string, days: number): Promise<CloudDevice[]> {
  if (!hubbleConfigured()) {
    throw new Error("Hubble org id and API token are not set in .env");
  }
  const end = Math.floor(Date.now() / 1000);
  const start = end - days * 24 * 60 * 60;
  return fetchDevices(start, deviceId, 80, end);
}

/** Newest packet with a payload for one device, from a closed 12-hour window. */
export async function latestDevicePacket(deviceId: string): Promise<CloudDevice | null> {
  if (!hubbleConfigured()) {
    throw new Error("Hubble org id and API token are not set in .env");
  }
  const end = Math.floor(Date.now() / 1000);
  const packets = await fetchDevices(end - 12 * 60 * 60, deviceId, 2, end);
  for (let index = packets.length - 1; index >= 0; index -= 1) {
    if (packets[index]?.payloadBase64) {
      return packets[index] ?? null;
    }
  }
  return null;
}

export function matchDevice(devices: CloudDevice[], query: string): CloudDevice | null {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const queryMut = normalized.includes("mut");
  const querySut = !queryMut && normalized.includes("sut");
  let contains: CloudDevice | null = null;
  for (const device of devices) {
    const nameNorm = device.name.trim().toLowerCase();
    if (!nameNorm) {
      continue;
    }
    if (nameNorm === normalized) {
      return device;
    }
    const nameMut = nameNorm.includes("mut");
    const nameSut = !nameMut && nameNorm.includes("sut");
    if ((queryMut && nameSut) || (querySut && nameMut)) {
      continue;
    }
    if (!contains && nameNorm.includes(normalized)) {
      contains = device;
    }
  }
  return contains;
}

async function loadOrgDevices(): Promise<CloudDevice[]> {
  const devices: CloudDevice[] = [];
  let continuation: string | null = null;
  for (let page = 0; page < 10; page += 1) {
    const url = orgUrl("devices");
    const response = await hubbleFetch(url, continuation);
    const body = (await response.json()) as { devices?: unknown[] };
    devices.push(...parseOrgDevices(body.devices ?? []));
    continuation = continuationToken(response);
    if (!continuation) {
      break;
    }
  }
  return devices;
}

async function fetchDevices(
  startTimeEpochSec: number,
  deviceId: string | null,
  maxPages: number,
  endTimeEpochSec?: number,
): Promise<CloudDevice[]> {
  const byId = new Map<string, CloudDevice>();
  const history: CloudDevice[] = [];
  let continuation: string | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const url = orgUrl("packets");
    url.searchParams.set("start_time", String(startTimeEpochSec));
    url.searchParams.set("start", String(startTimeEpochSec));
    if (endTimeEpochSec) {
      url.searchParams.set("end", String(endTimeEpochSec));
    }
    if (deviceId) {
      url.searchParams.set("device_id", deviceId);
    }
    const response = await hubbleFetch(url, continuation);
    const body = (await response.json()) as { packets?: unknown[] };
    for (const device of parsePackets(body.packets ?? [])) {
      if (deviceId) {
        if (device.id === deviceId && device.payloadBase64 && device.timestampMillis > 0) {
          history.push(device);
        }
      } else {
        byId.set(device.id, device);
      }
    }
    continuation = continuationToken(response);
    if (!continuation) {
      break;
    }
  }

  if (deviceId) {
    return history.sort((a, b) => a.timestampMillis - b.timestampMillis);
  }
  return [...byId.values()].sort((a, b) => b.timestampMillis - a.timestampMillis);
}

function orgUrl(resource: "devices" | "packets"): URL {
  return new URL(
    `https://api.hubble.com/api/org/${encodeURIComponent(process.env.HUBBLE_ORG_ID || "")}/${resource}`,
  );
}

async function hubbleFetch(url: URL, continuation: string | null): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${process.env.HUBBLE_API_TOKEN}`,
  };
  if (continuation) {
    headers["Continuation-Token"] = continuation;
  }
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) {
    throw new Error(`Hubble ${url.pathname.endsWith("/devices") ? "devices" : "packets"} request failed (HTTP ${response.status})`);
  }
  return response;
}

function continuationToken(response: Response): string | null {
  const token = response.headers.get("Continuation-Token")?.trim();
  return token || null;
}

function parseOrgDevices(devices: unknown[]): CloudDevice[] {
  const parsed: CloudDevice[] = [];
  for (const raw of devices) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const device = raw as {
      id?: string;
      name?: string;
      most_recent_packet?: {
        terrestrial?: { timestamp?: number } | null;
        satellite?: { timestamp?: number } | null;
      };
    };
    const id = device.id ?? "";
    if (!id) {
      continue;
    }
    const timestamp =
      device.most_recent_packet?.terrestrial?.timestamp ?? device.most_recent_packet?.satellite?.timestamp ?? 0;
    parsed.push({
      id,
      name: device.name ?? "",
      rssi: null,
      timestampMillis: toMillis(timestamp),
      payloadBase64: null,
    });
  }
  return parsed;
}

function toMillis(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value > 1_000_000_000_000 ? value : value * 1000;
}

function parsePackets(packets: unknown[]): CloudDevice[] {
  const devices: CloudDevice[] = [];
  for (const raw of packets) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const packet = raw as {
      device?: { id?: string; name?: string; rssi?: number; payload?: string; timestamp?: unknown };
      location?: { timestamp?: number };
    };
    const id = packet.device?.id ?? "";
    if (!id) {
      continue;
    }
    const locationTs = packet.location?.timestamp ?? 0;
    const timestampMillis = locationTs > 1_000_000_000_000 ? locationTs : locationTs * 1000;
    devices.push({
      id,
      name: packet.device?.name ?? "",
      rssi: typeof packet.device?.rssi === "number" ? packet.device.rssi : null,
      timestampMillis,
      payloadBase64: packet.device?.payload || null,
    });
  }
  return devices;
}
