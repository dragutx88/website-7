import { elevate } from "wix-auth";
import { secrets } from "wix-secrets-backend.v2";
import { buildLiteApiError, liteApiRequest, parseJson } from "./liteApiClient";

const LITE_API_BASE_URL = "https://api.liteapi.travel/v3.0";
const XOTELO_API_BASE_URL = "https://data.xotelo.com/api";
const TCMB_EXCHANGE_RATES_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";

const MARKUP_RATE_SECRET_NAME = "MARKUP_RATE";

const DEFAULT_CURRENCY = "TRY";
const DEFAULT_LANGUAGE = "tr";
const DEFAULT_GUEST_NATIONALITY = "TR";

const OZVIA_CLUB_GATE_MODES = Object.freeze({
  SSP: "ssp",
  XOTELO: "xotelo"
});

const OZVIA_CLUB_GATE_MODE = OZVIA_CLUB_GATE_MODES.XOTELO;
const OZVIA_CLUB_MIN_GAP_RATIO = 0.5;

const XOTELO_DEFAULT_CURRENCY = "USD";
const XOTELO_SEARCH_CONCURRENCY = 10;
const XOTELO_RATES_CONCURRENCY = 10;
const XOTELO_GATE_HOTEL_LIMIT = 200;
const XOTELO_MIN_NAME_MATCH_SCORE = 0.86;
const XOTELO_MIN_MATCH_CONFIDENCE = 0.86;
const XOTELO_AMBIGUOUS_MATCH_DELTA = 0.02;

const TCMB_TRY_CURRENCY = "TRY";
const TCMB_FX_RATE_FIELD = "ForexSelling";

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

let tcmbExchangeRatesPromise = null;

const getSecretValue = elevate(secrets.getSecretValue);

export async function getOzviaClubOffersHandler(searchFlowContextQuery) {
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
    throw buildLiteApiError(
      getHotelsRatesJson,
      "Ozvia Club offers request failed."
    );
  }

  const getHotelsRatesClubGatedResponse = await applyOzviaClubGate({
    getHotelsRatesResponse: getHotelsRatesJson,
    ozviaClubGateContext: {
      gateMode: OZVIA_CLUB_GATE_MODE,
      checkin: validatedHotelsRatesSearchFlowContextQuery.checkin,
      checkout: validatedHotelsRatesSearchFlowContextQuery.checkout,
      rooms: validatedHotelsRatesSearchFlowContextQuery.rooms,
      roomAdultCounts: validatedHotelsRatesSearchFlowContextQuery.roomAdultCounts,
      roomChildrenAgesByRoomNumber:
        validatedHotelsRatesSearchFlowContextQuery.roomChildrenAgesByRoomNumber
    }
  });

  return {
    normalizedHotelsRates: normalizeHotelsRates(
      getHotelsRatesClubGatedResponse,
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

async function applyOzviaClubGate({
  getHotelsRatesResponse,
  ozviaClubGateContext
}) {
  if (ozviaClubGateContext.gateMode === OZVIA_CLUB_GATE_MODES.XOTELO) {
    return applyXoteloOzviaClubGate({
      getHotelsRatesResponse,
      ozviaClubGateContext
    });
  }

  return applySspOzviaClubGate({
    getHotelsRatesResponse
  });
}

function applySspOzviaClubGate({ getHotelsRatesResponse }) {
  const liteApiClubCandidates =
    buildLiteApiClubCandidatesFromGetHotelsRatesResponse({
      getHotelsRatesResponse,
      ozviaClubGateContext: null
    });

  let skippedMissingRetailRateTotalAmountCount = 0;
  let skippedInvalidRetailRateTotalAmountCount = 0;
  let skippedMissingSuggestedSellingPriceAmountCount = 0;
  let skippedBelowOzviaClubGapThresholdCount = 0;

  const acceptedHotelIds = new Set();
  const ozviaClubGateSamples = [];

  for (const liteApiClubCandidate of liteApiClubCandidates) {
    if (!Number.isFinite(liteApiClubCandidate.retailRateTotalAmount)) {
      skippedMissingRetailRateTotalAmountCount += 1;
      continue;
    }

    if (liteApiClubCandidate.retailRateTotalAmount <= 0) {
      skippedInvalidRetailRateTotalAmountCount += 1;
      continue;
    }

    if (!Number.isFinite(liteApiClubCandidate.suggestedSellingPriceAmount)) {
      skippedMissingSuggestedSellingPriceAmountCount += 1;
      continue;
    }

    const ozviaClubGapRatio =
      (liteApiClubCandidate.suggestedSellingPriceAmount -
        liteApiClubCandidate.retailRateTotalAmount) /
      liteApiClubCandidate.retailRateTotalAmount;

    ozviaClubGateSamples.push({
      hotelId: liteApiClubCandidate.hotelId,
      hotelName: liteApiClubCandidate.hotelName,
      hotelAddress: liteApiClubCandidate.hotelAddress,
      rateName: liteApiClubCandidate.rateName,
      retailRateTotalAmount: liteApiClubCandidate.retailRateTotalAmount,
      retailRateTotalCurrency: liteApiClubCandidate.retailRateTotalCurrency,
      suggestedSellingPriceAmount:
        liteApiClubCandidate.suggestedSellingPriceAmount,
      suggestedSellingPriceCurrency:
        liteApiClubCandidate.suggestedSellingPriceCurrency,
      suggestedSellingPriceSource:
        liteApiClubCandidate.suggestedSellingPriceSource,
      ozviaClubGapRatio: Number(ozviaClubGapRatio.toFixed(4)),
      ozviaClubGapPercent: Number((ozviaClubGapRatio * 100).toFixed(2))
    });

    if (ozviaClubGapRatio < OZVIA_CLUB_MIN_GAP_RATIO) {
      skippedBelowOzviaClubGapThresholdCount += 1;
      continue;
    }

    acceptedHotelIds.add(liteApiClubCandidate.hotelId);
  }

  const clubGatedData = filterGetHotelsRatesDataByAcceptedHotelIds({
    getHotelsRatesResponse,
    acceptedHotelIds
  });

  console.log("OZVIA_CLUB_OFFERS applySspOzviaClubGate summary", {
    gateMode: OZVIA_CLUB_GATE_MODES.SSP,
    inputDataCount: Array.isArray(getHotelsRatesResponse?.data)
      ? getHotelsRatesResponse.data.length
      : 0,
    candidateCount: liteApiClubCandidates.length,
    clubGatedDataCount: clubGatedData.length,
    ozviaClubMinGapRatio: OZVIA_CLUB_MIN_GAP_RATIO,
    skippedMissingRetailRateTotalAmountCount,
    skippedInvalidRetailRateTotalAmountCount,
    skippedMissingSuggestedSellingPriceAmountCount,
    skippedBelowOzviaClubGapThresholdCount,
    topOzviaClubGateSamples: ozviaClubGateSamples
      .sort(
        (firstSample, secondSample) =>
          secondSample.ozviaClubGapRatio - firstSample.ozviaClubGapRatio
      )
      .slice(0, 5)
  });

  return {
    ...getHotelsRatesResponse,
    data: clubGatedData
  };
}

async function applyXoteloOzviaClubGate({
  getHotelsRatesResponse,
  ozviaClubGateContext
}) {
  const liteApiClubCandidates =
    buildLiteApiClubCandidatesFromGetHotelsRatesResponse({
      getHotelsRatesResponse,
      ozviaClubGateContext
    }).slice(0, XOTELO_GATE_HOTEL_LIMIT);

  const xoteloSearchResult = await searchXoteloHotelKeysByLiteApiCandidates({
    liteApiClubCandidates
  });

  const xoteloRatesResult = await getXoteloRatesByMatchedHotelKeys({
    matchedXoteloHotelCandidates: xoteloSearchResult.matchedXoteloHotelCandidates
  });

  const acceptedHotelIds = new Set();
  const ozviaClubGateSamples = [];

  let skippedMissingXoteloBenchmarkCount = 0;
  let skippedMissingRetailRateTotalAmountCount = 0;
  let skippedInvalidRetailRateTotalAmountCount = 0;
  let skippedBelowOzviaClubGapThresholdCount = 0;

  for (const liteApiClubCandidate of liteApiClubCandidates) {
    if (!Number.isFinite(liteApiClubCandidate.retailRateTotalAmount)) {
      skippedMissingRetailRateTotalAmountCount += 1;
      continue;
    }

    if (liteApiClubCandidate.retailRateTotalAmount <= 0) {
      skippedInvalidRetailRateTotalAmountCount += 1;
      continue;
    }

    const xoteloBenchmark =
      xoteloRatesResult.xoteloBenchmarkByHotelId[liteApiClubCandidate.hotelId];

    if (!xoteloBenchmark) {
      skippedMissingXoteloBenchmarkCount += 1;
      continue;
    }

    const ozviaClubGapRatio =
      (xoteloBenchmark.benchmarkAmount -
        liteApiClubCandidate.retailRateTotalAmount) /
      liteApiClubCandidate.retailRateTotalAmount;

    ozviaClubGateSamples.push({
      hotelId: liteApiClubCandidate.hotelId,
      liteApiHotelName: liteApiClubCandidate.hotelName,
      liteApiHotelAddress: liteApiClubCandidate.hotelAddress,
      liteApiRateName: liteApiClubCandidate.rateName,
      occupancyNumber: liteApiClubCandidate.occupancyNumber,
      adultCount: liteApiClubCandidate.adultCount,
      childCount: liteApiClubCandidate.childCount,
      childrenAges: liteApiClubCandidate.childrenAges,
      retailRateTotalAmount: liteApiClubCandidate.retailRateTotalAmount,
      retailRateTotalCurrency: liteApiClubCandidate.retailRateTotalCurrency,
      xoteloSearchQuery: xoteloBenchmark.xoteloSearchQuery,
      xoteloHotelKey: xoteloBenchmark.xoteloHotelKey,
      xoteloHotelName: xoteloBenchmark.xoteloHotelName,
      xoteloHotelAddress: xoteloBenchmark.xoteloHotelAddress,
      xoteloPlaceName: xoteloBenchmark.xoteloPlaceName,
      xoteloLowestSource: xoteloBenchmark.xoteloLowestSource,
      xoteloLowestSourceCode: xoteloBenchmark.xoteloLowestSourceCode,
      xoteloLowestPerRoomPerNight:
        xoteloBenchmark.xoteloLowestPerRoomPerNight,
      xoteloLowestTotal: xoteloBenchmark.xoteloLowestTotal,
      xoteloBenchmarkAmount: xoteloBenchmark.benchmarkAmount,
      benchmarkCurrency: xoteloBenchmark.benchmarkCurrency,
      fxProvider: xoteloBenchmark.fxProvider,
      fxRate: xoteloBenchmark.fxRate,
      matchConfidence: xoteloBenchmark.matchConfidence,
      ozviaClubGapRatio: Number(ozviaClubGapRatio.toFixed(4)),
      ozviaClubGapPercent: Number((ozviaClubGapRatio * 100).toFixed(2))
    });

    if (ozviaClubGapRatio < OZVIA_CLUB_MIN_GAP_RATIO) {
      skippedBelowOzviaClubGapThresholdCount += 1;
      continue;
    }

    acceptedHotelIds.add(liteApiClubCandidate.hotelId);
  }

  const clubGatedData = filterGetHotelsRatesDataByAcceptedHotelIds({
    getHotelsRatesResponse,
    acceptedHotelIds
  });

  console.log("OZVIA_CLUB_OFFERS applyXoteloOzviaClubGate summary", {
    gateMode: OZVIA_CLUB_GATE_MODES.XOTELO,
    inputDataCount: Array.isArray(getHotelsRatesResponse?.data)
      ? getHotelsRatesResponse.data.length
      : 0,
    candidateCount: liteApiClubCandidates.length,
    clubGatedDataCount: clubGatedData.length,
    ozviaClubMinGapRatio: OZVIA_CLUB_MIN_GAP_RATIO,
    xoteloSearchRequestedCount:
      xoteloSearchResult.xoteloSearchRequestedCount,
    xoteloSearchMatchedCount: xoteloSearchResult.xoteloSearchMatchedCount,
    xoteloSearchFailedCount: xoteloSearchResult.xoteloSearchFailedCount,
    xoteloSearchEmptyCount: xoteloSearchResult.xoteloSearchEmptyCount,
    xoteloSearchLowConfidenceCount:
      xoteloSearchResult.xoteloSearchLowConfidenceCount,
    xoteloSearchAmbiguousCount:
      xoteloSearchResult.xoteloSearchAmbiguousCount,
    xoteloRatesRequestedCount: xoteloRatesResult.xoteloRatesRequestedCount,
    xoteloRatesReturnedCount: xoteloRatesResult.xoteloRatesReturnedCount,
    xoteloRatesFailedCount: xoteloRatesResult.xoteloRatesFailedCount,
    xoteloRatesEmptyCount: xoteloRatesResult.xoteloRatesEmptyCount,
    fxConvertedCount: xoteloRatesResult.fxConvertedCount,
    skippedMissingRetailRateTotalAmountCount,
    skippedInvalidRetailRateTotalAmountCount,
    skippedMissingXoteloBenchmarkCount,
    skippedBelowOzviaClubGapThresholdCount,
    topOzviaClubGateSamples: ozviaClubGateSamples
      .sort(
        (firstSample, secondSample) =>
          secondSample.ozviaClubGapRatio - firstSample.ozviaClubGapRatio
      )
      .slice(0, 5)
  });

  return {
    ...getHotelsRatesResponse,
    data: clubGatedData
  };
}

function buildLiteApiClubCandidatesFromGetHotelsRatesResponse({
  getHotelsRatesResponse,
  ozviaClubGateContext
}) {
  if (!Array.isArray(getHotelsRatesResponse?.data)) {
    throw new Error("Hotel rates response data must be an array.");
  }

  if (!Array.isArray(getHotelsRatesResponse?.hotels)) {
    throw new Error("Hotel rates response hotels must be an array.");
  }

  const liteApiClubCandidates = [];

  for (const dataItem of getHotelsRatesResponse.data) {
    const hotelId = normalizeText(dataItem?.hotelId);

    if (!hotelId) {
      continue;
    }

    const getHotelsRatesHotel =
      getHotelsRatesResponse.hotels.find(
        (hotelItem) => normalizeText(hotelItem?.id) === hotelId
      ) || null;

    if (!getHotelsRatesHotel) {
      continue;
    }

    const rate = dataItem?.roomTypes?.[0]?.rates?.[0] || null;

    if (!rate) {
      continue;
    }

    const hotelName = normalizeText(getHotelsRatesHotel?.name);
    const hotelAddress = normalizeText(getHotelsRatesHotel?.address);

    if (!hotelName) {
      continue;
    }

    const retailRateTotalAmount = normalizeNumberOrNull(
      rate?.retailRate?.total?.[0]?.amount
    );
    const retailRateTotalCurrency =
      normalizeText(rate?.retailRate?.total?.[0]?.currency).toUpperCase() ||
      null;

    const suggestedSellingPriceAmount = normalizeNumberOrNull(
      rate?.retailRate?.suggestedSellingPrice?.[0]?.amount
    );
    const suggestedSellingPriceCurrency =
      normalizeText(
        rate?.retailRate?.suggestedSellingPrice?.[0]?.currency
      ).toUpperCase() || null;
    const suggestedSellingPriceSource =
      normalizeText(rate?.retailRate?.suggestedSellingPrice?.[0]?.source) ||
      null;

    const occupancyNumber =
      normalizePositiveIntegerOrNull(rate?.occupancyNumber) ||
      normalizePositiveIntegerOrNull(ozviaClubGateContext?.rooms);

    const adultCount =
      normalizePositiveIntegerOrNull(rate?.adultCount) ||
      calculateTotalAdultCount(ozviaClubGateContext?.roomAdultCounts);

    const childrenAges = Array.isArray(rate?.childrenAges)
      ? rate.childrenAges
          .map((childAge) => normalizeIntegerOrNull(childAge))
          .filter((childAge) => Number.isFinite(childAge) && childAge >= 0)
      : flattenRoomChildrenAgesByRoomNumber(
          ozviaClubGateContext?.roomChildrenAgesByRoomNumber
        );

    const normalizedChildCount = normalizeIntegerOrNull(rate?.childCount);
    const childCount = Number.isFinite(normalizedChildCount)
      ? normalizedChildCount
      : childrenAges.length;

    liteApiClubCandidates.push({
      hotelId,
      hotelName,
      hotelAddress,
      rateName: normalizeText(rate?.name) || null,
      checkin: normalizeText(ozviaClubGateContext?.checkin),
      checkout: normalizeText(ozviaClubGateContext?.checkout),
      occupancyNumber,
      adultCount,
      childCount,
      childrenAges,
      retailRateTotalAmount,
      retailRateTotalCurrency,
      suggestedSellingPriceAmount,
      suggestedSellingPriceCurrency,
      suggestedSellingPriceSource,
      xoteloSearchQuery: buildXoteloSearchQuery({
        hotelName,
        hotelAddress
      })
    });
  }

  return liteApiClubCandidates;
}

function buildXoteloSearchQuery({ hotelName, hotelAddress }) {
  return [normalizeText(hotelName), normalizeText(hotelAddress)]
    .filter(Boolean)
    .join(" ");
}

async function searchXoteloHotelKeysByLiteApiCandidates({
  liteApiClubCandidates
}) {
  const matchedXoteloHotelCandidates = [];

  let xoteloSearchRequestedCount = 0;
  let xoteloSearchMatchedCount = 0;
  let xoteloSearchFailedCount = 0;
  let xoteloSearchEmptyCount = 0;
  let xoteloSearchLowConfidenceCount = 0;
  let xoteloSearchAmbiguousCount = 0;

  const xoteloSearchBatchResults = await runConcurrentBatches({
    items: liteApiClubCandidates,
    batchSize: XOTELO_SEARCH_CONCURRENCY,
    task: async (liteApiClubCandidate) => {
      xoteloSearchRequestedCount += 1;

      const xoteloSearchJson = await getXoteloJson("/search", {
        query: liteApiClubCandidate.xoteloSearchQuery
      });

      const xoteloSearchList = getXoteloResultList(xoteloSearchJson);

      return {
        liteApiClubCandidate,
        xoteloSearchList
      };
    }
  });

  for (const xoteloSearchBatchResult of xoteloSearchBatchResults) {
    if (!xoteloSearchBatchResult.ok) {
      xoteloSearchFailedCount += 1;
      continue;
    }

    const { liteApiClubCandidate, xoteloSearchList } =
      xoteloSearchBatchResult.value;

    if (!xoteloSearchList.length) {
      xoteloSearchEmptyCount += 1;
      continue;
    }

    const matchedXoteloHotelCandidate = matchBestXoteloSearchCandidate({
      liteApiClubCandidate,
      xoteloSearchList
    });

    if (matchedXoteloHotelCandidate.skipReason === "lowConfidence") {
      xoteloSearchLowConfidenceCount += 1;
      continue;
    }

    if (matchedXoteloHotelCandidate.skipReason === "ambiguous") {
      xoteloSearchAmbiguousCount += 1;
      continue;
    }

    matchedXoteloHotelCandidates.push(matchedXoteloHotelCandidate);
    xoteloSearchMatchedCount += 1;
  }

  return {
    matchedXoteloHotelCandidates,
    xoteloSearchRequestedCount,
    xoteloSearchMatchedCount,
    xoteloSearchFailedCount,
    xoteloSearchEmptyCount,
    xoteloSearchLowConfidenceCount,
    xoteloSearchAmbiguousCount
  };
}

function matchBestXoteloSearchCandidate({
  liteApiClubCandidate,
  xoteloSearchList
}) {
  const compressedLiteApiHotelName = compressBusinessKeyText(
    liteApiClubCandidate.hotelName
  );
  const compressedLiteApiHotelAddress = compressBusinessKeyText(
    liteApiClubCandidate.hotelAddress
  );

  const scoredXoteloSearchCandidates = xoteloSearchList
    .map((xoteloSearchItem) => {
      const xoteloHotelKey = normalizeText(
        xoteloSearchItem?.hotel_key || xoteloSearchItem?.key
      );
      const xoteloHotelName = normalizeText(xoteloSearchItem?.name);
      const xoteloHotelAddress =
        normalizeText(xoteloSearchItem?.street_address) ||
        normalizeText(xoteloSearchItem?.address);
      const xoteloPlaceName = normalizeText(xoteloSearchItem?.place_name);

      const nameScore = calculateBusinessTextMatchScore(
        compressedLiteApiHotelName,
        compressBusinessKeyText(xoteloHotelName)
      );

      const addressScore =
        compressedLiteApiHotelAddress &&
        (xoteloHotelAddress || xoteloPlaceName)
          ? Math.max(
              calculateBusinessTextMatchScore(
                compressedLiteApiHotelAddress,
                compressBusinessKeyText(xoteloHotelAddress)
              ),
              calculateBusinessTextMatchScore(
                compressedLiteApiHotelAddress,
                compressBusinessKeyText(xoteloPlaceName)
              )
            )
          : null;

      const matchConfidence =
        addressScore === null
          ? nameScore
          : Number((nameScore * 0.75 + addressScore * 0.25).toFixed(4));

      return {
        ...liteApiClubCandidate,
        xoteloHotelKey,
        xoteloHotelName,
        xoteloHotelAddress,
        xoteloPlaceName,
        xoteloNameScore: nameScore,
        xoteloAddressScore: addressScore,
        xoteloMatchConfidence: matchConfidence
      };
    })
    .filter(
      (xoteloSearchCandidate) =>
        xoteloSearchCandidate.xoteloHotelKey &&
        xoteloSearchCandidate.xoteloHotelName &&
        xoteloSearchCandidate.xoteloNameScore >=
          XOTELO_MIN_NAME_MATCH_SCORE &&
        xoteloSearchCandidate.xoteloMatchConfidence >=
          XOTELO_MIN_MATCH_CONFIDENCE
    )
    .sort(
      (firstCandidate, secondCandidate) =>
        secondCandidate.xoteloMatchConfidence -
        firstCandidate.xoteloMatchConfidence
    );

  if (!scoredXoteloSearchCandidates.length) {
    return {
      skipReason: "lowConfidence"
    };
  }

  const bestXoteloSearchCandidate = scoredXoteloSearchCandidates[0];
  const secondXoteloSearchCandidate = scoredXoteloSearchCandidates[1] || null;

  if (
    secondXoteloSearchCandidate &&
    bestXoteloSearchCandidate.xoteloMatchConfidence -
      secondXoteloSearchCandidate.xoteloMatchConfidence <=
      XOTELO_AMBIGUOUS_MATCH_DELTA
  ) {
    return {
      skipReason: "ambiguous"
    };
  }

  return {
    skipReason: "",
    ...bestXoteloSearchCandidate
  };
}

async function getXoteloRatesByMatchedHotelKeys({
  matchedXoteloHotelCandidates
}) {
  const xoteloBenchmarkByHotelId = {};

  let xoteloRatesRequestedCount = 0;
  let xoteloRatesReturnedCount = 0;
  let xoteloRatesFailedCount = 0;
  let xoteloRatesEmptyCount = 0;
  let fxConvertedCount = 0;

  const xoteloRatesBatchResults = await runConcurrentBatches({
    items: matchedXoteloHotelCandidates,
    batchSize: XOTELO_RATES_CONCURRENCY,
    task: async (matchedXoteloHotelCandidate) => {
      xoteloRatesRequestedCount += 1;

      const xoteloRatesJson = await getXoteloJson("/rates", {
        hotel_key: matchedXoteloHotelCandidate.xoteloHotelKey,
        chk_in: matchedXoteloHotelCandidate.checkin,
        chk_out: matchedXoteloHotelCandidate.checkout,
        rooms: String(matchedXoteloHotelCandidate.occupancyNumber),
        adults: String(matchedXoteloHotelCandidate.adultCount),
        age_of_children: matchedXoteloHotelCandidate.childrenAges.join(","),
        currency: XOTELO_DEFAULT_CURRENCY
      });

      const xoteloRates = Array.isArray(xoteloRatesJson?.result?.rates)
        ? xoteloRatesJson.result.rates
        : [];

      const xoteloLowestRate = xoteloRates
        .map((xoteloRateItem) => ({
          xoteloLowestPerRoomPerNight: normalizeNumberOrNull(
            xoteloRateItem?.rate
          ),
          xoteloLowestSource:
            normalizeText(xoteloRateItem?.name) ||
            normalizeText(xoteloRateItem?.code),
          xoteloLowestSourceCode: normalizeText(xoteloRateItem?.code)
        }))
        .filter((xoteloRateItem) =>
          Number.isFinite(xoteloRateItem.xoteloLowestPerRoomPerNight)
        )
        .sort(
          (firstRate, secondRate) =>
            firstRate.xoteloLowestPerRoomPerNight -
            secondRate.xoteloLowestPerRoomPerNight
        )[0];

      return {
        matchedXoteloHotelCandidate,
        xoteloLowestRate
      };
    }
  });

  for (const xoteloRatesBatchResult of xoteloRatesBatchResults) {
    if (!xoteloRatesBatchResult.ok) {
      xoteloRatesFailedCount += 1;
      continue;
    }

    const { matchedXoteloHotelCandidate, xoteloLowestRate } =
      xoteloRatesBatchResult.value;

    if (!xoteloLowestRate) {
      xoteloRatesEmptyCount += 1;
      continue;
    }

    const nightCount = calculateNightCount(
      matchedXoteloHotelCandidate.checkin,
      matchedXoteloHotelCandidate.checkout
    );

    const xoteloLowestTotal =
      xoteloLowestRate.xoteloLowestPerRoomPerNight *
      nightCount *
      matchedXoteloHotelCandidate.occupancyNumber;

    const benchmarkAmount = await convertCurrencyAmount({
      amount: xoteloLowestTotal,
      sourceCurrency: XOTELO_DEFAULT_CURRENCY,
      targetCurrency: matchedXoteloHotelCandidate.retailRateTotalCurrency
    });

    if (!Number.isFinite(benchmarkAmount)) {
      xoteloRatesFailedCount += 1;
      continue;
    }

    fxConvertedCount += 1;

    xoteloBenchmarkByHotelId[matchedXoteloHotelCandidate.hotelId] = {
      benchmarkAmount,
      benchmarkCurrency: matchedXoteloHotelCandidate.retailRateTotalCurrency,
      xoteloSearchQuery: matchedXoteloHotelCandidate.xoteloSearchQuery,
      xoteloHotelKey: matchedXoteloHotelCandidate.xoteloHotelKey,
      xoteloHotelName: matchedXoteloHotelCandidate.xoteloHotelName,
      xoteloHotelAddress: matchedXoteloHotelCandidate.xoteloHotelAddress,
      xoteloPlaceName: matchedXoteloHotelCandidate.xoteloPlaceName,
      xoteloLowestSource: xoteloLowestRate.xoteloLowestSource,
      xoteloLowestSourceCode: xoteloLowestRate.xoteloLowestSourceCode,
      xoteloLowestPerRoomPerNight:
        xoteloLowestRate.xoteloLowestPerRoomPerNight,
      xoteloLowestTotal,
      xoteloCurrency: XOTELO_DEFAULT_CURRENCY,
      fxProvider:
        XOTELO_DEFAULT_CURRENCY ===
        matchedXoteloHotelCandidate.retailRateTotalCurrency
          ? "identity"
          : "tcmb",
      fxRate:
        Number.isFinite(xoteloLowestTotal) && xoteloLowestTotal > 0
          ? Number((benchmarkAmount / xoteloLowestTotal).toFixed(6))
          : null,
      matchConfidence: matchedXoteloHotelCandidate.xoteloMatchConfidence
    };

    xoteloRatesReturnedCount += 1;
  }

  return {
    xoteloBenchmarkByHotelId,
    xoteloRatesRequestedCount,
    xoteloRatesReturnedCount,
    xoteloRatesFailedCount,
    xoteloRatesEmptyCount,
    fxConvertedCount
  };
}

async function getXoteloJson(path, queryParams) {
  const url = `${XOTELO_API_BASE_URL}${path}?${new URLSearchParams(
    queryParams
  )}`;

  const response = await fetch(url, {
    method: "GET"
  });

  const responseText = await response.text();

  let responseJson = null;

  try {
    responseJson = JSON.parse(responseText);
  } catch {
    throw new Error(`Xotelo response is not valid JSON for ${path}.`);
  }

  if (!response.ok) {
    throw new Error(`Xotelo request failed for ${path}.`);
  }

  return responseJson;
}

function getXoteloResultList(xoteloJson) {
  const xoteloResultList = xoteloJson?.result?.list;

  return Array.isArray(xoteloResultList) ? xoteloResultList : [];
}

async function convertCurrencyAmount({
  amount,
  sourceCurrency,
  targetCurrency
}) {
  const normalizedAmount = normalizeNumberOrNull(amount);
  const normalizedSourceCurrency = normalizeText(sourceCurrency).toUpperCase();
  const normalizedTargetCurrency = normalizeText(targetCurrency).toUpperCase();

  if (!Number.isFinite(normalizedAmount)) {
    return null;
  }

  if (!normalizedSourceCurrency || !normalizedTargetCurrency) {
    return null;
  }

  if (normalizedSourceCurrency === normalizedTargetCurrency) {
    return normalizedAmount;
  }

  const exchangeRatesByCurrencyToTry = await getTcmbExchangeRatesByCurrency();

  const conversionRate = calculateCurrencyConversionRate({
    sourceCurrency: normalizedSourceCurrency,
    targetCurrency: normalizedTargetCurrency,
    exchangeRatesByCurrencyToTry
  });

  if (!Number.isFinite(conversionRate)) {
    return null;
  }

  return normalizedAmount * conversionRate;
}

async function getTcmbExchangeRatesByCurrency() {
  if (!tcmbExchangeRatesPromise) {
    tcmbExchangeRatesPromise = fetchTcmbExchangeRatesByCurrency();
  }

  return tcmbExchangeRatesPromise;
}

async function fetchTcmbExchangeRatesByCurrency() {
  const response = await fetch(TCMB_EXCHANGE_RATES_URL, {
    method: "GET"
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error("TCMB exchange rates request failed.");
  }

  const exchangeRatesByCurrencyToTry = {
    TRY: 1
  };

  const currencyBlockPattern =
    /<Currency\b[^>]*CurrencyCode="([^"]+)"[^>]*>([\s\S]*?)<\/Currency>/g;

  let currencyBlockMatch = currencyBlockPattern.exec(responseText);

  while (currencyBlockMatch) {
    const currencyCode = normalizeText(currencyBlockMatch[1]).toUpperCase();
    const currencyBlock = currencyBlockMatch[2];

    const unit =
      normalizePositiveNumberOrNull(getXmlTagText(currencyBlock, "Unit")) || 1;

    const fxRateValue = normalizePositiveNumberOrNull(
      getXmlTagText(currencyBlock, TCMB_FX_RATE_FIELD)
    );

    if (currencyCode && Number.isFinite(fxRateValue) && unit > 0) {
      exchangeRatesByCurrencyToTry[currencyCode] = fxRateValue / unit;
    }

    currencyBlockMatch = currencyBlockPattern.exec(responseText);
  }

  if (!Number.isFinite(exchangeRatesByCurrencyToTry.USD)) {
    throw new Error("TCMB USD ForexSelling rate could not be parsed.");
  }

  console.log("OZVIA_CLUB_OFFERS tcmbExchangeRates summary", {
    fxProvider: "tcmb",
    fxRateField: TCMB_FX_RATE_FIELD,
    supportedCurrencyCount: Object.keys(exchangeRatesByCurrencyToTry).length,
    usdToTryRate: exchangeRatesByCurrencyToTry.USD
  });

  return exchangeRatesByCurrencyToTry;
}

function calculateCurrencyConversionRate({
  sourceCurrency,
  targetCurrency,
  exchangeRatesByCurrencyToTry
}) {
  const normalizedSourceCurrency = normalizeText(sourceCurrency).toUpperCase();
  const normalizedTargetCurrency = normalizeText(targetCurrency).toUpperCase();

  if (normalizedSourceCurrency === normalizedTargetCurrency) {
    return 1;
  }

  const sourceCurrencyToTryRate =
    normalizedSourceCurrency === TCMB_TRY_CURRENCY
      ? 1
      : exchangeRatesByCurrencyToTry[normalizedSourceCurrency];

  const targetCurrencyToTryRate =
    normalizedTargetCurrency === TCMB_TRY_CURRENCY
      ? 1
      : exchangeRatesByCurrencyToTry[normalizedTargetCurrency];

  if (
    !Number.isFinite(sourceCurrencyToTryRate) ||
    sourceCurrencyToTryRate <= 0 ||
    !Number.isFinite(targetCurrencyToTryRate) ||
    targetCurrencyToTryRate <= 0
  ) {
    return null;
  }

  return sourceCurrencyToTryRate / targetCurrencyToTryRate;
}

function getXmlTagText(xmlText, tagName) {
  const tagPattern = new RegExp(`<${tagName}>([^<]*)</${tagName}>`, "i");
  const tagMatch = tagPattern.exec(xmlText);

  return tagMatch ? normalizeText(tagMatch[1]) : "";
}

async function runConcurrentBatches({ items, batchSize, task }) {
  const results = [];

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += batchSize) {
    const batchItems = items.slice(itemIndex, itemIndex + batchSize);

    const batchResults = await Promise.all(
      batchItems.map(async (item) => {
        try {
          const value = await task(item);

          return {
            ok: true,
            value
          };
        } catch (error) {
          return {
            ok: false,
            item,
            error
          };
        }
      })
    );

    results.push(...batchResults);
  }

  return results;
}

function filterGetHotelsRatesDataByAcceptedHotelIds({
  getHotelsRatesResponse,
  acceptedHotelIds
}) {
  return Array.isArray(getHotelsRatesResponse?.data)
    ? getHotelsRatesResponse.data.filter((dataItem) =>
        acceptedHotelIds.has(normalizeText(dataItem?.hotelId))
      )
    : [];
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
    console.log("OZVIA_CLUB_OFFERS normalizeHotelsRates empty result", {
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

  console.log("OZVIA_CLUB_OFFERS normalizeHotelsRates summary", {
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

function calculateTotalAdultCount(roomAdultCounts) {
  if (!Array.isArray(roomAdultCounts)) {
    return 1;
  }

  const totalAdultCount = roomAdultCounts.reduce(
    (total, roomAdultCount) =>
      Number.isFinite(roomAdultCount) ? total + roomAdultCount : total,
    0
  );

  return totalAdultCount > 0 ? totalAdultCount : 1;
}

function flattenRoomChildrenAgesByRoomNumber(roomChildrenAgesByRoomNumber) {
  if (!roomChildrenAgesByRoomNumber || !roomChildrenAgesByRoomNumber.size) {
    return [];
  }

  const childrenAges = [];

  for (const roomChildrenAges of roomChildrenAgesByRoomNumber.values()) {
    if (Array.isArray(roomChildrenAges)) {
      childrenAges.push(...roomChildrenAges);
    }
  }

  return childrenAges
    .map((childAge) => normalizeIntegerOrNull(childAge))
    .filter((childAge) => Number.isFinite(childAge) && childAge >= 0);
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

function compressBusinessKeyText(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function calculateBusinessTextMatchScore(firstValue, secondValue) {
  const firstTokens = getUniqueTokens(firstValue);
  const secondTokens = getUniqueTokens(secondValue);

  if (!firstTokens.length || !secondTokens.length) {
    return 0;
  }

  if (firstValue === secondValue) {
    return 1;
  }

  const secondTokenSet = new Set(secondTokens);
  const commonTokenCount = firstTokens.filter((token) =>
    secondTokenSet.has(token)
  ).length;

  const containmentScore =
    commonTokenCount / Math.min(firstTokens.length, secondTokens.length);
  const coverageScore =
    commonTokenCount / Math.max(firstTokens.length, secondTokens.length);

  return Number((containmentScore * 0.7 + coverageScore * 0.3).toFixed(4));
}

function getUniqueTokens(value) {
  return Array.from(
    new Set(
      normalizeText(value)
        .split(" ")
        .map((token) => normalizeText(token))
        .filter(Boolean)
    )
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

function normalizePositiveNumberOrNull(value) {
  const normalizedNumber = normalizeNumberOrNull(value);

  if (!Number.isFinite(normalizedNumber) || normalizedNumber <= 0) {
    return null;
  }

  return normalizedNumber;
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
