import { elevate } from "wix-auth";
import { secrets } from "wix-secrets-backend.v2";
import { fetch } from "wix-fetch";

const SEARCHAPI_BASE_URL = "https://www.searchapi.io/api/v1/search";
const SEARCHAPI_API_KEY_SECRET_NAME = "SEARCHAPI_API_KEY";

const SEARCHAPI_ENGINE = "google_hotels";
const DEFAULT_SEARCHAPI_COUNTRY_CODE = "tr";

const getSecretValue = elevate(secrets.getSecretValue);

export async function resolveOtaSearchMinCurrentPriceIndex({
  getHotelsRatesJson,
  validatedHotelsRatesSearchFlowContextQuery
}) {
  const emptyOtaSearchMinCurrentPriceIndex =
    buildEmptyOtaSearchMinCurrentPriceIndex(getHotelsRatesJson);

  try {
    const searchApiKey = await getSearchApiKey();

    const otaSearchDisplayNameRequest = buildOtaSearchDisplayNameRequest(
      validatedHotelsRatesSearchFlowContextQuery
    );

    const fetchedOtaSearchDisplayNameResponse =
      await fetchOtaSearchDisplayNameResponse({
        searchApiKey,
        otaSearchDisplayNameRequest
      });

    const parsedOtaSearchDisplayNameResponse =
      parseOtaSearchDisplayNameResponse({
        fetchedOtaSearchDisplayNameResponse,
        validatedHotelsRatesSearchFlowContextQuery
      });

    const otaSearchDisplayNameResponseShapeSummary =
      buildOtaSearchDisplayNameResponseShapeSummary({
        fetchedOtaSearchDisplayNameResponse,
        parsedOtaSearchDisplayNameResponse
      });

    console.log("OTA_SEARCH parseOtaSearchDisplayNameResponse shape summary", {
      otaSearchTopLevelKeys:
        otaSearchDisplayNameResponseShapeSummary.otaSearchTopLevelKeys,
      otaSearchPropertyCount:
        otaSearchDisplayNameResponseShapeSummary.otaSearchPropertyCount,
      firstOtaSearchPropertyKeys:
        otaSearchDisplayNameResponseShapeSummary.firstOtaSearchPropertyKeys,
      firstOtaSearchPriceSourceKeys:
        otaSearchDisplayNameResponseShapeSummary.firstOtaSearchPriceSourceKeys,
      firstOtaSearchRoomKeys:
        otaSearchDisplayNameResponseShapeSummary.firstOtaSearchRoomKeys,
      firstOtaSearchPropertyPriceSourceCount:
        otaSearchDisplayNameResponseShapeSummary.firstOtaSearchPropertyPriceSourceCount,
      firstOtaSearchPriceSourceRoomCount:
        otaSearchDisplayNameResponseShapeSummary.firstOtaSearchPriceSourceRoomCount,
      firstOtaSearchPropertyHasName:
        otaSearchDisplayNameResponseShapeSummary.firstOtaSearchPropertyHasName,
      firstOtaSearchPropertyHasAddress:
        otaSearchDisplayNameResponseShapeSummary.firstOtaSearchPropertyHasAddress,
      firstOtaSearchPropertyHasTotalPrice:
        otaSearchDisplayNameResponseShapeSummary.firstOtaSearchPropertyHasTotalPrice,
      firstOtaSearchPropertyHasRatePerNight:
        otaSearchDisplayNameResponseShapeSummary.firstOtaSearchPropertyHasRatePerNight,
      firstOtaSearchPropertyHasPricesArray:
        otaSearchDisplayNameResponseShapeSummary.firstOtaSearchPropertyHasPricesArray,
      firstOtaSearchPropertyHasOffersArray:
        otaSearchDisplayNameResponseShapeSummary.firstOtaSearchPropertyHasOffersArray,
      parsedOtaSearchDisplayNameResponseCount:
        parsedOtaSearchDisplayNameResponse.length,
      parsedOtaSearchHotelNameCount:
        otaSearchDisplayNameResponseShapeSummary.parsedOtaSearchHotelNameCount,
      parsedOtaSearchHotelAddressCount:
        otaSearchDisplayNameResponseShapeSummary.parsedOtaSearchHotelAddressCount,
      parsedOtaSearchRoomNameCount:
        otaSearchDisplayNameResponseShapeSummary.parsedOtaSearchRoomNameCount,
      parsedOtaSearchMinCurrentPriceCount:
        otaSearchDisplayNameResponseShapeSummary.parsedOtaSearchMinCurrentPriceCount,
      parsedOtaSearchCurrencyCount:
        otaSearchDisplayNameResponseShapeSummary.parsedOtaSearchCurrencyCount,
      parsedOtaSearchTaxesAndFeesCount:
        otaSearchDisplayNameResponseShapeSummary.parsedOtaSearchTaxesAndFeesCount,
      parsedOtaSearchBoardNameCount:
        otaSearchDisplayNameResponseShapeSummary.parsedOtaSearchBoardNameCount,
      parsedOtaSearchBoardTypeCount:
        otaSearchDisplayNameResponseShapeSummary.parsedOtaSearchBoardTypeCount,
      parsedOtaSearchRefundableTagCount:
        otaSearchDisplayNameResponseShapeSummary.parsedOtaSearchRefundableTagCount
    });

    const builtOtaSearchMinCurrentPriceIndex =
      buildOtaSearchMinCurrentPriceIndex({
        getHotelsRatesJson,
        validatedHotelsRatesSearchFlowContextQuery,
        parsedOtaSearchDisplayNameResponse
      });

    console.log("OTA_SEARCH resolveOtaSearchMinCurrentPriceIndex summary", {
      getHotelsRatesDataCount:
        builtOtaSearchMinCurrentPriceIndex.getHotelsRatesDataCount,
      getHotelsRatesHotelsCount:
        builtOtaSearchMinCurrentPriceIndex.getHotelsRatesHotelsCount,
      otaSearchDisplayNameRequestOk: true,
      parsedOtaSearchDisplayNameResponseCount:
        parsedOtaSearchDisplayNameResponse.length,
      otaSearchMinCurrentPriceMatchedCount:
        builtOtaSearchMinCurrentPriceIndex.otaSearchMinCurrentPriceMatchedCount,
      otaSearchMinCurrentPriceNullCount:
        builtOtaSearchMinCurrentPriceIndex.otaSearchMinCurrentPriceNullCount,
      otaSearchBusinessKeyRejectedCount:
        builtOtaSearchMinCurrentPriceIndex.otaSearchBusinessKeyRejectedCount,
      otaSearchCurrencyRejectedCount:
        builtOtaSearchMinCurrentPriceIndex.otaSearchCurrencyRejectedCount,
      otaSearchRoomNameMissingCount:
        builtOtaSearchMinCurrentPriceIndex.otaSearchRoomNameMissingCount
    });

    return builtOtaSearchMinCurrentPriceIndex.otaSearchMinCurrentPriceIndex;
  } catch (error) {
    console.log("OTA_SEARCH resolveOtaSearchMinCurrentPriceIndex failed", {
      otaSearchDisplayNameRequestOk: false,
      errorMessage: error?.message || String(error),
      getHotelsRatesDataCount: Array.isArray(getHotelsRatesJson?.data)
        ? getHotelsRatesJson.data.length
        : 0,
      getHotelsRatesHotelsCount: Array.isArray(getHotelsRatesJson?.hotels)
        ? getHotelsRatesJson.hotels.length
        : 0
    });

    return emptyOtaSearchMinCurrentPriceIndex;
  }
}

async function getSearchApiKey() {
  const searchApiKeySecretValue = await getSecretValue(
    SEARCHAPI_API_KEY_SECRET_NAME
  );

  const normalizedSearchApiKey = normalizeText(searchApiKeySecretValue?.value);

  if (!normalizedSearchApiKey) {
    throw new Error("SEARCHAPI_API_KEY secret must be set.");
  }

  return normalizedSearchApiKey;
}

function buildOtaSearchDisplayNameRequest(
  validatedHotelsRatesSearchFlowContextQuery
) {
  const otaSearchDisplayNameRequest = {
    engine: SEARCHAPI_ENGINE,
    q: validatedHotelsRatesSearchFlowContextQuery.displayName,
    check_in_date: validatedHotelsRatesSearchFlowContextQuery.checkin,
    check_out_date: validatedHotelsRatesSearchFlowContextQuery.checkout,
    currency: validatedHotelsRatesSearchFlowContextQuery.currency,
    hl: validatedHotelsRatesSearchFlowContextQuery.language,
    gl: DEFAULT_SEARCHAPI_COUNTRY_CODE,
    adults: calculateOtaSearchDisplayNameRequestAdultCount(
      validatedHotelsRatesSearchFlowContextQuery
    ),
    rooms: validatedHotelsRatesSearchFlowContextQuery.rooms
  };

  const otaSearchDisplayNameRequestChildrenAges =
    buildOtaSearchDisplayNameRequestChildrenAges(
      validatedHotelsRatesSearchFlowContextQuery
    );

  if (otaSearchDisplayNameRequestChildrenAges.length) {
    otaSearchDisplayNameRequest.children_ages =
      otaSearchDisplayNameRequestChildrenAges.join(",");
  }

  return otaSearchDisplayNameRequest;
}

async function fetchOtaSearchDisplayNameResponse({
  searchApiKey,
  otaSearchDisplayNameRequest
}) {
  const otaSearchDisplayNameRequestSearchParams = new URLSearchParams();

  for (const [
    otaSearchDisplayNameRequestKey,
    otaSearchDisplayNameRequestValue
  ] of Object.entries(otaSearchDisplayNameRequest)) {
    if (
      otaSearchDisplayNameRequestValue === null ||
      otaSearchDisplayNameRequestValue === undefined ||
      otaSearchDisplayNameRequestValue === ""
    ) {
      continue;
    }

    otaSearchDisplayNameRequestSearchParams.set(
      otaSearchDisplayNameRequestKey,
      String(otaSearchDisplayNameRequestValue)
    );
  }

  otaSearchDisplayNameRequestSearchParams.set("api_key", searchApiKey);

  const fetchedOtaSearchDisplayNameHttpResponse = await fetch(
    `${SEARCHAPI_BASE_URL}?${otaSearchDisplayNameRequestSearchParams.toString()}`,
    {
      method: "GET"
    }
  );

  const fetchedOtaSearchDisplayNameResponse =
    await fetchedOtaSearchDisplayNameHttpResponse.json();

  if (!fetchedOtaSearchDisplayNameHttpResponse.ok) {
    throw new Error(
      `SearchApi Google Hotels request failed with status ${fetchedOtaSearchDisplayNameHttpResponse.status}.`
    );
  }

  return fetchedOtaSearchDisplayNameResponse;
}

function parseOtaSearchDisplayNameResponse({
  fetchedOtaSearchDisplayNameResponse,
  validatedHotelsRatesSearchFlowContextQuery
}) {
  const otaSearchProperties = [
    ...normalizeArray(fetchedOtaSearchDisplayNameResponse?.properties),
    ...normalizeArray(fetchedOtaSearchDisplayNameResponse?.hotels),
    ...normalizeArray(fetchedOtaSearchDisplayNameResponse?.results)
  ];

  const parsedOtaSearchDisplayNameResponse = [];

  for (const otaSearchProperty of otaSearchProperties) {
    const parsedOtaSearchPropertyRows = parseOtaSearchPropertyRows({
      otaSearchProperty,
      validatedHotelsRatesSearchFlowContextQuery
    });

    parsedOtaSearchDisplayNameResponse.push(...parsedOtaSearchPropertyRows);
  }

  return parsedOtaSearchDisplayNameResponse;
}

function parseOtaSearchPropertyRows({
  otaSearchProperty,
  validatedHotelsRatesSearchFlowContextQuery
}) {
  const otaSearchPropertyPriceSources = [
    ...normalizeArray(otaSearchProperty?.featured_offers),
    ...normalizeArray(otaSearchProperty?.all_offers),
    ...normalizeArray(otaSearchProperty?.offers),
    ...normalizeArray(otaSearchProperty?.prices),
    ...normalizeArray(otaSearchProperty?.featured_prices)
  ];

  const otaSearchPropertyRows = [];

  if (!otaSearchPropertyPriceSources.length) {
    otaSearchPropertyRows.push(
      buildParsedOtaSearchDisplayNameResponseRow({
        otaSearchProperty,
        otaSearchPriceSource: otaSearchProperty,
        otaSearchRoom: null,
        validatedHotelsRatesSearchFlowContextQuery
      })
    );

    return otaSearchPropertyRows;
  }

  for (const otaSearchPriceSource of otaSearchPropertyPriceSources) {
    const otaSearchRooms = [
      ...normalizeArray(otaSearchPriceSource?.rooms),
      ...normalizeArray(otaSearchPriceSource?.room_options),
      ...normalizeArray(otaSearchPriceSource?.roomTypes)
    ];

    if (!otaSearchRooms.length) {
      otaSearchPropertyRows.push(
        buildParsedOtaSearchDisplayNameResponseRow({
          otaSearchProperty,
          otaSearchPriceSource,
          otaSearchRoom: null,
          validatedHotelsRatesSearchFlowContextQuery
        })
      );

      continue;
    }

    for (const otaSearchRoom of otaSearchRooms) {
      otaSearchPropertyRows.push(
        buildParsedOtaSearchDisplayNameResponseRow({
          otaSearchProperty,
          otaSearchPriceSource,
          otaSearchRoom,
          validatedHotelsRatesSearchFlowContextQuery
        })
      );
    }
  }

  return otaSearchPropertyRows;
}

function buildParsedOtaSearchDisplayNameResponseRow({
  otaSearchProperty,
  otaSearchPriceSource,
  otaSearchRoom,
  validatedHotelsRatesSearchFlowContextQuery
}) {
  const otaSearchMinCurrentPrice = resolveOtaSearchMinCurrentPrice([
    otaSearchRoom,
    otaSearchPriceSource,
    otaSearchProperty
  ]);

  const otaSearchCurrency =
    resolveOtaSearchCurrency([
      otaSearchRoom,
      otaSearchPriceSource,
      otaSearchProperty
    ]) || validatedHotelsRatesSearchFlowContextQuery.currency;

  return {
    hotelName:
      normalizeText(otaSearchProperty?.name) ||
      normalizeText(otaSearchProperty?.title) ||
      normalizeText(otaSearchProperty?.hotel_name) ||
      null,
    hotelAddress:
      normalizeText(otaSearchProperty?.address) ||
      normalizeText(otaSearchProperty?.formatted_address) ||
      normalizeText(otaSearchProperty?.formattedAddress) ||
      normalizeText(otaSearchProperty?.location) ||
      null,
    roomName:
      normalizeText(otaSearchRoom?.name) ||
      normalizeText(otaSearchRoom?.room_name) ||
      normalizeText(otaSearchRoom?.roomName) ||
      normalizeText(otaSearchPriceSource?.room_name) ||
      normalizeText(otaSearchPriceSource?.roomName) ||
      null,

    currency: normalizeText(otaSearchCurrency).toUpperCase() || null,
    language: validatedHotelsRatesSearchFlowContextQuery.language,

    rooms: validatedHotelsRatesSearchFlowContextQuery.rooms,
    adultCount: calculateOtaSearchDisplayNameRequestAdultCount(
      validatedHotelsRatesSearchFlowContextQuery
    ),
    childCount: buildOtaSearchDisplayNameRequestChildrenAges(
      validatedHotelsRatesSearchFlowContextQuery
    ).length,
    childrenAges: buildOtaSearchDisplayNameRequestChildrenAges(
      validatedHotelsRatesSearchFlowContextQuery
    ),

    checkin: validatedHotelsRatesSearchFlowContextQuery.checkin,
    checkout: validatedHotelsRatesSearchFlowContextQuery.checkout,
    displayName: validatedHotelsRatesSearchFlowContextQuery.displayName,

    otaSearchMinCurrentPrice,
    otaSearchMinCurrentPriceTaxesAndFees:
      otaSearchRoom?.taxes_and_fees ||
      otaSearchRoom?.taxesAndFees ||
      otaSearchPriceSource?.taxes_and_fees ||
      otaSearchPriceSource?.taxesAndFees ||
      otaSearchProperty?.taxes_and_fees ||
      otaSearchProperty?.taxesAndFees ||
      null,

    boardName:
      normalizeText(otaSearchRoom?.boardName) ||
      normalizeText(otaSearchRoom?.board_name) ||
      normalizeText(otaSearchPriceSource?.boardName) ||
      normalizeText(otaSearchPriceSource?.board_name) ||
      null,
    boardType:
      normalizeText(otaSearchRoom?.boardType) ||
      normalizeText(otaSearchRoom?.board_type) ||
      normalizeText(otaSearchPriceSource?.boardType) ||
      normalizeText(otaSearchPriceSource?.board_type) ||
      null,
    refundableTag:
      normalizeText(otaSearchRoom?.refundableTag).toUpperCase() ||
      normalizeText(otaSearchRoom?.refundable_tag).toUpperCase() ||
      normalizeText(otaSearchPriceSource?.refundableTag).toUpperCase() ||
      normalizeText(otaSearchPriceSource?.refundable_tag).toUpperCase() ||
      null
  };
}

function buildOtaSearchDisplayNameResponseShapeSummary({
  fetchedOtaSearchDisplayNameResponse,
  parsedOtaSearchDisplayNameResponse
}) {
  const otaSearchProperties = [
    ...normalizeArray(fetchedOtaSearchDisplayNameResponse?.properties),
    ...normalizeArray(fetchedOtaSearchDisplayNameResponse?.hotels),
    ...normalizeArray(fetchedOtaSearchDisplayNameResponse?.results)
  ];

  const firstOtaSearchProperty = otaSearchProperties[0] || null;

  const firstOtaSearchPropertyPriceSources = firstOtaSearchProperty
    ? [
        ...normalizeArray(firstOtaSearchProperty?.featured_offers),
        ...normalizeArray(firstOtaSearchProperty?.all_offers),
        ...normalizeArray(firstOtaSearchProperty?.offers),
        ...normalizeArray(firstOtaSearchProperty?.prices),
        ...normalizeArray(firstOtaSearchProperty?.featured_prices)
      ]
    : [];

  const firstOtaSearchPriceSource =
    firstOtaSearchPropertyPriceSources[0] || null;

  const firstOtaSearchPriceSourceRooms = firstOtaSearchPriceSource
    ? [
        ...normalizeArray(firstOtaSearchPriceSource?.rooms),
        ...normalizeArray(firstOtaSearchPriceSource?.room_options),
        ...normalizeArray(firstOtaSearchPriceSource?.roomTypes)
      ]
    : [];

  const firstOtaSearchRoom = firstOtaSearchPriceSourceRooms[0] || null;

  return {
    otaSearchTopLevelKeys: Object.keys(
      fetchedOtaSearchDisplayNameResponse || {}
    ).slice(0, 40),
    otaSearchPropertyCount: otaSearchProperties.length,
    firstOtaSearchPropertyKeys: firstOtaSearchProperty
      ? Object.keys(firstOtaSearchProperty).slice(0, 40)
      : [],
    firstOtaSearchPriceSourceKeys: firstOtaSearchPriceSource
      ? Object.keys(firstOtaSearchPriceSource).slice(0, 40)
      : [],
    firstOtaSearchRoomKeys: firstOtaSearchRoom
      ? Object.keys(firstOtaSearchRoom).slice(0, 40)
      : [],
    firstOtaSearchPropertyPriceSourceCount:
      firstOtaSearchPropertyPriceSources.length,
    firstOtaSearchPriceSourceRoomCount:
      firstOtaSearchPriceSourceRooms.length,
    firstOtaSearchPropertyHasName: Boolean(
      normalizeText(firstOtaSearchProperty?.name) ||
        normalizeText(firstOtaSearchProperty?.title) ||
        normalizeText(firstOtaSearchProperty?.hotel_name)
    ),
    firstOtaSearchPropertyHasAddress: Boolean(
      normalizeText(firstOtaSearchProperty?.address) ||
        normalizeText(firstOtaSearchProperty?.formatted_address) ||
        normalizeText(firstOtaSearchProperty?.formattedAddress) ||
        normalizeText(firstOtaSearchProperty?.location)
    ),
    firstOtaSearchPropertyHasTotalPrice: Boolean(
      firstOtaSearchProperty?.total_price
    ),
    firstOtaSearchPropertyHasRatePerNight: Boolean(
      firstOtaSearchProperty?.rate_per_night ||
        firstOtaSearchProperty?.ratePerNight
    ),
    firstOtaSearchPropertyHasPricesArray: Array.isArray(
      firstOtaSearchProperty?.prices
    ),
    firstOtaSearchPropertyHasOffersArray:
      Array.isArray(firstOtaSearchProperty?.featured_offers) ||
      Array.isArray(firstOtaSearchProperty?.all_offers) ||
      Array.isArray(firstOtaSearchProperty?.offers),
    parsedOtaSearchHotelNameCount:
      parsedOtaSearchDisplayNameResponse.filter((row) => row?.hotelName)
        .length,
    parsedOtaSearchHotelAddressCount:
      parsedOtaSearchDisplayNameResponse.filter((row) => row?.hotelAddress)
        .length,
    parsedOtaSearchRoomNameCount:
      parsedOtaSearchDisplayNameResponse.filter((row) => row?.roomName).length,
    parsedOtaSearchMinCurrentPriceCount:
      parsedOtaSearchDisplayNameResponse.filter((row) =>
        Number.isFinite(normalizeNumberOrNull(row?.otaSearchMinCurrentPrice))
      ).length,
    parsedOtaSearchCurrencyCount:
      parsedOtaSearchDisplayNameResponse.filter((row) => row?.currency).length,
    parsedOtaSearchTaxesAndFeesCount:
      parsedOtaSearchDisplayNameResponse.filter(
        (row) => row?.otaSearchMinCurrentPriceTaxesAndFees
      ).length,
    parsedOtaSearchBoardNameCount:
      parsedOtaSearchDisplayNameResponse.filter((row) => row?.boardName)
        .length,
    parsedOtaSearchBoardTypeCount:
      parsedOtaSearchDisplayNameResponse.filter((row) => row?.boardType)
        .length,
    parsedOtaSearchRefundableTagCount:
      parsedOtaSearchDisplayNameResponse.filter((row) => row?.refundableTag)
        .length
  };
}

function buildOtaSearchMinCurrentPriceIndex({
  getHotelsRatesJson,
  validatedHotelsRatesSearchFlowContextQuery,
  parsedOtaSearchDisplayNameResponse
}) {
  const otaSearchMinCurrentPriceIndex =
    buildEmptyOtaSearchMinCurrentPriceIndex(getHotelsRatesJson);

  const getHotelsRatesData = Array.isArray(getHotelsRatesJson?.data)
    ? getHotelsRatesJson.data
    : [];

  const getHotelsRatesHotels = Array.isArray(getHotelsRatesJson?.hotels)
    ? getHotelsRatesJson.hotels
    : [];

  const getHotelsRatesHotelById = new Map(
    getHotelsRatesHotels.map((hotelItem) => [
      normalizeText(hotelItem?.id),
      hotelItem
    ])
  );

  const parsedOtaSearchDisplayNameResponseByMatchingKey = new Map();

  let otaSearchRoomNameMissingCount = 0;

  for (const parsedOtaSearchDisplayNameResponseRow of parsedOtaSearchDisplayNameResponse) {
    if (!parsedOtaSearchDisplayNameResponseRow?.roomName) {
      otaSearchRoomNameMissingCount += 1;
    }

    const otaSearchMatchingKey = buildOtaSearchMatchingKey(
      parsedOtaSearchDisplayNameResponseRow
    );

    const otaSearchMinCurrentPrice = normalizeNumberOrNull(
      parsedOtaSearchDisplayNameResponseRow?.otaSearchMinCurrentPrice
    );

    if (!otaSearchMatchingKey || !Number.isFinite(otaSearchMinCurrentPrice)) {
      continue;
    }

    const existingParsedOtaSearchDisplayNameResponseRow =
      parsedOtaSearchDisplayNameResponseByMatchingKey.get(otaSearchMatchingKey);

    const existingOtaSearchMinCurrentPrice = normalizeNumberOrNull(
      existingParsedOtaSearchDisplayNameResponseRow?.otaSearchMinCurrentPrice
    );

    if (
      !Number.isFinite(existingOtaSearchMinCurrentPrice) ||
      otaSearchMinCurrentPrice < existingOtaSearchMinCurrentPrice
    ) {
      parsedOtaSearchDisplayNameResponseByMatchingKey.set(
        otaSearchMatchingKey,
        parsedOtaSearchDisplayNameResponseRow
      );
    }
  }

  let otaSearchMinCurrentPriceMatchedCount = 0;
  let otaSearchMinCurrentPriceNullCount = 0;
  let otaSearchBusinessKeyRejectedCount = 0;
  let otaSearchCurrencyRejectedCount = 0;

  for (const dataItem of getHotelsRatesData) {
    const hotelId = normalizeText(dataItem?.hotelId);

    if (!hotelId) {
      continue;
    }

    const getHotelsRatesHotel = getHotelsRatesHotelById.get(hotelId) || null;
    const getHotelsRatesRate = dataItem?.roomTypes?.[0]?.rates?.[0] || null;

    const liteApiOtaSearchMatchingRow = {
      hotelName: normalizeText(getHotelsRatesHotel?.name) || null,
      hotelAddress: normalizeText(getHotelsRatesHotel?.address) || null,
      roomName: normalizeText(getHotelsRatesRate?.name) || null,

      currency:
        normalizeText(
          getHotelsRatesRate?.retailRate?.total?.[0]?.currency
        ).toUpperCase() || null,
      language: validatedHotelsRatesSearchFlowContextQuery.language,

      rooms: validatedHotelsRatesSearchFlowContextQuery.rooms,
      adultCount: normalizePositiveIntegerOrNull(getHotelsRatesRate?.adultCount),
      childCount: normalizeIntegerOrNull(getHotelsRatesRate?.childCount),
      childrenAges: Array.isArray(getHotelsRatesRate?.childrenAges)
        ? getHotelsRatesRate.childrenAges
        : [],

      checkin: validatedHotelsRatesSearchFlowContextQuery.checkin,
      checkout: validatedHotelsRatesSearchFlowContextQuery.checkout,
      displayName: validatedHotelsRatesSearchFlowContextQuery.displayName,

      boardName: normalizeText(getHotelsRatesRate?.boardName) || null,
      boardType: normalizeText(getHotelsRatesRate?.boardType) || null,
      refundableTag:
        normalizeText(
          getHotelsRatesRate?.cancellationPolicies?.refundableTag
        ).toUpperCase() || null
    };

    const liteApiOtaSearchMatchingKey = buildOtaSearchMatchingKey(
      liteApiOtaSearchMatchingRow
    );

    if (!liteApiOtaSearchMatchingKey) {
      otaSearchBusinessKeyRejectedCount += 1;
      otaSearchMinCurrentPriceIndex[hotelId] = null;
      continue;
    }

    const matchedParsedOtaSearchDisplayNameResponseRow =
      parsedOtaSearchDisplayNameResponseByMatchingKey.get(
        liteApiOtaSearchMatchingKey
      ) || null;

    if (!matchedParsedOtaSearchDisplayNameResponseRow) {
      otaSearchBusinessKeyRejectedCount += 1;
      otaSearchMinCurrentPriceIndex[hotelId] = null;
      continue;
    }

    if (
      !isOtaSearchMatchingRowCompatibleWithLiteApiMatchingRow({
        liteApiOtaSearchMatchingRow,
        parsedOtaSearchDisplayNameResponseRow:
          matchedParsedOtaSearchDisplayNameResponseRow
      })
    ) {
      otaSearchCurrencyRejectedCount += 1;
      otaSearchMinCurrentPriceIndex[hotelId] = null;
      continue;
    }

    const otaSearchMinCurrentPrice = normalizeNumberOrNull(
      matchedParsedOtaSearchDisplayNameResponseRow.otaSearchMinCurrentPrice
    );

    if (!Number.isFinite(otaSearchMinCurrentPrice)) {
      otaSearchMinCurrentPriceNullCount += 1;
      otaSearchMinCurrentPriceIndex[hotelId] = null;
      continue;
    }

    otaSearchMinCurrentPriceMatchedCount += 1;
    otaSearchMinCurrentPriceIndex[hotelId] = otaSearchMinCurrentPrice;
  }

  for (const otaSearchMinCurrentPrice of Object.values(
    otaSearchMinCurrentPriceIndex
  )) {
    if (!Number.isFinite(normalizeNumberOrNull(otaSearchMinCurrentPrice))) {
      otaSearchMinCurrentPriceNullCount += 1;
    }
  }

  return {
    otaSearchMinCurrentPriceIndex,
    getHotelsRatesDataCount: getHotelsRatesData.length,
    getHotelsRatesHotelsCount: getHotelsRatesHotels.length,
    otaSearchMinCurrentPriceMatchedCount,
    otaSearchMinCurrentPriceNullCount,
    otaSearchBusinessKeyRejectedCount,
    otaSearchCurrencyRejectedCount,
    otaSearchRoomNameMissingCount
  };
}

function buildEmptyOtaSearchMinCurrentPriceIndex(getHotelsRatesJson) {
  const otaSearchMinCurrentPriceIndex = {};
  const getHotelsRatesData = Array.isArray(getHotelsRatesJson?.data)
    ? getHotelsRatesJson.data
    : [];

  for (const dataItem of getHotelsRatesData) {
    const hotelId = normalizeText(dataItem?.hotelId);

    if (hotelId) {
      otaSearchMinCurrentPriceIndex[hotelId] = null;
    }
  }

  return otaSearchMinCurrentPriceIndex;
}

function isOtaSearchMatchingRowCompatibleWithLiteApiMatchingRow({
  liteApiOtaSearchMatchingRow,
  parsedOtaSearchDisplayNameResponseRow
}) {
  if (
    normalizeText(liteApiOtaSearchMatchingRow?.currency).toUpperCase() !==
    normalizeText(parsedOtaSearchDisplayNameResponseRow?.currency).toUpperCase()
  ) {
    return false;
  }

  if (
    normalizeText(liteApiOtaSearchMatchingRow?.checkin) !==
      normalizeText(parsedOtaSearchDisplayNameResponseRow?.checkin) ||
    normalizeText(liteApiOtaSearchMatchingRow?.checkout) !==
      normalizeText(parsedOtaSearchDisplayNameResponseRow?.checkout)
  ) {
    return false;
  }

  if (
    normalizeIntegerOrNull(liteApiOtaSearchMatchingRow?.rooms) !==
      normalizeIntegerOrNull(parsedOtaSearchDisplayNameResponseRow?.rooms) ||
    normalizeIntegerOrNull(liteApiOtaSearchMatchingRow?.adultCount) !==
      normalizeIntegerOrNull(parsedOtaSearchDisplayNameResponseRow?.adultCount) ||
    normalizeIntegerOrNull(liteApiOtaSearchMatchingRow?.childCount) !==
      normalizeIntegerOrNull(parsedOtaSearchDisplayNameResponseRow?.childCount)
  ) {
    return false;
  }

  return areNumberArraysEqual(
    liteApiOtaSearchMatchingRow?.childrenAges,
    parsedOtaSearchDisplayNameResponseRow?.childrenAges
  );
}

function buildOtaSearchMatchingKey({ hotelName, hotelAddress, roomName }) {
  const normalizedHotelName = normalizeComparableText(hotelName);
  const normalizedHotelAddress = normalizeComparableText(hotelAddress);
  const normalizedRoomName = normalizeComparableText(roomName);

  if (!normalizedHotelName || !normalizedHotelAddress || !normalizedRoomName) {
    return null;
  }

  return [
    normalizedHotelName,
    normalizedHotelAddress,
    normalizedRoomName
  ].join("::");
}

function normalizeComparableText(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveOtaSearchMinCurrentPrice(values) {
  const otaSearchMinCurrentPriceCandidates = [];

  for (const value of values) {
    otaSearchMinCurrentPriceCandidates.push(
      normalizeNumberOrNull(value?.total_price?.extracted_price),
      normalizeNumberOrNull(value?.total_price?.extracted_lowest),
      normalizeNumberOrNull(value?.total_price?.amount),
      normalizeNumberOrNull(value?.total_price),
      normalizeNumberOrNull(value?.total_rate?.extracted_price),
      normalizeNumberOrNull(value?.total_rate?.extracted_lowest),
      normalizeNumberOrNull(value?.total_rate?.amount),
      normalizeNumberOrNull(value?.total_rate),
      normalizeNumberOrNull(value?.price?.extracted_price),
      normalizeNumberOrNull(value?.price?.extracted_lowest),
      normalizeNumberOrNull(value?.price?.amount),
      normalizeNumberOrNull(value?.price),
      normalizeNumberOrNull(value?.extracted_price),
      normalizeNumberOrNull(value?.extracted_lowest)
    );
  }

  const normalizedOtaSearchMinCurrentPriceCandidates =
    otaSearchMinCurrentPriceCandidates.filter(
      (otaSearchMinCurrentPriceCandidate) =>
        Number.isFinite(otaSearchMinCurrentPriceCandidate) &&
        otaSearchMinCurrentPriceCandidate > 0
    );

  if (!normalizedOtaSearchMinCurrentPriceCandidates.length) {
    return null;
  }

  return Math.min(...normalizedOtaSearchMinCurrentPriceCandidates);
}

function resolveOtaSearchCurrency(values) {
  for (const value of values) {
    const normalizedCurrency =
      normalizeText(value?.currency).toUpperCase() ||
      normalizeText(value?.total_price?.currency).toUpperCase() ||
      normalizeText(value?.total_rate?.currency).toUpperCase() ||
      normalizeText(value?.price?.currency).toUpperCase();

    if (normalizedCurrency) {
      return normalizedCurrency;
    }
  }

  return null;
}

function calculateOtaSearchDisplayNameRequestAdultCount(
  validatedHotelsRatesSearchFlowContextQuery
) {
  return validatedHotelsRatesSearchFlowContextQuery.roomAdultCounts.reduce(
    (adultCountTotal, roomAdultCount) => adultCountTotal + roomAdultCount,
    0
  );
}

function buildOtaSearchDisplayNameRequestChildrenAges(
  validatedHotelsRatesSearchFlowContextQuery
) {
  const otaSearchDisplayNameRequestChildrenAges = [];

  validatedHotelsRatesSearchFlowContextQuery.roomChildrenAgesByRoomNumber.forEach(
    (roomChildrenAges) => {
      otaSearchDisplayNameRequestChildrenAges.push(...roomChildrenAges);
    }
  );

  return otaSearchDisplayNameRequestChildrenAges;
}

function areNumberArraysEqual(firstArray, secondArray) {
  const normalizedFirstArray = Array.isArray(firstArray) ? firstArray : [];
  const normalizedSecondArray = Array.isArray(secondArray) ? secondArray : [];

  if (normalizedFirstArray.length !== normalizedSecondArray.length) {
    return false;
  }

  return normalizedFirstArray.every(
    (firstArrayItem, firstArrayIndex) =>
      normalizeIntegerOrNull(firstArrayItem) ===
      normalizeIntegerOrNull(normalizedSecondArray[firstArrayIndex])
  );
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  if (value === null || value === undefined || typeof value === "object") {
    return "";
  }

  return String(value).trim();
}

function normalizeNumberOrNull(value) {
  const normalizedText = normalizeText(value);

  if (!normalizedText) {
    return null;
  }

  const normalizedNumberText = normalizedText.replace(/[^0-9.,-]/g, "");

  if (!normalizedNumberText) {
    return null;
  }

  const normalizedNumber = Number(normalizedNumberText.replace(/,/g, ""));
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
