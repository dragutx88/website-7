import { elevate } from "wix-auth";
import { secrets } from "wix-secrets-backend.v2";
import { buildLiteApiError, liteApiRequest, parseJson } from "./liteApiClient";
import { resolveOtaSearchMinCurrentPriceIndex } from "./otaSearchIndex";

const LITE_API_BASE_URL = "https://api.liteapi.travel/v3.0";

const MARKUP_RATE_SECRET_NAME = "MARKUP_RATE";
const MARKUP_MARGIN_RATIO_SECRET_NAME = "MARKUP_MARGIN_RATIO";

const DEFAULT_MARKUP_RATE = 1.05;
const BEFORE_CURRENT_PRICE_MARGIN_RATE = 1.10;

const ITEM_GREEN_POINT_EARNING_RATE_AND_POINT_PRICE_THRESHOLD = 10000;
const ITEM_POINT_PER_THRESHOLD = 500;
const ITEM_GREEN_POINT_EARNING_RATE_PER_THRESHOLD = 0.20;
const ITEM_GREEN_POINT_EARNING_RATE_MAX = 1;

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

  const [normalizedMarkupRate, normalizedMarkupMarginRatio] =
    await Promise.all([getMarkupRate(), getMarkupMarginRatio()]);

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

  const otaSearchMinCurrentPriceIndex =
    await resolveOtaSearchMinCurrentPriceIndex({
      getHotelsRatesJson,
      validatedHotelsRatesSearchFlowContextQuery
    });

  return {
    normalizedHotelsRates: normalizeHotelsRates(
      getHotelsRatesJson,
      validatedHotelsRatesSearchFlowContextQuery,
      normalizedMarkupRate,
      normalizedMarkupMarginRatio,
      otaSearchMinCurrentPriceIndex
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

async function getMarkupMarginRatio() {
  const markupMarginRatioSecretValue = await getSecretValue(
    MARKUP_MARGIN_RATIO_SECRET_NAME
  );

  const normalizedMarkupMarginRatio = normalizeNumberOrNull(
    markupMarginRatioSecretValue?.value
  );

  if (
    !Number.isFinite(normalizedMarkupMarginRatio) ||
    normalizedMarkupMarginRatio < 0 ||
    normalizedMarkupMarginRatio >= 1
  ) {
    throw new Error(
      "MARKUP_MARGIN_RATIO secret must be a numeric ratio between 0 and 1."
    );
  }

  return normalizedMarkupMarginRatio;
}

function validateHotelsRatesSearchFlowContextQuery(searchFlowContextQuery) {
  const normalizedMode = normalizeText(searchFlowContextQuery?.mode);
  const normalizedPlaceId = normalizeText(searchFlowContextQuery?.placeId);
  const normalizedDisplayName = normalizeText(searchFlowContextQuery?.name);
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

  if (normalizedMode === "destination" && !normalizedDisplayName) {
    throw new Error("name is required for destination mode.");
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
    displayName:
      normalizedMode === "destination"
        ? normalizedDisplayName
        : normalizedAiSearch,
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
  normalizedMarkupRate,
  normalizedMarkupMarginRatio,
  otaSearchMinCurrentPriceIndex
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
  let otaSearchMinCurrentPriceFoundCount = 0;
  let otaSearchMinCurrentPriceMissingCount = 0;
  let otaSearchMinCurrentPriceUsedCount = 0;
  let otaSearchMinCurrentPriceRejectedCount = 0;
  let currentPriceOtaSearchPathCount = 0;
  let currentPriceHotelOffersPathCount = 0;
  let beforeCurrentPriceOtaSearchPathCount = 0;
  let beforeCurrentPriceHotelOffersPathCount = 0;
  let itemGreenPointEarningRateAndPointAppliedCount = 0;
  let itemGreenPointEarningRateAndPointSkippedCount = 0;

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

    const otaSearchMinCurrentPrice = normalizeNumberOrNull(
      otaSearchMinCurrentPriceIndex?.[dataItemHotelId]
    );

    if (Number.isFinite(otaSearchMinCurrentPrice)) {
      otaSearchMinCurrentPriceFoundCount += 1;
    } else {
      otaSearchMinCurrentPriceMissingCount += 1;
    }

    const resolvedCurrentPrice = resolveCurrentPrice({
      hotelOffersMinCurrentPrice,
      otaSearchMinCurrentPrice,
      normalizedMarkupRate,
      normalizedMarkupMarginRatio
    });

    const currentPrice = resolvedCurrentPrice.currentPrice;

    if (resolvedCurrentPrice.shouldUseOtaSearchMinCurrentPrice) {
      otaSearchMinCurrentPriceUsedCount += 1;
      currentPriceOtaSearchPathCount += 1;
    } else {
      currentPriceHotelOffersPathCount += 1;

      if (Number.isFinite(otaSearchMinCurrentPrice)) {
        otaSearchMinCurrentPriceRejectedCount += 1;
      }
    }

    const resolvedBeforeCurrentPrice = resolveBeforeCurrentPrice({
      currentPrice,
      hotelOffersBeforeMinCurrentPrice,
      normalizedMarkupRate,
      shouldUseOtaSearchMinCurrentPrice:
        resolvedCurrentPrice.shouldUseOtaSearchMinCurrentPrice
    });

    const beforeCurrentPrice = resolvedBeforeCurrentPrice.beforeCurrentPrice;

    if (resolvedBeforeCurrentPrice.shouldUseOtaSearchMinCurrentPrice) {
      beforeCurrentPriceOtaSearchPathCount += 1;
    } else {
      beforeCurrentPriceHotelOffersPathCount += 1;
    }

    const resolvedItemGreenPointEarningRateAndPoint =
      resolveItemGreenPointEarningRateAndPoint({
        currentPrice,
        hotelOffersMinCurrentPrice,
        normalizedMarkupMarginRatio
      });

    const itemPoint =
      resolvedItemGreenPointEarningRateAndPoint.itemPoint;
    const itemGreenPointEarningRate =
      resolvedItemGreenPointEarningRateAndPoint.itemGreenPointEarningRate;

    if (
      Number.isFinite(itemPoint) &&
      Number.isFinite(itemGreenPointEarningRate)
    ) {
      itemGreenPointEarningRateAndPointAppliedCount += 1;
    } else {
      itemGreenPointEarningRateAndPointSkippedCount += 1;
    }

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
      itemPoint,
      itemGreenPointEarningRate,
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
    otaSearchMinCurrentPriceFoundCount,
    otaSearchMinCurrentPriceMissingCount,
    otaSearchMinCurrentPriceUsedCount,
    otaSearchMinCurrentPriceRejectedCount,
    currentPriceOtaSearchPathCount,
    currentPriceHotelOffersPathCount,
    beforeCurrentPriceOtaSearchPathCount,
    beforeCurrentPriceHotelOffersPathCount,
    itemGreenPointEarningRateAndPointAppliedCount,
    itemGreenPointEarningRateAndPointSkippedCount,
    refundableTagRFNCount,
    refundableTagNRFNCount,
    refundableTagOtherCount
  });

  return normalizedHotelsRates;
}

function resolveCurrentPrice({
  hotelOffersMinCurrentPrice,
  otaSearchMinCurrentPrice,
  normalizedMarkupRate,
  normalizedMarkupMarginRatio
}) {
  const markupMarginRatio = calculateMarkupMarginRatio(
    otaSearchMinCurrentPrice,
    hotelOffersMinCurrentPrice
  );

  const shouldUseOtaSearchMinCurrentPrice =
    Number.isFinite(markupMarginRatio) &&
    Number.isFinite(normalizedMarkupMarginRatio) &&
    markupMarginRatio >= normalizedMarkupMarginRatio;

  return {
    markupMarginRatio,
    shouldUseOtaSearchMinCurrentPrice,
    currentPrice: shouldUseOtaSearchMinCurrentPrice
      ? applyMarkupRate(otaSearchMinCurrentPrice, DEFAULT_MARKUP_RATE)
      : applyMarkupRate(hotelOffersMinCurrentPrice, normalizedMarkupRate)
  };
}

function resolveBeforeCurrentPrice({
  currentPrice,
  hotelOffersBeforeMinCurrentPrice,
  normalizedMarkupRate,
  shouldUseOtaSearchMinCurrentPrice
}) {
  if (shouldUseOtaSearchMinCurrentPrice) {
    return {
      shouldUseOtaSearchMinCurrentPrice,
      beforeCurrentPrice: applyMarkupRate(
        currentPrice,
        BEFORE_CURRENT_PRICE_MARGIN_RATE
      )
    };
  }

  return {
    shouldUseOtaSearchMinCurrentPrice,
    beforeCurrentPrice: applyMarkupRate(
      hotelOffersBeforeMinCurrentPrice,
      normalizedMarkupRate
    )
  };
}

function resolveItemGreenPointEarningRateAndPoint({
  currentPrice,
  hotelOffersMinCurrentPrice,
  normalizedMarkupMarginRatio
}) {
  const markupMarginRatio = calculateMarkupMarginRatio(
    currentPrice,
    hotelOffersMinCurrentPrice
  );

  const shouldApplyItemGreenPointEarningRateAndPoint =
    Number.isFinite(markupMarginRatio) &&
    Number.isFinite(normalizedMarkupMarginRatio) &&
    markupMarginRatio >= normalizedMarkupMarginRatio;

  const normalizedCurrentPrice = normalizeNumberOrNull(currentPrice);

  const itemGreenPointEarningRateAndPointThresholdCount =
    shouldApplyItemGreenPointEarningRateAndPoint &&
    Number.isFinite(normalizedCurrentPrice)
      ? Math.max(
          0,
          Math.floor(
            normalizedCurrentPrice /
              ITEM_GREEN_POINT_EARNING_RATE_AND_POINT_PRICE_THRESHOLD
          )
        )
      : 0;

  if (itemGreenPointEarningRateAndPointThresholdCount <= 0) {
    return {
      markupMarginRatio,
      shouldApplyItemGreenPointEarningRateAndPoint,
      itemPoint: null,
      itemGreenPointEarningRate: null
    };
  }

  return {
    markupMarginRatio,
    shouldApplyItemGreenPointEarningRateAndPoint,
    itemPoint:
      itemGreenPointEarningRateAndPointThresholdCount *
      ITEM_POINT_PER_THRESHOLD,
    itemGreenPointEarningRate: Math.min(
      ITEM_GREEN_POINT_EARNING_RATE_MAX,
      itemGreenPointEarningRateAndPointThresholdCount *
        ITEM_GREEN_POINT_EARNING_RATE_PER_THRESHOLD
    )
  };
}

function calculateMarkupMarginRatio(price, basePrice) {
  const normalizedPrice = normalizeNumberOrNull(price);
  const normalizedBasePrice = normalizeNumberOrNull(basePrice);

  if (
    !Number.isFinite(normalizedPrice) ||
    !Number.isFinite(normalizedBasePrice) ||
    normalizedPrice <= 0
  ) {
    return null;
  }

  return (normalizedPrice - normalizedBasePrice) / normalizedPrice;
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
