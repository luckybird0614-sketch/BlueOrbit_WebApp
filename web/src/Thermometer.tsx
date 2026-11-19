import { useEffect, useId, useRef, useState } from "react";

// Frames of empty_mercury_anim.gif and full_mercury_anim.gif, with the black backdrop removed.
const EMPTY_FRAMES = Array.from({ length: 9 }, (_, index) => `/thermometer/empty/${String(index).padStart(2, "0")}.png`);
const FULL_FRAMES = Array.from({ length: 9 }, (_, index) => `/thermometer/full/${String(index).padStart(2, "0")}.png`);

const IMAGE_W = 613;
const IMAGE_H = 1024;
const SCALE_TOP = 98;
const SCALE_BOTTOM = 864;
const TUBE_X = 281;
const TUBE_W = 51;
const BULB_CX = 306.5;
const BULB_CY = 932;
const BULB_R = 50;
const PAINT_BOTTOM = BULB_CY + BULB_R;
const YELLOW = "#f5c400";
const GREEN = "#24b948";

export function Thermometer({
  temperatureC,
  minC,
  maxC,
  safeLowC,
  safeHighC,
  useCelsius,
}: {
  temperatureC: number | null;
  minC: number;
  maxC: number;
  safeLowC: number;
  safeHighC: number;
  useCelsius: boolean;
}) {
  const rawId = useId().replace(/:/g, "");
  const span = maxC - minC;
  const readable = Number.isFinite(temperatureC ?? NaN);
  const tempC = readable ? (temperatureC as number) : null;
  const displayC = useAnimatedNumber(tempC);
  const motionC = displayC ?? tempC;
  const mode =
    motionC == null || !(span > 0)
      ? "idle"
      : motionC <= minC
        ? "empty"
        : motionC >= maxC
          ? "full"
          : "level";
  const unit = useCelsius ? "°C" : "°F";
  const shown = tempC == null ? null : toDisplay(tempC, useCelsius);
  const label =
    shown == null
      ? "Thermometer, no temperature reading yet"
      : mode === "empty"
        ? `Thermometer at or below the scale minimum, ${formatNumber(shown)}${unit}`
        : mode === "full"
          ? `Thermometer at or above the scale maximum, ${formatNumber(shown)}${unit}`
          : `Thermometer reading ${formatNumber(shown)}${unit}`;

  return (
    <div className="thermometer" role="img" aria-label={label}>
      {mode === "empty" && <MercuryFilm frames={EMPTY_FRAMES} delay={130} />}
      {mode === "full" && <MercuryFilm frames={FULL_FRAMES} delay={160} />}
      {mode !== "empty" && mode !== "full" && (
        <>
          <img className="thermo-media" src="/thermometer_back.png" alt="" />
          {span > 0 && (
            <svg className="thermo-svg" viewBox={`0 0 ${IMAGE_W} ${IMAGE_H}`} aria-hidden="true">
              {mode === "level" && motionC != null && tempC != null && (
                <Mercury
                  id={rawId}
                  tempC={motionC}
                  minC={minC}
                  maxC={maxC}
                  color={inSafety(tempC, safeLowC, safeHighC) ? GREEN : YELLOW}
                />
              )}
              <ScaleLabels minC={minC} maxC={maxC} safeLowC={safeLowC} safeHighC={safeHighC} />
            </svg>
          )}
        </>
      )}
    </div>
  );
}

function useAnimatedNumber(target: number | null): number | null {
  const valueRef = useRef(target);
  const [value, setValue] = useState(target);
  useEffect(() => {
    if (target == null || !Number.isFinite(target)) {
      valueRef.current = null;
      setValue(null);
      return;
    }
    const from = valueRef.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (from == null || reduceMotion || Math.abs(from - target) < 0.05) {
      valueRef.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const duration = Math.min(1000, Math.max(450, Math.abs(target - from) * 60));
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      const next = t === 1 ? target : from + (target - from) * eased;
      valueRef.current = next;
      setValue(next);
      if (t < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

function MercuryFilm({ frames, delay }: { frames: string[]; delay: number }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    for (const src of frames) {
      const image = new Image();
      image.src = src;
    }
    const last = frames.length - 1;
    if (last <= 0) return;
    const timer = window.setInterval(() => {
      setFrame((current) => {
        if (current >= last) {
          window.clearInterval(timer);
          return last;
        }
        return current + 1;
      });
    }, delay);
    return () => window.clearInterval(timer);
  }, [frames, delay]);
  return <img className="thermo-media" src={frames[frame]} alt="" />;
}

function Mercury({
  id,
  tempC,
  minC,
  maxC,
  color,
}: {
  id: string;
  tempC: number;
  minC: number;
  maxC: number;
  color: string;
}) {
  const levelY = yFor(tempC, minC, maxC);
  const boreId = `${id}-bore`;
  return (
    <>
      <defs>
        <clipPath id={boreId} clipPathUnits="userSpaceOnUse">
          <circle cx={BULB_CX} cy={BULB_CY} r={BULB_R} />
          <rect x={TUBE_X} y={levelY} width={TUBE_W} height={PAINT_BOTTOM - levelY} />
          <ellipse cx={BULB_CX} cy={levelY} rx={TUBE_W / 2} ry={12} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${boreId})`}>
        <rect x="250" y={levelY - 14} width="120" height={PAINT_BOTTOM - levelY + 20} fill={color} />
        <rect x="294" y={levelY - 8} width="7" height={PAINT_BOTTOM - levelY + 8} fill="rgba(255,255,255,0.34)" />
      </g>
    </>
  );
}

function ScaleLabels({
  minC,
  maxC,
  safeLowC,
  safeHighC,
}: {
  minC: number;
  maxC: number;
  safeLowC: number;
  safeHighC: number;
}) {
  const marks = scaleMarks(minC, maxC, safeLowC, safeHighC);
  const rows = marks.map((mark) => ({ ...mark, y: yFor(mark.celsius, minC, maxC) }));
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index - 1].y - rows[index].y < 46) {
      const mid = (rows[index - 1].y + rows[index].y) / 2;
      rows[index - 1].y = mid + 23;
      rows[index].y = mid - 23;
    }
  }

  return (
    <g className="thermo-labels">
      <text className="thermo-unit thermo-c" x="114" y="58">
        °C
      </text>
      <text className="thermo-unit thermo-f" x="498" y="58">
        °F
      </text>
      {rows.map((mark) => {
        const tone = mark.safety ? "thermo-safe" : "thermo-tick";
        return (
          <g key={mark.celsius}>
            <text className={`${tone} thermo-c`} x="114" y={mark.y}>
              {formatNumber(mark.celsius)}°
            </text>
            <text className={`${tone} thermo-f`} x="498" y={mark.y}>
              {formatFahrenheit(mark.celsius)}°
            </text>
          </g>
        );
      })}
    </g>
  );
}

function inSafety(tempC: number, safeLowC: number, safeHighC: number): boolean {
  const low = Math.min(safeLowC, safeHighC);
  const high = Math.max(safeLowC, safeHighC);
  return tempC >= low && tempC <= high;
}

function scaleMarks(
  minC: number,
  maxC: number,
  safeLowC: number,
  safeHighC: number,
): Array<{ celsius: number; safety: boolean }> {
  const span = maxC - minC;
  const marks = scaleTicks(minC, maxC).map((celsius) => ({ celsius, safety: false }));
  for (const safe of [safeLowC, safeHighC]) {
    if (!(safe >= minC - 1e-6 && safe <= maxC + 1e-6)) continue;
    const nearest = marks.reduce((best, mark) =>
      Math.abs(mark.celsius - safe) < Math.abs(best.celsius - safe) ? mark : best,
    );
    const near = nearest && Math.abs(nearest.celsius - safe) <= Math.max(span * 0.045, 0.2);
    const endpoint = nearest.celsius === minC || nearest.celsius === maxC;
    if (near && (!endpoint || Math.abs(nearest.celsius - safe) < 0.05)) {
      nearest.safety = true;
    } else {
      marks.push({ celsius: safe, safety: true });
    }
  }
  marks.sort((a, b) => a.celsius - b.celsius);
  return marks;
}

function yFor(tempC: number, minC: number, maxC: number): number {
  const fraction = (Math.min(maxC, Math.max(minC, tempC)) - minC) / (maxC - minC);
  return SCALE_BOTTOM - fraction * (SCALE_BOTTOM - SCALE_TOP);
}

function scaleTicks(min: number, max: number): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / pow;
  const step = normalized <= 1.5 ? pow : normalized <= 3.5 ? 2 * pow : normalized <= 7.5 ? 5 * pow : 10 * pow;
  const values = [min];
  if (step > 0) {
    let value = Math.ceil((min + step * 0.35) / step) * step;
    for (let guard = 0; guard < 12 && value < max - step * 0.35; guard += 1) {
      values.push(Math.round(value * 1000) / 1000);
      value += step;
    }
  }
  values.push(max);
  return values;
}

function toDisplay(celsius: number, useCelsius: boolean): number {
  return useCelsius ? celsius : celsiusToFahrenheit(celsius);
}

function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

function formatFahrenheit(celsius: number): string {
  return String(Math.round(celsiusToFahrenheit(celsius)));
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Math.abs(rounded - Math.round(rounded)) < 0.05 ? String(Math.round(rounded)) : rounded.toFixed(1);
}
