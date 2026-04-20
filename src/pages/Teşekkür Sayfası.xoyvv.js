import { completeBooking } from "backend/liteApi.web";

const COMPLETE_BOOKING_FLOW_MODE = "WALLET";

const COMPLETE_BOOKING_STATE_BOX_SELECTOR = "#completeBookingStateBox";
const COMPLETE_BOOKING_PROGRESS_BAR_SELECTOR = "#completeBookingProgressBar";
const THANK_YOU_PAGE_SELECTOR = "#thankYouPage1";

const COMPLETE_BOOKING_PROGRESS_STATE_ID = "completeBookingProgressState";
const COMPLETE_BOOKING_PROGRESS_COMPLETED_STATE_ID =
  "completeBookingProgressCompletedState";

const RESERVATION_DATE_TYPE_LABEL = "Reservation Date Type";
const FLEXIBLE_RESERVATION_DATE_TYPE_DISPLAY = "Flexible";

const COMPLETE_BOOKING_ACCEPTED_ORDER_PAYMENT_STATUSES = new Set([
  "PAID",
  "NOT_PAID"
]);

$w.onReady(async function () {
  await initializeCompleteBookingFlow();
});

async function initializeCompleteBookingFlow() {
  const thankYouPage = getElement(THANK_YOU_PAGE_SELECTOR);
  const completeBookingStateBox = getElement(COMPLETE_BOOKING_STATE_BOX_SELECTOR);
  const completeBookingProgressBar = getElement(
    COMPLETE_BOOKING_PROGRESS_BAR_SELECTOR
  );

  initializeCompleteBookingProgressBar(completeBookingProgressBar);

  if (!thankYouPage || typeof thankYouPage.getOrder !== "function") {
    console.warn(
      `COMPLETE BOOKING element ${THANK_YOU_PAGE_SELECTOR} is missing or invalid.`
    );
    return;
  }

  if (!completeBookingStateBox) {
    console.warn(
      `COMPLETE BOOKING element ${COMPLETE_BOOKING_STATE_BOX_SELECTOR} is missing.`
    );
  }

  if (!completeBookingProgressBar) {
    console.warn(
      `COMPLETE BOOKING element ${COMPLETE_BOOKING_PROGRESS_BAR_SELECTOR} is missing.`
    );
  }

  try {
    const currentOrder = await thankYouPage.getOrder();
    const completeBookingDecision = resolveCompleteBookingDecision(currentOrder);

    console.log(
      "COMPLETE BOOKING current order snapshot",
      safeJson({
        orderId: resolveOrderId(currentOrder),
        cartId: normalizeText(currentOrder?.cartId),
        paymentStatus: normalizeText(currentOrder?.paymentStatus).toUpperCase(),
        lineItemsCount: Array.isArray(currentOrder?.lineItems)
          ? currentOrder.lineItems.length
          : 0,
        lineItemOptionsSummary: summarizeOrderLineItemOptions(currentOrder),
        completeBookingDecision
      })
    );

    if (!completeBookingDecision.shouldStartCompleteBooking) {
      return;
    }

    setCompleteBookingProgress(completeBookingProgressBar, 1);

    console.log("COMPLETE BOOKING switching to completeBookingProgressState");

    await changeCompleteBookingState(
      completeBookingStateBox,
      COMPLETE_BOOKING_PROGRESS_STATE_ID
    );

    const completeBookingResult = await completeBooking({
      bookingFlowMode: COMPLETE_BOOKING_FLOW_MODE,
      orderId: completeBookingDecision.orderId
    });

    console.log(
      "COMPLETE BOOKING success",
      safeJson({
        orderId: completeBookingDecision.orderId,
        completeBookingResult
      })
    );

    setCompleteBookingProgress(completeBookingProgressBar, 100);

    console.log(
      "COMPLETE BOOKING switching to completeBookingProgressCompletedState"
    );

    await changeCompleteBookingState(
      completeBookingStateBox,
      COMPLETE_BOOKING_PROGRESS_COMPLETED_STATE_ID
    );
  } catch (error) {
    console.error("COMPLETE BOOKING failed", error, safeJson(error));

    setCompleteBookingProgress(completeBookingProgressBar, 100);

    console.log(
      "COMPLETE BOOKING switching to completeBookingProgressCompletedState after failure"
    );

    await changeCompleteBookingState(
      completeBookingStateBox,
      COMPLETE_BOOKING_PROGRESS_COMPLETED_STATE_ID
    );
  }
}

function resolveCompleteBookingDecision(currentOrder) {
  const orderId = resolveOrderId(currentOrder);
  const paymentStatus = normalizeText(currentOrder?.paymentStatus).toUpperCase();
  const reservationDateType = resolveReservationDateTypeFromOrder(currentOrder);
  const hasFlexibleReservationDateType =
    reservationDateType === FLEXIBLE_RESERVATION_DATE_TYPE_DISPLAY.toLowerCase();
  const hasLineItems =
    Array.isArray(currentOrder?.lineItems) && currentOrder.lineItems.length > 0;

  if (!orderId) {
    return {
      shouldStartCompleteBooking: false,
      reason: "missing-order-id",
      orderId: "",
      paymentStatus,
      reservationDateType
    };
  }

  if (!COMPLETE_BOOKING_ACCEPTED_ORDER_PAYMENT_STATUSES.has(paymentStatus)) {
    return {
      shouldStartCompleteBooking: false,
      reason: "payment-status-not-eligible",
      orderId,
      paymentStatus,
      reservationDateType
    };
  }

  if (!hasLineItems) {
    return {
      shouldStartCompleteBooking: false,
      reason: "missing-line-items",
      orderId,
      paymentStatus,
      reservationDateType
    };
  }

  if (hasFlexibleReservationDateType) {
    return {
      shouldStartCompleteBooking: false,
      reason: "flexible-reservation-selected",
      orderId,
      paymentStatus,
      reservationDateType
    };
  }

  return {
    shouldStartCompleteBooking: true,
    reason: "eligible-for-wallet-booking",
    orderId,
    paymentStatus,
    reservationDateType
  };
}

function resolveReservationDateTypeFromOrder(currentOrder) {
  const lineItems = Array.isArray(currentOrder?.lineItems)
    ? currentOrder.lineItems
    : [];

  for (const lineItem of lineItems) {
    const options = Array.isArray(lineItem?.options) ? lineItem.options : [];

    for (const optionItem of options) {
      const optionName = normalizeText(optionItem?.option);
      const selection = normalizeText(optionItem?.selection);

      if (
        optionName.toLowerCase() === RESERVATION_DATE_TYPE_LABEL.toLowerCase() &&
        selection
      ) {
        return selection.toLowerCase();
      }

      const combined = `${optionName} ${selection}`.toLowerCase();

      if (
        combined.includes(RESERVATION_DATE_TYPE_LABEL.toLowerCase()) &&
        combined.includes(FLEXIBLE_RESERVATION_DATE_TYPE_DISPLAY.toLowerCase())
      ) {
        return FLEXIBLE_RESERVATION_DATE_TYPE_DISPLAY.toLowerCase();
      }
    }
  }

  return "";
}

function summarizeOrderLineItemOptions(currentOrder) {
  const lineItems = Array.isArray(currentOrder?.lineItems)
    ? currentOrder.lineItems
    : [];

  return lineItems.map((lineItem, index) => ({
    index,
    lineItemId: normalizeText(
      lineItem?._id ||
        lineItem?.id ||
        lineItem?.lineItemId ||
        lineItem?._lineItemId
    ),
    name: normalizeText(
      lineItem?.name ||
        lineItem?.productName?.translated ||
        lineItem?.productName?.original
    ),
    options: Array.isArray(lineItem?.options)
      ? lineItem.options.map((optionItem) => ({
          option: normalizeText(optionItem?.option),
          selection: normalizeText(optionItem?.selection)
        }))
      : []
  }));
}

async function changeCompleteBookingState(completeBookingStateBox, stateId) {
  if (!completeBookingStateBox || !stateId) {
    return null;
  }

  try {
    return await Promise.resolve(completeBookingStateBox.changeState(stateId));
  } catch (error) {
    console.warn(
      "COMPLETE BOOKING change state failed",
      safeJson({
        stateId,
        error
      })
    );
    return null;
  }
}

function initializeCompleteBookingProgressBar(completeBookingProgressBar) {
  if (!completeBookingProgressBar) {
    return;
  }

  try {
    completeBookingProgressBar.targetValue = 100;
  } catch (error) {}

  try {
    completeBookingProgressBar.value = 0;
  } catch (error) {}
}

function setCompleteBookingProgress(completeBookingProgressBar, value) {
  if (!completeBookingProgressBar) {
    return;
  }

  try {
    completeBookingProgressBar.value = Number(value || 0);
  } catch (error) {}
}

function resolveOrderId(currentOrder) {
  return normalizeText(currentOrder?.id || currentOrder?._id);
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