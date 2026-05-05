import { elevate } from "wix-auth";
import { secrets } from "wix-secrets-backend.v2";
import { buildLiteApiError, liteApiRequest, parseJson } from "./liteApiClient";

const LITE_API_BASE_URL = "https://api.liteapi.travel/v3.0";
const MARKUP_RATE_SECRET_NAME = "MARKUP_RATE";
const DEFAULT_CURRENCY = "TRY";
const DEFAULT_LANGUAGE = "tr";
const DEFAULT_GUEST_NATIONALITY = "TR";

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

const getSecretValue = elevate(secrets.getSecretValue);

export async function getHotelsRatesHandler(searchFlowContextQuery) {
  const validatedHotelsRatesSearchFlowContextQuery =
    validateHotelsRatesSearchFlowContextQuery(searchFlowContextQuery);

  const getHotelsRatesRequest = buildHotelsRatesRequest(
    validatedHotelsRatesSearchFlowContextQuery
  );

  const normalizedMarkupRate = await getMarkupRate();

  const getHotelsRatesResponse = await liteApiRequest(
    `${LITE_API_BASE_URL}/hotels/rates`,
    {
      method: "POST",
      body: getHotelsRatesRequest
    }
  );

  const getHotelsRatesJson = await parseJson(getHotelsRatesResponse);

  if (!getHotelsRatesResponse.ok) {
    throw buildLiteApiError(getHotelsRatesJson, "Hotel rates request failed.");
  }

  return {
    normalizedHotelsRates: normalizeHotelsRates(
      getHotelsRatesJson,
      validatedHotelsRatesSearchFlowContextQuery,
      normalizedMarkupRate
    )
  };
}

async function getMarkupRate() {
  const markupRateSecretValue = await getSecretValue(MARKUP_RATE_SECRET_NAME);

  const normalizedMarkupRate = normalizeNumberOrNull(
    markupRateSecretValue?.value
  );

  if (!Number.isFinite(normalizedMarkupRate)) {
    throw new Error("MARKUP_RATE secret must be a numeric multiplier value.");
  }

  return normalizedMarkupRate;
}

function validateHotelsRatesSearchFlowContextQuery(searchFlowContextQuery) {
  const normalizedMode = normalizeText(searchFlowContextQuery?.mode);
  const normalizedPlaceId = normalizeText(searchFlowContextQuery?.placeId);
  const normalizedAiSearch =
    normalizeText(searchFlowContextQuery?.aiSearch) ||
    normalizeText(searchFlowContextQuery?.message) ||
    normalizeText(searchFlowContextQuery?.query);
  const normalizedCheckin = validateDateText(
    searchFlowContextQuery?.checkin,
    "checkin"
  );
  const normalizedCheckout = validateDateText(
    searchFlowContextQuery?.checkout,
    "checkout"
  );
  const normalizedCurrency =
    normalizeText(searchFlowContextQuery?.currency).toUpperCase() ||
    DEFAULT_CURRENCY;
  const normalizedLanguage =
    normalizeText(searchFlowContextQuery?.language).toLowerCase() ||
    DEFAULT_LANGUAGE;
  const normalizedRooms = normalizePositiveIntegerOrNull(
    searchFlowContextQuery?.rooms
  );

  if (normalizedMode !== "destination" && normalizedMode !== "vibe") {
    throw new Error("Unsupported search mode.");
  }

  if (normalizedMode === "destination" && !normalizedPlaceId) {
    throw new Error("placeId is required for destination mode.");
  }

  if (normalizedMode === "vibe" && !normalizedAiSearch) {
    throw new Error("aiSearch is required for vibe mode.");
  }

  if (getDateUtcTime(normalizedCheckout) <= getDateUtcTime(normalizedCheckin)) {
    throw new Error("checkout must be after checkin.");
  }

  if (!Number.isFinite(normalizedRooms)) {
    throw new Error("rooms is required and must be a positive integer.");
  }

  const normalizedRoomAdultCounts = validateHotelsRatesRoomAdultCounts(
    searchFlowContextQuery?.adults,
    normalizedRooms
  );

  const normalizedRoomChildrenAgesByRoomNumber =
    validateHotelsRatesRoomChildrenAgesByRoomNumber(
      searchFlowContextQuery?.children,
      normalizedRooms
    );

  return {
    mode: normalizedMode,
    placeId: normalizedPlaceId,
    aiSearch: normalizedAiSearch,
    checkin: normalizedCheckin,
    checkout: normalizedCheckout,
    currency: normalizedCurrency,
    language: normalizedLanguage,
    rooms: normalizedRooms,
    roomAdultCounts: normalizedRoomAdultCounts,
    roomChildrenAgesByRoomNumber: normalizedRoomChildrenAgesByRoomNumber
  };
}

function validateHotelsRatesRoomAdultCounts(adults, rooms) {
  const normalizedAdultsText = normalizeText(adults);

  if (!normalizedAdultsText) {
    throw new Error("adults is required.");
  }

  const normalizedRoomAdultCounts = normalizedAdultsText
    .split(",")
    .map((normalizedAdultCountText) =>
      normalizePositiveIntegerOrNull(normalizedAdultCountText)
    );

  if (normalizedRoomAdultCounts.length !== rooms) {
    throw new Error("adults count must match rooms count.");
  }

  if (
    normalizedRoomAdultCounts.some(
      (normalizedRoomAdultCount) => !Number.isFinite(normalizedRoomAdultCount)
    )
  ) {
    throw new Error("adults must contain positive integers only.");
  }

  return normalizedRoomAdultCounts;
}

function validateHotelsRatesRoomChildrenAgesByRoomNumber(children, rooms) {
  const normalizedRoomChildrenAgesByRoomNumber = new Map();
  const normalizedChildrenText = normalizeText(children);

  if (!normalizedChildrenText) {
    return normalizedRoomChildrenAgesByRoomNumber;
  }

  const normalizedChildrenTokens = normalizedChildrenText.split(",");

  for (const normalizedChildrenToken of normalizedChildrenTokens) {
    const normalizedChildrenTokenParts =
      normalizeText(normalizedChildrenToken).split("_");

    if (normalizedChildrenTokenParts.length !== 2) {
      throw new Error("children must contain valid room_age tokens.");
    }

    const [normalizedRoomNumberText, normalizedChildAgeText] =
      normalizedChildrenTokenParts;

    const normalizedRoomNumber = normalizePositiveIntegerOrNull(
      normalizedRoomNumberText
    );
    const normalizedChildAge = normalizeIntegerOrNull(normalizedChildAgeText);

    if (
      !Number.isFinite(normalizedRoomNumber) ||
      normalizedRoomNumber < 1 ||
      normalizedRoomNumber > rooms ||
      !Number.isFinite(normalizedChildAge) ||
      normalizedChildAge < 0
    ) {
      throw new Error("children must contain valid room_age tokens.");
    }

    if (!normalizedRoomChildrenAgesByRoomNumber.has(normalizedRoomNumber)) {
      normalizedRoomChildrenAgesByRoomNumber.set(normalizedRoomNumber, []);
    }

    normalizedRoomChildrenAgesByRoomNumber
      .get(normalizedRoomNumber)
      .push(normalizedChildAge);
  }

  return normalizedRoomChildrenAgesByRoomNumber;
}

function buildHotelsRatesRequest(validatedHotelsRatesSearchFlowContextQuery) {
  const getHotelsRatesRequest = {
    occupancies: buildHotelsRatesRequestOccupancies(
      validatedHotelsRatesSearchFlowContextQuery
    ),
    currency: validatedHotelsRatesSearchFlowContextQuery.currency,
    guestNationality: DEFAULT_GUEST_NATIONALITY,
    checkin: validatedHotelsRatesSearchFlowContextQuery.checkin,
    checkout: validatedHotelsRatesSearchFlowContextQuery.checkout,
    roomMapping: true,
    includeHotelData: true,
    maxRatesPerHotel: 1,
    margin: 0
  };

  if (validatedHotelsRatesSearchFlowContextQuery.mode === "destination") {
    getHotelsRatesRequest.placeId =
      validatedHotelsRatesSearchFlowContextQuery.placeId;
    return getHotelsRatesRequest;
  }

  getHotelsRatesRequest.aiSearch =
    validatedHotelsRatesSearchFlowContextQuery.aiSearch;

  return getHotelsRatesRequest;
}

function buildHotelsRatesRequestOccupancies(
  validatedHotelsRatesSearchFlowContextQuery
) {
  const getHotelsRatesOccupancies = [];

  for (
    let normalizedRoomNumber = 1;
    normalizedRoomNumber <= validatedHotelsRatesSearchFlowContextQuery.rooms;
    normalizedRoomNumber += 1
  ) {
    const normalizedRoomChildrenAges =
      validatedHotelsRatesSearchFlowContextQuery.roomChildrenAgesByRoomNumber.has(
        normalizedRoomNumber
      )
        ? validatedHotelsRatesSearchFlowContextQuery.roomChildrenAgesByRoomNumber.get(
            normalizedRoomNumber
          )
        : [];

    getHotelsRatesOccupancies.push({
      adults:
        validatedHotelsRatesSearchFlowContextQuery.roomAdultCounts[
          normalizedRoomNumber - 1
        ],
      children: normalizedRoomChildrenAges
    });
  }

  return getHotelsRatesOccupancies;
}

function normalizeHotelsRates(
  getHotelsRatesResponse,
  validatedHotelsRatesSearchFlowContextQuery,
  normalizedMarkupRate
) {
  if (!Array.isArray(getHotelsRatesResponse?.data)) {
    throw new Error("Hotel rates response data must be an array.");
  }

  const getHotelsRatesData = getHotelsRatesResponse.data;

  if (!getHotelsRatesData.length) {
    console.log("LITEAPI_SEARCH normalizeHotelsRates empty result", {
      getHotelsRatesDataCount: getHotelsRatesData.length,
      hasGetHotelsRatesHotelsArray: Array.isArray(getHotelsRatesResponse?.hotels)
    });

    return [];
  }

  if (!Array.isArray(getHotelsRatesResponse?.hotels)) {
    throw new Error("Hotel rates response hotels must be an array.");
  }

  const getHotelsRatesHotels = getHotelsRatesResponse.hotels;

  const normalizedNightCount = calculateNightCount(
    validatedHotelsRatesSearchFlowContextQuery.checkin,
    validatedHotelsRatesSearchFlowContextQuery.checkout
  );

  let skippedMissingHotelIdCount = 0;
  let skippedMissingMatchingHotelCount = 0;
  let skippedMissingHotelNameCount = 0;
  let skippedMissingRateCount = 0;
  let skippedMissingCurrentPriceAmountCount = 0;
  let skippedMissingCurrentPriceCurrencyCount = 0;
  let skippedMissingOccupancyNumberCount = 0;
  let refundableTagRFNCount = 0;
  let refundableTagNRFNCount = 0;
  let refundableTagOtherCount = 0;

  const normalizedHotelsRates = [];

  for (const dataItem of getHotelsRatesData) {
    const dataItemHotelId = normalizeText(dataItem?.hotelId);

    if (!dataItemHotelId) {
      skippedMissingHotelIdCount += 1;
      continue;
    }

    const getHotelsRatesHotel =
      getHotelsRatesHotels.find(
        (hotelItem) => normalizeText(hotelItem?.id) === dataItemHotelId
      ) || null;

    if (!getHotelsRatesHotel) {
      skippedMissingMatchingHotelCount += 1;
      continue;
    }

    const getHotelsRatesHotelName =
      normalizeText(getHotelsRatesHotel?.name) || null;

    if (!getHotelsRatesHotelName) {
      skippedMissingHotelNameCount += 1;
      continue;
    }

    if (!dataItem?.roomTypes?.[0]?.rates?.[0]) {
      skippedMissingRateCount += 1;
      continue;
    }

    const hotelOffersMinCurrentPrice = normalizeNumberOrNull(
      dataItem?.roomTypes?.[0]?.rates?.[0]?.retailRate?.total?.[0]?.amount
    );

    if (!Number.isFinite(hotelOffersMinCurrentPrice)) {
      skippedMissingCurrentPriceAmountCount += 1;
      continue;
    }

    const hotelOffersMinCurrentPriceCurrency =
      normalizeText(
        dataItem?.roomTypes?.[0]?.rates?.[0]?.retailRate?.total?.[0]?.currency
      ).toUpperCase() || null;

    if (!hotelOffersMinCurrentPriceCurrency) {
      skippedMissingCurrentPriceCurrencyCount += 1;
      continue;
    }

    const hotelOffersMinCurrentPriceOccupancyNumber =
      normalizePositiveIntegerOrNull(
        dataItem?.roomTypes?.[0]?.rates?.[0]?.occupancyNumber
      );

    if (!Number.isFinite(hotelOffersMinCurrentPriceOccupancyNumber)) {
      skippedMissingOccupancyNumberCount += 1;
      continue;
    }

    const getHotelsRatesHotelAddress =
      normalizeText(getHotelsRatesHotel?.address) || null;
    const getHotelsRatesHotelRating = normalizeNumberOrNull(
      getHotelsRatesHotel?.rating
    );
    const getHotelsRatesHotelMainImage =
      normalizeText(getHotelsRatesHotel?.main_photo) || null;

    const hotelRoomOfferBoardName =
      normalizeText(dataItem?.roomTypes?.[0]?.rates?.[0]?.boardName) || null;

    const hotelOffersBeforeMinCurrentPrice = normalizeNumberOrNull(
      dataItem?.roomTypes?.[0]?.rates?.[0]?.retailRate
        ?.suggestedSellingPrice?.[0]?.amount
    );

    const hotelOffersMinCurrentPriceTaxesAndFees = Array.isArray(
      dataItem?.roomTypes?.[0]?.rates?.[0]?.retailRate?.taxesAndFees
    )
      ? dataItem.roomTypes[0].rates[0].retailRate.taxesAndFees
      : null;

    const hotelOffersMinCurrentPriceTaxesAndFeesText = Array.isArray(
      hotelOffersMinCurrentPriceTaxesAndFees
    )
      ? hotelOffersMinCurrentPriceTaxesAndFees.some(
          (hotelOffersMinCurrentPriceTaxesAndFeesItem) =>
            hotelOffersMinCurrentPriceTaxesAndFeesItem?.included === false
        )
        ? "excl."
        : "incl."
      : null;

    const currentPrice = applyMarkupRate(
      hotelOffersMinCurrentPrice,
      normalizedMarkupRate
    );

    const beforeCurrentPrice = applyMarkupRate(
      hotelOffersBeforeMinCurrentPrice,
      normalizedMarkupRate
    );

    const currentPriceText = formatCurrencyText(
      currentPrice,
      hotelOffersMinCurrentPriceCurrency,
      validatedHotelsRatesSearchFlowContextQuery.language
    );

    const beforeCurrentPriceText = formatCurrencyText(
      beforeCurrentPrice,
      hotelOffersMinCurrentPriceCurrency,
      validatedHotelsRatesSearchFlowContextQuery.language
    );

    const currentPriceNoteText = buildCurrentPriceNoteText(
      normalizedNightCount,
      hotelOffersMinCurrentPriceOccupancyNumber,
      hotelOffersMinCurrentPriceTaxesAndFeesText
    );

    const refundableTag =
      normalizeText(
        dataItem?.roomTypes?.[0]?.rates?.[0]?.cancellationPolicies
          ?.refundableTag
      ).toUpperCase() || null;

    if (refundableTag === "RFN") {
      refundableTagRFNCount += 1;
    } else if (refundableTag === "NRFN") {
      refundableTagNRFNCount += 1;
    } else {
      refundableTagOtherCount += 1;
    }

    normalizedHotelsRates.push({
      hotelId: dataItemHotelId,
      hotelName: getHotelsRatesHotelName,
      hotelAddress: getHotelsRatesHotelAddress,
      hotelRating: getHotelsRatesHotelRating,
      hotelMainImage: getHotelsRatesHotelMainImage,
      beforeCurrentPriceText,
      currentPriceText,
      currentPriceNoteText,
      hotelRoomOfferBoardName
    });
  }

  console.log("LITEAPI_SEARCH normalizeHotelsRates summary", {
    getHotelsRatesDataCount: getHotelsRatesData.length,
    getHotelsRatesHotelsCount: getHotelsRatesHotels.length,
    normalizedHotelsRatesCount: normalizedHotelsRates.length,
    skippedMissingHotelIdCount,
    skippedMissingMatchingHotelCount,
    skippedMissingHotelNameCount,
    skippedMissingRateCount,
    skippedMissingCurrentPriceAmountCount,
    skippedMissingCurrentPriceCurrencyCount,
    skippedMissingOccupancyNumberCount,
    refundableTagRFNCount,
    refundableTagNRFNCount,
    refundableTagOtherCount
  });

  return normalizedHotelsRates;
}

function buildCurrentPriceNoteText(
  normalizedNightCount,
  hotelOffersMinCurrentPriceOccupancyNumber,
  hotelOffersMinCurrentPriceTaxesAndFeesText
) {
  const currentPriceNoteTextItems = [
    `${normalizedNightCount} night`,
    `${hotelOffersMinCurrentPriceOccupancyNumber} room`
  ];

  if (hotelOffersMinCurrentPriceTaxesAndFeesText) {
    currentPriceNoteTextItems.push(
      `${hotelOffersMinCurrentPriceTaxesAndFeesText} taxes & fees`
    );
  }

  return currentPriceNoteTextItems.join(", ");
}

function applyMarkupRate(amount, markupRate) {
  const normalizedAmount = normalizeNumberOrNull(amount);
  const normalizedMarkupRate = normalizeNumberOrNull(markupRate);

  if (!Number.isFinite(normalizedAmount)) {
    return null;
  }

  if (!Number.isFinite(normalizedMarkupRate)) {
    return null;
  }

  return normalizedAmount * normalizedMarkupRate;
}

function formatCurrencyText(amount, currency, language) {
  const normalizedAmount = normalizeNumberOrNull(amount);
  const normalizedCurrency = normalizeText(currency).toUpperCase();
  const normalizedLanguage =
    normalizeText(language).toLowerCase() || DEFAULT_LANGUAGE;

  if (!Number.isFinite(normalizedAmount) || !normalizedCurrency) {
    return null;
  }

  const normalizedLocale = normalizedLanguage === "tr" ? "tr-TR" : "en-US";

  try {
    return new Intl.NumberFormat(normalizedLocale, {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(normalizedAmount);
  } catch {
    return `${normalizedCurrency} ${normalizedAmount.toFixed(2)}`;
  }
}

function validateDateText(value, fieldName) {
  const normalizedDateText = normalizeText(value);
  const normalizedDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(
    normalizedDateText
  );

  if (!normalizedDateMatch) {
    throw new Error(`${fieldName} must be a valid YYYY-MM-DD date.`);
  }

  const normalizedDateYear = Number(normalizedDateMatch[1]);
  const normalizedDateMonth = Number(normalizedDateMatch[2]);
  const normalizedDateDay = Number(normalizedDateMatch[3]);
  const normalizedDate = new Date(
    Date.UTC(normalizedDateYear, normalizedDateMonth - 1, normalizedDateDay)
  );

  if (
    normalizedDate.getUTCFullYear() !== normalizedDateYear ||
    normalizedDate.getUTCMonth() !== normalizedDateMonth - 1 ||
    normalizedDate.getUTCDate() !== normalizedDateDay
  ) {
    throw new Error(`${fieldName} must be a valid calendar date.`);
  }

  return normalizedDateText;
}

function calculateNightCount(checkin, checkout) {
  return Math.round(
    (getDateUtcTime(checkout) - getDateUtcTime(checkin)) / MILLISECONDS_PER_DAY
  );
}

function getDateUtcTime(value) {
  const [normalizedDateYear, normalizedDateMonth, normalizedDateDay] =
    normalizeText(value).split("-").map(Number);

  return Date.UTC(
    normalizedDateYear,
    normalizedDateMonth - 1,
    normalizedDateDay
  );
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeNumberOrNull(value) {
  const normalizedText = normalizeText(value);

  if (!normalizedText) {
    return null;
  }

  const normalizedNumber = Number(normalizedText);
  return Number.isFinite(normalizedNumber) ? normalizedNumber : null;
}

function normalizeIntegerOrNull(value) {
  const normalizedText = normalizeText(value);

  if (!normalizedText) {
    return null;
  }

  const normalizedNumber = Number(normalizedText);
  return Number.isInteger(normalizedNumber) ? normalizedNumber : null;
}

function normalizePositiveIntegerOrNull(value) {
  const normalizedInteger = normalizeIntegerOrNull(value);

  if (!Number.isFinite(normalizedInteger) || normalizedInteger <= 0) {
    return null;
  }

  return normalizedInteger;
}
