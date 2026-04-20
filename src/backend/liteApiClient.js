import { fetch } from "wix-fetch";
import { getSecret } from "wix-secrets-backend";

const LITE_API_SECRET_NAME = "LITEAPI_KEY";

export async function liteApiRequest(url, options = {}) {
  const apiKey = await getSecret(LITE_API_SECRET_NAME);

  if (!apiKey) {
    throw new Error(
      `Missing secret "${LITE_API_SECRET_NAME}". Add your LiteAPI key to Wix Secrets Manager.`
    );
  }

  const headers = {
    "X-API-Key": apiKey,
    accept: "application/json"
  };

  const requestOptions = {
    method: options.method || "GET",
    headers
  };

  if (options.body) {
    requestOptions.headers["content-type"] = "application/json";
    requestOptions.body = JSON.stringify(options.body);
  }

  return fetch(url, requestOptions);
}

export async function getLiteApiPaymentEnvironment() {
  const apiKey = await getSecret(LITE_API_SECRET_NAME);
  const normalizedKey = String(apiKey || "").trim().toLowerCase();

  if (
    normalizedKey.startsWith("sandbox_") ||
    normalizedKey.startsWith("sand_")
  ) {
    return "sandbox";
  }

  return "live";
}

export async function parseJson(response) {
  return await response.json();
}

export function buildLiteApiError(json, fallbackMessage) {
  const message =
    json?.error?.message ||
    json?.error?.description ||
    fallbackMessage ||
    "LiteAPI request failed.";

  const error = new Error(message);
  error.details = json;
  return error;
}