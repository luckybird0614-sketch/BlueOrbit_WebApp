export type Telemetry = {
  temperatureFahrenheit: number;
  humidityPercent: number | null;
  batteryPercentage: number;
  batteryVoltage: number;
  mut: boolean;
};

const SUT_BYTES = 4;
const MUT_BYTES = 6;

export function decodePayload(payloadBase64: string): Telemetry | null {
  if (!payloadBase64) {
    return null;
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(payloadBase64, "base64");
  } catch {
    return null;
  }
  if (bytes.length === MUT_BYTES) {
    return decodeMut(bytes);
  }
  if (bytes.length === SUT_BYTES) {
    return decodeSut(bytes);
  }
  return null;
}

function decodeSut(bytes: Buffer): Telemetry {
  const tempRaw = ((bytes[1] & 0xff) << 8) | (bytes[2] & 0xff);
  const temperatureCelsius = -45 + (175 * tempRaw) / 65535;
  const batteryRaw = bytes[3] & 0xff;
  const batteryVoltage = batteryRaw * 0.03125;
  return {
    temperatureFahrenheit: celsiusToFahrenheit(temperatureCelsius),
    humidityPercent: null,
    batteryVoltage,
    batteryPercentage: Math.min(100, (batteryVoltage / 3) * 100),
    mut: false,
  };
}

function decodeMut(bytes: Buffer): Telemetry {
  const tempRaw = ((bytes[1] & 0xff) << 8) | (bytes[2] & 0xff);
  const temperatureCelsius = -45 + (175 * tempRaw) / 65535;
  const humidityRaw = ((bytes[3] & 0xff) << 8) | (bytes[4] & 0xff);
  let humidityPercent = -6 + (125 * humidityRaw) / 65535;
  humidityPercent = Math.min(100, Math.max(0, humidityPercent));
  const batteryRaw = bytes[5] & 0xff;
  const batteryVoltage = batteryRaw / 32;
  return {
    temperatureFahrenheit: celsiusToFahrenheit(temperatureCelsius),
    humidityPercent,
    batteryVoltage,
    batteryPercentage: Math.min(100, (batteryVoltage / 3.3) * 100),
    mut: true,
  };
}

export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

export function fahrenheitToCelsius(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9;
}
