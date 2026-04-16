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
    const resolved = resolveSingleLiteApiCartLineItem(cart);

    console.log("CART PAGE currentCart", safeJson(cart));

    if (!resolved.lineItem) {
      setSwitchChecked(false);

      console.warn(
        "CART PAGE hydrateReservationDateTypeUi unresolved target",
        safeJson({
          reason: resolved.reason,
          candidates: resolved.candidates.map(buildCandidateSummary)
        })
      );
      return;
    }

    const optionsState = readLineItemOptionsState(resolved.lineItem);
    const reservationDateType = normalizeText(
      optionsState?.shellOptions?.[RESERVATION_DATE_TYPE_KEY]
    ).toLowerCase();

    const isFlexible = reservationDateType === FLEXIBLE_RESERVATION_DATE_TYPE_VALUE;

    setSwitchChecked(isFlexible);

    console.log(
      "CART PAGE hydrateReservationDateTypeUi",
      safeJson({
        lineItemId: normalizeText(resolved.lineItem?._id),
        catalogItemId: normalizeText(resolved.lineItem?.catalogReference?.catalogItemId),
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
    const resolved = resolveSingleLiteApiCartLineItem(cart);

    if (!resolved.lineItem) {
      console.warn(
        "CART PAGE applyReservationDateType skipped: unresolved LiteAPI line item",
        safeJson({
          source,
          isFlexible,
          reason: resolved.reason,
          candidates: resolved.candidates.map(buildCandidateSummary)
        })
      );
      return;
    }

    const lineItem = resolved.lineItem;
    const catalogReference = lineItem?.catalogReference || {};
    const optionsState = readLineItemOptionsState(lineItem);
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
          _id: lineItem?._id,
          quantity: Number(lineItem?.quantity) || 1,
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
        lineItemId: normalizeText(lineItem?._id),
        prebookId: normalizeText(optionsState?.shellOptions?.prebookId),
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

function resolveSingleLiteApiCartLineItem(cart) {
  const candidates = collectLiteApiCartLineItemCandidates(cart);

  if (candidates.length === 0) {
    return {
      lineItem: null,
      reason: "no-candidate",
      candidates
    };
  }

  if (candidates.length > 1) {
    return {
      lineItem: null,
      reason: "ambiguous-candidates",
      candidates
    };
  }

  return {
    lineItem: candidates[0].lineItem,
    reason: "resolved",
    candidates
  };
}

function collectLiteApiCartLineItemCandidates(cart) {
  const lineItems = Array.isArray(cart?.lineItems) ? cart.lineItems : [];

  return lineItems
    .map((lineItem) => {
      const catalogReference = lineItem?.catalogReference || {};
      const optionsState = readLineItemOptionsState(lineItem);

      const lineItemId = normalizeText(lineItem?._id);
      const appId = normalizeText(catalogReference?.appId);
      const catalogItemId = normalizeText(catalogReference?.catalogItemId);
      const prebookId = normalizeText(optionsState?.shellOptions?.prebookId);

      const looksLikeLiteApiItem = appId === LITEAPI_CATALOG_APP_ID;
      const isUsableCandidate =
        looksLikeLiteApiItem &&
        Boolean(lineItemId) &&
        Boolean(prebookId) &&
        Boolean(catalogItemId);

      if (!isUsableCandidate) {
        return null;
      }

      return {
        lineItem,
        lineItemId,
        catalogItemId,
        prebookId
      };
    })
    .filter(Boolean);
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

function buildCandidateSummary(candidate) {
  return {
    lineItemId: normalizeText(candidate?.lineItemId),
    catalogItemId: normalizeText(candidate?.catalogItemId),
    prebookId: normalizeText(candidate?.prebookId)
  };
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