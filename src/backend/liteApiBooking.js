import wixData from "wix-data";
import { elevate } from "wix-auth";
import { orders } from "wix-ecom-backend";
import {
  buildLiteApiError,
  getLiteApiPaymentEnvironment,
  liteApiRequest,
  parseJson
} from "./liteApiClient";

const LITE_BOOK_API_BASE_URL = "https://book.liteapi.travel/v3.0";
const LITEAPI_CATALOG_APP_ID = "e7f94f4b-7e6a-41c6-8ee1-52c1d5f31cf4";

const BOOKING_RECORDS_COLLECTION_ID = "circles_program_order";
const BOOKING_RECORD_FIELD_KEY = "item_booking_full_record";
const BOOKING_RECORD_CLIENT_REFERENCE_FIELD_KEY = "item_client_reference";
const BOOKING_RECORD_ORDER_ID_FIELD_KEY = "order_id";
const BOOKING_RECORD_ORDER_LINE_ITEM_ID_FIELD_KEY = "order_line_item_id";

const BOOKING_FLOW_MODES = Object.freeze({
  WALLET: "WALLET",
  TRANSACTION: "TRANSACTION"
});

const elevatedGetOrder = elevate(orders.getOrder);

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

  const order = await elevatedGetOrder(orderId);
  const resolvedOrderId = resolveOrderId(order) || orderId;

  const bookingCandidate = resolveSingleLiteApiOrderLineItem(order);
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

  const existingRecord = await loadExistingRawBookingRecord({
    orderId: resolvedOrderId,
    orderLineItemId
  });

  if (existingRecord?.rawBookingObject) {
    const existingBookingId = resolveBookingIdFromRaw(existingRecord.rawBookingObject);

    if (existingBookingId) {
      console.log(
        "LITEAPI WALLET booking cache hit",
        stringifyForLog({
          orderId: resolvedOrderId,
          orderLineItemId,
          recordId: existingRecord.record?._id,
          bookingId: existingBookingId
        })
      );

      return {
        raw: existingRecord.rawBookingObject,
        normalizedBooking: normalizeCompletedBookingResponse(
          existingRecord.rawBookingObject?.data || existingRecord.rawBookingObject,
          extractGuestDetailsFromOrder(order)
        ),
        persistence: {
          cms: {
            status: "cache-hit",
            recordId: normalizeText(existingRecord.record?._id)
          }
        }
      };
    }

    console.warn(
      "LITEAPI WALLET existing record found without bookingId; continuing live booking",
      stringifyForLog({
        orderId: resolvedOrderId,
        orderLineItemId,
        recordId: existingRecord.record?._id
      })
    );
  }

  const guestDetails = extractGuestDetailsFromOrder(order);
  validateGuestDetails(guestDetails);

  const clientReference = buildWalletClientReference({
    orderId: resolvedOrderId,
    orderLineItemId,
    prebookId
  });

  const requestBody = buildWalletBookingPayload({
    clientReference,
    prebookId,
    guestDetails
  });

  console.log(
    "LITEAPI WALLET booking request",
    stringifyForLog({
      orderId: resolvedOrderId,
      orderLineItemId,
      prebookId,
      clientReference,
      bookingFlowMode: BOOKING_FLOW_MODES.WALLET,
      paymentMethod: BOOKING_FLOW_MODES.WALLET
    })
  );

  const response = await liteApiRequest(`${LITE_BOOK_API_BASE_URL}/rates/book`, {
    method: "POST",
    body: requestBody
  });

  const json = await parseJson(response);

  if (!response.ok) {
    const error = buildLiteApiError(json, "Wallet booking request failed.");
    error.statusCode = response.status;
    throw error;
  }

  const normalizedBooking = normalizeCompletedBookingResponse(
    json?.data || json,
    guestDetails
  );

  console.log(
    "LITEAPI WALLET booking supplier success",
    stringifyForLog({
      orderId: resolvedOrderId,
      orderLineItemId,
      prebookId,
      clientReference,
      bookingId: normalizedBooking?.bookingId,
      hotelConfirmationCode: normalizedBooking?.hotelConfirmationCode,
      status: normalizedBooking?.status
    })
  );

  const persistence = await persistWalletBookingRecord({
    orderId: resolvedOrderId,
    orderLineItemId,
    clientReference,
    rawBookingObject: json
  });

  return {
    raw: json,
    normalizedBooking,
    persistence
  };
}

async function persistWalletBookingRecord({
  orderId,
  orderLineItemId,
  clientReference,
  rawBookingObject
}) {
  const persistence = {
    cms: {
      status: "not-started",
      recordId: ""
    }
  };

  try {
    const insertResult = await insertRawBookingRecord({
      orderId,
      orderLineItemId,
      clientReference,
      rawBookingObject
    });

    persistence.cms = {
      status: "inserted",
      recordId: normalizeText(insertResult?._id)
    };

    console.log(
      "LITEAPI WALLET booking record inserted",
      stringifyForLog({
        orderId,
        orderLineItemId,
        recordId: insertResult?._id
      })
    );
  } catch (error) {
    persistence.cms = {
      status: "failed",
      error: serializeError(error)
    };

    console.warn(
      "LITEAPI WALLET booking record insert failed",
      stringifyForLog({
        orderId,
        orderLineItemId,
        error
      })
    );
  }

  return persistence;
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

function buildWalletBookingPayload({ clientReference, prebookId, guestDetails }) {
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

function buildWalletClientReference({ orderId, orderLineItemId, prebookId }) {
  return [
    `order_id=${normalizeText(orderId)}`,
    `order_line_item_id=${normalizeText(orderLineItemId)}`,
    `item_prebook_id=${normalizeText(prebookId)}`
  ].join("|");
}

function validateGuestDetails(guestDetails) {
  if (!guestDetails?.firstName || !guestDetails?.lastName || !guestDetails?.email) {
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
  const candidates = collectLiteApiOrderLineItemCandidates(order);

  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length > 1) {
    const summary = candidates.map((candidate) => ({
      orderLineItemId: candidate.orderLineItemId,
      prebookId: candidate.prebookId,
      appId: candidate.appId
    }));

    throw new Error(
      `Multiple LiteAPI booking line items found in order: ${JSON.stringify(summary)}`
    );
  }

  return candidates[0];
}

function collectLiteApiOrderLineItemCandidates(order) {
  const lineItems = Array.isArray(order?.lineItems) ? order.lineItems : [];

  return lineItems
    .map((lineItem) => {
      const appId = normalizeText(deepFindFirstValueByKey(lineItem, "appId"));
      const prebookId = normalizeText(deepFindFirstValueByKey(lineItem, "prebookId"));
      const orderLineItemId = resolveOrderLineItemId(lineItem);

      const looksLikeLiteApiItem =
        appId === LITEAPI_CATALOG_APP_ID || Boolean(prebookId);

      const isUsableCandidate =
        looksLikeLiteApiItem &&
        Boolean(orderLineItemId) &&
        Boolean(prebookId);

      if (!isUsableCandidate) {
        return null;
      }

      return {
        lineItem,
        appId,
        prebookId,
        orderLineItemId
      };
    })
    .filter(Boolean);
}

function resolveOrderLineItemId(lineItem) {
  return normalizeText(
    lineItem?._id ||
      lineItem?.id ||
      lineItem?.lineItemId ||
      lineItem?._lineItemId
  );
}

async function loadExistingRawBookingRecord({ orderId, orderLineItemId }) {
  try {
    const result = await wixData
      .query(BOOKING_RECORDS_COLLECTION_ID)
      .eq(BOOKING_RECORD_ORDER_ID_FIELD_KEY, orderId)
      .eq(BOOKING_RECORD_ORDER_LINE_ITEM_ID_FIELD_KEY, orderLineItemId)
      .limit(1)
      .find({
        suppressAuth: true,
        consistentRead: true
      });

    const record = Array.isArray(result?.items) ? result.items[0] || null : null;
    const rawBookingObject = record?.[BOOKING_RECORD_FIELD_KEY];

    return {
      record,
      rawBookingObject:
        rawBookingObject && typeof rawBookingObject === "object"
          ? rawBookingObject
          : null
    };
  } catch (error) {
    console.warn(
      "LITEAPI WALLET booking record lookup failed",
      stringifyForLog({
        orderId,
        orderLineItemId,
        error
      })
    );

    return {
      record: null,
      rawBookingObject: null
    };
  }
}

async function insertRawBookingRecord({
  orderId,
  orderLineItemId,
  clientReference,
  rawBookingObject
}) {
  return wixData.insert(
    BOOKING_RECORDS_COLLECTION_ID,
    {
      [BOOKING_RECORD_ORDER_ID_FIELD_KEY]: orderId,
      [BOOKING_RECORD_ORDER_LINE_ITEM_ID_FIELD_KEY]: orderLineItemId,
      [BOOKING_RECORD_CLIENT_REFERENCE_FIELD_KEY]: clientReference,
      [BOOKING_RECORD_FIELD_KEY]: rawBookingObject
    },
    {
      suppressAuth: true
    }
  );
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

function resolveOrderId(order) {
  return normalizeText(order?.id || order?._id);
}

function resolveBookingIdFromRaw(rawBookingObject) {
  const bookingRoot = rawBookingObject?.data || rawBookingObject;

  return normalizeText(
    bookingRoot?.bookingId ||
      bookingRoot?.id ||
      bookingRoot?.booking?.bookingId ||
      bookingRoot?.booking?.id
  );
}

function normalizePrebook(prebookResponse) {
  if (!prebookResponse || typeof prebookResponse !== "object") {
    return null;
  }

  const paymentEnvironment = getLiteApiPaymentEnvironmentSafe(prebookResponse);

  const currentPrice = Number(
    prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.retailRate?.total?.[0]?.amount
  );

  const beforeCurrentPrice = Number(
    prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.retailRate?.suggestedSellingPrice?.[0]?.amount
  );

  const currency = normalizeText(
    prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.retailRate?.total?.[0]?.currency
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
        prebookResponse?.data?.roomTypes?.[0]?.rates?.[0]?.cancellationPolicies?.refundableTag
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

function deepFindFirstValueByKey(input, targetKey) {
  const visited = new WeakSet();

  function walk(value) {
    if (value === null || value === undefined) {
      return "";
    }

    if (typeof value !== "object") {
      return "";
    }

    if (visited.has(value)) {
      return "";
    }

    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const foundInArray = walk(item);
        if (foundInArray !== "") {
          return foundInArray;
        }
      }

      return "";
    }

    if (Object.prototype.hasOwnProperty.call(value, targetKey)) {
      return value[targetKey];
    }

    for (const nestedValue of Object.values(value)) {
      const found = walk(nestedValue);
      if (found !== "") {
        return found;
      }
    }

    return "";
  }

  return walk(input);
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

function stringifyForLog(value) {
  try {
    const visited = new WeakSet();

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

        if (currentValue && typeof currentValue === "object") {
          if (visited.has(currentValue)) {
            return "[circular]";
          }

          visited.add(currentValue);
        }

        return currentValue;
      },
      2
    );
  } catch (error) {
    return `[unserializable: ${String(error?.message || error)}]`;
  }
}