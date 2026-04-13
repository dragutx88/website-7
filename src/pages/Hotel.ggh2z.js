import wixLocationFrontend from "wix-location-frontend";
import wixWindowFrontend from "wix-window-frontend";
import wixEcomFrontend from "wix-ecom-frontend";
import { session } from "wix-storage-frontend";
import { currentCart } from "wix-ecom-backend";
import {
  createPrebookSession,
  getHotelDetails,
  getHotelRatesByHotelId
} from "backend/liteApi.web";
import {
  buildCheckoutPageUrl,
  buildOccupancyFromCtx,
  formatGuestRating,
  formatPrice,
  formatRefundableTag,
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

const ROOM_DETAILS_LIGHTBOX = "hotelRoomDetailsPopup";
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
let hotelPageModel = null;

$w.onReady(async function () {
  await initializeHotelPage();
});

async function initializeHotelPage() {
  currentCtx = normalizeCtxFromQuery(wixLocationFrontend.query || {});
  selectedHotelPayload = loadSelectedHotelPayload();

  const resolvedHotelId =
    String(currentCtx.hotelId || "").trim() ||
    String(selectedHotelPayload?.hotelId || "").trim();

  if (!resolvedHotelId) {
    console.error("HOTEL PAGE missing hotelId.");
    return;
  }

  try {
    const [hotelDetailsResult, hotelRatesResult] = await Promise.all([
      getHotelDetails(resolvedHotelId),
      getHotelRatesByHotelId({
        hotelId: resolvedHotelId,
        checkIn: currentCtx.checkin,
        checkOut: currentCtx.checkout,
        occupancy: buildOccupancyFromCtx(currentCtx),
        currency: currentCtx.currency || "USD"
      })
    ]);

    hotelPageModel = buildHotelPageModel({
      hotelDetails: hotelDetailsResult?.normalizedHotel,
      roomGroups: hotelRatesResult?.normalizedRoomGroups,
      lowestPrice: hotelRatesResult?.lowestPrice,
      fallbackHotel: selectedHotelPayload?.rawHotel,
      ctx: currentCtx
    });

    bindHotelHero(hotelPageModel);
    bindHotelDescriptionSections(hotelPageModel);
    bindHotelPopupButtons(hotelPageModel);
    bindRoomGroups(hotelPageModel.roomGroups || []);
  } catch (error) {
    console.error("HOTEL PAGE initialization failed", error);
    const fallbackName =
      selectedHotelPayload?.name ||
      selectedHotelPayload?.rawHotel?.name ||
      "Hotel";
    setTextIfExists("#hotelNameText", fallbackName);
  }
}

function buildHotelPageModel({
  hotelDetails,
  roomGroups,
  lowestPrice,
  fallbackHotel,
  ctx
}) {
  const normalizedHotel = hotelDetails || {};
  const roomsById = new Map();
  const normalizedRooms = Array.isArray(normalizedHotel?.rooms)
    ? normalizedHotel.rooms
    : [];

  normalizedRooms.forEach((room) => {
    if (room?.roomId) {
      roomsById.set(String(room.roomId), room);
    }
  });

  const mergedRoomGroups = (Array.isArray(roomGroups) ? roomGroups : []).map(
    (group, index) => {
      const matchedRoom = group?.mappedRoomId
        ? roomsById.get(String(group.mappedRoomId))
        : null;

      const roomName =
        matchedRoom?.roomName ||
        String(group?.roomNameFromRates || "").trim() ||
        "Room";

      const roomImage =
        matchedRoom?.photos?.[0] ||
        normalizedHotel?.mainPhoto ||
        normalizeFallbackImage(fallbackHotel?.mainPhoto) ||
        FALLBACK_IMAGE_URL;

      const popupData = {
        roomName,
        description: stripHtml(matchedRoom?.description || ""),
        sizeText: formatRoomSize(
          matchedRoom?.roomSizeSquare,
          matchedRoom?.roomSizeUnit
        ),
        sleepsText: formatSleepsText(matchedRoom?.maxOccupancy),
        bedTypesText: formatBedTypesText(matchedRoom?.bedTypes),
        amenities: Array.isArray(matchedRoom?.roomAmenities)
          ? matchedRoom.roomAmenities
          : [],
        images:
          Array.isArray(matchedRoom?.photos) && matchedRoom.photos.length
            ? matchedRoom.photos
            : [roomImage].filter(Boolean)
      };

      return {
        _id: buildRepeaterId(group?.mappedRoomId || `room-${index + 1}`),
        mappedRoomId: group?.mappedRoomId || null,
        roomName,
        roomImage,
        roomSizeText: popupData.sizeText,
        roomSleepsText: popupData.sleepsText,
        roomDescriptionText: popupData.description,
        roomBedTypesText: popupData.bedTypesText,
        roomAmenities: popupData.amenities,
        roomDetailsPopupData: popupData,
        offers: normalizeOfferSlots(group?.offers || [], ctx)
      };
    }
  );

  return {
    hotelId: normalizedHotel?.hotelId || currentCtx.hotelId || "",
    name:
      normalizedHotel?.name ||
      String(fallbackHotel?.name || selectedHotelPayload?.name || "Hotel"),
    address:
      normalizedHotel?.address || String(fallbackHotel?.address || ""),
    starRating: normalizedHotel?.starRating,
    guestRating:
      normalizedHotel?.guestRating ?? fallbackHotel?.guestRating ?? null,
    reviewCount:
      normalizedHotel?.reviewCount ?? fallbackHotel?.reviewCount ?? null,
    mainPhoto:
      normalizedHotel?.mainPhoto ||
      normalizeFallbackImage(fallbackHotel?.mainPhoto) ||
      FALLBACK_IMAGE_URL,
    images:
      Array.isArray(normalizedHotel?.images) && normalizedHotel.images.length
        ? normalizedHotel.images
        : [normalizeFallbackImage(fallbackHotel?.mainPhoto)].filter(Boolean),
    description: stripHtml(normalizedHotel?.hotelDescription || ""),
    importantInformation: stripHtml(
      normalizedHotel?.hotelImportantInformation || ""
    ),
    facilities: Array.isArray(normalizedHotel?.facilities)
      ? normalizedHotel.facilities
      : [],
    policies: Array.isArray(normalizedHotel?.policies)
      ? normalizedHotel.policies
      : [],
    mapUrl: buildMapUrl(
      normalizedHotel?.location?.latitude,
      normalizedHotel?.location?.longitude
    ),
    lowestPrice: lowestPrice || fallbackHotel?.currentPrice || null,
    roomGroups: mergedRoomGroups
  };
}

function bindHotelHero(model) {
  setTextIfExists("#hotelNameText", model?.name || "Hotel");
  setTextIfExists("#hotelAddressText", model?.address || "");
  setRatingIfExists("#hotelStarsRatingDisplay", model?.starRating);
  setOptionalTextIfExists(
    "#hotelGuestRatingText",
    formatGuestRating(model?.guestRating)
  );
  setOptionalTextIfExists(
    "#hotelReviewCountText",
    formatReviewCount(model?.reviewCount)
  );

  bindMapElements(model?.mapUrl);
  bindHeroGallery(model?.images || [model?.mainPhoto].filter(Boolean));

  const currentPriceText = formatPrice(model?.lowestPrice);
  setOptionalTextIfExists("#hotelCurrentPriceText", currentPriceText);
  syncVisibilityWithCurrentPrice("#hotelPricePrefixText", currentPriceText);
  syncVisibilityWithCurrentPrice("#hotelCurrentPriceText", currentPriceText);
  syncVisibilityWithCurrentPrice("#hotelPerNightText", currentPriceText);
}

function bindHotelDescriptionSections(model) {
  setOptionalTextIfExists("#hotelDescriptionBodyText", model?.description || "");
  setOptionalTextIfExists(
    "#hotelImportantInformationBodyText",
    model?.importantInformation || ""
  );
}

function bindHotelPopupButtons(model) {
  const facilitiesButton = safeGetPageElement("#HotelFacilitiesPopupButton");
  if (facilitiesButton) {
    if (Array.isArray(model?.facilities) && model.facilities.length > 0) {
      safeShow(facilitiesButton);
      safeExpand(facilitiesButton);
      if (typeof facilitiesButton.onClick === "function") {
        facilitiesButton.onClick(() => {
          wixWindowFrontend.openLightbox(HOTEL_FACILITIES_LIGHTBOX, {
            facilities: model.facilities
          });
        });
      }
    } else {
      safeCollapseAndHide(facilitiesButton);
    }
  }

  const policiesButton = safeGetPageElement("#HotelPoliciesPopupButton");
  if (policiesButton) {
    if (Array.isArray(model?.policies) && model.policies.length > 0) {
      safeShow(policiesButton);
      safeExpand(policiesButton);
      if (typeof policiesButton.onClick === "function") {
        policiesButton.onClick(() => {
          wixWindowFrontend.openLightbox(HOTEL_POLICIES_LIGHTBOX, {
            policies: model.policies
          });
        });
      }
    } else {
      safeCollapseAndHide(policiesButton);
    }
  }
}

function bindRoomGroups(roomGroups) {
  const repeater = safeGetPageElement("#roomGroupsRepeater");
  if (!repeater) {
    console.error("Missing #roomGroupsRepeater");
    return;
  }

  repeater.onItemReady(($item, itemData) => {
    bindRoomGroupItem($item, itemData);
  });

  repeater.data = Array.isArray(roomGroups) ? roomGroups : [];
}

function bindRoomGroupItem($item, itemData) {
  setItemImage($item, "#roomMainImage", itemData.roomImage, FALLBACK_IMAGE_URL);
  setItemText($item, "#roomDetailsTitleText", itemData.roomName);
  setOptionalItemText($item, "#roomSizeText", itemData.roomSizeText);
  setOptionalItemText($item, "#roomSleepsText", itemData.roomSleepsText);
  setOptionalItemText($item, "#roomDescriptionText", itemData.roomDescriptionText);
  setOptionalItemText($item, "#roomBedTypesText", itemData.roomBedTypesText);
  bindRoomDetailsButton($item, itemData.roomDetailsPopupData);

  const offerSlots = Array.isArray(itemData?.offers) ? itemData.offers : [];
  for (let slotIndex = 0; slotIndex < 4; slotIndex += 1) {
    bindOfferSlot($item, slotIndex + 1, offerSlots[slotIndex] || null, itemData);
  }
}

function bindRoomDetailsButton($item, popupData) {
  const button = safeGetItemElement($item, "#hotelRoomDetailsButton");
  if (!button) {
    return;
  }

  const shouldShow =
    popupData &&
    (popupData.roomName ||
      popupData.description ||
      popupData.sizeText ||
      popupData.sleepsText ||
      popupData.bedTypesText ||
      (Array.isArray(popupData.amenities) && popupData.amenities.length > 0) ||
      (Array.isArray(popupData.images) && popupData.images.length > 0));

  if (!shouldShow) {
    safeCollapseAndHide(button);
    return;
  }

  safeShow(button);
  safeExpand(button);

  if (typeof button.onClick === "function") {
    button.onClick(() => {
      wixWindowFrontend.openLightbox(ROOM_DETAILS_LIGHTBOX, popupData);
    });
  }
}

function bindOfferSlot($item, slotNumber, offer, roomItemData) {
  const rowSlot = safeGetItemElement($item, `#roomOfferRowSlot${slotNumber}`);
  const slot = safeGetItemElement($item, `#roomOfferColumnFlex${slotNumber}`);

  if (!rowSlot && !slot) {
    return;
  }

  if (!offer) {
    if (rowSlot) {
      safeCollapseAndHide(rowSlot);
    }
    if (slot) {
      safeCollapseAndHide(slot);
    }
    return;
  }

  if (rowSlot) {
    safeShow(rowSlot);
    safeExpand(rowSlot);
  }
  if (slot) {
    safeShow(slot);
    safeExpand(slot);
  }

  setOptionalItemText($item, `#roomOfferNameText${slotNumber}`, offer.name);
  setOptionalItemText($item, `#roomOfferBoardNameText${slotNumber}`, offer.boardName);
  setOptionalItemText(
    $item,
    `#roomOfferRefundableTagText${slotNumber}`,
    formatRefundableTag(offer.refundableTag)
  );
  setOptionalItemText(
    $item,
    `#roomOfferCurrentPriceText${slotNumber}`,
    formatPrice(offer.currentPrice)
  );
  setOptionalItemText(
    $item,
    `#roomOfferDiscountBeforePriceText${slotNumber}`,
    formatPrice(offer.beforePrice)
  );
  setOptionalItemText($item, `#roomOfferPriceNoteText${slotNumber}`, offer.priceNote);
  syncItemVisibilityWithCurrentPrice(
    $item,
    `#roomOfferPerNightText${slotNumber}`,
    formatPrice(offer.currentPrice)
  );

  const button = safeGetItemElement($item, `#roomOfferSelectionButton${slotNumber}`);
  if (!button || typeof button.onClick !== "function") {
    return;
  }

  safeShow(button);
  safeExpand(button);

  button.onClick(async () => {
    try {
      await handleOfferSelection({
        hotelId: hotelPageModel?.hotelId,
        hotelName: hotelPageModel?.name,
        hotelAddress: hotelPageModel?.address,
        hotelMainPhoto: hotelPageModel?.mainPhoto,
        hotelStars: hotelPageModel?.starRating,
        hotelGuestRating: hotelPageModel?.guestRating,
        hotelReviewCount: hotelPageModel?.reviewCount,
        mappedRoomId: roomItemData?.mappedRoomId,
        roomName: roomItemData?.roomName,
        roomImage: roomItemData?.roomImage,
        roomDetailsPopupData: roomItemData?.roomDetailsPopupData,
        offer,
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
    hotelId: selectionPayload?.hotelId || "",
    hotelName: selectionPayload?.hotelName || "",
    hotelAddress: selectionPayload?.hotelAddress || "",
    hotelMainPhoto: selectionPayload?.hotelMainPhoto || "",
    hotelStars: selectionPayload?.hotelStars || null,
    hotelGuestRating: selectionPayload?.hotelGuestRating ?? null,
    hotelReviewCount: selectionPayload?.hotelReviewCount ?? null,
    mappedRoomId: String(selectionPayload?.mappedRoomId || "").trim(),
    roomName: selectionPayload?.roomName || "",
    roomImage: selectionPayload?.roomImage || "",
    roomDetailsPopupData: selectionPayload?.roomDetailsPopupData || null,
    offer: selectionPayload?.offer || null,
    offerId: selectionPayload?.offer?.offerId || "",
    ctx: selectionPayload?.ctx || currentCtx
  };
}

async function handleWixCartFlow(selectedOfferPayload) {
  const mappedRoomId = String(selectedOfferPayload?.mappedRoomId || "").trim();
  const offerId = String(selectedOfferPayload?.offerId || "").trim();

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

  const prebookResult = await createPrebookSession({
    offerId,
    usePaymentSdk: false
  });

  console.log(
    "HOTEL PAGE prebookResult",
    JSON.stringify(prebookResult, null, 2)
  );

  const prebookSnapshot = extractPrebookSnapshot(prebookResult);
  if (!prebookSnapshot || typeof prebookSnapshot !== "object") {
    throw new Error("Prebook snapshot could not be resolved.");
  }

  selectedOfferPayload.prebookSnapshot = prebookSnapshot;
  persistSelectedOfferPayload(selectedOfferPayload);

  const lineItem = buildWixCatalogLineItem({
    mappedRoomId,
    prebookSnapshot,
    hotelName: selectedOfferPayload.hotelName,
    hotelMainImage: selectedOfferPayload.hotelMainPhoto,
    roomMainImage: selectedOfferPayload.roomImage,
    hotelStars: formatHotelStarsText(selectedOfferPayload.hotelStars),
    hotelReview: buildHotelReviewText(
      selectedOfferPayload.hotelGuestRating,
      selectedOfferPayload.hotelReviewCount
    ),
    hotelAddress: selectedOfferPayload.hotelAddress
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

function handleLiteApiDirectCheckout(selectedOfferPayload) {
  wixLocationFrontend.to(
    buildCheckoutPageUrl(
      selectedOfferPayload.ctx,
      selectedOfferPayload.hotelId,
      selectedOfferPayload.offerId
    )
  );
}

function buildWixCatalogLineItem({
  mappedRoomId,
  prebookSnapshot,
  hotelName,
  hotelMainImage,
  roomMainImage,
  hotelStars,
  hotelReview,
  hotelAddress
}) {
  return {
    quantity: 1,
    catalogReference: {
      appId: LITEAPI_CATALOG_APP_ID,
      catalogItemId: String(mappedRoomId || "").trim(),
      options: {
        prebookSnapshot,
        hotelName: String(hotelName || "").trim(),
        hotelMainImage: String(hotelMainImage || "").trim(),
        roomMainImage: String(roomMainImage || "").trim(),
        hotelStars: String(hotelStars || "").trim(),
        hotelReview: String(hotelReview || "").trim(),
        hotelAddress: String(hotelAddress || "").trim()
      }
    }
  };
}

function setCartReturnUrl() {
  const currentUrl = String(wixLocationFrontend?.url || "").trim();
  if (!currentUrl) {
    return;
  }

  session.setItem(CART_RETURN_URL_STORAGE_KEY, currentUrl);
}

function extractPrebookSnapshot(prebookResult) {
  if (prebookResult?.raw && typeof prebookResult.raw === "object") {
    return prebookResult.raw;
  }

  if (prebookResult && typeof prebookResult === "object") {
    return prebookResult;
  }

  return null;
}

function buildHotelReviewText(guestRating, reviewCount) {
  const ratingText = formatGuestRating(guestRating);
  const reviewCountText = formatReviewCount(reviewCount);

  if (ratingText && reviewCountText) {
    return `${ratingText} • ${reviewCountText}`;
  }

  return ratingText || reviewCountText || "";
}

function formatHotelStarsText(starRating) {
  const numericRating = Number(starRating || 0);
  if (!Number.isFinite(numericRating) || numericRating <= 0) {
    return "";
  }

  const roundedStars = Math.max(1, Math.min(5, Math.round(numericRating)));
  return "★".repeat(roundedStars);
}

function normalizeOfferSlots(offers, ctx) {
  return offers.slice(0, 4).map((offer) => ({
    offerId: offer?.offerId || "",
    name: String(offer?.name || "Room rate"),
    boardName: String(offer?.boardName || ""),
    refundableTag: String(offer?.refundableTag || ""),
    currentPrice: offer?.currentPrice || null,
    beforePrice: offer?.beforePrice || null,
    priceNote: String(offer?.priceNote || buildFallbackPriceNote(ctx))
  }));
}

function buildFallbackPriceNote(ctx) {
  const nights = getNightCount(ctx?.checkin, ctx?.checkout);
  const nightText = nights === 1 ? "1 night" : `${nights} nights`;
  return `${nightText}, 1 room`;
}

function bindMapElements(mapUrl) {
  const mapButton = safeGetPageElement("#hotelMapLinkButton");
  const mapText = safeGetPageElement("#hotelMapIconLinkText");

  if (!mapUrl) {
    if (mapButton) safeCollapseAndHide(mapButton);
    if (mapText) safeCollapseAndHide(mapText);
    return;
  }

  [mapButton, mapText].forEach((element) => {
    if (!element) return;
    safeShow(element);
    safeExpand(element);
    try {
      if (typeof element.onClick === "function") {
        element.onClick(() => {
          wixLocationFrontend.to(mapUrl);
        });
      }
    } catch (error) {}
  });
}

function bindHeroGallery(imageUrls) {
  const gallery = safeGetPageElement("#hotelHeroGallery");
  if (!gallery) {
    return;
  }

  const normalizedItems = buildGalleryItems(imageUrls);
  try {
    gallery.items = normalizedItems;
  } catch (error) {
    console.error("Failed to bind #hotelHeroGallery", error);
  }
}

function buildGalleryItems(imageUrls) {
  return dedupeStringArray(imageUrls)
    .filter(Boolean)
    .map((url, index) => ({
      type: "image",
      src: url,
      title: `Image ${index + 1}`
    }));
}

function buildMapUrl(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return "";
  }
  return `https://maps.google.com/?q=${lat},${lng}`;
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function formatRoomSize(sizeValue, sizeUnit) {
  const size = Number(sizeValue);
  const unit = String(sizeUnit || "").trim();
  if (!Number.isFinite(size) || size <= 0) {
    return "";
  }
  const normalizedUnit = unit === "m2" ? "m²" : unit;
  return normalizedUnit ? `${size} ${normalizedUnit}` : `${size}`;
}

function formatSleepsText(maxOccupancy) {
  const value = Number(maxOccupancy);
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }
  return `Sleeps ${value}`;
}

function formatBedTypesText(bedTypes) {
  if (!Array.isArray(bedTypes) || bedTypes.length === 0) {
    return "";
  }
  return bedTypes.filter(Boolean).join(" • ");
}

function getNightCount(checkIn, checkOut) {
  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);
  if (Number.isNaN(checkInDate.getTime()) || Number.isNaN(checkOutDate.getTime())) {
    return 1;
  }
  const differenceMs = checkOutDate.getTime() - checkInDate.getTime();
  const nights = Math.round(differenceMs / (1000 * 60 * 60 * 24));
  return nights > 0 ? nights : 1;
}

function dedupeStringArray(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function normalizeFallbackImage(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function setRatingIfExists(selector, ratingValue) {
  const element = safeGetPageElement(selector);
  if (!element) return;
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
  if (!element) return;
  if (!currentPriceText) {
    safeCollapseAndHide(element);
    return;
  }
  safeShow(element);
  safeExpand(element);
}

function syncItemVisibilityWithCurrentPrice($item, selector, currentPriceText) {
  const element = safeGetItemElement($item, selector);
  if (!element) return;
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