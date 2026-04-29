import { elevate } from "wix-auth";
import { orders } from "wix-ecom-backend";
import {
  buildLiteApiError,
  liteApiRequest,
  parseJson
} from "./liteApiClient";

const LITE_BOOK_API_BASE_URL = "https://book.liteapi.travel/v3.0";
const LITEAPI_CATALOG_APP_ID = "e7f94f4b-7e6a-41c6-8ee1-52c1d5f31cf4";

const ORDER_EXTENDED_FIELDS_BOOKING_SNAPSHOT_KEY = "bookingSnapshot";
const ORDER_EXTENDED_FIELDS_BOOKING_CLIENT_REFERENCE_KEY =
  "bookingClientReference";
const ORDER_EXTENDED_FIELDS_BOOKING_ID_KEY = "bookingId";
const ORDER_EXTENDED_FIELDS_NAMESPACES_KEY = "namespaces";
const ORDER_EXTENDED_FIELDS_NAMESPACE_KEY = "_user_fields";

const BOOKING_FLOW_MODES = Object.freeze({
  WALLET: "WALLET",
  TRANSACTION: "TRANSACTION"
});

export async function createPrebookSessionHandler(payload) {
  const offerId = normalizeText(payload?.offerId);
  const usePaymentSdk =
    typeof payload?.usePaymentSdk === "boolean" ? payload.usePaymentSdk : true;

  if (!offerId) {
    throw new Error("offerId is required.");
  }

  const createPrebookResponse = await liteApiRequest(
    `${LITE_BOOK_API_BASE_URL}/rates/prebook`,
    {
      method: "POST",
      body: {
        offerId,
        usePaymentSdk
      }
    }
  );

  const prebookResponse = await parseJson(createPrebookResponse);

  if (!createPrebookResponse.ok) {
    const error = buildLiteApiError(prebookResponse, "Prebook request failed.");
    error.statusCode = createPrebookResponse.status;
    throw error;
  }

  const normalizedPrebook = normalizePrebook(prebookResponse);
  const prebookSnapshot = JSON.stringify(prebookResponse);

  return {
    prebookSnapshot,
    normalizedPrebook
  };
}

export async function validatePrebook(prebookId) {
  const normalizedPrebookId = normalizeText(prebookId);

  if (!normalizedPrebookId) {
    throw new Error("prebookId is required.");
  }

  const validatePrebookResponse = await liteApiRequest(
    `${LITE_BOOK_API_BASE_URL}/prebooks/${encodeURIComponent(
      normalizedPrebookId
    )}`,
    {
      method: "GET"
    }
  );

  return validatePrebookResponse.ok;
}

export async function completeBookingHandler(payload) {
  const bookingFlowMode = normalizeBookingFlowMode(payload);

  if (bookingFlowMode === BOOKING_FLOW_MODES.WALLET) {
    return completeWalletBookingHandler(payload);
  }

  return completeTransactionBookingHandler(payload);
}

async function completeTransactionBookingHandler(payload) {
  const bookingPayload = buildTransactionBookingPayload(payload);

  const response = await liteApiRequest(`${LITE_BOOK_API_BASE_URL}/rates/book`, {
    method: "POST",
    body: bookingPayload
  });

  const json = await parseJson(response);

  if (!response.ok) {
    const error = buildLiteApiError(json, "Booking request failed.");
    error.statusCode = response.status;
    throw error;
  }

  return {
    raw: json,
    normalizedBooking: normalizeCompletedBookingResponse(
      json?.data || json,
      payload?.guestDetails || {}
    )
  };
}

async function completeWalletBookingHandler(payload) {
  const orderId = normalizeText(payload?.orderId);

  if (!orderId) {
    throw new Error("orderId is required for WALLET booking.");
  }

  const currentOrder = await elevate(orders.getOrder)(orderId);

  console.log("LITEAPI WALLET backend getOrder shape diagnostic", {
    orderId,
    orderKeys:
      currentOrder && typeof currentOrder === "object"
        ? Object.keys(currentOrder).sort()
        : [],
    orderIdPaths: {
      _id: currentOrder?._id,
      id: currentOrder?.id,
      number: currentOrder?.number
    },
    paymentStatus: currentOrder?.paymentStatus,
    status: currentOrder?.status,
    hasExtendedFields: Boolean(currentOrder?.extendedFields),
    extendedFieldsKeys:
      currentOrder?.extendedFields &&
      typeof currentOrder.extendedFields === "object"
        ? Object.keys(currentOrder.extendedFields).sort()
        : [],
    extendedFields: currentOrder?.extendedFields,
    lineItemsCount: Array.isArray(currentOrder?.lineItems)
      ? currentOrder.lineItems.length
      : 0,
    lineItems: Array.isArray(currentOrder?.lineItems)
      ? currentOrder.lineItems.map((lineItem, index) => ({
          index,
          keys:
            lineItem && typeof lineItem === "object"
              ? Object.keys(lineItem).sort()
              : [],
          _id: lineItem?._id,
          id: lineItem?.id,
          lineItemId: lineItem?.lineItemId,
          _lineItemId: lineItem?._lineItemId,
          productName: lineItem?.productName,
          name: lineItem?.name,
          quantity: lineItem?.quantity,
          itemType: lineItem?.itemType,
          catalogReference: lineItem?.catalogReference,
          catalogReferenceKeys:
            lineItem?.catalogReference &&
            typeof lineItem.catalogReference === "object"
              ? Object.keys(lineItem.catalogReference).sort()
              : [],
          catalogReferenceOptions:
            lineItem?.catalogReference?.options,
          catalogReferenceOptionsKeys:
            lineItem?.catalogReference?.options &&
            typeof lineItem.catalogReference.options === "object"
              ? Object.keys(lineItem.catalogReference.options).sort()
              : [],
          options: lineItem?.options,
          descriptionLines: lineItem?.descriptionLines
        }))
      : []
  });

  const bookingCandidate = resolveSingleLiteApiOrderLineItem(currentOrder);

  if (!bookingCandidate) {
    throw new Error("LiteAPI booking line item was not found in the order.");
  }

  const orderLineItemId = normalizeText(bookingCandidate.orderLineItemId);
  const prebookId = normalizeText(bookingCandidate.prebookId);

  if (!orderLineItemId) {
    throw new Error("order line item id is missing from the order.");
  }

  if (!prebookId) {
    throw new Error("prebookId is missing from the order.");
  }

  const orderUserFields =
    currentOrder?.extendedFields?.[ORDER_EXTENDED_FIELDS_NAMESPACES_KEY]?.[
      ORDER_EXTENDED_FIELDS_NAMESPACE_KEY
    ] || {};

  const orderBookingSnapshot = normalizeBookingSnapshotValue(
    orderUserFields[ORDER_EXTENDED_FIELDS_BOOKING_SNAPSHOT_KEY]
  );

  const orderBookingId = normalizeText(
    orderUserFields[ORDER_EXTENDED_FIELDS_BOOKING_ID_KEY]
  );

  if (orderBookingSnapshot && orderBookingId) {
    console.log("LITEAPI WALLET native order booking snapshot cache hit", {
      orderId,
      orderLineItemId,
      bookingId: orderBookingId,
      bookingClientReference: normalizeText(
        orderUserFields[ORDER_EXTENDED_FIELDS_BOOKING_CLIENT_REFERENCE_KEY]
      )
    });

    return {
      completedBooking: orderBookingSnapshot,
      normalizedBooking: normalizeCompletedBookingResponse(
        orderBookingSnapshot?.data || orderBookingSnapshot,
        extractGuestDetailsFromOrder(currentOrder)
      ),
      persistence: {
        order: {
          status: "cache-hit",
          bookingId: orderBookingId
        }
      }
    };
  }

  const guestDetails = extractGuestDetailsFromOrder(currentOrder);
  validateGuestDetails(guestDetails);

  const clientReference = buildClientReference({
    orderId,
    orderLineItemId,
    prebookId
  });

  const bookingPayload = buildBookingPayload({
    clientReference,
    prebookId,
    guestDetails
  });

  console.log("LITEAPI WALLET booking request", {
    orderId,
    orderLineItemId,
    prebookId,
    clientReference,
    bookingFlowMode: BOOKING_FLOW_MODES.WALLET,
    paymentMethod: BOOKING_FLOW_MODES.WALLET
  });

  const completeBookingResponse = await liteApiRequest(
    `${LITE_BOOK_API_BASE_URL}/rates/book`,
    {
      method: "POST",
      body: bookingPayload
    }
  );

  const bookingResponse = await parseJson(completeBookingResponse);

  if (!completeBookingResponse.ok) {
    const bookingError = buildLiteApiError(
      bookingResponse,
      "Wallet booking request failed."
    );
    bookingError.statusCode = completeBookingResponse.status;
    throw bookingError;
  }

  const completedBooking = bookingResponse;

  const normalizedBooking = normalizeCompletedBookingResponse(
    completedBooking?.data || completedBooking,
    guestDetails
  );

  console.log("LITEAPI WALLET booking supplier success", {
    orderId,
    orderLineItemId,
    prebookId,
    clientReference,
    bookingId: normalizedBooking?.bookingId,
    hotelConfirmationCode: normalizedBooking?.hotelConfirmationCode,
    status: normalizedBooking?.status
  });

  const serializedCompletedBooking =
    serializeBookingSnapshotForStorage(completedBooking);

  const persistence = {
    order: await persistOrderExtendedFieldsBookingSnapshot({
      orderId,
      currentOrder,
      bookingSnapshot: serializedCompletedBooking,
      bookingClientReference: clientReference,
      bookingId: normalizedBooking?.bookingId
    })
  };

  return {
    completedBooking,
    normalizedBooking,
    persistence
  };
}

async function persistOrderExtendedFieldsBookingSnapshot({
  orderId,
  currentOrder,
  bookingSnapshot,
  bookingClientReference,
  bookingId
}) {
  try {
    const currentNamespaces =
      currentOrder?.extendedFields?.[ORDER_EXTENDED_FIELDS_NAMESPACES_KEY] &&
      typeof currentOrder.extendedFields[
        ORDER_EXTENDED_FIELDS_NAMESPACES_KEY
      ] === "object"
        ? currentOrder.extendedFields[ORDER_EXTENDED_FIELDS_NAMESPACES_KEY]
        : {};

    await elevate(orders.updateOrder)(orderId, {
      extendedFields: {
        [ORDER_EXTENDED_FIELDS_NAMESPACES_KEY]: {
          ...currentNamespaces,
          [ORDER_EXTENDED_FIELDS_NAMESPACE_KEY]: {
            [ORDER_EXTENDED_FIELDS_BOOKING_ID_KEY]: normalizeText(bookingId),
            [ORDER_EXTENDED_FIELDS_BOOKING_SNAPSHOT_KEY]:
              normalizeText(bookingSnapshot),
            [ORDER_EXTENDED_FIELDS_BOOKING_CLIENT_REFERENCE_KEY]: normalizeText(
              bookingClientReference
            )
          }
        }
      }
    });

    console.log("LITEAPI WALLET order extended fields updated", {
      orderId,
      bookingId: normalizeText(bookingId),
      bookingClientReference: normalizeText(bookingClientReference),
      bookingSnapshotLength: normalizeText(bookingSnapshot).length
    });

    return {
      status: "updated",
      bookingId: normalizeText(bookingId)
    };
  } catch (error) {
    console.warn("LITEAPI WALLET order extended fields update failed", {
      orderId,
      error: serializeError(error)
    });

    return {
      status: "failed",
      error: serializeError(error)
    };
  }
}

function buildTransactionBookingPayload(payload) {
  const prebookId = normalizeText(payload?.prebookId);
  const transactionId = normalizeText(payload?.transactionId);

  const guestDetails = {
    firstName: normalizeText(payload?.guestDetails?.firstName),
    lastName: normalizeText(payload?.guestDetails?.lastName),
    email: normalizeText(payload?.guestDetails?.email),
    phone: normalizeText(payload?.guestDetails?.phone)
  };

  if (!prebookId) {
    throw new Error("prebookId is required.");
  }

  if (!transactionId) {
    throw new Error("transactionId is required.");
  }

  validateGuestDetails(guestDetails);

  const holder = {
    firstName: guestDetails.firstName,
    lastName: guestDetails.lastName,
    email: guestDetails.email
  };

  if (guestDetails.phone) {
    holder.phone = guestDetails.phone;
  }

  const guest = {
    occupancyNumber: 1,
    firstName: guestDetails.firstName,
    lastName: guestDetails.lastName,
    email: guestDetails.email
  };

  if (guestDetails.phone) {
    guest.phone = guestDetails.phone;
  }

  return {
    prebookId,
    holder,
    guests: [guest],
    payment: {
      method: BOOKING_FLOW_MODES.TRANSACTION,
      transactionId
    }
  };
}

function buildBookingPayload({ clientReference, prebookId, guestDetails }) {
  const holder = {
    firstName: guestDetails.firstName,
    lastName: guestDetails.lastName,
    email: guestDetails.email
  };

  if (guestDetails.phone) {
    holder.phone = guestDetails.phone;
  }

  const guest = {
    occupancyNumber: 1,
    firstName: guestDetails.firstName,
    lastName: guestDetails.lastName,
    email: guestDetails.email
  };

  if (guestDetails.phone) {
    guest.phone = guestDetails.phone;
  }

  return {
    prebookId,
    clientReference,
    holder,
    guests: [guest],
    payment: {
      method: BOOKING_FLOW_MODES.WALLET
    }
  };
}

function buildClientReference({ orderId, orderLineItemId, prebookId }) {
  return [
    `order_id=${normalizeText(orderId)}`,
    `order_line_item_id=${normalizeText(orderLineItemId)}`,
    `item_prebook_id=${normalizeText(prebookId)}`
  ].join("|");
}

function validateGuestDetails(guestDetails) {
  if (
    !guestDetails?.firstName ||
    !guestDetails?.lastName ||
    !guestDetails?.email
  ) {
    throw new Error(
      "Guest first name, last name, and email are required for booking."
    );
  }
}

function extractGuestDetailsFromOrder(order) {
  const billingInfo = order?.billingInfo || {};
  const buyerInfo = order?.buyerInfo || {};
  const recipientInfo = order?.recipientInfo || {};

  const billingContact = billingInfo?.contactDetails || {};
  const buyerContact = buyerInfo?.contactDetails || {};
  const recipientContact = recipientInfo?.contactDetails || {};

  const firstName =
    normalizeText(billingInfo?.firstName) ||
    normalizeText(billingContact?.firstName) ||
    normalizeText(buyerInfo?.firstName) ||
    normalizeText(buyerContact?.firstName) ||
    normalizeText(recipientInfo?.firstName) ||
    normalizeText(recipientContact?.firstName);

  const lastName =
    normalizeText(billingInfo?.lastName) ||
    normalizeText(billingContact?.lastName) ||
    normalizeText(buyerInfo?.lastName) ||
    normalizeText(buyerContact?.lastName) ||
    normalizeText(recipientInfo?.lastName) ||
    normalizeText(recipientContact?.lastName);

  const email =
    normalizeText(billingInfo?.email) ||
    normalizeText(billingContact?.email) ||
    normalizeText(buyerInfo?.email) ||
    normalizeText(buyerContact?.email) ||
    normalizeText(recipientInfo?.email) ||
    normalizeText(recipientContact?.email);

  const phone =
    normalizeText(billingInfo?.phone) ||
    normalizeText(billingContact?.phone) ||
    normalizeText(buyerInfo?.phone) ||
    normalizeText(buyerContact?.phone) ||
    normalizeText(recipientInfo?.phone) ||
    normalizeText(recipientContact?.phone);

  return {
    firstName,
    lastName,
    email,
    phone
  };
}

function resolveSingleLiteApiOrderLineItem(order) {
  const bookingCandidates = collectLiteApiOrderLineItemCandidates(order);

  if (bookingCandidates.length === 0) {
    return null;
  }

  if (bookingCandidates.length > 1) {
    const bookingCandidatesSummary = bookingCandidates.map(
      (bookingCandidate) => ({
        orderLineItemId: bookingCandidate.orderLineItemId,
        prebookId: bookingCandidate.prebookId,
        appId: bookingCandidate.appId,
        catalogItemId: bookingCandidate.catalogItemId
      })
    );

    throw new Error(
      `Multiple LiteAPI booking line items found in order: ${JSON.stringify(
        bookingCandidatesSummary
      )}`
    );
  }

  return bookingCandidates[0];
}

function collectLiteApiOrderLineItemCandidates(order) {
  const lineItems = Array.isArray(order?.lineItems) ? order.lineItems : [];

  return lineItems
    .map((lineItem) => {
      const catalogReference = lineItem?.catalogReference;
      const catalogReferenceOptions =
        catalogReference?.options &&
        typeof catalogReference.options === "object" &&
        !Array.isArray(catalogReference.options)
          ? catalogReference.options
          : null;

      const appId = normalizeText(catalogReference?.appId);
      const catalogItemId = normalizeText(catalogReference?.catalogItemId);
      const prebookId = normalizeText(catalogReferenceOptions?.prebookId);
      const orderLineItemId = normalizeText(lineItem?.id);

      const isLiteApiBookingCandidate =
        appId === LITEAPI_CATALOG_APP_ID &&
        Boolean(catalogItemId) &&
        Boolean(catalogReferenceOptions) &&
        Boolean(prebookId) &&
        Boolean(orderLineItemId);

      if (!isLiteApiBookingCandidate) {
        return null;
      }

      return {
        lineItem,
        appId,
        catalogItemId,
        prebookId,
        orderLineItemId
      };
    })
    .filter(Boolean);
}

function normalizeBookingFlowMode(payload) {
  const normalizedMode = normalizeText(payload?.bookingFlowMode).toUpperCase();

  if (normalizedMode === BOOKING_FLOW_MODES.WALLET) {
    return BOOKING_FLOW_MODES.WALLET;
  }

  if (normalizedMode === BOOKING_FLOW_MODES.TRANSACTION) {
    return BOOKING_FLOW_MODES.TRANSACTION;
  }

  if (normalizeText(payload?.orderId) && !normalizeText(payload?.transactionId)) {
    return BOOKING_FLOW_MODES.WALLET;
  }

  return BOOKING_FLOW_MODES.TRANSACTION;
}

function normalizeBookingSnapshotValue(bookingSnapshotValue) {
  if (!bookingSnapshotValue) {
    return null;
  }

  if (
    typeof bookingSnapshotValue === "object" &&
    !Array.isArray(bookingSnapshotValue)
  ) {
    return bookingSnapshotValue;
  }

  if (typeof bookingSnapshotValue === "string") {
    try {
      const parsedBookingSnapshot = JSON.parse(bookingSnapshotValue);

      return parsedBookingSnapshot &&
        typeof parsedBookingSnapshot === "object" &&
        !Array.isArray(parsedBookingSnapshot)
        ? parsedBookingSnapshot
        : null;
    } catch (error) {
      return null;
    }
  }

  return null;
}

function serializeBookingSnapshotForStorage(bookingSnapshot) {
  if (!bookingSnapshot) {
    return "";
  }

  if (typeof bookingSnapshot === "string") {
    return bookingSnapshot;
  }

  return JSON.stringify(bookingSnapshot);
}

function normalizePrebook(prebookResponse) {
  if (!prebookResponse || typeof prebookResponse !== "object") {
    return null;
  }

  const paymentEnvironment = getLiteApiPaymentEnvironmentSafe(prebookResponse);

  const currentPrice = Number(
    prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.retailRate?.total?.[0]
      ?.amount
  );

  const beforeCurrentPrice = Number(
    prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.retailRate
      ?.suggestedSellingPrice?.[0]?.amount
  );

  const currency = normalizeText(
    prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.retailRate?.total?.[0]
      ?.currency
  );

  if (!currency || !Number.isFinite(currentPrice)) {
    throw new Error("prebook retailRate.total[0] is required.");
  }

  return {
    prebookId: normalizeText(prebookResponse?.data?.prebookId),
    checkInDate: normalizeText(prebookResponse?.data?.checkin),
    checkOutDate: normalizeText(prebookResponse?.data?.checkout),
    rateName: normalizeText(
      prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.name
    ),
    boardName: normalizeText(
      prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.boardName
    ),
    adultCount: normalizeCount(
      prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.adultCount
    ),
    childCount: normalizeCount(
      prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.childCount
    ),
    childrenAges: normalizeNumberArray(
      prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.childrenAges
    ),
    occupancyNumber: normalizeCount(
      prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.occupancyNumber
    ),
    refundableTag:
      normalizeText(
        prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.cancellationPolicies
          ?.refundableTag
      ) || null,
    currency,
    currentPrice,
    beforeCurrentPrice: Number.isFinite(beforeCurrentPrice)
      ? beforeCurrentPrice
      : null,

    transactionId: normalizeText(prebookResponse?.data?.transactionId),
    secretKey: normalizeText(prebookResponse?.data?.secretKey),
    paymentTypes: Array.isArray(prebookResponse?.data?.paymentTypes)
      ? prebookResponse.data.paymentTypes
      : [],
    paymentEnvironment
  };
}

function getLiteApiPaymentEnvironmentSafe(prebookResponse) {
  const sandbox = prebookResponse?.data?.sandbox;

  if (sandbox === true) {
    return "sandbox";
  }

  if (sandbox === false) {
    return "live";
  }

  return "";
}

function normalizeCompletedBookingResponse(rawBooking, guestDetails) {
  const booking = rawBooking || {};

  const cancellationPolicies = normalizeCancellationPolicies(
    booking?.cancellationPolicies ||
      booking?.cancellation_policy ||
      booking?.roomTypes?.[0]?.rates?.[0]?.cancellationPolicies ||
      []
  );

  return {
    bookingId: normalizeText(
      booking?.bookingId ||
        booking?.id ||
        booking?.booking?.bookingId ||
        booking?.booking?.id
    ),
    hotelConfirmationCode: normalizeText(
      booking?.hotelConfirmationCode ||
        booking?.confirmationCode ||
        booking?.hotel_confirmation_code ||
        booking?.reference ||
        booking?.booking?.hotelConfirmationCode
    ),
    status: normalizeText(
      booking?.status ||
        booking?.bookingStatus ||
        booking?.booking?.status ||
        "confirmed"
    ),
    cancellationPolicies,
    guest: {
      firstName: normalizeText(guestDetails?.firstName),
      lastName: normalizeText(guestDetails?.lastName),
      email: normalizeText(guestDetails?.email)
    }
  };
}

function normalizeCancellationPolicies(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }

      if (!item || typeof item !== "object") {
        return "";
      }

      const from = normalizeText(item?.from || item?.date);
      const amount = Number(item?.amount);
      const currency = normalizeText(item?.currency);

      if (from && Number.isFinite(amount) && currency) {
        return `From ${from}: ${currency} ${amount}`;
      }

      if (from) {
        return `From ${from}`;
      }

      if (Number.isFinite(amount) && currency) {
        return `${currency} ${amount}`;
      }

      return normalizeText(item?.description || item?.policy);
    })
    .filter(Boolean);
}

function normalizeNumberArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

function normalizeCount(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.floor(parsed));
}

function normalizeText(value) {
  return String(value || "").trim();
}

function serializeError(error) {
  return {
    name: normalizeText(error?.name),
    message: normalizeText(error?.message),
    stack: normalizeText(error?.stack),
    code: normalizeText(error?.code),
    details:
      error?.details && typeof error.details === "object"
        ? error.details
        : error?.details ?? null
  };
}
