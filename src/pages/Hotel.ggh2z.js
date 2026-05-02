import wixLocationFrontend from "wix-location-frontend";
import wixWindowFrontend from "wix-window-frontend";
import wixEcomFrontend from "wix-ecom-frontend";
import { currentCart } from "wix-ecom-backend";
import {
  createPrebookSession,
  getHotelMappedRoomOffers
} from "backend/liteApi.web";
import { importCatalogImages } from "backend/wix.web";

const ROOM_DETAILS_LIGHTBOX = "roomDetailsPopup";
const HOTEL_POLICIES_LIGHTBOX = "hotelPoliciesPopup";
const HOTEL_FACILITIES_LIGHTBOX = "hotelFacilitiesPopup";

const FALLBACK_IMAGE_URL =
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80";

const PURCHASE_FLOW_MODES = Object.freeze({
  WIX_CART: "wix_cart",
  PAYMENT_SDK: "payment_sdk"
});

const PURCHASE_FLOW_MODE = PURCHASE_FLOW_MODES.WIX_CART;

const LITEAPI_CATALOG_APP_ID = "e7f94f4b-7e6a-41c6-8ee1-52c1d5f31cf4";

const HOTEL_PAGE_PATH = "/hotel";
const CART_PAGE_PATH = "/cart-page";
const CHECKOUT_PAGE_PATH = "/checkout";

let searchFlowContextQuery = {};
let searchFlowContextUrl = "";
let hotelPageState = null;

$w.onReady(async function () {
  $w("#mappedRoomOffersRepeater").onItemReady(($item, itemData) => {
    bindMappedRoomOfferItem($item, itemData);
  });

  await initializeHotelPage();
});

async function initializeHotelPage() {
  searchFlowContextQuery = wixLocationFrontend.query || {};
  searchFlowContextUrl = buildSearchFlowContextUrl(searchFlowContextQuery);

  const resolvedHotelId = normalizeText(searchFlowContextQuery?.hotelId);

  if (!resolvedHotelId) {
    console.error("HOTEL PAGE missing hotelId.");
    $w("#hotelNameText").text = "Hotel";
    $w("#hotelNameText").expand();
    return;
  }

  try {
    hotelPageState = await getHotelMappedRoomOffers(searchFlowContextQuery);

    bindHotelHero(
      hotelPageState?.normalizedHotelDetails || null,
      hotelPageState?.normalizedHotelMappedRoomOffers || null
    );

    bindHotelDescriptionSections(hotelPageState?.normalizedHotelDetails || null);
    bindHotelPopupButtons(hotelPageState?.normalizedHotelDetails || null);

    bindMappedRoomOffersRepeater(
      hotelPageState?.normalizedHotelMappedRoomOffers?.mappedRoomOffers || []
    );
  } catch (error) {
    console.error("HOTEL PAGE initialization failed", error);

    $w("#hotelNameText").text = "Hotel";
    $w("#hotelNameText").expand();

    $w("#hotelAddressText").text = "";
    $w("#hotelAddressText").expand();
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
  const roomOfferId = normalizeText(roomOffer?.offerId);
  const roomOfferName = normalizeText(roomOffer?.roomOfferName);
  const roomOfferBoardName = normalizeText(roomOffer?.roomOfferBoardName);
  const roomOfferRefundableTagText = normalizeText(
    roomOffer?.roomOfferRefundableTagText
  );
  const currentPriceText = normalizeText(roomOffer?.currentPriceText);
  const beforeCurrentPriceText = normalizeText(roomOffer?.beforeCurrentPriceText);
  const currentPriceNoteText = normalizeText(roomOffer?.currentPriceNoteText);

  const isBindableRoomOffer = Boolean(
    roomOffer &&
      typeof roomOffer === "object" &&
      roomOfferId &&
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

  if (roomOfferRefundableTagText) {
    $item(`#roomOfferRefundableTagText${slotNumber}`).text =
      roomOfferRefundableTagText;
    $item(`#roomOfferRefundableTagText${slotNumber}`).expand();
  } else {
    $item(`#roomOfferRefundableTagText${slotNumber}`).text = "";
    $item(`#roomOfferRefundableTagText${slotNumber}`).collapse();
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
      console.error(
        "HOTEL PAGE offer selection failed",
        error,
        JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
      );
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
    roomOfferRefundableTag: normalizeText(roomOffer?.roomOfferRefundableTag),
    roomOfferRefundableTagText: normalizeText(
      roomOffer?.roomOfferRefundableTagText
    ),
    roomOfferCurrentPrice: normalizeNumberOrNull(
      roomOffer?.roomOfferCurrentPrice
    ),
    roomOfferBeforeCurrentPrice: normalizeNumberOrNull(
      roomOffer?.roomOfferBeforeCurrentPrice
    ),
    roomOfferCurrency: normalizeText(roomOffer?.roomOfferCurrency),
    roomOfferCurrentPriceText: normalizeText(
      roomOffer?.roomOfferCurrentPriceText
    ),
    roomOfferBeforeCurrentPriceText: normalizeText(
      roomOffer?.roomOfferBeforeCurrentPriceText
    ),
    roomOfferCurrentPriceNoteText: normalizeText(
      roomOffer?.roomOfferCurrentPriceNoteText
    )
  };
}

async function handleOfferSelection(purchaseSelection) {
  console.log(
    "HOTEL PAGE handleOfferSelection purchaseSelection",
    JSON.stringify(purchaseSelection, null, 2)
  );

  if (PURCHASE_FLOW_MODE === PURCHASE_FLOW_MODES.WIX_CART) {
    await handleWixCartFlow(purchaseSelection);
    return;
  }

  if (PURCHASE_FLOW_MODE === PURCHASE_FLOW_MODES.PAYMENT_SDK) {
    await handlePaymentSdkFlow(purchaseSelection);
    return;
  }

  throw new Error(`Unsupported PURCHASE_FLOW_MODE: ${PURCHASE_FLOW_MODE}`);
}

async function handleWixCartFlow(purchaseSelection) {
  const mappedRoomId = normalizeText(purchaseSelection?.mappedRoomId);
  const offerId = normalizeText(purchaseSelection?.offerId);
  const hotelId = normalizeText(purchaseSelection?.hotelId);

  console.log(
    "HOTEL PAGE handleWixCartFlow start",
    JSON.stringify(
      {
        mappedRoomId,
        offerId,
        hotelId,
        purchaseFlowMode: PURCHASE_FLOW_MODE,
        catalogAppId: LITEAPI_CATALOG_APP_ID
      },
      null,
      2
    )
  );

  if (!mappedRoomId) {
    throw new Error("mappedRoomId is required for Wix cart flow.");
  }

  if (!offerId) {
    throw new Error("offerId is required for Wix cart flow.");
  }

  await removePrebookItemsIfCartExists();

  const prebookResult = await createPrebookSession({
    offerId,
    usePaymentSdk: false
  });

  console.log(
    "HOTEL PAGE prebookResult",
    JSON.stringify(prebookResult, null, 2)
  );

  const prebookSnapshot = normalizeText(prebookResult?.prebookSnapshot);
  const normalizedPrebook =
    prebookResult?.normalizedPrebook &&
    typeof prebookResult.normalizedPrebook === "object"
      ? prebookResult.normalizedPrebook
      : null;

  if (!prebookSnapshot) {
    throw new Error("prebookSnapshot is required.");
  }

  if (!normalizedPrebook) {
    throw new Error("normalizedPrebook is required.");
  }

  const prebookId = normalizeText(normalizedPrebook?.prebookId);

  if (!prebookId) {
    throw new Error("normalizedPrebook.prebookId is required.");
  }

  const importedImageRefs = await resolveCatalogImageRefs({
    hotelId: purchaseSelection.hotelId,
    hotelName: purchaseSelection.hotelName,
    hotelMainImage: purchaseSelection.hotelMainImage,

    roomId: purchaseSelection.roomId,
    roomName: purchaseSelection.roomName,
    roomMainImage: purchaseSelection.roomImage
  });

  const prebookShell = buildPrebookShell({
    mappedRoomId,
    prebookSnapshot,
    normalizedPrebook,
    hotelName: purchaseSelection.hotelName,
    hotelMainImage: purchaseSelection.hotelMainImage,
    roomMainImage: purchaseSelection.roomImage,
    wixHotelMainImageRef: importedImageRefs.wixHotelMainImageRef,
    wixRoomMainImageRef: importedImageRefs.wixRoomMainImageRef,
    starRating: purchaseSelection.hotelStarRatingText,
    hotelReview: purchaseSelection.hotelReviewText,
    hotelAddress: purchaseSelection.hotelAddress
  });

  const lineItem = buildWixCatalogLineItem({
    mappedRoomId,
    prebookShell
  });

  console.log(
    "HOTEL PAGE lineItem before addToCurrentCart",
    JSON.stringify(lineItem, null, 2)
  );

  const addResult = await currentCart.addToCurrentCart({
    lineItems: [lineItem]
  });

  console.log(
    "HOTEL PAGE addToCurrentCart result",
    JSON.stringify(addResult, null, 2)
  );

  const cartAfterAdd = await currentCart.getCurrentCart();

  console.log(
    "HOTEL PAGE currentCart after add",
    JSON.stringify(cartAfterAdd, null, 2)
  );

  wixEcomFrontend.refreshCart();

  const redirectSearchFlowContextUrl = buildRedirectSearchFlowContextUrl(
    CART_PAGE_PATH,
    searchFlowContextQuery,
    {
      hotelId,
      prebookId,
      mode: PURCHASE_FLOW_MODES.WIX_CART
    }
  );

  wixLocationFrontend.to(redirectSearchFlowContextUrl);
}

async function handlePaymentSdkFlow(purchaseSelection) {
  const offerId = normalizeText(purchaseSelection?.offerId);
  const hotelId = normalizeText(purchaseSelection?.hotelId);

  console.log(
    "HOTEL PAGE handlePaymentSdkFlow start",
    JSON.stringify(
      {
        offerId,
        hotelId,
        purchaseFlowMode: PURCHASE_FLOW_MODE
      },
      null,
      2
    )
  );

  if (!offerId) {
    throw new Error("offerId is required for payment SDK flow.");
  }

  if (!hotelId) {
    throw new Error("hotelId is required for payment SDK flow.");
  }

  const prebookResult = await createPrebookSession({
    offerId,
    usePaymentSdk: true
  });

  console.log(
    "HOTEL PAGE payment SDK prebookResult",
    JSON.stringify(prebookResult, null, 2)
  );

  const normalizedPrebook =
    prebookResult?.normalizedPrebook &&
    typeof prebookResult.normalizedPrebook === "object"
      ? prebookResult.normalizedPrebook
      : null;

  if (!normalizedPrebook) {
    throw new Error("normalizedPrebook is required for payment SDK flow.");
  }

  const prebookId = normalizeText(normalizedPrebook?.prebookId);

  if (!prebookId) {
    throw new Error("normalizedPrebook.prebookId is required for payment SDK flow.");
  }

  const redirectSearchFlowContextUrl = buildRedirectSearchFlowContextUrl(
    CHECKOUT_PAGE_PATH,
    searchFlowContextQuery,
    {
      hotelId,
      prebookId,
      mode: PURCHASE_FLOW_MODES.PAYMENT_SDK
    }
  );

  wixLocationFrontend.to(redirectSearchFlowContextUrl);
}

async function removePrebookItemsIfCartExists() {
  let cart = null;

  try {
    cart = await currentCart.getCurrentCart();
  } catch (error) {
    if (isMissingCurrentCartError(error)) {
      return;
    }

    throw error;
  }

  const lineItems = Array.isArray(cart?.lineItems) ? cart.lineItems : [];

  if (!lineItems.length) {
    return;
  }

  const lineItemIdsToRemove = lineItems
    .map((lineItem) => {
      const shellOptions = getLineItemShellOptions(lineItem);
      const prebookId = normalizeText(shellOptions?.prebookId);
      const prebookSnapshot = normalizeText(shellOptions?.prebookSnapshot);

      if (!prebookId && !prebookSnapshot) {
        return "";
      }

      return normalizeText(
        lineItem?._id ||
          lineItem?.id ||
          lineItem?.lineItemId ||
          lineItem?._lineItemId
      );
    })
    .filter(Boolean);

  if (!lineItemIdsToRemove.length) {
    return;
  }

  console.log(
    "HOTEL PAGE removing existing prebook line items",
    JSON.stringify(lineItemIdsToRemove, null, 2)
  );

  await currentCart.removeLineItemsFromCurrentCart(lineItemIdsToRemove);
  wixEcomFrontend.refreshCart();
}

function isMissingCurrentCartError(error) {
  const status =
    Number(error?.status) ||
    Number(error?.statusCode) ||
    Number(error?.httpStatus);

  if (status === 404) {
    return true;
  }

  const code = normalizeText(
    error?.details?.applicationError?.code ||
      error?.applicationError?.code ||
      error?.code
  ).toUpperCase();

  if (code === "OWNED_CART_NOT_FOUND") {
    return true;
  }

  const message = normalizeText(error?.message).toLowerCase();

  return (
    message.includes("404") ||
    message.includes("cart not found") ||
    message.includes("no active current cart found") ||
    message.includes("owned_cart_not_found")
  );
}

function buildPrebookShell({
  mappedRoomId,
  prebookSnapshot,
  normalizedPrebook,
  hotelName,
  hotelMainImage,
  roomMainImage,
  wixHotelMainImageRef,
  wixRoomMainImageRef,
  starRating,
  hotelReview,
  hotelAddress
}) {
  return {
    mappedRoomId: normalizeText(mappedRoomId),
    prebookId: normalizeText(normalizedPrebook?.prebookId),
    prebookSnapshot: normalizeText(prebookSnapshot),

    hotelName: normalizeText(hotelName),
    hotelMainImage: normalizeText(hotelMainImage),
    roomMainImage: normalizeText(roomMainImage),
    wixHotelMainImageRef: normalizeText(wixHotelMainImageRef),
    wixRoomMainImageRef: normalizeText(wixRoomMainImageRef),
    starRating: normalizeText(starRating),
    hotelReview: normalizeText(hotelReview),
    hotelAddress: normalizeText(hotelAddress),

    checkInDate: normalizeText(normalizedPrebook?.checkInDate),
    checkOutDate: normalizeText(normalizedPrebook?.checkOutDate),
    rateName: normalizeText(normalizedPrebook?.rateName),
    boardName: normalizeText(normalizedPrebook?.boardName),
    adultCount: normalizedPrebook?.adultCount,
    childCount: normalizedPrebook?.childCount,
    childrenAges: Array.isArray(normalizedPrebook?.childrenAges)
      ? normalizedPrebook.childrenAges
      : [],
    occupancyNumber: normalizedPrebook?.occupancyNumber,
    refundableTag: normalizeText(normalizedPrebook?.refundableTag),
    currency: normalizeText(normalizedPrebook?.currency),
    currentPrice: normalizedPrebook?.currentPrice,
    beforeCurrentPrice:
      normalizedPrebook?.beforeCurrentPrice === undefined
        ? null
        : normalizedPrebook.beforeCurrentPrice
  };
}

function buildWixCatalogLineItem({ mappedRoomId, prebookShell }) {
  return {
    quantity: 1,
    catalogReference: {
      appId: LITEAPI_CATALOG_APP_ID,
      catalogItemId: normalizeText(mappedRoomId),
      options: prebookShell
    }
  };
}

function getLineItemShellOptions(lineItem) {
  const rawOptions = lineItem?.catalogReference?.options || {};

  return rawOptions && typeof rawOptions === "object" && !Array.isArray(rawOptions)
    ? rawOptions
    : {};
}

async function resolveCatalogImageRefs({
  hotelId,
  hotelName,
  hotelMainImage,
  roomId,
  roomName,
  roomMainImage
}) {
  const hasAnyImage = Boolean(
    normalizeText(hotelMainImage) || normalizeText(roomMainImage)
  );

  if (!hasAnyImage) {
    return {
      wixHotelMainImageRef: "",
      wixRoomMainImageRef: ""
    };
  }

  try {
    const result = await importCatalogImages({
      hotelId: normalizeText(hotelId),
      hotelName: normalizeText(hotelName),
      hotelMainImage: normalizeText(hotelMainImage),

      roomId: normalizeText(roomId),
      roomName: normalizeText(roomName),
      roomMainImage: normalizeText(roomMainImage)
    });

    return {
      wixHotelMainImageRef: normalizeText(result?.wixHotelMainImageRef),
      wixRoomMainImageRef: normalizeText(result?.wixRoomMainImageRef)
    };
  } catch (error) {
    console.error(
      "HOTEL PAGE importCatalogImages failed",
      error,
      JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
    );

    return {
      wixHotelMainImageRef: "",
      wixRoomMainImageRef: ""
    };
  }
}

function buildSearchFlowContextUrl(query = {}) {
  return buildRedirectSearchFlowContextUrl(HOTEL_PAGE_PATH, query, {});
}

function buildRedirectSearchFlowContextUrl(
  path,
  query = {},
  additionalSearchFlowContextQuery = {}
) {
  const params = new URLSearchParams();

  Object.entries({
    ...query,
    ...additionalSearchFlowContextQuery
  }).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    const text = String(value).trim();

    if (!text) {
      return;
    }

    params.set(key, text);
  });

  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
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
