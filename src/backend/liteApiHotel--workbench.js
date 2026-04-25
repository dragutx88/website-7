import { buildLiteApiError, liteApiRequest, parseJson } from "./liteApiClient";

const LITE_API_BASE_URL = "https://api.liteapi.travel/v3.0";
const DEFAULT_CURRENCY = "TRY";
const DEFAULT_GUEST_NATIONALITY = "TR";
const DEFAULT_LANGUAGE = "tr";
const DEFAULT_MARGIN = 0;
const DEFAULT_ROOMS = 1;
const DEFAULT_FIRST_ROOM_ADULTS = 2;
const DEFAULT_EXTRA_ROOM_ADULTS = 1;

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

  return {
    hotelId: getHotelDetailsRequest.hotelId,
    getHotelDetailsResponse: getHotelDetailsJson,
    normalizedHotelDetails: normalizeHotelDetails(getHotelDetailsJson?.data)
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

  const getHotelMappedRoomRates = Array.isArray(getHotelMappedRoomRatesJson?.data)
    ? getHotelMappedRoomRatesJson.data
    : [];

  return {
    hotelId: getHotelMappedRoomRatesRequest.hotelIds[0],
    getHotelMappedRoomRatesResponse: getHotelMappedRoomRatesJson,
    normalizedHotelMappedRoomRates: normalizeHotelMappedRoomRates({
      getHotelMappedRoomRates,
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

  return {
    hotelId: getHotelDetailsRequest.hotelId,
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

  if (!hotelId) {
    throw new Error("hotelId is required.");
  }

  if (!checkin || !checkout) {
    throw new Error("checkin and checkout are required.");
  }

  const occupancies = deriveOccupanciesFromSearchFlowContextQuery(
    searchFlowContextQuery
  );

  if (!occupancies.length) {
    throw new Error("occupancies is required.");
  }

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
  const rooms = normalizePositiveInteger(
    searchFlowContextQuery?.rooms,
    DEFAULT_ROOMS
  );

  const adultsList = normalizeText(searchFlowContextQuery?.adults)
    .split(",")
    .map((adultsItem) => normalizePositiveInteger(adultsItem, null))
    .filter((adultsItem) => Number.isFinite(adultsItem));

  const childrenByRoom = new Map();

  const childrenTokens = normalizeText(searchFlowContextQuery?.children)
    .split(",")
    .map((childrenItem) => normalizeText(childrenItem))
    .filter(Boolean);

  for (const childrenToken of childrenTokens) {
    const [roomNumberText, childAgeText] = childrenToken.split("_");

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

  return occupancies.filter((occupancyItem) => occupancyItem.adults > 0);
}

function normalizeHotelDetails(getHotelDetails) {
  if (!getHotelDetails || typeof getHotelDetails !== "object") {
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
                  const quantity = normalizePositiveInteger(
                    bedTypeItem?.quantity,
                    1
                  );
                  const bedType = normalizeText(bedTypeItem?.bedType);

                  if (!bedType) {
                    return "";
                  }

                  return `${quantity} ${bedType}`;
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
  const checkinDate = new Date(checkin);
  const checkoutDate = new Date(checkout);

  const roomOfferNightCount =
    !Number.isNaN(checkinDate.getTime()) && !Number.isNaN(checkoutDate.getTime())
      ? Math.max(
          1,
          Math.round(
            (checkoutDate.getTime() - checkinDate.getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : 1;

  const normalizedHotelMappedRoomRatesMap = new Map();

  getHotelMappedRoomRates.forEach(
    (getHotelMappedRoomRatesItem, getHotelMappedRoomRatesItemIndex) => {
      const roomTypes = Array.isArray(getHotelMappedRoomRatesItem?.roomTypes)
        ? getHotelMappedRoomRatesItem.roomTypes
        : [];

      roomTypes.forEach((roomTypeItem, roomTypeIndex) => {
        const roomTypeId = normalizeIntegerOrNull(roomTypeItem?.roomTypeId);
        const offerId = normalizeText(roomTypeItem?.offerId);

        const rates = Array.isArray(roomTypeItem?.rates) ? roomTypeItem.rates : [];

        rates.forEach((rateItem, rateIndex) => {
          const roomOfferMappedRoomId = normalizeIntegerOrNull(
            rateItem?.mappedRoomId
          );
          const roomOfferId = normalizeText(rateItem?.rateId) || null;
          const roomOfferName = normalizeText(rateItem?.name) || null;
          const roomOfferBoardName = normalizeText(rateItem?.boardName);
          const roomOfferOccupancyNumber = normalizePositiveInteger(
            rateItem?.occupancyNumber,
            1
          );
          const roomOfferAdultCount = normalizeIntegerOrNull(rateItem?.adultCount);
          const roomOfferChildCount = normalizeIntegerOrNull(rateItem?.childCount);
          const roomOfferChildrenAges = Array.isArray(rateItem?.childrenAges)
            ? rateItem.childrenAges
                .map((childAge) => normalizeIntegerOrNull(childAge))
                .filter((childAge) => Number.isFinite(childAge))
            : [];

          const roomOfferCurrentPrice = normalizeNumberOrNull(
            rateItem?.retailRate?.total?.[0]?.amount
          );
          const roomOfferCurrency = normalizeText(
            rateItem?.retailRate?.total?.[0]?.currency
          );
          const roomOfferBeforeCurrentPrice = normalizeNumberOrNull(
            rateItem?.retailRate?.suggestedSellingPrice?.[0]?.amount
          );

          if (!Number.isFinite(roomOfferCurrentPrice) || !roomOfferCurrency) {
            return;
          }

          const roomOfferRefundableTag =
            normalizeText(
              rateItem?.cancellationPolicies?.refundableTag
            ).toUpperCase() || null;

          let roomOfferRefundableTagText = "";

          if (roomOfferRefundableTag === "RFN") {
            roomOfferRefundableTagText = "Refundable";
          } else if (roomOfferRefundableTag === "NRFN") {
            roomOfferRefundableTagText = "Non-Refundable";
          } else if (roomOfferRefundableTag) {
            roomOfferRefundableTagText = roomOfferRefundableTag;
          }

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

          const normalizedHotelMappedRoomRatesKey = Number.isFinite(
            roomOfferMappedRoomId
          )
            ? String(roomOfferMappedRoomId)
            : `unmapped-${getHotelMappedRoomRatesItemIndex + 1}-${roomTypeIndex + 1}-${rateIndex + 1}`;

          if (!normalizedHotelMappedRoomRatesMap.has(normalizedHotelMappedRoomRatesKey)) {
            normalizedHotelMappedRoomRatesMap.set(normalizedHotelMappedRoomRatesKey, {
              mappedRoomId: Number.isFinite(roomOfferMappedRoomId)
                ? roomOfferMappedRoomId
                : null,
              roomOffers: []
            });
          }

          normalizedHotelMappedRoomRatesMap.get(
            normalizedHotelMappedRoomRatesKey
          ).roomOffers.push({
            roomTypeId: Number.isFinite(roomTypeId) ? roomTypeId : null,
            roomOfferId,
            roomOfferName,
            roomOfferMappedRoomId: Number.isFinite(roomOfferMappedRoomId)
              ? roomOfferMappedRoomId
              : null,
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
            offerId: offerId || null
          });
        });
      });
    }
  );

  return Array.from(normalizedHotelMappedRoomRatesMap.values())
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

  return {
    roomOffersMinCurrentPrice,
    roomOffersMinCurrentPriceText,
    roomOfferCurrency,
    mappedRoomOffers
  };
}

function formatPriceText({ amount, currency }) {
  const numericAmount = Number(amount);
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
  } catch (error) {
    const fixedAmount = numericAmount.toFixed(2);

    if (normalizedCurrency === "TRY") {
      const [wholePart, fractionPart] = fixedAmount.split(".");
      return `₺${Number(wholePart).toLocaleString("tr-TR")},${fractionPart}`;
    }

    return `${normalizedCurrency} ${fixedAmount}`;
  }
}

function formatReviewCountText(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "";
  }

  return `${numericValue} reviews`;
}

function formatGuestRatingText(value) {
  const numericValue = Number(value);

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
  const numericValue = Number(value);

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

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeNumberOrNull(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function normalizeIntegerOrNull(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? Math.trunc(parsedValue) : null;
}

function normalizePositiveInteger(value, fallbackValue) {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallbackValue;
  }

  return Math.trunc(parsedValue);
}
