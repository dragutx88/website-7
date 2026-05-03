import wixWindow from "wix-window-frontend";
import { completeBooking } from "backend/liteApi.web";

const COMPLETE_BOOKING_FLOW_MODE = "WALLET";

const COMPLETE_BOOKING_STATE_BOX_SELECTOR = "#completeBookingStateBox";
const THANK_YOU_PAGE_SELECTOR = "#thankYouPage1";

const COMPLETE_BOOKING_PROGRESS_STATE_ID = "completeBookingProgressState";
const COMPLETE_BOOKING_PROGRESS_COMPLETED_STATE_ID =
  "completeBookingProgressCompletedState";

const RESERVATION_TYPE_LABEL = "Reservation Type";
const FLEXIBLE_RESERVATION_TYPE_VALUE = "flexible";

const COMPLETE_BOOKING_ACCEPTED_ORDER_PAYMENT_STATUSES = new Set([
  "PAID",
  "NOT_PAID"
]);

let isCompleteBookingFlowRunning = false;

$w.onReady(function () {
  const renderingEnv = wixWindow.rendering.env;

  console.log("COMPLETE BOOKING onReady", {
    renderingEnv,
    bookingMode: "browser-only",
    uiMode: "statebox-only",
    backendBookingCallEnabled: true,
    completeBookingType: typeof completeBooking
  });

  if (renderingEnv !== "browser") {
    console.log("COMPLETE BOOKING skipped outside browser", {
      renderingEnv
    });
    return;
  }

  if (isCompleteBookingFlowRunning) {
    console.warn("COMPLETE BOOKING skipped because flow is already running");
    return;
  }

  isCompleteBookingFlowRunning = true;

  initializeCompleteBookingFlow()
    .catch((error) => {
      console.error("COMPLETE BOOKING onReady flow failed", {
        name: error?.name,
        message: error?.message,
        stack: error?.stack
      });
    })
    .finally(() => {
      isCompleteBookingFlowRunning = false;
    });
});

async function initializeCompleteBookingFlow() {
  const initializeStartedAt = Date.now();

  const thankYouPage = $w(THANK_YOU_PAGE_SELECTOR);
  const completeBookingStateBox = $w(COMPLETE_BOOKING_STATE_BOX_SELECTOR);

  console.log("COMPLETE BOOKING initialize-enter", {
    thankYouPageHasGetOrder: typeof thankYouPage.getOrder === "function",
    thankYouPageCollapsed: Boolean(thankYouPage.collapsed),
    thankYouPageHidden: Boolean(thankYouPage.hidden),
    thankYouPageIsVisible: Boolean(thankYouPage.isVisible),
    stateBoxCurrentStateId: normalizeText(
      completeBookingStateBox.currentState?.id
    ),
    stateBoxCollapsed: Boolean(completeBookingStateBox.collapsed),
    stateBoxHidden: Boolean(completeBookingStateBox.hidden),
    stateBoxIsVisible: Boolean(completeBookingStateBox.isVisible)
  });

  await thankYouPage.collapse();
  await completeBookingStateBox.expand();
  await completeBookingStateBox.changeState(COMPLETE_BOOKING_PROGRESS_STATE_ID);

  console.log("COMPLETE BOOKING ui-waiting-state", {
    thankYouPageCollapsed: Boolean(thankYouPage.collapsed),
    thankYouPageHidden: Boolean(thankYouPage.hidden),
    thankYouPageIsVisible: Boolean(thankYouPage.isVisible),
    stateBoxCurrentStateId: normalizeText(
      completeBookingStateBox.currentState?.id
    ),
    stateBoxCollapsed: Boolean(completeBookingStateBox.collapsed),
    stateBoxHidden: Boolean(completeBookingStateBox.hidden),
    stateBoxIsVisible: Boolean(completeBookingStateBox.isVisible)
  });

  if (typeof thankYouPage.getOrder !== "function") {
    console.warn("COMPLETE BOOKING getOrder missing", {
      thankYouPageHasGetOrder: false
    });

    await completeBookingStateBox.changeState(
      COMPLETE_BOOKING_PROGRESS_COMPLETED_STATE_ID
    );
    await thankYouPage.expand();

    console.log("COMPLETE BOOKING ui-completed-after-getOrder-missing", {
      completedStateId: COMPLETE_BOOKING_PROGRESS_COMPLETED_STATE_ID,
      thankYouPageCollapsed: Boolean(thankYouPage.collapsed),
      thankYouPageIsVisible: Boolean(thankYouPage.isVisible),
      stateBoxCurrentStateId: normalizeText(
        completeBookingStateBox.currentState?.id
      )
    });

    return;
  }

  try {
    const getOrderStartedAt = Date.now();

    console.log("COMPLETE BOOKING getOrder-start", {
      thankYouPageHasGetOrder: typeof thankYouPage.getOrder === "function"
    });

    const currentOrder = await thankYouPage.getOrder();

    console.log("COMPLETE BOOKING getOrder-success", {
      elapsedMs: Date.now() - getOrderStartedAt,
      hasOrder: Boolean(currentOrder),
      hasOrderId: Boolean(resolveOrderId(currentOrder)),
      paymentStatus: normalizeText(currentOrder?.paymentStatus).toUpperCase(),
      lineItemsCount: Array.isArray(currentOrder?.lineItems)
        ? currentOrder.lineItems.length
        : 0,
      reservationType: resolveReservationTypeFromOrder(currentOrder)
    });

    const completeBookingDecision = resolveCompleteBookingDecision(currentOrder);

    console.log("COMPLETE BOOKING decision-resolved", {
      shouldStartCompleteBooking:
        completeBookingDecision.shouldStartCompleteBooking,
      reason: completeBookingDecision.reason,
      hasOrderId: Boolean(completeBookingDecision.orderId),
      paymentStatus: completeBookingDecision.paymentStatus,
      reservationType: completeBookingDecision.reservationType
    });

    if (!completeBookingDecision.shouldStartCompleteBooking) {
      console.log("COMPLETE BOOKING decision-skip", {
        reason: completeBookingDecision.reason,
        hasOrderId: Boolean(completeBookingDecision.orderId),
        paymentStatus: completeBookingDecision.paymentStatus,
        reservationType: completeBookingDecision.reservationType
      });

      await completeBookingStateBox.changeState(
        COMPLETE_BOOKING_PROGRESS_COMPLETED_STATE_ID
      );
      await thankYouPage.expand();

      console.log("COMPLETE BOOKING ui-completed-after-decision-skip", {
        reason: completeBookingDecision.reason,
        completedStateId: COMPLETE_BOOKING_PROGRESS_COMPLETED_STATE_ID,
        thankYouPageCollapsed: Boolean(thankYouPage.collapsed),
        thankYouPageIsVisible: Boolean(thankYouPage.isVisible),
        stateBoxCurrentStateId: normalizeText(
          completeBookingStateBox.currentState?.id
        )
      });

      return;
    }

    const completeBookingPayload = {
      bookingFlowMode: COMPLETE_BOOKING_FLOW_MODE,
      orderId: completeBookingDecision.orderId
    };

    console.log("COMPLETE BOOKING call-start", {
      bookingFlowMode: COMPLETE_BOOKING_FLOW_MODE,
      hasOrderId: Boolean(completeBookingDecision.orderId),
      reason: completeBookingDecision.reason,
      paymentStatus: completeBookingDecision.paymentStatus,
      reservationType: completeBookingDecision.reservationType
    });

    const completeBookingStartedAt = Date.now();

    const completeBookingResult = await completeBooking(completeBookingPayload);

    console.log("COMPLETE BOOKING call-success", {
      elapsedMs: Date.now() - completeBookingStartedAt,
      hasCompleteBookingResult: Boolean(completeBookingResult),
      hasCompletedBooking: Boolean(completeBookingResult?.completedBooking),
      hasNormalizedBooking: Boolean(completeBookingResult?.normalizedBooking),
      hasPersistence: Boolean(completeBookingResult?.persistence),
      orderPersistenceStatus: normalizeText(
        completeBookingResult?.persistence?.order?.status
      )
    });

    await completeBookingStateBox.changeState(
      COMPLETE_BOOKING_PROGRESS_COMPLETED_STATE_ID
    );
    await thankYouPage.expand();

    console.log("COMPLETE BOOKING ui-completed-after-call-success", {
      completedStateId: COMPLETE_BOOKING_PROGRESS_COMPLETED_STATE_ID,
      thankYouPageCollapsed: Boolean(thankYouPage.collapsed),
      thankYouPageIsVisible: Boolean(thankYouPage.isVisible),
      stateBoxCurrentStateId: normalizeText(
        completeBookingStateBox.currentState?.id
      )
    });
  } catch (error) {
    console.error("COMPLETE BOOKING failed", {
      name: error?.name,
      message: error?.message,
      stack: error?.stack
    });

    console.log("COMPLETE BOOKING initialize-failed", {
      elapsedMs: Date.now() - initializeStartedAt
    });

    await completeBookingStateBox.changeState(
      COMPLETE_BOOKING_PROGRESS_COMPLETED_STATE_ID
    );
    await thankYouPage.expand();

    console.log("COMPLETE BOOKING ui-completed-after-failure", {
      completedStateId: COMPLETE_BOOKING_PROGRESS_COMPLETED_STATE_ID,
      thankYouPageCollapsed: Boolean(thankYouPage.collapsed),
      thankYouPageIsVisible: Boolean(thankYouPage.isVisible),
      stateBoxCurrentStateId: normalizeText(
        completeBookingStateBox.currentState?.id
      )
    });
  } finally {
    console.log("COMPLETE BOOKING initialize-end", {
      elapsedMs: Date.now() - initializeStartedAt
    });
  }
}

function resolveCompleteBookingDecision(currentOrder) {
  const orderId = resolveOrderId(currentOrder);
  const paymentStatus = normalizeText(currentOrder?.paymentStatus).toUpperCase();
  const reservationType = resolveReservationTypeFromOrder(currentOrder);
  const hasFlexibleReservationType =
    reservationType === FLEXIBLE_RESERVATION_TYPE_VALUE;

  const hasLineItems =
    Array.isArray(currentOrder?.lineItems) && currentOrder.lineItems.length > 0;

  if (!orderId) {
    return {
      shouldStartCompleteBooking: false,
      reason: "missing-order-id",
      orderId: "",
      paymentStatus,
      reservationType
    };
  }

  if (!COMPLETE_BOOKING_ACCEPTED_ORDER_PAYMENT_STATUSES.has(paymentStatus)) {
    return {
      shouldStartCompleteBooking: false,
      reason: "payment-status-not-eligible",
      orderId,
      paymentStatus,
      reservationType
    };
  }

  if (!hasLineItems) {
    return {
      shouldStartCompleteBooking: false,
      reason: "missing-line-items",
      orderId,
      paymentStatus,
      reservationType
    };
  }

  if (hasFlexibleReservationType) {
    return {
      shouldStartCompleteBooking: false,
      reason: "flexible-reservation-selected",
      orderId,
      paymentStatus,
      reservationType
    };
  }

  return {
    shouldStartCompleteBooking: true,
    reason: "eligible-for-wallet-booking",
    orderId,
    paymentStatus,
    reservationType
  };
}

function resolveReservationTypeFromOrder(currentOrder) {
  const lineItems = Array.isArray(currentOrder?.lineItems)
    ? currentOrder.lineItems
    : [];

  for (const lineItem of lineItems) {
    const reservationType = resolveReservationTypeFromLineItem(lineItem);

    if (reservationType) {
      return reservationType;
    }
  }

  return "";
}

function resolveReservationTypeFromLineItem(lineItem) {
  const options = Array.isArray(lineItem?.options) ? lineItem.options : [];

  for (const optionItem of options) {
    const optionName = normalizeText(optionItem?.option);
    const selection = normalizeText(optionItem?.selection);

    if (optionName === RESERVATION_TYPE_LABEL && selection) {
      return selection.toLowerCase();
    }
  }

  return "";
}

function resolveOrderId(currentOrder) {
  return normalizeText(currentOrder?._id);
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
