import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  confirmRange,
  dismissAlert,
  evaluateReading,
  formatRange,
  isRangeConfirmed,
  loadAlertState,
  loadOpenAlert,
  resetAlertState,
  saveAlertState,
  saveOpenAlert,
  type AlertState,
  type FiredAlert,
} from "./alerts";
import { api, type HistoryPoint, type Reading, type User } from "./api";
import { MEDICATIONS } from "./medications";

function readAuthLink(): { verify: string | null; reset: string | null } {
  const params = new URLSearchParams(window.location.search);
  const verify = params.get("verify");
  const reset = params.get("reset");
  if (verify || reset) {
    window.history.replaceState({}, "", window.location.pathname);
  }
  return { verify, reset };
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [entry, setEntry] = useState(readAuthLink);

  useEffect(() => {
    api
      .me()
      .then((result) => setUser(result.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <Shell>
        <p className="status">Loading…</p>
      </Shell>
    );
  }

  if (!user || entry.verify || entry.reset) {
    return (
      <Auth
        entry={entry}
        onUser={(next) => {
          setEntry({ verify: null, reset: null });
          setUser(next);
        }}
        onClearLink={() => setEntry({ verify: null, reset: null })}
        onPasswordReset={() => {
          setEntry({ verify: null, reset: null });
          setUser(null);
        }}
      />
    );
  }

  return <Home user={user} onUser={setUser} />;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="screen">
      <div className="phone">{children}</div>
    </main>
  );
}

function Brand() {
  return (
    <>
      <div className="spacer" />
      <img className="logo" src="logo_blueorbit.png" alt="" />
      <p className="wordmark">BlueOrbit</p>
    </>
  );
}

function Auth({
  entry,
  onUser,
  onClearLink,
  onPasswordReset,
}: {
  entry: { verify: string | null; reset: string | null };
  onUser: (user: User) => void;
  onClearLink: () => void;
  onPasswordReset: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset" | "sent">(entry.reset ? "reset" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const clearLink = useRef(onClearLink);
  clearLink.current = onClearLink;
  const verifyStarted = useRef(false);

  useEffect(() => {
    if (!entry.verify || verifyStarted.current) {
      return;
    }
    verifyStarted.current = true;
    const token = entry.verify;
    api
      .verifyEmail(token)
      .then(() => {
        setMode("login");
        setNotice("Email verified. You can sign in.");
        clearLink.current();
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "Could not verify the email");
        clearLink.current();
      });
  }, [entry.verify]);

  function showLogin() {
    setMode("login");
    setPassword("");
    setConfirmPassword("");
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if ((mode === "register" || mode === "reset") && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        onUser((await api.login(email, password)).user);
        return;
      }
      if (mode === "register") {
        await api.register(email, password, preferredName);
        setMode("sent");
        setNotice(`We sent a verification link to ${email}. Open it to finish creating your account.`);
        return;
      }
      if (mode === "forgot") {
        const result = await api.forgotPassword(email);
        setNotice(result.message);
        setMode("login");
        return;
      }
      if (mode === "reset" && entry.reset) {
        await api.resetPassword(entry.reset, password);
        setPassword("");
        setConfirmPassword("");
        setNotice("Password updated. Sign in with the new password.");
        setMode("login");
        onPasswordReset();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError("");
    try {
      await api.resendVerification(email);
      setNotice(`We sent another verification link to ${email}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <h1 className="welcome">Welcome to MedsTemp</h1>
      <form className="stack" onSubmit={submit}>
        {mode === "sent" && (
          <>
            <p className="auth-note">{notice}</p>
            <button className="white-btn" type="button" onClick={() => void resend()} disabled={busy}>
              Resend email
            </button>
            <button className="text-btn" type="button" onClick={showLogin}>
              Back to sign in
            </button>
          </>
        )}
        {mode === "forgot" && (
          <>
            <p className="auth-note">Enter your email and we will send a link to reset your password.</p>
            <input
              type="email"
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <button className="white-btn" type="submit" disabled={busy}>
              Send reset link
            </button>
            <button className="text-btn" type="button" onClick={showLogin}>
              Back to sign in
            </button>
          </>
        )}
        {mode === "reset" && (
          <>
            <p className="auth-note">Choose a new password.</p>
            <input
              type="password"
              placeholder="New password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Confirm password"
              autoComplete="new-password"
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
            <button className="white-btn" type="submit" disabled={busy}>
              Save password
            </button>
          </>
        )}
        {(mode === "login" || mode === "register") && (
          <>
            {notice && <p className="auth-note">{notice}</p>}
            {mode === "register" && (
              <input
                placeholder="Preferred name"
                value={preferredName}
                onChange={(event) => setPreferredName(event.target.value)}
                required
              />
            )}
            <input
              type="email"
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {mode === "register" && (
              <input
                type="password"
                placeholder="Confirm password"
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            )}
            <button className="white-btn" type="submit" disabled={busy}>
              {mode === "login" ? "Sign in" : "Create account"}
            </button>
            {mode === "login" ? (
              <div className="auth-links">
                <button
                  className="text-btn"
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setConfirmPassword("");
                    setError("");
                    setNotice("");
                  }}
                >
                  Create an account
                </button>
                <button className="text-btn" type="button" onClick={() => { setMode("forgot"); setError(""); setNotice(""); }}>
                  Forgot password?
                </button>
              </div>
            ) : (
              <button
                className="text-btn"
                type="button"
                onClick={() => {
                  setMode("login");
                  setConfirmPassword("");
                  setError("");
                  setNotice("");
                }}
              >
                Have an account? Sign in
              </button>
            )}
          </>
        )}
        {error && <p className="status error">{error}</p>}
      </form>
      <Brand />
    </Shell>
  );
}

function Home({ user, onUser }: { user: User; onUser: (user: User | null) => void }) {
  const [profile, setProfile] = useState(user);
  const [tagName, setTagName] = useState(user.tagName);
  const [lowText, setLowText] = useState(formatStorage(user.storageLowF, user.useCelsius));
  const [highText, setHighText] = useState(formatStorage(user.storageHighF, user.useCelsius));
  const [reading, setReading] = useState<Reading | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [showLog, setShowLog] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(
    () => !isRangeConfirmed(user.id, user.storageLowF, user.storageHighF),
  );
  const rangeConfirmed = isRangeConfirmed(profile.id, profile.storageLowF, profile.storageHighF);
  const [alert, setAlert] = useState<FiredAlert | null>(null);
  const alertStateRef = useRef<AlertState>(loadAlertState(profile.id, profile.deviceId));
  const alertOpenRef = useRef(false);
  const profileRef = useRef(profile);
  const rangeConfirmedRef = useRef(rangeConfirmed);
  profileRef.current = profile;
  rangeConfirmedRef.current = rangeConfirmed;

  useEffect(() => {
    const open = loadOpenAlert(profile.id, profile.deviceId);
    alertStateRef.current = loadAlertState(profile.id, profile.deviceId);
    alertOpenRef.current = open != null;
    setAlert(open);
  }, [profile.id, profile.deviceId]);

  useEffect(() => {
    const arm = () => {
      if ("Notification" in window && Notification.permission === "default") {
        void Notification.requestPermission();
      }
    };
    window.addEventListener("pointerdown", arm, { once: true });
    return () => window.removeEventListener("pointerdown", arm);
  }, []);

  useEffect(() => {
    if (!alert) {
      return;
    }
    const audio = new Audio(alert.sound);
    void audio.play().catch(() => undefined);
    let note: Notification | null = null;
    if ("Notification" in window && Notification.permission === "granted") {
      note = new Notification(alert.title, {
        body: alert.message,
        tag: "blueorbit-temp-alert",
        requireInteraction: true,
      });
      note.onclick = () => window.focus();
    }
    return () => {
      audio.pause();
      note?.close();
    };
  }, [alert]);

  useEffect(() => {
    if (!profile.deviceId) {
      return;
    }
    let cancelled = false;
    const load = () => {
      api
        .reading()
        .then((next) => {
          if (cancelled) {
            return;
          }
          setReading(next);
          setError("");
          const telemetry = next.telemetry;
          if (!telemetry || alertOpenRef.current) {
            return;
          }
          const currentProfile = profileRef.current;
          const result = evaluateReading(
            alertStateRef.current,
            {
              deviceId: currentProfile.deviceId,
              temperatureFahrenheit: telemetry.temperatureFahrenheit,
              batteryPercentage: telemetry.batteryPercentage,
              storageLowF: currentProfile.storageLowF,
              storageHighF: currentProfile.storageHighF,
              rangeConfirmed: rangeConfirmedRef.current,
            },
            currentProfile.preferredName,
            Date.now(),
          );
          alertStateRef.current = result.state;
          saveAlertState(currentProfile.id, result.state);
          if (result.alert) {
            alertOpenRef.current = true;
            saveOpenAlert(currentProfile.id, result.alert);
            setAlert(result.alert);
          }
        })
        .catch((caught) => {
          if (!cancelled) {
            setError(caught instanceof Error ? caught.message : "Could not load the reading");
          }
        });
    };
    load();
    const timer = window.setInterval(load, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [profile.deviceId]);

  function acknowledgeAlert() {
    const current = profileRef.current;
    const nextState = dismissAlert(alertStateRef.current, Date.now());
    alertStateRef.current = nextState;
    saveAlertState(current.id, nextState);
    saveOpenAlert(current.id, null);
    alertOpenRef.current = false;
    setAlert(null);
  }

  async function persist(next: User, lowF = next.storageLowF, highF = next.storageHighF) {
    if (!(lowF < highF)) {
      setError("Low temperature must be smaller than high");
      return;
    }
    const result = await api.saveProfile({
      preferredName: next.preferredName,
      medicationName: next.medicationName,
      storageLowF: lowF,
      storageHighF: highF,
      useCelsius: next.useCelsius,
    });
    setProfile(result.user);
    onUser(result.user);
    if (!isRangeConfirmed(result.user.id, result.user.storageLowF, result.user.storageHighF)) {
      setConfirmOpen(true);
    }
    setError("");
  }

  function toggleUnit() {
    const useCelsius = !profile.useCelsius;
    const lowF = toFahrenheit(Number(lowText), profile.useCelsius);
    const highF = toFahrenheit(Number(highText), profile.useCelsius);
    setLowText(formatStorage(lowF, useCelsius));
    setHighText(formatStorage(highF, useCelsius));
    const next = { ...profile, useCelsius, storageLowF: lowF, storageHighF: highF };
    setProfile(next);
    persist(next).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not save"));
  }

  async function resolveTag(event: FormEvent) {
    event.preventDefault();
    setError("");
    setStatus("Looking up the tag…");
    try {
      const result = await api.resolveTag(tagName);
      alertStateRef.current = resetAlertState(profile.id, result.user.deviceId);
      alertOpenRef.current = false;
      setAlert(null);
      setProfile(result.user);
      onUser(result.user);
      setStatus("");
    } catch (caught) {
      setStatus("");
      setError(caught instanceof Error ? caught.message : "Could not resolve the tag");
    }
  }

  if (showLog) {
    return (
      <>
        <Log profile={profile} onClose={() => setShowLog(false)} />
        {alert && <TempAlert alert={alert} onOk={acknowledgeAlert} />}
      </>
    );
  }

  if (showTips) {
    return (
      <>
        <Tips onClose={() => setShowTips(false)} />
        {confirmOpen && (
          <RangeConfirm
            lowF={profile.storageLowF}
            highF={profile.storageHighF}
            onUse={() => {
              confirmRange(profile.id, profile.storageLowF, profile.storageHighF);
              setConfirmOpen(false);
              setStatus(`Alerts are on, using ${formatRange(profile.storageLowF, profile.storageHighF)}.`);
            }}
            onEdit={() => {
              setConfirmOpen(false);
              setShowTips(false);
            }}
          />
        )}
      </>
    );
  }

  const telemetry = reading?.telemetry;
  const temperature = telemetry
    ? profile.useCelsius
      ? `Temperature ${telemetry.temperatureCelsius.toFixed(1)}°C`
      : `Temperature ${telemetry.temperatureFahrenheit.toFixed(0)}°F`
    : "Temperature —";
  const updated = reading?.timestampMillis
    ? `Last recorded update: ${new Date(reading.timestampMillis).toLocaleString()}`
    : "Last recorded update: —";

  return (
    <Shell>
      <h1 className="welcome">Welcome to MedsTemp</h1>
      <label className="field-row">
        <span>Preferred name:</span>
        <input
          value={profile.preferredName}
          onChange={(event) => setProfile({ ...profile, preferredName: event.target.value })}
          onBlur={() => {
            persist(profile).catch((caught) =>
              setError(caught instanceof Error ? caught.message : "Could not save"),
            );
          }}
        />
      </label>
      <label className="field-row">
        <span>Medication name:</span>
        <select
          value={profile.medicationName}
          onChange={(event) => {
            const next = { ...profile, medicationName: event.target.value };
            setProfile(next);
            persist(next).catch((caught) =>
              setError(caught instanceof Error ? caught.message : "Could not save"),
            );
          }}
        >
          <option value="">Select</option>
          {MEDICATIONS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <div className="field-row">
        <span>Storage temperature:</span>
        <div className="temp-range">
          <input
            inputMode="decimal"
            value={lowText}
            onChange={(event) => setLowText(event.target.value)}
            onBlur={() => {
              const lowF = toFahrenheit(Number(lowText), profile.useCelsius);
              const highF = toFahrenheit(Number(highText), profile.useCelsius);
              persist(profile, lowF, highF).catch((caught) =>
                setError(caught instanceof Error ? caught.message : "Could not save"),
              );
            }}
          />
          <span>to</span>
          <input
            inputMode="decimal"
            value={highText}
            onChange={(event) => setHighText(event.target.value)}
            onBlur={() => {
              const lowF = toFahrenheit(Number(lowText), profile.useCelsius);
              const highF = toFahrenheit(Number(highText), profile.useCelsius);
              persist(profile, lowF, highF).catch((caught) =>
                setError(caught instanceof Error ? caught.message : "Could not save"),
              );
            }}
          />
          <button className="white-btn unit-btn" type="button" onClick={toggleUnit}>
            {profile.useCelsius ? "°C" : "°F"}
          </button>
        </div>
      </div>
      <div className="field-row">
        <span>Tap to scan the code on the back of your tag:</span>
        <button className="white-btn" type="button" onClick={() => scanTag(setTagName, setStatus)}>
          Scan QR code
        </button>
      </div>
      <form className="field-row" onSubmit={resolveTag}>
        <span>Or enter tag name:</span>
        <input value={tagName} onChange={(event) => setTagName(event.target.value)} />
      </form>
      <p className={error ? "status error" : "status"}>{error || status}</p>
      <section className="reading-card">
        <p>Hi {profile.preferredName},</p>
        <p>BlueOrbit Tag #: {profile.deviceName || profile.tagName || "—"}</p>
        <p>{updated}</p>
        <p className="strong">{temperature}</p>
        {telemetry?.humidityPercent != null && (
          <p className="strong">Humidity: {telemetry.humidityPercent.toFixed(1)}%</p>
        )}
        <p className="strong">
          Battery: {telemetry ? `${telemetry.batteryPercentage.toFixed(0)}%` : "—"}
        </p>
      </section>
      {!rangeConfirmed && (
        <p className="status">Temperature alerts are off until you confirm your storage range.</p>
      )}
      <div className="log-row">
        <button
          className="white-btn"
          type="button"
          onClick={() => {
            if (!profile.deviceId) {
              setError("Link a tag first to view its log.");
              return;
            }
            setShowLog(true);
          }}
        >
          Log
        </button>
        <button className="white-btn" type="button" onClick={() => setShowTips(true)}>
          Tips
        </button>
      </div>
      <Brand />
      <button className="text-btn" type="button" onClick={() => api.logout().finally(() => onUser(null))}>
        Sign out
      </button>
      {alert && <TempAlert alert={alert} onOk={acknowledgeAlert} />}
      {confirmOpen && (
        <RangeConfirm
          lowF={profile.storageLowF}
          highF={profile.storageHighF}
          onUse={() => {
            confirmRange(profile.id, profile.storageLowF, profile.storageHighF);
            setConfirmOpen(false);
            setStatus(`Alerts are on, using ${formatRange(profile.storageLowF, profile.storageHighF)}.`);
          }}
          onEdit={() => setConfirmOpen(false)}
        />
      )}
    </Shell>
  );
}

function RangeConfirm({
  lowF,
  highF,
  onUse,
  onEdit,
}: {
  lowF: number;
  highF: number;
  onUse: () => void;
  onEdit: () => void;
}) {
  const range = formatRange(lowF, highF);
  return (
    <div className="alert-backdrop" role="dialog" aria-modal="true" aria-labelledby="range-title">
      <div className="alert-card">
        <h2 id="range-title">Check your storage range</h2>
        <p>{`This app is set to alert you when the temperature goes outside ${range}.\n\nThat default suits refrigerated medication. If yours is stored at room temperature, or your product label gives different limits, change the range first.\n\nUntil you confirm, temperature alerts stay off.`}</p>
        <button type="button" onClick={onUse}>
          {`Use ${range}`}
        </button>
        <button className="alert-secondary" type="button" onClick={onEdit}>
          Change range
        </button>
      </div>
    </div>
  );
}

function Tips({ onClose }: { onClose: () => void }) {
  return (
    <main className="log-screen">
      <div className="phone log-phone">
        <div className="log-head">
          <h1>Storage tips</h1>
          <button className="white-btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="log-body tips-body">
          <h2 className="tips-heading">Some important medication storage rules to follow</h2>
          <p className="tips-copy">
            Never allow your medications to freeze. Even when thawed out, most medications become ineffective and
            should be discarded properly.
          </p>
          <p className="tips-copy">
            Refrigerated medications should be kept in the middle of the refrigerator — not on the back wall, to keep
            them from freezing, and not on the refrigerator door, to keep them from fluctuating temperatures.
          </p>
          <p className="tips-copy">
            Once brought to room temperature, many medications cannot be returned to the fridge to reset the clock.
          </p>
          <p className="tips-copy">
            Try to keep your medications in the original package (box) to minimise exposure to light.
          </p>
          <p className="tips-copy">
            Three of the most common enemies of safe medication storage are temperature, humidity and light.
          </p>
          <h2 className="tips-heading">Proper humidity storage guidelines</h2>
          <p className="tips-copy">To keep medications within the safe range below 60% relative humidity:</p>
          <ol className="tips-list">
            <li>Avoid the bathroom medicine cabinet. Bathrooms frequently reach 80–100% RH during hot showers.</li>
            <li>
              Keep desiccants in the bottle. Leave small silica gel packets inside original containers until the
              medication is finished.
            </li>
            <li>
              Store in cool, dry places. A bedroom closet or kitchen pantry away from appliances, heat and sinks
              provides a stable ambient environment.
            </li>
          </ol>
          <h2 className="tips-heading">About this guidance</h2>
          <p className="tips-copy">
            This is general information. The instructions supplied with your medication, and its packaging label,
            always take precedence over anything shown here.
          </p>
        </div>
      </div>
    </main>
  );
}

function TempAlert({ alert, onOk }: { alert: FiredAlert; onOk: () => void }) {
  return (
    <div className="alert-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="alert-title">
      <div className="alert-card">
        <h2 id="alert-title">{alert.title}</h2>
        <p>{alert.message}</p>
        <button type="button" onClick={onOk}>
          OK
        </button>
      </div>
    </div>
  );
}

function Log({ profile, onClose }: { profile: User; onClose: () => void }) {
  const [points, setPoints] = useState<HistoryPoint[] | null>(null);
  const [error, setError] = useState("");
  const [chart, setChart] = useState(false);

  useEffect(() => {
    api
      .history()
      .then((result) => setPoints(result.points))
      .catch((caught) => {
        setPoints([]);
        setError(caught instanceof Error ? caught.message : "Could not load logs");
      });
  }, []);

  const tag = profile.deviceName || profile.tagName;

  async function share() {
    const text = [
      `MedsTemp readings — ${tag}`,
      ...(points ?? []).map((point) => {
        const temp = profile.useCelsius
          ? `${(((point.temperatureFahrenheit - 32) * 5) / 9).toFixed(1)}°C`
          : `${point.temperatureFahrenheit.toFixed(1)}°F`;
        const humidity = point.humidityPercent == null ? "" : ` ${point.humidityPercent.toFixed(1)}%`;
        return `${new Date(point.timestampMillis).toLocaleString()} ${temp}${humidity} ${point.level}`;
      }),
    ].join("\n");
    if (navigator.share) {
      await navigator.share({ title: "Share readings", text }).catch(() => undefined);
      return;
    }
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "medstemp-readings.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="log-screen">
      <div className="phone log-phone">
        <div className="log-head">
          <h1>Temperature log</h1>
          <button className="white-btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="log-body">
        <p className="status">
          Readings for tag {tag}. An entry is recorded whenever the temperature goes outside your set range.
        </p>
        {error && <p className="status error">{error}</p>}
        {points == null && <p className="log-empty">Loading the last 7 days of readings…</p>}
        {points?.length === 0 && !error && (
          <p className="log-empty">
            No out-of-range readings recorded. Your medication has stayed within your set range, so there is nothing
            to chart yet.
          </p>
        )}
        {points && points.length > 0 && chart && (
          <TempChart points={points} lowF={profile.storageLowF} highF={profile.storageHighF} celsius={profile.useCelsius} />
        )}
        {points && points.length > 0 && !chart && (
          <table className="log-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Temperature</th>
                <th>Humidity</th>
                <th>Temperature Status</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.timestampMillis}>
                  <td>{new Date(point.timestampMillis).toLocaleString()}</td>
                  <td>
                    {profile.useCelsius
                      ? `${(((point.temperatureFahrenheit - 32) * 5) / 9).toFixed(1)} °C`
                      : `${point.temperatureFahrenheit.toFixed(1)} °F`}
                  </td>
                  <td>{point.humidityPercent == null ? "—" : `${point.humidityPercent.toFixed(1)}%`}</td>
                  <td>{point.level}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </div>
        <div className="log-actions">
          <button className="white-btn" type="button" onClick={() => setChart((value) => !value)} disabled={!points?.length}>
            {chart ? "Table" : "Chart"}
          </button>
          <button className="white-btn" type="button" onClick={() => void share()} disabled={!points?.length}>
            Save
          </button>
        </div>
      </div>
    </main>
  );
}

const CHART_WIDTH = 440;
const CHART_HEIGHT = 280;
const CHART_LEFT = 46;
const CHART_RIGHT = 40;
const CHART_TOP = 22;
const CHART_BOTTOM = 36;
const CHART_PLOT_RIGHT = CHART_WIDTH - CHART_RIGHT;
const CHART_PLOT_BOTTOM = CHART_HEIGHT - CHART_BOTTOM;
const CHART_PLOT_WIDTH = CHART_PLOT_RIGHT - CHART_LEFT;
const CHART_PLOT_HEIGHT = CHART_PLOT_BOTTOM - CHART_TOP;
const MIN_SCALE = 1;
const MAX_SCALE = 20;

type ChartView = { scale: number; centerX: number; centerY: number };
type ChartBase = {
  minTs: number;
  maxTs: number;
  tempMin: number;
  tempMax: number;
  humMin: number;
  humMax: number;
};

function TempChart({
  points,
  lowF,
  highF,
  celsius,
}: {
  points: HistoryPoint[];
  lowF: number;
  highF: number;
  celsius: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const guideRef = useRef<SVGGElement>(null);
  const viewRef = useRef<ChartView>({ scale: 1, centerX: 0.5, centerY: 0.5 });
  const frameRef = useRef(0);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [view, setView] = useState<ChartView>(viewRef.current);
  const [dragging, setDragging] = useState(false);

  const ordered = [...points].sort((left, right) => left.timestampMillis - right.timestampMillis);
  const displayTemp = (fahrenheit: number) => (celsius ? ((fahrenheit - 32) * 5) / 9 : fahrenheit);
  const temps = ordered.map((point) => displayTemp(point.temperatureFahrenheit));
  const humidities = ordered.map((point) => point.humidityPercent).filter((value): value is number => value != null);
  const low = displayTemp(lowF);
  const high = displayTemp(highF);
  const firstTime = ordered[0]?.timestampMillis ?? 0;
  const lastTime = ordered[ordered.length - 1]?.timestampMillis ?? firstTime;
  const base: ChartBase = {
    minTs: firstTime,
    maxTs: Math.max(lastTime, firstTime + 60_000),
    tempMin: (temps.length ? Math.min(low, ...temps) : low) - 2,
    tempMax: (temps.length ? Math.max(high, ...temps) : high) + 2,
    humMin: humidities.length > 0 ? Math.min(0, ...humidities) : 0,
    humMax: humidities.length > 0 ? Math.max(100, ...humidities) : 100,
  };
  const modelRef = useRef({ base, ordered, celsius });
  modelRef.current = { base, ordered, celsius };
  const rangeKey = `${base.minTs}:${base.maxTs}:${ordered.length}`;

  function publish(next: ChartView) {
    viewRef.current = next;
    if (frameRef.current) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      setView(viewRef.current);
    });
  }

  useEffect(() => {
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }
    const next = { scale: 1, centerX: 0.5, centerY: 0.5 };
    viewRef.current = next;
    setView(next);
  }, [rangeKey]);

  useEffect(() => {
    return () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const windowView = visibleWindow(view, base);
  const unit = celsius ? "°C" : "°F";
  const xAt = (timestamp: number) =>
    CHART_LEFT + ((timestamp - windowView.minTs) / Math.max(1, windowView.maxTs - windowView.minTs)) * CHART_PLOT_WIDTH;
  const yTemp = (temp: number) =>
    CHART_PLOT_BOTTOM -
    ((temp - windowView.tempMin) / Math.max(1e-6, windowView.tempMax - windowView.tempMin)) * CHART_PLOT_HEIGHT;
  const yHumidity = (humidity: number) =>
    CHART_PLOT_BOTTOM -
    ((humidity - windowView.humMin) / Math.max(1e-6, windowView.humMax - windowView.humMin)) * CHART_PLOT_HEIGHT;
  const drawn = pointsInView(ordered, windowView.minTs, windowView.maxTs);
  const tempSpan = windowView.tempMax - windowView.tempMin;
  const humiditySpan = windowView.humMax - windowView.humMin;
  const clampCurveY = (y: number) => clamp(y, CHART_TOP - 48, CHART_PLOT_BOTTOM + 48);
  const tempPath = smoothPath(
    drawn.map((point) => ({
      x: xAt(point.timestampMillis),
      y: clampCurveY(yTemp(displayTemp(point.temperatureFahrenheit))),
    })),
  );
  const humidityPath = smoothPath(
    drawn
      .filter((point) => point.humidityPercent != null)
      .map((point) => ({ x: xAt(point.timestampMillis), y: clampCurveY(yHumidity(point.humidityPercent ?? 0)) })),
  );
  const yTicks = Array.from({ length: 6 }, (_, index) => index / 5);
  const xTicks = axisMarks(windowView.minTs, windowView.maxTs);

  function focusAt(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0.5, y: 0.5 };
    const sx = ((clientX - rect.left) / rect.width) * CHART_WIDTH;
    const sy = ((clientY - rect.top) / rect.height) * CHART_HEIGHT;
    return {
      x: clamp01((sx - CHART_LEFT) / CHART_PLOT_WIDTH),
      y: clamp01((CHART_PLOT_BOTTOM - sy) / CHART_PLOT_HEIGHT),
    };
  }

  function showGuide(clientX: number) {
    const layer = guideRef.current;
    const svg = svgRef.current;
    if (!layer || !svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return;
    const sx = ((clientX - rect.left) / rect.width) * CHART_WIDTH;
    if (sx < CHART_LEFT || sx > CHART_PLOT_RIGHT) {
      layer.setAttribute("opacity", "0");
      return;
    }
    const current = visibleWindow(viewRef.current, modelRef.current.base);
    const timestamp =
      current.minTs + ((sx - CHART_LEFT) / CHART_PLOT_WIDTH) * Math.max(1, current.maxTs - current.minTs);
    const nearest = nearestPoint(modelRef.current.ordered, timestamp);
    if (!nearest) {
      layer.setAttribute("opacity", "0");
      return;
    }
    const x = CHART_LEFT + ((nearest.timestampMillis - current.minTs) / Math.max(1, current.maxTs - current.minTs)) * CHART_PLOT_WIDTH;
    const line = layer.querySelector("line");
    const text = layer.querySelector("text");
    line?.setAttribute("x1", String(x));
    line?.setAttribute("x2", String(x));
    line?.setAttribute("y1", String(CHART_TOP));
    line?.setAttribute("y2", String(CHART_PLOT_BOTTOM));
    if (text) {
      const temp = displayTemp(nearest.temperatureFahrenheit);
      const humidity = nearest.humidityPercent == null ? "" : `  ${nearest.humidityPercent.toFixed(1)}%`;
      text.textContent = `${formatGuideTime(nearest.timestampMillis)}  ${temp.toFixed(1)}${unit}${humidity}`;
      const anchorRight = x > CHART_LEFT + CHART_PLOT_WIDTH * 0.62;
      text.setAttribute("x", String(anchorRight ? x - 6 : x + 6));
      text.setAttribute("y", String(CHART_TOP + 14));
      text.setAttribute("text-anchor", anchorRight ? "end" : "start");
    }
    layer.setAttribute("opacity", "1");
  }

  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const sx = ((event.clientX - rect.left) / rect.width) * CHART_WIDTH;
      const sy = ((event.clientY - rect.top) / rect.height) * CHART_HEIGHT;
      const focusX = clamp01((sx - CHART_LEFT) / CHART_PLOT_WIDTH);
      const focusY = clamp01((CHART_PLOT_BOTTOM - sy) / CHART_PLOT_HEIGHT);
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const factor = Math.exp(-delta * 0.0015);
      publish(zoomAt(viewRef.current, factor, focusX, focusY, modelRef.current.base));
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      guideRef.current?.setAttribute("opacity", "0");
      setDragging(true);
      try {
        node.setPointerCapture(event.pointerId);
      } catch {
        // The pointer is already tracked if the browser cannot capture it.
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        showGuide(event.clientX);
        return;
      }
      const rect = node.getBoundingClientRect();
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      publish(
        panBy(
          viewRef.current,
          dx,
          dy,
          (CHART_PLOT_WIDTH / CHART_WIDTH) * rect.width,
          (CHART_PLOT_HEIGHT / CHART_HEIGHT) * rect.height,
          modelRef.current.base,
        ),
      );
    };
    const endDrag = (event: PointerEvent) => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setDragging(false);
    };
    const onLeave = () => {
      if (!dragRef.current) guideRef.current?.setAttribute("opacity", "0");
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    node.addEventListener("pointerdown", onPointerDown);
    node.addEventListener("pointermove", onPointerMove);
    node.addEventListener("pointerup", endDrag);
    node.addEventListener("pointercancel", endDrag);
    node.addEventListener("pointerleave", onLeave);
    return () => {
      node.removeEventListener("wheel", onWheel);
      node.removeEventListener("pointerdown", onPointerDown);
      node.removeEventListener("pointermove", onPointerMove);
      node.removeEventListener("pointerup", endDrag);
      node.removeEventListener("pointercancel", endDrag);
      node.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <section className="chart-panel">
      <svg
        ref={svgRef}
        className={dragging ? "temp-chart dragging" : "temp-chart"}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label="Temperature chart. Scroll to zoom. Drag to move."
        onDoubleClick={(event) => {
          if (viewRef.current.scale > 1.05) {
            publish({ scale: 1, centerX: 0.5, centerY: 0.5 });
            return;
          }
          const focus = focusAt(event.clientX, event.clientY);
          publish(zoomAt(viewRef.current, 1.35 * 1.35, focus.x, focus.y, modelRef.current.base));
        }}
      >
        <defs>
          <clipPath id="temp-chart-plot">
            <rect x={CHART_LEFT} y={CHART_TOP} width={CHART_PLOT_WIDTH} height={CHART_PLOT_HEIGHT} />
          </clipPath>
        </defs>
        <g clipPath="url(#temp-chart-plot)">
          <rect
            className="safety"
            x={CHART_LEFT}
            y={Math.min(yTemp(high), yTemp(low))}
            width={CHART_PLOT_WIDTH}
            height={Math.max(0, Math.abs(yTemp(low) - yTemp(high)))}
          />
          {humidityPath && <path className="hum-line" d={humidityPath} />}
          {tempPath && <path className="temp-line" d={tempPath} />}
        </g>
        {yTicks.map((fraction) => {
          const y = CHART_PLOT_BOTTOM - fraction * CHART_PLOT_HEIGHT;
          const temp = windowView.tempMin + fraction * tempSpan;
          const humidity = windowView.humMin + fraction * humiditySpan;
          return (
            <g key={`y-${fraction}`}>
              <line className="grid" x1={CHART_LEFT} x2={CHART_PLOT_RIGHT} y1={y} y2={y} />
              <text className="tick tick-temp" x={CHART_LEFT - 6} y={y + 3} textAnchor="end">
                {formatTick(temp, tempSpan)}
              </text>
              <text className="tick tick-hum" x={CHART_PLOT_RIGHT + 6} y={y + 3} textAnchor="start">
                {formatTick(humidity, humiditySpan)}
              </text>
            </g>
          );
        })}
        {xTicks.map((mark) => {
          const x = xAt(mark.time);
          return (
            <g key={`x-${mark.time}`}>
              <line className="grid" x1={x} x2={x} y1={CHART_TOP} y2={CHART_PLOT_BOTTOM} />
              <text className="tick" x={x} y={CHART_PLOT_BOTTOM + 16} textAnchor="middle">
                {mark.label}
              </text>
            </g>
          );
        })}
        <rect className="axis" x={CHART_LEFT} y={CHART_TOP} width={CHART_PLOT_WIDTH} height={CHART_PLOT_HEIGHT} />
        <text className="tick tick-temp" x={CHART_LEFT} y={12} textAnchor="start">
          {unit}
        </text>
        <text className="tick tick-hum" x={CHART_PLOT_RIGHT} y={12} textAnchor="end">
          %
        </text>
        <g ref={guideRef} opacity={0}>
          <line className="guide" />
          <text className="guide-label" />
        </g>
      </svg>
      <div className="chart-zoom">
        <button type="button" onClick={() => publish(zoomAt(viewRef.current, 1.35, 0.5, 0.5, modelRef.current.base))}>
          +
        </button>
        <button type="button" onClick={() => publish(zoomAt(viewRef.current, 1 / 1.35, 0.5, 0.5, modelRef.current.base))}>
          −
        </button>
        <button type="button" onClick={() => publish({ scale: 1, centerX: 0.5, centerY: 0.5 })}>
          Reset
        </button>
      </div>
      <p className="chart-hint">Scroll to zoom. Drag to move.</p>
    </section>
  );
}

function visibleWindow(view: ChartView, base: ChartBase) {
  const half = 0.5 / Math.max(view.scale, MIN_SCALE);
  const x0 = clamp01(view.centerX - half);
  const x1 = clamp01(view.centerX + half);
  const y0 = clamp01(view.centerY - half);
  const y1 = clamp01(view.centerY + half);
  const minTs = base.minTs + x0 * (base.maxTs - base.minTs);
  const maxTs = Math.max(minTs + 1, base.minTs + x1 * (base.maxTs - base.minTs));
  return {
    minTs,
    maxTs,
    tempMin: base.tempMin + y0 * (base.tempMax - base.tempMin),
    tempMax: base.tempMin + y1 * (base.tempMax - base.tempMin),
    humMin: base.humMin + y0 * (base.humMax - base.humMin),
    humMax: base.humMin + y1 * (base.humMax - base.humMin),
  };
}

function zoomAt(view: ChartView, factor: number, focusX: number, focusY: number, base: ChartBase): ChartView {
  const scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
  if (Math.abs(scale - view.scale) < 0.001) return view;
  const oldView = visibleWindow(view, base);
  const focusTs = oldView.minTs + focusX * (oldView.maxTs - oldView.minTs);
  const focusTemp = oldView.tempMin + focusY * (oldView.tempMax - oldView.tempMin);
  const nextView = visibleWindow({ ...view, scale }, base);
  const spanTs = nextView.maxTs - nextView.minTs;
  const spanTemp = nextView.tempMax - nextView.tempMin;
  const desiredMinTs = focusTs - focusX * spanTs;
  const desiredMinTemp = focusTemp - focusY * spanTemp;
  return clampView({
    scale,
    centerX: (desiredMinTs + spanTs * 0.5 - base.minTs) / Math.max(1, base.maxTs - base.minTs),
    centerY: (desiredMinTemp + spanTemp * 0.5 - base.tempMin) / Math.max(1e-6, base.tempMax - base.tempMin),
  });
}

function panBy(view: ChartView, dx: number, dy: number, plotPxW: number, plotPxH: number, base: ChartBase): ChartView {
  if (view.scale <= MIN_SCALE + 0.01 || plotPxW <= 0 || plotPxH <= 0) return view;
  const current = visibleWindow(view, base);
  const baseSpanTs = Math.max(1, base.maxTs - base.minTs);
  const baseSpanTemp = Math.max(1e-6, base.tempMax - base.tempMin);
  return clampView({
    scale: view.scale,
    centerX: view.centerX + (-dx / plotPxW) * ((current.maxTs - current.minTs) / baseSpanTs),
    centerY: view.centerY + (dy / plotPxH) * ((current.tempMax - current.tempMin) / baseSpanTemp),
  });
}

function clampView(view: ChartView): ChartView {
  if (view.scale <= MIN_SCALE + 0.001) {
    return { scale: MIN_SCALE, centerX: 0.5, centerY: 0.5 };
  }
  const half = 0.5 / view.scale;
  return {
    scale: view.scale,
    centerX: clamp(view.centerX, half, 1 - half),
    centerY: clamp(view.centerY, half, 1 - half),
  };
}

function pointsInView(points: HistoryPoint[], minTs: number, maxTs: number): HistoryPoint[] {
  let start = 0;
  while (start < points.length && points[start].timestampMillis < minTs) start += 1;
  let end = start;
  while (end < points.length && points[end].timestampMillis <= maxTs) end += 1;
  return points.slice(Math.max(0, start - 1), Math.min(points.length, end + 1));
}

function nearestPoint(points: HistoryPoint[], timestamp: number): HistoryPoint | null {
  if (points.length === 0) return null;
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid].timestampMillis < timestamp) low = mid + 1;
    else high = mid;
  }
  const next = points[low];
  const prev = points[Math.max(0, low - 1)];
  return Math.abs(next.timestampMillis - timestamp) < Math.abs(prev.timestampMillis - timestamp) ? next : prev;
}

function smoothPath(coords: Array<{ x: number; y: number }>): string {
  if (coords.length === 0) return "";
  if (coords.length === 1) return `M ${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)}`;
  let path = `M ${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)}`;
  for (let index = 0; index < coords.length - 1; index += 1) {
    const previous = coords[Math.max(0, index - 1)];
    const current = coords[index];
    const next = coords[index + 1];
    const after = coords[Math.min(coords.length - 1, index + 2)];
    const c1x = current.x + (next.x - previous.x) / 6;
    const c1y = current.y + (next.y - previous.y) / 6;
    const c2x = next.x - (after.x - current.x) / 6;
    const c2y = next.y - (after.y - current.y) / 6;
    path += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
  }
  return path;
}

function formatTick(value: number, span: number): string {
  if (span < 8) return (Math.round(value * 10) / 10).toFixed(1);
  return String(Math.round(value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function axisMarks(minTime: number, maxTime: number): { time: number; label: string }[] {
  const span = Math.max(1, maxTime - minTime);
  if (span <= 36 * 60 * 60 * 1000) {
    return Array.from({ length: 6 }, (_, index) => {
      const time = minTime + (index / 5) * span;
      return { time, label: formatAxisTime(time, false) };
    });
  }
  const cursor = new Date(minTime);
  cursor.setHours(0, 0, 0, 0);
  const days: number[] = [];
  for (let time = cursor.getTime(); time <= maxTime; time += 24 * 60 * 60 * 1000) {
    if (time >= minTime) days.push(time);
  }
  if (days.length === 0 || days[0] - minTime > 6 * 60 * 60 * 1000) days.unshift(minTime);
  const endIsSameDay = new Date(days[days.length - 1]).toDateString() === new Date(maxTime).toDateString();
  if (!endIsSameDay && maxTime - days[days.length - 1] > 6 * 60 * 60 * 1000) days.push(maxTime);
  const picked =
    days.length <= 6
      ? days
      : Array.from({ length: 6 }, (_, index) => days[Math.round((index * (days.length - 1)) / 5)]);
  return [...new Set(picked)].map((time) => ({ time, label: formatAxisTime(time, true) }));
}

function formatGuideTime(timestamp: number): string {
  const date = new Date(timestamp);
  const clock = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${date.getMonth() + 1}/${date.getDate()} ${clock}`;
}

function formatAxisTime(timestamp: number, useDays: boolean): string {
  const date = new Date(timestamp);
  if (useDays) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatStorage(fahrenheit: number, celsius: boolean): string {
  const value = celsius ? ((fahrenheit - 32) * 5) / 9 : fahrenheit;
  return String(Math.round(value * 10) / 10);
}

function toFahrenheit(value: number, celsius: boolean): number {
  if (!Number.isFinite(value)) {
    return celsius ? 36 : 36;
  }
  return celsius ? (value * 9) / 5 + 32 : value;
}

async function scanTag(setTagName: (name: string) => void, setStatus: (status: string) => void) {
  const Detector = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  if (!Detector || !navigator.mediaDevices?.getUserMedia) {
    setStatus("Camera QR scan is unavailable in this browser. Type the tag name and press Enter.");
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  const video = document.createElement("video");
  video.srcObject = stream;
  video.playsInline = true;
  await video.play();
  const detector = new Detector({ formats: ["qr_code"] });
  const started = Date.now();
  let found = "";
  while (!found && Date.now() - started < 12000) {
    const codes = await detector.detect(video);
    found = codes[0]?.rawValue?.trim() ?? "";
    if (!found) {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
  }
  stream.getTracks().forEach((track) => track.stop());
  if (!found) {
    setStatus("QR scan cancelled");
    return;
  }
  setTagName(found);
  setStatus(`Tag: ${found}. Press Enter to look it up.`);
}

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};
