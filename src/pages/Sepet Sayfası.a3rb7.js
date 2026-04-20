import wixLocationFrontend from "wix-location-frontend";
import { session } from "wix-storage-frontend";
import { currentCart } from "wix-ecom-backend";
import { onCartChange, refreshCart } from "wix-ecom-frontend";

const LITEAPI_CATALOG_APP_ID = "e7f94f4b-7e6a-41c6-8ee1-52c1d5f31cf4";
const RESERVATION_DATE_TYPE_KEY = "reservationDateType";
const FLEXIBLE_RESERVATION_DATE_TYPE_VALUE = "flexible";
const CART_RETURN_URL_STORAGE_KEY = "liteapi.cartReturnUrl.v1";

let isApplyingReservationDateType = false;
let isProgrammaticSwitchUpdate = false;

$w.onReady(async function () {
  bindReservationDateTypeControls();
  bindCartChangeListener();

  try {
    const cart = await currentCart.getCurrentCart();
    hydrateReservationDateTypeUi(cart);
  } catch (error) {
    if (isMissingCurrentCartError(error)) {
      redirectToStoredReturnUrl();
      return;
    }

    console.error("CART PAGE onReady failed", error, safeJson(error));
  }
});

function bindReservationDateTypeControls() {
  const reservationModeSwitch = getElement("#reservationModeSwitch");
  const reservationFlexibleModeButton = getElement("#reservationFlexibleModeButton");
  const reservationNonFlexibleModeButton = getElement("#reservationNonFlexibleModeButton");

  if (reservationModeSwitch) {
    reservationModeSwitch.onChange(async (event) => {
      if (isProgrammaticSwitchUpdate || isApplyingReservationDateType) {
        return;
      }

      await applyReservationDateType(Boolean(event?.target?.checked), "switch");
    });
  }

  if (reservationFlexibleModeButton) {
    reservationFlexibleModeButton.onClick(async () => {
      await applyReservationDateType(true, "flexible-button");
    });
  }

  if (reservationNonFlexibleModeButton) {
    reservationNonFlexibleModeButton.onClick(async () => {
      await applyReservationDateType(false, "non-flexible-button");
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

function hydrateReservationDateTypeUi(cart) {
  const relevantLineItems = getRelevantLiteApiLineItems(cart);

  if (!relevantLineItems.length) {
    setSwitchChecked(false);

    console.warn(
      "CART PAGE hydrateReservationDateTypeUi no relevant LiteAPI line items"
    );
    return;
  }

  const allFlexible = relevantLineItems.every((lineItem) => {
    const shellOptions = getLineItemShellOptions(lineItem);
    return (
      String(shellOptions?.[RESERVATION_DATE_TYPE_KEY] || "").trim().toLowerCase() ===
      FLEXIBLE_RESERVATION_DATE_TYPE_VALUE
    );
  });

  setSwitchChecked(allFlexible);

  console.log(
    "CART PAGE hydrateReservationDateTypeUi",
    safeJson({
      relevantLineItemsCount: relevantLineItems.length,
      allFlexible,
      lineItems: relevantLineItems.map((lineItem) => {
        const shellOptions = getLineItemShellOptions(lineItem);

        return {
          lineItemId: resolveLineItemId(lineItem),
          catalogItemId: String(lineItem?.catalogReference?.catalogItemId || "").trim(),
          prebookId: String(shellOptions?.prebookId || "").trim(),
          hasPrebookSnapshot: Boolean(
            String(shellOptions?.prebookSnapshot || "").trim()
          ),
          reservationDateType: String(
            shellOptions?.[RESERVATION_DATE_TYPE_KEY] || ""
          ).trim().toLowerCase()
        };
      })
    })
  );
}

async function applyReservationDateType(isFlexible, source) {
  if (isApplyingReservationDateType) {
    return;
  }

  isApplyingReservationDateType = true;
  setReservationControlsDisabled(true);
  setSwitchChecked(isFlexible);

  try {
    const cart = await currentCart.getCurrentCart();
    const relevantLineItems = getRelevantLiteApiLineItems(cart);

    if (!relevantLineItems.length) {
      console.warn(
        "CART PAGE applyReservationDateType skipped: no relevant LiteAPI line items",
        safeJson({ source, isFlexible })
      );
      setReservationControlsDisabled(false);
      return;
    }

    const lineItemsToUpdate = relevantLineItems
      .map((lineItem) => {
        const catalogReference = lineItem?.catalogReference || {};
        const appId = String(catalogReference?.appId || "").trim();
        const catalogItemId = String(catalogReference?.catalogItemId || "").trim();
        const quantity = Number(lineItem?.quantity) || 1;
        const shellOptions = { ...getLineItemShellOptions(lineItem) };
        const currentReservationDateType = String(
          shellOptions?.[RESERVATION_DATE_TYPE_KEY] || ""
        ).trim().toLowerCase();

        if (!appId || !catalogItemId) {
          return null;
        }

        if (isFlexible) {
          if (currentReservationDateType === FLEXIBLE_RESERVATION_DATE_TYPE_VALUE) {
            return null;
          }

          shellOptions[RESERVATION_DATE_TYPE_KEY] = FLEXIBLE_RESERVATION_DATE_TYPE_VALUE;
        } else {
          if (!currentReservationDateType) {
            return null;
          }

          delete shellOptions[RESERVATION_DATE_TYPE_KEY];
        }

        return {
          quantity,
          catalogReference: {
            appId,
            catalogItemId,
            options: shellOptions
          }
        };
      })
      .filter(Boolean);

    if (!lineItemsToUpdate.length) {
      console.log(
        "CART PAGE applyReservationDateType noop",
        safeJson({
          source,
          isFlexible,
          relevantLineItemsCount: relevantLineItems.length
        })
      );

      const freshCart = await currentCart.getCurrentCart();
      hydrateReservationDateTypeUi(freshCart);
      setReservationControlsDisabled(false);
      return;
    }

    console.log(
      "CART PAGE applyReservationDateType payload",
      safeJson({
        source,
        isFlexible,
        lineItemsToUpdate: lineItemsToUpdate.map((lineItem) => ({
          appId: String(lineItem?.catalogReference?.appId || "").trim(),
          catalogItemId: String(lineItem?.catalogReference?.catalogItemId || "").trim(),
          reservationDateType: String(
            lineItem?.catalogReference?.options?.[RESERVATION_DATE_TYPE_KEY] || ""
          ).trim().toLowerCase()
        }))
      })
    );

    await currentCart.updateCurrentCart({
      lineItems: lineItemsToUpdate
    });

    await refreshCart();

    const updatedCart = await currentCart.getCurrentCart();
    const updatedRelevantLineItems = getRelevantLiteApiLineItems(updatedCart);

    const verificationPassed =
      updatedRelevantLineItems.length > 0 &&
      updatedRelevantLineItems.every((lineItem) => {
        const shellOptions = getLineItemShellOptions(lineItem);
        const reservationDateType = String(
          shellOptions?.[RESERVATION_DATE_TYPE_KEY] || ""
        ).trim().toLowerCase();

        return isFlexible
          ? reservationDateType === FLEXIBLE_RESERVATION_DATE_TYPE_VALUE
          : !reservationDateType;
      });

    if (!verificationPassed) {
      console.warn(
        "CART PAGE applyReservationDateType verification failed",
        safeJson({
          source,
          isFlexible,
          updatedLineItems: updatedRelevantLineItems.map((lineItem) => {
            const shellOptions = getLineItemShellOptions(lineItem);

            return {
              lineItemId: resolveLineItemId(lineItem),
              catalogItemId: String(lineItem?.catalogReference?.catalogItemId || "").trim(),
              prebookId: String(shellOptions?.prebookId || "").trim(),
              hasPrebookSnapshot: Boolean(
                String(shellOptions?.prebookSnapshot || "").trim()
              ),
              reservationDateType: String(
                shellOptions?.[RESERVATION_DATE_TYPE_KEY] || ""
              ).trim().toLowerCase()
            };
          })
        })
      );
      redirectToStoredReturnUrl();
      return;
    }

    hydrateReservationDateTypeUi(updatedCart);
    setReservationControlsDisabled(false);
  } catch (error) {
    if (isMissingCurrentCartError(error)) {
      redirectToStoredReturnUrl();
      return;
    }

    console.error(
      "CART PAGE applyReservationDateType failed",
      error,
      safeJson(error)
    );
    setReservationControlsDisabled(false);
  } finally {
    isApplyingReservationDateType = false;
  }
}

function getRelevantLiteApiLineItems(cart) {
  const lineItems = Array.isArray(cart?.lineItems) ? cart.lineItems : [];

  return lineItems.filter((lineItem) => {
    const appId = String(lineItem?.catalogReference?.appId || "").trim();
    const catalogItemId = String(lineItem?.catalogReference?.catalogItemId || "").trim();
    const lineItemId = resolveLineItemId(lineItem);
    const shellOptions = getLineItemShellOptions(lineItem);
    const prebookId = String(shellOptions?.prebookId || "").trim();

    return (
      appId === LITEAPI_CATALOG_APP_ID &&
      Boolean(catalogItemId) &&
      Boolean(lineItemId) &&
      Boolean(prebookId)
    );
  });
}

function getLineItemShellOptions(lineItem) {
  const rawOptions = lineItem?.catalogReference?.options || {};

  return rawOptions && typeof rawOptions === "object" && !Array.isArray(rawOptions)
    ? rawOptions
    : {};
}

function resolveLineItemId(lineItem) {
  return String(
    lineItem?._id ||
      lineItem?.id ||
      lineItem?.lineItemId ||
      lineItem?._lineItemId ||
      ""
  ).trim();
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