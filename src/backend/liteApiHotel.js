import { elevate } from "wix-auth";
import { secrets } from "wix-secrets-backend.v2";
import { buildLiteApiError, liteApiRequest, parseJson } from "./liteApiClient";

const LITE_API_BASE_URL = "https://api.liteapi.travel/v3.0";
const MARKUP_RATE_SECRET_NAME = "MARKUP_RATE";
const DEFAULT_CURRENCY = "TRY";
const DEFAULT_GUEST_NATIONALITY = "TR";
const DEFAULT_LANGUAGE = "tr";
const DEFAULT_MARGIN = 0;

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

const getSecretValue = elevate(secrets.getSecretValue);

export async function getHotelMappedRoomRatesHandler(searchFlowContextQuery) {
  const getHotelDetailsRequest = buildHotelDetailsRequest(searchFlowContextQuery);
  const getHotelMappedRoomRatesRequest =
    buildHotelMappedRoomRatesRequest(searchFlowContextQuery);

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

  const normalizedMarkupRate = getHotelMappedRoomRatesJson.data.length
    ? await getMarkupRate()
    : null;

  const hotelMappedRoomRates = buildHotelMappedRoomRates({
    getHotelDetailsJson,
    getHotelMappedRoomRatesJson
  });

  const normalizedHotelMappedRoomRates = normalizeHotelMappedRoomRates({
    hotelMappedRoomRates,
    checkin: getHotelMappedRoomRatesRequest.checkin,
    checkout: getHotelMappedRoomRatesRequest.checkout,
    normalizedMarkupRate
  });

  console.log("LITEAPI_HOTEL getHotelMappedRoomRates summary", {
    hotelId: getHotelMappedRoomRatesRequest.hotelIds[0],
    hasNormalizedHotelMappedRoomRates: Boolean(normalizedHotelMappedRoomRates),
    normalizedHotelRoomsCount: Array.isArray(
      normalizedHotelMappedRoomRates?.rooms
    )
      ? normalizedHotelMappedRoomRates.rooms.length
      : 0,
    normalizedHotelRoomTypesCount: Array.isArray(
      normalizedHotelMappedRoomRates?.rooms
    )
      ? normalizedHotelMappedRoomRates.rooms.reduce(
          (roomTypesCount, roomItem) =>
            roomTypesCount +
            (Array.isArray(roomItem?.roomTypes)
              ? roomItem.roomTypes.length
              : 0),
          0
        )
      : 0,
    normalizedHotelRatesCount: Array.isArray(normalizedHotelMappedRoomRates?.rooms)
      ? normalizedHotelMappedRoomRates.rooms.reduce(
          (ratesCount, roomItem) =>
            ratesCount +
            (Array.isArray(roomItem?.roomTypes)
              ? roomItem.roomTypes.reduce(
                  (roomTypeRatesCount, roomTypeItem) =>
                    roomTypeRatesCount +
                    (Array.isArray(roomTypeItem?.rates)
                      ? roomTypeItem.rates.length
                      : 0),
                  0
                )
              : 0),
          0
        )
      : 0,
    hasMinCurrentPrice: Number.isFinite(
      normalizedHotelMappedRoomRates?.minCurrentPrice
    )
  });

  return {
    hotelId: getHotelMappedRoomRatesRequest.hotelIds[0],
    normalizedHotelMappedRoomRates
  };
}

async function getMarkupRate() {
  const markupRateSecretValue = await getSecretValue(MARKUP_RATE_SECRET_NAME);

  const normalizedMarkupRate = normalizeNumberOrNull(
    markupRateSecretValue?.value
  );

  if (!Number.isFinite(normalizedMarkupRate)) {
    throw new Error("MARKUP_RATE secret must be a numeric multiplier value.");
  }

  return normalizedMarkupRate;
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

function buildHotelMappedRoomRates({
  getHotelDetailsJson,
  getHotelMappedRoomRatesJson
}) {
  const getHotelDetailsData = getHotelDetailsJson?.data || {};
  const {
    rooms: getHotelDetailsRooms = [],
    ...getHotelDetailsRoot
  } = getHotelDetailsData;

  const roomTypesByMappedRoomId = new Map();

  for (const getHotelMappedRoomRatesItem of getHotelMappedRoomRatesJson?.data || []) {
    const hotelId = normalizeText(getHotelMappedRoomRatesItem?.hotelId);
    const roomTypes = Array.isArray(getHotelMappedRoomRatesItem?.roomTypes)
      ? getHotelMappedRoomRatesItem.roomTypes
      : [];

    for (const roomTypeItem of roomTypes) {
      if (!roomTypeItem || typeof roomTypeItem !== "object") {
        continue;
      }

      const { rates = [], ...roomType } = roomTypeItem;
      const ratesByMappedRoomId = new Map();

      if (!Array.isArray(rates)) {
        continue;
      }

      for (const rate of rates) {
        const mappedRoomId = String(rate?.mappedRoomId || "");

        if (!mappedRoomId) {
          continue;
        }

        if (!ratesByMappedRoomId.has(mappedRoomId)) {
          ratesByMappedRoomId.set(mappedRoomId, []);
        }

        ratesByMappedRoomId.get(mappedRoomId).push(rate);
      }

      for (const [mappedRoomId, mappedRates] of ratesByMappedRoomId.entries()) {
        if (!roomTypesByMappedRoomId.has(mappedRoomId)) {
          roomTypesByMappedRoomId.set(mappedRoomId, []);
        }

        roomTypesByMappedRoomId.get(mappedRoomId).push({
          hotelId,
          mappedRoomId,
          ...roomType,
          rates: mappedRates
        });
      }
    }
  }

  const hotelMappedRoomRates = {
    ...getHotelDetailsRoot,

    rooms: (Array.isArray(getHotelDetailsRooms) ? getHotelDetailsRooms : []).map(
      (room) => {
        const mappedRoomId = String(room?.id || "");

        return {
          ...room,
          mappedRoomId,
          roomTypes: roomTypesByMappedRoomId.get(mappedRoomId) || []
        };
      }
    )
  };

  console.log("LITEAPI_HOTEL buildHotelMappedRoomRates summary", {
    hotelId: normalizeText(hotelMappedRoomRates?.id),
    getHotelDetailsRoomsCount: Array.isArray(getHotelDetailsRooms)
      ? getHotelDetailsRooms.length
      : 0,
    roomTypesByMappedRoomIdCount: roomTypesByMappedRoomId.size,
    hotelMappedRoomRatesRoomsCount: Array.isArray(hotelMappedRoomRates?.rooms)
      ? hotelMappedRoomRates.rooms.length
      : 0
  });

  return hotelMappedRoomRates;
}

function normalizeHotelMappedRoomRates({
  hotelMappedRoomRates,
  checkin,
  checkout,
  normalizedMarkupRate
}) {
  if (!hotelMappedRoomRates || typeof hotelMappedRoomRates !== "object") {
    console.warn("LITEAPI_HOTEL normalizeHotelMappedRoomRates skipped", {
      reason: "missingHotelMappedRoomRates"
    });

    return null;
  }

  const nightCount = calculateNightCount(checkin, checkout);

  const hotelImageUrls = dedupeStringArray([
    normalizeText(hotelMappedRoomRates?.main_photo),
    ...(
      Array.isArray(hotelMappedRoomRates?.hotelImages)
        ? hotelMappedRoomRates.hotelImages
            .map((hotelImageItem) => normalizeText(hotelImageItem?.url))
            .filter(Boolean)
        : []
    )
  ]);

  const hotelMainImage =
    normalizeText(hotelMappedRoomRates?.main_photo) ||
    normalizeText(
      Array.isArray(hotelMappedRoomRates?.hotelImages)
        ? hotelMappedRoomRates.hotelImages.find(
            (hotelImageItem) => hotelImageItem?.defaultImage === true
          )?.url
        : ""
    ) ||
    normalizeText(
      Array.isArray(hotelMappedRoomRates?.hotelImages)
        ? hotelMappedRoomRates.hotelImages[0]?.url
        : ""
    );

  const hotelLocationLatitude = normalizeNumberOrNull(
    hotelMappedRoomRates?.location?.latitude
  );
  const hotelLocationLongitude = normalizeNumberOrNull(
    hotelMappedRoomRates?.location?.longitude
  );

  const hotelMapUrl =
    Number.isFinite(hotelLocationLatitude) &&
    Number.isFinite(hotelLocationLongitude)
      ? `https://maps.google.com/?q=${hotelLocationLatitude},${hotelLocationLongitude}`
      : "";

  const hotelFacilities = Array.isArray(hotelMappedRoomRates?.facilities)
    ? hotelMappedRoomRates.facilities
        .map((facilityItem) => normalizeText(facilityItem?.name))
        .filter(Boolean)
    : [];

  const hotelPolicies = Array.isArray(hotelMappedRoomRates?.policies)
    ? hotelMappedRoomRates.policies
        .map((policyItem) => ({
          name: normalizeText(policyItem?.name),
          description: stripHtml(policyItem?.description)
        }))
        .filter((policyItem) => policyItem.name || policyItem.description)
    : [];

  const hotelCheckinCheckoutTimes =
    hotelMappedRoomRates?.checkinCheckoutTimes &&
    typeof hotelMappedRoomRates.checkinCheckoutTimes === "object"
      ? {
          checkin_start: normalizeText(
            hotelMappedRoomRates?.checkinCheckoutTimes?.checkin_start
          ),
          checkin_end: normalizeText(
            hotelMappedRoomRates?.checkinCheckoutTimes?.checkin_end
          ),
          checkout: normalizeText(
            hotelMappedRoomRates?.checkinCheckoutTimes?.checkout
          ),
          instructions: Array.isArray(
            hotelMappedRoomRates?.checkinCheckoutTimes?.instructions
          )
            ? hotelMappedRoomRates.checkinCheckoutTimes.instructions
            : [],
          special_instructions: normalizeText(
            hotelMappedRoomRates?.checkinCheckoutTimes?.special_instructions
          )
        }
      : {
          checkin_start: "",
          checkin_end: "",
          checkout: "",
          instructions: [],
          special_instructions: ""
        };

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
  let normalizedRatesCount = 0;

  const rooms = Array.isArray(hotelMappedRoomRates?.rooms)
    ? hotelMappedRoomRates.rooms
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

          const roomTypes = Array.isArray(roomItem?.roomTypes)
            ? roomItem.roomTypes
                .map((roomTypeItem) => {
                  const roomTypeId = normalizeText(roomTypeItem?.roomTypeId);
                  const offerId = normalizeText(roomTypeItem?.offerId);
                  const roomTypeMappedRoomId = normalizeIntegerOrNull(
                    roomTypeItem?.mappedRoomId
                  );
                  const hotelId = normalizeText(roomTypeItem?.hotelId);

                  if (!offerId) {
                    skippedMissingOfferIdCount += 1;
                    return null;
                  }

                  if (
                    !Array.isArray(roomTypeItem?.rates) ||
                    !roomTypeItem.rates.length
                  ) {
                    skippedMissingRatesCount += 1;
                    return null;
                  }

                  const rates = roomTypeItem.rates
                    .map((rateItem) => {
                      const mappedRoomId = normalizeIntegerOrNull(
                        rateItem?.mappedRoomId
                      );

                      if (!Number.isFinite(mappedRoomId)) {
                        skippedMissingMappedRoomIdCount += 1;
                        return null;
                      }

                      const occupancyNumber = normalizePositiveIntegerOrNull(
                        rateItem?.occupancyNumber
                      );

                      if (!Number.isFinite(occupancyNumber)) {
                        skippedMissingOccupancyNumberCount += 1;
                        return null;
                      }

                      const retailRateTotalAmount = normalizeNumberOrNull(
                        rateItem?.retailRate?.total?.[0]?.amount
                      );

                      if (!Number.isFinite(retailRateTotalAmount)) {
                        skippedMissingCurrentPriceAmountCount += 1;
                        return null;
                      }

                      const retailRateTotalCurrency = normalizeText(
                        rateItem?.retailRate?.total?.[0]?.currency
                      ).toUpperCase();

                      if (!retailRateTotalCurrency) {
                        skippedMissingCurrentPriceCurrencyCount += 1;
                        return null;
                      }

                      const retailRateSuggestedSellingPriceAmount =
                        normalizeNumberOrNull(
                          rateItem?.retailRate?.suggestedSellingPrice?.[0]
                            ?.amount
                        );

                      const retailRateSuggestedSellingPriceCurrency =
                        normalizeText(
                          rateItem?.retailRate?.suggestedSellingPrice?.[0]
                            ?.currency
                        ).toUpperCase() || retailRateTotalCurrency;

                      const currentPrice = applyMarkupRate(
                        retailRateTotalAmount,
                        normalizedMarkupRate
                      );

                      const beforeCurrentPrice = applyMarkupRate(
                        retailRateSuggestedSellingPriceAmount,
                        normalizedMarkupRate
                      );

                      const cancellationPoliciesRefundableTag =
                        normalizeText(
                          rateItem?.cancellationPolicies?.refundableTag
                        ).toUpperCase() || null;

                      if (cancellationPoliciesRefundableTag === "RFN") {
                        refundableTagRFNCount += 1;
                      } else if (cancellationPoliciesRefundableTag === "NRFN") {
                        refundableTagNRFNCount += 1;
                      } else {
                        refundableTagOtherCount += 1;
                      }

                      const retailRateTaxesAndFeesText = Array.isArray(
                        rateItem?.retailRate?.taxesAndFees
                      )
                        ? rateItem.retailRate.taxesAndFees.some(
                            (retailRateTaxesAndFeesItem) =>
                              retailRateTaxesAndFeesItem?.included === false
                          )
                          ? "excl."
                          : "incl."
                        : "";

                      const currentPriceNoteTextItems = [
                        `${nightCount} night`,
                        `${occupancyNumber} room`
                      ];

                      if (retailRateTaxesAndFeesText) {
                        currentPriceNoteTextItems.push(
                          `${retailRateTaxesAndFeesText} taxes & fees`
                        );
                      }

                      const currentPriceNoteText =
                        currentPriceNoteTextItems.join(", ");

                      const currentPriceText = formatPriceText({
                        amount: currentPrice,
                        currency: retailRateTotalCurrency
                      });

                      const beforeCurrentPriceText = Number.isFinite(
                        beforeCurrentPrice
                      )
                        ? formatPriceText({
                            amount: beforeCurrentPrice,
                            currency: retailRateSuggestedSellingPriceCurrency
                          })
                        : "";

                      normalizedRatesCount += 1;

                      return {
                        hotelId,
                        mappedRoomId,
                        roomTypeId,
                        offerId,
                        rateId: normalizeText(rateItem?.rateId) || null,

                        rateName: normalizeText(rateItem?.name) || null,
                        rateBoardName: normalizeText(rateItem?.boardName),

                        occupancyNumber,
                        adultCount: normalizeIntegerOrNull(rateItem?.adultCount),
                        childCount: normalizeIntegerOrNull(rateItem?.childCount),
                        childrenAges: Array.isArray(rateItem?.childrenAges)
                          ? rateItem.childrenAges
                              .map((childAge) => normalizeIntegerOrNull(childAge))
                              .filter((childAge) => Number.isFinite(childAge))
                          : [],

                        currentPrice,
                        currentPriceText,
                        beforeCurrentPrice: Number.isFinite(beforeCurrentPrice)
                          ? beforeCurrentPrice
                          : null,
                        beforeCurrentPriceText,
                        currentPriceNoteText
                      };
                    })
                    .filter(Boolean)
                    .sort((leftRateItem, rightRateItem) => {
                      const leftCurrentPrice = normalizeNumberOrNull(
                        leftRateItem?.currentPrice
                      );
                      const rightCurrentPrice = normalizeNumberOrNull(
                        rightRateItem?.currentPrice
                      );

                      if (!Number.isFinite(leftCurrentPrice)) {
                        return 1;
                      }

                      if (!Number.isFinite(rightCurrentPrice)) {
                        return -1;
                      }

                      return leftCurrentPrice - rightCurrentPrice;
                    });

                  if (!rates.length) {
                    return null;
                  }

                  return {
                    hotelId,
                    mappedRoomId: Number.isFinite(roomTypeMappedRoomId)
                      ? roomTypeMappedRoomId
                      : null,
                    roomTypeId: roomTypeId || null,
                    offerId,
                    rates
                  };
                })
                .filter(Boolean)
            : [];

          if (!roomTypes.length) {
            skippedMissingRoomTypesCount += 1;
          }

          return {
            roomId: normalizeIntegerOrNull(roomItem?.id),
            mappedRoomId: normalizeIntegerOrNull(roomItem?.mappedRoomId),
            roomName: normalizeText(roomItem?.roomName),
            roomDescription: stripHtml(roomItem?.description),
            roomMainImage,
            roomImages: roomImageUrls,
            roomAmenities,
            roomSizeText,
            roomBedTypesText,
            roomSleepsText,
            roomTypes
          };
        })
    : [];

  const allRates = rooms.flatMap((roomItem) =>
    Array.isArray(roomItem?.roomTypes)
      ? roomItem.roomTypes.flatMap((roomTypeItem) =>
          Array.isArray(roomTypeItem?.rates) ? roomTypeItem.rates : []
        )
      : []
  );

  const minCurrentPriceRate = allRates
    .filter((rateItem) => Number.isFinite(rateItem?.currentPrice))
    .slice()
    .sort((leftRateItem, rightRateItem) =>
      leftRateItem.currentPrice - rightRateItem.currentPrice
    )[0];

  const minCurrentPrice = Number.isFinite(minCurrentPriceRate?.currentPrice)
    ? minCurrentPriceRate.currentPrice
    : null;

  const minCurrentPriceText = normalizeText(
    minCurrentPriceRate?.currentPriceText
  );

  const hotelStarRating = normalizeNumberOrNull(hotelMappedRoomRates?.starRating);
  const hotelRating = normalizeNumberOrNull(hotelMappedRoomRates?.rating);
  const hotelReviewCount = normalizeIntegerOrNull(
    hotelMappedRoomRates?.reviewCount
  );

  const hotelStarRatingText = formatHotelStarsText(hotelStarRating);
  const hotelRatingText = formatGuestRatingText(hotelRating);
  const hotelReviewCountText = formatReviewCountText(hotelReviewCount);
  const hotelReviewText = formatHotelReviewText({
    hotelRatingText,
    hotelReviewCountText
  });

  const normalizedHotelMappedRoomRates = {
    hotelId: normalizeText(hotelMappedRoomRates?.id) || null,
    hotelName: normalizeText(hotelMappedRoomRates?.name),
    hotelAddress: normalizeText(hotelMappedRoomRates?.address),
    hotelStarRating,
    hotelStarRatingText,
    hotelRating,
    hotelRatingText,
    hotelReviewCount,
    hotelReviewCountText,
    hotelReviewText,
    hotelMainImage,
    hotelImageUrls,
    hotelDescription: stripHtml(hotelMappedRoomRates?.hotelDescription),
    hotelImportantInformation: stripHtml(
      hotelMappedRoomRates?.hotelImportantInformation
    ),
    hotelCheckinCheckoutTimes,
    hotelFacilities,
    hotelPolicies,
    hotelMapUrl,
    minCurrentPrice,
    minCurrentPriceText,
    rooms
  };

  console.log("LITEAPI_HOTEL normalizeHotelMappedRoomRates summary", {
    hotelId: normalizedHotelMappedRoomRates.hotelId,
    normalizedHotelRoomsCount: rooms.length,
    normalizedHotelRoomTypesCount: rooms.reduce(
      (roomTypesCount, roomItem) =>
        roomTypesCount +
        (Array.isArray(roomItem?.roomTypes) ? roomItem.roomTypes.length : 0),
      0
    ),
    normalizedRatesCount,
    skippedMissingRoomTypesCount,
    skippedMissingRatesCount,
    skippedMissingMappedRoomIdCount,
    skippedMissingOfferIdCount,
    skippedMissingCurrentPriceAmountCount,
    skippedMissingCurrentPriceCurrencyCount,
    skippedMissingOccupancyNumberCount,
    refundableTagRFNCount,
    refundableTagNRFNCount,
    refundableTagOtherCount,
    hasMinCurrentPrice: Number.isFinite(minCurrentPrice)
  });

  return normalizedHotelMappedRoomRates;
}

function applyMarkupRate(amount, markupRate) {
  const normalizedAmount = normalizeNumberOrNull(amount);
  const normalizedMarkupRate = normalizeNumberOrNull(markupRate);

  if (!Number.isFinite(normalizedAmount)) {
    return null;
  }

  if (!Number.isFinite(normalizedMarkupRate)) {
    return null;
  }

  return normalizedAmount * normalizedMarkupRate;
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
