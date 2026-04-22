import wixLocationFrontend from "wix-location-frontend";
import wixWindowFrontend from "wix-window-frontend";
import wixEcomFrontend from "wix-ecom-frontend";
import { session } from "wix-storage-frontend";
import { currentCart } from "wix-ecom-backend";
import {
  createPrebookSession,
  getMergedMappedRoomOffers
} from "backend/liteApi.web";
import { importCatalogImages } from "backend/wix.web";
import {
  buildCheckoutPageUrl,
  buildOccupancyFromCtx,
  formatGuestRating,
  formatPrice,
  formatReviewCount,
  loadSelectedHotelPayload,
  normalizeCtxFromQuery,
  persistSelectedOfferPayload
} from "public/liteApiFlow";
import {
  safeCollapseAndHide,
  safeExpand,
  safeGetItemElement,
  safeGetPageElement,
  safeShow,
  setItemImage,
  setItemText,
  setOptionalItemText,
  setOptionalTextIfExists,
  setTextIfExists
} from "public/liteApiHelpers";

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

let currentCtx = {};
let selectedHotelPayload = null;
let hotelPageState = null;

$w.onReady(async function () {
  await initializeHotelPage();
});

async function initializeHotelPage() {
  currentCtx = normalizeCtxFromQuery(wixLocationFrontend.query || {});
  selectedHotelPayload = loadSelectedHotelPayload();

  const resolvedHotelId =
    normalizeText(currentCtx.hotelId) ||
    normalizeText(selectedHotelPayload?.hotelId) ||
    normalizeText(selectedHotelPayload?.rawHotel?.hotelId);

  if (!resolvedHotelId) {
    console.error("HOTEL PAGE missing hotelId.");
    return;
  }

  try {
    hotelPageState = await getMergedMappedRoomOffers({
      hotelId: resolvedHotelId,
      checkIn: currentCtx.checkin,
      checkOut: currentCtx.checkout,
      occupancy: buildOccupancyFromCtx(currentCtx),
      currency: currentCtx.currency || "TRY"
    });

    bindHotelHero(
      hotelPageState?.normalizedHotelDetails || null,
      hotelPageState?.normalizedMergedMappedRoomOffers || null
    );
    bindHotelDescriptionSections(hotelPageState?.normalizedHotelDetails || null);
    bindHotelPopupButtons(hotelPageState?.normalizedHotelDetails || null);
    bindMappedRoomOffersRepeater(
      hotelPageState?.normalizedMergedMappedRoomOffers?.mappedRoomOffers || []
    );
  } catch (error) {
    console.error("HOTEL PAGE initialization failed", error);

    const fallbackHotel =
      selectedHotelPayload?.rawHotel && typeof selectedHotelPayload.rawHotel === "object"
        ? selectedHotelPayload.rawHotel
        : selectedHotelPayload || {};

    setTextIfExists(
      "#hotelNameText",
      normalizeText(fallbackHotel?.name || fallbackHotel?.hotelName) || "Hotel"
    );
    setTextIfExists(
      "#hotelAddressText",
      normalizeText(fallbackHotel?.address || fallbackHotel?.hotelAddress)
    );
  }
}

function bindHotelHero(normalizedHotelDetails, normalizedMergedMappedRoomOffers) {
  const hotelMainImage =
    normalizeText(normalizedHotelDetails?.hotelMainImage) || FALLBACK_IMAGE_URL;

  const hotelGalleryImageUrls = collectHotelImageUrls(
    normalizedHotelDetails?.hotelImages,
    hotelMainImage
  );

  setTextIfExists(
    "#hotelNameText",
    normalizeText(normalizedHotelDetails?.hotelName) || "Hotel"
  );
  setTextIfExists(
    "#hotelAddressText",
    normalizeText(normalizedHotelDetails?.hotelAddress)
  );
  setRatingIfExists(
    "#hotelStarRatingDisplay",
    normalizedHotelDetails?.hotelStarRating
  );
  setOptionalTextIfExists(
    "#hotelRatingText",
    formatGuestRating(normalizedHotelDetails?.hotelRating)
  );
  setOptionalTextIfExists(
    "#hotelReviewCountText",
    formatReviewCount(normalizedHotelDetails?.hotelReviewCount)
  );

  bindMapElements(normalizedHotelDetails?.hotelMapUrl);
  bindHeroGallery(hotelGalleryImageUrls);

  const roomOffersMinCurrentPrice = normalizeNumberOrNull(
    normalizedMergedMappedRoomOffers?.roomOffersMinCurrentPrice
  );
  const roomOfferCurrency = normalizeText(
    normalizedMergedMappedRoomOffers?.roomOfferCurrency
  );

  const roomOffersMinCurrentPriceText =
    Number.isFinite(roomOffersMinCurrentPrice) && roomOfferCurrency
      ? formatPrice({
          amount: roomOffersMinCurrentPrice,
          currency: roomOfferCurrency
        })
      : "";

  setOptionalTextIfExists(
    "#roomOffersMinCurrentPriceText",
    roomOffersMinCurrentPriceText
  );
  syncVisibilityWithCurrentPrice(
    "#roomOffersMinCurrentPricePrefixText",
    roomOffersMinCurrentPriceText
  );
  syncVisibilityWithCurrentPrice(
    "#roomOffersMinCurrentPriceText",
    roomOffersMinCurrentPriceText
  );
  syncVisibilityWithCurrentPrice(
    "#roomOffersMinCurrentPricePerNightText",
    roomOffersMinCurrentPriceText
  );
}

function bindHotelDescriptionSections(normalizedHotelDetails) {
  setOptionalTextIfExists(
    "#hotelDescriptionBodyText",
    normalizeText(normalizedHotelDetails?.hotelDescription)
  );
  setOptionalTextIfExists(
    "#hotelImportantInformationBodyText",
    normalizeText(normalizedHotelDetails?.hotelImportantInformation)
  );
}

function bindHotelPopupButtons(normalizedHotelDetails) {
  const hotelFacilitiesPopupButton = safeGetPageElement("#hotelFacilitiesPopupButton");
  const hotelFacilities = Array.isArray(normalizedHotelDetails?.hotelFacilities)
    ? normalizedHotelDetails.hotelFacilities
    : [];

  if (hotelFacilitiesPopupButton) {
    if (hotelFacilities.length > 0) {
      safeShow(hotelFacilitiesPopupButton);
      safeExpand(hotelFacilitiesPopupButton);

      if (typeof hotelFacilitiesPopupButton.onClick === "function") {
        hotelFacilitiesPopupButton.onClick(() => {
          wixWindowFrontend.openLightbox(HOTEL_FACILITIES_LIGHTBOX, {
            facilities: hotelFacilities
          });
        });
      }
    } else {
      safeCollapseAndHide(hotelFacilitiesPopupButton);
    }
  }

  const hotelPoliciesPopupButton = safeGetPageElement("#hotelPoliciesPopupButton");
  const hotelPolicies = Array.isArray(normalizedHotelDetails?.hotelPolicies)
    ? normalizedHotelDetails.hotelPolicies
    : [];

  if (hotelPoliciesPopupButton) {
    if (hotelPolicies.length > 0) {
      safeShow(hotelPoliciesPopupButton);
      safeExpand(hotelPoliciesPopupButton);

      if (typeof hotelPoliciesPopupButton.onClick === "function") {
        hotelPoliciesPopupButton.onClick(() => {
          wixWindowFrontend.openLightbox(HOTEL_POLICIES_LIGHTBOX, {
            policies: hotelPolicies
          });
        });
      }
    } else {
      safeCollapseAndHide(hotelPoliciesPopupButton);
    }
  }
}

function bindMappedRoomOffersRepeater(mappedRoomOffers) {
  const mappedRoomOffersRepeater = safeGetPageElement("#mappedRoomOffersRepeater");

  if (!mappedRoomOffersRepeater) {
    console.error("Missing #mappedRoomOffersRepeater");
    return;
  }

  mappedRoomOffersRepeater.onItemReady(($item, itemData) => {
    bindMappedRoomOfferItem($item, itemData);
  });

  mappedRoomOffersRepeater.data = (Array.isArray(mappedRoomOffers)
    ? mappedRoomOffers
    : []
  ).map((mappedRoomOfferItem, mappedRoomOfferIndex) => ({
    ...mappedRoomOfferItem,
    _id: buildRepeaterId(
      mappedRoomOfferItem?.mappedRoomId || `mapped-room-${mappedRoomOfferIndex + 1}`
    )
  }));
}

function bindMappedRoomOfferItem($item, itemData) {
  const room = itemData?.room && typeof itemData.room === "object" ? itemData.room : null;
  const roomOffers = Array.isArray(itemData?.roomOffers) ? itemData.roomOffers : [];

  const roomName =
    normalizeText(room?.roomName) ||
    normalizeText(roomOffers?.[0]?.roomOfferName) ||
    "Room";

  const roomMainImage =
    normalizeText(room?.roomMainImage) ||
    normalizeText(hotelPageState?.normalizedHotelDetails?.hotelMainImage) ||
    FALLBACK_IMAGE_URL;

  setItemImage($item, "#roomMainImage", roomMainImage, FALLBACK_IMAGE_URL);
  setItemText($item, "#roomNameText", roomName);
  setOptionalItemText($item, "#roomSizeText", normalizeText(room?.roomSizeText));
  setOptionalItemText($item, "#roomSleepsText", normalizeText(room?.roomSleepsText));
  setOptionalItemText(
    $item,
    "#roomDescriptionText",
    normalizeText(room?.roomDescription)
  );
  setOptionalItemText(
    $item,
    "#roomBedTypesText",
    normalizeText(room?.roomBedTypesText)
  );

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
  const roomDetailsButton = safeGetItemElement($item, "#roomDetailsButton");

  if (!roomDetailsButton) {
    return;
  }

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
    safeCollapseAndHide(roomDetailsButton);
    return;
  }

  safeShow(roomDetailsButton);
  safeExpand(roomDetailsButton);

  if (typeof roomDetailsButton.onClick === "function") {
    roomDetailsButton.onClick(() => {
      wixWindowFrontend.openLightbox(ROOM_DETAILS_LIGHTBOX, roomDetailsPopupData);
    });
  }
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
    amenities: deriveRoomAmenityNames(room?.roomAmenities),
    images: Array.isArray(room?.roomImages)
      ? room.roomImages.filter(Boolean)
      : [normalizeText(room?.roomMainImage)].filter(Boolean)
  };
}

function bindRoomOfferSlot($item, slotNumber, roomOffer, mappedRoomOfferItem, room) {
  const roomOfferRowSlot = safeGetItemElement($item, `#roomOfferRowSlot${slotNumber}`);
  const roomOfferColumnFlex = safeGetItemElement(
    $item,
    `#roomOfferColumnFlex${slotNumber}`
  );

  if (!roomOfferRowSlot && !roomOfferColumnFlex) {
    return;
  }

  if (!roomOffer) {
    if (roomOfferColumnFlex) {
      safeCollapseAndHide(roomOfferColumnFlex);
    }

    if (roomOfferRowSlot) {
      safeCollapseAndHide(roomOfferRowSlot);
    }

    return;
  }

  if (roomOfferRowSlot) {
    safeShow(roomOfferRowSlot);
    safeExpand(roomOfferRowSlot);
  }

  if (roomOfferColumnFlex) {
    safeShow(roomOfferColumnFlex);
    safeExpand(roomOfferColumnFlex);
  }

  const roomOfferCurrentPriceAmount = normalizeNumberOrNull(
    roomOffer?.roomOfferCurrentPrice
  );
  const roomOfferBeforeCurrentPriceAmount = normalizeNumberOrNull(
    roomOffer?.roomOfferBeforeCurrentPrice
  );
  const roomOfferCurrency = normalizeText(roomOffer?.roomOfferCurrency);

  const roomOfferCurrentPriceText =
    Number.isFinite(roomOfferCurrentPriceAmount) && roomOfferCurrency
      ? formatPrice({
          amount: roomOfferCurrentPriceAmount,
          currency: roomOfferCurrency
        })
      : "";

  const roomOfferBeforeCurrentPriceText =
    Number.isFinite(roomOfferBeforeCurrentPriceAmount) && roomOfferCurrency
      ? formatPrice({
          amount: roomOfferBeforeCurrentPriceAmount,
          currency: roomOfferCurrency
        })
      : "";

  setOptionalItemText(
    $item,
    `#roomOfferNameText${slotNumber}`,
    normalizeText(roomOffer?.roomOfferName)
  );
  setOptionalItemText(
    $item,
    `#roomOfferBoardNameText${slotNumber}`,
    normalizeText(roomOffer?.roomOfferBoardName)
  );
  setOptionalItemText(
    $item,
    `#roomOfferRefundableTagText${slotNumber}`,
    normalizeText(roomOffer?.roomOfferRefundableTagText)
  );
  setOptionalItemText(
    $item,
    `#roomOfferCurrentPriceText${slotNumber}`,
    roomOfferCurrentPriceText
  );
  setOptionalItemText(
    $item,
    `#roomOfferBeforeCurrentPriceText${slotNumber}`,
    roomOfferBeforeCurrentPriceText
  );
  setOptionalItemText(
    $item,
    `#roomOfferCurrentPriceNoteText${slotNumber}`,
    normalizeText(roomOffer?.roomOfferCurrentPriceNoteText)
  );

  syncItemVisibilityWithCurrentPrice(
    $item,
    `#roomOfferPerNightText${slotNumber}`,
    roomOfferCurrentPriceText
  );

  const roomOfferSelectionButton = safeGetItemElement(
    $item,
    `#roomOfferSelectionButton${slotNumber}`
  );

  if (!roomOfferSelectionButton || typeof roomOfferSelectionButton.onClick !== "function") {
    return;
  }

  safeShow(roomOfferSelectionButton);
  safeExpand(roomOfferSelectionButton);

  roomOfferSelectionButton.onClick(async () => {
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
        hotelStars: hotelPageState?.normalizedHotelDetails?.hotelStarRating ?? null,
        hotelGuestRating: hotelPageState?.normalizedHotelDetails?.hotelRating ?? null,
        hotelReviewCount:
          hotelPageState?.normalizedHotelDetails?.hotelReviewCount ?? null,
        mappedRoomId: normalizeText(mappedRoomOfferItem?.mappedRoomId),
        roomName: normalizeText(room?.roomName),
        roomImage: normalizeText(room?.roomMainImage),
        roomDetailsPopupData: buildRoomDetailsPopupData(room),
        offer: buildSelectedOfferOffer(roomOffer),
        ctx: currentCtx
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
    currentPrice:
      Number.isFinite(roomOfferCurrentPriceAmount) && roomOfferCurrency
        ? {
            amount: roomOfferCurrentPriceAmount,
            currency: roomOfferCurrency
          }
        : null,
    beforePrice:
      Number.isFinite(roomOfferBeforeCurrentPriceAmount) && roomOfferCurrency
        ? {
            amount: roomOfferBeforeCurrentPriceAmount,
            currency: roomOfferCurrency
          }
        : null,
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
    hotelStars: selectionPayload?.hotelStars ?? null,
    hotelGuestRating: selectionPayload?.hotelGuestRating ?? null,
    hotelReviewCount: selectionPayload?.hotelReviewCount ?? null,
    mappedRoomId: normalizeText(selectionPayload?.mappedRoomId),
    roomName: normalizeText(selectionPayload?.roomName),
    roomImage: normalizeText(selectionPayload?.roomImage),
    roomDetailsPopupData: selectionPayload?.roomDetailsPopupData || null,
    offer: selectionPayload?.offer || null,
    offerId: normalizeText(selectionPayload?.offer?.offerId),
    ctx: selectionPayload?.ctx || currentCtx
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
    hotelStars: formatHotelStarsText(selectedOfferPayload.hotelStars),
    hotelReview: buildHotelReviewText(
      selectedOfferPayload.hotelGuestRating,
      selectedOfferPayload.hotelReviewCount
    ),
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

function buildHotelReviewText(hotelGuestRating, hotelReviewCount) {
  const hotelGuestRatingText = formatGuestRating(hotelGuestRating);
  const hotelReviewCountText = formatReviewCount(hotelReviewCount);

  if (hotelGuestRatingText && hotelReviewCountText) {
    return `${hotelGuestRatingText} • ${hotelReviewCountText}`;
  }

  return hotelGuestRatingText || hotelReviewCountText || "";
}

function formatHotelStarsText(hotelStarRating) {
  const numericHotelStarRating = Number(hotelStarRating || 0);

  if (!Number.isFinite(numericHotelStarRating) || numericHotelStarRating <= 0) {
    return "";
  }

  const roundedHotelStars = Math.max(
    1,
    Math.min(5, Math.round(numericHotelStarRating))
  );

  return "★".repeat(roundedHotelStars);
}

function bindMapElements(hotelMapUrl) {
  const hotelMapLinkIconButton = safeGetPageElement("#hotelMapLinkIconButton");
  const hotelMapLinkIconText = safeGetPageElement("#hotelMapLinkIconText");

  if (!normalizeText(hotelMapUrl)) {
    if (hotelMapLinkIconButton) {
      safeCollapseAndHide(hotelMapLinkIconButton);
    }

    if (hotelMapLinkIconText) {
      safeCollapseAndHide(hotelMapLinkIconText);
    }

    return;
  }

  [hotelMapLinkIconButton, hotelMapLinkIconText].forEach((element) => {
    if (!element) {
      return;
    }

    safeShow(element);
    safeExpand(element);

    if (typeof element.onClick === "function") {
      element.onClick(() => {
        wixLocationFrontend.to(hotelMapUrl);
      });
    }
  });
}

function bindHeroGallery(hotelGalleryImageUrls) {
  const hotelHeroGallery = safeGetPageElement("#hotelHeroGallery");

  if (!hotelHeroGallery) {
    return;
  }

  const hotelHeroGalleryItems = dedupeStringArray(hotelGalleryImageUrls)
    .filter(Boolean)
    .map((hotelGalleryImageUrl, hotelGalleryImageIndex) => ({
      type: "image",
      src: hotelGalleryImageUrl,
      title: `Image ${hotelGalleryImageIndex + 1}`
    }));

  try {
    hotelHeroGallery.items = hotelHeroGalleryItems;
  } catch (error) {
    console.error("Failed to bind #hotelHeroGallery", error);
  }
}

function collectHotelImageUrls(hotelImages, hotelMainImage) {
  const hotelImageUrls = [];

  if (normalizeText(hotelMainImage)) {
    hotelImageUrls.push(normalizeText(hotelMainImage));
  }

  if (Array.isArray(hotelImages)) {
    hotelImages.forEach((hotelImageItem) => {
      const hotelImageUrl = normalizeText(hotelImageItem?.url);

      if (hotelImageUrl) {
        hotelImageUrls.push(hotelImageUrl);
      }
    });
  }

  return dedupeStringArray(hotelImageUrls);
}

function deriveRoomAmenityNames(roomAmenities) {
  if (!Array.isArray(roomAmenities)) {
    return [];
  }

  return roomAmenities
    .map((roomAmenityItem) => {
      if (typeof roomAmenityItem === "string") {
        return normalizeText(roomAmenityItem);
      }

      if (roomAmenityItem && typeof roomAmenityItem === "object") {
        return normalizeText(roomAmenityItem?.name);
      }

      return "";
    })
    .filter(Boolean);
}

function setRatingIfExists(selector, ratingValue) {
  const element = safeGetPageElement(selector);

  if (!element) {
    return;
  }

  const numericRating = Number(ratingValue || 0);

  if (!Number.isFinite(numericRating) || numericRating <= 0) {
    safeCollapseAndHide(element);
    return;
  }

  try {
    element.rating = Math.max(0, Math.min(5, Math.round(numericRating)));
    safeShow(element);
    safeExpand(element);
  } catch (error) {
    console.error(`Failed to set rating for ${selector}`, error);
  }
}

function syncVisibilityWithCurrentPrice(selector, currentPriceText) {
  const element = safeGetPageElement(selector);

  if (!element) {
    return;
  }

  if (!currentPriceText) {
    safeCollapseAndHide(element);
    return;
  }

  safeShow(element);
  safeExpand(element);
}

function syncItemVisibilityWithCurrentPrice($item, selector, currentPriceText) {
  const element = safeGetItemElement($item, selector);

  if (!element) {
    return;
  }

  if (!currentPriceText) {
    safeCollapseAndHide(element);
    return;
  }

  safeShow(element);
  safeExpand(element);
}

function buildRepeaterId(value) {
  return String(value || `item-${Date.now()}`)
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, 45);
}

function dedupeStringArray(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeIntegerOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function normalizeNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}