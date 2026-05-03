import wixLocationFrontend from "wix-location-frontend";
import wixWindowFrontend from "wix-window-frontend";
import { session } from "wix-storage-frontend";
import { getHotelMappedRoomOffers } from "backend/liteApi.web";
import { handleOfferSelection } from "public/liteApiPrebookFlow";

const SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY =
  "searchFlowContextQueryStringify";

const ROOM_DETAILS_LIGHTBOX = "roomDetailsPopup";
const HOTEL_POLICIES_LIGHTBOX = "hotelPoliciesPopup";
const HOTEL_FACILITIES_LIGHTBOX = "hotelFacilitiesPopup";

const FALLBACK_IMAGE_URL =
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80";

let searchFlowContextQuery = {};
let hotelPageState = null;

$w.onReady(async function () {
  const renderingEnv = wixWindowFrontend.rendering.env;

  if (renderingEnv !== "browser") {
    console.log("HOTEL PAGE skipped outside browser", { renderingEnv });
    return;
  }

  $w("#mappedRoomOffersRepeater").onItemReady(($item, itemData) => {
    bindMappedRoomOfferItem($item, itemData);
  });

  await initializeHotelPage();
});

async function initializeHotelPage() {
  session.setItem(
    SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY,
    JSON.stringify({
      ...wixLocationFrontend.query,
      ...JSON.parse(
        session.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY) || "{}"
      ),
      language: "tr",
      currency: "TRY"
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
    hotelPageState = await getHotelMappedRoomOffers(searchFlowContextQuery);

    console.log("HOTEL PAGE getHotelMappedRoomOffers summary", {
      hasNormalizedHotelDetails: Boolean(hotelPageState?.normalizedHotelDetails),
      mappedRoomOffersCount: Array.isArray(
        hotelPageState?.normalizedHotelMappedRoomOffers?.mappedRoomOffers
      )
        ? hotelPageState.normalizedHotelMappedRoomOffers.mappedRoomOffers.length
        : 0,
      hasMinCurrentPrice: Number.isFinite(
        hotelPageState?.normalizedHotelMappedRoomOffers?.minCurrentPrice
      )
    });

    bindHotelHero(
      hotelPageState?.normalizedHotelDetails || null,
      hotelPageState?.normalizedHotelMappedRoomOffers || null
    );

    bindHotelDescriptionSections(hotelPageState?.normalizedHotelDetails || null);
    bindHotelPopupButtons(hotelPageState?.normalizedHotelDetails || null);

    bindMappedRoomOffersRepeater(
      hotelPageState?.normalizedHotelMappedRoomOffers?.mappedRoomOffers || []
    );
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
      ),
      language: "tr",
      currency: "TRY"
    })}`);
  }
}

function bindHotelHero(normalizedHotelDetails, normalizedHotelMappedRoomOffers) {
  const hotelMainImage =
    normalizeText(normalizedHotelDetails?.hotelMainImage) || FALLBACK_IMAGE_URL;

  const hotelName = normalizeText(normalizedHotelDetails?.hotelName) || "Hotel";
  $w("#hotelNameText").text = hotelName;
  $w("#hotelNameText").expand();

  $w("#hotelAddressText").text = normalizeText(
    normalizedHotelDetails?.hotelAddress
  );
  $w("#hotelAddressText").expand();

  const hotelStarRating = normalizedHotelDetails?.hotelStarRating;

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

  const hotelRatingText = normalizeText(normalizedHotelDetails?.hotelRatingText);

  if (hotelRatingText) {
    $w("#hotelRatingText").text = hotelRatingText;
    $w("#hotelRatingText").expand();
  } else {
    $w("#hotelRatingText").text = "";
    $w("#hotelRatingText").collapse();
  }

  const hotelReviewCountText = normalizeText(
    normalizedHotelDetails?.hotelReviewCountText
  );

  if (hotelReviewCountText) {
    $w("#hotelReviewCountText").text = hotelReviewCountText;
    $w("#hotelReviewCountText").expand();
  } else {
    $w("#hotelReviewCountText").text = "";
    $w("#hotelReviewCountText").collapse();
  }

  bindMapElements(normalizedHotelDetails?.hotelMapUrl);

  bindHeroGallery(
    Array.isArray(normalizedHotelDetails?.hotelImageUrls) &&
      normalizedHotelDetails.hotelImageUrls.length
      ? normalizedHotelDetails.hotelImageUrls
      : [hotelMainImage]
  );

  const minCurrentPriceText = normalizeText(
    normalizedHotelMappedRoomOffers?.minCurrentPriceText
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

function bindHotelDescriptionSections(normalizedHotelDetails) {
  const hotelDescription = normalizeText(
    normalizedHotelDetails?.hotelDescription
  );

  if (hotelDescription) {
    $w("#hotelDescriptionBodyText").text = hotelDescription;
    $w("#hotelDescriptionBodyText").expand();
  } else {
    $w("#hotelDescriptionBodyText").text = "";
    $w("#hotelDescriptionBodyText").collapse();
  }

  const hotelImportantInformation = normalizeText(
    normalizedHotelDetails?.hotelImportantInformation
  );

  if (hotelImportantInformation) {
    $w("#hotelImportantInformationBodyText").text = hotelImportantInformation;
    $w("#hotelImportantInformationBodyText").expand();
  } else {
    $w("#hotelImportantInformationBodyText").text = "";
    $w("#hotelImportantInformationBodyText").collapse();
  }
}

function bindHotelPopupButtons(normalizedHotelDetails) {
  const hotelFacilities = Array.isArray(normalizedHotelDetails?.hotelFacilities)
    ? normalizedHotelDetails.hotelFacilities
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

  const hotelPolicies = Array.isArray(normalizedHotelDetails?.hotelPolicies)
    ? normalizedHotelDetails.hotelPolicies
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

function bindMappedRoomOffersRepeater(mappedRoomOffers) {
  const hotelId = normalizeText(hotelPageState?.normalizedHotelDetails?.hotelId);

  const mappedRoomOffersRepeaterData = (Array.isArray(mappedRoomOffers)
    ? mappedRoomOffers
    : []
  ).map((mappedRoomOfferItem, mappedRoomOfferIndex) => ({
    ...mappedRoomOfferItem,
    _id: buildRepeaterId(`room-${mappedRoomOfferIndex + 1}-${hotelId || "hotel"}`)
  }));

  $w("#mappedRoomOffersRepeater").data = mappedRoomOffersRepeaterData;
}

function bindMappedRoomOfferItem($item, itemData) {
  const room =
    itemData?.room && typeof itemData.room === "object" ? itemData.room : null;

  const roomOffers = Array.isArray(itemData?.roomOffers)
    ? itemData.roomOffers
    : [];

  const roomName =
    normalizeText(room?.roomName) ||
    normalizeText(roomOffers?.[0]?.roomOfferName) ||
    "Room";

  const roomMainImage =
    normalizeText(room?.roomMainImage) ||
    normalizeText(hotelPageState?.normalizedHotelDetails?.hotelMainImage) ||
    FALLBACK_IMAGE_URL;

  $item("#roomMainImage").src = roomMainImage || FALLBACK_IMAGE_URL;
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

  for (let roomOfferSlotIndex = 0; roomOfferSlotIndex < 4; roomOfferSlotIndex += 1) {
    bindRoomOfferSlot(
      $item,
      roomOfferSlotIndex + 1,
      roomOffers[roomOfferSlotIndex] || null,
      itemData,
      room
    );
  }
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

function bindRoomOfferSlot($item, slotNumber, roomOffer, mappedRoomOfferItem, room) {
  const offerId = normalizeText(roomOffer?.offerId);
  const roomOfferName = normalizeText(roomOffer?.roomOfferName);
  const roomOfferBoardName = normalizeText(roomOffer?.roomOfferBoardName);
  const currentPriceText = normalizeText(roomOffer?.currentPriceText);
  const beforeCurrentPriceText = normalizeText(roomOffer?.beforeCurrentPriceText);
  const currentPriceNoteText = normalizeText(roomOffer?.currentPriceNoteText);

  const isBindableRoomOffer = Boolean(
    roomOffer &&
      typeof roomOffer === "object" &&
      offerId &&
      currentPriceText
  );

  if (!isBindableRoomOffer) {
    if (slotNumber === 1) {
      $item("#roomOfferRowSlot1").collapse();
      return;
    }

    if (slotNumber === 2) {
      $item("#roomOfferRowSlot2").collapse();
      return;
    }

    if (slotNumber === 3) {
      $item("#roomOfferRowSlot3").collapse();
      return;
    }

    if (slotNumber === 4) {
      $item("#roomOfferRowSlot4").collapse();
      return;
    }

    return;
  }

  if (slotNumber === 1) {
    $item("#roomOfferRowSlot1").expand();
  }

  if (slotNumber === 2) {
    $item("#roomOfferRowSlot2").expand();
  }

  if (slotNumber === 3) {
    $item("#roomOfferRowSlot3").expand();
  }

  if (slotNumber === 4) {
    $item("#roomOfferRowSlot4").expand();
  }

  if (roomOfferName) {
    $item(`#roomOfferNameText${slotNumber}`).text = roomOfferName;
    $item(`#roomOfferNameText${slotNumber}`).expand();
  } else {
    $item(`#roomOfferNameText${slotNumber}`).text = "";
    $item(`#roomOfferNameText${slotNumber}`).collapse();
  }

  if (roomOfferBoardName) {
    $item(`#roomOfferBoardNameText${slotNumber}`).text = roomOfferBoardName;
    $item(`#roomOfferBoardNameText${slotNumber}`).expand();
  } else {
    $item(`#roomOfferBoardNameText${slotNumber}`).text = "";
    $item(`#roomOfferBoardNameText${slotNumber}`).collapse();
  }

  $item(`#currentPriceText${slotNumber}`).text = currentPriceText;
  $item(`#currentPriceText${slotNumber}`).expand();

  $item(`#roomOfferPerNightText${slotNumber}`).expand();

  if (beforeCurrentPriceText) {
    $item(`#beforeCurrentPriceText${slotNumber}`).text =
      beforeCurrentPriceText;
    $item(`#beforeCurrentPriceText${slotNumber}`).expand();
  } else {
    $item(`#beforeCurrentPriceText${slotNumber}`).text = "";
    $item(`#beforeCurrentPriceText${slotNumber}`).collapse();
  }

  if (currentPriceNoteText) {
    $item(`#currentPriceNoteText${slotNumber}`).text =
      currentPriceNoteText;
    $item(`#currentPriceNoteText${slotNumber}`).expand();
  } else {
    $item(`#currentPriceNoteText${slotNumber}`).text = "";
    $item(`#currentPriceNoteText${slotNumber}`).collapse();
  }

  $item(`#roomOfferSelectionButton${slotNumber}`).expand();

  $item(`#roomOfferSelectionButton${slotNumber}`).onClick(async () => {
    try {
      const purchaseSelection = buildPurchaseSelection({
        mappedRoomOfferItem,
        room,
        roomOffer
      });

      await handleOfferSelection(purchaseSelection);
    } catch (error) {
      console.error("HOTEL PAGE offer selection failed", {
        name: error?.name,
        message: error?.message,
        stack: error?.stack
      });
    }
  });
}

function buildPurchaseSelection({ mappedRoomOfferItem, room, roomOffer }) {
  return {
    offerId: normalizeText(roomOffer?.offerId),
    mappedRoomId: normalizeText(mappedRoomOfferItem?.mappedRoomId),

    hotelId: normalizeText(hotelPageState?.normalizedHotelDetails?.hotelId),
    hotelName: normalizeText(hotelPageState?.normalizedHotelDetails?.hotelName),
    hotelAddress: normalizeText(
      hotelPageState?.normalizedHotelDetails?.hotelAddress
    ),
    hotelMainImage: normalizeText(
      hotelPageState?.normalizedHotelDetails?.hotelMainImage
    ),
    hotelStarRating:
      hotelPageState?.normalizedHotelDetails?.hotelStarRating ?? null,
    hotelStarRatingText: normalizeText(
      hotelPageState?.normalizedHotelDetails?.hotelStarRatingText
    ),
    hotelReviewText: normalizeText(
      hotelPageState?.normalizedHotelDetails?.hotelReviewText
    ),

    roomId: normalizeText(room?.roomId),
    roomName: normalizeText(room?.roomName),
    roomImage: normalizeText(room?.roomMainImage),

    roomOfferName: normalizeText(roomOffer?.roomOfferName),
    roomOfferBoardName: normalizeText(roomOffer?.roomOfferBoardName),
    currentPrice: normalizeNumberOrNull(roomOffer?.currentPrice),
    beforeCurrentPrice: normalizeNumberOrNull(roomOffer?.beforeCurrentPrice),
    roomOfferCurrency: normalizeText(roomOffer?.roomOfferCurrency),
    currentPriceText: normalizeText(roomOffer?.currentPriceText),
    beforeCurrentPriceText: normalizeText(roomOffer?.beforeCurrentPriceText),
    currentPriceNoteText: normalizeText(roomOffer?.currentPriceNoteText)
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
          src: FALLBACK_IMAGE_URL,
          title: "Hotel image"
        }
      ];

  $w("#hotelHeroGallery").expand();
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
