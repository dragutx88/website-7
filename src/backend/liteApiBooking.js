import wixData from "wix-data";
import { elevate } from "wix-auth";
import { orders } from "wix-ecom-backend";
import {
  buildLiteApiError,
  getLiteApiPaymentEnvironment,
  liteApiRequest,
  parseJson
} from "./liteApiClient";
import { getBeforePriceObject, getCurrentPriceObject } from "./liteApiTransforms";

const LITE_BOOK_API_BASE_URL = "https://book.liteapi.travel/v3.0";
const LITEAPI_CATALOG_APP_ID = "e7f94f4b-7e6a-41c6-8ee1-52c1d5f31cf4";
const BOOKING_RECORDS_COLLECTION_ID = "circles_program_order";
const BOOKING_RECORD_FIELD_KEY = "item_booking_full_record";

const BOOKING_FLOW_MODES = Object.freeze({
  WALLET: "WALLET",
  TRANSACTION: "TRANSACTION"
});

const elevatedGetOrder = elevate(orders.getOrder);
const elevatedUpdateOrder = elevate(orders.updateOrder);

export async function createPrebookSessionHandler(payload) {
  const offerId = normalizeText(payload?.offerId);
  const usePaymentSdk =
    typeof payload?.usePaymentSdk === "boolean" ? payload.usePaymentSdk : true;

  if (!offerId) {
    throw new Error("offerId is required.");
  }

  const response = await liteApiRequest(`${LITE_BOOK_API_BASE_URL}/rates/prebook`, {
    method: "POST",
    body: {
      offerId,
      usePaymentSdk
    }
  });

  const json = await parseJson(response);

  if (!response.ok) {
    const error = buildLiteApiError(json, "Prebook request failed.");
    error.statusCode = response.status;
    throw error;
  }

  return {
    raw: json,
    normalizedPrebook: normalizePrebookResponse(
      json?.data || null,
      await getLiteApiPaymentEnvironment()
    )
  };
}

export async function getPrebookByIdHandler(payload) {
  const prebookId = normalizeText(
    typeof payload === "string" ? payload : payload?.prebookId
  );

  const includeCreditBalance =
    typeof payload === "object" && payload?.includeCreditBalance !== undefined
      ? normalizeText(payload.includeCreditBalance)
      : "";

  if (!prebookId) {
    throw new Error("prebookId is required.");
  }

  const querySuffix = includeCreditBalance
    ? `?includeCreditBalance=${encodeURIComponent(includeCreditBalance)}`
    : "";

  const response = await liteApiRequest(
    `${LITE_BOOK_API_BASE_URL}/prebooks/${encodeURIComponent(prebookId)}${querySuffix}`,
    {
      method: "GET"
    }
  );

  const json = await parseJson(response);

  if (!response.ok) {
    const error = buildLiteApiError(json, "Get prebook request failed.");
    error.statusCode = response.status;
    throw error;
  }

  return {
    raw: json,
    normalizedPrebook: normalizePrebookResponse(
      json?.data || null,
      await getLiteApiPaymentEnvironment()
    )
  };
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

  const existingRawBooking = await loadExistingRawBookingRecord(orderId);
  if (existingRawBooking && resolveBookingIdFromRaw(existingRawBooking)) {
    return {
      raw: existingRawBooking,
      normalizedBooking: normalizeCompletedBookingResponse(
        existingRawBooking?.data || existingRawBooking,
        {}
      )
    };
  }

  const order = await elevatedGetOrder(orderId);
  const resolvedOrderId = resolveOrderId(order) || orderId;

  const liteApiLineItem = resolveLiteApiOrderLineItem(order);
  if (!liteApiLineItem) {
    throw new Error("LiteAPI booking line item was not found in the order.");
  }

  const prebookId =
    normalizeText(liteApiLineItem?.prebookId) ||
    normalizeText(deepFindFirstValueByKey(liteApiLineItem?.lineItem, "prebookId"));

  if (!prebookId) {
    throw new Error("prebookId is missing from the order.");
  }

  const guestDetails = extractGuestDetailsFromOrder(order);
  validateGuestDetails(guestDetails);

  const requestBody = buildWalletBookingPayload({
    orderId: resolvedOrderId,
    prebookId,
    guestDetails
  });

  console.log(
    "LITEAPI WALLET booking request",
    stringifyForLog({
      orderId: resolvedOrderId,
      bookingFlowMode: BOOKING_FLOW_MODES.WALLET,
      prebookId,
      clientReference: resolvedOrderId,
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

  await saveRawBookingRecord(resolvedOrderId, json);

  const normalizedBooking = normalizeCompletedBookingResponse(
    json?.data || json,
    guestDetails
  );

  await tryUpdateOrderAttributionSource(
    resolvedOrderId,
    normalizedBooking?.bookingId
  );

  return {
    raw: json,
    normalizedBooking
  };
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

function buildWalletBookingPayload({ orderId, prebookId, guestDetails }) {
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
    clientReference: orderId,
    holder,
    guests: [guest],
    payment: {
      method: BOOKING_FLOW_MODES.WALLET
    }
  };
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

function resolveLiteApiOrderLineItem(order) {
  const lineItems = Array.isArray(order?.lineItems) ? order.lineItems : [];

  for (const lineItem of lineItems) {
    const appId = normalizeText(deepFindFirstValueByKey(lineItem, "appId"));
    const prebookId = normalizeText(deepFindFirstValueByKey(lineItem, "prebookId"));
    const reservationMode = normalizeText(
      deepFindFirstValueByKey(lineItem, "reservationMode")
    ).toLowerCase();

    const looksLikeLiteApiItem =
      appId === LITEAPI_CATALOG_APP_ID || Boolean(prebookId);

    if (!looksLikeLiteApiItem) {
      continue;
    }

    return {
      lineItem,
      appId,
      prebookId,
      reservationMode
    };
  }

  return null;
}

async function loadExistingRawBookingRecord(orderId) {
  try {
    const record = await wixData.get(BOOKING_RECORDS_COLLECTION_ID, orderId);
    const rawBookingObject = record?.[BOOKING_RECORD_FIELD_KEY];

    if (rawBookingObject && typeof rawBookingObject === "object") {
      return rawBookingObject;
    }

    return null;
  } catch (error) {
    return null;
  }
}

async function saveRawBookingRecord(orderId, rawBookingObject) {
  await wixData.save(BOOKING_RECORDS_COLLECTION_ID, {
    _id: orderId,
    [BOOKING_RECORD_FIELD_KEY]: rawBookingObject
  });
}

async function tryUpdateOrderAttributionSource(orderId, bookingId) {
  const normalizedBookingId = normalizeText(bookingId);
  if (!normalizedBookingId) {
    return;
  }

  try {
    await elevatedUpdateOrder(orderId, {
      attributionSource: `liteapi:${normalizedBookingId}`
    });
  } catch (error) {
    console.warn(
      "LITEAPI booking attributionSource update failed",
      stringifyForLog({
        orderId,
        bookingId: normalizedBookingId,
        error
      })
    );
  }
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

function normalizePrebookResponse(data, paymentEnvironment) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const firstRoomType = Array.isArray(data?.roomTypes) ? data.roomTypes[0] : null;
  const firstRate = Array.isArray(firstRoomType?.rates) ? firstRoomType.rates[0] : null;

  const fallbackPrice =
    Number.isFinite(Number(data?.price)) && normalizeText(data?.currency)
      ? {
          amount: Number(data.price),
          currency: normalizeText(data.currency)
        }
      : null;

  const currentPrice = getCurrentPriceObject(firstRate, firstRoomType) || fallbackPrice;
  const beforePrice = getBeforePriceObject(firstRate, currentPrice, firstRoomType);

  return {
    prebookId: normalizeText(data?.prebookId),
    offerId: normalizeText(data?.offerId),
    hotelId: normalizeText(data?.hotelId),
    transactionId: normalizeText(data?.transactionId),
    secretKey: normalizeText(data?.secretKey),
    paymentTypes: Array.isArray(data?.paymentTypes) ? data.paymentTypes : [],
    paymentEnvironment,
    currentPrice,
    beforePrice,
    refundableTag:
      normalizeText(firstRate?.cancellationPolicies?.refundableTag) || null
  };
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

function normalizeText(value) {
  return String(value || "").trim();
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