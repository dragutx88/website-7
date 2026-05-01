import { buildLiteApiError, liteApiRequest, parseJson } from "./liteApiClient";

const LITE_API_BASE_URL = "https://api.liteapi.travel/v3.0";
const DEFAULT_CURRENCY = "TRY";
const DEFAULT_GUEST_NATIONALITY = "TR";
const DEFAULT_LANGUAGE = "tr";
const DEFAULT_MARGIN = 0;

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

export async function getHotelDetailsHandler(searchFlowContextQuery) {
  const getHotelDetailsRequest = buildHotelDetailsRequest(searchFlowContextQuery);

  const getHotelDetailsQuery = new URLSearchParams();
  getHotelDetailsQuery.set("hotelId", getHotelDetailsRequest.hotelId);
  getHotelDetailsQuery.set("language", getHotelDetailsRequest.language);

  const getHotelDetailsResponse = await liteApiRequest(
    `${LITE_API_BASE_URL}/data/hotel?${getHotelDetailsQuery.toString()}`,
    {
      method: "GET"
    }
  );

  const getHotelDetailsJson = await parseJson(getHotelDetailsResponse);

  if (!getHotelDetailsResponse.ok) {
    throw buildLiteApiError(
      getHotelDetailsJson,
      "Hotel details request failed."
    );
  }

  const normalizedHotelDetails = normalizeHotelDetails(getHotelDetailsJson?.data);

  console.log("LITEAPI_HOTEL getHotelDetails summary", {
    hotelId: getHotelDetailsRequest.hotelId,
    hasNormalizedHotelDetails: Boolean(normalizedHotelDetails),
    normalizedHotelRoomsCount: Array.isArray(normalizedHotelDetails?.rooms)
      ? normalizedHotelDetails.rooms.length
      : 0,
    normalizedHotelImageUrlsCount: Array.isArray(
      normalizedHotelDetails?.hotelImageUrls
    )
      ? normalizedHotelDetails.hotelImageUrls.length
      : 0
  });

  return {
    hotelId: getHotelDetailsRequest.hotelId,
    getHotelDetailsResponse: getHotelDetailsJson,
    normalizedHotelDetails
  };
}

export async function getHotelMappedRoomRatesHandler(searchFlowContextQuery) {
  const getHotelMappedRoomRatesRequest =
    buildHotelMappedRoomRatesRequest(searchFlowContextQuery);

  const getHotelMappedRoomRatesResponse = await liteApiRequest(
    `${LITE_API_BASE_URL}/hotels/rates`,
    {
      method: "POST",
      body: getHotelMappedRoomRatesRequest
    }
  );

  const getHotelMappedRoomRatesJson = await parseJson(
    getHotelMappedRoomRatesResponse
  );

  if (!getHotelMappedRoomRatesResponse.ok) {
    throw buildLiteApiError(
      getHotelMappedRoomRatesJson,
      "Hotel room rates request failed."
    );
  }

  if (!Array.isArray(getHotelMappedRoomRatesJson?.data)) {
    throw new Error("Hotel mapped room rates response data must be an array.");
  }

  return {
    hotelId: getHotelMappedRoomRatesRequest.hotelIds[0],
    getHotelMappedRoomRatesResponse: getHotelMappedRoomRatesJson,
    normalizedHotelMappedRoomRates: normalizeHotelMappedRoomRates({
      getHotelMappedRoomRates: getHotelMappedRoomRatesJson.data,
      checkin: getHotelMappedRoomRatesRequest.checkin,
      checkout: getHotelMappedRoomRatesRequest.checkout
    })
  };
}

export async function getHotelMappedRoomOffersHandler(searchFlowContextQuery) {
  const getHotelDetailsRequest = buildHotelDetailsRequest(searchFlowContextQuery);

  const getHotelDetailsResult =
    await getHotelDetailsHandler(searchFlowContextQuery);
  const getHotelMappedRoomRatesResult =
    await getHotelMappedRoomRatesHandler(searchFlowContextQuery);

  const normalizedHotelMappedRoomOffers = normalizeHotelMappedRoomOffers({
    normalizedHotelDetails: getHotelDetailsResult.normalizedHotelDetails,
    normalizedHotelMappedRoomRates:
      getHotelMappedRoomRatesResult.normalizedHotelMappedRoomRates
  });

  return {
    hotelId: getHotelDetailsRequest.hotelId,
    getHotelDetailsResponse: getHotelDetailsResult.getHotelDetailsResponse,
    getHotelMappedRoomRatesResponse:
      getHotelMappedRoomRatesResult.getHotelMappedRoomRatesResponse,
    normalizedHotelDetails: getHotelDetailsResult.normalizedHotelDetails,
    normalizedHotelMappedRoomOffers
  };
}

function buildHotelDetailsRequest(searchFlowContextQuery) {
  const hotelId = normalizeText(searchFlowContextQuery?.hotelId);
  const language =
    normalizeText(searchFlowContextQuery?.language).toLowerCase() ||
    DEFAULT_LANGUAGE;

  if (!hotelId) {
    throw new Error("hotelId is required.");
  }

  return {
    hotelId,
    language
  };
}

function buildHotelMappedRoomRatesRequest(searchFlowContextQuery) {
  const hotelId = normalizeText(searchFlowContextQuery?.hotelId);
  const checkin = validateDateText(searchFlowContextQuery?.checkin, "checkin");
  const checkout = validateDateText(
    searchFlowContextQuery?.checkout,
    "checkout"
  );
  const currency =
    normalizeText(searchFlowContextQuery?.currency).toUpperCase() ||
    DEFAULT_CURRENCY;
  const language =
    normalizeText(searchFlowContextQuery?.language).toLowerCase() ||
    DEFAULT_LANGUAGE;
  const guestNationality = DEFAULT_GUEST_NATIONALITY;

  if (!hotelId) {
    throw new Error("hotelId is required.");
  }

  if (getDateUtcTime(checkout) <= getDateUtcTime(checkin)) {
    throw new Error("checkout must be after checkin.");
  }

  const occupancies = deriveOccupanciesFromSearchFlowContextQuery(
    searchFlowContextQuery
  );

  return {
    hotelIds: [hotelId],
    occupancies,
    currency,
    guestNationality,
    language,
    checkin,
    checkout,
    roomMapping: true,
    includeHotelData: true,
    margin: DEFAULT_MARGIN
  };
}

function deriveOccupanciesFromSearchFlowContextQuery(searchFlowContextQuery) {
  const rooms = normalizePositiveIntegerOrNull(searchFlowContextQuery?.rooms);

  if (!Number.isFinite(rooms)) {
    throw new Error("rooms is required and must be a positive integer.");
  }

  const adultsText = normalizeText(searchFlowContextQuery?.adults);

  if (!adultsText) {
    throw new Error("adults is required.");
  }

  const adultsList = adultsText
    .split(",")
    .map((adultsItem) => normalizePositiveIntegerOrNull(adultsItem));

  if (adultsList.length !== rooms) {
    throw new Error("adults count must match rooms count.");
  }

  if (adultsList.some((adultsItem) => !Number.isFinite(adultsItem))) {
    throw new Error("adults must contain positive integers only.");
  }

  const childrenByRoom = new Map();
  const childrenText = normalizeText(searchFlowContextQuery?.children);

  if (childrenText) {
    const childrenTokens = childrenText.split(",");

    for (const childrenToken of childrenTokens) {
      const childrenTokenParts = normalizeText(childrenToken).split("_");

      if (childrenTokenParts.length !== 2) {
        throw new Error("children must contain valid room_age tokens.");
      }

      const [roomNumberText, childAgeText] = childrenTokenParts;
      const roomNumber = normalizePositiveIntegerOrNull(roomNumberText);
      const childAge = normalizeIntegerOrNull(childAgeText);

      if (
        !Number.isFinite(roomNumber) ||
        roomNumber < 1 ||
        roomNumber > rooms ||
        !Number.isFinite(childAge) ||
        childAge < 0
      ) {
        throw new Error("children must contain valid room_age tokens.");
      }

      if (!childrenByRoom.has(roomNumber)) {
        childrenByRoom.set(roomNumber, []);
      }

      childrenByRoom.get(roomNumber).push(childAge);
    }
  }

  const occupancies = [];

  for (let roomNumber = 1; roomNumber <= rooms; roomNumber += 1) {
    occupancies.push({
      adults: adultsList[roomNumber - 1],
      children: childrenByRoom.get(roomNumber) || []
    });
  }

  return occupancies;
}

function normalizeHotelDetails(getHotelDetails) {
  if (!getHotelDetails || typeof getHotelDetails !== "object") {
    console.warn("LITEAPI_HOTEL normalizeHotelDetails skipped", {
      reason: "missingHotelDetailsData"
    });

    return null;
  }

  const hotelImageUrls = dedupeStringArray([
    normalizeText(getHotelDetails?.main_photo),
    ...(
      Array.isArray(getHotelDetails?.hotelImages)
        ? getHotelDetails.hotelImages
            .map((hotelImageItem) => normalizeText(hotelImageItem?.url))
            .filter(Boolean)
        : []
    )
  ]);

  const hotelMainImage =
    normalizeText(getHotelDetails?.main_photo) ||
    normalizeText(
      Array.isArray(getHotelDetails?.hotelImages)
        ? getHotelDetails.hotelImages.find(
            (hotelImageItem) => hotelImageItem?.defaultImage === true
          )?.url
        : ""
    ) ||
    normalizeText(
      Array.isArray(getHotelDetails?.hotelImages)
        ? getHotelDetails.hotelImages[0]?.url
        : ""
    );

  const hotelLocationLatitude = normalizeNumberOrNull(
    getHotelDetails?.location?.latitude
  );
  const hotelLocationLongitude = normalizeNumberOrNull(
    getHotelDetails?.location?.longitude
  );

  const hotelMapUrl =
    Number.isFinite(hotelLocationLatitude) &&
    Number.isFinite(hotelLocationLongitude)
      ? `https://maps.google.com/?q=${hotelLocationLatitude},${hotelLocationLongitude}`
      : "";

  const hotelFacilities = Array.isArray(getHotelDetails?.facilities)
    ? getHotelDetails.facilities
        .map((facilityItem) => normalizeText(facilityItem?.name))
        .filter(Boolean)
    : [];

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
          checkin_start: normalizeText(
            getHotelDetails?.checkinCheckoutTimes?.checkin_start
          ),
          checkin_end: normalizeText(
            getHotelDetails?.checkinCheckoutTimes?.checkin_end
          ),
          checkout: normalizeText(
            getHotelDetails?.checkinCheckoutTimes?.checkout
          ),
          instructions: Array.isArray(
            getHotelDetails?.checkinCheckoutTimes?.instructions
          )
            ? getHotelDetails.checkinCheckoutTimes.instructions
            : [],
          special_instructions: normalizeText(
            getHotelDetails?.checkinCheckoutTimes?.special_instructions
          )
        }
      : {
          checkin_start: "",
          checkin_end: "",
          checkout: "",
          instructions: [],
          special_instructions: ""
        };

  const rooms = Array.isArray(getHotelDetails?.rooms)
    ? getHotelDetails.rooms
        .filter((roomItem) => roomItem && typeof roomItem === "object")
        .map((roomItem) => {
          const roomImageUrls = dedupeStringArray(
            Array.isArray(roomItem?.photos)
              ? roomItem.photos
                  .map((roomPhotoItem) => normalizeText(roomPhotoItem?.url))
                  .filter(Boolean)
              : []
          );

          const roomMainImage =
            normalizeText(
              Array.isArray(roomItem?.photos)
                ? roomItem.photos.find(
                    (roomPhotoItem) => roomPhotoItem?.mainPhoto === true
                  )?.url
                : ""
            ) ||
            normalizeText(
              Array.isArray(roomItem?.photos) ? roomItem.photos[0]?.url : ""
            );

          const roomSizeSquare = normalizeNumberOrNull(roomItem?.roomSizeSquare);
          const roomSizeUnit = normalizeText(roomItem?.roomSizeUnit);
          const roomSizeText =
            Number.isFinite(roomSizeSquare) &&
            roomSizeSquare > 0 &&
            roomSizeUnit
              ? `${roomSizeSquare} m2`
              : "";

          const roomMaxOccupancy = normalizeIntegerOrNull(roomItem?.maxOccupancy);
          const roomSleepsText =
            Number.isFinite(roomMaxOccupancy) && roomMaxOccupancy > 0
              ? `Sleeps ${roomMaxOccupancy}`
              : "";

          const roomBedTypesText = Array.isArray(roomItem?.bedTypes)
            ? roomItem.bedTypes
                .map((bedTypeItem) => {
                  const quantity = normalizePositiveIntegerOrNull(
                    bedTypeItem?.quantity
                  );
                  const bedType = normalizeText(bedTypeItem?.bedType);

                  if (!bedType) {
                    return "";
                  }

                  return Number.isFinite(quantity)
                    ? `${quantity} ${bedType}`
                    : bedType;
                })
                .filter(Boolean)
                .join(" and ")
            : "";

          const roomAmenities = Array.isArray(roomItem?.roomAmenities)
            ? roomItem.roomAmenities
                .map((roomAmenityItem) => {
                  if (typeof roomAmenityItem === "string") {
                    return normalizeText(roomAmenityItem);
                  }

                  return normalizeText(
                    roomAmenityItem?.name || roomAmenityItem?.title
                  );
                })
                .filter(Boolean)
            : [];

          return {
            roomId: normalizeIntegerOrNull(roomItem?.id),
            roomName: normalizeText(roomItem?.roomName),
            roomDescription: stripHtml(roomItem?.description),
            roomMainImage,
            roomImages: roomImageUrls,
            roomAmenities,
            roomSizeText,
            roomBedTypesText,
            roomSleepsText
          };
        })
    : [];

  const hotelStarRating = normalizeNumberOrNull(getHotelDetails?.starRating);
  const hotelRating = normalizeNumberOrNull(getHotelDetails?.rating);
  const hotelReviewCount = normalizeIntegerOrNull(getHotelDetails?.reviewCount);

  const hotelStarRatingText = formatHotelStarsText(hotelStarRating);
  const hotelRatingText = formatGuestRatingText(hotelRating);
  const hotelReviewCountText = formatReviewCountText(hotelReviewCount);
  const hotelReviewText = formatHotelReviewText({
    hotelRatingText,
    hotelReviewCountText
  });

  return {
    hotelId: normalizeText(getHotelDetails?.id) || null,
    hotelName: normalizeText(getHotelDetails?.name),
    hotelAddress: normalizeText(getHotelDetails?.address),
    hotelStarRating,
    hotelStarRatingText,
    hotelRating,
    hotelRatingText,
    hotelReviewCount,
    hotelReviewCountText,
    hotelReviewText,
    hotelMainImage,
    hotelImageUrls,
    hotelDescription: stripHtml(getHotelDetails?.hotelDescription),
    hotelImportantInformation: stripHtml(
      getHotelDetails?.hotelImportantInformation
    ),
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
  if (!Array.isArray(getHotelMappedRoomRates)) {
    throw new Error("getHotelMappedRoomRates must be an array.");
  }

  if (!getHotelMappedRoomRates.length) {
    console.log("LITEAPI_HOTEL getHotelMappedRoomRates empty result", {
      getHotelMappedRoomRatesDataCount: getHotelMappedRoomRates.length
    });

    return [];
  }

  const roomOfferNightCount = calculateNightCount(checkin, checkout);
  const normalizedHotelMappedRoomRatesMap = new Map();

  let skippedMissingRoomTypesCount = 0;
  let skippedMissingRatesCount = 0;
  let skippedMissingMappedRoomIdCount = 0;
  let skippedMissingOfferIdCount = 0;
  let skippedMissingCurrentPriceAmountCount = 0;
  let skippedMissingCurrentPriceCurrencyCount = 0;
  let skippedMissingOccupancyNumberCount = 0;
  let refundableTagRFNCount = 0;
  let refundableTagNRFNCount = 0;
  let refundableTagOtherCount = 0;
  let normalizedRoomOffersCount = 0;

  getHotelMappedRoomRates.forEach((getHotelMappedRoomRatesItem) => {
    if (
      !Array.isArray(getHotelMappedRoomRatesItem?.roomTypes) ||
      !getHotelMappedRoomRatesItem.roomTypes.length
    ) {
      skippedMissingRoomTypesCount += 1;
      return;
    }

    getHotelMappedRoomRatesItem.roomTypes.forEach((roomTypeItem) => {
      const roomTypeId = normalizeIntegerOrNull(roomTypeItem?.roomTypeId);
      const offerId = normalizeText(roomTypeItem?.offerId);

      if (!offerId) {
        skippedMissingOfferIdCount += 1;
        return;
      }

      if (!Array.isArray(roomTypeItem?.rates) || !roomTypeItem.rates.length) {
        skippedMissingRatesCount += 1;
        return;
      }

      roomTypeItem.rates.forEach((rateItem) => {
        const roomOfferMappedRoomId = normalizeIntegerOrNull(
          rateItem?.mappedRoomId
        );

        if (!Number.isFinite(roomOfferMappedRoomId)) {
          skippedMissingMappedRoomIdCount += 1;
          return;
        }

        const roomOfferOccupancyNumber = normalizePositiveIntegerOrNull(
          rateItem?.occupancyNumber
        );

        if (!Number.isFinite(roomOfferOccupancyNumber)) {
          skippedMissingOccupancyNumberCount += 1;
          return;
        }

        const roomOfferCurrentPrice = normalizeNumberOrNull(
          rateItem?.retailRate?.total?.[0]?.amount
        );

        if (!Number.isFinite(roomOfferCurrentPrice)) {
          skippedMissingCurrentPriceAmountCount += 1;
          return;
        }

        const roomOfferCurrency = normalizeText(
          rateItem?.retailRate?.total?.[0]?.currency
        ).toUpperCase();

        if (!roomOfferCurrency) {
          skippedMissingCurrentPriceCurrencyCount += 1;
          return;
        }

        const roomOfferId = normalizeText(rateItem?.rateId) || null;
        const roomOfferName = normalizeText(rateItem?.name) || null;
        const roomOfferBoardName = normalizeText(rateItem?.boardName);
        const roomOfferAdultCount = normalizeIntegerOrNull(rateItem?.adultCount);
        const roomOfferChildCount = normalizeIntegerOrNull(rateItem?.childCount);
        const roomOfferChildrenAges = Array.isArray(rateItem?.childrenAges)
          ? rateItem.childrenAges
              .map((childAge) => normalizeIntegerOrNull(childAge))
              .filter((childAge) => Number.isFinite(childAge))
          : [];

        const roomOfferBeforeCurrentPrice = normalizeNumberOrNull(
          rateItem?.retailRate?.suggestedSellingPrice?.[0]?.amount
        );

        const roomOfferRefundableTag =
          normalizeText(
            rateItem?.cancellationPolicies?.refundableTag
          ).toUpperCase() || null;

        let roomOfferRefundableTagText = "";

        if (roomOfferRefundableTag === "RFN") {
          roomOfferRefundableTagText = "Refundable";
          refundableTagRFNCount += 1;
        } else if (roomOfferRefundableTag === "NRFN") {
          roomOfferRefundableTagText = "Non-Refundable";
          refundableTagNRFNCount += 1;
        } else if (roomOfferRefundableTag) {
          roomOfferRefundableTagText = roomOfferRefundableTag;
          refundableTagOtherCount += 1;
        } else {
          refundableTagOtherCount += 1;
        }

        const roomOfferTaxesAndFeesText = Array.isArray(
          rateItem?.retailRate?.taxesAndFees
        )
          ? rateItem.retailRate.taxesAndFees.some(
              (taxesAndFeesItem) => taxesAndFeesItem?.included === false
            )
            ? "excl."
            : "incl."
          : "";

        const roomOfferCurrentPriceNoteTextItems = [
          `${roomOfferNightCount} night`,
          `${roomOfferOccupancyNumber} room`
        ];

        if (roomOfferTaxesAndFeesText) {
          roomOfferCurrentPriceNoteTextItems.push(
            `${roomOfferTaxesAndFeesText} taxes & fees`
          );
        }

        const roomOfferCurrentPriceNoteText =
          roomOfferCurrentPriceNoteTextItems.join(", ");

        const roomOfferCurrentPriceText = formatPriceText({
          amount: roomOfferCurrentPrice,
          currency: roomOfferCurrency
        });

        const roomOfferBeforeCurrentPriceText = Number.isFinite(
          roomOfferBeforeCurrentPrice
        )
          ? formatPriceText({
              amount: roomOfferBeforeCurrentPrice,
              currency: roomOfferCurrency
            })
          : "";

        const normalizedHotelMappedRoomRatesKey = String(roomOfferMappedRoomId);

        if (!normalizedHotelMappedRoomRatesMap.has(normalizedHotelMappedRoomRatesKey)) {
          normalizedHotelMappedRoomRatesMap.set(normalizedHotelMappedRoomRatesKey, {
            mappedRoomId: roomOfferMappedRoomId,
            roomOffers: []
          });
        }

        normalizedHotelMappedRoomRatesMap.get(
          normalizedHotelMappedRoomRatesKey
        ).roomOffers.push({
          roomTypeId: Number.isFinite(roomTypeId) ? roomTypeId : null,
          roomOfferId,
          roomOfferName,
          roomOfferMappedRoomId,
          roomOfferBoardName,
          roomOfferOccupancyNumber,
          roomOfferAdultCount,
          roomOfferChildCount,
          roomOfferChildrenAges,
          roomOfferCurrentPrice,
          roomOfferCurrentPriceText,
          roomOfferBeforeCurrentPrice: Number.isFinite(roomOfferBeforeCurrentPrice)
            ? roomOfferBeforeCurrentPrice
            : null,
          roomOfferBeforeCurrentPriceText,
          roomOfferCurrency,
          roomOfferRefundableTag,
          roomOfferRefundableTagText,
          roomOfferCurrentPriceNoteText,
          offerId
        });

        normalizedRoomOffersCount += 1;
      });
    });
  });

  const normalizedHotelMappedRoomRates = Array.from(
    normalizedHotelMappedRoomRatesMap.values()
  )
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

  console.log("LITEAPI_HOTEL normalizeHotelMappedRoomRates summary", {
    getHotelMappedRoomRatesDataCount: getHotelMappedRoomRates.length,
    normalizedHotelMappedRoomRatesCount: normalizedHotelMappedRoomRates.length,
    normalizedRoomOffersCount,
    skippedMissingRoomTypesCount,
    skippedMissingRatesCount,
    skippedMissingMappedRoomIdCount,
    skippedMissingOfferIdCount,
    skippedMissingCurrentPriceAmountCount,
    skippedMissingCurrentPriceCurrencyCount,
    skippedMissingOccupancyNumberCount,
    refundableTagRFNCount,
    refundableTagNRFNCount,
    refundableTagOtherCount
  });

  return normalizedHotelMappedRoomRates;
}

function normalizeHotelMappedRoomOffers({
  normalizedHotelDetails,
  normalizedHotelMappedRoomRates
}) {
  const roomsByRoomId = new Map();

  const rooms = Array.isArray(normalizedHotelDetails?.rooms)
    ? normalizedHotelDetails.rooms
    : [];

  rooms.forEach((roomItem) => {
    const roomId = normalizeIntegerOrNull(roomItem?.roomId);

    if (Number.isFinite(roomId)) {
      roomsByRoomId.set(String(roomId), roomItem);
    }
  });

  const mappedRoomOffers = (
    Array.isArray(normalizedHotelMappedRoomRates)
      ? normalizedHotelMappedRoomRates
      : []
  ).map((mappedRoomRatesItem) => {
    const mappedRoomId = normalizeIntegerOrNull(mappedRoomRatesItem?.mappedRoomId);

    return {
      mappedRoomId: Number.isFinite(mappedRoomId) ? mappedRoomId : null,
      room:
        Number.isFinite(mappedRoomId) && roomsByRoomId.has(String(mappedRoomId))
          ? roomsByRoomId.get(String(mappedRoomId)) || null
          : null,
      roomOffers: Array.isArray(mappedRoomRatesItem?.roomOffers)
        ? mappedRoomRatesItem.roomOffers
        : []
    };
  });

  const allRoomOffers = mappedRoomOffers.flatMap((mappedRoomOfferItem) =>
    Array.isArray(mappedRoomOfferItem?.roomOffers)
      ? mappedRoomOfferItem.roomOffers
      : []
  );

  const roomOfferCurrency =
    normalizeText(allRoomOffers?.[0]?.roomOfferCurrency) || null;

  const roomOffersMinCurrentPriceCandidates = allRoomOffers
    .map((roomOfferItem) =>
      normalizeNumberOrNull(roomOfferItem?.roomOfferCurrentPrice)
    )
    .filter((roomOfferCurrentPrice) => Number.isFinite(roomOfferCurrentPrice));

  const roomOffersMinCurrentPrice = roomOffersMinCurrentPriceCandidates.length
    ? Math.min(...roomOffersMinCurrentPriceCandidates)
    : null;

  const roomOffersMinCurrentPriceText =
    Number.isFinite(roomOffersMinCurrentPrice) && roomOfferCurrency
      ? formatPriceText({
          amount: roomOffersMinCurrentPrice,
          currency: roomOfferCurrency
        })
      : "";

  console.log("LITEAPI_HOTEL normalizeHotelMappedRoomOffers summary", {
    normalizedHotelRoomsCount: rooms.length,
    mappedRoomOffersCount: mappedRoomOffers.length,
    allRoomOffersCount: allRoomOffers.length,
    hasRoomOffersMinCurrentPrice: Number.isFinite(roomOffersMinCurrentPrice),
    roomOfferCurrency
  });

  return {
    roomOffersMinCurrentPrice,
    roomOffersMinCurrentPriceText,
    roomOfferCurrency,
    mappedRoomOffers
  };
}

function formatPriceText({ amount, currency }) {
  const numericAmount = normalizeNumberOrNull(amount);
  const normalizedCurrency = normalizeText(currency).toUpperCase() || DEFAULT_CURRENCY;

  if (!Number.isFinite(numericAmount) || !normalizedCurrency) {
    return "";
  }

  try {
    if (normalizedCurrency === "TRY") {
      return new Intl.NumberFormat("tr-TR", {
        style: "currency",
        currency: "TRY",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(numericAmount);
    }

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(numericAmount);
  } catch {
    const fixedAmount = numericAmount.toFixed(2);

    if (normalizedCurrency === "TRY") {
      const [wholePart, fractionPart] = fixedAmount.split(".");
      return `₺${Number(wholePart).toLocaleString("tr-TR")},${fractionPart}`;
    }

    return `${normalizedCurrency} ${fixedAmount}`;
  }
}

function formatReviewCountText(value) {
  const numericValue = normalizeNumberOrNull(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "";
  }

  return `${numericValue} reviews`;
}

function formatGuestRatingText(value) {
  const numericValue = normalizeNumberOrNull(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "";
  }

  return Number.isInteger(numericValue)
    ? String(numericValue)
    : numericValue.toFixed(1);
}

function formatHotelReviewText({ hotelRatingText, hotelReviewCountText }) {
  if (hotelRatingText && hotelReviewCountText) {
    return `${hotelRatingText} • ${hotelReviewCountText}`;
  }

  return hotelRatingText || hotelReviewCountText || "";
}

function formatHotelStarsText(value) {
  const numericValue = normalizeNumberOrNull(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "";
  }

  const roundedValue = Math.max(1, Math.min(5, Math.round(numericValue)));
  return "★".repeat(roundedValue);
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

function dedupeStringArray(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => normalizeText(value))
        .filter(Boolean)
    )
  );
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

function getDateUtcTime(value) {
  const [normalizedDateYear, normalizedDateMonth, normalizedDateDay] =
    normalizeText(value).split("-").map(Number);

  return Date.UTC(
    normalizedDateYear,
    normalizedDateMonth - 1,
    normalizedDateDay
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

  const parsedValue = Number(normalizedText);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function normalizeIntegerOrNull(value) {
  const normalizedText = normalizeText(value);

  if (!normalizedText) {
    return null;
  }

  const parsedValue = Number(normalizedText);
  return Number.isInteger(parsedValue) ? parsedValue : null;
}

function normalizePositiveIntegerOrNull(value) {
  const parsedValue = normalizeIntegerOrNull(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
}
