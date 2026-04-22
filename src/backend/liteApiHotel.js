import { buildLiteApiError, liteApiRequest, parseJson } from "./liteApiClient";

const LITE_API_BASE_URL = "https://api.liteapi.travel/v3.0";
const DEFAULT_CURRENCY = "USD";
const DEFAULT_GUEST_NATIONALITY = "US";

export async function getHotelDetailsHandler(hotelId) {
  const normalizedHotelId = normalizeText(hotelId);

  if (!normalizedHotelId) {
    throw new Error("hotelId is required.");
  }

  const getHotelDetailsResponse = await parseJson(
    await liteApiRequest(
      `${LITE_API_BASE_URL}/data/hotel?hotelId=${encodeURIComponent(
        normalizedHotelId
      )}&timeout=4`,
      {
        method: "GET"
      }
    )
  );

  if (!getHotelDetailsResponse || typeof getHotelDetailsResponse !== "object") {
    throw new Error("Hotel details response is invalid.");
  }

  if (getHotelDetailsResponse.error) {
    throw buildLiteApiError(getHotelDetailsResponse, "Hotel details request failed.");
  }

  const normalizedHotelDetails = normalizeHotelDetails(
    getHotelDetailsResponse?.data || null
  );

  return {
    hotelId: normalizedHotelId,
    raw: getHotelDetailsResponse,
    normalizedHotelDetails
  };
}

export async function getMappedRoomRatesByHotelIdHandler(payload) {
  const getMappedRoomRatesByHotelIdRequestBody =
    buildMappedRoomRatesByHotelIdRequestBody(payload);

  const getMappedRoomRatesByHotelIdResponse = await parseJson(
    await liteApiRequest(`${LITE_API_BASE_URL}/hotels/rates`, {
      method: "POST",
      body: getMappedRoomRatesByHotelIdRequestBody
    })
  );

  if (
    !getMappedRoomRatesByHotelIdResponse ||
    typeof getMappedRoomRatesByHotelIdResponse !== "object"
  ) {
    throw new Error("Hotel rates response is invalid.");
  }

  if (getMappedRoomRatesByHotelIdResponse.error) {
    throw buildLiteApiError(
      getMappedRoomRatesByHotelIdResponse,
      "Hotel room rates request failed."
    );
  }

  const normalizedMappedRoomRatesByHotelId =
    normalizeMappedRoomRatesByHotelId({
      getMappedRoomRatesByHotelIdResponse,
      checkin: getMappedRoomRatesByHotelIdRequestBody.checkin,
      checkout: getMappedRoomRatesByHotelIdRequestBody.checkout
    });

  return {
    hotelId: getMappedRoomRatesByHotelIdRequestBody.hotelIds[0],
    raw: getMappedRoomRatesByHotelIdResponse,
    normalizedMappedRoomRatesByHotelId
  };
}

export async function getMergedMappedRoomOffersHandler(payload) {
  const normalizedHotelId = normalizeText(payload?.hotelId);

  if (!normalizedHotelId) {
    throw new Error("hotelId is required.");
  }

  const getHotelDetailsResult = await getHotelDetailsHandler(normalizedHotelId);
  const getMappedRoomRatesByHotelIdResult = await getMappedRoomRatesByHotelIdHandler({
    ...payload,
    hotelId: normalizedHotelId
  });

  const normalizedMergedMappedRoomOffers = normalizeMergedMappedRoomOffers({
    normalizedHotelDetails: getHotelDetailsResult?.normalizedHotelDetails || null,
    normalizedMappedRoomRatesByHotelId:
      getMappedRoomRatesByHotelIdResult?.normalizedMappedRoomRatesByHotelId || []
  });

  return {
    hotelId: normalizedHotelId,
    raw: {
      getHotelDetailsResponse: getHotelDetailsResult?.raw || null,
      getMappedRoomRatesByHotelIdResponse:
        getMappedRoomRatesByHotelIdResult?.raw || null
    },
    normalizedHotelDetails: getHotelDetailsResult?.normalizedHotelDetails || null,
    normalizedMergedMappedRoomOffers
  };
}

function buildMappedRoomRatesByHotelIdRequestBody(payload) {
  const normalizedHotelId = normalizeText(payload?.hotelId);
  const normalizedCheckin = normalizeText(payload?.checkIn || payload?.checkin);
  const normalizedCheckout = normalizeText(payload?.checkOut || payload?.checkout);
  const normalizedCurrency =
    normalizeText(payload?.currency).toUpperCase() || DEFAULT_CURRENCY;
  const normalizedGuestNationality =
    normalizeText(payload?.guestNationality).toUpperCase() || DEFAULT_GUEST_NATIONALITY;
  const normalizedOccupancies = buildMappedRoomRatesByHotelIdOccupancies(payload);

  if (!normalizedHotelId) {
    throw new Error("hotelId is required.");
  }

  if (!normalizedCheckin || !normalizedCheckout) {
    throw new Error("checkin and checkout are required.");
  }

  return {
    hotelIds: [normalizedHotelId],
    occupancies: normalizedOccupancies,
    currency: normalizedCurrency,
    guestNationality: normalizedGuestNationality,
    checkin: normalizedCheckin,
    checkout: normalizedCheckout,
    roomMapping: true,
    includeHotelData: false
  };
}

function buildMappedRoomRatesByHotelIdOccupancies(payload) {
  const occupancy = payload?.occupancy;

  if (Array.isArray(payload?.occupancies) && payload.occupancies.length > 0) {
    return payload.occupancies
      .map((occupancyItem) => ({
        adults: normalizePositiveInteger(occupancyItem?.adults, 2),
        children: Array.isArray(occupancyItem?.children)
          ? occupancyItem.children
              .map((childAge) => normalizeIntegerOrNull(childAge))
              .filter((childAge) => Number.isFinite(childAge))
          : []
      }))
      .filter((occupancyItem) => occupancyItem.adults > 0);
  }

  return [
    {
      adults: normalizePositiveInteger(occupancy?.adults, 2),
      children: Array.isArray(occupancy?.childAges)
        ? occupancy.childAges
            .map((childAge) => normalizeIntegerOrNull(childAge))
            .filter((childAge) => Number.isFinite(childAge))
        : []
    }
  ];
}

function normalizeHotelDetails(hotel) {
  if (!hotel || typeof hotel !== "object") {
    return null;
  }

  return {
    hotelId: normalizeText(hotel?.id || hotel?.hotelId) || null,
    hotelName: normalizeText(hotel?.name) || "Hotel",
    hotelAddress: normalizeText(hotel?.address),
    hotelStarRating: normalizeNumberOrNull(hotel?.starRating),
    hotelRating: normalizeNumberOrNull(hotel?.rating),
    hotelReviewCount: normalizeIntegerOrNull(hotel?.reviewCount),
    hotelMainImage:
      normalizeText(hotel?.main_photo) ||
      normalizeText(hotel?.thumbnail) ||
      normalizeText(hotel?.hotelImages?.[0]?.url),
    hotelImages: Array.isArray(hotel?.hotelImages) ? hotel.hotelImages : [],
    hotelDescription: stripHtml(hotel?.hotelDescription),
    hotelImportantInformation: stripHtml(hotel?.hotelImportantInformation),
    hotelCheckinCheckoutTimes: normalizeHotelCheckinCheckoutTimes(
      hotel?.checkinCheckoutTimes
    ),
    hotelFacilities: Array.isArray(hotel?.hotelFacilities)
      ? hotel.hotelFacilities
          .map((facility) => normalizeText(facility))
          .filter(Boolean)
      : [],
    hotelPolicies: Array.isArray(hotel?.policies)
      ? hotel.policies
          .map((policy) => ({
            name: normalizeText(policy?.name),
            description: stripHtml(policy?.description)
          }))
          .filter((policy) => policy.name || policy.description)
      : [],
    hotelMapUrl: buildHotelMapUrl(
      hotel?.location?.latitude,
      hotel?.location?.longitude
    ),
    rooms: Array.isArray(hotel?.rooms)
      ? hotel.rooms.map((room) => normalizeHotelDetailsRoom({ room, hotel })).filter(Boolean)
      : []
  };
}

function normalizeHotelCheckinCheckoutTimes(hotelCheckinCheckoutTimes) {
  const normalizedHotelCheckinCheckoutTimes =
    hotelCheckinCheckoutTimes && typeof hotelCheckinCheckoutTimes === "object"
      ? hotelCheckinCheckoutTimes
      : {};

  return {
    checkin_start: normalizeText(
      normalizedHotelCheckinCheckoutTimes?.checkin_start
    ),
    checkin_end: normalizeText(normalizedHotelCheckinCheckoutTimes?.checkin_end),
    checkout: normalizeText(normalizedHotelCheckinCheckoutTimes?.checkout),
    instructions: Array.isArray(normalizedHotelCheckinCheckoutTimes?.instructions)
      ? normalizedHotelCheckinCheckoutTimes.instructions
      : [],
    special_instructions: normalizeText(
      normalizedHotelCheckinCheckoutTimes?.special_instructions
    )
  };
}

function normalizeHotelDetailsRoom({ room, hotel }) {
  if (!room || typeof room !== "object") {
    return null;
  }

  const roomImages = Array.isArray(room?.photos)
    ? room.photos
        .map((photo) =>
          normalizeText(photo?.url) ||
          normalizeText(photo?.hd_url) ||
          normalizeText(photo?.failoverPhoto)
        )
        .filter(Boolean)
    : [];

  const roomDefaultImage = Array.isArray(room?.photos)
    ? room.photos.find((photo) => photo?.mainPhoto === true)
    : null;

  const roomMainImage =
    normalizeText(roomDefaultImage?.url) ||
    normalizeText(roomDefaultImage?.hd_url) ||
    normalizeText(roomDefaultImage?.failoverPhoto) ||
    normalizeText(roomImages[0]) ||
    normalizeText(hotel?.main_photo) ||
    normalizeText(hotel?.thumbnail) ||
    "";

  return {
    roomId: normalizeIntegerOrNull(room?.id),
    roomName: normalizeText(room?.roomName || room?.name),
    roomDescription: stripHtml(room?.description),
    roomMainImage,
    roomImages,
    roomAmenities: Array.isArray(room?.roomAmenities) ? room.roomAmenities : [],
    roomSizeText: buildRoomSizeText(
      room?.roomSizeSquare,
      room?.roomSizeUnit
    ),
    roomBedTypesText: buildRoomBedTypesText(room?.bedTypes),
    roomSleepsText: normalizeIntegerOrNull(room?.maxOccupancy)
  };
}

function normalizeMappedRoomRatesByHotelId({
  getMappedRoomRatesByHotelIdResponse,
  checkin,
  checkout
}) {
  const normalizedMappedRoomRatesByHotelIdMap = new Map();
  const hotelEntries = Array.isArray(getMappedRoomRatesByHotelIdResponse?.data)
    ? getMappedRoomRatesByHotelIdResponse.data
    : [];

  hotelEntries.forEach((hotelEntry) => {
    const roomTypes = Array.isArray(hotelEntry?.roomTypes) ? hotelEntry.roomTypes : [];

    roomTypes.forEach((roomType, roomTypeIndex) => {
      const normalizedOfferId = normalizeText(roomType?.offerId);
      const roomTypeRates = Array.isArray(roomType?.rates) ? roomType.rates : [];

      roomTypeRates.forEach((rate, rateIndex) => {
        const normalizedMappedRoomId = normalizeIntegerOrNull(rate?.mappedRoomId);
        const mappedRoomRatesKey = Number.isFinite(normalizedMappedRoomId)
          ? String(normalizedMappedRoomId)
          : `unmapped-${roomTypeIndex + 1}-${rateIndex + 1}`;

        if (!normalizedMappedRoomRatesByHotelIdMap.has(mappedRoomRatesKey)) {
          normalizedMappedRoomRatesByHotelIdMap.set(mappedRoomRatesKey, {
            mappedRoomId: Number.isFinite(normalizedMappedRoomId)
              ? normalizedMappedRoomId
              : null,
            roomOffers: []
          });
        }

        const roomOfferCurrentPrice = normalizeNumberOrNull(
          rate?.retailRate?.total?.[0]?.amount
        );
        const roomOfferCurrentPriceCurrency = normalizeText(
          rate?.retailRate?.total?.[0]?.currency
        );

        if (!Number.isFinite(roomOfferCurrentPrice) || !roomOfferCurrentPriceCurrency) {
          return;
        }

        const roomOfferSuggestedSellingPrice = normalizeNumberOrNull(
          rate?.retailRate?.suggestedSellingPrice?.[0]?.amount
        );
        const roomOfferInitialPrice = normalizeNumberOrNull(
          rate?.retailRate?.initialPrice?.[0]?.amount
        );

        let roomOfferBeforeCurrentPrice = null;
        if (
          Number.isFinite(roomOfferSuggestedSellingPrice) &&
          roomOfferSuggestedSellingPrice > roomOfferCurrentPrice
        ) {
          roomOfferBeforeCurrentPrice = roomOfferSuggestedSellingPrice;
        } else if (
          Number.isFinite(roomOfferInitialPrice) &&
          roomOfferInitialPrice > roomOfferCurrentPrice
        ) {
          roomOfferBeforeCurrentPrice = roomOfferInitialPrice;
        }

        const roomOfferBeforeCurrentPriceCurrency = roomOfferBeforeCurrentPrice
          ? normalizeText(
              rate?.retailRate?.suggestedSellingPrice?.[0]?.currency ||
                rate?.retailRate?.initialPrice?.[0]?.currency ||
                roomOfferCurrentPriceCurrency
            )
          : "";

        const roomOfferRefundableTag = normalizeText(
          rate?.cancellationPolicies?.refundableTag
        );

        const roomOfferRefundableTagText = buildRoomOfferRefundableTagText(
          roomOfferRefundableTag
        );

        const roomOfferCurrentPriceNoteText = buildRoomOfferCurrentPriceNoteText({
          occupancyNumber: rate?.occupancyNumber,
          checkin,
          checkout,
          taxesAndFees: rate?.retailRate?.taxesAndFees
        });

        normalizedMappedRoomRatesByHotelIdMap.get(mappedRoomRatesKey).roomOffers.push({
          roomOfferId: normalizeText(rate?.rateId) || null,
          roomOfferName: normalizeText(rate?.name) || "Room rate",
          roomOfferMappedRoomId: Number.isFinite(normalizedMappedRoomId)
            ? normalizedMappedRoomId
            : null,
          roomOfferBoardName: normalizeText(rate?.boardName),
          roomOfferOccupancyNumber: normalizeIntegerOrNull(rate?.occupancyNumber),
          roomOfferAdultCount: normalizeIntegerOrNull(rate?.adultCount),
          roomOfferChildCount: normalizeIntegerOrNull(rate?.childCount),
          roomOfferChildrenAges: Array.isArray(rate?.childrenAges)
            ? rate.childrenAges
                .map((childAge) => normalizeIntegerOrNull(childAge))
                .filter((childAge) => Number.isFinite(childAge))
            : [],
          roomOfferCurrentPrice,
          roomOfferCurrentPriceCurrency,
          roomOfferBeforeCurrentPrice,
          roomOfferBeforeCurrentPriceCurrency,
          roomOfferRefundableTag: roomOfferRefundableTag || null,
          roomOfferRefundableTagText,
          roomOfferCurrentPriceNoteText,
          offerId: normalizedOfferId
        });
      });
    });
  });

  return Array.from(normalizedMappedRoomRatesByHotelIdMap.values())
    .map((mappedRoomRatesItem) => ({
      mappedRoomId: mappedRoomRatesItem.mappedRoomId,
      roomOffers: mappedRoomRatesItem.roomOffers
        .slice()
        .sort((leftRoomOfferItem, rightRoomOfferItem) => {
          const leftRoomOfferCurrentPrice = Number(leftRoomOfferItem?.roomOfferCurrentPrice);
          const rightRoomOfferCurrentPrice = Number(
            rightRoomOfferItem?.roomOfferCurrentPrice
          );

          if (!Number.isFinite(leftRoomOfferCurrentPrice)) {
            return 1;
          }

          if (!Number.isFinite(rightRoomOfferCurrentPrice)) {
            return -1;
          }

          return leftRoomOfferCurrentPrice - rightRoomOfferCurrentPrice;
        })
    }))
    .sort((leftMappedRoomRatesItem, rightMappedRoomRatesItem) => {
      const leftRoomOfferCurrentPrice = Number(
        leftMappedRoomRatesItem?.roomOffers?.[0]?.roomOfferCurrentPrice
      );
      const rightRoomOfferCurrentPrice = Number(
        rightMappedRoomRatesItem?.roomOffers?.[0]?.roomOfferCurrentPrice
      );

      if (!Number.isFinite(leftRoomOfferCurrentPrice)) {
        return 1;
      }

      if (!Number.isFinite(rightRoomOfferCurrentPrice)) {
        return -1;
      }

      return leftRoomOfferCurrentPrice - rightRoomOfferCurrentPrice;
    });
}

function normalizeMergedMappedRoomOffers({
  normalizedHotelDetails,
  normalizedMappedRoomRatesByHotelId
}) {
  const normalizedRoomsByRoomId = new Map();
  const normalizedHotelRooms = Array.isArray(normalizedHotelDetails?.rooms)
    ? normalizedHotelDetails.rooms
    : [];

  normalizedHotelRooms.forEach((roomItem) => {
    const normalizedRoomId = normalizeIntegerOrNull(roomItem?.roomId);
    if (Number.isFinite(normalizedRoomId)) {
      normalizedRoomsByRoomId.set(String(normalizedRoomId), roomItem);
    }
  });

  const mappedRoomOffers = (Array.isArray(normalizedMappedRoomRatesByHotelId)
    ? normalizedMappedRoomRatesByHotelId
    : []
  ).map((mappedRoomRatesItem) => {
    const normalizedMappedRoomId = normalizeIntegerOrNull(
      mappedRoomRatesItem?.mappedRoomId
    );
    const matchedRoom = Number.isFinite(normalizedMappedRoomId)
      ? normalizedRoomsByRoomId.get(String(normalizedMappedRoomId)) || null
      : null;

    return {
      mappedRoomId: Number.isFinite(normalizedMappedRoomId)
        ? normalizedMappedRoomId
        : null,
      room: matchedRoom,
      roomOffers: Array.isArray(mappedRoomRatesItem?.roomOffers)
        ? mappedRoomRatesItem.roomOffers
        : []
    };
  });

  const allRoomOffers = mappedRoomOffers.flatMap((mappedRoomOfferItem) =>
    Array.isArray(mappedRoomOfferItem?.roomOffers) ? mappedRoomOfferItem.roomOffers : []
  );

  const roomOfferCurrentPrices = allRoomOffers
    .map((roomOfferItem) => normalizeNumberOrNull(roomOfferItem?.roomOfferCurrentPrice))
    .filter((roomOfferCurrentPrice) => Number.isFinite(roomOfferCurrentPrice));

  let roomOffersMinCurrentPrice = null;
  let roomOffersMinCurrentPriceCurrency = null;

  if (roomOfferCurrentPrices.length > 0) {
    roomOffersMinCurrentPrice = Math.min(...roomOfferCurrentPrices);
    const roomOfferWithMinCurrentPrice = allRoomOffers.find(
      (roomOfferItem) =>
        normalizeNumberOrNull(roomOfferItem?.roomOfferCurrentPrice) ===
        roomOffersMinCurrentPrice
    );

    roomOffersMinCurrentPriceCurrency =
      normalizeText(roomOfferWithMinCurrentPrice?.roomOfferCurrentPriceCurrency) || null;
  }

  return {
    roomOffersMinCurrentPrice,
    roomOffersMinCurrentPriceCurrency,
    mappedRoomOffers
  };
}

function buildRoomOfferRefundableTagText(roomOfferRefundableTag) {
  const normalizedRoomOfferRefundableTag = normalizeText(
    roomOfferRefundableTag
  ).toUpperCase();

  if (normalizedRoomOfferRefundableTag === "RFN") {
    return "Refundable";
  }

  if (normalizedRoomOfferRefundableTag === "NRFN") {
    return "Non-refundable";
  }

  return normalizedRoomOfferRefundableTag;
}

function buildRoomOfferCurrentPriceNoteText({
  occupancyNumber,
  checkin,
  checkout,
  taxesAndFees
}) {
  const normalizedOccupancyNumber = normalizePositiveInteger(occupancyNumber, 1);
  const normalizedNightCount = getNightCount(checkin, checkout);
  const roomText =
    normalizedOccupancyNumber === 1
      ? "1 room"
      : `${normalizedOccupancyNumber} rooms`;
  const nightText =
    normalizedNightCount === 1 ? "1 night" : `${normalizedNightCount} nights`;
  const hasExcludedTaxesAndFees = Array.isArray(taxesAndFees)
    ? taxesAndFees.some((taxesAndFeesItem) => taxesAndFeesItem?.included === false)
    : false;
  const taxesAndFeesText = hasExcludedTaxesAndFees
    ? "excl taxes & fees"
    : "inc taxes & fees";

  return `${roomText} ${nightText} ${taxesAndFeesText}`;
}

function buildRoomSizeText(roomSizeSquare, roomSizeUnit) {
  const normalizedRoomSizeSquare = normalizeNumberOrNull(roomSizeSquare);
  const normalizedRoomSizeUnit = normalizeText(roomSizeUnit);

  if (!Number.isFinite(normalizedRoomSizeSquare) || normalizedRoomSizeSquare <= 0) {
    return "";
  }

  return normalizedRoomSizeUnit
    ? `${normalizedRoomSizeSquare} ${normalizedRoomSizeUnit}`
    : `${normalizedRoomSizeSquare}`;
}

function buildRoomBedTypesText(roomBedTypes) {
  if (!Array.isArray(roomBedTypes) || roomBedTypes.length === 0) {
    return "";
  }

  return roomBedTypes
    .map((roomBedTypeItem) => {
      const quantity = normalizePositiveInteger(roomBedTypeItem?.quantity, 1);
      const bedType = normalizeText(roomBedTypeItem?.bedType);
      const bedSize = normalizeText(roomBedTypeItem?.bedSize);

      if (!bedType) {
        return "";
      }

      const pluralizedBedType =
        quantity > 1 && !bedType.toLowerCase().endsWith("s")
          ? `${bedType}s`
          : bedType;

      if (bedSize) {
        return `${quantity} ${pluralizedBedType} · ${bedSize}`;
      }

      return quantity > 1 ? `${quantity} ${pluralizedBedType}` : bedType;
    })
    .filter(Boolean)
    .join(" + ");
}

function buildHotelMapUrl(latitude, longitude) {
  const normalizedLatitude = normalizeNumberOrNull(latitude);
  const normalizedLongitude = normalizeNumberOrNull(longitude);

  if (!Number.isFinite(normalizedLatitude) || !Number.isFinite(normalizedLongitude)) {
    return "";
  }

  return `https://maps.google.com/?q=${normalizedLatitude},${normalizedLongitude}`;
}

function stripHtml(value) {
  return normalizeText(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function getNightCount(checkin, checkout) {
  const checkinDate = new Date(checkin);
  const checkoutDate = new Date(checkout);

  if (
    Number.isNaN(checkinDate.getTime()) ||
    Number.isNaN(checkoutDate.getTime())
  ) {
    return 1;
  }

  const nightCount = Math.round(
    (checkoutDate.getTime() - checkinDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  return nightCount > 0 ? nightCount : 1;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeIntegerOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function normalizePositiveInteger(value, fallbackValue) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }

  return Math.trunc(parsed);
}