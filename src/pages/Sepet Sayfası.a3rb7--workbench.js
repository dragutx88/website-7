import wixLocationFrontend from "wix-location-frontend";
import { session } from "wix-storage-frontend";
import { currentCart } from "wix-ecom-backend";
import { onCartChange, refreshCart } from "wix-ecom-frontend";

const LITEAPI_CATALOG_APP_ID = "e7f94f4b-7e6a-41c6-8ee1-52c1d5f31cf4";
const RESERVATION_TYPE_KEY = "reservationType";
const FLEXIBLE_RESERVATION_TYPE_VALUE = "flexible";
const SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY =
  "searchFlowContextQueryStringify";

let isApplyingReservationType = false;
let isProgrammaticSwitchUpdate = false;

$w.onReady(async function () {
  bindReservationTypeControls();
  bindCartChangeListener();

  session.setItem(
    SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY,
    JSON.stringify(wixLocationFrontend.query || {})
  );

  try {
    const cart = await currentCart.getCurrentCart();
    const cartLineItems = getCartLineItems(cart);

    if (!cartLineItems.length) {
      redirectToHotelWithSearchFlowContextQuery("empty-cart-on-ready");
      return;
    }

    hydrateReservationTypeUi(cart);
  } catch (error) {
    if (isMissingCurrentCartError(error)) {
      redirectToHotelWithSearchFlowContextQuery("missing-current-cart");
      return;
    }

    console.error("CART PAGE onReady failed", error, safeJson(error));
  }
});

function bindReservationTypeControls() {
  $w("#reservationModeSwitch").onChange(async (event) => {
    if (isProgrammaticSwitchUpdate || isApplyingReservationType) {
      return;
    }

    await applyReservationType(Boolean(event?.target?.checked), "switch");
  });

  $w("#reservationFlexibleModeButton").onClick(async () => {
    await applyReservationType(true, "flexible-button");
  });

  $w("#reservationNonFlexibleModeButton").onClick(async () => {
    await applyReservationType(false, "non-flexible-button");
  });
}

function bindCartChangeListener() {
  try {
    onCartChange(async () => {
      try {
        const cart = await currentCart.getCurrentCart();
        const cartLineItems = getCartLineItems(cart);

        if (!cartLineItems.length) {
          redirectToHotelWithSearchFlowContextQuery(
            "empty-cart-on-cart-change"
          );
          return;
        }

        hydrateReservationTypeUi(cart);
      } catch (error) {
        if (isMissingCurrentCartError(error)) {
          redirectToHotelWithSearchFlowContextQuery(
            "missing-current-cart-on-cart-change"
          );
          return;
        }

        console.error("CART PAGE onCartChange failed", error, safeJson(error));
      }
    });
  } catch (error) {
    console.warn("CART PAGE onCartChange binding failed", safeJson(error));
  }
}

function hydrateReservationTypeUi(cart) {
  const cartLineItems = getCartLineItems(cart);
  const relevantLineItems = getRelevantLiteApiLineItems(cart);

  if (!relevantLineItems.length) {
    isProgrammaticSwitchUpdate = true;
    $w("#reservationModeSwitch").checked = false;
    setTimeout(() => {
      isProgrammaticSwitchUpdate = false;
    }, 0);

    console.warn(
      "CART PAGE hydrateReservationTypeUi no relevant LiteAPI line items",
      safeJson({
        totalCartLineItemsCount: cartLineItems.length
      })
    );
    return;
  }

  const allFlexible = relevantLineItems.every((lineItem) => {
    return lineItem.reservationType === FLEXIBLE_RESERVATION_TYPE_VALUE;
  });

  isProgrammaticSwitchUpdate = true;
  $w("#reservationModeSwitch").checked = allFlexible;
  setTimeout(() => {
    isProgrammaticSwitchUpdate = false;
  }, 0);

  console.log(
    "CART PAGE hydrateReservationTypeUi",
    safeJson({
      totalCartLineItemsCount: cartLineItems.length,
      relevantLineItemsCount: relevantLineItems.length,
      allFlexible,
      lineItems: relevantLineItems.map(buildLineItemSummary)
    })
  );
}

async function applyReservationType(isFlexible, source) {
  if (isApplyingReservationType) {
    return;
  }

  isApplyingReservationType = true;

  $w("#reservationModeSwitch").disable();
  $w("#reservationFlexibleModeButton").disable();
  $w("#reservationNonFlexibleModeButton").disable();

  isProgrammaticSwitchUpdate = true;
  $w("#reservationModeSwitch").checked = Boolean(isFlexible);
  setTimeout(() => {
    isProgrammaticSwitchUpdate = false;
  }, 0);

  try {
    const cart = await currentCart.getCurrentCart();
    const cartLineItems = getCartLineItems(cart);

    if (!cartLineItems.length) {
      redirectToHotelWithSearchFlowContextQuery("empty-cart-during-apply");
      return;
    }

    const relevantLineItems = getRelevantLiteApiLineItems(cart);

    if (!relevantLineItems.length) {
      console.warn(
        "CART PAGE applyReservationType skipped: no relevant LiteAPI line items",
        safeJson({
          source,
          isFlexible,
          totalCartLineItemsCount: cartLineItems.length
        })
      );
      return;
    }

    const changedRelevantLineItems = relevantLineItems.filter((lineItem) =>
      shouldUpdateReservationType(lineItem, isFlexible)
    );

    if (!changedRelevantLineItems.length) {
      console.log(
        "CART PAGE applyReservationType noop",
        safeJson({
          source,
          isFlexible,
          totalCartLineItemsCount: cartLineItems.length,
          relevantLineItemsCount: relevantLineItems.length,
          relevantLineItems: relevantLineItems.map(buildLineItemSummary)
        })
      );

      const freshCart = await currentCart.getCurrentCart();
      const freshCartLineItems = getCartLineItems(freshCart);

      if (!freshCartLineItems.length) {
        redirectToHotelWithSearchFlowContextQuery("empty-cart-during-noop");
        return;
      }

      hydrateReservationTypeUi(freshCart);
      return;
    }

    const allLineItemsToUpdate = buildAllCartLineItemsUpdatePayload(
      cartLineItems,
      isFlexible
    );

    console.log(
      "CART PAGE applyReservationType payload",
      safeJson({
        source,
        isFlexible,
        totalCartLineItemsCount: cartLineItems.length,
        relevantLineItemsCount: relevantLineItems.length,
        changedRelevantLineItemsCount: changedRelevantLineItems.length,
        payloadLineItemsCount: allLineItemsToUpdate.length,
        expectedPayloadIncludesAllCartLineItems:
          allLineItemsToUpdate.length === cartLineItems.length,
        beforeRelevantLineItems: relevantLineItems.map(buildLineItemSummary),
        lineItemsToUpdate: allLineItemsToUpdate.map(buildUpdatePayloadSummary)
      })
    );

    if (allLineItemsToUpdate.length !== cartLineItems.length) {
      throw new Error(
        "Cart update payload must include all current cart line items."
      );
    }

    await currentCart.updateCurrentCart({
      lineItems: allLineItemsToUpdate
    });

    await refreshCart();

    const updatedCart = await currentCart.getCurrentCart();
    const updatedCartLineItems = getCartLineItems(updatedCart);

    if (!updatedCartLineItems.length) {
      redirectToHotelWithSearchFlowContextQuery("empty-cart-after-update");
      return;
    }

    const updatedRelevantLineItems = getRelevantLiteApiLineItems(updatedCart);

    const verificationPassed = verifyReservationTypeState({
      beforeTotalCartLineItemsCount: cartLineItems.length,
      afterTotalCartLineItemsCount: updatedCartLineItems.length,
      beforeRelevantLineItemsCount: relevantLineItems.length,
      afterRelevantLineItemsCount: updatedRelevantLineItems.length,
      updatedRelevantLineItems,
      isFlexible
    });

    console.log(
      "CART PAGE applyReservationType after update",
      safeJson({
        source,
        isFlexible,
        verificationPassed,
        totalCartLineItemsCountBefore: cartLineItems.length,
        totalCartLineItemsCountAfter: updatedCartLineItems.length,
        relevantLineItemsCountBefore: relevantLineItems.length,
        relevantLineItemsCountAfter: updatedRelevantLineItems.length,
        updatedRelevantLineItems: updatedRelevantLineItems.map(
          buildLineItemSummary
        )
      })
    );

    if (!verificationPassed) {
      console.warn(
        "CART PAGE applyReservationType verification failed",
        safeJson({
          source,
          isFlexible,
          totalCartLineItemsCountBefore: cartLineItems.length,
          totalCartLineItemsCountAfter: updatedCartLineItems.length,
          relevantLineItemsCountBefore: relevantLineItems.length,
          relevantLineItemsCountAfter: updatedRelevantLineItems.length,
          updatedRelevantLineItems: updatedRelevantLineItems.map(
            buildLineItemSummary
          )
        })
      );

      redirectToHotelWithSearchFlowContextQuery(
        "reservation-type-verification-failed"
      );
      return;
    }

    hydrateReservationTypeUi(updatedCart);
  } catch (error) {
    if (isMissingCurrentCartError(error)) {
      redirectToHotelWithSearchFlowContextQuery(
        "missing-current-cart-during-apply"
      );
      return;
    }

    console.error(
      "CART PAGE applyReservationType failed",
      error,
      safeJson(error)
    );
  } finally {
    $w("#reservationModeSwitch").enable();
    $w("#reservationFlexibleModeButton").enable();
    $w("#reservationNonFlexibleModeButton").enable();
    isApplyingReservationType = false;
  }
}

function buildAllCartLineItemsUpdatePayload(cartLineItems, isFlexible) {
  return cartLineItems.map((lineItem) => {
    const normalizedLineItem = normalizeCartLineItem(lineItem);
    const nextOptions = buildNextLineItemOptions(
      normalizedLineItem,
      isFlexible
    );

    const catalogReference = {
      appId: normalizedLineItem.appId,
      catalogItemId: normalizedLineItem.catalogItemId
    };

    if (nextOptions) {
      catalogReference.options = nextOptions;
    }

    return {
      _id: normalizedLineItem.lineItemId,
      quantity: normalizedLineItem.quantity,
      catalogReference
    };
  });
}

function buildNextLineItemOptions(lineItem, isFlexible) {
  if (!lineItem.hasOptions) {
    return null;
  }

  const nextOptions = {
    ...lineItem.options
  };

  if (!isRelevantLiteApiLineItem(lineItem)) {
    return nextOptions;
  }

  if (isFlexible) {
    nextOptions[RESERVATION_TYPE_KEY] = FLEXIBLE_RESERVATION_TYPE_VALUE;
  } else {
    delete nextOptions[RESERVATION_TYPE_KEY];
  }

  return nextOptions;
}

function getRelevantLiteApiLineItems(cart) {
  return getCartLineItems(cart)
    .map(normalizeCartLineItem)
    .filter(isRelevantLiteApiLineItem);
}

function normalizeCartLineItem(lineItem) {
  const lineItemId = normalizeRequiredText(
    lineItem._id,
    "lineItem._id"
  );

  const quantity = normalizeRequiredQuantity(
    lineItem.quantity,
    "lineItem.quantity"
  );

  const appId = normalizeRequiredText(
    lineItem.catalogReference.appId,
    "lineItem.catalogReference.appId"
  );

  const catalogItemId = normalizeRequiredText(
    lineItem.catalogReference.catalogItemId,
    "lineItem.catalogReference.catalogItemId"
  );

  const options = normalizeLineItemOptions(lineItem);
  const hasOptions = Boolean(options);

  const prebookId = hasOptions
    ? normalizeOptionalText(options.prebookId)
    : "";

  const reservationType = hasOptions
    ? normalizeOptionalText(options[RESERVATION_TYPE_KEY]).toLowerCase()
    : "";

  return {
    rawLineItem: lineItem,
    lineItemId,
    quantity,
    appId,
    catalogItemId,
    options,
    hasOptions,
    prebookId,
    reservationType
  };
}

function normalizeLineItemOptions(lineItem) {
  const options = lineItem.catalogReference.options;

  if (options === undefined || options === null) {
    return null;
  }

  if (typeof options !== "object" || Array.isArray(options)) {
    throw new Error("lineItem.catalogReference.options must be an object.");
  }

  return options;
}

function isRelevantLiteApiLineItem(lineItem) {
  return (
    lineItem.appId === LITEAPI_CATALOG_APP_ID &&
    Boolean(lineItem.catalogItemId) &&
    Boolean(lineItem.lineItemId) &&
    lineItem.hasOptions &&
    Boolean(lineItem.prebookId)
  );
}

function shouldUpdateReservationType(lineItem, isFlexible) {
  if (isFlexible) {
    return lineItem.reservationType !== FLEXIBLE_RESERVATION_TYPE_VALUE;
  }

  return Boolean(lineItem.reservationType);
}

function verifyReservationTypeState({
  beforeTotalCartLineItemsCount,
  afterTotalCartLineItemsCount,
  beforeRelevantLineItemsCount,
  afterRelevantLineItemsCount,
  updatedRelevantLineItems,
  isFlexible
}) {
  const cartLineItemCountPreserved =
    beforeTotalCartLineItemsCount === afterTotalCartLineItemsCount;

  const relevantLineItemCountPreserved =
    beforeRelevantLineItemsCount === afterRelevantLineItemsCount;

  const reservationTypeStatePassed =
    updatedRelevantLineItems.length > 0 &&
    updatedRelevantLineItems.every((lineItem) => {
      return isFlexible
        ? lineItem.reservationType === FLEXIBLE_RESERVATION_TYPE_VALUE
        : !lineItem.reservationType;
    });

  return (
    cartLineItemCountPreserved &&
    relevantLineItemCountPreserved &&
    reservationTypeStatePassed
  );
}

function getCartLineItems(cart) {
  return Array.isArray(cart?.lineItems) ? cart.lineItems : [];
}

function buildLineItemSummary(lineItem) {
  const options = lineItem.hasOptions ? lineItem.options : null;
  const optionKeys = options ? Object.keys(options).sort() : [];

  return {
    lineItemId: lineItem.lineItemId,
    quantity: lineItem.quantity,
    appId: lineItem.appId,
    catalogItemId: lineItem.catalogItemId,
    prebookId: lineItem.prebookId,
    hasPrebookSnapshot: Boolean(
      options && normalizeOptionalText(options.prebookSnapshot)
    ),
    reservationType: lineItem.reservationType,
    optionKeys,
    optionKeysCount: optionKeys.length
  };
}

function buildUpdatePayloadSummary(lineItem) {
  const options = lineItem.catalogReference.options;
  const hasOptions =
    options &&
    typeof options === "object" &&
    !Array.isArray(options);

  const optionKeys = hasOptions ? Object.keys(options).sort() : [];

  return {
    _id: lineItem._id,
    quantity: lineItem.quantity,
    appId: lineItem.catalogReference.appId,
    catalogItemId: lineItem.catalogReference.catalogItemId,
    prebookId: hasOptions ? normalizeOptionalText(options.prebookId) : "",
    hasPrebookSnapshot: Boolean(
      hasOptions && normalizeOptionalText(options.prebookSnapshot)
    ),
    reservationType: hasOptions
      ? normalizeOptionalText(options[RESERVATION_TYPE_KEY]).toLowerCase()
      : "",
    optionKeys,
    optionKeysCount: optionKeys.length
  };
}

function redirectToHotelWithSearchFlowContextQuery(reason) {
  let searchFlowContextQuery = {};

  try {
    searchFlowContextQuery = JSON.parse(
      session.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY) || "{}"
    );
  } catch (error) {
    console.error(
      "CART PAGE failed to parse search flow context query session",
      error,
      safeJson(error)
    );
    searchFlowContextQuery = {};
  }

  const redirectSearchFlowContextQueryString = new URLSearchParams({
    ...wixLocationFrontend.query,
    ...searchFlowContextQuery
  }).toString();

  const redirectSearchFlowContextUrl = redirectSearchFlowContextQueryString
    ? `/hotel?${redirectSearchFlowContextQueryString}`
    : "/hotel";

  console.warn(
    "CART PAGE redirecting to hotel",
    safeJson({
      reason,
      redirectSearchFlowContextUrl
    })
  );

  wixLocationFrontend.to(redirectSearchFlowContextUrl);
}

function isMissingCurrentCartError(error) {
  const status =
    Number(error?.status) ||
    Number(error?.statusCode) ||
    Number(error?.httpStatus);

  if (status === 404) {
    return true;
  }

  const message = String(error?.message || "").trim().toLowerCase();
  return message.includes("404");
}

function normalizeRequiredText(value, fieldPath) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`${fieldPath} is required.`);
  }

  return text;
}

function normalizeOptionalText(value) {
  return String(value ?? "").trim();
}

function normalizeRequiredQuantity(value, fieldPath) {
  const quantity = Number(value);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`${fieldPath} is required.`);
  }

  return quantity;
}

function safeJson(value) {
  try {
    return JSON.stringify(
      value,
      (key, currentValue) => {
        if (currentValue instanceof Error) {
          const errorPayload = {
            name: currentValue.name,
            message: currentValue.message,
            stack: currentValue.stack
          };

          Object.getOwnPropertyNames(currentValue).forEach((propName) => {
            errorPayload[propName] = currentValue[propName];
          });

          return errorPayload;
        }

        return currentValue;
      },
      2
    );
  } catch (error) {
    return `[unserializable: ${String(error?.message || error)}]`;
  }
}
