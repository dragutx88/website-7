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

  return {
    hotelId: normalizedHotelId,
    raw: getHotelDetailsResponse,
    normalizedHotelDetails: normalizeHotelDetails(getHotelDetailsResponse?.data || null)
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

  return {
    hotelId: getMappedRoomRatesByHotelIdRequestBody.hotelIds[0],
    raw: getMappedRoomRatesByHotelIdResponse,
    normalizedMappedRoomRatesByHotelId: normalizeMappedRoomRatesByHotelId({
      getMappedRoomRatesByHotelIdResponse,
      checkin: getMappedRoomRatesByHotelIdRequestBody.checkin,
      checkout: getMappedRoomRatesByHotelIdRequestBody.checkout
    })
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

  return {
    hotelId: normalizedHotelId,
    raw: {
      getHotelDetailsResponse: getHotelDetailsResult?.raw || null,
      getMappedRoomRatesByHotelIdResponse:
        getMappedRoomRatesByHotelIdResult?.raw || null
    },
    normalizedHotelDetails: getHotelDetailsResult?.normalizedHotelDetails || null,
    normalizedMergedMappedRoomOffers: normalizeMergedMappedRoomOffers({
      normalizedHotelDetails: getHotelDetailsResult?.normalizedHotelDetails || null,
      normalizedMappedRoomRatesByHotelId:
        getMappedRoomRatesByHotelIdResult?.normalizedMappedRoomRatesByHotelId || []
    })
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

  if (!normalizedHotelId) {
    throw new Error("hotelId is required.");
  }

  if (!normalizedCheckin || !normalizedCheckout) {
    throw new Error("checkin and checkout are required.");
  }

  return {
    hotelIds: [normalizedHotelId],
    occupancies: buildMappedRoomRatesByHotelIdOccupancies(payload),
    currency: normalizedCurrency,
    guestNationality: normalizedGuestNationality,
    checkin: normalizedCheckin,
    checkout: normalizedCheckout,
    roomMapping: true,
    includeHotelData: false
  };
}

function buildMappedRoomRatesByHotelIdOccupancies(payload) {
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
      adults: normalizePositiveInteger(payload?.occupancy?.adults, 2),
      children: Array.isArray(payload?.occupancy?.childAges)
        ? payload.occupancy.childAges
            .map((childAge) => normalizeIntegerOrNull(childAge))
            .filter((childAge) => Number.isFinite(childAge))
        : []
    }
  ];
}

function normalizeHotelDetails(getHotelDetailsResponseData) {
  if (!getHotelDetailsResponseData || typeof getHotelDetailsResponseData !== "object") {
    return null;
  }

  const hotelLocationLatitude = normalizeNumberOrNull(
    getHotelDetailsResponseData?.location?.latitude
  );
  const hotelLocationLongitude = normalizeNumberOrNull(
    getHotelDetailsResponseData?.location?.longitude
  );

  const hotelMapUrl =
    Number.isFinite(hotelLocationLatitude) && Number.isFinite(hotelLocationLongitude)
      ? `https://maps.google.com/?q=${hotelLocationLatitude},${hotelLocationLongitude}`
      : "";

  const hotelFacilitiesFromStructuredFacilities = Array.isArray(
    getHotelDetailsResponseData?.facilities
  )
    ? getHotelDetailsResponseData.facilities
        .map((facilityItem) => normalizeText(facilityItem?.name))
        .filter(Boolean)
    : [];

  const hotelFacilitiesFromLegacyHotelFacilities = Array.isArray(
    getHotelDetailsResponseData?.hotelFacilities
  )
    ? getHotelDetailsResponseData.hotelFacilities
        .map((facilityItem) => normalizeText(facilityItem))
        .filter(Boolean)
    : [];

  const hotelFacilities =
    hotelFacilitiesFromStructuredFacilities.length > 0
      ? dedupeStringArray(hotelFacilitiesFromStructuredFacilities)
      : dedupeStringArray(hotelFacilitiesFromLegacyHotelFacilities);

  const hotelPolicies = Array.isArray(getHotelDetailsResponseData?.policies)
    ? getHotelDetailsResponseData.policies
        .map((policyItem) => ({
          name: normalizeText(policyItem?.name),
          description: stripHtml(policyItem?.description)
        }))
        .filter((policyItem) => policyItem.name || policyItem.description)
    : [];

  const rooms = Array.isArray(getHotelDetailsResponseData?.rooms)
    ? getHotelDetailsResponseData.rooms
        .map((roomItem) =>
          normalizeHotelDetailsRoom(roomItem, getHotelDetailsResponseData)
        )
        .filter(Boolean)
    : [];

  return {
    hotelId:
      normalizeText(getHotelDetailsResponseData?.id) ||
      normalizeText(getHotelDetailsResponseData?.hotelId) ||
      null,
    hotelName: normalizeText(getHotelDetailsResponseData?.name) || "Hotel",
    hotelAddress: normalizeText(getHotelDetailsResponseData?.address),
    hotelStarRating: normalizeNumberOrNull(getHotelDetailsResponseData?.starRating),
    hotelRating: normalizeNumberOrNull(getHotelDetailsResponseData?.rating),
    hotelReviewCount: normalizeIntegerOrNull(getHotelDetailsResponseData?.reviewCount),
    hotelMainImage:
      normalizeText(getHotelDetailsResponseData?.main_photo) ||
      normalizeText(getHotelDetailsResponseData?.thumbnail) ||
      normalizeText(getHotelDetailsResponseData?.hotelImages?.[0]?.url),
    hotelImages: Array.isArray(getHotelDetailsResponseData?.hotelImages)
      ? getHotelDetailsResponseData.hotelImages
      : [],
    hotelDescription: stripHtml(getHotelDetailsResponseData?.hotelDescription),
    hotelImportantInformation: stripHtml(
      getHotelDetailsResponseData?.hotelImportantInformation
    ),
    hotelCheckinCheckoutTimes: normalizeHotelCheckinCheckoutTimes(
      getHotelDetailsResponseData?.checkinCheckoutTimes
    ),
    hotelFacilities,
    hotelPolicies,
    hotelMapUrl,
    rooms
  };
}

function normalizeHotelCheckinCheckoutTimes(hotelCheckinCheckoutTimes) {
  if (!hotelCheckinCheckoutTimes || typeof hotelCheckinCheckoutTimes !== "object") {
    return {
      checkin_start: "",
      checkin_end: "",
      checkout: "",
      instructions: [],
      special_instructions: ""
    };
  }

  return {
    checkin_start: normalizeText(hotelCheckinCheckoutTimes?.checkin_start),
    checkin_end: normalizeText(hotelCheckinCheckoutTimes?.checkin_end),
    checkout: normalizeText(hotelCheckinCheckoutTimes?.checkout),
    instructions: Array.isArray(hotelCheckinCheckoutTimes?.instructions)
      ? hotelCheckinCheckoutTimes.instructions
      : [],
    special_instructions: normalizeText(
      hotelCheckinCheckoutTimes?.special_instructions
    )
  };
}

function normalizeHotelDetailsRoom(roomItem, getHotelDetailsResponseData) {
  if (!roomItem || typeof roomItem !== "object") {
    return null;
  }

  const roomImages = Array.isArray(roomItem?.photos)
    ? roomItem.photos
        .map(
          (roomPhotoItem) =>
            normalizeText(roomPhotoItem?.url) ||
            normalizeText(roomPhotoItem?.hd_url) ||
            normalizeText(roomPhotoItem?.failoverPhoto)
        )
        .filter(Boolean)
    : [];

  const roomDefaultPhoto = Array.isArray(roomItem?.photos)
    ? roomItem.photos.find((roomPhotoItem) => roomPhotoItem?.mainPhoto === true) || null
    : null;

  const roomMainImage =
    normalizeText(roomDefaultPhoto?.url) ||
    normalizeText(roomDefaultPhoto?.hd_url) ||
    normalizeText(roomDefaultPhoto?.failoverPhoto) ||
    normalizeText(roomImages[0]) ||
    normalizeText(getHotelDetailsResponseData?.main_photo) ||
    normalizeText(getHotelDetailsResponseData?.thumbnail) ||
    "";

  const roomSizeSquare = normalizeNumberOrNull(roomItem?.roomSizeSquare);
  const roomSizeUnit = normalizeText(roomItem?.roomSizeUnit);

  const roomSizeText =
    Number.isFinite(roomSizeSquare) && roomSizeSquare > 0
      ? roomSizeUnit
        ? `${roomSizeSquare} ${roomSizeUnit}`
        : `${roomSizeSquare}`
      : "";

  const roomMaxOccupancy = normalizeIntegerOrNull(roomItem?.maxOccupancy);

  const roomSleepsText =
    Number.isFinite(roomMaxOccupancy) && roomMaxOccupancy > 0
      ? `Sleeps ${roomMaxOccupancy}`
      : "";

  const roomBedTypesText = Array.isArray(roomItem?.bedTypes)
    ? roomItem.bedTypes
        .map((roomBedTypeItem) => {
          const roomBedTypeQuantity = normalizePositiveInteger(
            roomBedTypeItem?.quantity,
            1
          );
          const roomBedTypeName = normalizeText(roomBedTypeItem?.bedType);

          if (!roomBedTypeName) {
            return "";
          }

          return `${roomBedTypeQuantity} ${roomBedTypeName}`;
        })
        .filter(Boolean)
        .join(" and ")
    : "";

  return {
    roomId: normalizeIntegerOrNull(roomItem?.id),
    roomName: normalizeText(roomItem?.roomName || roomItem?.name),
    roomDescription: stripHtml(roomItem?.description),
    roomMainImage,
    roomImages,
    roomAmenities: Array.isArray(roomItem?.roomAmenities) ? roomItem.roomAmenities : [],
    roomSizeText,
    roomBedTypesText,
    roomSleepsText
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
      const offerId = normalizeText(roomType?.offerId);
      const rates = Array.isArray(roomType?.rates) ? roomType.rates : [];

      rates.forEach((rate, rateIndex) => {
        const roomOfferMappedRoomId = normalizeIntegerOrNull(rate?.mappedRoomId);

        const mappedRoomRatesKey = Number.isFinite(roomOfferMappedRoomId)
          ? String(roomOfferMappedRoomId)
          : `unmapped-${roomTypeIndex + 1}-${rateIndex + 1}`;

        if (!normalizedMappedRoomRatesByHotelIdMap.has(mappedRoomRatesKey)) {
          normalizedMappedRoomRatesByHotelIdMap.set(mappedRoomRatesKey, {
            mappedRoomId: Number.isFinite(roomOfferMappedRoomId)
              ? roomOfferMappedRoomId
              : null,
            roomOffers: []
          });
        }

        const roomOfferCurrentPrice = normalizeNumberOrNull(
          rate?.retailRate?.total?.[0]?.amount
        );
        const roomOfferCurrency = normalizeText(rate?.retailRate?.total?.[0]?.currency);

        if (!Number.isFinite(roomOfferCurrentPrice) || !roomOfferCurrency) {
          return;
        }

        const roomOfferBeforeCurrentPrice = normalizeNumberOrNull(
          rate?.retailRate?.suggestedSellingPrice?.[0]?.amount
        );

        const roomOfferRefundableTag = normalizeText(
          rate?.cancellationPolicies?.refundableTag
        ).toUpperCase();

        let roomOfferRefundableTagText = "";

        if (roomOfferRefundableTag === "RFN") {
          roomOfferRefundableTagText = "Refundable";
        } else if (roomOfferRefundableTag === "NRFN") {
          roomOfferRefundableTagText = "Non-Refundable";
        } else if (roomOfferRefundableTag) {
          roomOfferRefundableTagText = roomOfferRefundableTag;
        }

        const roomOfferOccupancyNumber = normalizePositiveInteger(
          rate?.occupancyNumber,
          1
        );

        const roomOfferNightCount = getNightCount(checkin, checkout);

        const roomOfferHasExcludedTaxesAndFees = Array.isArray(
          rate?.retailRate?.taxesAndFees
        )
          ? rate.retailRate.taxesAndFees.some(
              (taxesAndFeesItem) => taxesAndFeesItem?.included === false
            )
          : false;

        const roomOfferTaxesAndFeesText = roomOfferHasExcludedTaxesAndFees
          ? "excl."
          : "incl.";

        const roomOfferCurrentPriceNoteText = `${roomOfferNightCount} night, ${roomOfferOccupancyNumber} room, ${roomOfferTaxesAndFeesText} taxes & fees`;

        normalizedMappedRoomRatesByHotelIdMap.get(mappedRoomRatesKey).roomOffers.push({
          roomOfferId: normalizeText(rate?.rateId) || null,
          roomOfferName: normalizeText(rate?.name) || "Room rate",
          roomOfferMappedRoomId: Number.isFinite(roomOfferMappedRoomId)
            ? roomOfferMappedRoomId
            : null,
          roomOfferBoardName: normalizeText(rate?.boardName),
          roomOfferOccupancyNumber,
          roomOfferAdultCount: normalizeIntegerOrNull(rate?.adultCount),
          roomOfferChildCount: normalizeIntegerOrNull(rate?.childCount),
          roomOfferChildrenAges: Array.isArray(rate?.childrenAges)
            ? rate.childrenAges
                .map((childAge) => normalizeIntegerOrNull(childAge))
                .filter((childAge) => Number.isFinite(childAge))
            : [],
          roomOfferCurrentPrice,
          roomOfferBeforeCurrentPrice: Number.isFinite(roomOfferBeforeCurrentPrice)
            ? roomOfferBeforeCurrentPrice
            : null,
          roomOfferCurrency,
          roomOfferRefundableTag: roomOfferRefundableTag || null,
          roomOfferRefundableTagText,
          roomOfferCurrentPriceNoteText,
          offerId
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
          const leftRoomOfferCurrentPrice = normalizeNumberOrNull(
            leftRoomOfferItem?.roomOfferCurrentPrice
          );
          const rightRoomOfferCurrentPrice = normalizeNumberOrNull(
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
      const leftRoomOfferCurrentPrice = normalizeNumberOrNull(
        leftMappedRoomRatesItem?.roomOffers?.[0]?.roomOfferCurrentPrice
      );
      const rightRoomOfferCurrentPrice = normalizeNumberOrNull(
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
    const roomId = normalizeIntegerOrNull(roomItem?.roomId);

    if (Number.isFinite(roomId)) {
      normalizedRoomsByRoomId.set(String(roomId), roomItem);
    }
  });

  const mappedRoomOffers = (Array.isArray(normalizedMappedRoomRatesByHotelId)
    ? normalizedMappedRoomRatesByHotelId
    : []
  ).map((mappedRoomRatesItem) => {
    const mappedRoomId = normalizeIntegerOrNull(mappedRoomRatesItem?.mappedRoomId);

    const room =
      Number.isFinite(mappedRoomId) &&
      normalizedRoomsByRoomId.has(String(mappedRoomId))
        ? normalizedRoomsByRoomId.get(String(mappedRoomId)) || null
        : null;

    return {
      mappedRoomId: Number.isFinite(mappedRoomId) ? mappedRoomId : null,
      room,
      roomOffers: Array.isArray(mappedRoomRatesItem?.roomOffers)
        ? mappedRoomRatesItem.roomOffers
        : []
    };
  });

  const allRoomOffers = mappedRoomOffers.flatMap((mappedRoomOfferItem) =>
    Array.isArray(mappedRoomOfferItem?.roomOffers) ? mappedRoomOfferItem.roomOffers : []
  );

  const roomOfferCurrency =
    normalizeText(allRoomOffers?.[0]?.roomOfferCurrency) || null;

  const roomOffersMinCurrentPriceCandidates = allRoomOffers
    .map((roomOfferItem) => normalizeNumberOrNull(roomOfferItem?.roomOfferCurrentPrice))
    .filter((roomOfferCurrentPrice) => Number.isFinite(roomOfferCurrentPrice));

  const roomOffersMinCurrentPrice =
    roomOffersMinCurrentPriceCandidates.length > 0
      ? Math.min(...roomOffersMinCurrentPriceCandidates)
      : null;

  return {
    roomOffersMinCurrentPrice,
    roomOfferCurrency,
    mappedRoomOffers
  };
}

function stripHtml(value) {
  return normalizeText(value)
    .replace(/<br[^>]*>/gi, "\n")
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

  if (Number.isNaN(checkinDate.getTime()) || Number.isNaN(checkoutDate.getTime())) {
    return 1;
  }

  const nightCount = Math.round(
    (checkoutDate.getTime() - checkinDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  return nightCount > 0 ? nightCount : 1;
}

function dedupeStringArray(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
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