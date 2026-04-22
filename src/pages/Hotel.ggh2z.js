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
  buildHotelPageUrl,
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
      normalizeText(fallbackHotel?.name) || "Hotel"
    );
    setTextIfExists("#hotelAddressText", normalizeText(fallbackHotel?.address));
  }
}

function bindHotelHero(normalizedHotelDetails, normalizedMergedMappedRoomOffers) {
  const hotelMainImage =
    normalizeText(normalizedHotelDetails?.hotelMainImage) || FALLBACK_IMAGE_URL;
  const hotelGalleryImageUrls = collectHotelImageUrls(
    normalizedHotelDetails?.hotelImages,
    hotelMainImage
  );

  setTextIfExists("#hotelNameText", normalizeText(normalizedHotelDetails?.hotelName) || "Hotel");
  setTextIfExists("#hotelAddressText", normalizeText(normalizedHotelDetails?.hotelAddress));
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

  const roomOffersMinCurrentPrice = Number(
    normalizedMergedMappedRoomOffers?.roomOffersMinCurrentPrice
  );
  const roomOffersMinCurrentPriceCurrency = normalizeText(
    normalizedMergedMappedRoomOffers?.roomOffersMinCurrentPriceCurrency
  );
  const roomOffersMinCurrentPriceText =
    Number.isFinite(roomOffersMinCurrentPrice) && roomOffersMinCurrentPriceCurrency
      ? formatPrice({
          amount: roomOffersMinCurrentPrice,
          currency: roomOffersMinCurrentPriceCurrency
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
  const facilitiesButton = safeGetPageElement("#HotelFacilitiesPopupButton");
  const facilities = Array.isArray(normalizedHotelDetails?.hotelFacilities)
    ? normalizedHotelDetails.hotelFacilities
    : [];

  if (facilitiesButton) {
    if (facilities.length > 0) {
      safeShow(facilitiesButton);
      safeExpand(facilitiesButton);
      if (typeof facilitiesButton.onClick === "function") {
        facilitiesButton.onClick(() => {
          wixWindowFrontend.openLightbox(HOTEL_FACILITIES_LIGHTBOX, {
            facilities
          });
        });
      }
    } else {
      safeCollapseAndHide(facilitiesButton);
    }
  }

  const policiesButton = safeGetPageElement("#HotelPoliciesPopupButton");
  const policies = Array.isArray(normalizedHotelDetails?.hotelPolicies)
    ? normalizedHotelDetails.hotelPolicies
    : [];

  if (policiesButton) {
    if (policies.length > 0) {
      safeShow(policiesButton);
      safeExpand(policiesButton);
      if (typeof policiesButton.onClick === "function") {
        policiesButton.onClick(() => {
          wixWindowFrontend.openLightbox(HOTEL_POLICIES_LIGHTBOX, {
            policies
          });
        });
      }
    } else {
      safeCollapseAndHide(policiesButton);
    }
  }
}

function bindMappedRoomOffersRepeater(mappedRoomOffers) {
  const repeater = safeGetPageElement("#mappedRoomOffersRepeater");
  if (!repeater) {
    console.error("Missing #mappedRoomOffersRepeater");
    return;
  }

  repeater.onItemReady(($item, itemData) => {
    bindMappedRoomOfferItem($item, itemData);
  });

  repeater.data = (Array.isArray(mappedRoomOffers) ? mappedRoomOffers : []).map(
    (mappedRoomOfferItem, mappedRoomOfferIndex) => ({
      ...mappedRoomOfferItem,
      _id: buildRepeaterId(
        mappedRoomOfferItem?.mappedRoomId || `mapped-room-${mappedRoomOfferIndex + 1}`
      )
    })
  );
}

function bindMappedRoomOfferItem($item, itemData) {
  const room = itemData?.room && typeof itemData.room === "object" ? itemData.room : null;
  const roomOffers = Array.isArray(itemData?.roomOffers) ? itemData.roomOffers : [];

  const roomName =
    normalizeText(room?.roomName) || normalizeText(roomOffers?.[0]?.roomOfferName) || "Room";
  const roomMainImage =
    normalizeText(room?.roomMainImage) ||
    normalizeText(hotelPageState?.normalizedHotelDetails?.hotelMainImage) ||
    FALLBACK_IMAGE_URL;

  setItemImage($item, "#roomMainImage", roomMainImage, FALLBACK_IMAGE_URL);
  setItemText($item, "#roomDetailsTitleText", roomName);
  setOptionalItemText($item, "#roomSizeText", normalizeText(room?.roomSizeText));
  setOptionalItemText(
    $item,
    "#roomSleepsText",
    room?.roomSleepsText === null || room?.roomSleepsText === undefined
      ? ""
      : String(room.roomSleepsText)
  );
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

  if (!room) {
    safeCollapseAndHide(roomDetailsButton);
    return;
  }

  const roomDetailsPopupContext = {
    roomName: normalizeText(room?.roomName),
    description: normalizeText(room?.roomDescription),
    sizeText: normalizeText(room?.roomSizeText),
    sleepsText:
      room?.roomSleepsText === null || room?.roomSleepsText === undefined
        ? ""
        : String(room.roomSleepsText),
    bedTypesText: normalizeText(room?.roomBedTypesText),
    amenities: deriveRoomAmenityNames(room?.roomAmenities),
    images: Array.isArray(room?.roomImages) ? room.roomImages : []
  };

  const shouldShowRoomDetailsButton =
    roomDetailsPopupContext.roomName ||
    roomDetailsPopupContext.description ||
    roomDetailsPopupContext.sizeText ||
    roomDetailsPopupContext.sleepsText ||
    roomDetailsPopupContext.bedTypesText ||
    roomDetailsPopupContext.amenities.length > 0 ||
    roomDetailsPopupContext.images.length > 0;

  if (!shouldShowRoomDetailsButton) {
    safeCollapseAndHide(roomDetailsButton);
    return;
  }

  safeShow(roomDetailsButton);
  safeExpand(roomDetailsButton);

  if (typeof roomDetailsButton.onClick === "function") {
    roomDetailsButton.onClick(() => {
      wixWindowFrontend.openLightbox(ROOM_DETAILS_LIGHTBOX, roomDetailsPopupContext);
    });
  }
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
    if (roomOfferRowSlot) {
      safeCollapseAndHide(roomOfferRowSlot);
    }
    if (roomOfferColumnFlex) {
      safeCollapseAndHide(roomOfferColumnFlex);
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

  const roomOfferCurrentPriceText =
    Number.isFinite(Number(roomOffer?.roomOfferCurrentPrice)) &&
    normalizeText(roomOffer?.roomOfferCurrentPriceCurrency)
      ? formatPrice({
          amount: Number(roomOffer.roomOfferCurrentPrice),
          currency: normalizeText(roomOffer.roomOfferCurrentPriceCurrency)
        })
      : "";

  const roomOfferBeforeCurrentPriceText =
    Number.isFinite(Number(roomOffer?.roomOfferBeforeCurrentPrice)) &&
    normalizeText(roomOffer?.roomOfferBeforeCurrentPriceCurrency)
      ? formatPrice({
          amount: Number(roomOffer.roomOfferBeforeCurrentPrice),
          currency: normalizeText(roomOffer.roomOfferBeforeCurrentPriceCurrency)
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
    await handleOfferSelection({
      mappedRoomId: mappedRoomOfferItem?.mappedRoomId,
      room,
      roomOffer
    });
  });
}

async function handleOfferSelection({ mappedRoomId, room, roomOffer }) {
  const selectedOfferPayload = buildSelectedOfferPayload({
    mappedRoomId,
    room,
    roomOffer
  });

  console.log(
    "HOTEL PAGE selectedOfferPayload",
    JSON.stringify(selectedOfferPayload, null, 2)
  );

  persistSelectedOfferPayload(selectedOfferPayload);

  if (PURCHASE_FLOW_MODE === PURCHASE_FLOW_MODES.WIX_CART) {
    try {
      await handleWixCartFlow(selectedOfferPayload);
    } catch (error) {
      console.error("HOTEL PAGE handleWixCartFlow failed", error);
      recoverCurrentHotelPage();
    }
    return;
  }

  if (PURCHASE_FLOW_MODE === PURCHASE_FLOW_MODES.LITEAPI_DIRECT) {
    handleLiteApiDirectCheckout(selectedOfferPayload);
    return;
  }

  throw new Error(`Unsupported PURCHASE_FLOW_MODE: ${PURCHASE_FLOW_MODE}`);
}

function buildSelectedOfferPayload({ mappedRoomId, room, roomOffer }) {
  const normalizedHotelDetails = hotelPageState?.normalizedHotelDetails || {};

  return {
    selectedAt: Date.now(),
    hotelId: normalizeText(normalizedHotelDetails?.hotelId),
    hotelName: normalizeText(normalizedHotelDetails?.hotelName),
    hotelMainImage: normalizeText(normalizedHotelDetails?.hotelMainImage),
    mappedRoomId: normalizeIntegerOrNull(mappedRoomId),
    roomId: normalizeIntegerOrNull(room?.roomId),
    roomName: normalizeText(room?.roomName),
    roomMainImage: normalizeText(room?.roomMainImage),
    roomOfferId: normalizeText(roomOffer?.roomOfferId),
    roomOfferName: normalizeText(roomOffer?.roomOfferName),
    roomOfferBoardName: normalizeText(roomOffer?.roomOfferBoardName),
    roomOfferCurrentPrice: normalizeNumberOrNull(roomOffer?.roomOfferCurrentPrice),
    roomOfferCurrentPriceCurrency: normalizeText(
      roomOffer?.roomOfferCurrentPriceCurrency
    ),
    roomOfferBeforeCurrentPrice: normalizeNumberOrNull(
      roomOffer?.roomOfferBeforeCurrentPrice
    ),
    roomOfferBeforeCurrentPriceCurrency: normalizeText(
      roomOffer?.roomOfferBeforeCurrentPriceCurrency
    ),
    roomOfferRefundableTag: normalizeText(roomOffer?.roomOfferRefundableTag),
    roomOfferRefundableTagText: normalizeText(
      roomOffer?.roomOfferRefundableTagText
    ),
    roomOfferCurrentPriceNoteText: normalizeText(
      roomOffer?.roomOfferCurrentPriceNoteText
    ),
    roomOfferOccupancyNumber: normalizeIntegerOrNull(
      roomOffer?.roomOfferOccupancyNumber
    ),
    roomOfferAdultCount: normalizeIntegerOrNull(roomOffer?.roomOfferAdultCount),
    roomOfferChildCount: normalizeIntegerOrNull(roomOffer?.roomOfferChildCount),
    roomOfferChildrenAges: Array.isArray(roomOffer?.roomOfferChildrenAges)
      ? roomOffer.roomOfferChildrenAges
      : [],
    offerId: normalizeText(roomOffer?.offerId),
    ctx: currentCtx
  };
}

async function handleWixCartFlow(selectedOfferPayload) {
  const mappedRoomId = normalizeText(selectedOfferPayload?.mappedRoomId);
  const offerId = normalizeText(selectedOfferPayload?.offerId);

  if (!mappedRoomId || !offerId) {
    recoverCurrentHotelPage();
    return;
  }

  setCartReturnUrl();
  await removePrebookItemsIfCartExists();

  const prebookResult = await createPrebookSession({
    offerId,
    usePaymentSdk: false
  });

  const prebookSnapshot = normalizeText(prebookResult?.prebookSnapshot);
  const normalizedPrebook =
    prebookResult?.normalizedPrebook && typeof prebookResult.normalizedPrebook === "object"
      ? prebookResult.normalizedPrebook
      : null;

  if (!prebookSnapshot || !normalizedPrebook) {
    recoverCurrentHotelPage();
    return;
  }

  const prebookId = normalizeText(normalizedPrebook?.prebookId);
  if (!prebookId) {
    recoverCurrentHotelPage();
    return;
  }

  const importedImageRefs = await resolveCatalogImageRefs({
    hotelMainImage: selectedOfferPayload?.hotelMainImage,
    roomMainImage: selectedOfferPayload?.roomMainImage,
    hotelName: selectedOfferPayload?.hotelName,
    mappedRoomName:
      selectedOfferPayload?.roomName || String(selectedOfferPayload?.mappedRoomId || "")
  });

  const prebookShell = buildPrebookShell({
    selectedOfferPayload,
    normalizedPrebook,
    prebookSnapshot,
    importedImageRefs,
    normalizedHotelDetails: hotelPageState?.normalizedHotelDetails || null
  });

  const lineItem = buildWixCatalogLineItem({
    mappedRoomId,
    prebookShell
  });

  await currentCart.addToCurrentCart({
    lineItems: [lineItem]
  });

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
  selectedOfferPayload,
  normalizedPrebook,
  prebookSnapshot,
  importedImageRefs,
  normalizedHotelDetails
}) {
  return {
    mappedRoomId: normalizeText(selectedOfferPayload?.mappedRoomId),
    prebookId: normalizeText(normalizedPrebook?.prebookId),
    prebookSnapshot: normalizeText(prebookSnapshot),
    hotelName: normalizeText(selectedOfferPayload?.hotelName),
    hotelMainImage: normalizeText(selectedOfferPayload?.hotelMainImage),
    roomMainImage: normalizeText(selectedOfferPayload?.roomMainImage),
    wixHotelMainImageRef: normalizeText(importedImageRefs?.wixHotelMainImageRef),
    wixRoomMainImageRef: normalizeText(importedImageRefs?.wixRoomMainImageRef),
    hotelStars: formatHotelStarsText(normalizedHotelDetails?.hotelStarRating),
    hotelReview: buildHotelReviewText(
      normalizedHotelDetails?.hotelRating,
      normalizedHotelDetails?.hotelReviewCount
    ),
    hotelAddress: normalizeText(normalizedHotelDetails?.hotelAddress),
    checkInDate: normalizeText(normalizedPrebook?.checkInDate),
    checkOutDate: normalizeText(normalizedPrebook?.checkOutDate),
    rateName:
      normalizeText(selectedOfferPayload?.roomOfferName) ||
      normalizeText(normalizedPrebook?.rateName),
    boardName:
      normalizeText(selectedOfferPayload?.roomOfferBoardName) ||
      normalizeText(normalizedPrebook?.boardName),
    adultCount:
      normalizeIntegerOrNull(selectedOfferPayload?.roomOfferAdultCount) ??
      normalizeIntegerOrNull(normalizedPrebook?.adultCount) ??
      0,
    childCount:
      normalizeIntegerOrNull(selectedOfferPayload?.roomOfferChildCount) ??
      normalizeIntegerOrNull(normalizedPrebook?.childCount) ??
      0,
    childrenAges: Array.isArray(selectedOfferPayload?.roomOfferChildrenAges)
      ? selectedOfferPayload.roomOfferChildrenAges
      : Array.isArray(normalizedPrebook?.childrenAges)
      ? normalizedPrebook.childrenAges
      : [],
    occupancyNumber:
      normalizeIntegerOrNull(selectedOfferPayload?.roomOfferOccupancyNumber) ??
      normalizeIntegerOrNull(normalizedPrebook?.occupancyNumber) ??
      1,
    refundableTag:
      normalizeText(selectedOfferPayload?.roomOfferRefundableTag) ||
      normalizeText(normalizedPrebook?.refundableTag),
    currency:
      normalizeText(selectedOfferPayload?.roomOfferCurrentPriceCurrency) ||
      normalizeText(normalizedPrebook?.currency),
    currentPrice:
      normalizeNumberOrNull(selectedOfferPayload?.roomOfferCurrentPrice) ??
      normalizeNumberOrNull(normalizedPrebook?.currentPrice),
    beforeCurrentPrice:
      normalizeNumberOrNull(selectedOfferPayload?.roomOfferBeforeCurrentPrice) ??
      normalizeNumberOrNull(normalizedPrebook?.beforeCurrentPrice),
    ratePriceNoteText: normalizeText(selectedOfferPayload?.roomOfferCurrentPriceNoteText)
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
  const hasAnyImage = Boolean(normalizeText(hotelMainImage) || normalizeText(roomMainImage));

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
    console.error("HOTEL PAGE importCatalogImages failed", error);

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

function buildHotelReviewText(hotelRating, hotelReviewCount) {
  const hotelRatingText = formatGuestRating(hotelRating);
  const hotelReviewCountText = formatReviewCount(hotelReviewCount);

  if (hotelRatingText && hotelReviewCountText) {
    return `${hotelRatingText} • ${hotelReviewCountText}`;
  }

  return hotelRatingText || hotelReviewCountText || "";
}

function formatHotelStarsText(hotelStarRating) {
  const numericHotelStarRating = Number(hotelStarRating || 0);
  if (!Number.isFinite(numericHotelStarRating) || numericHotelStarRating <= 0) {
    return "";
  }

  const roundedStars = Math.max(1, Math.min(5, Math.round(numericHotelStarRating)));
  return "★".repeat(roundedStars);
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

function recoverCurrentHotelPage() {
  const resolvedHotelId =
    normalizeText(currentCtx.hotelId) ||
    normalizeText(hotelPageState?.normalizedHotelDetails?.hotelId) ||
    normalizeText(selectedHotelPayload?.hotelId) ||
    normalizeText(selectedHotelPayload?.rawHotel?.hotelId);

  if (!resolvedHotelId) {
    return;
  }

  wixLocationFrontend.to(buildHotelPageUrl(currentCtx, resolvedHotelId));
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