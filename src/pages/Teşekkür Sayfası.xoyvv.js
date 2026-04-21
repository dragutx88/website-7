import wixLocationFrontend from "wix-location-frontend";
import wixWindow from "wix-window-frontend";
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

const PAGE_INSTANCE_ID = buildRuntimeId("thankyou-page");
const PAGE_MODULE_EVALUATED_AT = new Date().toISOString();

let onReadyInvocationCount = 0;
let initializeInvocationCount = 0;
let completeBookingInvocationCount = 0;

$w.onReady(async function () {
  const renderingEnv = wixWindow.rendering.env;

  // Browser'da sadece UI'ı completed state'e al, booking yapma
  // SSR zaten booking'i yaptı
  if (renderingEnv === "browser") {
    const completeBookingStateBox = getElement(COMPLETE_BOOKING_STATE_BOX_SELECTOR);
    const completeBookingProgressBar = getElement(COMPLETE_BOOKING_PROGRESS_BAR_SELECTOR);

    // Progress bar'ı gizle/sıfırla
    if (completeBookingProgressBar) {
      try { completeBookingProgressBar.value = 100; } catch (e) {}
      try { completeBookingProgressBar.hide(); } catch (e) {}
    }

    // State box'ı direkt completed'a al
    await changeCompleteBookingState(
      completeBookingStateBox,
      COMPLETE_BOOKING_PROGRESS_COMPLETED_STATE_ID
    );

    return;
  }

  // SSR: booking burada yapılır
  onReadyInvocationCount += 1;

  logCompleteBookingTrace("onReady-enter", {
    onReadyInvocationCount,
    renderingEnv,
    pageEnvironment: capturePageEnvironment()
  });

  try {
    await initializeCompleteBookingFlow();
  } finally {
    logCompleteBookingTrace("onReady-exit", {
      onReadyInvocationCount,
      renderingEnv,
      pageEnvironment: capturePageEnvironment()
    });
  }
});

async function initializeCompleteBookingFlow() {
  initializeInvocationCount += 1;

  const initializeInvocationId = buildRuntimeId("initialize");
  const initializeStartedAt = Date.now();

  logCompleteBookingTrace("initialize-start", {
    initializeInvocationId,
    initializeInvocationCount,
    pageEnvironment: capturePageEnvironment()
  });

  const thankYouPage = getElement(THANK_YOU_PAGE_SELECTOR);
  const completeBookingStateBox = getElement(COMPLETE_BOOKING_STATE_BOX_SELECTOR);
  const completeBookingProgressBar = getElement(
    COMPLETE_BOOKING_PROGRESS_BAR_SELECTOR
  );

  logCompleteBookingTrace("elements-resolved", {
    initializeInvocationId,
    thankYouPageExists: Boolean(thankYouPage),
    thankYouPageHasGetOrder:
      Boolean(thankYouPage) && typeof thankYouPage.getOrder === "function",
    completeBookingStateBoxExists: Boolean(completeBookingStateBox),
    completeBookingProgressBarExists: Boolean(completeBookingProgressBar),
    currentStateId: resolveCurrentStateId(completeBookingStateBox),
    currentProgressValue: resolveProgressValue(completeBookingProgressBar)
  });

  if (!thankYouPage || typeof thankYouPage.getOrder !== "function") {
    console.warn(
      `COMPLETE BOOKING element ${THANK_YOU_PAGE_SELECTOR} is missing or invalid.`
    );

    logCompleteBookingTrace("thankyoupage-missing-or-invalid", {
      initializeInvocationId,
      thankYouPageExists: Boolean(thankYouPage),
      thankYouPageHasGetOrder:
        Boolean(thankYouPage) && typeof thankYouPage.getOrder === "function"
    });

    return;
  }

  try {
    const getOrderStartedAt = Date.now();

    logCompleteBookingTrace("getOrder-start", {
      initializeInvocationId,
      thankYouPageSelector: THANK_YOU_PAGE_SELECTOR
    });

    const currentOrder = await thankYouPage.getOrder();

    logCompleteBookingTrace("getOrder-success", {
      initializeInvocationId,
      elapsedMs: Date.now() - getOrderStartedAt,
      orderSummary: summarizeOrderForTrace(currentOrder)
    });

    const completeBookingDecision = resolveCompleteBookingDecision(currentOrder);

    console.log(
      "COMPLETE BOOKING current order snapshot",
      safeJson({
        pageInstanceId: PAGE_INSTANCE_ID,
        initializeInvocationId,
        orderId: resolveOrderId(currentOrder),
        cartId: normalizeText(currentOrder?.cartId),
        paymentStatus: normalizeText(currentOrder?.paymentStatus).toUpperCase(),
        lineItemsCount: Array.isArray(currentOrder?.lineItems)
          ? currentOrder.lineItems.length
          : 0,
        lineItemOptionsSummary: summarizeOrderLineItemOptions(currentOrder),
        lineItemBookingContextSummary:
          summarizeOrderLineItemBookingContext(currentOrder),
        completeBookingDecision
      })
    );

    logCompleteBookingTrace("decision-resolved", {
      initializeInvocationId,
      completeBookingDecision,
      orderId: resolveOrderId(currentOrder),
      lineItemBookingContextSummary:
        summarizeOrderLineItemBookingContext(currentOrder)
    });

    if (!completeBookingDecision.shouldStartCompleteBooking) {
      logCompleteBookingTrace("decision-skip", {
        initializeInvocationId,
        completeBookingDecision
      });

      return;
    }

    completeBookingInvocationCount += 1;
    const completeBookingInvocationId = buildRuntimeId("complete-booking");
    const completeBookingStartedAt = Date.now();

    const completeBookingPayload = {
      bookingFlowMode: COMPLETE_BOOKING_FLOW_MODE,
      orderId: completeBookingDecision.orderId
    };

    logCompleteBookingTrace("completeBooking-call-start", {
      initializeInvocationId,
      completeBookingInvocationId,
      completeBookingInvocationCount,
      payload: completeBookingPayload,
      orderSummary: summarizeOrderForTrace(currentOrder)
    });

    const completeBookingResult = await completeBooking(completeBookingPayload);

    logCompleteBookingTrace("completeBooking-call-success", {
      initializeInvocationId,
      completeBookingInvocationId,
      elapsedMs: Date.now() - completeBookingStartedAt,
      resultSummary: summarizeCompleteBookingResult(completeBookingResult)
    });

    console.log(
      "COMPLETE BOOKING success",
      safeJson({
        pageInstanceId: PAGE_INSTANCE_ID,
        initializeInvocationId,
        completeBookingInvocationId,
        orderId: completeBookingDecision.orderId,
        completeBookingResult
      })
    );

  } catch (error) {
    console.error("COMPLETE BOOKING failed", error, safeJson(error));

    logCompleteBookingTrace("initialize-failed", {
      initializeInvocationId,
      elapsedMs: Date.now() - initializeStartedAt,
      error: serializeError(error),
      pageEnvironment: capturePageEnvironment()
    });
  } finally {
    logCompleteBookingTrace("initialize-end", {
      initializeInvocationId,
      initializeInvocationCount,
      elapsedMs: Date.now() - initializeStartedAt,
      pageEnvironment: capturePageEnvironment()
    });
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
    const reservationDateType = resolveReservationDateTypeFromLineItem(lineItem);
    if (reservationDateType) {
      return reservationDateType;
    }
  }

  return "";
}

function resolveReservationDateTypeFromLineItem(lineItem) {
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

  return "";
}

function summarizeOrderLineItemOptions(currentOrder) {
  const lineItems = Array.isArray(currentOrder?.lineItems)
    ? currentOrder.lineItems
    : [];

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

function summarizeOrderLineItemBookingContext(currentOrder) {
  const lineItems = Array.isArray(currentOrder?.lineItems)
    ? currentOrder.lineItems
    : [];

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
    appId: normalizeText(lineItem?.catalogReference?.appId),
    catalogItemId: normalizeText(lineItem?.catalogReference?.catalogItemId),
    prebookId: normalizeText(lineItem?.catalogReference?.options?.prebookId),
    reservationDateType: resolveReservationDateTypeFromLineItem(lineItem),
    quantity: normalizeText(lineItem?.quantity)
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
      safeJson({ pageInstanceId: PAGE_INSTANCE_ID, stateId, error })
    );
    return null;
  }
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

function resolveCurrentStateId(completeBookingStateBox) {
  try {
    return normalizeText(completeBookingStateBox?.currentState?.id);
  } catch (error) {
    return "";
  }
}

function resolveProgressValue(completeBookingProgressBar) {
  try {
    return Number(completeBookingProgressBar?.value ?? 0);
  } catch (error) {
    return 0;
  }
}

function summarizeOrderForTrace(currentOrder) {
  return {
    orderId: resolveOrderId(currentOrder),
    cartId: normalizeText(currentOrder?.cartId),
    paymentStatus: normalizeText(currentOrder?.paymentStatus).toUpperCase(),
    lineItemsCount: Array.isArray(currentOrder?.lineItems)
      ? currentOrder.lineItems.length
      : 0,
    lineItemBookingContextSummary: summarizeOrderLineItemBookingContext(currentOrder),
    lineItemOptionsSummary: summarizeOrderLineItemOptions(currentOrder)
  };
}

function summarizeCompleteBookingResult(completeBookingResult) {
  return {
    completedBookingBookingId: normalizeText(
      completeBookingResult?.completedBooking?.data?.bookingId ||
        completeBookingResult?.completedBooking?.bookingId
    ),
    completedBookingStatus: normalizeText(
      completeBookingResult?.completedBooking?.data?.status ||
        completeBookingResult?.completedBooking?.status
    ),
    completedBookingMessage: normalizeText(
      completeBookingResult?.completedBooking?.data?.message ||
        completeBookingResult?.completedBooking?.message
    ),
    normalizedBookingId: normalizeText(
      completeBookingResult?.normalizedBooking?.bookingId
    ),
    normalizedBookingStatus: normalizeText(
      completeBookingResult?.normalizedBooking?.status
    ),
    normalizedHotelConfirmationCode: normalizeText(
      completeBookingResult?.normalizedBooking?.hotelConfirmationCode
    ),
    orderPersistenceStatus: normalizeText(
      completeBookingResult?.persistence?.order?.status
    ),
    orderPersistenceBookingId: normalizeText(
      completeBookingResult?.persistence?.order?.bookingId
    ),
    cmsPersistenceStatus: normalizeText(
      completeBookingResult?.persistence?.cms?.status
    ),
    cmsPersistenceBookingId: normalizeText(
      completeBookingResult?.persistence?.cms?.bookingId
    ),
    cmsSnapshotId: normalizeText(
      completeBookingResult?.persistence?.cms?.cmsSnapshotId
    )
  };
}

function capturePageEnvironment() {
  try {
    return {
      url: normalizeText(wixLocationFrontend?.url),
      path: Array.isArray(wixLocationFrontend?.path)
        ? wixLocationFrontend.path.join("/")
        : normalizeText(wixLocationFrontend?.path),
      query: wixLocationFrontend?.query || {},
      referrer:
        typeof document !== "undefined" ? normalizeText(document?.referrer) : "",
      visibilityState:
        typeof document !== "undefined"
          ? normalizeText(document?.visibilityState)
          : "",
      historyLength:
        typeof window !== "undefined" &&
        typeof window?.history?.length === "number"
          ? window.history.length
          : 0
    };
  } catch (error) {
    return { error: serializeError(error) };
  }
}

function buildRuntimeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function logCompleteBookingTrace(eventName, payload) {
  console.log(
    `COMPLETE BOOKING TRACE ${eventName}`,
    safeJson({
      pageInstanceId: PAGE_INSTANCE_ID,
      pageModuleEvaluatedAt: PAGE_MODULE_EVALUATED_AT,
      eventTimestamp: new Date().toISOString(),
      eventName,
      ...payload
    })
  );
}

function normalizeText(value) {
  return String(value || "").trim();
}

function serializeError(error) {
  return {
    name: normalizeText(error?.name),
    message: normalizeText(error?.message),
    stack: normalizeText(error?.stack),
    code: normalizeText(error?.code)
  };
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