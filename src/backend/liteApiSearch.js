import { buildLiteApiError, liteApiRequest, parseJson } from "./liteApiClient";
import {
  buildLiteApiOccupancies,
  buildPriceNote,
  getBeforePriceObject,
  getCurrentPriceObject,
  normalizeMaybeInteger,
  normalizeMaybeNumber
} from "./liteApiTransforms";

const LITE_API_BASE_URL = "https://api.liteapi.travel/v3.0";
const DEFAULT_CURRENCY = "USD";
const DEFAULT_GUEST_NATIONALITY = "US";

export async function searchPlacesHandler(textQuery) {
  const query = String(textQuery || "").trim();

  if (query.length < 2) {
    return [];
  }

  const response = await liteApiRequest(
    `${LITE_API_BASE_URL}/data/places?textQuery=${encodeURIComponent(query)}`,
    { method: "GET" }
  );

  const json = await parseJson(response);

  if (!response.ok) {
    throw buildLiteApiError(json, "Places autocomplete request failed.");
  }

  return Array.isArray(json?.data)
    ? json.data.map((place) => ({
        placeId: place.placeId,
        displayName: place.displayName,
        formattedAddress: place.formattedAddress
      }))
    : [];
}

export async function searchHotelRatesHandler(searchFormData) {
  const body = buildRatesSearchBody(searchFormData);

  const response = await liteApiRequest(`${LITE_API_BASE_URL}/hotels/rates`, {
    method: "POST",
    body
  });

  const json = await parseJson(response);

  if (!response.ok) {
    throw buildLiteApiError(json, "Hotel search request failed.");
  }

  return {
    mode: searchFormData?.mode || null,
    occupancySentToLiteApi: body.occupancies,
    occupancyUiState: searchFormData?.occupancy || null,
    raw: json,
    normalizedHotels: normalizeHotelSearchResponse(json, searchFormData)
  };
}

function buildRatesSearchBody(searchFormData) {
  const mode = String(searchFormData?.mode || "").trim();
  const checkIn = String(searchFormData?.checkIn || "").trim();
  const checkOut = String(searchFormData?.checkOut || "").trim();

  if (!checkIn || !checkOut) {
    throw new Error("Check-in and check-out are required.");
  }

  const body = {
    occupancies: buildLiteApiOccupancies(searchFormData?.occupancy),
    currency: DEFAULT_CURRENCY,
    guestNationality: DEFAULT_GUEST_NATIONALITY,
    checkin: checkIn,
    checkout: checkOut,
    roomMapping: true,
    maxRatesPerHotel: 1,
    includeHotelData: true
  };

  if (mode === "destination") {
    const placeId = String(searchFormData?.placeId || "").trim();

    if (!placeId) {
      throw new Error("placeId is required for destination mode.");
    }

    body.placeId = placeId;
    return body;
  }

  if (mode === "vibe") {
    const aiSearch = String(searchFormData?.aiSearch || "").trim();

    if (!aiSearch) {
      throw new Error("aiSearch is required for vibe mode.");
    }

    body.aiSearch = aiSearch;
    return body;
  }

  throw new Error("Unsupported search mode.");
}

function normalizeHotelSearchResponse(raw, searchFormData) {
  const mode = String(searchFormData?.mode || "").trim();
  const data = Array.isArray(raw?.data) ? raw.data : [];
  const hotels = Array.isArray(raw?.hotels) ? raw.hotels : [];

  const hotelsById = new Map();
  hotels.forEach((hotel) => {
    const hotelId = hotel?.id || hotel?.hotelId;
    if (hotelId) {
      hotelsById.set(hotelId, hotel);
    }
  });

  const normalizedFromRates = data.map((item) => {
    const hotelId = item?.hotelId;
    const hotelData = item?.hotel || hotelsById.get(hotelId) || item;

    return normalizeHotelCard({
      hotelId,
      hotelData,
      ratesEntry: item,
      searchFormData
    });
  });

  if (mode !== "vibe") {
    return normalizedFromRates;
  }

  const ratesByHotelId = new Map();
  normalizedFromRates.forEach((hotel) => {
    if (hotel.hotelId) {
      ratesByHotelId.set(hotel.hotelId, hotel);
    }
  });

  return hotels.map((hotel) => {
    const hotelId = hotel?.id || hotel?.hotelId;
    const fromRates = ratesByHotelId.get(hotelId);

    if (fromRates) {
      return {
        ...fromRates,
        hotelId,
        name: fromRates.name || hotel?.name || "Hotel",
        address: fromRates.address || hotel?.address || "",
        mainPhoto: fromRates.mainPhoto || hotel?.main_photo || null,
        guestRating:
          fromRates.guestRating ?? normalizeMaybeNumber(hotel?.rating),
        starRating:
          fromRates.starRating ?? normalizeMaybeNumber(hotel?.starRating),
        reviewCount:
          fromRates.reviewCount ?? normalizeMaybeInteger(hotel?.reviewCount),
        tags: Array.isArray(hotel?.tags) ? hotel.tags : [],
        story: String(hotel?.story || "")
      };
    }

    return normalizeHotelCard({
      hotelId,
      hotelData: hotel,
      ratesEntry: null,
      searchFormData
    });
  });
}

function normalizeHotelCard({ hotelId, hotelData, ratesEntry, searchFormData }) {
  const firstRoomType = ratesEntry?.roomTypes?.[0] || null;
  const firstRate = firstRoomType?.rates?.[0] || null;

  const currentPrice = getCurrentPriceObject(firstRate, firstRoomType);
  const beforePrice = getBeforePriceObject(firstRate, currentPrice, firstRoomType);
  const priceNote = buildPriceNote(searchFormData, firstRate);

  return {
    hotelId: hotelId || hotelData?.id || null,
    offerId: firstRoomType?.offerId || null,
    name:
      hotelData?.name ||
      ratesEntry?.hotelName ||
      ratesEntry?.name ||
      "Hotel",
    address: hotelData?.address || ratesEntry?.address || "",
    mainPhoto:
      hotelData?.main_photo ||
      hotelData?.mainPhoto ||
      ratesEntry?.main_photo ||
      ratesEntry?.mainPhoto ||
      null,
    starRating: normalizeMaybeNumber(
      hotelData?.starRating ??
        hotelData?.star_rating ??
        ratesEntry?.hotel?.starRating ??
        ratesEntry?.starRating ??
        null
    ),
    guestRating: normalizeMaybeNumber(
      hotelData?.rating ??
        ratesEntry?.hotel?.rating ??
        ratesEntry?.rating ??
        null
    ),
    reviewCount: normalizeMaybeInteger(
      hotelData?.reviewCount ??
        hotelData?.review_count ??
        ratesEntry?.hotel?.reviewCount ??
        ratesEntry?.reviewCount ??
        null
    ),
    currentPrice,
    beforePrice,
    priceNote,
    refundableTag: firstRate?.cancellationPolicies?.refundableTag || null,
    tags: Array.isArray(hotelData?.tags) ? hotelData.tags : [],
    story: String(hotelData?.story || "")
  };
}
