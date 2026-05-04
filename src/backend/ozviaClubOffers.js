import { elevate } from "wix-auth";
import { secrets } from "wix-secrets-backend.v2";
import { buildLiteApiError, liteApiRequest, parseJson } from "./liteApiClient";

const LITE_API_BASE_URL = "https://api.liteapi.travel/v3.0";
const XOTELO_API_BASE_URL = "https://data.xotelo.com/api";

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
const XOTELO_DESTINATION_HOTEL_LIST_LIMIT = 100;
const XOTELO_RATES_CONCURRENCY = 5;
const XOTELO_RATES_MATCHED_HOTEL_LIMIT = 30;
const XOTELO_MIN_NAME_MATCH_SCORE = 0.86;
const XOTELO_MIN_MATCH_CONFIDENCE = 0.86;
const XOTELO_AMBIGUOUS_MATCH_DELTA = 0.02;

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

const getSecretValue = elevate(secrets.getSecretValue);

export async function getOzviaClubOffersHandler(searchFlowContextQuery) {
  const validatedHotelsRatesSearchFlowContextQuery =
    validateHotelsRatesSearchFlowContextQuery(searchFlowContextQuery);

  const getHotelsRatesRequest = buildHotelsRatesRequest(
    validatedHotelsRatesSearchFlowContextQuery
  );

  const normalizedMarkupRate = await getMarkupRate();

  if (OZVIA_CLUB_GATE_MODE === OZVIA_CLUB_GATE_MODES.XOTELO) {
    const [getHotelsRatesJson, xoteloDestinationHotelListResult] =
      await Promise.all([
        getLiteApiHotelsRatesJson(getHotelsRatesRequest),
        getXoteloDestinationHotelList({
          destinationName:
            validatedHotelsRatesSearchFlowContextQuery.destinationName
        })
      ]);

    const xoteloGateContext = await buildXoteloGateContext({
      getHotelsRatesResponse: getHotelsRatesJson,
      xoteloDestinationHotelListResult,
      validatedHotelsRatesSearchFlowContextQuery
    });

    return {
      normalizedHotelsRates: normalizeOzviaClubOffers(
        getHotelsRatesJson,
        validatedHotelsRatesSearchFlowContextQuery,
        normalizedMarkupRate,
        xoteloGateContext
      )
    };
  }

  const getHotelsRatesJson = await getLiteApiHotelsRatesJson(
    getHotelsRatesRequest
  );

  return {
    normalizedHotelsRates: normalizeOzviaClubOffers(
      getHotelsRatesJson,
      validatedHotelsRatesSearchFlowContextQuery,
      normalizedMarkupRate,
      {
        gateMode: OZVIA_CLUB_GATE_MODES.SSP,
        xoteloMarketRateByHotelId: {},
        xoteloMarketSummary: null
      }
    )
  };
}

async function getLiteApiHotelsRatesJson(getHotelsRatesRequest) {
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

  return getHotelsRatesJson;
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
  const normalizedDestinationName = normalizeText(searchFlowContextQuery?.name);
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
    OZVIA_CLUB_GATE_MODE === OZVIA_CLUB_GATE_MODES.XOTELO
      ? XOTELO_DEFAULT_CURRENCY
      : normalizeText(searchFlowContextQuery?.currency).toUpperCase() ||
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

  if (
    OZVIA_CLUB_GATE_MODE === OZVIA_CLUB_GATE_MODES.XOTELO &&
    !normalizedDestinationName
  ) {
    throw new Error("name is required for Xotelo Ozvia Club gate.");
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
    destinationName: normalizedDestinationName,
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

async function buildXoteloGateContext({
  getHotelsRatesResponse,
  xoteloDestinationHotelListResult,
  validatedHotelsRatesSearchFlowContextQuery
}) {
  const liteApiHotelMatchCandidates = buildLiteApiHotelMatchCandidates(
    getHotelsRatesResponse
  );

  const xoteloMatchedHotels = matchLiteApiHotelsWithXoteloHotels({
    liteApiHotelMatchCandidates,
    xoteloDestinationHotelList:
      xoteloDestinationHotelListResult.xoteloDestinationHotelList
  });

  const xoteloRatesResult = await getXoteloRatesForMatchedHotels({
    matchedHotels: xoteloMatchedHotels.matchedHotels,
    validatedHotelsRatesSearchFlowContextQuery
  });

  const xoteloMarketSummary = {
    xoteloLocationKey: xoteloDestinationHotelListResult.xoteloLocationKey,
    xoteloDestinationHotelListCount:
      xoteloDestinationHotelListResult.xoteloDestinationHotelList.length,
    liteApiHotelMatchCandidateCount: liteApiHotelMatchCandidates.length,
    xoteloMatchedHotelCount: xoteloMatchedHotels.matchedHotels.length,
    xoteloAmbiguousHotelMatchCount:
      xoteloMatchedHotels.ambiguousHotelMatchCount,
    xoteloUnmatchedLiteApiHotelCount:
      xoteloMatchedHotels.unmatchedLiteApiHotelCount,
    xoteloRatesRequestedCount: xoteloRatesResult.xoteloRatesRequestedCount,
    xoteloRatesReturnedCount: xoteloRatesResult.xoteloRatesReturnedCount,
    xoteloRatesFailedCount: xoteloRatesResult.xoteloRatesFailedCount,
    xoteloRatesEmptyCount: xoteloRatesResult.xoteloRatesEmptyCount,
    xoteloRatesSkippedByLimitCount:
      xoteloRatesResult.xoteloRatesSkippedByLimitCount
  };

  console.log("OZVIA_CLUB_OFFERS xoteloGateContext summary", {
    ...xoteloMarketSummary
  });

  return {
    gateMode: OZVIA_CLUB_GATE_MODES.XOTELO,
    xoteloMarketRateByHotelId: xoteloRatesResult.xoteloMarketRateByHotelId,
    xoteloMarketSummary
  };
}

function buildLiteApiHotelMatchCandidates(getHotelsRatesResponse) {
  const getHotelsRatesData = Array.isArray(getHotelsRatesResponse?.data)
    ? getHotelsRatesResponse.data
    : [];

  const getHotelsRatesHotels = Array.isArray(getHotelsRatesResponse?.hotels)
    ? getHotelsRatesResponse.hotels
    : [];

  const liteApiHotelMatchCandidates = [];

  for (const dataItem of getHotelsRatesData) {
    const hotelId = normalizeText(dataItem?.hotelId);

    if (!hotelId) {
      continue;
    }

    const hotel =
      getHotelsRatesHotels.find(
        (hotelItem) => normalizeText(hotelItem?.id) === hotelId
      ) || null;

    if (!hotel) {
      continue;
    }

    const hotelName = normalizeText(hotel?.name);
    const hotelAddress = normalizeText(hotel?.address);

    if (!hotelName) {
      continue;
    }

    liteApiHotelMatchCandidates.push({
      hotelId,
      hotelName,
      hotelAddress,
      compressedHotelName: compressBusinessKeyText(hotelName),
      compressedHotelAddress: compressBusinessKeyText(hotelAddress)
    });
  }

  return liteApiHotelMatchCandidates;
}

async function getXoteloDestinationHotelList({ destinationName }) {
  const xoteloSearchJson = await getXoteloJson("/search", {
    query: destinationName,
    location_type: "geo"
  });

  const xoteloSearchItems = getXoteloResultList(xoteloSearchJson, "search");
  const xoteloLocationKey = normalizeText(
    xoteloSearchItems?.[0]?.location_key || xoteloSearchItems?.[0]?.key
  );

  if (!xoteloLocationKey) {
    throw new Error("Xotelo location_key could not be resolved.");
  }

  const xoteloListJson = await getXoteloJson("/list", {
    location_key: xoteloLocationKey,
    limit: String(XOTELO_DESTINATION_HOTEL_LIST_LIMIT)
  });

  const xoteloDestinationHotelList = getXoteloResultList(
    xoteloListJson,
    "list"
  );

  return {
    xoteloLocationKey,
    xoteloDestinationHotelList
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

function getXoteloResultList(xoteloJson, sourceName) {
  const xoteloResultList = xoteloJson?.result?.list;

  if (!Array.isArray(xoteloResultList)) {
    throw new Error(`Xotelo ${sourceName} result.list must be an array.`);
  }

  return xoteloResultList;
}

function matchLiteApiHotelsWithXoteloHotels({
  liteApiHotelMatchCandidates,
  xoteloDestinationHotelList
}) {
  const xoteloHotelCandidates = xoteloDestinationHotelList
    .map((xoteloHotelItem) => {
      const xoteloHotelKey = normalizeText(
        xoteloHotelItem?.key || xoteloHotelItem?.hotel_key
      );
      const xoteloHotelName = normalizeText(xoteloHotelItem?.name);
      const xoteloHotelAddress =
        normalizeText(xoteloHotelItem?.street_address) ||
        normalizeText(xoteloHotelItem?.address) ||
        normalizeText(xoteloHotelItem?.place_name);

      return {
        xoteloHotelKey,
        xoteloHotelName,
        xoteloHotelAddress,
        compressedXoteloHotelName: compressBusinessKeyText(xoteloHotelName),
        compressedXoteloHotelAddress:
          compressBusinessKeyText(xoteloHotelAddress)
      };
    })
    .filter(
      (xoteloHotelCandidate) =>
        xoteloHotelCandidate.xoteloHotelKey &&
        xoteloHotelCandidate.xoteloHotelName
    );

  const matchedHotels = [];
  let ambiguousHotelMatchCount = 0;
  let unmatchedLiteApiHotelCount = 0;

  for (const liteApiHotelCandidate of liteApiHotelMatchCandidates) {
    const scoredXoteloCandidates = xoteloHotelCandidates
      .map((xoteloHotelCandidate) => {
        const nameScore = calculateBusinessTextMatchScore(
          liteApiHotelCandidate.compressedHotelName,
          xoteloHotelCandidate.compressedXoteloHotelName
        );

        const addressScore =
          liteApiHotelCandidate.compressedHotelAddress &&
          xoteloHotelCandidate.compressedXoteloHotelAddress
            ? calculateBusinessTextMatchScore(
                liteApiHotelCandidate.compressedHotelAddress,
                xoteloHotelCandidate.compressedXoteloHotelAddress
              )
            : null;

        const matchConfidence =
          addressScore === null
            ? nameScore
            : Number((nameScore * 0.75 + addressScore * 0.25).toFixed(4));

        return {
          ...xoteloHotelCandidate,
          nameScore,
          addressScore,
          matchConfidence
        };
      })
      .filter(
        (xoteloHotelCandidate) =>
          xoteloHotelCandidate.nameScore >= XOTELO_MIN_NAME_MATCH_SCORE &&
          xoteloHotelCandidate.matchConfidence >= XOTELO_MIN_MATCH_CONFIDENCE
      )
      .sort(
        (firstCandidate, secondCandidate) =>
          secondCandidate.matchConfidence - firstCandidate.matchConfidence
      );

    if (!scoredXoteloCandidates.length) {
      unmatchedLiteApiHotelCount += 1;
      continue;
    }

    const bestXoteloCandidate = scoredXoteloCandidates[0];
    const secondXoteloCandidate = scoredXoteloCandidates[1] || null;

    if (
      secondXoteloCandidate &&
      bestXoteloCandidate.matchConfidence -
        secondXoteloCandidate.matchConfidence <=
        XOTELO_AMBIGUOUS_MATCH_DELTA
    ) {
      ambiguousHotelMatchCount += 1;
      continue;
    }

    matchedHotels.push({
      liteApiHotelId: liteApiHotelCandidate.hotelId,
      liteApiHotelName: liteApiHotelCandidate.hotelName,
      liteApiHotelAddress: liteApiHotelCandidate.hotelAddress,
      xoteloHotelKey: bestXoteloCandidate.xoteloHotelKey,
      xoteloHotelName: bestXoteloCandidate.xoteloHotelName,
      xoteloHotelAddress: bestXoteloCandidate.xoteloHotelAddress,
      xoteloNameScore: bestXoteloCandidate.nameScore,
      xoteloAddressScore: bestXoteloCandidate.addressScore,
      xoteloMatchConfidence: bestXoteloCandidate.matchConfidence
    });
  }

  return {
    matchedHotels,
    ambiguousHotelMatchCount,
    unmatchedLiteApiHotelCount
  };
}

async function getXoteloRatesForMatchedHotels({
  matchedHotels,
  validatedHotelsRatesSearchFlowContextQuery
}) {
  const xoteloMarketRateByHotelId = {};
  const normalizedNightCount = calculateNightCount(
    validatedHotelsRatesSearchFlowContextQuery.checkin,
    validatedHotelsRatesSearchFlowContextQuery.checkout
  );
  const totalAdultCount = calculateTotalAdultCount(
    validatedHotelsRatesSearchFlowContextQuery.roomAdultCounts
  );

  const matchedHotelsWithinLimit = matchedHotels.slice(
    0,
    XOTELO_RATES_MATCHED_HOTEL_LIMIT
  );

  let xoteloRatesReturnedCount = 0;
  let xoteloRatesFailedCount = 0;
  let xoteloRatesEmptyCount = 0;

  for (
    let matchedHotelsIndex = 0;
    matchedHotelsIndex < matchedHotelsWithinLimit.length;
    matchedHotelsIndex += XOTELO_RATES_CONCURRENCY
  ) {
    const matchedHotelsBatch = matchedHotelsWithinLimit.slice(
      matchedHotelsIndex,
      matchedHotelsIndex + XOTELO_RATES_CONCURRENCY
    );

    const xoteloRatesBatchResults = await Promise.all(
      matchedHotelsBatch.map(async (matchedHotel) => {
        try {
          const xoteloRatesResult = await getXoteloRatesForHotel({
            hotelKey: matchedHotel.xoteloHotelKey,
            checkin: validatedHotelsRatesSearchFlowContextQuery.checkin,
            checkout: validatedHotelsRatesSearchFlowContextQuery.checkout,
            rooms: validatedHotelsRatesSearchFlowContextQuery.rooms,
            adults: totalAdultCount,
            currency: XOTELO_DEFAULT_CURRENCY
          });

          return {
            ok: true,
            matchedHotel,
            xoteloRatesResult
          };
        } catch (error) {
          return {
            ok: false,
            matchedHotel,
            error
          };
        }
      })
    );

    for (const xoteloRatesBatchResult of xoteloRatesBatchResults) {
      if (!xoteloRatesBatchResult.ok) {
        xoteloRatesFailedCount += 1;
        continue;
      }

      const lowestRate = xoteloRatesBatchResult.xoteloRatesResult.lowestRate;

      if (!lowestRate) {
        xoteloRatesEmptyCount += 1;
        continue;
      }

      const xoteloLowestTotal =
        lowestRate.xoteloLowestPerNight *
        normalizedNightCount *
        validatedHotelsRatesSearchFlowContextQuery.rooms;

      xoteloMarketRateByHotelId[
        xoteloRatesBatchResult.matchedHotel.liteApiHotelId
      ] = {
        xoteloHotelKey:
          xoteloRatesBatchResult.matchedHotel.xoteloHotelKey,
        xoteloHotelName:
          xoteloRatesBatchResult.matchedHotel.xoteloHotelName,
        xoteloHotelAddress:
          xoteloRatesBatchResult.matchedHotel.xoteloHotelAddress,
        xoteloLowestPerNight: lowestRate.xoteloLowestPerNight,
        xoteloLowestTotal,
        xoteloLowestSource: lowestRate.xoteloLowestSource,
        xoteloCurrency: XOTELO_DEFAULT_CURRENCY,
        xoteloMatchConfidence:
          xoteloRatesBatchResult.matchedHotel.xoteloMatchConfidence
      };

      xoteloRatesReturnedCount += 1;
    }
  }

  return {
    xoteloMarketRateByHotelId,
    xoteloRatesRequestedCount: matchedHotelsWithinLimit.length,
    xoteloRatesReturnedCount,
    xoteloRatesFailedCount,
    xoteloRatesEmptyCount,
    xoteloRatesSkippedByLimitCount: Math.max(
      0,
      matchedHotels.length - matchedHotelsWithinLimit.length
    )
  };
}

async function getXoteloRatesForHotel({
  hotelKey,
  checkin,
  checkout,
  rooms,
  adults,
  currency
}) {
  const xoteloRatesJson = await getXoteloJson("/rates", {
    hotel_key: hotelKey,
    chk_in: checkin,
    chk_out: checkout,
    rooms: String(rooms),
    adults: String(adults),
    currency
  });

  const xoteloRates = Array.isArray(xoteloRatesJson?.result?.rates)
    ? xoteloRatesJson.result.rates
    : [];

  const normalizedRates = xoteloRates
    .map((xoteloRateItem) => {
      const xoteloLowestPerNight = normalizeNumberOrNull(
        xoteloRateItem?.rate
      );

      return {
        xoteloLowestPerNight,
        xoteloLowestSource:
          normalizeText(xoteloRateItem?.name) ||
          normalizeText(xoteloRateItem?.code)
      };
    })
    .filter((xoteloRateItem) =>
      Number.isFinite(xoteloRateItem.xoteloLowestPerNight)
    )
    .sort(
      (firstRate, secondRate) =>
        firstRate.xoteloLowestPerNight - secondRate.xoteloLowestPerNight
    );

  return {
    lowestRate: normalizedRates[0] || null,
    ratesCount: normalizedRates.length
  };
}

function normalizeOzviaClubOffers(
  getHotelsRatesResponse,
  validatedHotelsRatesSearchFlowContextQuery,
  normalizedMarkupRate,
  ozviaClubGateContext
) {
  if (!Array.isArray(getHotelsRatesResponse?.data)) {
    throw new Error("Hotel rates response data must be an array.");
  }

  const getHotelsRatesData = getHotelsRatesResponse.data;

  if (!getHotelsRatesData.length) {
    console.log("OZVIA_CLUB_OFFERS normalizeOzviaClubOffers empty result", {
      ozviaClubGateMode: ozviaClubGateContext.gateMode,
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
  let skippedMissingSuggestedSellingPriceCount = 0;
  let missingSuggestedSellingPriceForDisplayCount = 0;
  let skippedMissingXoteloMarketRateCount = 0;
  let skippedBelowOzviaClubGapThresholdCount = 0;
  let refundableTagRFNCount = 0;
  let refundableTagNRFNCount = 0;
  let refundableTagOtherCount = 0;

  let inspectedOzviaClubGapRatioCount = 0;
  let totalOzviaClubGapRatio = 0;
  let minOzviaClubGapRatio = null;
  let maxOzviaClubGapRatio = null;

  const ozviaClubGapRatioSamples = [];
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

    const hotelOffersBeforeMinCurrentPrice = normalizeNumberOrNull(
      dataItem?.roomTypes?.[0]?.rates?.[0]?.retailRate
        ?.suggestedSellingPrice?.[0]?.amount
    );

    const gateResult = evaluateOzviaClubOfferGate({
      ozviaClubGateContext,
      hotelId: dataItemHotelId,
      rawRateTotalAmount: hotelOffersMinCurrentPrice,
      rawSuggestedSellingPriceAmount: hotelOffersBeforeMinCurrentPrice
    });

    if (gateResult.skipReason === "missingSuggestedSellingPrice") {
      skippedMissingSuggestedSellingPriceCount += 1;
      continue;
    }

    if (gateResult.skipReason === "missingXoteloMarketRate") {
      skippedMissingXoteloMarketRateCount += 1;
      continue;
    }

    if (Number.isFinite(gateResult.ozviaClubGapRatio)) {
      inspectedOzviaClubGapRatioCount += 1;
      totalOzviaClubGapRatio += gateResult.ozviaClubGapRatio;

      minOzviaClubGapRatio =
        minOzviaClubGapRatio === null
          ? gateResult.ozviaClubGapRatio
          : Math.min(minOzviaClubGapRatio, gateResult.ozviaClubGapRatio);

      maxOzviaClubGapRatio =
        maxOzviaClubGapRatio === null
          ? gateResult.ozviaClubGapRatio
          : Math.max(maxOzviaClubGapRatio, gateResult.ozviaClubGapRatio);

      ozviaClubGapRatioSamples.push({
        hotelId: dataItemHotelId,
        hotelName: getHotelsRatesHotelName,
        ozviaClubGateMode: ozviaClubGateContext.gateMode,
        rawRateTotalAmount: hotelOffersMinCurrentPrice,
        rawBenchmarkAmount: gateResult.rawBenchmarkAmount,
        benchmarkSource: gateResult.benchmarkSource,
        ozviaClubGapRatio: Number(gateResult.ozviaClubGapRatio.toFixed(4)),
        ozviaClubGapPercent: Number(
          (gateResult.ozviaClubGapRatio * 100).toFixed(2)
        ),
        xoteloLowestPerNight: gateResult.xoteloLowestPerNight,
        xoteloLowestSource: gateResult.xoteloLowestSource,
        xoteloMatchConfidence: gateResult.xoteloMatchConfidence
      });
    }

    if (
      !Number.isFinite(gateResult.ozviaClubGapRatio) ||
      gateResult.ozviaClubGapRatio < OZVIA_CLUB_MIN_GAP_RATIO
    ) {
      skippedBelowOzviaClubGapThresholdCount += 1;
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

    const beforeCurrentPrice = Number.isFinite(
      hotelOffersBeforeMinCurrentPrice
    )
      ? applyMarkupRate(hotelOffersBeforeMinCurrentPrice, normalizedMarkupRate)
      : null;

    if (!Number.isFinite(hotelOffersBeforeMinCurrentPrice)) {
      missingSuggestedSellingPriceForDisplayCount += 1;
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
      hotelRoomOfferBoardName,

      ozviaClubGateMode: ozviaClubGateContext.gateMode,
      ozviaClubGapRatio: gateResult.ozviaClubGapRatio,
      ozviaClubGapPercent: Number(
        (gateResult.ozviaClubGapRatio * 100).toFixed(2)
      ),
      benchmarkSource: gateResult.benchmarkSource
    });
  }

  const averageOzviaClubGapRatio =
    inspectedOzviaClubGapRatioCount > 0
      ? totalOzviaClubGapRatio / inspectedOzviaClubGapRatioCount
      : null;

  const topOzviaClubGapRatioSamples = ozviaClubGapRatioSamples
    .sort(
      (firstSample, secondSample) =>
        secondSample.ozviaClubGapRatio - firstSample.ozviaClubGapRatio
    )
    .slice(0, 5);

  console.log("OZVIA_CLUB_OFFERS normalizeOzviaClubOffers summary", {
    ozviaClubGateMode: ozviaClubGateContext.gateMode,
    getHotelsRatesDataCount: getHotelsRatesData.length,
    getHotelsRatesHotelsCount: getHotelsRatesHotels.length,
    normalizedHotelsRatesCount: normalizedHotelsRates.length,
    ozviaClubMinGapRatio: OZVIA_CLUB_MIN_GAP_RATIO,
    inspectedOzviaClubGapRatioCount,
    minOzviaClubGapRatio:
      minOzviaClubGapRatio === null
        ? null
        : Number(minOzviaClubGapRatio.toFixed(4)),
    maxOzviaClubGapRatio:
      maxOzviaClubGapRatio === null
        ? null
        : Number(maxOzviaClubGapRatio.toFixed(4)),
    averageOzviaClubGapRatio:
      averageOzviaClubGapRatio === null
        ? null
        : Number(averageOzviaClubGapRatio.toFixed(4)),
    topOzviaClubGapRatioSamples,
    xoteloMarketSummary: ozviaClubGateContext.xoteloMarketSummary,
    skippedMissingHotelIdCount,
    skippedMissingMatchingHotelCount,
    skippedMissingHotelNameCount,
    skippedMissingRateCount,
    skippedMissingCurrentPriceAmountCount,
    skippedMissingSuggestedSellingPriceCount,
    missingSuggestedSellingPriceForDisplayCount,
    skippedMissingXoteloMarketRateCount,
    skippedBelowOzviaClubGapThresholdCount,
    skippedMissingCurrentPriceCurrencyCount,
    skippedMissingOccupancyNumberCount,
    refundableTagRFNCount,
    refundableTagNRFNCount,
    refundableTagOtherCount
  });

  return normalizedHotelsRates;
}

function evaluateOzviaClubOfferGate({
  ozviaClubGateContext,
  hotelId,
  rawRateTotalAmount,
  rawSuggestedSellingPriceAmount
}) {
  if (ozviaClubGateContext.gateMode === OZVIA_CLUB_GATE_MODES.XOTELO) {
    const xoteloMarketRate =
      ozviaClubGateContext.xoteloMarketRateByHotelId?.[hotelId] || null;

    if (
      !xoteloMarketRate ||
      !Number.isFinite(xoteloMarketRate.xoteloLowestTotal)
    ) {
      return {
        skipReason: "missingXoteloMarketRate",
        ozviaClubGapRatio: null
      };
    }

    return {
      skipReason: "",
      rawBenchmarkAmount: xoteloMarketRate.xoteloLowestTotal,
      benchmarkSource: "xotelo",
      ozviaClubGapRatio:
        rawRateTotalAmount > 0
          ? (xoteloMarketRate.xoteloLowestTotal - rawRateTotalAmount) /
            rawRateTotalAmount
          : null,
      xoteloLowestPerNight: xoteloMarketRate.xoteloLowestPerNight,
      xoteloLowestSource: xoteloMarketRate.xoteloLowestSource,
      xoteloMatchConfidence: xoteloMarketRate.xoteloMatchConfidence
    };
  }

  if (!Number.isFinite(rawSuggestedSellingPriceAmount)) {
    return {
      skipReason: "missingSuggestedSellingPrice",
      ozviaClubGapRatio: null
    };
  }

  return {
    skipReason: "",
    rawBenchmarkAmount: rawSuggestedSellingPriceAmount,
    benchmarkSource: "ssp",
    ozviaClubGapRatio:
      rawRateTotalAmount > 0
        ? (rawSuggestedSellingPriceAmount - rawRateTotalAmount) /
          rawRateTotalAmount
        : null,
    xoteloLowestPerNight: null,
    xoteloLowestSource: "",
    xoteloMatchConfidence: null
  };
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
