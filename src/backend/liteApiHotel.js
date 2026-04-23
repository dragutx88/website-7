import { buildLiteApiError, liteApiRequest, parseJson } from "./liteApiClient";

const LITE_API_BASE_URL = "https://api.liteapi.travel/v3.0";
const DEFAULT_CURRENCY = "USD";
const DEFAULT_GUEST_NATIONALITY = "US";
const DEFAULT_LANGUAGE = "en";
const HOTEL_DETAILS_TIMEOUT_SECONDS = 4;
const DEFAULT_MARGIN = 0;

export async function getHotelDetailsHandler(payloadOrHotelId) {
  const normalizedHotelId =
    typeof payloadOrHotelId === "string"
      ? normalizeText(payloadOrHotelId)
      : normalizeText(payloadOrHotelId?.hotelId);

  const normalizedLanguage =
    typeof payloadOrHotelId === "string"
      ? DEFAULT_LANGUAGE
      : normalizeText(payloadOrHotelId?.language).toLowerCase() || DEFAULT_LANGUAGE;

  if (!normalizedHotelId) {
    throw new Error("hotelId is required.");
  }

  const getHotelDetailsQuery = new URLSearchParams();
  getHotelDetailsQuery.set("hotelId", normalizedHotelId);
  getHotelDetailsQuery.set("timeout", String(HOTEL_DETAILS_TIMEOUT_SECONDS));
  getHotelDetailsQuery.set("language", normalizedLanguage);

  const getHotelDetailsResponse = await parseJson(
    await liteApiRequest(
      `${LITE_API_BASE_URL}/data/hotel?${getHotelDetailsQuery.toString()}`,
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

  const getHotelDetails = getHotelDetailsResponse?.data;

  return {
    hotelId: normalizedHotelId,
    getHotelDetailsResponse,
    normalizedHotelDetails: normalizeHotelDetails(getHotelDetails)
  };
}

export async function getHotelMappedRoomRatesHandler(payload) {
  const getHotelMappedRoomRatesRequest = buildHotelMappedRoomRatesRequest(payload);

  const getHotelMappedRoomRatesResponse = await parseJson(
    await liteApiRequest(`${LITE_API_BASE_URL}/hotels/rates`, {
      method: "POST",
      body: getHotelMappedRoomRatesRequest
    })
  );

  if (!getHotelMappedRoomRatesResponse || typeof getHotelMappedRoomRatesResponse !== "object") {
    throw new Error("Hotel rates response is invalid.");
  }

  if (getHotelMappedRoomRatesResponse.error) {
    throw buildLiteApiError(
      getHotelMappedRoomRatesResponse,
      "Hotel room rates request failed."
    );
  }

  const getHotelMappedRoomRates = Array.isArray(getHotelMappedRoomRatesResponse?.data)
    ? getHotelMappedRoomRatesResponse.data
    : [];

  return {
    hotelId: getHotelMappedRoomRatesRequest.hotelIds[0],
    getHotelMappedRoomRatesResponse,
    normalizedHotelMappedRoomRates: normalizeHotelMappedRoomRates({
      getHotelMappedRoomRates,
      checkin: getHotelMappedRoomRatesRequest.checkin,
      checkout: getHotelMappedRoomRatesRequest.checkout
    })
  };
}

export async function getHotelMappedRoomOffersHandler(payload) {
  const normalizedHotelId = normalizeText(payload?.hotelId);
  const normalizedLanguage = normalizeText(payload?.language).toLowerCase() || DEFAULT_LANGUAGE;

  if (!normalizedHotelId) {
    throw new Error("hotelId is required.");
  }

  const getHotelDetailsResult = await getHotelDetailsHandler({
    hotelId: normalizedHotelId,
    language: normalizedLanguage
  });

  const getHotelMappedRoomRatesResult = await getHotelMappedRoomRatesHandler({
    ...payload,
    hotelId: normalizedHotelId,
    language: normalizedLanguage
  });

  return {
    hotelId: normalizedHotelId,
    getHotelDetailsResponse: getHotelDetailsResult.getHotelDetailsResponse,
    getHotelMappedRoomRatesResponse:
      getHotelMappedRoomRatesResult.getHotelMappedRoomRatesResponse,
    normalizedHotelDetails: getHotelDetailsResult.normalizedHotelDetails,
    normalizedHotelMappedRoomOffers: normalizeHotelMappedRoomOffers({
      normalizedHotelDetails: getHotelDetailsResult.normalizedHotelDetails,
      normalizedHotelMappedRoomRates:
        getHotelMappedRoomRatesResult.normalizedHotelMappedRoomRates
    })
  };
}

function buildHotelMappedRoomRatesRequest(payload) {
  const normalizedHotelId = normalizeText(payload?.hotelId);
  const normalizedCheckin = normalizeText(payload?.checkin || payload?.checkIn);
  const normalizedCheckout = normalizeText(payload?.checkout || payload?.checkOut);
  const normalizedCurrency =
    normalizeText(payload?.currency).toUpperCase() || DEFAULT_CURRENCY;
  const normalizedGuestNationality =
    normalizeText(payload?.guestNationality).toUpperCase() || DEFAULT_GUEST_NATIONALITY;
  const normalizedLanguage =
    normalizeText(payload?.language).toLowerCase() || DEFAULT_LANGUAGE;
  const occupancies = buildHotelMappedRoomRatesOccupancies(payload);

  if (!normalizedHotelId) {
    throw new Error("hotelId is required.");
  }

  if (!normalizedCheckin || !normalizedCheckout) {
    throw new Error("checkin and checkout are required.");
  }

  if (!occupancies.length) {
    throw new Error("occupancies is required.");
  }

  return {
    hotelIds: [normalizedHotelId],
    occupancies,
    currency: normalizedCurrency,
    guestNationality: normalizedGuestNationality,
    language: normalizedLanguage,
    checkin: normalizedCheckin,
    checkout: normalizedCheckout,
    roomMapping: true,
    margin: DEFAULT_MARGIN
  };
}

function buildHotelMappedRoomRatesOccupancies(payload) {
  let occupanciesSource = [];

  if (Array.isArray(payload?.occupancies)) {
    occupanciesSource = payload.occupancies;
  } else if (typeof payload?.occupancies === "string" && payload.occupancies.trim()) {
    const parsedOccupancies = tryParseOccupanciesString(payload.occupancies);

    if (Array.isArray(parsedOccupancies)) {
      occupanciesSource = parsedOccupancies;
    }
  }

  if (!occupanciesSource.length && payload?.occupancy && typeof payload.occupancy === "object") {
    occupanciesSource = [
      {
        adults: payload.occupancy?.adults,
        children: Array.isArray(payload.occupancy?.childAges)
          ? payload.occupancy.childAges
          : []
      }
    ];
  }

  return occupanciesSource
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

function tryParseOccupanciesString(value) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(normalizedValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch (jsonParseError) {}

  try {
    const decodedValue =
      typeof Buffer !== "undefined"
        ? Buffer.from(normalizedValue, "base64").toString("utf8")
        : typeof atob === "function"
          ? atob(normalizedValue)
          : "";

    const parsed = JSON.parse(decodedValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch (base64ParseError) {
    return [];
  }
}

function normalizeHotelDetails(getHotelDetails) {
  if (!getHotelDetails || typeof getHotelDetails !== "object") {
    return null;
  }

  const hotelLocationLatitude = normalizeNumberOrNull(getHotelDetails?.location?.latitude);
  const hotelLocationLongitude = normalizeNumberOrNull(getHotelDetails?.location?.longitude);

  const hotelMapUrl =
    Number.isFinite(hotelLocationLatitude) && Number.isFinite(hotelLocationLongitude)
      ? `https://maps.google.com/?q=${hotelLocationLatitude},${hotelLocationLongitude}`
      : "";

  const hotelFacilitiesFromStructuredFacilities = Array.isArray(getHotelDetails?.facilities)
    ? getHotelDetails.facilities
        .map((facilityItem) => normalizeText(facilityItem?.name))
        .filter(Boolean)
    : [];

  const hotelFacilitiesFromLegacyHotelFacilities = Array.isArray(
    getHotelDetails?.hotelFacilities
  )
    ? getHotelDetails.hotelFacilities
        .map((facilityItem) => normalizeText(facilityItem))
        .filter(Boolean)
    : [];

  const hotelFacilities = Array.from(
    new Set(
      (
        hotelFacilitiesFromStructuredFacilities.length
          ? hotelFacilitiesFromStructuredFacilities
          : hotelFacilitiesFromLegacyHotelFacilities
      ).filter(Boolean)
    )
  );

  const hotelPolicies = Array.isArray(getHotelDetails?.policies)
    ? getHotelDetails.policies
        .map((policyItem) => ({
          name: normalizeText(policyItem?.name),
          description: stripHtml(policyItem?.description)
        }))
        .filter((policyItem) => policyItem.name || policyItem.description)
    : [];

  const hotelCheckinCheckoutTimes =
    getHotelDetails?.checkinCheckoutTimes &&
    typeof getHotelDetails.checkinCheckoutTimes === "object"
      ? {
          checkin_start: normalizeText(getHotelDetails.checkinCheckoutTimes?.checkin_start),
          checkin_end: normalizeText(getHotelDetails.checkinCheckoutTimes?.checkin_end),
          checkout: normalizeText(getHotelDetails.checkinCheckoutTimes?.checkout),
          instructions: Array.isArray(getHotelDetails.checkinCheckoutTimes?.instructions)
            ? getHotelDetails.checkinCheckoutTimes.instructions
            : [],
          special_instructions: normalizeText(
            getHotelDetails.checkinCheckoutTimes?.special_instructions
          )
        }
      : {
          checkin_start: "",
          checkin_end: "",
          checkout: "",
          instructions: [],
          special_instructions: ""
        };

  const roomList = Array.isArray(getHotelDetails?.rooms) ? getHotelDetails.rooms : [];
  const rooms = [];

  for (const roomItem of roomList) {
    if (!roomItem || typeof roomItem !== "object") {
      continue;
    }

    const roomPhotoList = Array.isArray(roomItem?.photos) ? roomItem.photos : [];
    const roomImages = roomPhotoList
      .map((roomPhotoItem) => normalizeText(roomPhotoItem?.url))
      .filter(Boolean);

    const roomMainPhoto =
      roomPhotoList.find((roomPhotoItem) => roomPhotoItem?.mainPhoto === true) || null;

    const roomMainImage =
      normalizeText(roomMainPhoto?.url) ||
      normalizeText(roomImages[0]) ||
      normalizeText(getHotelDetails?.main_photo) ||
      normalizeText(getHotelDetails?.thumbnail);

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

    rooms.push({
      roomId: normalizeIntegerOrNull(roomItem?.id),
      roomName: normalizeText(roomItem?.roomName || roomItem?.name),
      roomDescription: stripHtml(roomItem?.description),
      roomMainImage,
      roomImages,
      roomAmenities: Array.isArray(roomItem?.roomAmenities) ? roomItem.roomAmenities : [],
      roomSizeText,
      roomBedTypesText,
      roomSleepsText
    });
  }

  return {
    hotelId: normalizeText(getHotelDetails?.id) || normalizeText(getHotelDetails?.hotelId) || null,
    hotelName: normalizeText(getHotelDetails?.name) || "Hotel",
    hotelAddress: normalizeText(getHotelDetails?.address),
    hotelStarRating: normalizeNumberOrNull(getHotelDetails?.starRating),
    hotelRating: normalizeNumberOrNull(getHotelDetails?.rating),
    hotelReviewCount: normalizeIntegerOrNull(getHotelDetails?.reviewCount),
    hotelMainImage:
      normalizeText(getHotelDetails?.main_photo) ||
      normalizeText(getHotelDetails?.thumbnail) ||
      normalizeText(getHotelDetails?.hotelImages?.[0]?.url),
    hotelImages: Array.isArray(getHotelDetails?.hotelImages)
      ? getHotelDetails.hotelImages
      : [],
    hotelDescription: stripHtml(getHotelDetails?.hotelDescription),
    hotelImportantInformation: stripHtml(getHotelDetails?.hotelImportantInformation),
    hotelCheckinCheckoutTimes,
    hotelFacilities,
    hotelPolicies,
    hotelMapUrl,
    rooms
  };
}

function normalizeHotelMappedRoomRates({
  getHotelMappedRoomRates,
  checkin,
  checkout
}) {
  const checkinDate = new Date(checkin);
  const checkoutDate = new Date(checkout);
  const roomOfferNightCount =
    !Number.isNaN(checkinDate.getTime()) && !Number.isNaN(checkoutDate.getTime())
      ? Math.max(
          1,
          Math.round(
            (checkoutDate.getTime() - checkinDate.getTime()) / (1000 * 60 * 60 * 24)
          )
        )
      : 1;

  const normalizedHotelMappedRoomRatesMap = new Map();

  getHotelMappedRoomRates.forEach((hotelMappedRoomRatesItem, hotelIndex) => {
    const roomTypeList = Array.isArray(hotelMappedRoomRatesItem?.roomTypes)
      ? hotelMappedRoomRatesItem.roomTypes
      : [];

    roomTypeList.forEach((roomTypeItem, roomTypeIndex) => {
      const offerId = normalizeText(roomTypeItem?.offerId);
      const rateList = Array.isArray(roomTypeItem?.rates) ? roomTypeItem.rates : [];

      rateList.forEach((rateItem, rateIndex) => {
        const roomOfferMappedRoomId = normalizeIntegerOrNull(rateItem?.mappedRoomId);
        const roomOfferCurrentPrice = normalizeNumberOrNull(
          rateItem?.retailRate?.total?.[0]?.amount
        );
        const roomOfferCurrency = normalizeText(rateItem?.retailRate?.total?.[0]?.currency);

        if (!Number.isFinite(roomOfferCurrentPrice) || !roomOfferCurrency) {
          return;
        }

        const hotelMappedRoomRatesKey = Number.isFinite(roomOfferMappedRoomId)
          ? String(roomOfferMappedRoomId)
          : `unmapped-${hotelIndex + 1}-${roomTypeIndex + 1}-${rateIndex + 1}`;

        if (!normalizedHotelMappedRoomRatesMap.has(hotelMappedRoomRatesKey)) {
          normalizedHotelMappedRoomRatesMap.set(hotelMappedRoomRatesKey, {
            mappedRoomId: Number.isFinite(roomOfferMappedRoomId)
              ? roomOfferMappedRoomId
              : null,
            roomOffers: []
          });
        }

        const roomOfferBeforeCurrentPrice = normalizeNumberOrNull(
          rateItem?.retailRate?.suggestedSellingPrice?.[0]?.amount
        );

        const roomOfferRefundableTag = normalizeText(
          rateItem?.cancellationPolicies?.refundableTag
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
          rateItem?.occupancyNumber,
          1
        );

        const roomOfferHasExcludedTaxesAndFees = Array.isArray(
          rateItem?.retailRate?.taxesAndFees
        )
          ? rateItem.retailRate.taxesAndFees.some(
              (taxesAndFeesItem) => taxesAndFeesItem?.included === false
            )
          : false;

        const roomOfferTaxesAndFeesText = roomOfferHasExcludedTaxesAndFees
          ? "excl."
          : "incl.";

        const roomOfferCurrentPriceNoteText = `${roomOfferNightCount} night, ${roomOfferOccupancyNumber} room, ${roomOfferTaxesAndFeesText} taxes & fees`;

        normalizedHotelMappedRoomRatesMap.get(hotelMappedRoomRatesKey).roomOffers.push({
          roomOfferId: normalizeText(rateItem?.rateId) || null,
          roomOfferName: normalizeText(rateItem?.name) || "Room rate",
          roomOfferMappedRoomId: Number.isFinite(roomOfferMappedRoomId)
            ? roomOfferMappedRoomId
            : null,
          roomOfferBoardName: normalizeText(rateItem?.boardName),
          roomOfferOccupancyNumber,
          roomOfferAdultCount: normalizeIntegerOrNull(rateItem?.adultCount),
          roomOfferChildCount: normalizeIntegerOrNull(rateItem?.childCount),
          roomOfferChildrenAges: Array.isArray(rateItem?.childrenAges)
            ? rateItem.childrenAges
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

  return Array.from(normalizedHotelMappedRoomRatesMap.values())
    .map((hotelMappedRoomRatesItem) => ({
      mappedRoomId: hotelMappedRoomRatesItem.mappedRoomId,
      roomOffers: hotelMappedRoomRatesItem.roomOffers
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
    .sort((leftHotelMappedRoomRatesItem, rightHotelMappedRoomRatesItem) => {
      const leftRoomOfferCurrentPrice = normalizeNumberOrNull(
        leftHotelMappedRoomRatesItem?.roomOffers?.[0]?.roomOfferCurrentPrice
      );
      const rightRoomOfferCurrentPrice = normalizeNumberOrNull(
        rightHotelMappedRoomRatesItem?.roomOffers?.[0]?.roomOfferCurrentPrice
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

function normalizeHotelMappedRoomOffers({
  normalizedHotelDetails,
  normalizedHotelMappedRoomRates
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

  const mappedRoomOffers = (Array.isArray(normalizedHotelMappedRoomRates)
    ? normalizedHotelMappedRoomRates
    : []
  ).map((hotelMappedRoomRatesItem) => {
    const mappedRoomId = normalizeIntegerOrNull(hotelMappedRoomRatesItem?.mappedRoomId);

    const room =
      Number.isFinite(mappedRoomId) && normalizedRoomsByRoomId.has(String(mappedRoomId))
        ? normalizedRoomsByRoomId.get(String(mappedRoomId)) || null
        : null;

    return {
      mappedRoomId: Number.isFinite(mappedRoomId) ? mappedRoomId : null,
      room,
      roomOffers: Array.isArray(hotelMappedRoomRatesItem?.roomOffers)
        ? hotelMappedRoomRatesItem.roomOffers
        : []
    };
  });

  const allRoomOffers = mappedRoomOffers.flatMap((mappedRoomOfferItem) =>
    Array.isArray(mappedRoomOfferItem?.roomOffers) ? mappedRoomOfferItem.roomOffers : []
  );

  const roomOfferCurrency = normalizeText(allRoomOffers?.[0]?.roomOfferCurrency) || null;

  const roomOffersMinCurrentPriceCandidates = allRoomOffers
    .map((roomOfferItem) => normalizeNumberOrNull(roomOfferItem?.roomOfferCurrentPrice))
    .filter((roomOfferCurrentPrice) => Number.isFinite(roomOfferCurrentPrice));

  const roomOffersMinCurrentPrice = roomOffersMinCurrentPriceCandidates.length
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