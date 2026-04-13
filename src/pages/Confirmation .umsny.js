import wixLocationFrontend from "wix-location-frontend";
import { completeBooking } from "backend/liteApi.web";
import {
  PAGE_PATHS,
  buildCheckoutPageUrl,
  buildGuestsSummaryFromCtx,
  buildHotelPageUrl,
  formatDisplayDate,
  formatPrice,
  formatRefundableTag,
  loadBookingResult,
  loadCheckoutSession,
  normalizeCtxFromQuery,
  persistBookingResult
} from "public/liteApiFlow";
import { debugError, debugGroup } from "public/liteApiDebug";
import {
  collapseAndHideIfExists,
  safeGetPageElement,
  setImageIfExists,
  setOptionalTextIfExists,
  setTextIfExists,
  showAndExpandIfExists
} from "public/liteApiHelpers";

let confirmationQuery = {};
let checkoutSession = null;

$w.onReady(async function () {
  await initializeConfirmationPage();
});

async function initializeConfirmationPage() {
  confirmationQuery = normalizeCtxFromQuery(wixLocationFrontend.query || {});
  checkoutSession = loadCheckoutSession();
  const isEmbeddedReturnBridge = notifyParentIfEmbeddedReturnBridge();
  if (isEmbeddedReturnBridge) {
    return;
  }

  debugGroup("Confirmation", "initialize", {
    query: confirmationQuery,
    checkoutSessionPresent: Boolean(checkoutSession),
    sessionPrebookId: String(checkoutSession?.prebook?.prebookId || ""),
    sessionTransactionId: String(checkoutSession?.prebook?.transactionId || "")
  });

  bindStaticActions();
  showLoadingState();

  const cachedBooking = loadCachedBookingResult();
  if (
    cachedBooking &&
    String(cachedBooking?.prebookId || "").trim() === confirmationQuery.prebookId &&
    String(cachedBooking?.transactionId || "").trim() === confirmationQuery.transactionId
  ) {
    debugGroup("Confirmation", "cached-booking-hit", {
      bookingId: String(cachedBooking?.normalizedBooking?.bookingId || ""),
      prebookId: String(cachedBooking?.prebookId || ""),
      transactionId: String(cachedBooking?.transactionId || "")
    });
    renderSuccessState(cachedBooking.normalizedBooking, checkoutSession);
    return;
  }

  if (!checkoutSession) {
    renderErrorState(
      "We could not find your checkout session. Please return to checkout and try again."
    );
    return;
  }

  const sessionPrebookId = String(checkoutSession?.prebook?.prebookId || "").trim();
  const sessionTransactionId = String(checkoutSession?.prebook?.transactionId || "").trim();

  if (
    !sessionPrebookId ||
    !sessionTransactionId ||
    sessionPrebookId !== confirmationQuery.prebookId ||
    sessionTransactionId !== confirmationQuery.transactionId
  ) {
    debugGroup("Confirmation", "session-mismatch", {
      queryPrebookId: confirmationQuery.prebookId,
      queryTransactionId: confirmationQuery.transactionId,
      sessionPrebookId,
      sessionTransactionId
    });
    renderErrorState(
      "Your payment session could not be matched to a booking request. Please return to checkout and try again."
    );
    return;
  }

  try {
    debugGroup("Confirmation", "booking-start", {
      prebookId: confirmationQuery.prebookId,
      transactionId: confirmationQuery.transactionId,
      guestEmail: String(checkoutSession?.guestDetails?.email || "")
    });

    const bookingResult = await completeBooking({
      prebookId: confirmationQuery.prebookId,
      transactionId: confirmationQuery.transactionId,
      guestDetails: checkoutSession?.guestDetails || {}
    });

    const normalizedBooking = bookingResult?.normalizedBooking;
    if (!normalizedBooking?.bookingId) {
      throw new Error("Booking confirmation response is incomplete.");
    }

    debugGroup("Confirmation", "booking-success", {
      bookingId: String(normalizedBooking?.bookingId || ""),
      hotelConfirmationCode: String(normalizedBooking?.hotelConfirmationCode || ""),
      status: String(normalizedBooking?.status || "")
    });

    persistBookingResult({
      createdAt: Date.now(),
      prebookId: confirmationQuery.prebookId,
      transactionId: confirmationQuery.transactionId,
      normalizedBooking
    });

    renderSuccessState(normalizedBooking, checkoutSession);
  } catch (error) {
    debugError("Confirmation", "booking-failed", error, {
      query: confirmationQuery,
      sessionPrebookId,
      sessionTransactionId
    });
    console.error("CONFIRMATION booking failed", error);
    renderErrorState(
      error?.message ||
        "We could not finalize your booking after payment. Please contact support."
    );
  }
}

function notifyParentIfEmbeddedReturnBridge() {
  try {
    const inIframe = typeof window !== "undefined" && window.parent && window.parent !== window;
    if (!inIframe) {
      return false;
    }

    const prebookId = String(confirmationQuery?.prebookId || "").trim();
    const transactionId = String(confirmationQuery?.transactionId || "").trim();
    if (!prebookId || !transactionId) {
      return false;
    }

    window.parent.postMessage(
      {
        type: "liteapi-payment-return-received",
        source: "confirmation-page-iframe",
        prebookId,
        transactionId
      },
      "*"
    );

    debugGroup("Confirmation", "posted-return-bridge-message", {
      prebookId,
      transactionId
    });
    return true;
  } catch (error) {
    debugError("Confirmation", "return-bridge-post-failed", error, {
      query: confirmationQuery
    });
    return false;
  }
}

function bindStaticActions() {
  const backToCheckoutButton = safeGetPageElement("#confirmationBackToCheckoutButton");
  if (backToCheckoutButton && typeof backToCheckoutButton.onClick === "function") {
    backToCheckoutButton.onClick(() => {
      goBackToCheckoutPage();
    });
  }

  getBackToHotelButtons().forEach((button) => {
    if (button && typeof button.onClick === "function") {
      button.onClick(() => {
        goBackToHotelPage();
      });
    }
  });

  const goHomeButton = safeGetPageElement("#confirmationGoHomeButton");
  if (goHomeButton && typeof goHomeButton.onClick === "function") {
    goHomeButton.onClick(() => {
      wixLocationFrontend.to(PAGE_PATHS.home);
    });
  }
}

function renderSuccessState(normalizedBooking, activeCheckoutSession) {
  const selectedOffer = activeCheckoutSession?.selectedOffer || {};
  const offer = selectedOffer?.offer || {};
  const ctx = activeCheckoutSession?.ctx || confirmationQuery || {};
  const guestDetails = activeCheckoutSession?.guestDetails || {};

  collapseAndHideIfExists("#confirmationLoadingBox");
  collapseAndHideIfExists("#confirmationErrorBox");
  showAndExpandIfExists("#confirmationSuccessBox");

  setTextIfExists("#confirmationSuccessTitleText", "Booking confirmed");
  setOptionalTextIfExists(
    "#confirmationSuccessSubtitleText",
    "Your reservation has been successfully finalized."
  );

  setTextIfExists("#confirmationHotelNameText", String(selectedOffer?.hotelName || ""));
  setOptionalTextIfExists("#confirmationHotelAddressText", String(selectedOffer?.hotelAddress || ""));
  setImageIfExists(
    "#confirmationRoomImage",
    selectedOffer?.roomImage || selectedOffer?.hotelMainPhoto || ""
  );
  setOptionalTextIfExists("#confirmationRoomNameText", String(selectedOffer?.roomName || ""));
  setOptionalTextIfExists("#confirmationCheckinDateText", formatDisplayDate(ctx?.checkin));
  setOptionalTextIfExists("#confirmationCheckoutDateText", formatDisplayDate(ctx?.checkout));
  setOptionalTextIfExists("#confirmationGuestsSummaryText", buildGuestsSummaryFromCtx(ctx));
  setOptionalTextIfExists(
    "#confirmationRefundableTagText",
    formatRefundableTag(offer?.refundableTag)
  );
  setOptionalTextIfExists("#confirmationCurrentPriceText", formatPrice(offer?.currentPrice));
  setOptionalTextIfExists(
    "#confirmationDiscountBeforePriceText",
    formatPrice(offer?.beforePrice)
  );
  setOptionalTextIfExists("#confirmationPriceNoteText", String(offer?.priceNote || ""));
  setOptionalTextIfExists("#confirmationBookingIdText", normalizedBooking?.bookingId || "");
  setOptionalTextIfExists(
    "#confirmationHotelConfirmationCodeText",
    normalizedBooking?.hotelConfirmationCode || ""
  );
  setOptionalTextIfExists(
    "#confirmationBookingStatusText",
    normalizedBooking?.status || "confirmed"
  );
  setOptionalTextIfExists("#confirmationGuestNameText", buildGuestName(guestDetails));
  setOptionalTextIfExists("#confirmationGuestEmailText", String(guestDetails?.email || ""));
  bindPoliciesBox(normalizedBooking?.cancellationPolicies || []);
}

function renderErrorState(message) {
  collapseAndHideIfExists("#confirmationLoadingBox");
  collapseAndHideIfExists("#confirmationSuccessBox");
  showAndExpandIfExists("#confirmationErrorBox");
  setTextIfExists("#confirmationErrorTitleText", "Booking could not be completed");
  setOptionalTextIfExists("#confirmationErrorText", message);
}

function showLoadingState() {
  showAndExpandIfExists("#confirmationLoadingBox");
  collapseAndHideIfExists("#confirmationErrorBox");
  collapseAndHideIfExists("#confirmationSuccessBox");
  setTextIfExists("#confirmationLoadingTitleText", "Finalizing your booking");
  setOptionalTextIfExists(
    "#confirmationLoadingText",
    "Please wait while we confirm your reservation with the hotel."
  );
}

function bindPoliciesBox(policies) {
  if (!Array.isArray(policies) || policies.length === 0) {
    collapseAndHideIfExists("#confirmationPoliciesBox");
    return;
  }

  showAndExpandIfExists("#confirmationPoliciesBox");
  setTextIfExists("#confirmationPoliciesTitleText", "Cancellation policies");
  setOptionalTextIfExists("#confirmationPoliciesBodyText", policies.join("\n"));
}

function goBackToCheckoutPage() {
  const selectedOffer = checkoutSession?.selectedOffer || {};
  const ctx = checkoutSession?.ctx || confirmationQuery || {};
  const hotelId = String(selectedOffer?.hotelId || ctx?.hotelId || "").trim();
  const offerId = String(selectedOffer?.offerId || selectedOffer?.offer?.offerId || ctx?.offerId || "").trim();

  if (!hotelId || !offerId) {
    return;
  }

  wixLocationFrontend.to(
    buildCheckoutPageUrl(
      {
        ...ctx,
        hotelId,
        offerId
      },
      hotelId,
      offerId
    )
  );
}

function goBackToHotelPage() {
  const selectedOffer = checkoutSession?.selectedOffer || {};
  const ctx = checkoutSession?.ctx || confirmationQuery || {};
  const hotelId = String(selectedOffer?.hotelId || ctx?.hotelId || "").trim();
  if (!hotelId) {
    return;
  }

  wixLocationFrontend.to(
    buildHotelPageUrl(
      {
        ...ctx,
        hotelId
      },
      hotelId
    )
  );
}

function getBackToHotelButtons() {
  return [
    safeGetPageElement("#confirmationBackToHotelButton"),
    safeGetPageElement("#confirmationBackToHotelButton2")
  ].filter(Boolean);
}

function buildGuestName(guestDetails) {
  const firstName = String(guestDetails?.firstName || "").trim();
  const lastName = String(guestDetails?.lastName || "").trim();
  return `${firstName} ${lastName}`.trim();
}

function loadCachedBookingResult() {
  return loadBookingResult();
}









