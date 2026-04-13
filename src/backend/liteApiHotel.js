import { buildLiteApiError, liteApiRequest, parseJson } from "./liteApiClient";
import {
  buildLiteApiOccupancies,
  buildPriceNote,
  dedupeStringArray,
  getBeforePriceObject,
  getCurrentPriceObject,
  normalizeBedTypes,
  normalizeImageUrl,
  normalizeMaybeInteger,
  normalizeMaybeNumber,
  normalizeRichText,
  normalizeStringArray
} from "./liteApiTransforms";

const LITE_API_BASE_URL = "https://api.liteapi.travel/v3.0";
const DEFAULT_CURRENCY = "USD";
const DEFAULT_GUEST_NATIONALITY = "US";

export async function getHotelDetailsHandler(hotelId) {
  const normalizedHotelId = String(hotelId || "").trim();

  if (!normalizedHotelId) {
    throw new Error("hotelId is required.");
  }

  const response = await liteApiRequest(
    `${LITE_API_BASE_URL}/data/hotel?hotelId=${encodeURIComponent(
      normalizedHotelId
    )}&timeout=4`,
    { method: "GET" }
  );

  const json = await parseJson(response);

  if (!response.ok) {
    throw buildLiteApiError(json, "Hotel details request failed.");
  }

  return {
    hotelId: normalizedHotelId,
    raw: json,
    normalizedHotel: normalizeHotelDetails(json?.data || null)
  };
}

export async function getHotelRatesByHotelIdHandler(payload) {
  const body = buildSingleHotelRatesBody(payload);

  const response = await liteApiRequest(`${LITE_API_BASE_URL}/hotels/rates`, {
    method: "POST",
    body
  });

  const json = await parseJson(response);

  if (!response.ok) {
    throw buildLiteApiError(json, "Hotel room rates request failed.");
  }

  return {
    hotelId: body.hotelIds[0],
    occupancySentToLiteApi: body.occupancies,
    raw: json,
    normalizedRoomGroups: normalizeHotelRoomGroups(json, payload),
    lowestPrice: getLowestPriceFromRatesJson(json)
  };
}

function buildSingleHotelRatesBody(payload) {
  const hotelId = String(payload?.hotelId || "").trim();
  const checkIn = String(payload?.checkIn || payload?.checkin || "").trim();
  const checkOut = String(payload?.checkOut || payload?.checkout || "").trim();
  const currency =
    String(payload?.currency || DEFAULT_CURRENCY).trim() || DEFAULT_CURRENCY;
  const guestNationality =
    String(payload?.guestNationality || DEFAULT_GUEST_NATIONALITY).trim() ||
    DEFAULT_GUEST_NATIONALITY;

  if (!hotelId) {
    throw new Error("hotelId is required.");
  }

  if (!checkIn || !checkOut) {
    throw new Error("Check-in and check-out are required.");
  }

  return {
    hotelIds: [hotelId],
    occupancies: buildLiteApiOccupancies(payload?.occupancy),
    currency,
    guestNationality,
    checkin: checkIn,
    checkout: checkOut,
    roomMapping: true,
    includeHotelData: false
  };
}

function normalizeHotelDetails(hotel) {
  if (!hotel || typeof hotel !== "object") {
    return null;
  }

  const rooms = Array.isArray(hotel?.rooms)
    ? hotel.rooms.map(normalizeRoomDetails).filter(Boolean)
    : [];

  return {
    hotelId: String(hotel?.id || hotel?.hotelId || "").trim() || null,
    name: String(hotel?.name || "Hotel"),
    address: String(hotel?.address || ""),
    city: String(hotel?.city || ""),
    country: String(hotel?.country || ""),
    mainPhoto: normalizeImageUrl(hotel?.main_photo),
    images: normalizeHotelImages(hotel),
    starRating: normalizeMaybeNumber(
      hotel?.starRating ?? hotel?.star_rating ?? null
    ),
    guestRating: normalizeMaybeNumber(hotel?.rating ?? null),
    reviewCount: normalizeMaybeInteger(
      hotel?.reviewCount ?? hotel?.review_count ?? null
    ),
    hotelDescription: normalizeRichText(hotel?.hotelDescription),
    hotelImportantInformation: normalizeRichText(
      hotel?.hotelImportantInformation
    ),
    facilities: normalizeStringArray(
      hotel?.hotelFacilities ?? hotel?.facilities ?? []
    ),
    policies: Array.isArray(hotel?.policies)
      ? hotel.policies
          .map((policy) => ({
            name: String(policy?.name || "").trim(),
            description: normalizeRichText(policy?.description)
          }))
          .filter((policy) => policy.name || policy.description)
      : [],
    location: {
      latitude: normalizeMaybeNumber(hotel?.location?.latitude),
      longitude: normalizeMaybeNumber(hotel?.location?.longitude)
    },
    rooms
  };
}

function normalizeRoomDetails(room) {
  if (!room || typeof room !== "object") {
    return null;
  }

  const roomId =
    room?.id !== undefined && room?.id !== null ? String(room.id) : null;

  return {
    roomId,
    roomName: String(room?.roomName || room?.name || "").trim() || "",
    description: normalizeRichText(room?.description),
    maxOccupancy: normalizeMaybeInteger(room?.maxOccupancy),
    roomSizeSquare: normalizeMaybeNumber(room?.roomSizeSquare),
    roomSizeUnit: String(room?.roomSizeUnit || "").trim(),
    bedTypes: normalizeBedTypes(room?.bedTypes),
    roomAmenities: normalizeStringArray(room?.roomAmenities),
    photos: normalizeRoomPhotos(room?.photos)
  };
}

function normalizeHotelImages(hotel) {
  const orderedImages = [];

  const mainPhoto = normalizeImageUrl(hotel?.main_photo);
  if (mainPhoto) {
    orderedImages.push(mainPhoto);
  }

  const hotelImages = Array.isArray(hotel?.hotelImages) ? hotel.hotelImages : [];

  hotelImages
    .slice()
    .sort((left, right) => {
      const leftDefault = left?.defaultImage ? 0 : 1;
      const rightDefault = right?.defaultImage ? 0 : 1;
      if (leftDefault !== rightDefault) {
        return leftDefault - rightDefault;
      }

      const leftOrder = Number.isFinite(Number(left?.order))
        ? Number(left.order)
        : Number.MAX_SAFE_INTEGER;

      const rightOrder = Number.isFinite(Number(right?.order))
        ? Number(right.order)
        : Number.MAX_SAFE_INTEGER;

      return leftOrder - rightOrder;
    })
    .forEach((image) => {
      const url = normalizeImageUrl(image?.url);
      if (url) {
        orderedImages.push(url);
      }
    });

  return dedupeStringArray(orderedImages);
}

function normalizeRoomPhotos(photos) {
  if (!Array.isArray(photos)) {
    return [];
  }

  return dedupeStringArray(
    photos.map((photo) => normalizeImageUrl(photo?.url)).filter(Boolean)
  );
}

function normalizeHotelRoomGroups(raw, searchContext) {
  const data = Array.isArray(raw?.data) ? raw.data : [];
  const firstHotelEntry = data[0];

  if (!firstHotelEntry) {
    return [];
  }

  const roomTypes = Array.isArray(firstHotelEntry?.roomTypes)
    ? firstHotelEntry.roomTypes
    : [];

  const grouped = new Map();

  roomTypes.forEach((roomType, roomTypeIndex) => {
    const roomTypeOfferId = String(roomType?.offerId || "").trim() || null;
    const rates = Array.isArray(roomType?.rates) ? roomType.rates : [];

    rates.forEach((rate, rateIndex) => {
      const mappedRoomId =
        rate?.mappedRoomId !== undefined && rate?.mappedRoomId !== null
          ? String(rate.mappedRoomId)
          : null;

      const supplierRoomName =
        String(rate?.name || "").trim() || "Room";
      const groupKey =
        mappedRoomId || `unmapped-${roomTypeIndex + 1}-${rateIndex + 1}`;

      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          groupKey,
          mappedRoomId,
          roomTypeId: String(roomType?.roomTypeId || roomType?.id || roomTypeIndex + 1),
          roomNameFromRates: supplierRoomName,
          roomName: supplierRoomName,
          boardType: String(roomType?.boardType || "").trim() || null,
          offers: []
        });
      }

      const currentPrice = getCurrentPriceObject(rate, roomType);
      if (!currentPrice) {
        return;
      }

      const beforePrice = getBeforePriceObject(rate, currentPrice, roomType);

      grouped.get(groupKey).offers.push({
        offerId: roomTypeOfferId,
        mappedRoomId,
        name: supplierRoomName || "Room rate",
        boardName: String(rate?.boardName || "").trim(),
        occupancyNumber:
          normalizeMaybeInteger(rate?.occupancyNumber) ||
          normalizeMaybeInteger(rate?.occupancy_number) ||
          1,
        currentPrice,
        beforePrice,
        refundableTag:
          String(rate?.cancellationPolicies?.refundableTag || "").trim() || null,
        cancellationPolicies: normalizeStringArray(
          rate?.cancellationPolicies?.cancelPolicyInfos
        ),
        roomDescription:
          String(rate?.roomDescription || roomType?.description || "").trim() ||
          null,
        amenities: normalizeStringArray(
          rate?.roomAmenities || roomType?.roomAmenities
        ),
        beds: normalizeBedTypes(rate?.bedTypes || roomType?.bedTypes),
        roomSizeSquare:
          normalizeMaybeNumber(rate?.roomSizeSquare) ||
          normalizeMaybeNumber(roomType?.roomSizeSquare),
        roomSizeUnit:
          String(rate?.roomSizeUnit || roomType?.roomSizeUnit || "").trim() ||
          null,
        maxOccupancy:
          normalizeMaybeInteger(rate?.maxOccupancy) ||
          normalizeMaybeInteger(roomType?.maxOccupancy),
        priceNote: buildPriceNote(searchContext, rate),
        raw: rate
      });
    });
  });

  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      offers: group.offers
        .slice()
        .sort((left, right) => {
          const leftAmount = Number(left?.currentPrice?.amount);
          const rightAmount = Number(right?.currentPrice?.amount);

          if (!Number.isFinite(leftAmount)) {
            return 1;
          }

          if (!Number.isFinite(rightAmount)) {
            return -1;
          }

          return leftAmount - rightAmount;
        })
    }))
    .sort((left, right) => {
      const leftAmount = Number(left?.offers?.[0]?.currentPrice?.amount);
      const rightAmount = Number(right?.offers?.[0]?.currentPrice?.amount);

      if (!Number.isFinite(leftAmount)) {
        return 1;
      }

      if (!Number.isFinite(rightAmount)) {
        return -1;
      }

      return leftAmount - rightAmount;
    });
}

function getLowestPriceFromRatesJson(raw) {
  const roomGroups = normalizeHotelRoomGroups(raw, null);
  const amounts = roomGroups
    .flatMap((group) => group.offers || [])
    .map((offer) => offer.currentPrice)
    .filter(Boolean);

  if (!amounts.length) {
    return null;
  }

  return amounts.reduce((lowest, current) => {
    if (!lowest) {
      return current;
    }

    return current.amount < lowest.amount ? current : lowest;
  }, null);
}
