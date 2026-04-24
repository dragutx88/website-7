import { buildLiteApiError, liteApiRequest, parseJson } from "./liteApiClient";

const LITE_API_BASE_URL = "https://api.liteapi.travel/v3.0";
const DEFAULT_CURRENCY = "TRY";
const DEFAULT_LANGUAGE = "tr";
const DEFAULT_GUEST_NATIONALITY = "TR";
const DEFAULT_ROOMS = 1;
const DEFAULT_FIRST_ROOM_ADULTS = 2;
const DEFAULT_EXTRA_ROOM_ADULTS = 1;

export async function searchPlacesHandler(textQuery) {
  const query = normalizeText(textQuery);

  if (query.length < 2) {
    return [];
  }

  const searchPlacesResponse = await liteApiRequest(
    `${LITE_API_BASE_URL}/data/places?textQuery=${encodeURIComponent(query)}`,
    { method: "GET" }
  );

  const searchPlacesJson = await parseJson(searchPlacesResponse);

  if (!searchPlacesResponse.ok) {
    throw buildLiteApiError(
      searchPlacesJson,
      "Places autocomplete request failed."
    );
  }

  const searchPlaces = Array.isArray(searchPlacesJson?.data)
    ? searchPlacesJson.data
    : [];

  return searchPlaces.map((place) => ({
    placeId: normalizeText(place?.placeId),
    displayName: normalizeText(place?.displayName),
    formattedAddress: normalizeText(place?.formattedAddress)
  }));
}

export async function getHotelsRatesHandler(searchFlowContextQuery) {
  const getHotelsRatesRequest = buildHotelsRatesRequest(searchFlowContextQuery);

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
    getHotelsRatesResponse: getHotelsRatesJson,
    normalizedHotelsRates: normalizeHotelsRates(
      getHotelsRatesJson,
      searchFlowContextQuery
    )
  };
}

function buildHotelsRatesRequest(searchFlowContextQuery) {
  const mode = normalizeText(searchFlowContextQuery?.mode);
  const placeId = normalizeText(searchFlowContextQuery?.placeId);
  const aiSearch =
    normalizeText(searchFlowContextQuery?.aiSearch) ||
    normalizeText(searchFlowContextQuery?.message) ||
    normalizeText(searchFlowContextQuery?.query);
  const checkin = normalizeText(searchFlowContextQuery?.checkin);
  const checkout = normalizeText(searchFlowContextQuery?.checkout);
  const currency =
    normalizeText(searchFlowContextQuery?.currency).toUpperCase() ||
    DEFAULT_CURRENCY;
  const language =
    normalizeText(searchFlowContextQuery?.language).toLowerCase() ||
    DEFAULT_LANGUAGE;
  const guestNationality =
    language.toUpperCase() || DEFAULT_GUEST_NATIONALITY;
  const occupancies = buildHotelsRatesRequestOccupancies(searchFlowContextQuery);

  if (!checkin || !checkout) {
    throw new Error("checkin and checkout are required.");
  }

  if (!occupancies.length) {
    throw new Error("occupancies are required.");
  }

  const getHotelsRatesRequest = {
    occupancies,
    currency,
    guestNationality,
    checkin,
    checkout,
    includeHotelData: true,
    maxRatesPerHotel: 1,
    margin: 0
  };

  if (mode === "destination") {
    if (!placeId) {
      throw new Error("placeId is required for destination mode.");
    }

    getHotelsRatesRequest.placeId = placeId;
    return getHotelsRatesRequest;
  }

  if (mode === "vibe") {
    if (!aiSearch) {
      throw new Error("aiSearch is required for vibe mode.");
    }

    getHotelsRatesRequest.aiSearch = aiSearch;
    return getHotelsRatesRequest;
  }

  throw new Error("Unsupported search mode.");
}

function buildHotelsRatesRequestOccupancies(searchFlowContextQuery) {
  const rooms = normalizePositiveInteger(
    searchFlowContextQuery?.rooms,
    DEFAULT_ROOMS
  );

  const adultsList = normalizeText(searchFlowContextQuery?.adults)
    .split(",")
    .map((adultItem) => normalizePositiveInteger(adultItem, null))
    .filter((adultItem) => Number.isFinite(adultItem));

  const childrenByRoom = new Map();
  const childrenList = normalizeText(searchFlowContextQuery?.children)
    .split(",")
    .map((childItem) => normalizeText(childItem))
    .filter(Boolean);

  for (const childItem of childrenList) {
    const [roomNumberText, childAgeText] = childItem.split("_");
    const roomNumber = normalizePositiveInteger(roomNumberText, null);
    const childAge = normalizeIntegerOrNull(childAgeText);

    if (
      !Number.isFinite(roomNumber) ||
      roomNumber < 1 ||
      roomNumber > rooms ||
      !Number.isFinite(childAge)
    ) {
      continue;
    }

    if (!childrenByRoom.has(roomNumber)) {
      childrenByRoom.set(roomNumber, []);
    }

    childrenByRoom.get(roomNumber).push(childAge);
  }

  const occupancies = [];

  for (let roomNumber = 1; roomNumber <= rooms; roomNumber += 1) {
    const adults =
      Number.isFinite(adultsList[roomNumber - 1])
        ? adultsList[roomNumber - 1]
        : roomNumber === 1
          ? DEFAULT_FIRST_ROOM_ADULTS
          : DEFAULT_EXTRA_ROOM_ADULTS;

    occupancies.push({
      adults: normalizePositiveInteger(adults, DEFAULT_FIRST_ROOM_ADULTS),
      children: childrenByRoom.get(roomNumber) || []
    });
  }

  return occupancies.filter(
    (occupancyItem) => normalizePositiveInteger(occupancyItem?.adults, 0) > 0
  );
}

function normalizeHotelsRates(getHotelsRatesResponse, searchFlowContextQuery) {
  const hotels = Array.isArray(getHotelsRatesResponse?.hotels)
    ? getHotelsRatesResponse.hotels
    : [];
  const data = Array.isArray(getHotelsRatesResponse?.data)
    ? getHotelsRatesResponse.data
    : [];

  const hotelsById = new Map();

  for (const hotel of hotels) {
    const hotelId = normalizeText(hotel?.id) || normalizeText(hotel?.hotelId);

    if (hotelId) {
      hotelsById.set(hotelId, hotel);
    }
  }

  const normalizedHotelsRates = [];

  for (const item of data) {
    const hotelId =
      normalizeText(item?.hotelId) ||
      normalizeText(item?.hotel?.id) ||
      normalizeText(item?.id);

    if (!hotelId) {
      continue;
    }

    const hotel =
      hotelsById.get(hotelId) ||
      (item?.hotel && typeof item.hotel === "object" ? item.hotel : {});

    const roomTypes = Array.isArray(item?.roomTypes) ? item.roomTypes : [];

    let matchedRoomType = null;
    let matchedRate = null;
    let matchedRateTotalAmount = null;

    for (const roomType of roomTypes) {
      const rates = Array.isArray(roomType?.rates) ? roomType.rates : [];

      for (const rate of rates) {
        const rateTotalAmount = normalizeNumberOrNull(
          rate?.retailRate?.total?.[0]?.amount
        );

        if (!Number.isFinite(rateTotalAmount)) {
          continue;
        }

        if (
          !Number.isFinite(matchedRateTotalAmount) ||
          rateTotalAmount < matchedRateTotalAmount
        ) {
          matchedRoomType = roomType;
          matchedRate = rate;
          matchedRateTotalAmount = rateTotalAmount;
        }
      }
    }

    normalizedHotelsRates.push({
      hotelId,
      hotelName:
        normalizeText(hotel?.name) ||
        normalizeText(item?.name) ||
        "Hotel",
      hotelAddress:
        normalizeText(hotel?.address) ||
        normalizeText(item?.address) ||
        null,
      hotelReviewCount: normalizeIntegerOrNull(
        hotel?.reviewCount ?? hotel?.review_count ?? item?.reviewCount
      ),
      hotelRating: normalizeNumberOrNull(
        hotel?.rating ?? item?.rating ?? item?.hotel?.rating
      ),
      hotelOffersBeforeMinCurrentPrice: normalizeNumberOrNull(
        matchedRoomType?.suggestedSellingPrice?.amount
      ),
      hotelOffersMinCurrentPrice: normalizeNumberOrNull(
        matchedRate?.retailRate?.total?.[0]?.amount
      ),
      hotelOffersMinCurrentPriceNote: buildHotelsRatesPriceNote(
        searchFlowContextQuery,
        matchedRate
      ),
      hotelMainImage: normalizeText(hotel?.main_photo) || null,
      hotelStarRating: normalizeNumberOrNull(
        hotel?.starRating ??
          hotel?.star_rating ??
          item?.starRating ??
          item?.star_rating ??
          item?.hotel?.starRating ??
          item?.hotel?.star_rating
      )
    });
  }

  return normalizedHotelsRates;
}

function buildHotelsRatesPriceNote(searchFlowContextQuery, matchedRate) {
  const checkinDate = new Date(normalizeText(searchFlowContextQuery?.checkin));
  const checkoutDate = new Date(normalizeText(searchFlowContextQuery?.checkout));

  const nightCount =
    !Number.isNaN(checkinDate.getTime()) && !Number.isNaN(checkoutDate.getTime())
      ? Math.max(
          1,
          Math.round(
            (checkoutDate.getTime() - checkinDate.getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : 1;

  const roomCount = normalizePositiveInteger(
    searchFlowContextQuery?.rooms,
    DEFAULT_ROOMS
  );

  const taxesAndFees = Array.isArray(matchedRate?.retailRate?.taxesAndFees)
    ? matchedRate.retailRate.taxesAndFees
    : [];

  const taxesAndFeesText = taxesAndFees.some(
    (taxesAndFeesItem) => taxesAndFeesItem?.included === false
  )
    ? "excl."
    : "incl.";

  return `${nightCount} night, ${roomCount} room, ${taxesAndFeesText} taxes & fees`;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeNumberOrNull(value) {
  const normalizedNumber = Number(value);
  return Number.isFinite(normalizedNumber) ? normalizedNumber : null;
}

function normalizeIntegerOrNull(value) {
  const normalizedInteger = Number(value);
  return Number.isFinite(normalizedInteger)
    ? Math.trunc(normalizedInteger)
    : null;
}

function normalizePositiveInteger(value, fallbackValue) {
  const normalizedInteger = Number(value);

  if (!Number.isFinite(normalizedInteger) || normalizedInteger <= 0) {
    return fallbackValue;
  }

  return Math.trunc(normalizedInteger);
}
