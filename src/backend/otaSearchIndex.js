import { elevate } from "wix-auth";
import { secrets } from "wix-secrets-backend.v2";
import { fetch } from "wix-fetch";

const SERPAPI_BASE_URL = "https://serpapi.com/search.json";
const SERPAPI_API_KEY_SECRET_NAME = "SERPAPI_API_KEY";

const SERPAPI_ENGINE = "google_hotels";
const DEFAULT_SERPAPI_COUNTRY_CODE = "tr";

const getSecretValue = elevate(secrets.getSecretValue);

export async function resolveOtaSearchMinCurrentPriceIndex({
  getHotelsRatesJson,
  validatedHotelsRatesSearchFlowContextQuery
}) {
  const emptyOtaSearchMinCurrentPriceIndex =
    buildEmptyOtaSearchMinCurrentPriceIndex(getHotelsRatesJson);

  try {
    const serpApiKey = await getSerpApiKey();

    const liteApiRateMatchingRows = buildLiteApiRateMatchingRows({
      getHotelsRatesJson
    });

    const otaSearchDisplayNameRequest = buildOtaSearchDisplayNameRequest(
      validatedHotelsRatesSearchFlowContextQuery
    );

    const fetchedOtaSearchDisplayNameResponse =
      await fetchOtaSearchDisplayNameResponse({
        serpApiKey,
        otaSearchDisplayNameRequest
      });

    const parsedOtaSearchPropertyTokenCandidateRows =
      parseOtaSearchPropertyTokenCandidateRows({
        fetchedOtaSearchDisplayNameResponse,
        liteApiRateMatchingRows
      });

    console.log("OTA_SEARCH property token discovery summary", {
      liteApiHotelCount:
        parsedOtaSearchPropertyTokenCandidateRows.liteApiHotelCount,
      serpApiSearchPropertyCount:
        parsedOtaSearchPropertyTokenCandidateRows.serpApiSearchPropertyCount,
      propertyTokenCandidateCount:
        parsedOtaSearchPropertyTokenCandidateRows
          .otaSearchPropertyTokenCandidateRows.length,
      propertyTokenMissingCount:
        parsedOtaSearchPropertyTokenCandidateRows.propertyTokenMissingCount,
      propertyTokenHotelNameMatchedCount:
        parsedOtaSearchPropertyTokenCandidateRows
          .propertyTokenHotelNameMatchedCount,
      propertyTokenHotelNameRejectedCount:
        parsedOtaSearchPropertyTokenCandidateRows
          .propertyTokenHotelNameRejectedCount,
      serpApiSearchPropertyNameMissingCount:
        parsedOtaSearchPropertyTokenCandidateRows
          .serpApiSearchPropertyNameMissingCount
    });

    const fetchedOtaSearchPropertyDetailsResponses =
      await fetchOtaSearchPropertyDetailsResponses({
        serpApiKey,
        otaSearchPropertyTokenCandidateRows:
          parsedOtaSearchPropertyTokenCandidateRows
            .otaSearchPropertyTokenCandidateRows,
        validatedHotelsRatesSearchFlowContextQuery
      });

    const parsedOtaSearchPropertyDetailsRateRows =
      parseOtaSearchPropertyDetailsRateRows({
        fetchedOtaSearchPropertyDetailsResponses,
        validatedHotelsRatesSearchFlowContextQuery
      });

    console.log("OTA_SEARCH property details fetch summary", {
      propertyTokenCandidateCount:
        parsedOtaSearchPropertyTokenCandidateRows
          .otaSearchPropertyTokenCandidateRows.length,
      propertyDetailsFetchSuccessCount:
        parsedOtaSearchPropertyDetailsRateRows.propertyDetailsFetchSuccessCount,
      propertyDetailsFetchFailedCount:
        parsedOtaSearchPropertyDetailsRateRows.propertyDetailsFetchFailedCount,
      propertyDetailsHotelAddressCount:
        parsedOtaSearchPropertyDetailsRateRows
          .propertyDetailsHotelAddressCount,
      propertyDetailsFeaturedPricesCount:
        parsedOtaSearchPropertyDetailsRateRows
          .propertyDetailsFeaturedPricesCount,
      propertyDetailsPricesCount:
        parsedOtaSearchPropertyDetailsRateRows.propertyDetailsPricesCount,
      propertyDetailsRoomCount:
        parsedOtaSearchPropertyDetailsRateRows.propertyDetailsRoomCount,
      propertyDetailsRateCount:
        parsedOtaSearchPropertyDetailsRateRows.propertyDetailsRateCount,
      otaSearchPropertyDetailsRateRowCount:
        parsedOtaSearchPropertyDetailsRateRows
          .otaSearchPropertyDetailsRateRows.length
    });

    const builtOtaSearchMinCurrentPriceIndex =
      buildOtaSearchMinCurrentPriceIndex({
        getHotelsRatesJson,
        liteApiRateMatchingRows,
        otaSearchPropertyDetailsRateRows:
          parsedOtaSearchPropertyDetailsRateRows
            .otaSearchPropertyDetailsRateRows
      });

    console.log("OTA_SEARCH strict rate matching summary", {
      liteApiRateMatchingRowCount:
        builtOtaSearchMinCurrentPriceIndex.liteApiRateMatchingRowCount,
      otaSearchPropertyDetailsRateRowCount:
        builtOtaSearchMinCurrentPriceIndex
          .otaSearchPropertyDetailsRateRowCount,
      hotelNameAddressMatchedCount:
        builtOtaSearchMinCurrentPriceIndex.hotelNameAddressMatchedCount,
      hotelNameAddressRejectedCount:
        builtOtaSearchMinCurrentPriceIndex.hotelNameAddressRejectedCount,
      rateNameMatchedCount:
        builtOtaSearchMinCurrentPriceIndex.rateNameMatchedCount,
      rateNameRejectedCount:
        builtOtaSearchMinCurrentPriceIndex.rateNameRejectedCount,
      otaSearchMinCurrentPriceMatchedCount:
        builtOtaSearchMinCurrentPriceIndex
          .otaSearchMinCurrentPriceMatchedCount,
      otaSearchMinCurrentPriceNullCount:
        builtOtaSearchMinCurrentPriceIndex.otaSearchMinCurrentPriceNullCount
    });

    return builtOtaSearchMinCurrentPriceIndex.otaSearchMinCurrentPriceIndex;
  } catch (error) {
    console.log("OTA_SEARCH resolveOtaSearchMinCurrentPriceIndex failed", {
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

async function getSerpApiKey() {
  const serpApiKeySecretValue = await getSecretValue(
    SERPAPI_API_KEY_SECRET_NAME
  );

  const normalizedSerpApiKey = normalizeText(serpApiKeySecretValue?.value);

  if (!normalizedSerpApiKey) {
    throw new Error("SERPAPI_API_KEY secret must be set.");
  }

  return normalizedSerpApiKey;
}

function buildOtaSearchDisplayNameRequest(
  validatedHotelsRatesSearchFlowContextQuery
) {
  const otaSearchDisplayNameRequest = {
    engine: SERPAPI_ENGINE,
    q: validatedHotelsRatesSearchFlowContextQuery.displayName,
    check_in_date: validatedHotelsRatesSearchFlowContextQuery.checkin,
    check_out_date: validatedHotelsRatesSearchFlowContextQuery.checkout,
    currency: validatedHotelsRatesSearchFlowContextQuery.currency,
    hl: validatedHotelsRatesSearchFlowContextQuery.language,
    gl: DEFAULT_SERPAPI_COUNTRY_CODE,
    adults: calculateOtaSearchDisplayNameRequestAdultCount(
      validatedHotelsRatesSearchFlowContextQuery
    ),
    children: calculateOtaSearchDisplayNameRequestChildCount(
      validatedHotelsRatesSearchFlowContextQuery
    )
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

function buildOtaSearchPropertyDetailsRequest({
  otaSearchPropertyTokenCandidateRow,
  validatedHotelsRatesSearchFlowContextQuery
}) {
  const otaSearchPropertyDetailsRequest = {
    engine: SERPAPI_ENGINE,
    q: validatedHotelsRatesSearchFlowContextQuery.displayName,
    property_token: otaSearchPropertyTokenCandidateRow.propertyToken,
    check_in_date: validatedHotelsRatesSearchFlowContextQuery.checkin,
    check_out_date: validatedHotelsRatesSearchFlowContextQuery.checkout,
    currency: validatedHotelsRatesSearchFlowContextQuery.currency,
    hl: validatedHotelsRatesSearchFlowContextQuery.language,
    gl: DEFAULT_SERPAPI_COUNTRY_CODE,
    adults: calculateOtaSearchDisplayNameRequestAdultCount(
      validatedHotelsRatesSearchFlowContextQuery
    ),
    children: calculateOtaSearchDisplayNameRequestChildCount(
      validatedHotelsRatesSearchFlowContextQuery
    )
  };

  const otaSearchPropertyDetailsRequestChildrenAges =
    buildOtaSearchDisplayNameRequestChildrenAges(
      validatedHotelsRatesSearchFlowContextQuery
    );

  if (otaSearchPropertyDetailsRequestChildrenAges.length) {
    otaSearchPropertyDetailsRequest.children_ages =
      otaSearchPropertyDetailsRequestChildrenAges.join(",");
  }

  return otaSearchPropertyDetailsRequest;
}

async function fetchOtaSearchDisplayNameResponse({
  serpApiKey,
  otaSearchDisplayNameRequest
}) {
  return fetchOtaSearchJsonResponse({
    serpApiKey,
    otaSearchRequest: otaSearchDisplayNameRequest
  });
}

async function fetchOtaSearchPropertyDetailsResponses({
  serpApiKey,
  otaSearchPropertyTokenCandidateRows,
  validatedHotelsRatesSearchFlowContextQuery
}) {
  return Promise.all(
    otaSearchPropertyTokenCandidateRows.map(
      async (otaSearchPropertyTokenCandidateRow) => {
        try {
          const otaSearchPropertyDetailsRequest =
            buildOtaSearchPropertyDetailsRequest({
              otaSearchPropertyTokenCandidateRow,
              validatedHotelsRatesSearchFlowContextQuery
            });

          const fetchedOtaSearchPropertyDetailsResponse =
            await fetchOtaSearchPropertyDetailsResponse({
              serpApiKey,
              otaSearchPropertyDetailsRequest
            });

          return {
            ok: true,
            otaSearchPropertyTokenCandidateRow,
            fetchedOtaSearchPropertyDetailsResponse
          };
        } catch (error) {
          return {
            ok: false,
            otaSearchPropertyTokenCandidateRow,
            errorMessage: error?.message || String(error)
          };
        }
      }
    )
  );
}

async function fetchOtaSearchPropertyDetailsResponse({
  serpApiKey,
  otaSearchPropertyDetailsRequest
}) {
  return fetchOtaSearchJsonResponse({
    serpApiKey,
    otaSearchRequest: otaSearchPropertyDetailsRequest
  });
}

async function fetchOtaSearchJsonResponse({ serpApiKey, otaSearchRequest }) {
  const otaSearchRequestSearchParams = new URLSearchParams();

  for (const [otaSearchRequestKey, otaSearchRequestValue] of Object.entries(
    otaSearchRequest
  )) {
    if (
      otaSearchRequestValue === null ||
      otaSearchRequestValue === undefined ||
      otaSearchRequestValue === ""
    ) {
      continue;
    }

    otaSearchRequestSearchParams.set(
      otaSearchRequestKey,
      String(otaSearchRequestValue)
    );
  }

  otaSearchRequestSearchParams.set("api_key", serpApiKey);

  const fetchedOtaSearchHttpResponse = await fetch(
    `${SERPAPI_BASE_URL}?${otaSearchRequestSearchParams.toString()}`,
    {
      method: "GET"
    }
  );

  const fetchedOtaSearchJsonResponse = await fetchedOtaSearchHttpResponse.json();

  if (!fetchedOtaSearchHttpResponse.ok) {
    throw new Error(
      `SerpApi Google Hotels request failed with status ${fetchedOtaSearchHttpResponse.status}.`
    );
  }

  if (fetchedOtaSearchJsonResponse?.error) {
    throw new Error(
      `SerpApi Google Hotels request failed: ${normalizeText(
        fetchedOtaSearchJsonResponse.error
      )}`
    );
  }

  return fetchedOtaSearchJsonResponse;
}

function parseOtaSearchPropertyTokenCandidateRows({
  fetchedOtaSearchDisplayNameResponse,
  liteApiRateMatchingRows
}) {
  const serpApiSearchProperties = [
    ...normalizeArray(fetchedOtaSearchDisplayNameResponse?.properties),
    ...normalizeArray(fetchedOtaSearchDisplayNameResponse?.hotels),
    ...normalizeArray(fetchedOtaSearchDisplayNameResponse?.results)
  ];

  const liteApiHotelNameComparableSet = new Set(
    liteApiRateMatchingRows
      .map((liteApiRateMatchingRow) =>
        normalizeComparableText(liteApiRateMatchingRow?.hotelName)
      )
      .filter(Boolean)
  );

  const otaSearchPropertyTokenCandidateRows = [];
  const seenPropertyTokenSet = new Set();

  let propertyTokenMissingCount = 0;
  let propertyTokenHotelNameMatchedCount = 0;
  let propertyTokenHotelNameRejectedCount = 0;
  let serpApiSearchPropertyNameMissingCount = 0;

  for (let searchRank = 0; searchRank < serpApiSearchProperties.length; searchRank += 1) {
    const serpApiSearchProperty = serpApiSearchProperties[searchRank];

    const hotelName =
      normalizeText(serpApiSearchProperty?.name) ||
      normalizeText(serpApiSearchProperty?.title) ||
      normalizeText(serpApiSearchProperty?.hotel_name) ||
      null;

    const hotelNameComparable = normalizeComparableText(hotelName);

    if (!hotelNameComparable) {
      serpApiSearchPropertyNameMissingCount += 1;
      continue;
    }

    const propertyToken =
      normalizeText(serpApiSearchProperty?.property_token) ||
      normalizeText(serpApiSearchProperty?.propertyToken) ||
      null;

    if (!propertyToken) {
      propertyTokenMissingCount += 1;
      continue;
    }

    if (!liteApiHotelNameComparableSet.has(hotelNameComparable)) {
      propertyTokenHotelNameRejectedCount += 1;
      continue;
    }

    if (seenPropertyTokenSet.has(propertyToken)) {
      continue;
    }

    seenPropertyTokenSet.add(propertyToken);
    propertyTokenHotelNameMatchedCount += 1;

    otaSearchPropertyTokenCandidateRows.push({
      propertyToken,
      hotelName,
      hotelNameComparable,
      gpsCoordinates: serpApiSearchProperty?.gps_coordinates || null,
      searchRank
    });
  }

  return {
    otaSearchPropertyTokenCandidateRows,
    liteApiHotelCount: liteApiHotelNameComparableSet.size,
    serpApiSearchPropertyCount: serpApiSearchProperties.length,
    propertyTokenMissingCount,
    propertyTokenHotelNameMatchedCount,
    propertyTokenHotelNameRejectedCount,
    serpApiSearchPropertyNameMissingCount
  };
}

function parseOtaSearchPropertyDetailsRateRows({
  fetchedOtaSearchPropertyDetailsResponses,
  validatedHotelsRatesSearchFlowContextQuery
}) {
  const otaSearchPropertyDetailsRateRows = [];

  let propertyDetailsFetchSuccessCount = 0;
  let propertyDetailsFetchFailedCount = 0;
  let propertyDetailsHotelAddressCount = 0;
  let propertyDetailsFeaturedPricesCount = 0;
  let propertyDetailsPricesCount = 0;
  let propertyDetailsRoomCount = 0;
  let propertyDetailsRateCount = 0;

  for (const fetchedOtaSearchPropertyDetailsResponse of fetchedOtaSearchPropertyDetailsResponses) {
    if (!fetchedOtaSearchPropertyDetailsResponse?.ok) {
      propertyDetailsFetchFailedCount += 1;
      continue;
    }

    propertyDetailsFetchSuccessCount += 1;

    const otaSearchPropertyDetails = resolveOtaSearchPropertyDetailsObject(
      fetchedOtaSearchPropertyDetailsResponse
        .fetchedOtaSearchPropertyDetailsResponse
    );

    const propertyToken =
      normalizeText(
        otaSearchPropertyDetails?.property_token ||
          otaSearchPropertyDetails?.propertyToken
      ) ||
      fetchedOtaSearchPropertyDetailsResponse
        .otaSearchPropertyTokenCandidateRow?.propertyToken ||
      null;

    const hotelName =
      normalizeText(otaSearchPropertyDetails?.name) ||
      normalizeText(otaSearchPropertyDetails?.title) ||
      normalizeText(otaSearchPropertyDetails?.hotel_name) ||
      fetchedOtaSearchPropertyDetailsResponse
        .otaSearchPropertyTokenCandidateRow?.hotelName ||
      null;

    const hotelAddress =
      normalizeText(otaSearchPropertyDetails?.address) ||
      normalizeText(otaSearchPropertyDetails?.formatted_address) ||
      normalizeText(otaSearchPropertyDetails?.formattedAddress) ||
      null;

    if (hotelAddress) {
      propertyDetailsHotelAddressCount += 1;
    }

    const featuredPrices = [
      ...normalizeArray(otaSearchPropertyDetails?.featured_prices),
      ...normalizeArray(otaSearchPropertyDetails?.featuredPrices),
      ...normalizeArray(
        fetchedOtaSearchPropertyDetailsResponse
          .fetchedOtaSearchPropertyDetailsResponse?.featured_prices
      ),
      ...normalizeArray(
        fetchedOtaSearchPropertyDetailsResponse
          .fetchedOtaSearchPropertyDetailsResponse?.featuredPrices
      )
    ];

    const prices = [
      ...normalizeArray(otaSearchPropertyDetails?.prices),
      ...normalizeArray(
        fetchedOtaSearchPropertyDetailsResponse
          .fetchedOtaSearchPropertyDetailsResponse?.prices
      )
    ];

    propertyDetailsFeaturedPricesCount += featuredPrices.length;
    propertyDetailsPricesCount += prices.length;

    for (const featuredPrice of featuredPrices) {
      const rooms = [
        ...normalizeArray(featuredPrice?.rooms),
        ...normalizeArray(featuredPrice?.room_options),
        ...normalizeArray(featuredPrice?.roomTypes)
      ];

      propertyDetailsRoomCount += rooms.length;

      if (!rooms.length) {
        otaSearchPropertyDetailsRateRows.push(
          buildOtaSearchPropertyDetailsRateRow({
            propertyToken,
            hotelName,
            hotelAddress,
            featuredPrice,
            room: null,
            rate: null,
            validatedHotelsRatesSearchFlowContextQuery
          })
        );

        continue;
      }

      for (const room of rooms) {
        const rates = [
          ...normalizeArray(room?.rates),
          ...normalizeArray(room?.rate_options),
          ...normalizeArray(room?.rateOptions)
        ];

        propertyDetailsRateCount += rates.length;

        if (!rates.length) {
          otaSearchPropertyDetailsRateRows.push(
            buildOtaSearchPropertyDetailsRateRow({
              propertyToken,
              hotelName,
              hotelAddress,
              featuredPrice,
              room,
              rate: null,
              validatedHotelsRatesSearchFlowContextQuery
            })
          );

          continue;
        }

        for (const rate of rates) {
          otaSearchPropertyDetailsRateRows.push(
            buildOtaSearchPropertyDetailsRateRow({
              propertyToken,
              hotelName,
              hotelAddress,
              featuredPrice,
              room,
              rate,
              validatedHotelsRatesSearchFlowContextQuery
            })
          );
        }
      }
    }

    for (const price of prices) {
      otaSearchPropertyDetailsRateRows.push(
        buildOtaSearchPropertyDetailsRateRow({
          propertyToken,
          hotelName,
          hotelAddress,
          featuredPrice: price,
          room: null,
          rate: null,
          validatedHotelsRatesSearchFlowContextQuery
        })
      );
    }
  }

  return {
    otaSearchPropertyDetailsRateRows,
    propertyDetailsFetchSuccessCount,
    propertyDetailsFetchFailedCount,
    propertyDetailsHotelAddressCount,
    propertyDetailsFeaturedPricesCount,
    propertyDetailsPricesCount,
    propertyDetailsRoomCount,
    propertyDetailsRateCount
  };
}

function buildOtaSearchPropertyDetailsRateRow({
  propertyToken,
  hotelName,
  hotelAddress,
  featuredPrice,
  room,
  rate,
  validatedHotelsRatesSearchFlowContextQuery
}) {
  const rateName =
    normalizeText(room?.name) ||
    normalizeText(room?.room_name) ||
    normalizeText(room?.roomName) ||
    normalizeText(rate?.name) ||
    normalizeText(rate?.room_name) ||
    normalizeText(rate?.roomName) ||
    null;

  const otaSearchMinCurrentPrice = resolveOtaSearchMinCurrentPrice([
    rate,
    room,
    featuredPrice
  ]);

  const otaSearchBeforeTaxesFeesPrice = resolveOtaSearchBeforeTaxesFeesPrice([
    rate,
    room,
    featuredPrice
  ]);

  return {
    propertyToken,
    hotelName: normalizeText(hotelName) || null,
    hotelAddress: normalizeText(hotelAddress) || null,
    rateName,

    currency: validatedHotelsRatesSearchFlowContextQuery.currency,
    checkin: validatedHotelsRatesSearchFlowContextQuery.checkin,
    checkout: validatedHotelsRatesSearchFlowContextQuery.checkout,

    source:
      normalizeText(rate?.source) ||
      normalizeText(room?.source) ||
      normalizeText(featuredPrice?.source) ||
      null,
    official: Boolean(rate?.official || room?.official || featuredPrice?.official),

    numGuests:
      normalizeIntegerOrNull(rate?.num_guests) ||
      normalizeIntegerOrNull(rate?.numGuests) ||
      normalizeIntegerOrNull(room?.num_guests) ||
      normalizeIntegerOrNull(room?.numGuests) ||
      normalizeIntegerOrNull(featuredPrice?.num_guests) ||
      normalizeIntegerOrNull(featuredPrice?.numGuests),

    breakfastIncluded:
      rate?.breakfast_included ??
      rate?.breakfastIncluded ??
      room?.breakfast_included ??
      room?.breakfastIncluded ??
      featuredPrice?.breakfast_included ??
      featuredPrice?.breakfastIncluded ??
      null,

    freeCancellation:
      rate?.free_cancellation ??
      rate?.freeCancellation ??
      room?.free_cancellation ??
      room?.freeCancellation ??
      featuredPrice?.free_cancellation ??
      featuredPrice?.freeCancellation ??
      null,

    freeCancellationUntilDate:
      normalizeText(rate?.free_cancellation_until_date) ||
      normalizeText(rate?.freeCancellationUntilDate) ||
      normalizeText(room?.free_cancellation_until_date) ||
      normalizeText(room?.freeCancellationUntilDate) ||
      normalizeText(featuredPrice?.free_cancellation_until_date) ||
      normalizeText(featuredPrice?.freeCancellationUntilDate) ||
      null,

    freeCancellationUntilTime:
      normalizeText(rate?.free_cancellation_until_time) ||
      normalizeText(rate?.freeCancellationUntilTime) ||
      normalizeText(room?.free_cancellation_until_time) ||
      normalizeText(room?.freeCancellationUntilTime) ||
      normalizeText(featuredPrice?.free_cancellation_until_time) ||
      normalizeText(featuredPrice?.freeCancellationUntilTime) ||
      null,

    beds: rate?.beds || room?.beds || featuredPrice?.beds || null,
    inclusions:
      rate?.inclusions || room?.inclusions || featuredPrice?.inclusions || null,

    otaSearchMinCurrentPrice,
    otaSearchBeforeTaxesFeesPrice
  };
}

function resolveOtaSearchPropertyDetailsObject(
  fetchedOtaSearchPropertyDetailsResponse
) {
  return (
    fetchedOtaSearchPropertyDetailsResponse?.property ||
    fetchedOtaSearchPropertyDetailsResponse?.hotel ||
    fetchedOtaSearchPropertyDetailsResponse?.details ||
    fetchedOtaSearchPropertyDetailsResponse
  );
}

function buildLiteApiRateMatchingRows({ getHotelsRatesJson }) {
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

  const liteApiRateMatchingRows = [];

  for (const dataItem of getHotelsRatesData) {
    const hotelId = normalizeText(dataItem?.hotelId);

    if (!hotelId) {
      continue;
    }

    const getHotelsRatesHotel = getHotelsRatesHotelById.get(hotelId) || null;
    const getHotelsRatesRate = dataItem?.roomTypes?.[0]?.rates?.[0] || null;

    if (!getHotelsRatesHotel || !getHotelsRatesRate) {
      continue;
    }

    liteApiRateMatchingRows.push({
      hotelId,

      hotelName: normalizeText(getHotelsRatesHotel?.name) || null,
      hotelAddress: normalizeText(getHotelsRatesHotel?.address) || null,
      hotelRating: normalizeNumberOrNull(getHotelsRatesHotel?.rating),

      rateName: normalizeText(getHotelsRatesRate?.name) || null,
      mappedRoomId: normalizeText(getHotelsRatesRate?.mappedRoomId) || null,

      adultCount: normalizePositiveIntegerOrNull(getHotelsRatesRate?.adultCount),
      childCount: normalizeIntegerOrNull(getHotelsRatesRate?.childCount),
      childrenAges: Array.isArray(getHotelsRatesRate?.childrenAges)
        ? getHotelsRatesRate.childrenAges
        : [],

      boardType: normalizeText(getHotelsRatesRate?.boardType) || null,
      boardName: normalizeText(getHotelsRatesRate?.boardName) || null,

      refundableTag:
        normalizeText(
          getHotelsRatesRate?.cancellationPolicies?.refundableTag
        ).toUpperCase() || null,

      hotelOffersMinCurrentPrice: normalizeNumberOrNull(
        getHotelsRatesRate?.retailRate?.total?.[0]?.amount
      ),

      currency:
        normalizeText(
          getHotelsRatesRate?.retailRate?.total?.[0]?.currency
        ).toUpperCase() || null
    });
  }

  return liteApiRateMatchingRows;
}

function buildOtaSearchMinCurrentPriceIndex({
  getHotelsRatesJson,
  liteApiRateMatchingRows,
  otaSearchPropertyDetailsRateRows
}) {
  const otaSearchMinCurrentPriceIndex =
    buildEmptyOtaSearchMinCurrentPriceIndex(getHotelsRatesJson);

  const otaSearchHotelMatchingKeySet = new Set();

  const otaSearchPropertyDetailsRateRowByRateMatchingKey = new Map();

  for (const otaSearchPropertyDetailsRateRow of otaSearchPropertyDetailsRateRows) {
    const otaSearchHotelMatchingKey = buildOtaSearchHotelMatchingKey(
      otaSearchPropertyDetailsRateRow
    );

    if (otaSearchHotelMatchingKey) {
      otaSearchHotelMatchingKeySet.add(otaSearchHotelMatchingKey);
    }

    const otaSearchRateMatchingKey = buildOtaSearchRateMatchingKey(
      otaSearchPropertyDetailsRateRow
    );

    const otaSearchMinCurrentPrice = normalizeNumberOrNull(
      otaSearchPropertyDetailsRateRow?.otaSearchMinCurrentPrice
    );

    if (!otaSearchRateMatchingKey || !Number.isFinite(otaSearchMinCurrentPrice)) {
      continue;
    }

    const existingOtaSearchPropertyDetailsRateRow =
      otaSearchPropertyDetailsRateRowByRateMatchingKey.get(
        otaSearchRateMatchingKey
      );

    const existingOtaSearchMinCurrentPrice = normalizeNumberOrNull(
      existingOtaSearchPropertyDetailsRateRow?.otaSearchMinCurrentPrice
    );

    if (
      !Number.isFinite(existingOtaSearchMinCurrentPrice) ||
      otaSearchMinCurrentPrice < existingOtaSearchMinCurrentPrice
    ) {
      otaSearchPropertyDetailsRateRowByRateMatchingKey.set(
        otaSearchRateMatchingKey,
        otaSearchPropertyDetailsRateRow
      );
    }
  }

  let hotelNameAddressMatchedCount = 0;
  let hotelNameAddressRejectedCount = 0;
  let rateNameMatchedCount = 0;
  let rateNameRejectedCount = 0;
  let otaSearchMinCurrentPriceMatchedCount = 0;

  for (const liteApiRateMatchingRow of liteApiRateMatchingRows) {
    const hotelId = normalizeText(liteApiRateMatchingRow?.hotelId);

    if (!hotelId) {
      continue;
    }

    const liteApiHotelMatchingKey = buildOtaSearchHotelMatchingKey(
      liteApiRateMatchingRow
    );

    if (!liteApiHotelMatchingKey) {
      hotelNameAddressRejectedCount += 1;
      otaSearchMinCurrentPriceIndex[hotelId] = null;
      continue;
    }

    if (!otaSearchHotelMatchingKeySet.has(liteApiHotelMatchingKey)) {
      hotelNameAddressRejectedCount += 1;
      otaSearchMinCurrentPriceIndex[hotelId] = null;
      continue;
    }

    hotelNameAddressMatchedCount += 1;

    const liteApiRateMatchingKey = buildOtaSearchRateMatchingKey(
      liteApiRateMatchingRow
    );

    if (!liteApiRateMatchingKey) {
      rateNameRejectedCount += 1;
      otaSearchMinCurrentPriceIndex[hotelId] = null;
      continue;
    }

    const matchedOtaSearchPropertyDetailsRateRow =
      otaSearchPropertyDetailsRateRowByRateMatchingKey.get(
        liteApiRateMatchingKey
      ) || null;

    if (!matchedOtaSearchPropertyDetailsRateRow) {
      rateNameRejectedCount += 1;
      otaSearchMinCurrentPriceIndex[hotelId] = null;
      continue;
    }

    rateNameMatchedCount += 1;

    const otaSearchMinCurrentPrice = normalizeNumberOrNull(
      matchedOtaSearchPropertyDetailsRateRow.otaSearchMinCurrentPrice
    );

    if (!Number.isFinite(otaSearchMinCurrentPrice)) {
      otaSearchMinCurrentPriceIndex[hotelId] = null;
      continue;
    }

    otaSearchMinCurrentPriceMatchedCount += 1;
    otaSearchMinCurrentPriceIndex[hotelId] = otaSearchMinCurrentPrice;
  }

  let otaSearchMinCurrentPriceNullCount = 0;

  for (const otaSearchMinCurrentPrice of Object.values(
    otaSearchMinCurrentPriceIndex
  )) {
    if (!Number.isFinite(normalizeNumberOrNull(otaSearchMinCurrentPrice))) {
      otaSearchMinCurrentPriceNullCount += 1;
    }
  }

  return {
    otaSearchMinCurrentPriceIndex,
    liteApiRateMatchingRowCount: liteApiRateMatchingRows.length,
    otaSearchPropertyDetailsRateRowCount:
      otaSearchPropertyDetailsRateRows.length,
    hotelNameAddressMatchedCount,
    hotelNameAddressRejectedCount,
    rateNameMatchedCount,
    rateNameRejectedCount,
    otaSearchMinCurrentPriceMatchedCount,
    otaSearchMinCurrentPriceNullCount
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

function buildOtaSearchHotelMatchingKey({ hotelName, hotelAddress }) {
  const normalizedHotelName = normalizeComparableText(hotelName);
  const normalizedHotelAddress = normalizeComparableText(hotelAddress);

  if (!normalizedHotelName || !normalizedHotelAddress) {
    return null;
  }

  return [normalizedHotelName, normalizedHotelAddress].join("::");
}

function buildOtaSearchRateMatchingKey({ hotelName, hotelAddress, rateName }) {
  const otaSearchHotelMatchingKey = buildOtaSearchHotelMatchingKey({
    hotelName,
    hotelAddress
  });

  const normalizedRateName = normalizeComparableText(rateName);

  if (!otaSearchHotelMatchingKey || !normalizedRateName) {
    return null;
  }

  return [otaSearchHotelMatchingKey, normalizedRateName].join("::");
}

function resolveOtaSearchMinCurrentPrice(values) {
  const otaSearchMinCurrentPriceCandidates = [];

  for (const value of values) {
    otaSearchMinCurrentPriceCandidates.push(
      normalizeNumberOrNull(value?.total_rate?.extracted_lowest),
      normalizeNumberOrNull(value?.total_rate?.amount),
      normalizeNumberOrNull(value?.total_rate?.extracted_price),
      normalizeNumberOrNull(value?.total_rate),

      normalizeNumberOrNull(value?.total_price?.extracted_lowest),
      normalizeNumberOrNull(value?.total_price?.amount),
      normalizeNumberOrNull(value?.total_price?.extracted_price),
      normalizeNumberOrNull(value?.total_price),

      normalizeNumberOrNull(value?.price?.extracted_lowest),
      normalizeNumberOrNull(value?.price?.amount),
      normalizeNumberOrNull(value?.price?.extracted_price),
      normalizeNumberOrNull(value?.price),

      normalizeNumberOrNull(value?.rate_per_night?.extracted_lowest),
      normalizeNumberOrNull(value?.ratePerNight?.extracted_lowest),
      normalizeNumberOrNull(value?.extracted_lowest),
      normalizeNumberOrNull(value?.extracted_price)
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

function resolveOtaSearchBeforeTaxesFeesPrice(values) {
  const otaSearchBeforeTaxesFeesPriceCandidates = [];

  for (const value of values) {
    otaSearchBeforeTaxesFeesPriceCandidates.push(
      normalizeNumberOrNull(value?.total_rate?.extracted_before_taxes_fees),
      normalizeNumberOrNull(value?.total_rate?.before_taxes_fees),
      normalizeNumberOrNull(value?.total_price?.extracted_before_taxes_fees),
      normalizeNumberOrNull(value?.total_price?.before_taxes_fees),
      normalizeNumberOrNull(value?.rate_per_night?.extracted_before_taxes_fees),
      normalizeNumberOrNull(value?.ratePerNight?.extracted_before_taxes_fees),
      normalizeNumberOrNull(value?.price?.extracted_before_taxes_fees),
      normalizeNumberOrNull(value?.price?.before_taxes_fees)
    );
  }

  const normalizedOtaSearchBeforeTaxesFeesPriceCandidates =
    otaSearchBeforeTaxesFeesPriceCandidates.filter(
      (otaSearchBeforeTaxesFeesPriceCandidate) =>
        Number.isFinite(otaSearchBeforeTaxesFeesPriceCandidate) &&
        otaSearchBeforeTaxesFeesPriceCandidate > 0
    );

  if (!normalizedOtaSearchBeforeTaxesFeesPriceCandidates.length) {
    return null;
  }

  return Math.min(...normalizedOtaSearchBeforeTaxesFeesPriceCandidates);
}

function calculateOtaSearchDisplayNameRequestAdultCount(
  validatedHotelsRatesSearchFlowContextQuery
) {
  return validatedHotelsRatesSearchFlowContextQuery.roomAdultCounts.reduce(
    (adultCountTotal, roomAdultCount) => adultCountTotal + roomAdultCount,
    0
  );
}

function calculateOtaSearchDisplayNameRequestChildCount(
  validatedHotelsRatesSearchFlowContextQuery
) {
  return buildOtaSearchDisplayNameRequestChildrenAges(
    validatedHotelsRatesSearchFlowContextQuery
  ).length;
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

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeComparableText(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  if (value === null || value === undefined || typeof value === "object") {
    return "";
  }

  return String(value).trim();
}

function normalizeNumberOrNull(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const normalizedText = normalizeText(value);

  if (!normalizedText) {
    return null;
  }

  const normalizedNumberText = normalizedText.replace(/[^0-9.,-]/g, "");

  if (!normalizedNumberText) {
    return null;
  }

  const hasComma = normalizedNumberText.includes(",");
  const hasDot = normalizedNumberText.includes(".");

  if (hasComma && hasDot) {
    const normalizedCommaIndex = normalizedNumberText.lastIndexOf(",");
    const normalizedDotIndex = normalizedNumberText.lastIndexOf(".");
    const normalizedDecimalSeparator =
      normalizedCommaIndex > normalizedDotIndex ? "," : ".";
    const normalizedThousandsSeparator =
      normalizedDecimalSeparator === "," ? "." : ",";

    const normalizedDecimalPart =
      normalizedNumberText.split(normalizedDecimalSeparator).pop() || "";

    if (normalizedDecimalPart.length <= 2) {
      const normalizedNumber = Number(
        normalizedNumberText
          .replaceAll(normalizedThousandsSeparator, "")
          .replace(normalizedDecimalSeparator, ".")
      );

      return Number.isFinite(normalizedNumber) ? normalizedNumber : null;
    }

    const normalizedNumber = Number(
      normalizedNumberText.replace(/[.,]/g, "")
    );

    return Number.isFinite(normalizedNumber) ? normalizedNumber : null;
  }

  if (hasComma || hasDot) {
    const normalizedSeparator = hasComma ? "," : ".";
    const normalizedParts = normalizedNumberText.split(normalizedSeparator);
    const normalizedLastPart = normalizedParts[normalizedParts.length - 1];

    if (normalizedLastPart.length === 3 && normalizedParts.length > 1) {
      const normalizedNumber = Number(
        normalizedNumberText.replace(/[.,]/g, "")
      );

      return Number.isFinite(normalizedNumber) ? normalizedNumber : null;
    }

    const normalizedNumber = Number(
      normalizedNumberText.replace(normalizedSeparator, ".")
    );

    return Number.isFinite(normalizedNumber) ? normalizedNumber : null;
  }

  const normalizedNumber = Number(normalizedNumberText);
  return Number.isFinite(normalizedNumber) ? normalizedNumber : null;
}

function normalizeIntegerOrNull(value) {
  const normalizedNumber = normalizeNumberOrNull(value);

  if (!Number.isInteger(normalizedNumber)) {
    return null;
  }

  return normalizedNumber;
}

function normalizePositiveIntegerOrNull(value) {
  const normalizedInteger = normalizeIntegerOrNull(value);

  if (!Number.isFinite(normalizedInteger) || normalizedInteger <= 0) {
    return null;
  }

  return normalizedInteger;
}
