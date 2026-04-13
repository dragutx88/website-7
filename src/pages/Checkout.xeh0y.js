import wixLocationFrontend from "wix-location-frontend";
import { createPrebookSession } from "backend/liteApi.web";
import {
  PAGE_PATHS,
  buildConfirmationReturnUrl,
  buildGuestsSummaryFromCtx,
  buildHotelPageUrl,
  checkoutSessionMatches,
  formatDisplayDate,
  formatPrice,
  formatRefundableTag,
  loadCheckoutSession,
  loadSelectedOfferPayload,
  normalizeCtxFromQuery,
  persistCheckoutSession,
  selectedOfferMatchesCtx
} from "public/liteApiFlow";
import {
  debugError,
  debugGroup,
  summarizePaymentConfig,
  summarizePrebook
} from "public/liteApiDebug";
import {
  collapseAndHideIfExists,
  safeCollapseAndHide,
  safeExpand,
  safeGetPageElement,
  safeShow,
  setImageIfExists,
  setInputValueIfExists,
  setOptionalTextIfExists,
  setTextIfExists,
  showAndExpandIfExists
} from "public/liteApiHelpers";

let currentCtx = {};
let selectedOfferPayload = null;
let activeCheckoutSession = null;

let mountWatchdogTimer = null;
let paymentReturnWatchdogTimer = null;
let activeMountCycleToken = "";
let postedMountCycleToken = "";
let paymentSubmitObserved = false;

$w.onReady(function () {
  initializeCheckoutPage();
});

function initializeCheckoutPage() {
  currentCtx = normalizeCtxFromQuery(wixLocationFrontend.query || {});
  selectedOfferPayload = resolveSelectedOfferPayload(currentCtx);
  activeCheckoutSession = resolveCheckoutSession(currentCtx, selectedOfferPayload);

  debugGroup("Checkout", "initialize", {
    ctx: currentCtx,
    selectedOfferId: getSelectedOfferId(selectedOfferPayload),
    selectedHotelId: String(selectedOfferPayload?.hotelId || ""),
    resumedCheckoutSession: Boolean(activeCheckoutSession?.prebook)
  });

  collapseAndHideIfExists("#checkoutErrorBox");
  collapseAndHideIfExists("#checkoutPaymentSectionBox");
  collapseAndHideIfExists("#checkoutGuestFormErrorText");
  collapseAndHideIfExists("#checkoutPrebookStatusText");
  collapseAndHideIfExists("#checkoutPaymentLoadingText");

  showAndExpandIfExists("#checkoutLoadingBox");
  collapseAndHideIfExists("#checkoutContentBox");

  wirePaymentCustomElement();

  const selectedOfferId = getSelectedOfferId(selectedOfferPayload);
  if (!selectedOfferPayload || !selectedOfferId) {
    renderCheckoutError(
      "We could not find the selected room offer. Please go back to the hotel page and choose a room again."
    );
    return;
  }

  bindCheckoutSummary(selectedOfferPayload, currentCtx);
  bindCheckoutActions();
  hydrateGuestForm(activeCheckoutSession?.guestDetails || {});

  if (activeCheckoutSession?.prebook) {
    bindPrebookConfirmedSummary(activeCheckoutSession.prebook);
    syncSandboxNote(activeCheckoutSession.prebook.paymentEnvironment);
    setOptionalTextIfExists(
      "#checkoutPrebookStatusText",
      "Your payment session has been restored."
    );
    showAndExpandIfExists("#checkoutPaymentSectionBox");
    setOptionalTextIfExists(
      "#checkoutPaymentLoadingText",
      "Restoring secure payment form..."
    );
    debugGroup("Checkout", "resume-prebook", summarizePrebook(activeCheckoutSession.prebook));
    queuePaymentMount(activeCheckoutSession.prebook);
  }

  collapseAndHideIfExists("#checkoutLoadingBox");
  showAndExpandIfExists("#checkoutContentBox");
}

function resolveSelectedOfferPayload(ctx) {
  const payload = loadSelectedOfferPayload();
  if (!payload) {
    return null;
  }

  if (selectedOfferMatchesCtx(payload, ctx)) {
    return payload;
  }

  return null;
}

function resolveCheckoutSession(ctx, offerPayload) {
  const checkoutSession = loadCheckoutSession();
  if (!checkoutSession) {
    return null;
  }

  if (!checkoutSessionMatches(checkoutSession, offerPayload, ctx)) {
    return null;
  }

  return checkoutSession;
}

function wirePaymentCustomElement() {
  const paymentComponent = safeGetPageElement("#checkoutPaymentLiteapiCustomElement");

  if (!paymentComponent) {
    console.warn("Missing #checkoutPaymentLiteapiCustomElement");
    return;
  }

  const bindEvent = (eventName, handler) => {
    const wrappedHandler = (event) => {
      handler(
        normalizePaymentCustomEvent(eventName, event)
      );
    };

    if (typeof paymentComponent.on === "function") {
      paymentComponent.on(eventName, wrappedHandler);
      return true;
    }

    if (typeof paymentComponent.addEventListener === "function") {
      paymentComponent.addEventListener(eventName, wrappedHandler);
      return true;
    }

    return false;
  };

  const bindingResults = [
    bindEvent("liteapi-payment-ready", handlePaymentCustomEvent),
    bindEvent("liteapi-payment-mounted", handlePaymentCustomEvent),
    bindEvent("liteapi-payment-submit-started", handlePaymentCustomEvent),
    bindEvent("liteapi-payment-redirect-request", handlePaymentCustomEvent),
    bindEvent("liteapi-payment-error", handlePaymentCustomEvent)
  ];
  const listenerBound = bindingResults.every(Boolean);

  if (!listenerBound) {
    console.warn("Payment custom element does not expose the expected custom event bindings.");
  }
}

function handlePaymentCustomEvent(event) {
  const type = String(event?.type || "").trim();
  const payload = event?.detail || {};

  debugGroup("Checkout", "payment-custom-event", {
    type,
    ...payload
  });

  if (type === "liteapi-payment-ready") {
    debugGroup("Checkout", "payment-host-ready", {
      source: String(payload?.source || "custom-element")
    });
    return;
  }

  if (type === "liteapi-payment-mounted") {
    clearMountWatchdog();
    setOptionalTextIfExists(
      "#checkoutPaymentLoadingText",
      "Secure payment form is ready."
    );
    return;
  }

  if (type === "liteapi-payment-submit-started") {
    paymentSubmitObserved = true;
    setOptionalTextIfExists(
      "#checkoutPaymentLoadingText",
      "Payment submitted. Waiting for bank confirmation or redirect..."
    );
    startReturnWatchdog(activeMountCycleToken);
    return;
  }

  if (type === "liteapi-payment-redirect-request") {
    const returnUrl = String(payload?.returnUrl || "").trim();
    setOptionalTextIfExists(
      "#checkoutPaymentLoadingText",
      "Redirecting to complete payment authentication..."
    );
    startReturnWatchdog(activeMountCycleToken);

    if (returnUrl) {
      debugGroup("Checkout", "payment-redirect-request", {
        returnUrl,
        source: String(payload?.source || "")
      });
    }
    return;
  }

  if (type === "liteapi-payment-error") {
    clearMountWatchdog();
    clearReturnWatchdog();
    setOptionalTextIfExists(
      "#checkoutGuestFormErrorText",
      payload?.message || "We could not load the payment form."
    );
    setOptionalTextIfExists(
      "#checkoutPrebookStatusText",
      "Payment flow interrupted. Please try again."
    );
  }
}

function normalizePaymentCustomEvent(eventName, rawEvent) {
  const type = String(
    rawEvent?.type || rawEvent?.eventName || rawEvent?.target?.type || eventName || ""
  ).trim();

  const detail = rawEvent?.detail && typeof rawEvent.detail === "object"
    ? rawEvent.detail
    : rawEvent?.data && typeof rawEvent.data === "object"
      ? rawEvent.data
      : {};

  return {
    type,
    detail
  };
}

function bindCheckoutSummary(payload, ctx) {
  setTextIfExists("#checkoutHotelNameText", String(payload?.hotelName || ""));
  setOptionalTextIfExists("#checkoutHotelAddressText", String(payload?.hotelAddress || ""));
  setImageIfExists("#checkoutRoomImage", payload?.roomImage || payload?.hotelMainPhoto || "");
  setTextIfExists("#checkoutRoomNameText", String(payload?.roomName || ""));
  setOptionalTextIfExists("#checkoutCheckinDateText", formatDisplayDate(ctx?.checkin));
  setOptionalTextIfExists("#checkoutCheckoutDateText", formatDisplayDate(ctx?.checkout));
  setOptionalTextIfExists("#checkoutGuestsSummaryText", buildGuestsSummaryFromCtx(ctx));

  const offer = payload?.offer || {};
  setOptionalTextIfExists("#checkoutRefundableTagText", formatRefundableTag(offer?.refundableTag));
  setOptionalTextIfExists("#checkoutCurrentPriceText", formatPrice(offer?.currentPrice));
  setOptionalTextIfExists("#checkoutDiscountBeforeText", formatPrice(offer?.beforePrice));
  setOptionalTextIfExists("#checkoutPriceNoteText", String(offer?.priceNote || ""));
}

function bindCheckoutActions() {
  const continueButton = safeGetPageElement("#checkoutContinueToPaymentButton");
  if (continueButton && typeof continueButton.onClick === "function") {
    continueButton.onClick(async () => {
      await handleContinueToPayment();
    });
  }

  const backButton = safeGetPageElement("#checkoutBackToHotelButton");
  if (backButton && typeof backButton.onClick === "function") {
    backButton.onClick(() => {
      goBackToHotelPage();
    });
  }
}

async function handleContinueToPayment() {
  const validationMessage = validateGuestForm();
  if (validationMessage) {
    setOptionalTextIfExists("#checkoutGuestFormErrorText", validationMessage);
    return;
  }

  const guestDetails = readGuestFormValues();
  collapseAndHideIfExists("#checkoutGuestFormErrorText");
  showAndExpandIfExists("#checkoutPaymentSectionBox");
  setOptionalTextIfExists(
    "#checkoutPrebookStatusText",
    "Checking final availability and preparing payment..."
  );
  setOptionalTextIfExists(
    "#checkoutPaymentLoadingText",
    "Loading secure payment form..."
  );

  const continueButton = safeGetPageElement("#checkoutContinueToPaymentButton");
  const originalLabel = continueButton?.label || "Continue to Payment";
  if (continueButton) {
    continueButton.label = "Preparing...";
    if (typeof continueButton.disable === "function") {
      continueButton.disable();
    }
  }

  try {
    if (activeCheckoutSession?.prebook) {
      activeCheckoutSession = {
        ...activeCheckoutSession,
        guestDetails
      };
      persistCheckoutSession(activeCheckoutSession);
      bindPrebookConfirmedSummary(activeCheckoutSession.prebook);
      syncSandboxNote(activeCheckoutSession.prebook.paymentEnvironment);
      setOptionalTextIfExists(
        "#checkoutPrebookStatusText",
        "Availability already confirmed. Restoring secure payment..."
      );
      debugGroup("Checkout", "reuse-existing-prebook", {
        guestDetails,
        prebook: summarizePrebook(activeCheckoutSession.prebook)
      });
      queuePaymentMount(activeCheckoutSession.prebook);
      return;
    }

    debugGroup("Checkout", "prebook-start", {
      offerId: getSelectedOfferId(selectedOfferPayload),
      hotelId: String(selectedOfferPayload?.hotelId || ""),
      ctx: currentCtx,
      guestDetails
    });

    const prebookResult = await createPrebookSession({
      offerId: getSelectedOfferId(selectedOfferPayload)
    });

    const normalizedPrebook = prebookResult?.normalizedPrebook;
    if (
      !normalizedPrebook?.prebookId ||
      !normalizedPrebook?.transactionId ||
      !normalizedPrebook?.secretKey
    ) {
      throw new Error("Prebook response is incomplete.");
    }

    debugGroup("Checkout", "prebook-success", summarizePrebook(normalizedPrebook));

    activeCheckoutSession = {
      createdAt: Date.now(),
      ctx: {
        ...currentCtx,
        hotelId: selectedOfferPayload?.hotelId || currentCtx.hotelId || "",
        offerId: getSelectedOfferId(selectedOfferPayload)
      },
      selectedOffer: selectedOfferPayload,
      guestDetails,
      prebook: normalizedPrebook
    };

    persistCheckoutSession(activeCheckoutSession);
    bindPrebookConfirmedSummary(normalizedPrebook);
    syncSandboxNote(normalizedPrebook?.paymentEnvironment);
    setOptionalTextIfExists(
      "#checkoutPrebookStatusText",
      "Availability confirmed. Opening secure payment..."
    );
    queuePaymentMount(normalizedPrebook);
  } catch (error) {
    debugError("Checkout", "prebook-failed", error, {
      offerId: getSelectedOfferId(selectedOfferPayload),
      hotelId: String(selectedOfferPayload?.hotelId || ""),
      ctx: currentCtx
    });
    console.error("CHECKOUT prebook failed", error);
    setOptionalTextIfExists(
      "#checkoutGuestFormErrorText",
      error?.message ||
        "This room is no longer available. Please go back and choose another option."
    );
    setOptionalTextIfExists(
      "#checkoutPrebookStatusText",
      "We could not prepare payment for this booking."
    );
    collapseAndHideIfExists("#checkoutPaymentSectionBox");
  } finally {
    if (continueButton) {
      continueButton.label = originalLabel;
      if (typeof continueButton.enable === "function") {
        continueButton.enable();
      }
    }
  }
}

function queuePaymentMount(prebook) {
  paymentSubmitObserved = false;
  clearReturnWatchdog();
  const paymentConfig = buildLiteApiPaymentConfig(prebook);
  activeMountCycleToken = [
    String(prebook?.prebookId || ""),
    String(prebook?.transactionId || ""),
    String(Date.now())
  ].join(":");
  postedMountCycleToken = "";
  debugGroup("Checkout", "queue-payment-mount", summarizePaymentConfig(paymentConfig));
  startMountWatchdog(activeMountCycleToken);
  sendPaymentConfigToCustomElement(paymentConfig);
}

function sendPaymentConfigToCustomElement(paymentConfig) {
  const paymentComponent = safeGetPageElement("#checkoutPaymentLiteapiCustomElement");
  if (!paymentComponent) {
    console.warn("Payment custom element is not available.");
    return;
  }

  debugGroup("Checkout", "set-payment-config-attributes", summarizePaymentConfig(paymentConfig));

  if (!activeMountCycleToken) {
    activeMountCycleToken = String(Date.now());
  }

  if (postedMountCycleToken === activeMountCycleToken) {
    debugGroup("Checkout", "skip-duplicate-payment-mount", {
      prebookId: String(paymentConfig?.prebookId || ""),
      transactionId: String(paymentConfig?.transactionId || ""),
      mountCycleToken: activeMountCycleToken
    });
    return;
  }
  postedMountCycleToken = activeMountCycleToken;

  setPaymentElementAttribute(paymentComponent, "public-key", String(paymentConfig?.publicKey || ""));
  setPaymentElementAttribute(paymentComponent, "secret-key", String(paymentConfig?.secretKey || ""));
  setPaymentElementAttribute(paymentComponent, "return-url", String(paymentConfig?.returnUrl || ""));
  setPaymentElementAttribute(
    paymentComponent,
    "prebook-id",
    String(paymentConfig?.prebookId || "")
  );
  setPaymentElementAttribute(
    paymentComponent,
    "transaction-id",
    String(paymentConfig?.transactionId || "")
  );
  setPaymentElementAttribute(paymentComponent, "mount-cycle-token", activeMountCycleToken);
}

function setPaymentElementAttribute(paymentComponent, key, value) {
  if (!paymentComponent || !key) {
    return;
  }

  if (typeof paymentComponent.setAttribute === "function") {
    paymentComponent.setAttribute(key, value);
    return;
  }

  if (typeof paymentComponent.setAttributes === "function") {
    paymentComponent.setAttributes({
      [key]: value
    });
  }
}

function buildLiteApiPaymentConfig(prebook) {
  const config = {
    publicKey: String(prebook?.paymentEnvironment || "sandbox").toLowerCase(),
    secretKey: String(prebook?.secretKey || ""),
    transactionId: String(prebook?.transactionId || ""),
    prebookId: String(prebook?.prebookId || ""),
    returnUrl: buildConfirmationReturnUrl(getSiteOrigin(), {
      ...currentCtx,
      hotelId: selectedOfferPayload?.hotelId || currentCtx.hotelId || "",
      offerId: getSelectedOfferId(selectedOfferPayload)
    }, {
      prebookId: prebook?.prebookId,
      transactionId: prebook?.transactionId,
      hotelId: selectedOfferPayload?.hotelId || currentCtx.hotelId || "",
      offerId: getSelectedOfferId(selectedOfferPayload)
    }),
    appearance: {
      theme: "flat"
    },
    options: {
      business: {
        name: "LiteAPI"
      }
    }
  };

  debugGroup("Checkout", "build-payment-config", summarizePaymentConfig(config));
  return config;
}

function getSiteOrigin() {
  try {
    const origin = window.location.origin;
    debugGroup("Checkout", "site-origin", { origin });
    return origin;
  } catch (error) {
    return "";
  }
}

function bindPrebookConfirmedSummary(prebook) {
  setOptionalTextIfExists("#checkoutRefundableTagText", formatRefundableTag(prebook?.refundableTag));
  setOptionalTextIfExists("#checkoutCurrentPriceText", formatPrice(prebook?.currentPrice));
  setOptionalTextIfExists("#checkoutDiscountBeforeText", formatPrice(prebook?.beforePrice));
}

function syncSandboxNote(paymentEnvironment) {
  const note = safeGetPageElement("#checkoutSandboxCardNoteText");
  if (!note) {
    return;
  }

  if (String(paymentEnvironment || "").toLowerCase() === "sandbox") {
    note.text =
      "Sandbox test card: 4242 4242 4242 4242 · any 3-digit CVV · any future expiry date";
    safeShow(note);
    safeExpand(note);
    return;
  }

  safeCollapseAndHide(note);
}

function goBackToHotelPage() {
  const hotelId = String(currentCtx?.hotelId || selectedOfferPayload?.hotelId || "").trim();
  if (!hotelId) {
    return;
  }

  wixLocationFrontend.to(
    buildHotelPageUrl(
      {
        ...currentCtx,
        hotelId
      },
      hotelId
    )
  );
}

function validateGuestForm() {
  const values = readGuestFormValues();

  if (!values.firstName) {
    return "Please enter the guest first name.";
  }
  if (!values.lastName) {
    return "Please enter the guest last name.";
  }
  if (!values.email) {
    return "Please enter the guest email address.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    return "Please enter a valid email address.";
  }

  return "";
}

function readGuestFormValues() {
  return {
    firstName: String(safeGetPageElement("#checkoutGuestFirstNameInput")?.value || "").trim(),
    lastName: String(safeGetPageElement("#checkoutGuestLastNameInput")?.value || "").trim(),
    email: String(safeGetPageElement("#checkoutGuestEmailInput")?.value || "").trim(),
    phone: String(safeGetPageElement("#checkoutGuestPhoneInput")?.value || "").trim()
  };
}

function hydrateGuestForm(guestDetails) {
  setInputValueIfExists("#checkoutGuestFirstNameInput", guestDetails?.firstName || "");
  setInputValueIfExists("#checkoutGuestLastNameInput", guestDetails?.lastName || "");
  setInputValueIfExists("#checkoutGuestEmailInput", guestDetails?.email || "");
  setInputValueIfExists("#checkoutGuestPhoneInput", guestDetails?.phone || "");
}

function getSelectedOfferId(payload) {
  return String(payload?.offerId || payload?.offer?.offerId || "").trim();
}

function startMountWatchdog(cycleToken) {
  clearMountWatchdog();
  mountWatchdogTimer = setTimeout(() => {
    if (cycleToken !== activeMountCycleToken) {
      return;
    }
    setOptionalTextIfExists(
      "#checkoutGuestFormErrorText",
      "Payment form is taking too long to load. Please retry in a few seconds."
    );
    setOptionalTextIfExists(
      "#checkoutPrebookStatusText",
      "Payment form did not confirm readiness yet."
    );
  }, 12000);
}

function clearMountWatchdog() {
  if (mountWatchdogTimer) {
    clearTimeout(mountWatchdogTimer);
    mountWatchdogTimer = null;
  }
}

function startReturnWatchdog(cycleToken) {
  clearReturnWatchdog();
  paymentReturnWatchdogTimer = setTimeout(() => {
    if (cycleToken !== activeMountCycleToken || !paymentSubmitObserved) {
      return;
    }
    setOptionalTextIfExists(
      "#checkoutGuestFormErrorText",
      "Payment is still in progress. If you completed bank authentication, wait a moment or retry."
    );
    setOptionalTextIfExists(
      "#checkoutPrebookStatusText",
      "Waiting for payment return..."
    );
  }, 30000);
}

function clearReturnWatchdog() {
  if (paymentReturnWatchdogTimer) {
    clearTimeout(paymentReturnWatchdogTimer);
    paymentReturnWatchdogTimer = null;
  }
}

function renderCheckoutError(message) {
  collapseAndHideIfExists("#checkoutLoadingBox");
  collapseAndHideIfExists("#checkoutContentBox");
  const errorText = safeGetPageElement("#checkoutErrorText");
  if (errorText) {
    errorText.text = String(message || "Something went wrong.");
  }
  showAndExpandIfExists("#checkoutErrorBox");
}





