import { elevate } from "wix-auth";
import { secrets } from "wix-secrets-backend.v2";
import { fetch } from "wix-fetch";

const SERPAPI_BASE_URL = "https://serpapi.com/search.json";
const SERPAPI_API_KEY_SECRET_NAME = "SERPAPI_API_KEY";

const SERPAPI_ENGINE = "google_hotels";
const DEFAULT_SERPAPI_COUNTRY_CODE = "tr";
const DEFAULT_SERPAPI_LANGUAGE = "en";
const SERPAPI_SORT_BY_LOWEST_PRICE = "3";

const HOTEL_RATE_MATCH_SAMPLE_LIMIT = 12;

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

    const fetchedOtaSearchHotelNameResponses =
      await fetchOtaSearchHotelNameResponses({
        serpApiKey,
        liteApiRateMatchingRows,
        validatedHotelsRatesSearchFlowContextQuery
      });

    const parsedOtaSearchPropertyTokenCandidateRows =
      parseOtaSearchPropertyTokenCandidateRows({
        fetchedOtaSearchHotelNameResponses,
        liteApiRateMatchingRows
      });

    console.log("OTA_SEARCH hotel name discovery summary", {
      serpApiLanguage: DEFAULT_SERPAPI_LANGUAGE,
      serpApiSortBy: SERPAPI_SORT_BY_LOWEST_PRICE,
      liteApiRateMatchingRowCount: liteApiRateMatchingRows.length,
      hotelNameSearchRequestCount:
        fetchedOtaSearchHotelNameResponses.hotelNameSearchRequestCount,
      hotelNameSearchSuccessCount:
        fetchedOtaSearchHotelNameResponses.hotelNameSearchSuccessCount,
      hotelNameSearchFailedCount:
        fetchedOtaSearchHotelNameResponses.hotelNameSearchFailedCount,
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

    console.log("OTA_SEARCH hotel name discovery samples", {
      hotelNameSearchMatchedSampleRows:
        parsedOtaSearchPropertyTokenCandidateRows
          .hotelNameSearchMatchedSampleRows,
      hotelNameSearchMissingSampleRows:
        parsedOtaSearchPropertyTokenCandidateRows
          .hotelNameSearchMissingSampleRows
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
      serpApiLanguage: DEFAULT_SERPAPI_LANGUAGE,
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
          .otaSearchPropertyDetailsRateRows.length,
      otaSearchPropertyDetailsRateNameCount:
        parsedOtaSearchPropertyDetailsRateRows
          .otaSearchPropertyDetailsRateNameCount,
      otaSearchPropertyDetailsPriceCount:
        parsedOtaSearchPropertyDetailsRateRows
          .otaSearchPropertyDetailsPriceCount
    });

    const otaSearchHotelRateMatchDiagnostic =
      buildOtaSearchHotelRateMatchDiagnostic({
        liteApiRateMatchingRows,
        otaSearchPropertyDetailsRateRows:
          parsedOtaSearchPropertyDetailsRateRows
            .otaSearchPropertyDetailsRateRows
      });

    console.log("OTA_SEARCH hotel rate match diagnostic summary", {
      liteApiRateMatchingRowCount:
        otaSearchHotelRateMatchDiagnostic.liteApiRateMatchingRowCount,
      otaSearchPropertyDetailsRateRowCount:
        otaSearchHotelRateMatchDiagnostic.otaSearchPropertyDetailsRateRowCount,
      hotelNameMatchedSampleCount:
        otaSearchHotelRateMatchDiagnostic.hotelNameMatchedSampleRows.length,
      rateNameMatchedSampleCount:
        otaSearchHotelRateMatchDiagnostic.rateNameMatchedSampleRows.length,
      liteApiHotelNameWithoutOtaSearchSampleCount:
        otaSearchHotelRateMatchDiagnostic
          .liteApiHotelNameWithoutOtaSearchSampleRows.length,
      otaSearchHotelNameWithoutLiteApiSampleCount:
        otaSearchHotelRateMatchDiagnostic
          .otaSearchHotelNameWithoutLiteApiSampleRows.length
    });

    console.log("OTA_SEARCH hotel rate match diagnostic samples", {
      hotelNameMatchedSampleRows:
        otaSearchHotelRateMatchDiagnostic.hotelNameMatchedSampleRows,
      rateNameMatchedSampleRows:
        otaSearchHotelRateMatchDiagnostic.rateNameMatchedSampleRows,
      liteApiHotelNameWithoutOtaSearchSampleRows:
        otaSearchHotelRateMatchDiagnostic
          .liteApiHotelNameWithoutOtaSearchSampleRows,
      otaSearchHotelNameWithoutLiteApiSampleRows:
        otaSearchHotelRateMatchDiagnostic
          .otaSearchHotelNameWithoutLiteApiSampleRows
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
      hotelNameMatchedCount:
        builtOtaSearchMinCurrentPriceIndex.hotelNameMatchedCount,
      hotelNameRejectedCount:
        builtOtaSearchMinCurrentPriceIndex.hotelNameRejectedCount,
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

async function fetchOtaSearchHotelNameResponses({
  serpApiKey,
  liteApiRateMatchingRows,
  validatedHotelsRatesSearchFlowContextQuery
}) {
  const hotelNameSearchResponseItems = await Promise.all(
    liteApiRateMatchingRows.map(async (liteApiRateMatchingRow) => {
      const otaSearchHotelNameRequest = buildOtaSearchHotelNameRequest({
        liteApiRateMatchingRow,
        validatedHotelsRatesSearchFlowContextQuery
      });

      try {
        const fetchedOtaSearchHotelNameResponse =
          await fetchOtaSearchHotelNameResponse({
            serpApiKey,
            otaSearchHotelNameRequest
          });

        return {
          ok: true,
          liteApiRateMatchingRow,
          otaSearchHotelNameRequest,
          fetchedOtaSearchHotelNameResponse
        };
      } catch (error) {
        return {
          ok: false,
          liteApiRateMatchingRow,
          otaSearchHotelNameRequest,
          errorMessage: error?.message || String(error)
        };
      }
    })
  );

  return {
    hotelNameSearchResponseItems,
    hotelNameSearchRequestCount: hotelNameSearchResponseItems.length,
    hotelNameSearchSuccessCount: hotelNameSearchResponseItems.filter(
      (hotelNameSearchResponseItem) => hotelNameSearchResponseItem?.ok
    ).length,
    hotelNameSearchFailedCount: hotelNameSearchResponseItems.filter(
      (hotelNameSearchResponseItem) => !hotelNameSearchResponseItem?.ok
    ).length
  };
}

function buildOtaSearchHotelNameRequest({
  liteApiRateMatchingRow,
  validatedHotelsRatesSearchFlowContextQuery
}) {
  const otaSearchHotelNameRequest = {
    engine: SERPAPI_ENGINE,
    q: buildOtaSearchHotelNameRequestQuery({
      liteApiRateMatchingRow,
      validatedHotelsRatesSearchFlowContextQuery
    }),
    check_in_date: validatedHotelsRatesSearchFlowContextQuery.checkin,
    check_out_date: validatedHotelsRatesSearchFlowContextQuery.checkout,
    currency: validatedHotelsRatesSearchFlowContextQuery.currency,
    hl: DEFAULT_SERPAPI_LANGUAGE,
    gl: DEFAULT_SERPAPI_COUNTRY_CODE,
    adults: calculateOtaSearchRequestAdultCount(
      validatedHotelsRatesSearchFlowContextQuery
    ),
    children: calculateOtaSearchRequestChildCount(
      validatedHotelsRatesSearchFlowContextQuery
    ),
    sort_by: SERPAPI_SORT_BY_LOWEST_PRICE
  };

  const otaSearchRequestChildrenAges = buildOtaSearchRequestChildrenAges(
    validatedHotelsRatesSearchFlowContextQuery
  );

  if (otaSearchRequestChildrenAges.length) {
    otaSearchHotelNameRequest.children_ages =
      otaSearchRequestChildrenAges.join(",");
  }

  return otaSearchHotelNameRequest;
}

function buildOtaSearchHotelNameRequestQuery({
  liteApiRateMatchingRow,
  validatedHotelsRatesSearchFlowContextQuery
}) {
  return normalizeText(liteApiRateMatchingRow?.hotelName);
}

function buildOtaSearchPropertyDetailsRequest({
  otaSearchPropertyTokenCandidateRow,
  validatedHotelsRatesSearchFlowContextQuery
}) {
  const otaSearchPropertyDetailsRequest = {
    engine: SERPAPI_ENGINE,
    q: buildOtaSearchPropertyDetailsRequestQuery({
      otaSearchPropertyTokenCandidateRow,
      validatedHotelsRatesSearchFlowContextQuery
    }),
    property_token: otaSearchPropertyTokenCandidateRow.propertyToken,
    check_in_date: validatedHotelsRatesSearchFlowContextQuery.checkin,
    check_out_date: validatedHotelsRatesSearchFlowContextQuery.checkout,
    currency: validatedHotelsRatesSearchFlowContextQuery.currency,
    hl: DEFAULT_SERPAPI_LANGUAGE,
    gl: DEFAULT_SERPAPI_COUNTRY_CODE,
    adults: calculateOtaSearchRequestAdultCount(
      validatedHotelsRatesSearchFlowContextQuery
    ),
    children: calculateOtaSearchRequestChildCount(
      validatedHotelsRatesSearchFlowContextQuery
    ),
    sort_by: SERPAPI_SORT_BY_LOWEST_PRICE
  };

  const otaSearchRequestChildrenAges = buildOtaSearchRequestChildrenAges(
    validatedHotelsRatesSearchFlowContextQuery
  );

  if (otaSearchRequestChildrenAges.length) {
    otaSearchPropertyDetailsRequest.children_ages =
      otaSearchRequestChildrenAges.join(",");
  }

  return otaSearchPropertyDetailsRequest;
}

function buildOtaSearchPropertyDetailsRequestQuery({
  otaSearchPropertyTokenCandidateRow,
  validatedHotelsRatesSearchFlowContextQuery
}) {
  return normalizeText(otaSearchPropertyTokenCandidateRow?.hotelName);
}

async function fetchOtaSearchHotelNameResponse({
  serpApiKey,
  otaSearchHotelNameRequest
}) {
  return fetchOtaSearchJsonResponse({
    serpApiKey,
    otaSearchRequest: otaSearchHotelNameRequest
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
  fetchedOtaSearchHotelNameResponses,
  liteApiRateMatchingRows
}) {
  const liteApiHotelNameComparableSet = new Set(
    liteApiRateMatchingRows
      .map((liteApiRateMatchingRow) =>
        normalizeComparableText(liteApiRateMatchingRow?.hotelName)
      )
      .filter(Boolean)
  );

  const otaSearchPropertyTokenCandidateRows = [];
  const seenPropertyTokenSet = new Set();

  const hotelNameSearchMatchedSampleRows = [];
  const hotelNameSearchMissingSampleRows = [];

  let serpApiSearchPropertyCount = 0;
  let propertyTokenMissingCount = 0;
  let propertyTokenHotelNameMatchedCount = 0;
  let propertyTokenHotelNameRejectedCount = 0;
  let serpApiSearchPropertyNameMissingCount = 0;

  for (const hotelNameSearchResponseItem of fetchedOtaSearchHotelNameResponses.hotelNameSearchResponseItems) {
    const liteApiRateMatchingRow =
      hotelNameSearchResponseItem?.liteApiRateMatchingRow || null;

    if (!hotelNameSearchResponseItem?.ok) {
      if (
        hotelNameSearchMissingSampleRows.length < HOTEL_RATE_MATCH_SAMPLE_LIMIT
      ) {
        hotelNameSearchMissingSampleRows.push({
          liteApiHotelName: liteApiRateMatchingRow?.hotelName || null,
          liteApiHotelAddress: liteApiRateMatchingRow?.hotelAddress || null,
          liteApiRateName: liteApiRateMatchingRow?.rateName || null,
          otaSearchRequestQuery:
            hotelNameSearchResponseItem?.otaSearchHotelNameRequest?.q || null,
          errorMessage: hotelNameSearchResponseItem?.errorMessage || null
        });
      }

      continue;
    }

    const serpApiSearchProperties = getOtaSearchResponseProperties(
      hotelNameSearchResponseItem.fetchedOtaSearchHotelNameResponse
    );

    serpApiSearchPropertyCount += serpApiSearchProperties.length;

    let matchedCandidateForThisLiteApiRow = null;

    for (
      let searchRank = 0;
      searchRank < serpApiSearchProperties.length;
      searchRank += 1
    ) {
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

      const liteApiHotelNameComparable = normalizeComparableText(
        liteApiRateMatchingRow?.hotelName
      );

      if (
        !liteApiHotelNameComparable ||
        hotelNameComparable !== liteApiHotelNameComparable ||
        !liteApiHotelNameComparableSet.has(hotelNameComparable)
      ) {
        propertyTokenHotelNameRejectedCount += 1;
        continue;
      }

      if (seenPropertyTokenSet.has(propertyToken)) {
        matchedCandidateForThisLiteApiRow = {
          propertyToken,
          hotelName,
          hotelAddress: liteApiRateMatchingRow?.hotelAddress || null,
          rateName: liteApiRateMatchingRow?.rateName || null,
          hotelNameComparable,
          searchRank
        };

        continue;
      }

      seenPropertyTokenSet.add(propertyToken);
      propertyTokenHotelNameMatchedCount += 1;

      const otaSearchPropertyTokenCandidateRow = {
        propertyToken,
        hotelId: liteApiRateMatchingRow?.hotelId || null,
        hotelName,
        hotelAddress: liteApiRateMatchingRow?.hotelAddress || null,
        rateName: liteApiRateMatchingRow?.rateName || null,
        hotelNameComparable,
        gpsCoordinates: serpApiSearchProperty?.gps_coordinates || null,
        searchRank,
        otaSearchRequestQuery:
          hotelNameSearchResponseItem?.otaSearchHotelNameRequest?.q || null
      };

      matchedCandidateForThisLiteApiRow = otaSearchPropertyTokenCandidateRow;
      otaSearchPropertyTokenCandidateRows.push(
        otaSearchPropertyTokenCandidateRow
      );
    }

    if (
      matchedCandidateForThisLiteApiRow &&
      hotelNameSearchMatchedSampleRows.length < HOTEL_RATE_MATCH_SAMPLE_LIMIT
    ) {
      hotelNameSearchMatchedSampleRows.push({
        liteApiHotelName: liteApiRateMatchingRow?.hotelName || null,
        liteApiHotelAddress: liteApiRateMatchingRow?.hotelAddress || null,
        liteApiRateName: liteApiRateMatchingRow?.rateName || null,
        otaSearchRequestQuery:
          hotelNameSearchResponseItem?.otaSearchHotelNameRequest?.q || null,
        propertyToken: matchedCandidateForThisLiteApiRow.propertyToken,
        otaSearchHotelName: matchedCandidateForThisLiteApiRow.hotelName,
        otaSearchHotelNameComparable:
          matchedCandidateForThisLiteApiRow.hotelNameComparable
      });
    }

    if (
      !matchedCandidateForThisLiteApiRow &&
      hotelNameSearchMissingSampleRows.length < HOTEL_RATE_MATCH_SAMPLE_LIMIT
    ) {
      hotelNameSearchMissingSampleRows.push({
        liteApiHotelName: liteApiRateMatchingRow?.hotelName || null,
        liteApiHotelAddress: liteApiRateMatchingRow?.hotelAddress || null,
        liteApiRateName: liteApiRateMatchingRow?.rateName || null,
        otaSearchRequestQuery:
          hotelNameSearchResponseItem?.otaSearchHotelNameRequest?.q || null,
        serpApiSearchPropertyCount: serpApiSearchProperties.length
      });
    }
  }

  return {
    otaSearchPropertyTokenCandidateRows,
    serpApiSearchPropertyCount,
    propertyTokenMissingCount,
    propertyTokenHotelNameMatchedCount,
    propertyTokenHotelNameRejectedCount,
    serpApiSearchPropertyNameMissingCount,
    hotelNameSearchMatchedSampleRows,
    hotelNameSearchMissingSampleRows
  };
}

function getOtaSearchResponseProperties(fetchedOtaSearchResponse) {
  return [
    ...normalizeArray(fetchedOtaSearchResponse?.properties),
    ...normalizeArray(fetchedOtaSearchResponse?.hotels),
    ...normalizeArray(fetchedOtaSearchResponse?.results)
  ];
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
  let otaSearchPropertyDetailsRateNameCount = 0;
  let otaSearchPropertyDetailsPriceCount = 0;

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
      fetchedOtaSearchPropertyDetailsResponse
        .otaSearchPropertyTokenCandidateRow?.hotelAddress ||
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
        const otaSearchPropertyDetailsRateRow =
          buildOtaSearchPropertyDetailsRateRow({
            propertyToken,
            hotelName,
            hotelAddress,
            featuredPrice,
            room: null,
            rate: null,
            validatedHotelsRatesSearchFlowContextQuery
          });

        if (otaSearchPropertyDetailsRateRow.rateName) {
          otaSearchPropertyDetailsRateNameCount += 1;
        }

        if (
          Number.isFinite(
            normalizeNumberOrNull(
              otaSearchPropertyDetailsRateRow.otaSearchMinCurrentPrice
            )
          )
        ) {
          otaSearchPropertyDetailsPriceCount += 1;
        }

        otaSearchPropertyDetailsRateRows.push(otaSearchPropertyDetailsRateRow);
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
          const otaSearchPropertyDetailsRateRow =
            buildOtaSearchPropertyDetailsRateRow({
              propertyToken,
              hotelName,
              hotelAddress,
              featuredPrice,
              room,
              rate: null,
              validatedHotelsRatesSearchFlowContextQuery
            });

          if (otaSearchPropertyDetailsRateRow.rateName) {
            otaSearchPropertyDetailsRateNameCount += 1;
          }

          if (
            Number.isFinite(
              normalizeNumberOrNull(
                otaSearchPropertyDetailsRateRow.otaSearchMinCurrentPrice
              )
            )
          ) {
            otaSearchPropertyDetailsPriceCount += 1;
          }

          otaSearchPropertyDetailsRateRows.push(otaSearchPropertyDetailsRateRow);
          continue;
        }

        for (const rate of rates) {
          const otaSearchPropertyDetailsRateRow =
            buildOtaSearchPropertyDetailsRateRow({
              propertyToken,
              hotelName,
              hotelAddress,
              featuredPrice,
              room,
              rate,
              validatedHotelsRatesSearchFlowContextQuery
            });

          if (otaSearchPropertyDetailsRateRow.rateName) {
            otaSearchPropertyDetailsRateNameCount += 1;
          }

          if (
            Number.isFinite(
              normalizeNumberOrNull(
                otaSearchPropertyDetailsRateRow.otaSearchMinCurrentPrice
              )
            )
          ) {
            otaSearchPropertyDetailsPriceCount += 1;
          }

          otaSearchPropertyDetailsRateRows.push(otaSearchPropertyDetailsRateRow);
        }
      }
    }

    for (const price of prices) {
      const otaSearchPropertyDetailsRateRow =
        buildOtaSearchPropertyDetailsRateRow({
          propertyToken,
          hotelName,
          hotelAddress,
          featuredPrice: price,
          room: null,
          rate: null,
          validatedHotelsRatesSearchFlowContextQuery
        });

      if (otaSearchPropertyDetailsRateRow.rateName) {
        otaSearchPropertyDetailsRateNameCount += 1;
      }

      if (
        Number.isFinite(
          normalizeNumberOrNull(
            otaSearchPropertyDetailsRateRow.otaSearchMinCurrentPrice
          )
        )
      ) {
        otaSearchPropertyDetailsPriceCount += 1;
      }

      otaSearchPropertyDetailsRateRows.push(otaSearchPropertyDetailsRateRow);
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
    propertyDetailsRateCount,
    otaSearchPropertyDetailsRateNameCount,
    otaSearchPropertyDetailsPriceCount
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
    fetchedOtaSearchPropertyDetailsResponse?.property_results ||
    fetchedOtaSearchPropertyDetailsResponse?.property_result ||
    fetchedOtaSearchPropertyDetailsResponse?.property ||
    fetchedOtaSearchPropertyDetailsResponse?.hotel_results ||
    fetchedOtaSearchPropertyDetailsResponse?.hotel_result ||
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

function buildOtaSearchHotelRateMatchDiagnostic({
  liteApiRateMatchingRows,
  otaSearchPropertyDetailsRateRows
}) {
  const liteApiHotelNameComparableSet = new Set(
    liteApiRateMatchingRows
      .map((liteApiRateMatchingRow) =>
        normalizeComparableText(liteApiRateMatchingRow?.hotelName)
      )
      .filter(Boolean)
  );

  const otaSearchHotelNameComparableSet = new Set(
    otaSearchPropertyDetailsRateRows
      .map((otaSearchPropertyDetailsRateRow) =>
        normalizeComparableText(otaSearchPropertyDetailsRateRow?.hotelName)
      )
      .filter(Boolean)
  );

  const otaSearchRowsByHotelNameComparable = new Map();
  const otaSearchRowsByRateMatchingKey = new Map();

  for (const otaSearchPropertyDetailsRateRow of otaSearchPropertyDetailsRateRows) {
    const hotelNameComparable = normalizeComparableText(
      otaSearchPropertyDetailsRateRow?.hotelName
    );

    if (hotelNameComparable) {
      if (!otaSearchRowsByHotelNameComparable.has(hotelNameComparable)) {
        otaSearchRowsByHotelNameComparable.set(hotelNameComparable, []);
      }

      otaSearchRowsByHotelNameComparable
        .get(hotelNameComparable)
        .push(otaSearchPropertyDetailsRateRow);
    }

    const otaSearchRateMatchingKey = buildOtaSearchRateMatchingKey(
      otaSearchPropertyDetailsRateRow
    );

    if (!otaSearchRateMatchingKey) {
      continue;
    }

    if (!otaSearchRowsByRateMatchingKey.has(otaSearchRateMatchingKey)) {
      otaSearchRowsByRateMatchingKey.set(otaSearchRateMatchingKey, []);
    }

    otaSearchRowsByRateMatchingKey
      .get(otaSearchRateMatchingKey)
      .push(otaSearchPropertyDetailsRateRow);
  }

  const hotelNameMatchedSampleRows = [];
  const rateNameMatchedSampleRows = [];
  const liteApiHotelNameWithoutOtaSearchSampleRows = [];
  const otaSearchHotelNameWithoutLiteApiSampleRows = [];

  for (const liteApiRateMatchingRow of liteApiRateMatchingRows) {
    const hotelNameComparable = normalizeComparableText(
      liteApiRateMatchingRow?.hotelName
    );

    const otaSearchRows =
      otaSearchRowsByHotelNameComparable.get(hotelNameComparable) || [];

    if (!otaSearchRows.length) {
      if (
        liteApiHotelNameWithoutOtaSearchSampleRows.length <
        HOTEL_RATE_MATCH_SAMPLE_LIMIT
      ) {
        liteApiHotelNameWithoutOtaSearchSampleRows.push({
          liteApiHotelName: liteApiRateMatchingRow.hotelName,
          liteApiHotelAddress: liteApiRateMatchingRow.hotelAddress,
          liteApiRateName: liteApiRateMatchingRow.rateName,
          liteApiHotelMatchingKey: buildOtaSearchHotelMatchingKey(
            liteApiRateMatchingRow
          ),
          liteApiRateMatchingKey: buildOtaSearchRateMatchingKey(
            liteApiRateMatchingRow
          )
        });
      }

      continue;
    }

    const firstOtaSearchRow = otaSearchRows[0];

    if (hotelNameMatchedSampleRows.length < HOTEL_RATE_MATCH_SAMPLE_LIMIT) {
      hotelNameMatchedSampleRows.push({
        hotelNameComparable,
        hotelNameComparableMatched: true,
        liteApiHotelName: liteApiRateMatchingRow.hotelName,
        liteApiHotelAddress: liteApiRateMatchingRow.hotelAddress,
        liteApiRateName: liteApiRateMatchingRow.rateName,
        liteApiHotelMatchingKey: buildOtaSearchHotelMatchingKey(
          liteApiRateMatchingRow
        ),
        liteApiRateMatchingKey: buildOtaSearchRateMatchingKey(
          liteApiRateMatchingRow
        ),
        otaSearchHotelName: firstOtaSearchRow.hotelName,
        otaSearchHotelAddress: firstOtaSearchRow.hotelAddress,
        otaSearchRateName: firstOtaSearchRow.rateName,
        otaSearchHotelMatchingKey: buildOtaSearchHotelMatchingKey(
          firstOtaSearchRow
        ),
        otaSearchRateMatchingKey: buildOtaSearchRateMatchingKey(
          firstOtaSearchRow
        ),
        otaSearchMinCurrentPrice: firstOtaSearchRow.otaSearchMinCurrentPrice
      });
    }

    const liteApiRateMatchingKey = buildOtaSearchRateMatchingKey(
      liteApiRateMatchingRow
    );

    const matchedOtaSearchRateRows =
      otaSearchRowsByRateMatchingKey.get(liteApiRateMatchingKey) || [];

    if (
      matchedOtaSearchRateRows.length &&
      rateNameMatchedSampleRows.length < HOTEL_RATE_MATCH_SAMPLE_LIMIT
    ) {
      const matchedOtaSearchRateRow = matchedOtaSearchRateRows[0];

      rateNameMatchedSampleRows.push({
        hotelNameComparable,
        rateNameComparable: normalizeComparableText(
          liteApiRateMatchingRow.rateName
        ),
        hotelNameComparableMatched: true,
        rateNameComparableMatched: true,
        liteApiHotelName: liteApiRateMatchingRow.hotelName,
        liteApiHotelAddress: liteApiRateMatchingRow.hotelAddress,
        liteApiRateName: liteApiRateMatchingRow.rateName,
        liteApiRateMatchingKey,
        otaSearchHotelName: matchedOtaSearchRateRow.hotelName,
        otaSearchHotelAddress: matchedOtaSearchRateRow.hotelAddress,
        otaSearchRateName: matchedOtaSearchRateRow.rateName,
        otaSearchRateMatchingKey: buildOtaSearchRateMatchingKey(
          matchedOtaSearchRateRow
        ),
        otaSearchMinCurrentPrice:
          matchedOtaSearchRateRow.otaSearchMinCurrentPrice
      });
    }
  }

  for (const otaSearchPropertyDetailsRateRow of otaSearchPropertyDetailsRateRows) {
    const hotelNameComparable = normalizeComparableText(
      otaSearchPropertyDetailsRateRow?.hotelName
    );

    if (
      !hotelNameComparable ||
      liteApiHotelNameComparableSet.has(hotelNameComparable)
    ) {
      continue;
    }

    if (
      otaSearchHotelNameWithoutLiteApiSampleRows.length >=
      HOTEL_RATE_MATCH_SAMPLE_LIMIT
    ) {
      break;
    }

    otaSearchHotelNameWithoutLiteApiSampleRows.push({
      otaSearchHotelName: otaSearchPropertyDetailsRateRow.hotelName,
      otaSearchHotelAddress: otaSearchPropertyDetailsRateRow.hotelAddress,
      otaSearchRateName: otaSearchPropertyDetailsRateRow.rateName,
      otaSearchHotelMatchingKey: buildOtaSearchHotelMatchingKey(
        otaSearchPropertyDetailsRateRow
      ),
      otaSearchRateMatchingKey: buildOtaSearchRateMatchingKey(
        otaSearchPropertyDetailsRateRow
      ),
      otaSearchMinCurrentPrice:
        otaSearchPropertyDetailsRateRow.otaSearchMinCurrentPrice
    });
  }

  return {
    liteApiRateMatchingRowCount: liteApiRateMatchingRows.length,
    otaSearchPropertyDetailsRateRowCount:
      otaSearchPropertyDetailsRateRows.length,
    liteApiHotelNameComparableCount: liteApiHotelNameComparableSet.size,
    otaSearchHotelNameComparableCount: otaSearchHotelNameComparableSet.size,
    hotelNameMatchedSampleRows,
    rateNameMatchedSampleRows,
    liteApiHotelNameWithoutOtaSearchSampleRows,
    otaSearchHotelNameWithoutLiteApiSampleRows
  };
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

  let hotelNameMatchedCount = 0;
  let hotelNameRejectedCount = 0;
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
      hotelNameRejectedCount += 1;
      otaSearchMinCurrentPriceIndex[hotelId] = null;
      continue;
    }

    if (!otaSearchHotelMatchingKeySet.has(liteApiHotelMatchingKey)) {
      hotelNameRejectedCount += 1;
      otaSearchMinCurrentPriceIndex[hotelId] = null;
      continue;
    }

    hotelNameMatchedCount += 1;

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
    hotelNameMatchedCount,
    hotelNameRejectedCount,
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

function buildOtaSearchHotelMatchingKey({ hotelName }) {
  const normalizedHotelName = normalizeComparableText(hotelName);

  if (!normalizedHotelName) {
    return null;
  }

  return normalizedHotelName;
}

function buildOtaSearchRateMatchingKey({ hotelName, rateName }) {
  const otaSearchHotelMatchingKey = buildOtaSearchHotelMatchingKey({
    hotelName
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

function calculateOtaSearchRequestAdultCount(
  validatedHotelsRatesSearchFlowContextQuery
) {
  return validatedHotelsRatesSearchFlowContextQuery.roomAdultCounts.reduce(
    (adultCountTotal, roomAdultCount) => adultCountTotal + roomAdultCount,
    0
  );
}

function calculateOtaSearchRequestChildCount(
  validatedHotelsRatesSearchFlowContextQuery
) {
  return buildOtaSearchRequestChildrenAges(
    validatedHotelsRatesSearchFlowContextQuery
  ).length;
}

function buildOtaSearchRequestChildrenAges(
  validatedHotelsRatesSearchFlowContextQuery
) {
  const otaSearchRequestChildrenAges = [];

  validatedHotelsRatesSearchFlowContextQuery.roomChildrenAgesByRoomNumber.forEach(
    (roomChildrenAges) => {
      otaSearchRequestChildrenAges.push(...roomChildrenAges);
    }
  );

  return otaSearchRequestChildrenAges;
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
