import wixLocationFrontend from "wix-location-frontend";
import wixEcomFrontend from "wix-ecom-frontend";
import { session } from "wix-storage-frontend";
import { currentCart } from "wix-ecom-backend";
import { createPrebookSession } from "backend/liteApi.web";
import { importCatalogImages } from "backend/wix.web";

const SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY =
  "searchFlowContextQueryStringify";

const PURCHASE_FLOW_MODES = Object.freeze({
  WIX_CART: "wix_cart",
  PAYMENT_SDK: "payment_sdk"
});

const PURCHASE_FLOW_MODE = PURCHASE_FLOW_MODES.WIX_CART;

const LITEAPI_CATALOG_APP_ID = "e7f94f4b-7e6a-41c6-8ee1-52c1d5f31cf4";

const CART_PAGE_PATH = "/cart-page";
const CHECKOUT_PAGE_PATH = "/checkout";

export async function handleOfferSelection(purchaseSelection) {
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

  if (!mappedRoomId) {
    throw new Error("mappedRoomId is required for Wix cart flow.");
  }

  if (!offerId) {
    throw new Error("offerId is required for Wix cart flow.");
  }

  const liteApiPrebookFlowId = `liteapi-prebook-${Date.now()}`;

  console.log("HOTEL PAGE prebookFlow start", {
    liteApiPrebookFlowId,
    hasMappedRoomId: Boolean(mappedRoomId),
    hasOfferId: Boolean(offerId),
    hasHotelId: Boolean(normalizeText(purchaseSelection?.hotelId)),
    hasHotelName: Boolean(normalizeText(purchaseSelection?.hotelName)),
    hasHotelMainImage: Boolean(
      normalizeText(purchaseSelection?.hotelMainImage)
    ),
    hasRoomId: Boolean(normalizeText(purchaseSelection?.roomId)),
    hasRoomName: Boolean(normalizeText(purchaseSelection?.roomName)),
    hasRoomMainImage: Boolean(normalizeText(purchaseSelection?.roomImage))
  });

  const cartCleanupPromise = removePrebookItemsIfCartExists()
    .then(() => {
      console.log("HOTEL PAGE cartCleanup ok", {
        liteApiPrebookFlowId
      });

      return true;
    })
    .catch((error) => {
      console.error("HOTEL PAGE cartCleanup failed", {
        liteApiPrebookFlowId,
        name: error?.name,
        message: error?.message,
        stack: error?.stack
      });

      throw error;
    });

  const prebookPromise = createPrebookSession({
    offerId,
    usePaymentSdk: false
  })
    .then((prebookResult) => {
      console.log("HOTEL PAGE prebook ok", {
        liteApiPrebookFlowId,
        hasPrebookSnapshot: Boolean(
          normalizeText(prebookResult?.prebookSnapshot)
        ),
        hasNormalizedPrebook: Boolean(
          prebookResult?.normalizedPrebook &&
            typeof prebookResult.normalizedPrebook === "object"
        ),
        hasPrebookId: Boolean(
          normalizeText(prebookResult?.normalizedPrebook?.prebookId)
        )
      });

      return prebookResult;
    })
    .catch((error) => {
      console.error("HOTEL PAGE prebook failed", {
        liteApiPrebookFlowId,
        name: error?.name,
        message: error?.message,
        stack: error?.stack
      });

      throw error;
    });

  const imageRefsPromise = resolveCatalogImageRefs({
    hotelId: purchaseSelection.hotelId,
    hotelName: purchaseSelection.hotelName,
    hotelMainImage: purchaseSelection.hotelMainImage,

    roomId: purchaseSelection.roomId,
    roomName: purchaseSelection.roomName,
    roomMainImage: purchaseSelection.roomImage
  })
    .then((importedImageRefs) => {
      console.log("HOTEL PAGE imageRefs ok", {
        liteApiPrebookFlowId,
        hasWixHotelMainImageRef: Boolean(
          normalizeText(importedImageRefs?.wixHotelMainImageRef)
        ),
        hasWixRoomMainImageRef: Boolean(
          normalizeText(importedImageRefs?.wixRoomMainImageRef)
        )
      });

      return importedImageRefs;
    })
    .catch((error) => {
      console.error("HOTEL PAGE imageRefs failed", {
        liteApiPrebookFlowId,
        name: error?.name,
        message: error?.message,
        stack: error?.stack
      });

      throw error;
    });

  const [, prebookResult, importedImageRefs] = await Promise.all([
    cartCleanupPromise,
    prebookPromise,
    imageRefsPromise
  ]);

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

  console.log("HOTEL PAGE prebookFlow preparation ok", {
    liteApiPrebookFlowId,
    hasPrebookSnapshot: Boolean(prebookSnapshot),
    hasNormalizedPrebook: Boolean(normalizedPrebook),
    hasPrebookId: Boolean(prebookId),
    hasWixHotelMainImageRef: Boolean(
      normalizeText(importedImageRefs?.wixHotelMainImageRef)
    ),
    hasWixRoomMainImageRef: Boolean(
      normalizeText(importedImageRefs?.wixRoomMainImageRef)
    )
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
    hotelAddress: purchaseSelection.hotelAddress,
    currency: purchaseSelection.roomOfferCurrency,
    currentPrice: purchaseSelection.currentPrice,
    beforeCurrentPrice: purchaseSelection.beforeCurrentPrice
  });

  console.log("HOTEL PAGE buildPrebookShell success", {
    liteApiPrebookFlowId,
    hasPrebookShell: Boolean(prebookShell),
    hasPrebookId: Boolean(prebookShell?.prebookId),
    hasMappedRoomId: Boolean(prebookShell?.mappedRoomId),
    hasCurrentPrice: Number.isFinite(Number(prebookShell?.currentPrice)),
    hasWixHotelMainImageRef: Boolean(
      normalizeText(prebookShell?.wixHotelMainImageRef)
    ),
    hasWixRoomMainImageRef: Boolean(
      normalizeText(prebookShell?.wixRoomMainImageRef)
    )
  });

  const lineItem = buildWixCatalogLineItem({
    mappedRoomId,
    prebookShell
  });

  console.log("HOTEL PAGE addToCurrentCart start", {
    liteApiPrebookFlowId,
    requestedLineItemsCount: 1,
    hasPrebookShell: Boolean(prebookShell),
    hasPrebookId: Boolean(prebookShell?.prebookId),
    hasMappedRoomId: Boolean(mappedRoomId)
  });

  await currentCart.addToCurrentCart({
    lineItems: [lineItem]
  });

  console.log("HOTEL PAGE addToCurrentCart success", {
    liteApiPrebookFlowId,
    requestedLineItemsCount: 1,
    hasPrebookShell: Boolean(prebookShell),
    hasPrebookId: Boolean(prebookShell?.prebookId)
  });

  wixEcomFrontend.refreshCart();

  const runtimeSearchFlowContextQuery = {
    prebookId
  };

  console.log("HOTEL PAGE redirect cart-page", {
    liteApiPrebookFlowId,
    hasPrebookId: Boolean(prebookId),
    cartPagePath: CART_PAGE_PATH
  });

  wixLocationFrontend.to(`${CART_PAGE_PATH}?${new URLSearchParams({
    ...JSON.parse(
      session.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY) || "{}"
    ),
    ...wixLocationFrontend.query,
    ...runtimeSearchFlowContextQuery
  })}`);
}

async function handlePaymentSdkFlow(purchaseSelection) {
  const offerId = normalizeText(purchaseSelection?.offerId);
  const hotelId = normalizeText(purchaseSelection?.hotelId);

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

  console.log("HOTEL PAGE createPaymentSdkPrebookSession success", {
    hasNormalizedPrebook: Boolean(normalizedPrebook),
    hasPrebookId: Boolean(prebookId)
  });

  const runtimeSearchFlowContextQuery = {
    prebookId
  };

  wixLocationFrontend.to(`${CHECKOUT_PAGE_PATH}?${new URLSearchParams({
    ...JSON.parse(
      session.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY) || "{}"
    ),
    ...wixLocationFrontend.query,
    ...runtimeSearchFlowContextQuery
  })}`);
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
  hotelAddress,
  currency,
  currentPrice,
  beforeCurrentPrice
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
    currency: normalizeText(currency),
    currentPrice,
    beforeCurrentPrice:
      beforeCurrentPrice === undefined ? null : beforeCurrentPrice
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
    throw new Error("hotelMainImage or roomMainImage is required.");
  }

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
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
