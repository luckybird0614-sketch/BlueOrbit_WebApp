import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { get, initDb, publicUser, run, type ProfileRow, type UserRow } from "./db.js";
import { decodePayload, fahrenheitToCelsius } from "./decode.js";
import { deviceHistory, hubbleConfigured, latestDevicePacket, matchDevice, recentDevices } from "./hubble.js";
import { appUrl, mailConfigured, sendMail } from "./mail.js";
import { hashPassword, verifyPassword } from "./password.js";

const COOKIE = "bo_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

const app = express();
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    hubbleConfigured: hubbleConfigured(),
  });
});

app.post("/api/auth/register", async (req, res) => {
  const email = cleanEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const preferredName = cleanText(req.body?.preferredName, 80);
  const problem = validateCredentials(email, password);
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }
  if (!preferredName) {
    res.status(400).json({ error: "Enter a preferred name" });
    return;
  }
  const existing = await get("SELECT id FROM users WHERE email = ?", [email]);
  if (existing) {
    res.status(409).json({ error: "An account with that email already exists" });
    return;
  }
  if (!mailConfigured()) {
    res.status(503).json({ error: "Email is not configured" });
    return;
  }
  const passwordHash = await hashPassword(password);
  const created = await run("INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)", [
    email,
    passwordHash,
    new Date().toISOString(),
  ]);
  const userId = created.insertId;
  await run("INSERT INTO profiles (user_id, preferred_name) VALUES (?, ?)", [userId, preferredName]);
  try {
    await sendVerificationEmail(userId, email);
  } catch {
    await run("DELETE FROM users WHERE id = ?", [userId]);
    res.status(503).json({ error: "Could not send the verification email" });
    return;
  }
  res.status(201).json({ verificationSent: true });
});

app.post("/api/auth/login", async (req, res) => {
  const email = cleanEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const user = await get<UserRow & { email_verified_at: string | null }>(
    "SELECT id, email, password_hash, email_verified_at FROM users WHERE email = ?",
    [email],
  );
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    res.status(401).json({ error: "Email or password is incorrect" });
    return;
  }
  if (!user.email_verified_at) {
    res.status(403).json({ error: "Verify your email before signing in" });
    return;
  }
  await startSession(res, user.id);
  res.json({ user: await loadPublicUser(user.id) });
});

app.post("/api/auth/verify", async (req, res, next) => {
  try {
    const userId = await consumeToken(cleanText(req.body?.token, 80), "verify");
    if (!userId) {
      res.status(400).json({ error: "That verification link is invalid or expired" });
      return;
    }
    await run("UPDATE users SET email_verified_at = ? WHERE id = ?", [new Date().toISOString(), userId]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/resend", async (req, res, next) => {
  try {
    const email = cleanEmail(req.body?.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Enter a valid email" });
      return;
    }
    if (!mailConfigured()) {
      res.status(503).json({ error: "Email is not configured" });
      return;
    }
    if (emailOnCooldown(`verify:${email}`)) {
      res.status(429).json({ error: "Wait a minute before sending another email" });
      return;
    }
    const user = await get<{ id: number; email_verified_at: string | null }>(
      "SELECT id, email_verified_at FROM users WHERE email = ?",
      [email],
    );
    if (user && !user.email_verified_at) {
      try {
        await sendVerificationEmail(Number(user.id), email);
      } catch {
        res.status(503).json({ error: "Could not send the verification email" });
        return;
      }
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/forgot", async (req, res, next) => {
  try {
    const email = cleanEmail(req.body?.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Enter a valid email" });
      return;
    }
    if (!mailConfigured()) {
      res.status(503).json({ error: "Email is not configured" });
      return;
    }
    const message = "If an account exists for that email, we sent a reset link.";
    const user = await get<{ id: number }>("SELECT id FROM users WHERE email = ?", [email]);
    if (user && !emailOnCooldown(`reset:${email}`)) {
      try {
        const token = await issueToken(Number(user.id), "reset");
        await sendMail(
          email,
          "Reset your MedsTemp password",
          `Open this link to choose a new password. It expires in 1 hour.\n\n${appUrl()}/?reset=${token}\n\nIf you did not ask for this, you can ignore this email.`,
        );
        markEmailSent(`reset:${email}`);
      } catch {
        res.status(503).json({ error: "Could not send the reset email" });
        return;
      }
    }
    res.json({ ok: true, message });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/reset", async (req, res, next) => {
  try {
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }
    const userId = await consumeToken(cleanText(req.body?.token, 80), "reset");
    if (!userId) {
      res.status(400).json({ error: "That reset link is invalid or expired" });
      return;
    }
    await run("UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?", [
      await hashPassword(password),
      new Date().toISOString(),
      userId,
    ]);
    await run("DELETE FROM sessions WHERE user_id = ?", [userId]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (typeof token === "string") {
    await run("DELETE FROM sessions WHERE token = ?", [token]);
  }
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});

app.get("/api/auth/me", requireUser, async (req, res) => {
  res.json({ user: await loadPublicUser(req.userId!) });
});

app.put("/api/profile", requireUser, async (req, res) => {
  const profile = await loadProfile(req.userId!);
  const preferredName = cleanText(req.body?.preferredName, 80) || profile.preferred_name;
  const medicationName = cleanText(req.body?.medicationName, 80);
  const storageLowF = numberOr(req.body?.storageLowF, profile.storage_low_f);
  const storageHighF = numberOr(req.body?.storageHighF, profile.storage_high_f);
  const useCelsius = Boolean(req.body?.useCelsius);
  if (!(storageLowF < storageHighF)) {
    res.status(400).json({ error: "Low temperature must be smaller than high" });
    return;
  }
  await run(
    `UPDATE profiles
     SET preferred_name = ?, medication_name = ?, storage_low_f = ?, storage_high_f = ?, use_celsius = ?
     WHERE user_id = ?`,
    [preferredName, medicationName, storageLowF, storageHighF, useCelsius ? 1 : 0, req.userId!],
  );
  res.json({ user: await loadPublicUser(req.userId!) });
});

app.get("/api/devices", requireUser, async (_req, res, next) => {
  try {
    const devices = await recentDevices();
    res.json({
      devices: devices.map((device) => ({
        id: device.id,
        name: device.name,
        rssi: device.rssi,
        timestampMillis: device.timestampMillis,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/tags/resolve", requireUser, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name, 120);
    if (!name) {
      res.status(400).json({ error: "Enter a tag name" });
      return;
    }
    const match = matchDevice(await recentDevices(), name);
    if (!match) {
      res.status(404).json({ error: `No resolved device matched "${name}"` });
      return;
    }
    await run("UPDATE profiles SET tag_name = ?, device_id = ?, device_name = ? WHERE user_id = ?", [
      name,
      match.id,
      match.name,
      req.userId!,
    ]);
    res.json({ user: await loadPublicUser(req.userId!), device: { id: match.id, name: match.name } });
  } catch (error) {
    next(error);
  }
});

app.get("/api/tags/reading", requireUser, async (req, res, next) => {
  try {
    const profile = await loadProfile(req.userId!);
    if (!profile.device_id) {
      res.status(400).json({ error: "Resolve a tag first" });
      return;
    }
    const packet = await latestDevicePacket(profile.device_id);
    const telemetry = packet?.payloadBase64 ? decodePayload(packet.payloadBase64) : null;
    res.json({
      deviceId: profile.device_id,
      deviceName: profile.device_name,
      timestampMillis: packet?.timestampMillis ?? 0,
      telemetry: telemetry
        ? {
            temperatureFahrenheit: telemetry.temperatureFahrenheit,
            temperatureCelsius: fahrenheitToCelsius(telemetry.temperatureFahrenheit),
            humidityPercent: telemetry.humidityPercent,
            batteryPercentage: telemetry.batteryPercentage,
            mut: telemetry.mut,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/tags/history", requireUser, async (req, res, next) => {
  try {
    const profile = await loadProfile(req.userId!);
    if (!profile.device_id) {
      res.status(400).json({ error: "Resolve a tag first" });
      return;
    }
    const days = Math.min(7, Math.max(1, Number(req.query.days) || 7));
    const packets = await deviceHistory(profile.device_id, days);
    const buckets = new Map<number, { timestampMillis: number; temperatureFahrenheit: number; humidityPercent: number | null; level: "High" | "Low" }>();
    for (const packet of packets) {
      if (!packet.payloadBase64) {
        continue;
      }
      const telemetry = decodePayload(packet.payloadBase64);
      if (!telemetry) {
        continue;
      }
      const bucket = Math.floor(packet.timestampMillis / (10 * 60_000)) * 10 * 60_000;
      const level =
        telemetry.temperatureFahrenheit > profile.storage_high_f
          ? "High"
          : telemetry.temperatureFahrenheit < profile.storage_low_f
            ? "Low"
            : null;
      if (!level) {
        continue;
      }
      buckets.set(bucket, {
        timestampMillis: packet.timestampMillis,
        temperatureFahrenheit: telemetry.temperatureFahrenheit,
        humidityPercent: telemetry.humidityPercent,
        level,
      });
    }
    res.json({ points: [...buckets.values()].sort((a, b) => a.timestampMillis - b.timestampMillis) });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.startsWith("ER_") || code === "ECONNREFUSED" || code === "PROTOCOL_CONNECTION_LOST") {
    res.status(500).json({ error: "Database request failed" });
    return;
  }
  const message = error instanceof Error ? error.message : "Request failed";
  const status = /not set in \.env/.test(message) ? 503 : 502;
  res.status(status).json({ error: message });
});

const port = Number(process.env.PORT) || 3000;
initDb()
  .then(() => {
    app.listen(port, "127.0.0.1", () => {
      console.log(`API listening on http://127.0.0.1:${port}`);
    });
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Database startup failed";
    console.error(message);
    process.exit(1);
  });

async function requireUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[COOKIE];
  if (typeof token !== "string" || !token) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  const session = await get<{ user_id: number; expires_at: number }>(
    "SELECT user_id, expires_at FROM sessions WHERE token = ?",
    [token],
  );
  if (!session || Number(session.expires_at) < Date.now()) {
    if (session) {
      await run("DELETE FROM sessions WHERE token = ?", [token]);
    }
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  req.userId = Number(session.user_id);
  next();
}

async function startSession(res: Response, userId: number): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await run("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", [
    token,
    userId,
    Date.now() + SESSION_MS,
  ]);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MS,
  });
}

async function loadPublicUser(userId: number) {
  const user = await get<UserRow>("SELECT id, email, password_hash FROM users WHERE id = ?", [userId]);
  if (!user) {
    throw new Error("Account not found");
  }
  return publicUser(user, await loadProfile(userId));
}

async function loadProfile(userId: number): Promise<ProfileRow> {
  const profile = await get<ProfileRow>("SELECT * FROM profiles WHERE user_id = ?", [userId]);
  if (!profile) {
    throw new Error("Account not found");
  }
  return profile;
}

const VERIFY_MS = 24 * 60 * 60 * 1000;
const RESET_MS = 60 * 60 * 1000;
const EMAIL_COOLDOWN_MS = 60_000;
const lastEmailAt = new Map<string, number>();

function emailOnCooldown(key: string): boolean {
  return Date.now() - (lastEmailAt.get(key) ?? 0) < EMAIL_COOLDOWN_MS;
}

function markEmailSent(key: string): void {
  lastEmailAt.set(key, Date.now());
}

async function issueToken(userId: number, purpose: "verify" | "reset"): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await run("DELETE FROM auth_tokens WHERE user_id = ? AND purpose = ?", [userId, purpose]);
  await run("INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, ?, ?, ?)", [
    userId,
    purpose,
    tokenHash,
    Date.now() + (purpose === "verify" ? VERIFY_MS : RESET_MS),
  ]);
  return token;
}

async function consumeToken(token: string, purpose: "verify" | "reset"): Promise<number | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return null;
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const row = await get<{ user_id: number; expires_at: number }>(
    "SELECT user_id, expires_at FROM auth_tokens WHERE token_hash = ? AND purpose = ?",
    [tokenHash, purpose],
  );
  if (!row || Number(row.expires_at) < Date.now()) {
    if (row) {
      await run("DELETE FROM auth_tokens WHERE token_hash = ?", [tokenHash]);
    }
    return null;
  }
  await run("DELETE FROM auth_tokens WHERE token_hash = ?", [tokenHash]);
  return Number(row.user_id);
}

async function sendVerificationEmail(userId: number, email: string): Promise<void> {
  const token = await issueToken(userId, "verify");
  await sendMail(
    email,
    "Verify your MedsTemp email",
    `Open this link to finish creating your account. It expires in 24 hours.\n\n${appUrl()}/?verify=${token}\n\nIf you did not create an account, you can ignore this email.`,
  );
  markEmailSent(`verify:${email}`);
}

function cleanEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, max);
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function validateCredentials(email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid email";
  }
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }
  return null;
}

declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}
