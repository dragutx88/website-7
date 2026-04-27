import wixLocationFrontend from "wix-location-frontend";
import { session } from "wix-storage-frontend";
import { currentCart } from "wix-ecom-backend";
import { onCartChange, refreshCart } from "wix-ecom-frontend";

const LITEAPI_CATALOG_APP_ID = "e7f94f4b-7e6a-41c6-8ee1-52c1d5f31cf4";
const RESERVATION_TYPE_KEY = "reservationType";
const FLEXIBLE_RESERVATION_TYPE_VALUE = "flexible";
const CART_RETURN_URL_STORAGE_KEY = "liteapi.cartReturnUrl.v1";

let isApplyingReservationType = false;
let isProgrammaticSwitchUpdate = false;

$w.onReady(async function () {
  bindReservationTypeControls();
  bindCartChangeListener();

  try {
    const cart = await currentCart.getCurrentCart();
    hydrateReservationTypeUi(cart);
  } catch (error) {
    if (isMissingCurrentCartError(error)) {
      redirectToStoredReturnUrl();
      return;
    }

    console.error("CART PAGE onReady failed", error, safeJson(error));
  }
});

function bindReservationTypeControls() {
  const reservationModeSwitch = getElement("#reservationModeSwitch");
  const reservationFlexibleModeButton = getElement("#reservationFlexibleModeButton");
  const reservationNonFlexibleModeButton = getElement("#reservationNonFlexibleModeButton");

  if (reservationModeSwitch) {
    reservationModeSwitch.onChange(async (event) => {
      if (isProgrammaticSwitchUpdate || isApplyingReservationType) {
        return;
      }

      await applyReservationType(Boolean(event?.target?.checked), "switch");
    });
  }

  if (reservationFlexibleModeButton) {
    reservationFlexibleModeButton.onClick(async () => {
      await applyReservationType(true, "flexible-button");
    });
  }

  if (reservationNonFlexibleModeButton) {
    reservationNonFlexibleModeButton.onClick(async () => {
      await applyReservationType(false, "non-flexible-button");
    });
  }
}

function bindCartChangeListener() {
  try {
    onCartChange(async () => {
      try {
        await currentCart.getCurrentCart();
      } catch (error) {
        if (isMissingCurrentCartError(error)) {
          redirectToStoredReturnUrl();
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
    setSwitchChecked(false);

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

  setSwitchChecked(allFlexible);

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
  setReservationControlsDisabled(true);
  setSwitchChecked(isFlexible);

  try {
    const cart = await currentCart.getCurrentCart();
    const cartLineItems = getCartLineItems(cart);
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
      setReservationControlsDisabled(false);
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
      hydrateReservationTypeUi(freshCart);
      setReservationControlsDisabled(false);
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
        updatedRelevantLineItems: updatedRelevantLineItems.map(buildLineItemSummary)
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
          updatedRelevantLineItems: updatedRelevantLineItems.map(buildLineItemSummary)
        })
      );
      redirectToStoredReturnUrl();
      return;
    }

    hydrateReservationTypeUi(updatedCart);
    setReservationControlsDisabled(false);
  } catch (error) {
    if (isMissingCurrentCartError(error)) {
      redirectToStoredReturnUrl();
      return;
    }

    console.error(
      "CART PAGE applyReservationType failed",
      error,
      safeJson(error)
    );
    setReservationControlsDisabled(false);
  } finally {
    isApplyingReservationType = false;
  }
}

function buildAllCartLineItemsUpdatePayload(cartLineItems, isFlexible) {
  return cartLineItems.map((lineItem) => {
    const normalizedLineItem = normalizeCartLineItem(lineItem);
    const nextOptions = buildNextLineItemOptions(normalizedLineItem, isFlexible);

    if (
      !normalizedLineItem.lineItemId ||
      !normalizedLineItem.appId ||
      !normalizedLineItem.catalogItemId
    ) {
      throw new Error(
        `Unable to build cart update payload for line item: ${safeJson({
          lineItemId: normalizedLineItem.lineItemId,
          appId: normalizedLineItem.appId,
          catalogItemId: normalizedLineItem.catalogItemId
        })}`
      );
    }

    return {
      _id: normalizedLineItem.lineItemId,
      quantity: normalizedLineItem.quantity,
      catalogReference: {
        appId: normalizedLineItem.appId,
        catalogItemId: normalizedLineItem.catalogItemId,
        options: nextOptions
      }
    };
  });
}

function buildNextLineItemOptions(lineItem, isFlexible) {
  const nextOptions = { ...(lineItem?.options || {}) };

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
  const catalogReference = lineItem?.catalogReference || {};
  const options = getLineItemShellOptions(lineItem);
  const lineItemId = String(lineItem?._id || "").trim();
  const quantity = Number(lineItem?.quantity) || 1;
  const appId = String(catalogReference?.appId || "").trim();
  const catalogItemId = String(catalogReference?.catalogItemId || "").trim();
  const prebookId = String(options?.prebookId || "").trim();
  const reservationType = String(
    options?.[RESERVATION_TYPE_KEY] || ""
  ).trim().toLowerCase();

  return {
    rawLineItem: lineItem,
    lineItemId,
    quantity,
    appId,
    catalogItemId,
    options,
    prebookId,
    reservationType
  };
}

function isRelevantLiteApiLineItem(lineItem) {
  return (
    lineItem?.appId === LITEAPI_CATALOG_APP_ID &&
    Boolean(lineItem?.catalogItemId) &&
    Boolean(lineItem?.lineItemId) &&
    Boolean(lineItem?.prebookId)
  );
}

function shouldUpdateReservationType(lineItem, isFlexible) {
  const currentReservationType = String(
    lineItem?.reservationType || ""
  ).trim().toLowerCase();

  if (isFlexible) {
    return currentReservationType !== FLEXIBLE_RESERVATION_TYPE_VALUE;
  }

  return Boolean(currentReservationType);
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
      const reservationType = String(
        lineItem?.reservationType || ""
      ).trim().toLowerCase();

      return isFlexible
        ? reservationType === FLEXIBLE_RESERVATION_TYPE_VALUE
        : !reservationType;
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

function getLineItemShellOptions(lineItem) {
  const rawOptions = lineItem?.catalogReference?.options || {};

  return rawOptions && typeof rawOptions === "object" && !Array.isArray(rawOptions)
    ? rawOptions
    : {};
}

function buildLineItemSummary(lineItem) {
  const options = lineItem?.options || {};
  const optionKeys = Object.keys(options || {}).sort();

  return {
    lineItemId: String(lineItem?.lineItemId || "").trim(),
    quantity: Number(lineItem?.quantity) || 1,
    appId: String(lineItem?.appId || "").trim(),
    catalogItemId: String(lineItem?.catalogItemId || "").trim(),
    prebookId: String(lineItem?.prebookId || "").trim(),
    hasPrebookSnapshot: Boolean(
      String(options?.prebookSnapshot || "").trim()
    ),
    reservationType: String(
      options?.[RESERVATION_TYPE_KEY] || ""
    ).trim().toLowerCase(),
    optionKeys,
    optionKeysCount: optionKeys.length
  };
}

function buildUpdatePayloadSummary(lineItem) {
  const options = lineItem?.catalogReference?.options || {};
  const optionKeys = Object.keys(options || {}).sort();

  return {
    _id: String(lineItem?._id || "").trim(),
    quantity: Number(lineItem?.quantity) || 1,
    appId: String(lineItem?.catalogReference?.appId || "").trim(),
    catalogItemId: String(lineItem?.catalogReference?.catalogItemId || "").trim(),
    prebookId: String(options?.prebookId || "").trim(),
    hasPrebookSnapshot: Boolean(
      String(options?.prebookSnapshot || "").trim()
    ),
    reservationType: String(
      options?.[RESERVATION_TYPE_KEY] || ""
    ).trim().toLowerCase(),
    optionKeys,
    optionKeysCount: optionKeys.length
  };
}

function setReservationControlsDisabled(disabled) {
  [
    "#reservationModeSwitch",
    "#reservationFlexibleModeButton",
    "#reservationNonFlexibleModeButton"
  ].forEach((selector) => {
    const element = getElement(selector);

    if (!element) {
      return;
    }

    try {
      if (disabled) {
        if (typeof element.disable === "function") {
          element.disable();
        } else if ("enabled" in element) {
          element.enabled = false;
        }
      } else {
        if (typeof element.enable === "function") {
          element.enable();
        } else if ("enabled" in element) {
          element.enabled = true;
        }
      }
    } catch (error) {
      console.warn(
        "CART PAGE setReservationControlsDisabled failed",
        safeJson({ selector, disabled, error })
      );
    }
  });
}

function redirectToStoredReturnUrl() {
  const returnUrl = String(session.getItem(CART_RETURN_URL_STORAGE_KEY) || "").trim();

  if (!returnUrl) {
    console.warn("CART PAGE redirect skipped: missing stored return URL");
    return;
  }

  wixLocationFrontend.to(returnUrl);
}

function setSwitchChecked(checked) {
  const reservationModeSwitch = getElement("#reservationModeSwitch");
  if (!reservationModeSwitch) {
    return;
  }

  isProgrammaticSwitchUpdate = true;

  try {
    reservationModeSwitch.checked = Boolean(checked);
  } catch (error) {
    console.warn("CART PAGE setSwitchChecked failed", safeJson(error));
  }

  setTimeout(() => {
    isProgrammaticSwitchUpdate = false;
  }, 0);
}

function getElement(selector) {
  try {
    return $w(selector);
  } catch (error) {
    return null;
  }
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
