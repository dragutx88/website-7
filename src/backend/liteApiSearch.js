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

  const mappedHotelsRates = getMappedHotelsRates(getHotelsRatesJson);

  const otaSearchMinCurrentPriceIndex =
    await resolveOtaSearchMinCurrentPriceIndex({
      getHotelsRatesJson,
      validatedHotelsRatesSearchFlowContextQuery
    });

  return {
    normalizedHotelsRates: normalizeHotelsRates(
      mappedHotelsRates,
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

function getMappedHotelsRates(getHotelsRatesJson) {
  const hotelsByHotelId = new Map();

  const getHotelsRatesHotels = Array.isArray(getHotelsRatesJson?.hotels)
    ? getHotelsRatesJson.hotels
    : [];

  for (const hotel of getHotelsRatesHotels) {
    const hotelId = normalizeText(hotel?.id);

    if (!hotelId) {
      continue;
    }

    hotelsByHotelId.set(hotelId, hotel);
  }

  const getHotelsRatesData = Array.isArray(getHotelsRatesJson?.data)
    ? getHotelsRatesJson.data
    : [];

  return {
    ...getHotelsRatesJson,

    data: getHotelsRatesData.map((hotelRateDataItem) => {
      const hotelRateData = hotelRateDataItem || {};
      const hotelId = normalizeText(hotelRateData?.hotelId);
      const hotel = hotelsByHotelId.get(hotelId) || null;
      const roomTypes = Array.isArray(hotelRateData?.roomTypes)
        ? hotelRateData.roomTypes
        : [];

      return {
        hotelId,

        hotel: hotel
          ? {
              hotelName: normalizeText(hotel?.name) || null,
              hotelAddress: normalizeText(hotel?.address) || null,
              hotelRating: normalizeNumberOrNull(hotel?.rating),
              hotelMainImage: normalizeText(hotel?.main_photo) || null
            }
          : null,

        roomTypes: roomTypes.map((roomTypeItem) => {
          const rates = Array.isArray(roomTypeItem?.rates)
            ? roomTypeItem.rates
            : [];

          return {
            rates: rates.map((rate) => ({
              rateId: normalizeText(rate?.rateId),
              mappedRoomId: normalizeIntegerOrNull(rate?.mappedRoomId),
              occupancyNumber: normalizePositiveIntegerOrNull(
                rate?.occupancyNumber
              ),
              rateName: normalizeText(rate?.name) || null,
              rateBoardName: normalizeText(rate?.boardName) || null,
              retailRateTotalAmount: normalizeNumberOrNull(
                rate?.retailRate?.total?.[0]?.amount
              ),
              retailRateTotalCurrency:
                normalizeText(
                  rate?.retailRate?.total?.[0]?.currency
                ).toUpperCase() || null,
              retailRateSuggestedSellingPriceAmount: normalizeNumberOrNull(
                rate?.retailRate?.suggestedSellingPrice?.[0]?.amount
              ),
              retailRateTaxesAndFees: Array.isArray(
                rate?.retailRate?.taxesAndFees
              )
                ? rate.retailRate.taxesAndFees
                : null,
              refundableTag:
                normalizeText(
                  rate?.cancellationPolicies?.refundableTag
                ).toUpperCase() || null
            }))
          };
        })
      };
    })
  };
}

function normalizeHotelsRates(
  mappedHotelsRates,
  validatedHotelsRatesSearchFlowContextQuery,
  normalizedMarkupRate,
  normalizedMarkupMarginRatio,
  otaSearchMinCurrentPriceIndex
) {
  if (!Array.isArray(mappedHotelsRates?.data)) {
    throw new Error("Mapped hotel rates data must be an array.");
  }

  const mappedHotelsRatesData = mappedHotelsRates.data;

  if (!mappedHotelsRatesData.length) {
    console.log("LITEAPI_SEARCH normalizeHotelsRates empty result", {
      mappedHotelsRatesDataCount: mappedHotelsRatesData.length
    });

    return [];
  }

  const normalizedNightCount = calculateNightCount(
    validatedHotelsRatesSearchFlowContextQuery.checkin,
    validatedHotelsRatesSearchFlowContextQuery.checkout
  );

  const skipped = {
    missingHotelId: 0,
    missingAttachedHotel: 0,
    missingHotelName: 0,
    missingRoomTypes: 0,
    missingRates: 0,
    missingRateId: 0,
    missingMappedRoomId: 0,
    missingCurrentPriceAmount: 0,
    missingCurrentPriceCurrency: 0,
    missingOccupancyNumber: 0,
    missingDisplayRate: 0
  };

  const otaSearch = {
    minCurrentPriceFound: 0,
    minCurrentPriceMissing: 0,
    minCurrentPriceUsed: 0,
    minCurrentPriceRejected: 0
  };

  const pricePath = {
    currentPriceOtaSearch: 0,
    currentPriceRetailRate: 0,
    beforeCurrentPriceOtaSearch: 0,
    beforeCurrentPriceRetailRate: 0
  };

  const itemGreenPoint = {
    applied: 0,
    skipped: 0
  };

  const refundableTag = {
    RFN: 0,
    NRFN: 0,
    other: 0
  };

  const normalizedHotelsRates = [];

  for (const mappedHotelsRatesItem of mappedHotelsRatesData) {
    const { hotelId, hotel, roomTypes: mappedRoomTypes } = mappedHotelsRatesItem;

    if (!hotelId) {
      skipped.missingHotelId += 1;
      continue;
    }

    if (!hotel) {
      skipped.missingAttachedHotel += 1;
      continue;
    }

    const { hotelName, hotelAddress, hotelRating, hotelMainImage } = hotel;

    if (!hotelName) {
      skipped.missingHotelName += 1;
      continue;
    }

    const roomTypes = Array.isArray(mappedRoomTypes) ? mappedRoomTypes : [];

    if (!roomTypes.length) {
      skipped.missingRoomTypes += 1;
      continue;
    }

    let displayRate = null;

    for (const roomTypeItem of roomTypes) {
      if (displayRate) {
        break;
      }

      const rates = Array.isArray(roomTypeItem?.rates)
        ? roomTypeItem.rates
        : [];

      if (!rates.length) {
        skipped.missingRates += 1;
        continue;
      }

      for (const rateItem of rates) {
        const {
          rateId,
          mappedRoomId,
          occupancyNumber,
          rateName,
          rateBoardName,
          retailRateTotalAmount,
          retailRateTotalCurrency,
          retailRateSuggestedSellingPriceAmount,
          retailRateTaxesAndFees,
          refundableTag: rateRefundableTag
        } = rateItem;

        if (!rateId) {
          skipped.missingRateId += 1;
          continue;
        }

        if (!Number.isFinite(mappedRoomId)) {
          skipped.missingMappedRoomId += 1;
          continue;
        }

        if (!Number.isFinite(retailRateTotalAmount)) {
          skipped.missingCurrentPriceAmount += 1;
          continue;
        }

        if (!retailRateTotalCurrency) {
          skipped.missingCurrentPriceCurrency += 1;
          continue;
        }

        if (!Number.isFinite(occupancyNumber)) {
          skipped.missingOccupancyNumber += 1;
          continue;
        }

        const retailRateTaxesAndFeesText = Array.isArray(retailRateTaxesAndFees)
          ? retailRateTaxesAndFees.some((t) => t?.included === false)
            ? "excl."
            : "incl."
          : null;

        const otaSearchMinCurrentPrice = normalizeNumberOrNull(
          otaSearchMinCurrentPriceIndex?.[hotelId]
        );

        if (Number.isFinite(otaSearchMinCurrentPrice)) {
          otaSearch.minCurrentPriceFound += 1;
        } else {
          otaSearch.minCurrentPriceMissing += 1;
        }

        const resolvedCurrentPrice = resolveCurrentPrice({
          retailRateTotalAmount,
          otaSearchMinCurrentPrice,
          normalizedMarkupRate,
          normalizedMarkupMarginRatio
        });

        const currentPrice = resolvedCurrentPrice.currentPrice;

        if (resolvedCurrentPrice.shouldUseOtaSearchMinCurrentPrice) {
          otaSearch.minCurrentPriceUsed += 1;
          pricePath.currentPriceOtaSearch += 1;
        } else {
          pricePath.currentPriceRetailRate += 1;

          if (Number.isFinite(otaSearchMinCurrentPrice)) {
            otaSearch.minCurrentPriceRejected += 1;
          }
        }

        const resolvedBeforeCurrentPrice = resolveBeforeCurrentPrice({
          currentPrice,
          retailRateSuggestedSellingPriceAmount,
          normalizedMarkupRate,
          shouldUseOtaSearchMinCurrentPrice:
            resolvedCurrentPrice.shouldUseOtaSearchMinCurrentPrice
        });

        const beforeCurrentPrice =
          resolvedBeforeCurrentPrice.beforeCurrentPrice;

        if (resolvedBeforeCurrentPrice.shouldUseOtaSearchMinCurrentPrice) {
          pricePath.beforeCurrentPriceOtaSearch += 1;
        } else {
          pricePath.beforeCurrentPriceRetailRate += 1;
        }

        const resolvedItemGreenPointEarningRateAndPoint =
          resolveItemGreenPointEarningRateAndPoint({
            currentPrice,
            retailRateTotalAmount,
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
          itemGreenPoint.applied += 1;
        } else {
          itemGreenPoint.skipped += 1;
        }

        const currentPriceText = formatCurrencyText(
          currentPrice,
          retailRateTotalCurrency,
          validatedHotelsRatesSearchFlowContextQuery.language
        );

        const beforeCurrentPriceText = formatCurrencyText(
          beforeCurrentPrice,
          retailRateTotalCurrency,
          validatedHotelsRatesSearchFlowContextQuery.language
        );

        const currentPriceNoteText = buildCurrentPriceNoteText(
          normalizedNightCount,
          occupancyNumber,
          retailRateTaxesAndFeesText
        );

        if (rateRefundableTag === "RFN") {
          refundableTag.RFN += 1;
        } else if (rateRefundableTag === "NRFN") {
          refundableTag.NRFN += 1;
        } else {
          refundableTag.other += 1;
        }

        displayRate = {
          rateName,
          rateBoardName,
          beforeCurrentPriceText,
          currentPriceText,
          currentPriceNoteText,
          itemPoint,
          itemGreenPointEarningRate
        };

        break;
      }
    }

    if (!displayRate) {
      skipped.missingDisplayRate += 1;
      continue;
    }

    normalizedHotelsRates.push({
      _id: hotelId,
      hotelId,
      hotelName,
      hotelAddress,
      hotelRating,
      hotelMainImage,
      beforeCurrentPriceText: displayRate.beforeCurrentPriceText,
      currentPriceText: displayRate.currentPriceText,
      currentPriceNoteText: displayRate.currentPriceNoteText,
      itemPoint: displayRate.itemPoint,
      itemGreenPointEarningRate: displayRate.itemGreenPointEarningRate,
      rateName: displayRate.rateName,
      rateBoardName: displayRate.rateBoardName
    });
  }

  console.log("LITEAPI_SEARCH normalizeHotelsRates summary", {
    mappedHotelsRatesDataCount: mappedHotelsRatesData.length,
    normalizedHotelsRatesCount: normalizedHotelsRates.length,
    skipped,
    otaSearch,
    pricePath,
    itemGreenPoint,
    refundableTag
  });

  return normalizedHotelsRates;
}

function resolveCurrentPrice({
  retailRateTotalAmount,
  otaSearchMinCurrentPrice,
  normalizedMarkupRate,
  normalizedMarkupMarginRatio
}) {
  const markupMarginRatio = calculateMarkupMarginRatio(
    otaSearchMinCurrentPrice,
    retailRateTotalAmount
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
      : applyMarkupRate(retailRateTotalAmount, normalizedMarkupRate)
  };
}

function resolveBeforeCurrentPrice({
  currentPrice,
  retailRateSuggestedSellingPriceAmount,
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
      retailRateSuggestedSellingPriceAmount,
      normalizedMarkupRate
    )
  };
}

function resolveItemGreenPointEarningRateAndPoint({
  currentPrice,
  retailRateTotalAmount,
  normalizedMarkupMarginRatio
}) {
  const markupMarginRatio = calculateMarkupMarginRatio(
    currentPrice,
    retailRateTotalAmount
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
    normalizedPrice <= 0 ||
    normalizedBasePrice <= 0
  ) {
    return null;
  }

  return (normalizedPrice - normalizedBasePrice) / normalizedPrice;
}

function buildCurrentPriceNoteText(
  normalizedNightCount,
  occupancyNumber,
  retailRateTaxesAndFeesText
) {
  const currentPriceNoteTextItems = [
    `${normalizedNightCount} night`,
    `${occupancyNumber} room`
  ];

  if (retailRateTaxesAndFeesText) {
    currentPriceNoteTextItems.push(
      `${retailRateTaxesAndFeesText} taxes & fees`
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
