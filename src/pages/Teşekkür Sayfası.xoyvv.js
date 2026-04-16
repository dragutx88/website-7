import { completeBooking } from "backend/liteApi.web";

const BOOKING_FLOW_MODE = "WALLET";
const RESERVATION_DATE_TYPE_LABEL = "Reservation Date Type";
const FLEXIBLE_RESERVATION_DATE_TYPE_DISPLAY = "Flexible";
const ACCEPTED_PAYMENT_STATUSES = new Set(["PAID", "NOT_PAID"]);

$w.onReady(async function () {
  await initializeThankYouFlow();
});

async function initializeThankYouFlow() {
  const thankYouPage = getElement("#thankYouPage1");
  const progressBar = getElement("#bookingProgressBar");

  initializeProgressBar(progressBar);
  await collapseProgressBar(progressBar);
  await expandThankYouPage(thankYouPage);

  if (!thankYouPage || typeof thankYouPage.getOrder !== "function") {
    console.warn("THANK YOU PAGE element #thankYouPage1 is missing or invalid.");
    return;
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
      await collapseProgressBar(progressBar);
      await expandThankYouPage(thankYouPage);
      return;
    }

    await collapseThankYouPage(thankYouPage);
    await expandProgressBar(progressBar);

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

    await collapseProgressBar(progressBar);
    await expandThankYouPage(thankYouPage);
  } catch (error) {
    console.error("THANK YOU PAGE booking failed", error, safeJson(error));

    setProgress(progressBar, 100);
    await sleep(400);

    await collapseProgressBar(progressBar);
    await expandThankYouPage(thankYouPage);
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

function resolveOrderId(order) {
  return normalizeText(order?.id || order?._id);
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

async function expandThankYouPage(element) {
  if (!element) {
    return;
  }

  try {
    if (typeof element.show === "function") {
      await Promise.resolve(element.show());
    }
  } catch (error) {}

  try {
    if (typeof element.expand === "function") {
      await Promise.resolve(element.expand());
    }
  } catch (error) {}
}

async function collapseThankYouPage(element) {
  if (!element) {
    return;
  }

  try {
    if (typeof element.hide === "function") {
      await Promise.resolve(element.hide());
    }
  } catch (error) {}

  try {
    if (typeof element.collapse === "function") {
      await Promise.resolve(element.collapse());
    }
  } catch (error) {}
}

async function expandProgressBar(progressBar) {
  if (!progressBar) {
    return;
  }

  try {
    if (typeof progressBar.show === "function") {
      await Promise.resolve(progressBar.show());
    }
  } catch (error) {}

  try {
    if (typeof progressBar.expand === "function") {
      await Promise.resolve(progressBar.expand());
    }
  } catch (error) {}
}

async function collapseProgressBar(progressBar) {
  if (!progressBar) {
    return;
  }

  try {
    if (typeof progressBar.hide === "function") {
      await Promise.resolve(progressBar.hide());
    }
  } catch (error) {}

  try {
    if (typeof progressBar.collapse === "function") {
      await Promise.resolve(progressBar.collapse());
    }
  } catch (error) {}
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