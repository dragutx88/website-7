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

  const getHotelDetails = getHotelDetailsJson?.data;

  return {
    hotelId: getHotelDetailsRequest.hotelId,
    getHotelDetailsResponse: getHotelDetailsJson,
    normalizedHotelDetails: normalizeHotelDetails(getHotelDetails)
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
  const normalizedHotelId = getHotelDetailsRequest.hotelId;

  const getHotelDetailsResult =
    await getHotelDetailsHandler(searchFlowContextQuery);
  const getHotelMappedRoomRatesResult =
    await getHotelMappedRoomRatesHandler(searchFlowContextQuery);

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

function buildHotelDetailsRequest(searchFlowContextQuery) {
  const normalizedHotelId = normalizeText(searchFlowContextQuery?.hotelId);
  const normalizedLanguage =
    normalizeText(searchFlowContextQuery?.language).toLowerCase() ||
    DEFAULT_LANGUAGE;

  if (!normalizedHotelId) {
    throw new Error("hotelId is required.");
  }

  return {
    hotelId: normalizedHotelId,
    language: normalizedLanguage
  };
}

function buildHotelMappedRoomRatesRequest(searchFlowContextQuery) {
  const normalizedHotelId = normalizeText(searchFlowContextQuery?.hotelId);
  const normalizedCheckin = normalizeText(searchFlowContextQuery?.checkin);
  const normalizedCheckout = normalizeText(searchFlowContextQuery?.checkout);
  const normalizedCurrency =
    normalizeText(searchFlowContextQuery?.currency).toUpperCase() ||
    DEFAULT_CURRENCY;
  const normalizedLanguage =
    normalizeText(searchFlowContextQuery?.language).toLowerCase() ||
    DEFAULT_LANGUAGE;
  const normalizedGuestNationality =
    normalizedLanguage.toUpperCase() || DEFAULT_GUEST_NATIONALITY;

  if (!normalizedHotelId) {
    throw new Error("hotelId is required.");
  }

  if (!normalizedCheckin || !normalizedCheckout) {
    throw new Error("checkin and checkout are required.");
  }

  const getHotelMappedRoomRatesOccupancies =
    deriveOccupanciesFromSearchFlowContextQuery(searchFlowContextQuery);

  if (!getHotelMappedRoomRatesOccupancies.length) {
    throw new Error("occupancies is required.");
  }

  return {
    hotelIds: [normalizedHotelId],
    occupancies: getHotelMappedRoomRatesOccupancies,
    currency: normalizedCurrency,
    guestNationality: normalizedGuestNationality,
    language: normalizedLanguage,
    checkin: normalizedCheckin,
    checkout: normalizedCheckout,
    roomMapping: true,
    includeHotelData: true,
    margin: DEFAULT_MARGIN
  };
}

function deriveOccupanciesFromSearchFlowContextQuery(searchFlowContextQuery) {
  const normalizedRooms = normalizePositiveInteger(
    searchFlowContextQuery?.rooms,
    DEFAULT_ROOMS
  );

  const normalizedAdultsList = normalizeText(searchFlowContextQuery?.adults)
    .split(",")
    .map((normalizedAdultsItem) =>
      normalizePositiveInteger(normalizedAdultsItem, null)
    )
    .filter((normalizedAdultsItem) => Number.isFinite(normalizedAdultsItem));

  const normalizedChildrenByRoom = new Map();

  const normalizedChildrenList = normalizeText(searchFlowContextQuery?.children)
    .split(",")
    .map((normalizedChildrenItem) => normalizeText(normalizedChildrenItem))
    .filter(Boolean);

  for (const normalizedChildrenItem of normalizedChildrenList) {
    const [normalizedRoomNumberText, normalizedChildAgeText] =
      normalizedChildrenItem.split("_");

    const normalizedRoomNumber = normalizePositiveInteger(
      normalizedRoomNumberText,
      null
    );
    const normalizedChildAge = normalizeIntegerOrNull(normalizedChildAgeText);

    if (
      !Number.isFinite(normalizedRoomNumber) ||
      normalizedRoomNumber < 1 ||
      normalizedRoomNumber > normalizedRooms ||
      !Number.isFinite(normalizedChildAge)
    ) {
      continue;
    }

    if (!normalizedChildrenByRoom.has(normalizedRoomNumber)) {
      normalizedChildrenByRoom.set(normalizedRoomNumber, []);
    }

    normalizedChildrenByRoom.get(normalizedRoomNumber).push(normalizedChildAge);
  }

  const derivedOccupancies = [];

  for (
    let normalizedRoomNumber = 1;
    normalizedRoomNumber <= normalizedRooms;
    normalizedRoomNumber += 1
  ) {
    const normalizedAdults =
      Number.isFinite(normalizedAdultsList[normalizedRoomNumber - 1])
        ? normalizedAdultsList[normalizedRoomNumber - 1]
        : normalizedRoomNumber === 1
          ? DEFAULT_FIRST_ROOM_ADULTS
          : DEFAULT_EXTRA_ROOM_ADULTS;

    derivedOccupancies.push({
      adults: normalizePositiveInteger(
        normalizedAdults,
        DEFAULT_FIRST_ROOM_ADULTS
      ),
      children: normalizedChildrenByRoom.get(normalizedRoomNumber) || []
    });
  }

  return derivedOccupancies.filter(
    (derivedOccupancyItem) => derivedOccupancyItem.adults > 0
  );
}

function normalizeHotelDetails(getHotelDetails) {
  if (!getHotelDetails || typeof getHotelDetails !== "object") {
    return null;
  }

  const getHotelDetailsHotelImageList = Array.isArray(getHotelDetails?.hotelImages)
    ? getHotelDetails.hotelImages.filter(
        (getHotelDetailsHotelImageItem) =>
          getHotelDetailsHotelImageItem &&
          typeof getHotelDetailsHotelImageItem === "object"
      )
    : [];

  const getHotelDetailsDefaultHotelImage =
    getHotelDetailsHotelImageList.find(
      (getHotelDetailsHotelImageItem) =>
        getHotelDetailsHotelImageItem?.defaultImage === true
    ) || null;

  const hotelLocationLatitude = normalizeNumberOrNull(
    getHotelDetails?.location?.latitude
  );
  const hotelLocationLongitude = normalizeNumberOrNull(
    getHotelDetails?.location?.longitude
  );

  const hotelMapUrl =
    Number.isFinite(hotelLocationLatitude) && Number.isFinite(hotelLocationLongitude)
      ? `https://maps.google.com/?q=${hotelLocationLatitude},${hotelLocationLongitude}`
      : "";

  const hotelFacilitiesFromStructuredFacilities = Array.isArray(
    getHotelDetails?.facilities
  )
    ? getHotelDetails.facilities
        .map((getHotelDetailsFacilityItem) =>
          normalizeText(getHotelDetailsFacilityItem?.name)
        )
        .filter(Boolean)
    : [];

  const hotelFacilitiesFromLegacyHotelFacilities = Array.isArray(
    getHotelDetails?.hotelFacilities
  )
    ? getHotelDetails.hotelFacilities
        .map((getHotelDetailsLegacyHotelFacilityItem) =>
          normalizeText(getHotelDetailsLegacyHotelFacilityItem)
        )
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
        .map((getHotelDetailsPolicyItem) => ({
          name: normalizeText(getHotelDetailsPolicyItem?.name),
          description: stripHtml(getHotelDetailsPolicyItem?.description)
        }))
        .filter(
          (getHotelDetailsPolicyItem) =>
            getHotelDetailsPolicyItem.name || getHotelDetailsPolicyItem.description
        )
    : [];

  const hotelCheckinCheckoutTimes =
    getHotelDetails?.checkinCheckoutTimes &&
    typeof getHotelDetails.checkinCheckoutTimes === "object"
      ? {
          checkin_start: normalizeText(
            getHotelDetails.checkinCheckoutTimes?.checkin_start
          ),
          checkin_end: normalizeText(
            getHotelDetails.checkinCheckoutTimes?.checkin_end
          ),
          checkout: normalizeText(getHotelDetails.checkinCheckoutTimes?.checkout),
          instructions: Array.isArray(
            getHotelDetails.checkinCheckoutTimes?.instructions
          )
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

  const getHotelDetailsRoomList = Array.isArray(getHotelDetails?.rooms)
    ? getHotelDetails.rooms
    : [];

  const rooms = [];

  for (const getHotelDetailsRoomItem of getHotelDetailsRoomList) {
    if (!getHotelDetailsRoomItem || typeof getHotelDetailsRoomItem !== "object") {
      continue;
    }

    const getHotelDetailsRoomPhotoList = Array.isArray(getHotelDetailsRoomItem?.photos)
      ? getHotelDetailsRoomItem.photos.filter(
          (getHotelDetailsRoomPhotoItem) =>
            getHotelDetailsRoomPhotoItem &&
            typeof getHotelDetailsRoomPhotoItem === "object"
        )
      : [];

    const getHotelDetailsRoomMainPhoto =
      getHotelDetailsRoomPhotoList.find(
        (getHotelDetailsRoomPhotoItem) =>
          getHotelDetailsRoomPhotoItem?.mainPhoto === true
      ) || null;

    const roomImages = getHotelDetailsRoomPhotoList
      .map((getHotelDetailsRoomPhotoItem) =>
        normalizeText(getHotelDetailsRoomPhotoItem?.url)
      )
      .filter(Boolean);

    const roomMainImage =
      normalizeText(getHotelDetailsRoomMainPhoto?.url) ||
      normalizeText(getHotelDetailsRoomPhotoList?.[0]?.url);

    const getHotelDetailsRoomSizeSquare = normalizeNumberOrNull(
      getHotelDetailsRoomItem?.roomSizeSquare
    );
    const getHotelDetailsRoomSizeUnit = normalizeText(
      getHotelDetailsRoomItem?.roomSizeUnit
    );

    const roomSizeText =
      Number.isFinite(getHotelDetailsRoomSizeSquare) &&
      getHotelDetailsRoomSizeSquare > 0 &&
      getHotelDetailsRoomSizeUnit
        ? `${getHotelDetailsRoomSizeSquare} m2`
        : "";

    const getHotelDetailsRoomMaxOccupancy = normalizeIntegerOrNull(
      getHotelDetailsRoomItem?.maxOccupancy
    );

    const roomSleepsText =
      Number.isFinite(getHotelDetailsRoomMaxOccupancy) &&
      getHotelDetailsRoomMaxOccupancy > 0
        ? `Sleeps ${getHotelDetailsRoomMaxOccupancy}`
        : "";

    const roomBedTypesText = Array.isArray(getHotelDetailsRoomItem?.bedTypes)
      ? getHotelDetailsRoomItem.bedTypes
          .map((getHotelDetailsRoomBedTypeItem) => {
            const getHotelDetailsRoomBedTypeQuantity = normalizePositiveInteger(
              getHotelDetailsRoomBedTypeItem?.quantity,
              1
            );
            const getHotelDetailsRoomBedType = normalizeText(
              getHotelDetailsRoomBedTypeItem?.bedType
            );

            if (!getHotelDetailsRoomBedType) {
              return "";
            }

            return `${getHotelDetailsRoomBedTypeQuantity} ${getHotelDetailsRoomBedType}`;
          })
          .filter(Boolean)
          .join(" and ")
      : "";

    rooms.push({
      roomId: normalizeIntegerOrNull(getHotelDetailsRoomItem?.id),
      roomName: normalizeText(getHotelDetailsRoomItem?.roomName),
      roomDescription: stripHtml(getHotelDetailsRoomItem?.description),
      roomMainImage,
      roomImages,
      roomAmenities: Array.isArray(getHotelDetailsRoomItem?.roomAmenities)
        ? getHotelDetailsRoomItem.roomAmenities
        : [],
      roomSizeText,
      roomBedTypesText,
      roomSleepsText
    });
  }

  return {
    hotelId: normalizeText(getHotelDetails?.id) || null,
    hotelName: normalizeText(getHotelDetails?.name),
    hotelAddress: normalizeText(getHotelDetails?.address),
    hotelStarRating: normalizeNumberOrNull(getHotelDetails?.starRating),
    hotelRating: normalizeNumberOrNull(getHotelDetails?.rating),
    hotelReviewCount: normalizeIntegerOrNull(getHotelDetails?.reviewCount),
    hotelMainImage:
      normalizeText(getHotelDetails?.main_photo) ||
      normalizeText(getHotelDetailsDefaultHotelImage?.url) ||
      normalizeText(getHotelDetailsHotelImageList?.[0]?.url),
    hotelImages: getHotelDetailsHotelImageList,
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
      const getHotelMappedRoomRatesRoomTypeList = Array.isArray(
        getHotelMappedRoomRatesItem?.roomTypes
      )
        ? getHotelMappedRoomRatesItem.roomTypes
        : [];

      getHotelMappedRoomRatesRoomTypeList.forEach(
        (getHotelMappedRoomRatesRoomTypeItem, getHotelMappedRoomRatesRoomTypeIndex) => {
          const roomTypeId = normalizeIntegerOrNull(
            getHotelMappedRoomRatesRoomTypeItem?.roomTypeId
          );

          const offerId = normalizeText(getHotelMappedRoomRatesRoomTypeItem?.offerId);

          const getHotelMappedRoomRatesRateList = Array.isArray(
            getHotelMappedRoomRatesRoomTypeItem?.rates
          )
            ? getHotelMappedRoomRatesRoomTypeItem.rates
            : [];

          getHotelMappedRoomRatesRateList.forEach(
            (getHotelMappedRoomRatesRateItem, getHotelMappedRoomRatesRateIndex) => {
              const roomOfferMappedRoomId = normalizeIntegerOrNull(
                getHotelMappedRoomRatesRateItem?.mappedRoomId
              );

              const roomOfferId =
                normalizeText(getHotelMappedRoomRatesRateItem?.rateId) || null;

              const roomOfferName =
                normalizeText(getHotelMappedRoomRatesRateItem?.name) || null;

              const roomOfferBoardName = normalizeText(
                getHotelMappedRoomRatesRateItem?.boardName
              );

              const roomOfferOccupancyNumber = normalizePositiveInteger(
                getHotelMappedRoomRatesRateItem?.occupancyNumber,
                1
              );

              const roomOfferAdultCount = normalizeIntegerOrNull(
                getHotelMappedRoomRatesRateItem?.adultCount
              );

              const roomOfferChildCount = normalizeIntegerOrNull(
                getHotelMappedRoomRatesRateItem?.childCount
              );

              const roomOfferChildrenAges = Array.isArray(
                getHotelMappedRoomRatesRateItem?.childrenAges
              )
                ? getHotelMappedRoomRatesRateItem.childrenAges
                    .map((roomOfferChildAge) =>
                      normalizeIntegerOrNull(roomOfferChildAge)
                    )
                    .filter((roomOfferChildAge) =>
                      Number.isFinite(roomOfferChildAge)
                    )
                : [];

              const getHotelMappedRoomRatesRetailRate =
                getHotelMappedRoomRatesRateItem?.retailRate &&
                typeof getHotelMappedRoomRatesRateItem.retailRate === "object"
                  ? getHotelMappedRoomRatesRateItem.retailRate
                  : {};

              const getHotelMappedRoomRatesRetailRateTotalList = Array.isArray(
                getHotelMappedRoomRatesRetailRate?.total
              )
                ? getHotelMappedRoomRatesRetailRate.total
                : [];

              const getHotelMappedRoomRatesRetailRateTotalItem =
                getHotelMappedRoomRatesRetailRateTotalList[0] || null;

              const getHotelMappedRoomRatesSuggestedSellingPriceList = Array.isArray(
                getHotelMappedRoomRatesRetailRate?.suggestedSellingPrice
              )
                ? getHotelMappedRoomRatesRetailRate.suggestedSellingPrice
                : [];

              const getHotelMappedRoomRatesSuggestedSellingPriceItem =
                getHotelMappedRoomRatesSuggestedSellingPriceList[0] || null;

              const roomOfferCurrentPrice = normalizeNumberOrNull(
                getHotelMappedRoomRatesRetailRateTotalItem?.amount
              );

              const roomOfferCurrency = normalizeText(
                getHotelMappedRoomRatesRetailRateTotalItem?.currency
              );

              if (!Number.isFinite(roomOfferCurrentPrice) || !roomOfferCurrency) {
                return;
              }

              const roomOfferBeforeCurrentPrice = normalizeNumberOrNull(
                getHotelMappedRoomRatesSuggestedSellingPriceItem?.amount
              );

              const roomOfferRefundableTag =
                normalizeText(
                  getHotelMappedRoomRatesRateItem?.cancellationPolicies?.refundableTag
                ).toUpperCase() || null;

              let roomOfferRefundableTagText = "";

              if (roomOfferRefundableTag === "RFN") {
                roomOfferRefundableTagText = "Refundable";
              } else if (roomOfferRefundableTag === "NRFN") {
                roomOfferRefundableTagText = "Non-Refundable";
              } else if (roomOfferRefundableTag) {
                roomOfferRefundableTagText = roomOfferRefundableTag;
              }

              const getHotelMappedRoomRatesTaxesAndFeesList = Array.isArray(
                getHotelMappedRoomRatesRetailRate?.taxesAndFees
              )
                ? getHotelMappedRoomRatesRetailRate.taxesAndFees
                : [];

              const roomOfferHasExcludedTaxesAndFees =
                getHotelMappedRoomRatesTaxesAndFeesList.some(
                  (getHotelMappedRoomRatesTaxesAndFeesItem) =>
                    getHotelMappedRoomRatesTaxesAndFeesItem?.included === false
                );

              const roomOfferTaxesAndFeesText = roomOfferHasExcludedTaxesAndFees
                ? "excl."
                : "incl.";

              const roomOfferCurrentPriceNoteText = `${roomOfferNightCount} night, ${roomOfferOccupancyNumber} room, ${roomOfferTaxesAndFeesText} taxes & fees`;

              const normalizedHotelMappedRoomRatesKey = Number.isFinite(
                roomOfferMappedRoomId
              )
                ? String(roomOfferMappedRoomId)
                : `unmapped-${getHotelMappedRoomRatesItemIndex + 1}-${getHotelMappedRoomRatesRoomTypeIndex + 1}-${getHotelMappedRoomRatesRateIndex + 1}`;

              if (
                !normalizedHotelMappedRoomRatesMap.has(
                  normalizedHotelMappedRoomRatesKey
                )
              ) {
                normalizedHotelMappedRoomRatesMap.set(
                  normalizedHotelMappedRoomRatesKey,
                  {
                    mappedRoomId: Number.isFinite(roomOfferMappedRoomId)
                      ? roomOfferMappedRoomId
                      : null,
                    roomOffers: []
                  }
                );
              }

              normalizedHotelMappedRoomRatesMap
                .get(normalizedHotelMappedRoomRatesKey)
                .roomOffers.push({
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
                  roomOfferBeforeCurrentPrice: Number.isFinite(
                    roomOfferBeforeCurrentPrice
                  )
                    ? roomOfferBeforeCurrentPrice
                    : null,
                  roomOfferCurrency,
                  roomOfferRefundableTag,
                  roomOfferRefundableTagText,
                  roomOfferCurrentPriceNoteText,
                  offerId: offerId || null
                });
            }
          );
        }
      );
    }
  );

  return Array.from(normalizedHotelMappedRoomRatesMap.values())
    .map((normalizedHotelMappedRoomRatesItem) => ({
      mappedRoomId: normalizedHotelMappedRoomRatesItem.mappedRoomId,
      roomOffers: normalizedHotelMappedRoomRatesItem.roomOffers
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
    .sort(
      (
        leftNormalizedHotelMappedRoomRatesItem,
        rightNormalizedHotelMappedRoomRatesItem
      ) => {
        const leftRoomOfferCurrentPrice = normalizeNumberOrNull(
          leftNormalizedHotelMappedRoomRatesItem?.roomOffers?.[0]
            ?.roomOfferCurrentPrice
        );
        const rightRoomOfferCurrentPrice = normalizeNumberOrNull(
          rightNormalizedHotelMappedRoomRatesItem?.roomOffers?.[0]
            ?.roomOfferCurrentPrice
        );

        if (!Number.isFinite(leftRoomOfferCurrentPrice)) {
          return 1;
        }

        if (!Number.isFinite(rightRoomOfferCurrentPrice)) {
          return -1;
        }

        return leftRoomOfferCurrentPrice - rightRoomOfferCurrentPrice;
      }
    );
}

function normalizeHotelMappedRoomOffers({
  normalizedHotelDetails,
  normalizedHotelMappedRoomRates
}) {
  const normalizedHotelDetailsRoomsByRoomId = new Map();

  const normalizedHotelDetailsRoomList = Array.isArray(normalizedHotelDetails?.rooms)
    ? normalizedHotelDetails.rooms
    : [];

  normalizedHotelDetailsRoomList.forEach((normalizedHotelDetailsRoomItem) => {
    const normalizedHotelDetailsRoomId = normalizeIntegerOrNull(
      normalizedHotelDetailsRoomItem?.roomId
    );

    if (Number.isFinite(normalizedHotelDetailsRoomId)) {
      normalizedHotelDetailsRoomsByRoomId.set(
        String(normalizedHotelDetailsRoomId),
        normalizedHotelDetailsRoomItem
      );
    }
  });

  const normalizedHotelMappedRoomOffers = (
    Array.isArray(normalizedHotelMappedRoomRates)
      ? normalizedHotelMappedRoomRates
      : []
  ).map((normalizedHotelMappedRoomRatesItem) => {
    const normalizedHotelMappedRoomRatesMappedRoomId = normalizeIntegerOrNull(
      normalizedHotelMappedRoomRatesItem?.mappedRoomId
    );

    const normalizedHotelMappedRoomOffersRoom =
      Number.isFinite(normalizedHotelMappedRoomRatesMappedRoomId) &&
      normalizedHotelDetailsRoomsByRoomId.has(
        String(normalizedHotelMappedRoomRatesMappedRoomId)
      )
        ? normalizedHotelDetailsRoomsByRoomId.get(
            String(normalizedHotelMappedRoomRatesMappedRoomId)
          ) || null
        : null;

    return {
      mappedRoomId: Number.isFinite(normalizedHotelMappedRoomRatesMappedRoomId)
        ? normalizedHotelMappedRoomRatesMappedRoomId
        : null,
      room: normalizedHotelMappedRoomOffersRoom,
      roomOffers: Array.isArray(normalizedHotelMappedRoomRatesItem?.roomOffers)
        ? normalizedHotelMappedRoomRatesItem.roomOffers
        : []
    };
  });

  const normalizedHotelMappedRoomOffersAllRoomOffers =
    normalizedHotelMappedRoomOffers.flatMap((normalizedHotelMappedRoomOffersItem) =>
      Array.isArray(normalizedHotelMappedRoomOffersItem?.roomOffers)
        ? normalizedHotelMappedRoomOffersItem.roomOffers
        : []
    );

  const roomOfferCurrency =
    normalizeText(
      normalizedHotelMappedRoomOffersAllRoomOffers?.[0]?.roomOfferCurrency
    ) || null;

  const roomOffersMinCurrentPriceCandidates =
    normalizedHotelMappedRoomOffersAllRoomOffers
      .map((normalizedHotelMappedRoomOffersRoomOfferItem) =>
        normalizeNumberOrNull(
          normalizedHotelMappedRoomOffersRoomOfferItem?.roomOfferCurrentPrice
        )
      )
      .filter((roomOfferCurrentPrice) => Number.isFinite(roomOfferCurrentPrice));

  const roomOffersMinCurrentPrice = roomOffersMinCurrentPriceCandidates.length
    ? Math.min(...roomOffersMinCurrentPriceCandidates)
    : null;

  return {
    roomOffersMinCurrentPrice,
    roomOfferCurrency,
    mappedRoomOffers: normalizedHotelMappedRoomOffers
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
