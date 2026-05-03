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

  console.log("LITEAPI WALLET getOrder exact-path checkpoint", {
    hasOrderId: Boolean(orderId),
    hasCurrentOrderId: Boolean(normalizeText(currentOrder?._id)),
    paymentStatus: normalizeText(currentOrder?.paymentStatus),
    orderStatus: normalizeText(currentOrder?.status),
    lineItemsCount: Array.isArray(currentOrder?.lineItems)
      ? currentOrder.lineItems.length
      : 0,
    hasExtendedFields: Boolean(currentOrder?.extendedFields)
  });

  const bookingCandidate = resolveSingleLiteApiOrderLineItem(currentOrder);

  if (!bookingCandidate) {
    throw new Error("LiteAPI booking line item was not found in the order.");
  }

  const orderLineItemId = normalizeText(bookingCandidate.orderLineItemId);
  const prebookId = normalizeText(bookingCandidate.prebookId);

  if (!orderLineItemId) {
    throw new Error("order line item _id is missing from the order.");
  }

  if (!prebookId) {
    throw new Error("prebookId is missing from the order.");
  }

  console.log("LITEAPI WALLET booking line item candidate resolved", {
    hasOrderId: Boolean(orderId),
    hasOrderLineItemId: Boolean(orderLineItemId),
    hasPrebookId: Boolean(prebookId),
    hasCatalogItemId: Boolean(bookingCandidate.catalogItemId),
    isLiteApiCatalogApp: bookingCandidate.appId === LITEAPI_CATALOG_APP_ID,
    hasPrebookSnapshot: Boolean(bookingCandidate.prebookSnapshot)
  });

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

  const orderBookingClientReference = normalizeText(
    orderUserFields[ORDER_EXTENDED_FIELDS_BOOKING_CLIENT_REFERENCE_KEY]
  );

  console.log("LITEAPI WALLET order _user_fields lookup", {
    hasOrderId: Boolean(orderId),
    hasOrderLineItemId: Boolean(orderLineItemId),
    hasPrebookId: Boolean(prebookId),
    hasUserFields: Boolean(
      currentOrder?.extendedFields?.[ORDER_EXTENDED_FIELDS_NAMESPACES_KEY]?.[
        ORDER_EXTENDED_FIELDS_NAMESPACE_KEY
      ]
    ),
    userFieldKeysCount:
      orderUserFields && typeof orderUserFields === "object"
        ? Object.keys(orderUserFields).length
        : 0,
    hasBookingId: Boolean(orderBookingId),
    hasBookingClientReference: Boolean(orderBookingClientReference),
    hasBookingSnapshot: Boolean(orderBookingSnapshot)
  });

  if (orderBookingSnapshot && orderBookingId) {
    console.log("LITEAPI WALLET native order booking snapshot cache hit", {
      hasOrderId: Boolean(orderId),
      hasOrderLineItemId: Boolean(orderLineItemId),
      hasPrebookId: Boolean(prebookId),
      hasBookingId: Boolean(orderBookingId),
      hasBookingClientReference: Boolean(orderBookingClientReference),
      hasBookingSnapshot: Boolean(orderBookingSnapshot)
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
          bookingId: orderBookingId,
          bookingClientReference: orderBookingClientReference
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
    hasOrderId: Boolean(orderId),
    hasOrderLineItemId: Boolean(orderLineItemId),
    hasPrebookId: Boolean(prebookId),
    hasClientReference: Boolean(clientReference),
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
    hasOrderId: Boolean(orderId),
    hasOrderLineItemId: Boolean(orderLineItemId),
    hasPrebookId: Boolean(prebookId),
    hasClientReference: Boolean(clientReference),
    hasBookingId: Boolean(normalizedBooking?.bookingId),
    hasHotelConfirmationCode: Boolean(
      normalizedBooking?.hotelConfirmationCode
    ),
    bookingStatus: normalizeText(normalizedBooking?.status)
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

    console.log("LITEAPI WALLET order extended fields update start", {
      hasOrderId: Boolean(orderId),
      currentNamespaceKeysCount: Object.keys(currentNamespaces).length,
      targetNamespace: ORDER_EXTENDED_FIELDS_NAMESPACE_KEY,
      hasBookingId: Boolean(normalizeText(bookingId)),
      hasBookingClientReference: Boolean(
        normalizeText(bookingClientReference)
      ),
      bookingSnapshotLength: normalizeText(bookingSnapshot).length
    });

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
      hasOrderId: Boolean(orderId),
      hasBookingId: Boolean(normalizeText(bookingId)),
      hasBookingClientReference: Boolean(
        normalizeText(bookingClientReference)
      ),
      bookingSnapshotLength: normalizeText(bookingSnapshot).length
    });

    return {
      status: "updated",
      bookingId: normalizeText(bookingId),
      bookingClientReference: normalizeText(bookingClientReference)
    };
  } catch (error) {
    console.warn("LITEAPI WALLET order extended fields update failed", {
      hasOrderId: Boolean(orderId),
      name: error?.name,
      message: error?.message,
      stack: error?.stack
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
    throw new Error(
      `Multiple LiteAPI booking line items found in order. Count: ${bookingCandidates.length}`
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
      const prebookSnapshot = normalizeText(
        catalogReferenceOptions?.prebookSnapshot
      );
      const orderLineItemId = normalizeText(lineItem?._id);

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
        prebookSnapshot,
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

function normalizeText(value) {
  return String(value ?? "").trim();
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
