import {
  buildLiteApiError,
  getLiteApiPaymentEnvironment,
  liteApiRequest,
  parseJson
} from "./liteApiClient";
import { getBeforePriceObject, getCurrentPriceObject } from "./liteApiTransforms";

const LITE_BOOK_API_BASE_URL = "https://book.liteapi.travel/v3.0";

export async function createPrebookSessionHandler(payload) {
  const offerId = String(payload?.offerId || "").trim();
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
    throw buildLiteApiError(json, "Prebook request failed.");
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
  const bookingPayload = buildCompleteBookingPayload(payload);

  const requestBody = {
    ...bookingPayload,
    payment: {
      method: "TRANSACTION_ID",
      transactionId: bookingPayload.payment.transactionId
    }
  };

  const response = await liteApiRequest(`${LITE_BOOK_API_BASE_URL}/rates/book`, {
    method: "POST",
    body: requestBody
  });

  const json = await parseJson(response);

  if (response.ok) {
    return {
      raw: json,
      normalizedBooking: normalizeCompletedBookingResponse(
        json?.data || json,
        payload
      )
    };
  }

  throw buildLiteApiError(json, "Booking request failed.");
}

function buildCompleteBookingPayload(payload) {
  const prebookId = String(payload?.prebookId || "").trim();
  const transactionId = String(payload?.transactionId || "").trim();

  const firstName = String(payload?.guestDetails?.firstName || "").trim();
  const lastName = String(payload?.guestDetails?.lastName || "").trim();
  const email = String(payload?.guestDetails?.email || "").trim();
  const phone = String(payload?.guestDetails?.phone || "").trim();

  if (!prebookId) {
    throw new Error("prebookId is required.");
  }

  if (!transactionId) {
    throw new Error("transactionId is required.");
  }

  if (!firstName || !lastName || !email) {
    throw new Error("Guest first name, last name, and email are required.");
  }

  const holder = {
    firstName,
    lastName,
    email
  };

  if (phone) {
    holder.phone = phone;
  }

  return {
    prebookId,
    holder,
    payment: {
      method: "TRANSACTION_ID",
      transactionId
    },
    guests: [
      {
        occupancyNumber: 1,
        firstName,
        lastName,
        email
      }
    ]
  };
}

function normalizePrebookResponse(data, paymentEnvironment) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const firstRoomType = Array.isArray(data?.roomTypes) ? data.roomTypes[0] : null;
  const firstRate = Array.isArray(firstRoomType?.rates) ? firstRoomType.rates[0] : null;

  const fallbackPrice =
    Number.isFinite(Number(data?.price)) && String(data?.currency || "").trim()
      ? {
          amount: Number(data.price),
          currency: String(data.currency).trim()
        }
      : null;

  const currentPrice = getCurrentPriceObject(firstRate, firstRoomType) || fallbackPrice;
  const beforePrice = getBeforePriceObject(firstRate, currentPrice, firstRoomType);

  return {
    prebookId: String(data?.prebookId || ""),
    offerId: String(data?.offerId || ""),
    hotelId: String(data?.hotelId || ""),
    transactionId: String(data?.transactionId || ""),
    secretKey: String(data?.secretKey || ""),
    paymentTypes: Array.isArray(data?.paymentTypes) ? data.paymentTypes : [],
    paymentEnvironment,
    currentPrice,
    beforePrice,
    refundableTag:
      String(firstRate?.cancellationPolicies?.refundableTag || "").trim() || null
  };
}

function normalizeCompletedBookingResponse(rawBooking, payload) {
  const booking = rawBooking || {};

  const cancellationPolicies = normalizeCancellationPolicies(
    booking?.cancellationPolicies ||
      booking?.cancellation_policy ||
      booking?.roomTypes?.[0]?.rates?.[0]?.cancellationPolicies ||
      []
  );

  return {
    bookingId: String(
      booking?.bookingId ||
        booking?.id ||
        booking?.booking?.bookingId ||
        booking?.booking?.id ||
        ""
    ).trim(),
    hotelConfirmationCode: String(
      booking?.hotelConfirmationCode ||
        booking?.confirmationCode ||
        booking?.hotel_confirmation_code ||
        booking?.reference ||
        booking?.booking?.hotelConfirmationCode ||
        ""
    ).trim(),
    status: String(
      booking?.status ||
        booking?.bookingStatus ||
        booking?.booking?.status ||
        "confirmed"
    ).trim(),
    cancellationPolicies,
    guest: {
      firstName: String(payload?.guestDetails?.firstName || "").trim(),
      lastName: String(payload?.guestDetails?.lastName || "").trim(),
      email: String(payload?.guestDetails?.email || "").trim()
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

      const from = String(item?.from || item?.date || "").trim();
      const amount = Number(item?.amount);
      const currency = String(item?.currency || "").trim();

      if (from && Number.isFinite(amount) && currency) {
        return `From ${from}: ${currency} ${amount}`;
      }

      if (from) {
        return `From ${from}`;
      }

      if (Number.isFinite(amount) && currency) {
        return `${currency} ${amount}`;
      }

      return String(item?.description || item?.policy || "").trim();
    })
    .filter(Boolean);
}