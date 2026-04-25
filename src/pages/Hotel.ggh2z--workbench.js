import wixLocationFrontend from "wix-location-frontend";
import wixWindowFrontend from "wix-window-frontend";
import wixEcomFrontend from "wix-ecom-frontend";
import { session } from "wix-storage-frontend";
import { currentCart } from "wix-ecom-backend";
import {
  createPrebookSession,
  getHotelMappedRoomOffers
} from "backend/liteApi.web";
import { importCatalogImages } from "backend/wix.web";
import {
  buildCheckoutPageUrl,
  persistSelectedOfferPayload
} from "public/liteApiFlow";

const ROOM_DETAILS_LIGHTBOX = "roomDetailsPopup";
const HOTEL_POLICIES_LIGHTBOX = "hotelPoliciesPopup";
const HOTEL_FACILITIES_LIGHTBOX = "hotelFacilitiesPopup";

const FALLBACK_IMAGE_URL =
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80";

const PURCHASE_FLOW_MODES = Object.freeze({
  WIX_CART: "wix_cart",
  LITEAPI_DIRECT: "liteapi_direct"
});

const PURCHASE_FLOW_MODE = PURCHASE_FLOW_MODES.WIX_CART;

const LITEAPI_CATALOG_APP_ID = "e7f94f4b-7e6a-41c6-8ee1-52c1d5f31cf4";
const CART_PAGE_PATH = "/cart-page";
const CART_RETURN_URL_STORAGE_KEY = "liteapi.cartReturnUrl.v1";
const RETURN_SEARCH_FLOW_CONTEXT_URL_STORAGE_KEY = "returnSearchFlowContextUrl";

let searchFlowContextQuery = {};
let currentSearchFlowContextUrl = "";
let hotelPageState = null;

$w.onReady(async function () {
  $w("#mappedRoomOffersRepeater").onItemReady(($item, itemData) => {
    bindMappedRoomOfferItem($item, itemData);
  });

  await initializeHotelPage();
});

async function initializeHotelPage() {
  searchFlowContextQuery = wixLocationFrontend.query || {};
  currentSearchFlowContextUrl = buildCurrentSearchFlowContextUrl(
    searchFlowContextQuery
  );

  session.setItem(
    RETURN_SEARCH_FLOW_CONTEXT_URL_STORAGE_KEY,
    currentSearchFlowContextUrl
  );

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

  const roomOffersMinCurrentPriceText = normalizeText(
    normalizedHotelMappedRoomOffers?.roomOffersMinCurrentPriceText
  );

  if (roomOffersMinCurrentPriceText) {
    $w("#roomOffersMinCurrentPriceText").text = roomOffersMinCurrentPriceText;
    $w("#roomOffersMinCurrentPriceText").expand();

    $w("#roomOffersMinCurrentPricePrefixText").expand();
    $w("#roomOffersMinCurrentPricePerNightText").expand();
  } else {
    $w("#roomOffersMinCurrentPriceText").text = "";
    $w("#roomOffersMinCurrentPriceText").collapse();

    $w("#roomOffersMinCurrentPricePrefixText").collapse();
    $w("#roomOffersMinCurrentPricePerNightText").collapse();
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
  const roomOfferCurrentPriceText = normalizeText(
    roomOffer?.roomOfferCurrentPriceText
  );
  const roomOfferBeforeCurrentPriceText = normalizeText(
    roomOffer?.roomOfferBeforeCurrentPriceText
  );
  const roomOfferCurrentPriceNoteText = normalizeText(
    roomOffer?.roomOfferCurrentPriceNoteText
  );

  const isBindableRoomOffer = Boolean(
    roomOffer &&
      typeof roomOffer === "object" &&
      roomOfferId &&
      roomOfferCurrentPriceText
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

  $item(`#roomOfferCurrentPriceText${slotNumber}`).text =
    roomOfferCurrentPriceText;
  $item(`#roomOfferCurrentPriceText${slotNumber}`).expand();

  $item(`#roomOfferPerNightText${slotNumber}`).expand();

  if (roomOfferBeforeCurrentPriceText) {
    $item(`#roomOfferBeforeCurrentPriceText${slotNumber}`).text =
      roomOfferBeforeCurrentPriceText;
    $item(`#roomOfferBeforeCurrentPriceText${slotNumber}`).expand();
  } else {
    $item(`#roomOfferBeforeCurrentPriceText${slotNumber}`).text = "";
    $item(`#roomOfferBeforeCurrentPriceText${slotNumber}`).collapse();
  }

  if (roomOfferCurrentPriceNoteText) {
    $item(`#roomOfferCurrentPriceNoteText${slotNumber}`).text =
      roomOfferCurrentPriceNoteText;
    $item(`#roomOfferCurrentPriceNoteText${slotNumber}`).expand();
  } else {
    $item(`#roomOfferCurrentPriceNoteText${slotNumber}`).text = "";
    $item(`#roomOfferCurrentPriceNoteText${slotNumber}`).collapse();
  }

  $item(`#roomOfferSelectionButton${slotNumber}`).expand();

  $item(`#roomOfferSelectionButton${slotNumber}`).onClick(async () => {
    try {
      await handleOfferSelection({
        hotelId: normalizeText(hotelPageState?.normalizedHotelDetails?.hotelId),
        hotelName: normalizeText(hotelPageState?.normalizedHotelDetails?.hotelName),
        hotelAddress: normalizeText(
          hotelPageState?.normalizedHotelDetails?.hotelAddress
        ),
        hotelMainPhoto: normalizeText(
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
        mappedRoomId: normalizeText(mappedRoomOfferItem?.mappedRoomId),
        roomName: normalizeText(room?.roomName),
        roomImage: normalizeText(room?.roomMainImage),
        roomDetailsPopupData: buildRoomDetailsPopupData(room),
        offer: buildSelectedOfferOffer(roomOffer),
        ctx: searchFlowContextQuery
      });
    } catch (error) {
      console.error(
        "HOTEL PAGE offer selection failed",
        error,
        JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
      );
    }
  });
}

function buildSelectedOfferOffer(roomOffer) {
  const roomOfferCurrentPriceAmount = normalizeNumberOrNull(
    roomOffer?.roomOfferCurrentPrice
  );
  const roomOfferBeforeCurrentPriceAmount = normalizeNumberOrNull(
    roomOffer?.roomOfferBeforeCurrentPrice
  );
  const roomOfferCurrency = normalizeText(roomOffer?.roomOfferCurrency);

  return {
    offerId: normalizeText(roomOffer?.offerId),
    name: normalizeText(roomOffer?.roomOfferName) || "Room rate",
    boardName: normalizeText(roomOffer?.roomOfferBoardName),
    refundableTag: normalizeText(roomOffer?.roomOfferRefundableTag) || null,
    refundableTagText: normalizeText(roomOffer?.roomOfferRefundableTagText),
    currentPrice:
      Number.isFinite(roomOfferCurrentPriceAmount) && roomOfferCurrency
        ? {
            amount: roomOfferCurrentPriceAmount,
            currency: roomOfferCurrency
          }
        : null,
    currentPriceText: normalizeText(roomOffer?.roomOfferCurrentPriceText),
    beforePrice:
      Number.isFinite(roomOfferBeforeCurrentPriceAmount) && roomOfferCurrency
        ? {
            amount: roomOfferBeforeCurrentPriceAmount,
            currency: roomOfferCurrency
          }
        : null,
    beforePriceText: normalizeText(roomOffer?.roomOfferBeforeCurrentPriceText),
    priceNote: normalizeText(roomOffer?.roomOfferCurrentPriceNoteText)
  };
}

async function handleOfferSelection(selectionPayload) {
  console.log(
    "HOTEL PAGE handleOfferSelection input",
    JSON.stringify(selectionPayload, null, 2)
  );

  const selectedOfferPayload = buildSelectedOfferPayload(selectionPayload);

  console.log(
    "HOTEL PAGE selectedOfferPayload",
    JSON.stringify(selectedOfferPayload, null, 2)
  );

  persistSelectedOfferPayload(selectedOfferPayload);

  if (PURCHASE_FLOW_MODE === PURCHASE_FLOW_MODES.WIX_CART) {
    await handleWixCartFlow(selectedOfferPayload);
    return;
  }

  if (PURCHASE_FLOW_MODE === PURCHASE_FLOW_MODES.LITEAPI_DIRECT) {
    handleLiteApiDirectCheckout(selectedOfferPayload);
    return;
  }

  throw new Error(`Unsupported PURCHASE_FLOW_MODE: ${PURCHASE_FLOW_MODE}`);
}

function buildSelectedOfferPayload(selectionPayload) {
  return {
    selectedAt: Date.now(),
    hotelId: normalizeText(selectionPayload?.hotelId),
    hotelName: normalizeText(selectionPayload?.hotelName),
    hotelAddress: normalizeText(selectionPayload?.hotelAddress),
    hotelMainPhoto: normalizeText(selectionPayload?.hotelMainPhoto),
    hotelStarRating: selectionPayload?.hotelStarRating ?? null,
    hotelStarRatingText: normalizeText(selectionPayload?.hotelStarRatingText),
    hotelReviewText: normalizeText(selectionPayload?.hotelReviewText),
    mappedRoomId: normalizeText(selectionPayload?.mappedRoomId),
    roomName: normalizeText(selectionPayload?.roomName),
    roomImage: normalizeText(selectionPayload?.roomImage),
    roomDetailsPopupData: selectionPayload?.roomDetailsPopupData || null,
    offer: selectionPayload?.offer || null,
    offerId: normalizeText(selectionPayload?.offer?.offerId),
    ctx: selectionPayload?.ctx || searchFlowContextQuery
  };
}

async function handleWixCartFlow(selectedOfferPayload) {
  const mappedRoomId = normalizeText(selectedOfferPayload?.mappedRoomId);
  const offerId = normalizeText(selectedOfferPayload?.offerId);

  console.log(
    "HOTEL PAGE handleWixCartFlow start",
    JSON.stringify(
      {
        mappedRoomId,
        offerId,
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

  setCartReturnUrl();
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
    hotelMainImage: selectedOfferPayload.hotelMainPhoto,
    roomMainImage: selectedOfferPayload.roomImage,
    hotelName: selectedOfferPayload.hotelName,
    mappedRoomName:
      selectedOfferPayload.roomName || selectedOfferPayload.mappedRoomId
  });

  const prebookShell = buildPrebookShell({
    mappedRoomId,
    prebookSnapshot,
    normalizedPrebook,
    hotelName: selectedOfferPayload.hotelName,
    hotelMainImage: selectedOfferPayload.hotelMainPhoto,
    roomMainImage: selectedOfferPayload.roomImage,
    wixHotelMainImageRef: importedImageRefs.wixHotelMainImageRef,
    wixRoomMainImageRef: importedImageRefs.wixRoomMainImageRef,
    hotelStars: selectedOfferPayload.hotelStarRatingText,
    hotelReview: selectedOfferPayload.hotelReviewText,
    hotelAddress: selectedOfferPayload.hotelAddress
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
  wixLocationFrontend.to(CART_PAGE_PATH);
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

function handleLiteApiDirectCheckout(selectedOfferPayload) {
  wixLocationFrontend.to(
    buildCheckoutPageUrl(
      selectedOfferPayload.ctx,
      selectedOfferPayload.hotelId,
      selectedOfferPayload.offerId
    )
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
  hotelStars,
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
    hotelStars: normalizeText(hotelStars),
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
  hotelMainImage,
  roomMainImage,
  hotelName,
  mappedRoomName
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
      hotelMainImage: normalizeText(hotelMainImage),
      roomMainImage: normalizeText(roomMainImage),
      hotelName: normalizeText(hotelName),
      mappedRoomName: normalizeText(mappedRoomName)
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

function setCartReturnUrl() {
  const currentUrl = normalizeText(wixLocationFrontend?.url);

  if (!currentUrl) {
    return;
  }

  session.setItem(CART_RETURN_URL_STORAGE_KEY, currentUrl);
}

function bindMapElements(hotelMapUrl) {
  const hotelMapUrlText = normalizeText(hotelMapUrl);

  if (!hotelMapUrlText) {
    $w("#hotelMapLinkIconButton").collapse();
    $w("#hotelMapLinkIconText").collapse();
    return;
  }

  $w("#hotelMapLinkIconButton").expand();
  $w("#hotelMapLinkIconButton").onClick(() => {
    wixLocationFrontend.to(hotelMapUrlText);
  });

  $w("#hotelMapLinkIconText").expand();
  $w("#hotelMapLinkIconText").onClick(() => {
    wixLocationFrontend.to(hotelMapUrlText);
  });
}

function bindHeroGallery(hotelGalleryImageUrls) {
  const hotelHeroGalleryItems = dedupeStringArray(hotelGalleryImageUrls)
    .filter(Boolean)
    .map((hotelGalleryImageUrl, hotelGalleryImageIndex) => ({
      type: "image",
      src: hotelGalleryImageUrl,
      title: `Image ${hotelGalleryImageIndex + 1}`
    }));

  $w("#hotelHeroGallery").items = hotelHeroGalleryItems;
}

function buildCurrentSearchFlowContextUrl(currentSearchFlowContextQuery) {
  const currentPath =
    Array.isArray(wixLocationFrontend.path) && wixLocationFrontend.path.length
      ? `/${wixLocationFrontend.path.join("/")}`
      : "/hotel";

  const currentSearchFlowParams = new URLSearchParams();

  Object.entries(currentSearchFlowContextQuery || {}).forEach(
    ([currentSearchFlowContextQueryKey, currentSearchFlowContextQueryValue]) => {
      const normalizedCurrentSearchFlowContextQueryValue = normalizeText(
        currentSearchFlowContextQueryValue
      );

      if (normalizedCurrentSearchFlowContextQueryValue) {
        currentSearchFlowParams.set(
          currentSearchFlowContextQueryKey,
          normalizedCurrentSearchFlowContextQueryValue
        );
      }
    }
  );

  const currentQueryString = currentSearchFlowParams.toString();

  return currentQueryString ? `${currentPath}?${currentQueryString}` : currentPath;
}

function buildRepeaterId(value) {
  return (
    normalizeText(value)
      .replace(/[^a-zA-Z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 128) || "room"
  );
}

function dedupeStringArray(values) {
  const seenValues = new Set();

  return (Array.isArray(values) ? values : [])
    .map((value) => normalizeText(value))
    .filter((value) => {
      if (!value || seenValues.has(value)) {
        return false;
      }

      seenValues.add(value);
      return true;
    });
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeNumberOrNull(value) {
  const normalizedNumber = Number(value);

  return Number.isFinite(normalizedNumber) ? normalizedNumber : null;
}
