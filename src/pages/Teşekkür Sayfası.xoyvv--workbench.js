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

const RESERVATION_TYPE_LABEL = "Reservation Type";
const FLEXIBLE_RESERVATION_TYPE_VALUE = "flexible";
const FLEXIBLE_RESERVATION_TYPE_DISPLAY = "Flexible";

const COMPLETE_BOOKING_ACCEPTED_ORDER_PAYMENT_STATUSES = new Set([
  "PAID",
  "NOT_PAID"
]);

let isCompleteBookingFlowRunning = false;

$w.onReady(async function () {
  const renderingEnv = wixWindow.rendering.env;

  console.log("COMPLETE BOOKING BRIDGE onReady", {
    renderingEnv,
    url: wixLocationFrontend.url,
    path: Array.isArray(wixLocationFrontend.path)
      ? wixLocationFrontend.path.join("/")
      : wixLocationFrontend.path,
    query: wixLocationFrontend.query,
    backendBookingImportEnabled: true,
    backendBookingCallEnabled: true,
    completeBookingType: typeof completeBooking
  });

  if (renderingEnv !== "browser") {
    console.log("COMPLETE BOOKING BRIDGE skipped outside browser", {
      renderingEnv
    });
    return;
  }

  if (isCompleteBookingFlowRunning) {
    console.warn(
      "COMPLETE BOOKING BRIDGE skipped because flow is already running"
    );
    return;
  }

  isCompleteBookingFlowRunning = true;

  try {
    await initializeCompleteBookingBridgeFlow();
  } catch (error) {
    console.error("COMPLETE BOOKING BRIDGE onReady failed", error);
  } finally {
    isCompleteBookingFlowRunning = false;
  }
});

async function initializeCompleteBookingBridgeFlow() {
  const initializeStartedAt = Date.now();

  console.log("COMPLETE BOOKING BRIDGE initialize-enter", {
    url: wixLocationFrontend.url,
    query: wixLocationFrontend.query,
    completeBookingType: typeof completeBooking
  });

  const thankYouPage = $w(THANK_YOU_PAGE_SELECTOR);
  const completeBookingStateBox = $w(COMPLETE_BOOKING_STATE_BOX_SELECTOR);
  const completeBookingProgressBar = $w(COMPLETE_BOOKING_PROGRESS_BAR_SELECTOR);

  console.log("COMPLETE BOOKING BRIDGE elements-resolved", {
    thankYouPageSelector: THANK_YOU_PAGE_SELECTOR,
    thankYouPageHasGetOrder: typeof thankYouPage.getOrder === "function",
    stateBoxSelector: COMPLETE_BOOKING_STATE_BOX_SELECTOR,
    currentStateId: normalizeText(completeBookingStateBox.currentState?.id),
    progressBarSelector: COMPLETE_BOOKING_PROGRESS_BAR_SELECTOR,
    progressBarValue: Number(completeBookingProgressBar.value ?? 0)
  });

  await completeBookingStateBox.changeState(COMPLETE_BOOKING_PROGRESS_STATE_ID);
  completeBookingProgressBar.value = 10;
  await completeBookingProgressBar.show();

  if (typeof thankYouPage.getOrder !== "function") {
    console.warn("COMPLETE BOOKING BRIDGE getOrder missing", {
      thankYouPageSelector: THANK_YOU_PAGE_SELECTOR
    });

    completeBookingProgressBar.value = 100;
    await completeBookingProgressBar.hide();
    await completeBookingStateBox.changeState(
      COMPLETE_BOOKING_PROGRESS_COMPLETED_STATE_ID
    );

    return;
  }

  try {
    const getOrderStartedAt = Date.now();

    console.log("COMPLETE BOOKING BRIDGE getOrder-start", {
      thankYouPageSelector: THANK_YOU_PAGE_SELECTOR
    });

    const currentOrder = await thankYouPage.getOrder();

    completeBookingProgressBar.value = 35;

    console.log("COMPLETE BOOKING BRIDGE getOrder-success", {
      elapsedMs: Date.now() - getOrderStartedAt,
      orderTopLevelKeys: currentOrder ? Object.keys(currentOrder).sort() : [],
      orderSummary: summarizeOrderForTrace(currentOrder)
    });

    const completeBookingDecision = resolveCompleteBookingDecision(currentOrder);

    console.log("COMPLETE BOOKING BRIDGE decision-resolved", {
      completeBookingDecision,
      orderId: resolveOrderId(currentOrder),
      lineItemOptionsSummary: summarizeOrderLineItemOptions(currentOrder),
      lineItemBookingContextSummary:
        summarizeOrderLineItemBookingContext(currentOrder)
    });

    if (!completeBookingDecision.shouldStartCompleteBooking) {
      console.log("COMPLETE BOOKING BRIDGE decision-skip", {
        completeBookingDecision
      });

      completeBookingProgressBar.value = 100;
      await completeBookingProgressBar.hide();
      await completeBookingStateBox.changeState(
        COMPLETE_BOOKING_PROGRESS_COMPLETED_STATE_ID
      );

      return;
    }

    const completeBookingPayload = {
      bookingFlowMode: COMPLETE_BOOKING_FLOW_MODE,
      orderId: completeBookingDecision.orderId
    };

    completeBookingProgressBar.value = 55;

    console.warn("COMPLETE BOOKING BRIDGE call-start", {
      payload: completeBookingPayload,
      completeBookingDecision,
      orderSummary: summarizeOrderForTrace(currentOrder)
    });

    const completeBookingStartedAt = Date.now();

    const completeBookingResult = await completeBooking(completeBookingPayload);

    completeBookingProgressBar.value = 100;

    console.log("COMPLETE BOOKING BRIDGE call-success", {
      elapsedMs: Date.now() - completeBookingStartedAt,
      payload: completeBookingPayload,
      resultSummary: summarizeCompleteBookingResult(completeBookingResult)
    });

    console.log("COMPLETE BOOKING BRIDGE success", {
      orderId: completeBookingDecision.orderId,
      completeBookingResult
    });

    await completeBookingProgressBar.hide();
    await completeBookingStateBox.changeState(
      COMPLETE_BOOKING_PROGRESS_COMPLETED_STATE_ID
    );
  } catch (error) {
    console.error("COMPLETE BOOKING BRIDGE failed", error);

    console.log("COMPLETE BOOKING BRIDGE initialize-failed", {
      elapsedMs: Date.now() - initializeStartedAt,
      url: wixLocationFrontend.url,
      query: wixLocationFrontend.query
    });

    completeBookingProgressBar.value = 100;
    await completeBookingProgressBar.hide();
    await completeBookingStateBox.changeState(
      COMPLETE_BOOKING_PROGRESS_COMPLETED_STATE_ID
    );
  } finally {
    console.log("COMPLETE BOOKING BRIDGE initialize-end", {
      elapsedMs: Date.now() - initializeStartedAt,
      url: wixLocationFrontend.url,
      query: wixLocationFrontend.query
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
  const shellReservationType = normalizeText(
    lineItem?.catalogReference?.options?.reservationType
  ).toLowerCase();

  if (shellReservationType) {
    return shellReservationType;
  }

  const options = Array.isArray(lineItem?.options) ? lineItem.options : [];

  for (const optionItem of options) {
    const optionName = normalizeText(optionItem?.option || optionItem?.name);

    const selection = normalizeText(
      optionItem?.selection || optionItem?.value
    );

    if (
      optionName.toLowerCase() === RESERVATION_TYPE_LABEL.toLowerCase() &&
      selection
    ) {
      return selection.toLowerCase();
    }

    const combined = `${optionName} ${selection}`.toLowerCase();

    if (
      combined.includes(RESERVATION_TYPE_LABEL.toLowerCase()) &&
      combined.includes(FLEXIBLE_RESERVATION_TYPE_DISPLAY.toLowerCase())
    ) {
      return FLEXIBLE_RESERVATION_TYPE_VALUE;
    }
  }

  const descriptionLines = Array.isArray(lineItem?.descriptionLines)
    ? lineItem.descriptionLines
    : [];

  for (const descriptionLine of descriptionLines) {
    const nameText = normalizeDisplayText(descriptionLine?.name);
    const plainText = normalizeDisplayText(descriptionLine?.plainText);

    if (
      nameText.toLowerCase() === RESERVATION_TYPE_LABEL.toLowerCase() &&
      plainText
    ) {
      return plainText.toLowerCase();
    }

    const combined = `${nameText} ${plainText}`.toLowerCase();

    if (
      combined.includes(RESERVATION_TYPE_LABEL.toLowerCase()) &&
      combined.includes(FLEXIBLE_RESERVATION_TYPE_DISPLAY.toLowerCase())
    ) {
      return FLEXIBLE_RESERVATION_TYPE_VALUE;
    }
  }

  return "";
}

function summarizeOrderForTrace(currentOrder) {
  return {
    orderId: resolveOrderId(currentOrder),
    cartId: normalizeText(currentOrder?.cartId),
    paymentStatus: normalizeText(currentOrder?.paymentStatus).toUpperCase(),
    lineItemsCount: Array.isArray(currentOrder?.lineItems)
      ? currentOrder.lineItems.length
      : 0,
    lineItemBookingContextSummary:
      summarizeOrderLineItemBookingContext(currentOrder),
    lineItemOptionsSummary: summarizeOrderLineItemOptions(currentOrder)
  };
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
          option: normalizeText(optionItem?.option || optionItem?.name),
          selection: normalizeText(optionItem?.selection || optionItem?.value)
        }))
      : [],
    descriptionLines: Array.isArray(lineItem?.descriptionLines)
      ? lineItem.descriptionLines.map((descriptionLine) => ({
          name: normalizeDisplayText(descriptionLine?.name),
          plainText: normalizeDisplayText(descriptionLine?.plainText)
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
    reservationType: resolveReservationTypeFromLineItem(lineItem),
    quantity: normalizeText(lineItem?.quantity)
  }));
}

function resolveOrderId(currentOrder) {
  return normalizeText(currentOrder?.id || currentOrder?._id);
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

function normalizeDisplayText(value) {
  return normalizeText(value?.translated || value?.original || value);
}

function normalizeText(value) {
  return String(value || "").trim();
}
