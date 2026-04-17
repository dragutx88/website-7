import { completeBooking } from "backend/liteApi.web";

const BOOKING_FLOW_MODE = "WALLET";
const THANK_YOU_FLOW_STATE_BOX_ID = "#thankYouFlowStateBox";
const THANK_YOU_PAGE_STATE_ID = "thankYouPageState";
const BOOKING_PROGRESS_STATE_ID = "bookingProgressState";

const RESERVATION_DATE_TYPE_LABEL = "Reservation Date Type";
const FLEXIBLE_RESERVATION_DATE_TYPE_DISPLAY = "Flexible";
const ACCEPTED_PAYMENT_STATUSES = new Set(["PAID", "NOT_PAID"]);

$w.onReady(async function () {
  await initializeThankYouFlow();
});

async function initializeThankYouFlow() {
  const thankYouFlowStateBox = getElement(THANK_YOU_FLOW_STATE_BOX_ID);
  const thankYouPage = getElement("#thankYouPage1");
  const progressBar = getElement("#bookingProgressBar");

  initializeProgressBar(progressBar);
  await changeFlowState(thankYouFlowStateBox, THANK_YOU_PAGE_STATE_ID);

  if (!thankYouFlowStateBox) {
    console.warn(`THANK YOU PAGE element ${THANK_YOU_FLOW_STATE_BOX_ID} is missing.`);
    return;
  }

  if (!thankYouPage || typeof thankYouPage.getOrder !== "function") {
    console.warn("THANK YOU PAGE element #thankYouPage1 is missing or invalid.");
    return;
  }

  if (!progressBar) {
    console.warn("THANK YOU PAGE element #bookingProgressBar is missing.");
  }

  try {
    const order = await thankYouPage.getOrder();
    const decision = resolveThankYouDecision(order);

    console.log(
      "THANK YOU PAGE current order snapshot",
      safeJson({
        orderId: resolveOrderId(order),
        cartId: normalizeText(order?.cartId),
        paymentStatus: normalizeText(order?.paymentStatus).toUpperCase(),
        lineItemsCount: Array.isArray(order?.lineItems) ? order.lineItems.length : 0,
        lineItemOptionsSummary: summarizeOrderLineItemOptions(order),
        decision
      })
    );

    if (!decision.shouldStartBooking) {
      await changeFlowState(thankYouFlowStateBox, THANK_YOU_PAGE_STATE_ID);
      return;
    }

    console.log("THANK YOU PAGE switching to bookingProgressState");

    setProgress(progressBar, 1);
    await changeFlowState(thankYouFlowStateBox, BOOKING_PROGRESS_STATE_ID);
    await sleep(180);

    setProgress(progressBar, 15);
    await sleep(250);

    setProgress(progressBar, 35);
    await sleep(250);

    const bookingResult = await completeBooking({
      bookingFlowMode: BOOKING_FLOW_MODE,
      orderId: decision.orderId
    });

    console.log(
      "THANK YOU PAGE booking success",
      safeJson({
        orderId: decision.orderId,
        bookingResult
      })
    );

    setProgress(progressBar, 75);
    await sleep(250);

    setProgress(progressBar, 100);
    await sleep(500);

    console.log("THANK YOU PAGE switching to thankYouPageState");

    await changeFlowState(thankYouFlowStateBox, THANK_YOU_PAGE_STATE_ID);
  } catch (error) {
    console.error("THANK YOU PAGE booking failed", error, safeJson(error));

    setProgress(progressBar, 100);
    await sleep(400);

    console.log("THANK YOU PAGE switching to thankYouPageState after failure");

    await changeFlowState(thankYouFlowStateBox, THANK_YOU_PAGE_STATE_ID);
  }
}

function resolveThankYouDecision(order) {
  const orderId = resolveOrderId(order);
  const paymentStatus = normalizeText(order?.paymentStatus).toUpperCase();
  const reservationDateType = resolveReservationDateTypeFromOrder(order);
  const hasFlexibleReservationDateType =
    reservationDateType === FLEXIBLE_RESERVATION_DATE_TYPE_DISPLAY.toLowerCase();
  const hasLineItems = Array.isArray(order?.lineItems) && order.lineItems.length > 0;

  if (!orderId) {
    return {
      shouldStartBooking: false,
      reason: "missing-order-id",
      orderId: "",
      paymentStatus,
      reservationDateType
    };
  }

  if (!ACCEPTED_PAYMENT_STATUSES.has(paymentStatus)) {
    return {
      shouldStartBooking: false,
      reason: "payment-status-not-eligible",
      orderId,
      paymentStatus,
      reservationDateType
    };
  }

  if (!hasLineItems) {
    return {
      shouldStartBooking: false,
      reason: "missing-line-items",
      orderId,
      paymentStatus,
      reservationDateType
    };
  }

  if (hasFlexibleReservationDateType) {
    return {
      shouldStartBooking: false,
      reason: "flexible-reservation-selected",
      orderId,
      paymentStatus,
      reservationDateType
    };
  }

  return {
    shouldStartBooking: true,
    reason: "eligible-for-wallet-booking",
    orderId,
    paymentStatus,
    reservationDateType
  };
}

function resolveReservationDateTypeFromOrder(order) {
  const lineItems = Array.isArray(order?.lineItems) ? order.lineItems : [];

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

function summarizeOrderLineItemOptions(order) {
  const lineItems = Array.isArray(order?.lineItems) ? order.lineItems : [];

  return lineItems.map((lineItem, index) => ({
    index,
    lineItemId: normalizeText(
      lineItem?._id || lineItem?.id || lineItem?.lineItemId || lineItem?._lineItemId
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

async function changeFlowState(stateBox, stateId) {
  if (!stateBox || !stateId) {
    return null;
  }

  try {
    return await Promise.resolve(stateBox.changeState(stateId));
  } catch (error) {
    console.warn(
      "THANK YOU PAGE changeFlowState failed",
      safeJson({
        stateId,
        error
      })
    );
    return null;
  }
}

function initializeProgressBar(progressBar) {
  if (!progressBar) {
    return;
  }

  try {
    progressBar.targetValue = 100;
  } catch (error) {}

  try {
    progressBar.value = 0;
  } catch (error) {}
}

function setProgress(progressBar, value) {
  if (!progressBar) {
    return;
  }

  try {
    progressBar.value = Number(value || 0);
  } catch (error) {}
}

function resolveOrderId(order) {
  return normalizeText(order?.id || order?._id);
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}