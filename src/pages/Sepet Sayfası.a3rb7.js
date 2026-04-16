import { currentCart } from "wix-ecom-backend";
import { refreshCart } from "wix-ecom-frontend";

const LITEAPI_CATALOG_APP_ID = "e7f94f4b-7e6a-41c6-8ee1-52c1d5f31cf4";
const RESERVATION_DATE_TYPE_KEY = "reservationDateType";
const FLEXIBLE_RESERVATION_DATE_TYPE_VALUE = "flexible";

let isApplyingReservationDateType = false;
let isProgrammaticSwitchUpdate = false;

$w.onReady(async function () {
  bindReservationDateTypeControls();
  await hydrateReservationDateTypeUi();
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

      const isFlexible = Boolean(event?.target?.checked);
      await applyReservationDateType(isFlexible, "switch");
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

async function hydrateReservationDateTypeUi() {
  try {
    const cart = await currentCart.getCurrentCart();
    const liteApiLineItem = findLiteApiLineItem(cart);

    console.log("CART PAGE currentCart", safeJson(cart));

    if (!liteApiLineItem) {
      setSwitchChecked(false);
      return;
    }

    const optionsState = readLineItemOptionsState(liteApiLineItem);
    const reservationDateType = normalizeText(
      optionsState?.shellOptions?.[RESERVATION_DATE_TYPE_KEY]
    ).toLowerCase();

    const isFlexible = reservationDateType === FLEXIBLE_RESERVATION_DATE_TYPE_VALUE;

    setSwitchChecked(isFlexible);

    console.log(
      "CART PAGE hydrateReservationDateTypeUi",
      safeJson({
        lineItemId: normalizeText(liteApiLineItem?._id),
        catalogItemId: normalizeText(liteApiLineItem?.catalogReference?.catalogItemId),
        prebookId: normalizeText(optionsState?.shellOptions?.prebookId),
        reservationDateType,
        isFlexible
      })
    );
  } catch (error) {
    console.error(
      "CART PAGE hydrateReservationDateTypeUi failed",
      error,
      safeJson(error)
    );
  }
}

async function applyReservationDateType(isFlexible, source) {
  if (isApplyingReservationDateType) {
    return;
  }

  isApplyingReservationDateType = true;

  try {
    setSwitchChecked(isFlexible);

    const cart = await currentCart.getCurrentCart();
    const liteApiLineItem = findLiteApiLineItem(cart);

    if (!liteApiLineItem) {
      console.warn(
        "CART PAGE applyReservationDateType skipped: LiteAPI line item not found",
        safeJson({
          source,
          cartId: normalizeText(cart?._id || cart?.id || cart?.checkoutId),
          isFlexible
        })
      );
      return;
    }

    const catalogReference = liteApiLineItem?.catalogReference || {};
    const optionsState = readLineItemOptionsState(liteApiLineItem);
    const shellOptions = { ...optionsState.shellOptions };

    const currentReservationDateType = normalizeText(
      shellOptions?.[RESERVATION_DATE_TYPE_KEY]
    ).toLowerCase();

    if (isFlexible) {
      if (currentReservationDateType === FLEXIBLE_RESERVATION_DATE_TYPE_VALUE) {
        console.log("CART PAGE applyReservationDateType noop: flexible already set");
        return;
      }

      shellOptions[RESERVATION_DATE_TYPE_KEY] = FLEXIBLE_RESERVATION_DATE_TYPE_VALUE;
    } else {
      if (!currentReservationDateType) {
        console.log("CART PAGE applyReservationDateType noop: flexible already absent");
        return;
      }

      delete shellOptions[RESERVATION_DATE_TYPE_KEY];
    }

    const nextCatalogReferenceOptions = buildCatalogReferenceOptions(
      optionsState,
      shellOptions
    );

    const updatePayload = {
      lineItems: [
        {
          _id: liteApiLineItem?._id,
          quantity: Number(liteApiLineItem?.quantity) || 1,
          catalogReference: {
            appId: normalizeText(catalogReference?.appId),
            catalogItemId: normalizeText(catalogReference?.catalogItemId),
            options: nextCatalogReferenceOptions
          }
        }
      ]
    };

    console.log(
      "CART PAGE applyReservationDateType payload",
      safeJson({
        source,
        isFlexible,
        updatePayload
      })
    );

    await currentCart.updateCurrentCart(updatePayload);
    await refreshCart();
    await hydrateReservationDateTypeUi();
  } catch (error) {
    console.error(
      "CART PAGE applyReservationDateType failed",
      error,
      safeJson(error)
    );
    await hydrateReservationDateTypeUi();
  } finally {
    isApplyingReservationDateType = false;
  }
}

function findLiteApiLineItem(cart) {
  const lineItems = Array.isArray(cart?.lineItems) ? cart.lineItems : [];

  return (
    lineItems.find((lineItem) => {
      const catalogReference = lineItem?.catalogReference || {};
      const optionsState = readLineItemOptionsState(lineItem);

      return (
        normalizeText(catalogReference?.appId) === LITEAPI_CATALOG_APP_ID &&
        normalizeText(catalogReference?.catalogItemId) &&
        normalizeText(optionsState?.shellOptions?.prebookId)
      );
    }) || null
  );
}

function readLineItemOptionsState(lineItem) {
  const rawOptions = lineItem?.catalogReference?.options || {};

  if (
    rawOptions &&
    typeof rawOptions === "object" &&
    !Array.isArray(rawOptions) &&
    rawOptions.options &&
    typeof rawOptions.options === "object" &&
    !Array.isArray(rawOptions.options)
  ) {
    return {
      isNestedShell: true,
      outerOptions: { ...rawOptions },
      shellOptions: { ...rawOptions.options }
    };
  }

  return {
    isNestedShell: false,
    outerOptions: rawOptions && typeof rawOptions === "object" ? { ...rawOptions } : {},
    shellOptions: rawOptions && typeof rawOptions === "object" ? { ...rawOptions } : {}
  };
}

function buildCatalogReferenceOptions(optionsState, nextShellOptions) {
  if (optionsState?.isNestedShell) {
    return {
      ...optionsState.outerOptions,
      options: nextShellOptions
    };
  }

  return nextShellOptions;
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

function normalizeText(value) {
  return String(value || "").trim();
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