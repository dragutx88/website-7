import { elevate } from "wix-auth";
import { secrets } from "wix-secrets-backend.v2";
import { buildLiteApiError, liteApiRequest, parseJson } from "./liteApiClient";

const LITE_API_BASE_URL = "https://api.liteapi.travel/v3.0";
const MARKUP_RATE_SECRET_NAME = "MARKUP_RATE";
const DEFAULT_CURRENCY = "TRY";
const DEFAULT_GUEST_NATIONALITY = "TR";
const DEFAULT_LANGUAGE = "tr";

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

const getSecretValue = elevate(secrets.getSecretValue);

export async function getHotelMappedRoomRatesHandler(searchFlowContextQuery) {
  const getHotelDetailsRequest = buildHotelDetailsRequest(searchFlowContextQuery);
  const getHotelMappedRoomRatesRequest =
    buildHotelMappedRoomRatesRequest(searchFlowContextQuery);

  const getHotelDetailsQuery = new URLSearchParams();
  getHotelDetailsQuery.set("hotelId", getHotelDetailsRequest.hotelId);
  getHotelDetailsQuery.set("language", getHotelDetailsRequest.language);

  const [
    getHotelDetailsResponse,
    getHotelMappedRoomRatesResponse,
    normalizedMarkupRate
  ] = await Promise.all([
    liteApiRequest(
      `${LITE_API_BASE_URL}/data/hotel?${getHotelDetailsQuery.toString()}`,
      {
        method: "GET"
      }
    ),
    liteApiRequest(`${LITE_API_BASE_URL}/hotels/rates`, {
      method: "POST",
      body: getHotelMappedRoomRatesRequest
    }),
     getMarkupRate()
  ]);

  const [
    getHotelDetailsJson,
    getHotelMappedRoomRatesJson
  ] = await Promise.all([
    parseJson(getHotelDetailsResponse),
    parseJson(getHotelMappedRoomRatesResponse)
  ]);

  if (!getHotelDetailsResponse.ok) {
    throw buildLiteApiError(
      getHotelDetailsJson,
      "Hotel details request failed."
    );
  }

  if (!getHotelMappedRoomRatesResponse.ok) {
    throw buildLiteApiError(
      getHotelMappedRoomRatesJson,
      "Hotel room rates request failed."
    );
  }

  if (!Array.isArray(getHotelMappedRoomRatesJson?.data)) {
    throw new Error("Hotel mapped room rates response data must be an array.");
  }

  const ratesExpiresInSeconds =
    normalizeIntegerOrNull(getHotelMappedRoomRatesJson?.data?.[0]?.et) || null;

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
    ratesExpiresInSeconds,
    hasNormalizedHotelMappedRoomRates: Boolean(normalizedHotelMappedRoomRates),
    normalizedHotelRoomsCount: normalizedHotelMappedRoomRates?.rooms?.length ?? 0,
    hasMinCurrentPrice: Number.isFinite(
      normalizedHotelMappedRoomRates?.minCurrentPrice
    )
  });

  return {
    hotelId: getHotelMappedRoomRatesRequest.hotelIds[0],
    ratesExpiresInSeconds,
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
    margin: 0
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

  for (const hotelRatesItem of getHotelMappedRoomRatesJson?.data || []) {
    if (!hotelRatesItem || typeof hotelRatesItem !== "object") {
      continue;
    }

    const hotelId = normalizeText(hotelRatesItem?.hotelId);
    const roomTypes = Array.isArray(hotelRatesItem?.roomTypes)
      ? hotelRatesItem.roomTypes
      : [];

    for (const roomTypeItem of roomTypes) {
      if (!roomTypeItem || typeof roomTypeItem !== "object") {
        continue;
      }

      const { rates = [], ...roomType } = roomTypeItem;
      const ratesByMappedRoomId = new Map();
      const normalizedRates = Array.isArray(rates) ? rates : [];

      for (const rate of normalizedRates) {
        const mappedRoomId =
          rate?.mappedRoomId != null ? String(rate.mappedRoomId) : "";

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

  const getHotelDetailsRoomsArray = Array.isArray(getHotelDetailsRooms)
    ? getHotelDetailsRooms
    : [];

  const hotelMappedRoomRates = {
    ...getHotelDetailsRoot,

    rooms: getHotelDetailsRoomsArray.map((room) => {
      const mappedRoomId = room?.id != null ? String(room.id) : "";

      return {
        ...room,
        mappedRoomId,
        roomTypes: roomTypesByMappedRoomId.get(mappedRoomId) || []
      };
    })
  };

  console.log("LITEAPI_HOTEL buildHotelMappedRoomRates summary", {
    hotelId: normalizeText(hotelMappedRoomRates?.id),
    getHotelDetailsRoomsCount: getHotelDetailsRoomsArray.length,
    roomTypesByMappedRoomIdCount: roomTypesByMappedRoomId.size,
    hotelMappedRoomRatesRoomsCount: hotelMappedRoomRates.rooms.length
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
    throw new Error("hotelMappedRoomRates is required.");
  }

  const nightCount = calculateNightCount(checkin, checkout);
  const hotelId = normalizeText(hotelMappedRoomRates?.id);

  if (!hotelId) {
    throw new Error("hotelMappedRoomRates.id is required.");
  }

  const hotelImageUrls = [
    ...new Set(
      [
        normalizeText(hotelMappedRoomRates?.main_photo),
        ...(Array.isArray(hotelMappedRoomRates?.hotelImages)
          ? hotelMappedRoomRates.hotelImages
              .map((hotelImageItem) => normalizeText(hotelImageItem?.url))
              .filter(Boolean)
          : [])
      ].filter(Boolean)
    )
  ];

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
                .map((instructionItem) => normalizeText(instructionItem))
                .filter(Boolean)
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

  const skipped = {
    missingRoomId: 0,
    missingRoomTypes: 0,
    missingRatesFromApi: 0,
    missingRatesAfterFilter: 0,
    missingHotelId: 0,
    missingRoomTypeId: 0,
    missingRoomTypeMappedRoomId: 0,
    missingRateMappedRoomId: 0,
    missingOfferId: 0,
    missingRateId: 0,
    missingCurrentPriceAmount: 0,
    missingCurrentPriceCurrency: 0,
    missingOccupancyNumber: 0
  };

  const refundableTag = {
    RFN: 0,
    NRFN: 0,
    other: 0
  };

  let normalizedRatesCount = 0;

  const rooms = (Array.isArray(hotelMappedRoomRates?.rooms)
    ? hotelMappedRoomRates.rooms
    : []
  )
    .map((roomItem) => {
      const roomId = normalizeIntegerOrNull(roomItem?.id);
      const mappedRoomId = normalizeIntegerOrNull(roomItem?.mappedRoomId);

      if (!Number.isFinite(roomId) || !Number.isFinite(mappedRoomId)) {
        skipped.missingRoomId += 1;
        return null;
      }

      const roomImageUrls = [
        ...new Set(
          Array.isArray(roomItem?.photos)
            ? roomItem.photos
                .map((roomPhotoItem) => normalizeText(roomPhotoItem?.url))
                .filter(Boolean)
            : []
        )
      ];

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

      const roomViews = Array.isArray(roomItem?.views)
        ? roomItem.views
            .map((viewItem) => normalizeText(viewItem?.view))
            .filter(Boolean)
        : [];

      const roomSizeSquare = normalizeNumberOrNull(roomItem?.roomSizeSquare);
      const roomSizeText =
        Number.isFinite(roomSizeSquare) && roomSizeSquare > 0
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

      const roomTypes = (Array.isArray(roomItem?.roomTypes)
        ? roomItem.roomTypes
        : []
      )
        .map((roomTypeItem) => {
          const roomTypeHotelId = normalizeText(roomTypeItem?.hotelId);
          const roomTypeMappedRoomId = normalizeIntegerOrNull(
            roomTypeItem?.mappedRoomId
          );
          const roomTypeId = normalizeText(roomTypeItem?.roomTypeId);
          const offerId = normalizeText(roomTypeItem?.offerId);
          const rateType = normalizeText(roomTypeItem?.rateType) || null;

          if (!roomTypeHotelId) {
            skipped.missingHotelId += 1;
            return null;
          }

          if (!Number.isFinite(roomTypeMappedRoomId)) {
            skipped.missingRoomTypeMappedRoomId += 1;
            return null;
          }

          if (!roomTypeId) {
            skipped.missingRoomTypeId += 1;
            return null;
          }

          if (!offerId) {
            skipped.missingOfferId += 1;
            return null;
          }

          if (
            !Array.isArray(roomTypeItem?.rates) ||
            !roomTypeItem.rates.length
          ) {
            skipped.missingRatesFromApi += 1;
            return null;
          }

          const rates = roomTypeItem.rates
            .map((rateItem) => {
              const rateMappedRoomId = normalizeIntegerOrNull(
                rateItem?.mappedRoomId
              );
              const rateId = normalizeText(rateItem?.rateId);
              const occupancyNumber = normalizePositiveIntegerOrNull(
                rateItem?.occupancyNumber
              );
              const retailRateTotalAmount = normalizeNumberOrNull(
                rateItem?.retailRate?.total?.[0]?.amount
              );
              const retailRateTotalCurrency = normalizeText(
                rateItem?.retailRate?.total?.[0]?.currency
              ).toUpperCase();

              if (!Number.isFinite(rateMappedRoomId)) {
                skipped.missingRateMappedRoomId += 1;
                return null;
              }

              if (!rateId) {
                skipped.missingRateId += 1;
                return null;
              }

              if (!Number.isFinite(occupancyNumber)) {
                skipped.missingOccupancyNumber += 1;
                return null;
              }

              if (!Number.isFinite(retailRateTotalAmount)) {
                skipped.missingCurrentPriceAmount += 1;
                return null;
              }

              if (!retailRateTotalCurrency) {
                skipped.missingCurrentPriceCurrency += 1;
                return null;
              }

              const retailRateSuggestedSellingPriceAmount = normalizeNumberOrNull(
                rateItem?.retailRate?.suggestedSellingPrice?.[0]?.amount
              );

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
                refundableTag.RFN += 1;
              } else if (cancellationPoliciesRefundableTag === "NRFN") {
                refundableTag.NRFN += 1;
              } else {
                refundableTag.other += 1;
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

              const currentPriceNoteText = currentPriceNoteTextItems.join(", ");

              const currentPriceText = formatPriceText({
                amount: currentPrice,
                currency: retailRateTotalCurrency
              });

              const beforeCurrentPriceText = Number.isFinite(beforeCurrentPrice)
                ? formatPriceText({
                    amount: beforeCurrentPrice,
                    currency:
                      normalizeText(
                        rateItem?.retailRate?.suggestedSellingPrice?.[0]
                          ?.currency
                      ).toUpperCase() || retailRateTotalCurrency
                  })
                : "";

              normalizedRatesCount += 1;

              return {
                hotelId: roomTypeHotelId,
                roomId,
                mappedRoomId: rateMappedRoomId,
                roomTypeId,
                offerId,
                rateId,

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
            skipped.missingRatesAfterFilter += 1;
            return null;
          }

          return {
            hotelId: roomTypeHotelId,
            roomId,
            mappedRoomId: roomTypeMappedRoomId,
            roomTypeId,
            offerId,
            rateType,
            rates
          };
        })
        .filter(Boolean);

      if (!roomTypes.length) {
        skipped.missingRoomTypes += 1;
        return null;
      }

      return {
        roomId,
        mappedRoomId,
        roomName: normalizeText(roomItem?.roomName),
        roomDescription: stripHtml(roomItem?.description),
        roomMainImage,
        roomImages: roomImageUrls,
        roomAmenities,
        roomViews,
        roomSizeText,
        roomBedTypesText,
        roomSleepsText,
        roomTypes
      };
    })
    .filter(Boolean);

  const allRates = rooms.flatMap((roomItem) =>
    Array.isArray(roomItem?.roomTypes)
      ? roomItem.roomTypes.flatMap((roomTypeItem) =>
          Array.isArray(roomTypeItem?.rates) ? roomTypeItem.rates : []
        )
      : []
  );

  if (!allRates.length) {
    console.warn("LITEAPI_HOTEL normalizeHotelMappedRoomRates empty result", {
      hotelId,
      normalizedHotelRoomsCount: rooms.length,
      skipped,
      refundableTag
    });

    throw new Error("Hotel mapped room rates must contain at least one valid rate.");
  }

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
  const hotelReviewText = [hotelRatingText, hotelReviewCountText]
    .filter(Boolean)
    .join(" • ");

  const normalizedHotelMappedRoomRates = {
    hotelId,
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
    skipped,
    refundableTag,
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
  const parsedValue = normalizeNumberOrNull(value);

  return Number.isInteger(parsedValue) ? parsedValue : null;
}

function normalizePositiveIntegerOrNull(value) {
  const parsedValue = normalizeIntegerOrNull(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
}
