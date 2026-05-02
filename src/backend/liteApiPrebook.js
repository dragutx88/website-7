import { elevate } from "wix-auth";
import { secrets } from "wix-secrets-backend.v2";
import {
  buildLiteApiError,
  liteApiRequest,
  parseJson
} from "./liteApiClient";

const LITE_BOOK_API_BASE_URL = "https://book.liteapi.travel/v3.0";
const MARKUP_RATE_SECRET_NAME = "MARKUP_RATE";

const getSecretValue = elevate(secrets.getSecretValue);

export async function createPrebookSessionHandler(payload) {
  const offerId = normalizeText(payload?.offerId);
  const usePaymentSdk =
    typeof payload?.usePaymentSdk === "boolean" ? payload.usePaymentSdk : true;

  if (!offerId) {
    throw new Error("offerId is required.");
  }

  const createPrebookResponse = await liteApiRequest(
    `${LITE_BOOK_API_BASE_URL}/rates/prebook`,
    {
      method: "POST",
      body: {
        offerId,
        usePaymentSdk
      }
    }
  );

  const prebookResponse = await parseJson(createPrebookResponse);

  if (!createPrebookResponse.ok) {
    const error = buildLiteApiError(prebookResponse, "Prebook request failed.");
    error.statusCode = createPrebookResponse.status;
    throw error;
  }

  const markupRateSecretValue = await getSecretValue(MARKUP_RATE_SECRET_NAME);
  const markupRateText = normalizeText(markupRateSecretValue?.value);
  const normalizedMarkupRate = Number(markupRateText);

  if (!markupRateText || !Number.isFinite(normalizedMarkupRate)) {
    throw new Error("MARKUP_RATE secret must be a numeric multiplier value.");
  }

  const normalizedPrebook = normalizePrebook(
    prebookResponse,
    normalizedMarkupRate
  );
  const prebookSnapshot = JSON.stringify(prebookResponse);

  return {
    prebookSnapshot,
    normalizedPrebook
  };
}

export async function validatePrebook(prebookId) {
  const normalizedPrebookId = normalizeText(prebookId);

  if (!normalizedPrebookId) {
    throw new Error("prebookId is required.");
  }

  const validatePrebookResponse = await liteApiRequest(
    `${LITE_BOOK_API_BASE_URL}/prebooks/${encodeURIComponent(
      normalizedPrebookId
    )}`,
    {
      method: "GET"
    }
  );

  return validatePrebookResponse.ok;
}

function normalizePrebook(prebookResponse, normalizedMarkupRate) {
  if (!prebookResponse || typeof prebookResponse !== "object") {
    return null;
  }

  const paymentEnvironment = getLiteApiPaymentEnvironmentSafe(prebookResponse);

  const retailRateTotal = Number(
    prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.retailRate?.total?.[0]
      ?.amount
  );

  const suggestedSellingPrice = Number(
    prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.retailRate
      ?.suggestedSellingPrice?.[0]?.amount
  );

  const currency = normalizeText(
    prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.retailRate?.total?.[0]
      ?.currency
  );

  const currentPrice = Number.isFinite(retailRateTotal)
    ? retailRateTotal * normalizedMarkupRate
    : null;

  const beforeCurrentPrice = Number.isFinite(suggestedSellingPrice)
    ? suggestedSellingPrice * normalizedMarkupRate
    : null;

  if (!currency || !Number.isFinite(retailRateTotal)) {
    throw new Error("prebook retailRate.total[0] is required.");
  }

  if (!Number.isFinite(currentPrice)) {
    throw new Error("prebook currentPrice could not be normalized.");
  }

  return {
    prebookId: normalizeText(prebookResponse?.data?.prebookId),
    checkInDate: normalizeText(prebookResponse?.data?.checkin),
    checkOutDate: normalizeText(prebookResponse?.data?.checkout),
    rateName: normalizeText(
      prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.name
    ),
    boardName: normalizeText(
      prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.boardName
    ),
    adultCount: normalizeCount(
      prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.adultCount
    ),
    childCount: normalizeCount(
      prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.childCount
    ),
    childrenAges: normalizeNumberArray(
      prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.childrenAges
    ),
    occupancyNumber: normalizeCount(
      prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.occupancyNumber
    ),
    refundableTag:
      normalizeText(
        prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.cancellationPolicies
          ?.refundableTag
      ) || null,
    currency,
    currentPrice,
    beforeCurrentPrice: Number.isFinite(beforeCurrentPrice)
      ? beforeCurrentPrice
      : null,

    transactionId: normalizeText(prebookResponse?.data?.transactionId),
    secretKey: normalizeText(prebookResponse?.data?.secretKey),
    paymentTypes: Array.isArray(prebookResponse?.data?.paymentTypes)
      ? prebookResponse.data.paymentTypes
      : [],
    paymentEnvironment
  };
}

function getLiteApiPaymentEnvironmentSafe(prebookResponse) {
  const sandbox = prebookResponse?.data?.sandbox;

  if (sandbox === true) {
    return "sandbox";
  }

  if (sandbox === false) {
    return "live";
  }

  return "";
}

function normalizeNumberArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

function normalizeCount(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.floor(parsed));
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
