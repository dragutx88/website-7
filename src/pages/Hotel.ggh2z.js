import wixLocationFrontend from "wix-location-frontend";
import wixWindowFrontend from "wix-window-frontend";
import { session } from "wix-storage-frontend";
import { getHotelMappedRoomRates } from "backend/liteApi.web";
import { handleRoomRateSelection } from "public/liteApiPrebookFlow";

const SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY =
  "searchFlowContextQueryStringify";

const ROOM_DETAILS_LIGHTBOX = "roomDetailsPopup";
const HOTEL_POLICIES_LIGHTBOX = "hotelPoliciesPopup";
const HOTEL_FACILITIES_LIGHTBOX = "hotelFacilitiesPopup";

const HOTEL_IMAGE_PLACEHOLDER_URL =
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80";

let searchFlowContextQuery = {};
let hotelPageState = null;

$w.onReady(async function () {
  const renderingEnv = wixWindowFrontend.rendering.env;

  if (renderingEnv !== "browser") {
    console.log("HOTEL PAGE skipped outside browser", { renderingEnv });
    return;
  }

  $w("#hotelRoomRatesRepeater").onItemReady(($item, itemData) => {
    bindHotelRoomRateItem($item, itemData);
  });

  await initializeHotelPage();
});

async function initializeHotelPage() {
  session.setItem(
    SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY,
    JSON.stringify({
      ...JSON.parse(
        session.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY) || "{}"
      ),
      ...wixLocationFrontend.query
    })
  );

  wixLocationFrontend.queryParams.add(
    JSON.parse(session.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY))
  );

  searchFlowContextQuery = {
    ...JSON.parse(
      session.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY) || "{}"
    ),
    ...wixLocationFrontend.query
  };

  console.log("HOTEL PAGE initialize searchFlowContextQuery", searchFlowContextQuery);

  try {
    hotelPageState = await getHotelMappedRoomRates(searchFlowContextQuery);

    const normalizedHotelMappedRoomRates =
      getNormalizedHotelMappedRoomRatesOrThrow();

    if (!Array.isArray(normalizedHotelMappedRoomRates.rooms)) {
      throw new Error("normalizedHotelMappedRoomRates.rooms must be an array.");
    }

    if (!normalizedHotelMappedRoomRates.rooms.length) {
      throw new Error("normalizedHotelMappedRoomRates.rooms must not be empty.");
    }

    console.log("HOTEL PAGE getHotelMappedRoomRates summary", {
      hasNormalizedHotelMappedRoomRates: Boolean(normalizedHotelMappedRoomRates),
      hotelRoomsCount: normalizedHotelMappedRoomRates.rooms.length,
      roomRatesCount: countRoomRates(normalizedHotelMappedRoomRates.rooms),
      hasMinCurrentPrice: Number.isFinite(
        normalizedHotelMappedRoomRates?.minCurrentPrice
      ),
      ratesExpiresInSeconds:
        normalizedHotelMappedRoomRates?.ratesExpiresInSeconds ?? null
    });

    bindHotelHero(normalizedHotelMappedRoomRates);
    bindHotelDescriptionSections(normalizedHotelMappedRoomRates);
    bindHotelPopupButtons(normalizedHotelMappedRoomRates);
    bindHotelRoomRatesRepeater(normalizedHotelMappedRoomRates.rooms);
  } catch (initializeHotelPageError) {
    console.error("HOTEL PAGE initialization failed", {
      name: initializeHotelPageError?.name,
      message: initializeHotelPageError?.message,
      stack: initializeHotelPageError?.stack
    });

    wixLocationFrontend.to(`/hotels?${new URLSearchParams({
      ...wixLocationFrontend.query,
      ...JSON.parse(
        session.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY) || "{}"
      )
    }).toString()}`);
  }
}

function getNormalizedHotelMappedRoomRatesOrThrow() {
  const normalizedHotelMappedRoomRates =
    hotelPageState?.normalizedHotelMappedRoomRates;

  if (
    !normalizedHotelMappedRoomRates ||
    typeof normalizedHotelMappedRoomRates !== "object"
  ) {
    throw new Error("normalizedHotelMappedRoomRates is required.");
  }

  return normalizedHotelMappedRoomRates;
}

function bindHotelHero(normalizedHotelMappedRoomRates) {
  const hotelMainImage =
    normalizeText(normalizedHotelMappedRoomRates?.hotelMainImage) ||
    HOTEL_IMAGE_PLACEHOLDER_URL;

  const hotelName =
    normalizeText(normalizedHotelMappedRoomRates?.hotelName) || "Hotel";
  $w("#hotelNameText").text = hotelName;
  $w("#hotelNameText").expand();

  $w("#hotelAddressText").text = normalizeText(
    normalizedHotelMappedRoomRates?.hotelAddress
  );
  $w("#hotelAddressText").expand();

  const hotelStarRating = normalizedHotelMappedRoomRates?.hotelStarRating;

  if (
    hotelStarRating !== null &&
    hotelStarRating !== undefined &&
    hotelStarRating !== ""
  ) {
    $w("#hotelStarRatingDisplay").rating = hotelStarRating;
    $w("#hotelStarRatingDisplay").expand();
  } else {
    $w("#hotelStarRatingDisplay").collapse();
  }

  const hotelRatingText = normalizeText(
    normalizedHotelMappedRoomRates?.hotelRatingText
  );

  if (hotelRatingText) {
    $w("#hotelRatingText").text = hotelRatingText;
    $w("#hotelRatingText").expand();
  } else {
    $w("#hotelRatingText").text = "";
    $w("#hotelRatingText").collapse();
  }

  const hotelReviewCountText = normalizeText(
    normalizedHotelMappedRoomRates?.hotelReviewCountText
  );

  if (hotelReviewCountText) {
    $w("#hotelReviewCountText").text = hotelReviewCountText;
    $w("#hotelReviewCountText").expand();
  } else {
    $w("#hotelReviewCountText").text = "";
    $w("#hotelReviewCountText").collapse();
  }

  bindMapElements(normalizedHotelMappedRoomRates?.hotelMapUrl);

  bindHeroGallery(
    Array.isArray(normalizedHotelMappedRoomRates?.hotelImageUrls) &&
      normalizedHotelMappedRoomRates.hotelImageUrls.length
      ? normalizedHotelMappedRoomRates.hotelImageUrls
      : [hotelMainImage]
  );

  const minCurrentPriceText = normalizeText(
    normalizedHotelMappedRoomRates?.minCurrentPriceText
  );

  if (minCurrentPriceText) {
    $w("#minCurrentPriceText").text = minCurrentPriceText;
    $w("#minCurrentPriceText").expand();

    $w("#minCurrentPricePrefixText").expand();
    $w("#minCurrentPricePerNightText").expand();
  } else {
    $w("#minCurrentPriceText").text = "";
    $w("#minCurrentPriceText").collapse();

    $w("#minCurrentPricePrefixText").collapse();
    $w("#minCurrentPricePerNightText").collapse();
  }
}

function bindHotelDescriptionSections(normalizedHotelMappedRoomRates) {
  const hotelDescription = normalizeText(
    normalizedHotelMappedRoomRates?.hotelDescription
  );

  if (hotelDescription) {
    $w("#hotelDescriptionText").text = hotelDescription;
    $w("#hotelDescriptionTitleText").expand();
    $w("#hotelDescriptionText").expand();
  } else {
    $w("#hotelDescriptionText").text = "";
    $w("#hotelDescriptionTitleText").collapse();
    $w("#hotelDescriptionText").collapse();
  }

  const hotelImportantInformation = normalizeText(
    normalizedHotelMappedRoomRates?.hotelImportantInformation
  );

  if (hotelImportantInformation) {
    $w("#hotelImportantInformationText").text = hotelImportantInformation;
    $w("#hotelImportantInformationTitleText").expand();
    $w("#hotelImportantInformationText").expand();
  } else {
    $w("#hotelImportantInformationText").text = "";
    $w("#hotelImportantInformationTitleText").collapse();
    $w("#hotelImportantInformationText").collapse();
  }

  const hotelCheckinCheckoutTimesText = buildHotelCheckinCheckoutTimesText(
    normalizedHotelMappedRoomRates?.hotelCheckinCheckoutTimes
  );

  if (hotelCheckinCheckoutTimesText) {
    $w("#hotelCheckinCheckoutTimesText").text = hotelCheckinCheckoutTimesText;
    $w("#hotelCheckinCheckoutTimesTitleText").expand();
    $w("#hotelCheckinCheckoutTimesText").expand();
  } else {
    $w("#hotelCheckinCheckoutTimesText").text = "";
    $w("#hotelCheckinCheckoutTimesTitleText").collapse();
    $w("#hotelCheckinCheckoutTimesText").collapse();
  }
}

function buildHotelCheckinCheckoutTimesText(hotelCheckinCheckoutTimes) {
  const checkinStart = normalizeText(hotelCheckinCheckoutTimes?.checkin_start);
  const checkinEnd = normalizeText(hotelCheckinCheckoutTimes?.checkin_end);
  const checkout = normalizeText(hotelCheckinCheckoutTimes?.checkout);

  const instructions = Array.isArray(hotelCheckinCheckoutTimes?.instructions)
    ? hotelCheckinCheckoutTimes.instructions
        .map((instruction) => normalizeText(instruction))
        .filter(Boolean)
    : [];

  const specialInstructions = normalizeText(
    hotelCheckinCheckoutTimes?.special_instructions
  );

  const lines = [];

  if (checkinStart) {
    lines.push(`Check-in starts: ${checkinStart}`);
  }

  if (checkinEnd) {
    lines.push(`Check-in ends: ${checkinEnd}`);
  }

  if (checkout) {
    lines.push(`Check-out: ${checkout}`);
  }

  if (instructions.length) {
    lines.push(`Instructions: ${instructions.join(" ")}`);
  }

  if (specialInstructions) {
    lines.push(`Special instructions: ${specialInstructions}`);
  }

  return lines.join("\n");
}

function bindHotelPopupButtons(normalizedHotelMappedRoomRates) {
  const hotelFacilities = Array.isArray(
    normalizedHotelMappedRoomRates?.hotelFacilities
  )
    ? normalizedHotelMappedRoomRates.hotelFacilities
    : [];

  if (hotelFacilities.length > 0) {
    $w("#hotelFacilitiesPopupButton").expand();
    $w("#hotelFacilitiesPopupButton").onClick(() => {
      wixWindowFrontend.openLightbox(HOTEL_FACILITIES_LIGHTBOX, {
        facilities: hotelFacilities
      });
    });
  } else {
    $w("#hotelFacilitiesPopupButton").collapse();
  }

  const hotelPolicies = Array.isArray(
    normalizedHotelMappedRoomRates?.hotelPolicies
  )
    ? normalizedHotelMappedRoomRates.hotelPolicies
    : [];

  if (hotelPolicies.length > 0) {
    $w("#hotelPoliciesPopupButton").expand();
    $w("#hotelPoliciesPopupButton").onClick(() => {
      wixWindowFrontend.openLightbox(HOTEL_POLICIES_LIGHTBOX, {
        policies: hotelPolicies
      });
    });
  } else {
    $w("#hotelPoliciesPopupButton").collapse();
  }
}

function bindHotelRoomRatesRepeater(hotelRooms) {
  const normalizedHotelMappedRoomRates =
    getNormalizedHotelMappedRoomRatesOrThrow();

  const hotelId = normalizeText(normalizedHotelMappedRoomRates?.hotelId);

  const hotelRoomRatesRepeaterData = (Array.isArray(hotelRooms)
    ? hotelRooms
    : []
  ).map((roomItem, roomIndex) => ({
    ...roomItem,
    _id: buildRepeaterId(
      `room-${roomItem?.mappedRoomId || roomItem?.roomId || roomIndex + 1}-${
        hotelId || "hotel"
      }`
    )
  }));

  $w("#hotelRoomRatesRepeater").data = hotelRoomRatesRepeaterData;
}

function bindHotelRoomRateItem($item, room) {
  const normalizedHotelMappedRoomRates =
    getNormalizedHotelMappedRoomRatesOrThrow();

  const roomRateSlots = buildRoomRateSlots(room);

  const roomName = normalizeText(room?.roomName) || "Room";

  const roomMainImage =
    normalizeText(room?.roomMainImage) ||
    normalizeText(normalizedHotelMappedRoomRates?.hotelMainImage) ||
    HOTEL_IMAGE_PLACEHOLDER_URL;

  $item("#roomMainImage").src = roomMainImage || HOTEL_IMAGE_PLACEHOLDER_URL;
  $item("#roomMainImage").expand();

  $item("#roomNameText").text = roomName;
  $item("#roomNameText").expand();

  const roomSizeText = normalizeText(room?.roomSizeText);

  if (roomSizeText) {
    $item("#roomSizeText").text = roomSizeText;
    $item("#roomSizeText").expand();
  } else {
    $item("#roomSizeText").text = "";
    $item("#roomSizeText").collapse();
  }

  const roomSleepsText = normalizeText(room?.roomSleepsText);

  if (roomSleepsText) {
    $item("#roomSleepsText").text = roomSleepsText;
    $item("#roomSleepsText").expand();
  } else {
    $item("#roomSleepsText").text = "";
    $item("#roomSleepsText").collapse();
  }

  const roomDescription = normalizeText(room?.roomDescription);

  if (roomDescription) {
    $item("#roomDescriptionText").text = roomDescription;
    $item("#roomDescriptionText").expand();
  } else {
    $item("#roomDescriptionText").text = "";
    $item("#roomDescriptionText").collapse();
  }

  const roomBedTypesText = normalizeText(room?.roomBedTypesText);

  if (roomBedTypesText) {
    $item("#roomBedTypesText").text = roomBedTypesText;
    $item("#roomBedTypesText").expand();
  } else {
    $item("#roomBedTypesText").text = "";
    $item("#roomBedTypesText").collapse();
  }

  bindRoomDetailsButton($item, room);

  for (let roomRateSlotIndex = 0; roomRateSlotIndex < 4; roomRateSlotIndex += 1) {
    bindRoomRateSlot(
      $item,
      roomRateSlotIndex + 1,
      roomRateSlots[roomRateSlotIndex] || null,
      room
    );
  }
}

function buildRoomRateSlots(room) {
  const roomTypes = Array.isArray(room?.roomTypes) ? room.roomTypes : [];

  return roomTypes.flatMap((roomType) =>
    (Array.isArray(roomType?.rates) ? roomType.rates : []).map((rate) => ({
      roomType,
      rate
    }))
  );
}

function bindRoomDetailsButton($item, room) {
  const roomDetailsPopupData = buildRoomDetailsPopupData(room);

  const shouldShowRoomDetailsButton =
    roomDetailsPopupData.roomName ||
    roomDetailsPopupData.description ||
    roomDetailsPopupData.sizeText ||
    roomDetailsPopupData.sleepsText ||
    roomDetailsPopupData.bedTypesText ||
    roomDetailsPopupData.amenities.length > 0 ||
    roomDetailsPopupData.images.length > 0;

  if (!shouldShowRoomDetailsButton) {
    $item("#roomDetailsButton").collapse();
    return;
  }

  $item("#roomDetailsButton").expand();

  $item("#roomDetailsButton").onClick(() => {
    wixWindowFrontend.openLightbox(ROOM_DETAILS_LIGHTBOX, roomDetailsPopupData);
  });
}

function buildRoomDetailsPopupData(room) {
  if (!room || typeof room !== "object") {
    return {
      roomName: "",
      description: "",
      sizeText: "",
      sleepsText: "",
      bedTypesText: "",
      amenities: [],
      images: []
    };
  }

  return {
    roomName: normalizeText(room?.roomName),
    description: normalizeText(room?.roomDescription),
    sizeText: normalizeText(room?.roomSizeText),
    sleepsText: normalizeText(room?.roomSleepsText),
    bedTypesText: normalizeText(room?.roomBedTypesText),
    amenities: Array.isArray(room?.roomAmenities) ? room.roomAmenities : [],
    images: Array.isArray(room?.roomImages)
      ? room.roomImages.filter(Boolean)
      : [normalizeText(room?.roomMainImage)].filter(Boolean)
  };
}

function bindRoomRateSlot($item, slotNumber, roomRateSlot, room) {
  const roomType =
    roomRateSlot?.roomType && typeof roomRateSlot.roomType === "object"
      ? roomRateSlot.roomType
      : null;

  const rate =
    roomRateSlot?.rate && typeof roomRateSlot.rate === "object"
      ? roomRateSlot.rate
      : null;

  const offerId = normalizeText(rate?.offerId);
  const mappedRoomId = normalizeText(rate?.mappedRoomId);
  const rateName = normalizeText(rate?.rateName);
  const rateBoardName = normalizeText(rate?.rateBoardName);
  const currentPrice = normalizeNumberOrNull(rate?.currentPrice);
  const currentPriceCurrency = normalizeText(rate?.currentPriceCurrency);
  const currentPriceText = normalizeText(rate?.currentPriceText);
  const beforeCurrentPriceText = normalizeText(rate?.beforeCurrentPriceText);
  const currentPriceNoteText = normalizeText(rate?.currentPriceNoteText);

  const isBindableRoomRate = Boolean(
    rate &&
      offerId &&
      mappedRoomId &&
      Number.isFinite(currentPrice) &&
      currentPriceCurrency &&
      currentPriceText
  );

  if (!isBindableRoomRate) {
    $item(`#roomRateRowSlot${slotNumber}`).collapse();
    return;
  }

  $item(`#roomRateRowSlot${slotNumber}`).expand();

  if (rateName) {
    $item(`#roomRateNameText${slotNumber}`).text = rateName;
    $item(`#roomRateNameText${slotNumber}`).expand();
  } else {
    $item(`#roomRateNameText${slotNumber}`).text = "";
    $item(`#roomRateNameText${slotNumber}`).collapse();
  }

  if (rateBoardName) {
    $item(`#roomRateBoardNameText${slotNumber}`).text = rateBoardName;
    $item(`#roomRateBoardNameText${slotNumber}`).expand();
  } else {
    $item(`#roomRateBoardNameText${slotNumber}`).text = "";
    $item(`#roomRateBoardNameText${slotNumber}`).collapse();
  }

  $item(`#currentPriceText${slotNumber}`).text = currentPriceText;
  $item(`#currentPriceText${slotNumber}`).expand();

  $item(`#currentPricePerNightText${slotNumber}`).expand();

  if (beforeCurrentPriceText) {
    $item(`#beforeCurrentPriceText${slotNumber}`).text = beforeCurrentPriceText;
    $item(`#beforeCurrentPriceText${slotNumber}`).expand();
  } else {
    $item(`#beforeCurrentPriceText${slotNumber}`).text = "";
    $item(`#beforeCurrentPriceText${slotNumber}`).collapse();
  }

  if (currentPriceNoteText) {
    $item(`#currentPriceNoteText${slotNumber}`).text = currentPriceNoteText;
    $item(`#currentPriceNoteText${slotNumber}`).expand();
  } else {
    $item(`#currentPriceNoteText${slotNumber}`).text = "";
    $item(`#currentPriceNoteText${slotNumber}`).collapse();
  }

  $item(`#roomRateSelectionButton${slotNumber}`).expand();

  $item(`#roomRateSelectionButton${slotNumber}`).onClick(async () => {
    try {
      const purchaseSelection = buildPurchaseSelection({
        room,
        roomType,
        rate
      });

      await handleRoomRateSelection(purchaseSelection);
    } catch (error) {
      console.error("HOTEL PAGE room rate selection failed", {
        name: error?.name,
        message: error?.message,
        stack: error?.stack
      });
    }
  });
}

function buildPurchaseSelection({ room, roomType, rate }) {
  const normalizedHotelMappedRoomRates =
    getNormalizedHotelMappedRoomRatesOrThrow();

  return {
    offerId: normalizeText(rate?.offerId),
    mappedRoomId: normalizeText(rate?.mappedRoomId),
    rateId: normalizeText(rate?.rateId),
    roomTypeId: normalizeText(rate?.roomTypeId || roomType?.roomTypeId),

    hotelId: normalizeText(normalizedHotelMappedRoomRates?.hotelId),
    hotelName: normalizeText(normalizedHotelMappedRoomRates?.hotelName),
    hotelAddress: normalizeText(normalizedHotelMappedRoomRates?.hotelAddress),
    hotelMainImage: normalizeText(normalizedHotelMappedRoomRates?.hotelMainImage),
    hotelStarRating: normalizedHotelMappedRoomRates?.hotelStarRating ?? null,
    hotelStarRatingText: normalizeText(
      normalizedHotelMappedRoomRates?.hotelStarRatingText
    ),
    hotelReviewText: normalizeText(
      normalizedHotelMappedRoomRates?.hotelReviewText
    ),

    roomId: normalizeText(room?.roomId),
    roomName: normalizeText(room?.roomName),
    roomImage: normalizeText(room?.roomMainImage),

    rateName: normalizeText(rate?.rateName),
    rateBoardName: normalizeText(rate?.rateBoardName),

    currentPrice: normalizeNumberOrNull(rate?.currentPrice),
    currentPriceCurrency: normalizeText(rate?.currentPriceCurrency),
    currentPriceText: normalizeText(rate?.currentPriceText),

    beforeCurrentPrice: normalizeNumberOrNull(rate?.beforeCurrentPrice),
    beforeCurrentPriceText: normalizeText(rate?.beforeCurrentPriceText),
    currentPriceNoteText: normalizeText(rate?.currentPriceNoteText)
  };
}

function bindMapElements(hotelMapUrl) {
  const normalizedHotelMapUrl = normalizeText(hotelMapUrl);

  if (normalizedHotelMapUrl) {
    $w("#hotelMapLinkIconButton").expand();
    $w("#hotelMapLinkIconText").expand();

    $w("#hotelMapLinkIconButton").onClick(() => {
      wixLocationFrontend.to(normalizedHotelMapUrl);
    });

    $w("#hotelMapLinkIconText").onClick(() => {
      wixLocationFrontend.to(normalizedHotelMapUrl);
    });

    return;
  }

  $w("#hotelMapLinkIconButton").collapse();
  $w("#hotelMapLinkIconText").collapse();
}

function bindHeroGallery(hotelImageUrls) {
  const hotelHeroGalleryItems = (Array.isArray(hotelImageUrls)
    ? hotelImageUrls
    : []
  )
    .map((imageUrl) => normalizeText(imageUrl))
    .filter(Boolean)
    .map((imageUrl, imageIndex) => ({
      type: "image",
      src: imageUrl,
      title: `Hotel image ${imageIndex + 1}`
    }));

  $w("#hotelHeroGallery").items = hotelHeroGalleryItems.length
    ? hotelHeroGalleryItems
    : [
        {
          type: "image",
          src: HOTEL_IMAGE_PLACEHOLDER_URL,
          title: "Hotel image"
        }
      ];

  $w("#hotelHeroGallery").expand();
}

function countRoomRates(hotelRooms) {
  return (Array.isArray(hotelRooms) ? hotelRooms : []).reduce(
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
  );
}

function buildRepeaterId(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeNumberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}
