import http, { type IncomingHttpHeaders } from "node:http";
import https from "node:https";
import type { DeviceStatus } from "./types";

export type BiostarDevice = {
  id: string;
  name: string;
  status: DeviceStatus;
  rawStatus: string | number | boolean | null;
  rawPayload: Record<string, unknown>;
};

export type BiostarDevicesResponse = {
  loginUrl: string;
  devicesUrl: string;
  loginStatus: number;
  devicesStatus: number;
  sessionId: string;
  payload: unknown;
};

type BiostarSession = {
  sessionId: string;
  status: number;
};

const DEFAULT_BASE_URL = "https://devices.tbilisikids.com";
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const insecureHttpsAgent = new https.Agent({
  rejectUnauthorized: false,
  checkServerIdentity: () => undefined,
});
let cachedSession: BiostarSession | null = null;

export function hasBiostarConfig() {
  return Boolean(
    process.env.BIOSTAR2_USERNAME && process.env.BIOSTAR2_PASSWORD,
  );
}

export async function fetchBiostarDevices(): Promise<BiostarDevice[]> {
  const response = await fetchBiostarDevicesResponse();

  return extractDeviceRows(response.payload)
    .map(normalizeBiostarDevice)
    .filter((device): device is BiostarDevice => Boolean(device));
}

export async function fetchBiostarDevicesResponse({
  forceLogin = false,
}: { forceLogin?: boolean } = {}): Promise<BiostarDevicesResponse> {
  const username = process.env.BIOSTAR2_USERNAME;
  const password = process.env.BIOSTAR2_PASSWORD;

  if (!username || !password) {
    throw new Error("BioStar2 credentials are not configured.");
  }

  const loginUrl = getLoginUrl();
  const devicesUrl = getDevicesUrl();
  let loginResponse = await getBiostarSession(
    username,
    password,
    loginUrl,
    forceLogin,
  );
  let devicesResponse = await requestBiostarDevices(
    devicesUrl,
    loginResponse.sessionId,
  ).catch(async () => {
    loginResponse = await getBiostarSession(username, password, loginUrl, true);
    return requestBiostarDevices(devicesUrl, loginResponse.sessionId);
  });

  if (!devicesResponse.ok) {
    loginResponse = await getBiostarSession(username, password, loginUrl, true);
    devicesResponse = await requestBiostarDevices(
      devicesUrl,
      loginResponse.sessionId,
    );
  }

  if (!devicesResponse.ok) {
    throw new Error(
      `BioStar2 devices request failed with status ${devicesResponse.status}.`,
    );
  }

  return {
    loginUrl,
    devicesUrl,
    loginStatus: loginResponse.status,
    devicesStatus: devicesResponse.status,
    sessionId: loginResponse.sessionId,
    payload: parseJson(devicesResponse.body),
  };
}

async function getBiostarSession(
  username: string,
  password: string,
  loginUrl: string,
  forceLogin: boolean,
) {
  if (!forceLogin && cachedSession) {
    return cachedSession;
  }

  cachedSession = await loginToBiostar(username, password, loginUrl);
  return cachedSession;
}

function requestBiostarDevices(devicesUrl: string, sessionId: string) {
  return requestBiostar(devicesUrl, {
    headers: {
      Accept: "application/json",
      "bs-session-id": sessionId,
    },
  });
}

async function loginToBiostar(username: string, password: string, url: string) {
  const response = await requestBiostar(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      User: {
        login_id: username,
        password,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`BioStar2 login failed with status ${response.status}.`);
  }

  const sessionId = readHeader(response.headers, "bs-session-id");
  if (!sessionId) {
    throw new Error("BioStar2 login did not return bs-session-id.");
  }

  return {
    sessionId,
    status: response.status,
  };
}

function getLoginUrl() {
  return process.env.BIOSTAR2_LOGIN_URL || buildBiostarUrl("/api/login");
}

function getDevicesUrl() {
  return process.env.BIOSTAR2_DEVICES_URL || buildBiostarUrl("/api/devices");
}

function buildBiostarUrl(path: "/api/login" | "/api/devices") {
  const configuredUrl = (process.env.BIOSTAR2_BASE_URL || DEFAULT_BASE_URL)
    .trim()
    .replace(/\/+$/, "");

  if (configuredUrl.endsWith("/api/login")) {
    return path === "/api/login"
      ? configuredUrl
      : configuredUrl.replace(/\/api\/login$/, path);
  }

  if (configuredUrl.endsWith("/api/devices")) {
    return path === "/api/devices"
      ? configuredUrl
      : configuredUrl.replace(/\/api\/devices$/, path);
  }

  return `${configuredUrl}${path}`;
}

function requestBiostar(
  url: string,
  options: {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
  } = {},
) {
  const parsedUrl = new URL(url);
  const client = parsedUrl.protocol === "http:" ? http : https;
  const headers = { ...options.headers };

  if (options.body && !headers["Content-Length"]) {
    headers["Content-Length"] = String(Buffer.byteLength(options.body));
  }

  return new Promise<{
    status: number;
    ok: boolean;
    headers: IncomingHttpHeaders;
    body: string;
  }>((resolve, reject) => {
    const request = client.request(
      parsedUrl,
      {
        method: options.method || "GET",
        headers,
        ...(parsedUrl.protocol === "https:" ? getHttpsRequestOptions() : {}),
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          const status = response.statusCode ?? 0;
          resolve({
            status,
            ok: status >= 200 && status < 300,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    request.setTimeout(getRequestTimeoutMs(), () => {
      request.destroy(
        new Error(`BioStar2 request timed out after ${getRequestTimeoutMs()}ms.`),
      );
    });
    request.on("error", reject);

    if (options.body) {
      request.write(options.body);
    }

    request.end();
  });
}

function getHttpsRequestOptions() {
  const rejectUnauthorized = shouldRejectUnauthorized();

  if (rejectUnauthorized) {
    return {};
  }

  return {
    agent: insecureHttpsAgent,
    rejectUnauthorized: false,
    checkServerIdentity: () => undefined,
  };
}

function getRequestTimeoutMs() {
  const configured = Number(process.env.BIOSTAR2_REQUEST_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_REQUEST_TIMEOUT_MS;
}

function shouldRejectUnauthorized() {
  const configured =
    process.env.BIOSTAR2_TLS_REJECT_UNAUTHORIZED ??
    process.env.NODE_TLS_REJECT_UNAUTHORIZED ??
    "true";

  return !["0", "false", "no"].includes(
    String(configured).trim().toLowerCase(),
  );
}

function readHeader(headers: IncomingHttpHeaders, name: string) {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractDeviceRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  const candidates = [
    payload.DeviceCollection,
    payload.DeviceResponse,
    payload.devices,
    payload.data,
    payload.rows,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }

    if (isRecord(candidate) && Array.isArray(candidate.rows)) {
      return candidate.rows;
    }
  }

  return [];
}

function normalizeBiostarDevice(value: unknown): BiostarDevice | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value, ["id", "device_id", "dev_id"]);
  const name = readString(value, ["name", "device_name", "display_name"]) || id;
  const rawStatus = readStatus(value);

  if (!id || rawStatus === null) {
    return null;
  }

  return {
    id,
    name,
    status: mapBiostarStatus(rawStatus),
    rawStatus,
    rawPayload: value,
  };
}

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = readScalar(record[key]);
    if (value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return "";
}

function readStatus(record: Record<string, unknown>) {
  const direct = readScalar(record.status);
  if (direct !== null) {
    return direct;
  }

  const connection = record.connection;
  if (isRecord(connection)) {
    const connectionStatus = readScalar(connection.status);
    if (connectionStatus !== null) {
      return connectionStatus;
    }
  }

  const device = record.Device;
  if (isRecord(device)) {
    const deviceStatus = readScalar(device.status);
    if (deviceStatus !== null) {
      return deviceStatus;
    }

    const deviceConnection = device.connection;
    if (isRecord(deviceConnection)) {
      return readScalar(deviceConnection.status);
    }
  }

  return null;
}

function readScalar(value: unknown): string | number | boolean | null {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (isRecord(value)) {
    return readScalar(value.id ?? value.value ?? value.status);
  }

  return null;
}

function mapBiostarStatus(value: string | number | boolean): DeviceStatus {
  if (typeof value === "boolean") {
    return value ? "online" : "offline";
  }

  const numericStatus = Number(value);
  if (Number.isFinite(numericStatus)) {
    if (numericStatus === 0) {
      return "offline";
    }

    if (numericStatus === 1) {
      return "online";
    }

    if (numericStatus === 2) {
      return "error";
    }
  }

  const normalized = String(value).trim().toLowerCase();
  if (["online", "connected", "connect"].includes(normalized)) {
    return "online";
  }

  if (["offline", "disconnected", "disconnect"].includes(normalized)) {
    return "offline";
  }

  return "error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
