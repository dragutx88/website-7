import wixLocationFrontend from "wix-location-frontend";
import { local, session } from "wix-storage-frontend";

export const FLOW_STORAGE_KEYS = Object.freeze({
  searchForm: "liteapi.searchFormState.v1",
  searchResults: "liteapi.searchResults.v1",
  selectedHotel: "liteapi.selectedHotel.v1",
  selectedOffer: "liteapi.selectedOffer.v1",
  checkoutSession: "liteapi.checkoutSession.v1",
  bookingResult: "liteapi.bookingResult.v1"
});

export const PAGE_PATHS = Object.freeze({
  home: "/",
  hotels: "/hotels",
  hotel: "/hotel",
  checkout: "/checkout",
  confirmation: "/confirmation"
});

export const DEFAULT_LANGUAGE = "en";
export const DEFAULT_CURRENCY = "USD";

const DEFAULT_FLOW_TTL_MS = 1000 * 60 * 60 * 12;
const LONG_FLOW_TTL_MS = 1000 * 60 * 60 * 24;
const CANONICAL_SITE_BASE_URL = "https://zafertepe.wixstudio.com/website-5";

export function persistFlowState(key, value, options = {}) {
  if (!key || value === undefined) {
    return;
  }

  const ttlMs = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : DEFAULT_FLOW_TTL_MS;
  const mirrorToLocal = options.mirrorToLocal !== false;
  const storedValue = JSON.stringify({
    savedAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
    value
  });

  session.setItem(key, storedValue);

  if (mirrorToLocal) {
    local.setItem(key, storedValue);
  }
}

export function loadFlowState(key, options = {}) {
  if (!key) {
    return null;
  }

  const preferLocal = options.preferLocal === true;
  const allowLocal = options.allowLocal !== false;
  const storages = preferLocal
    ? [{ type: "local", storage: local }, { type: "session", storage: session }]
    : [{ type: "session", storage: session }, { type: "local", storage: local }];

  for (const target of storages) {
    if (target.type === "local" && !allowLocal) {
      continue;
    }

    const rawValue = target.storage.getItem(key);
    if (!rawValue) {
      continue;
    }

    const parsed = parseStoredState(rawValue);

    if (!parsed.isValid) {
      clearFlowState(key);
      return null;
    }

    if (target.type === "local" && options.mirrorBackToSession !== false) {
      session.setItem(key, parsed.rawValue);
    }

    if (target.type === "session" && allowLocal && options.mirrorBackToLocal === true) {
      local.setItem(key, parsed.rawValue);
    }

    return parsed.value;
  }

  return null;
}

export function clearFlowState(key, options = {}) {
  if (!key) {
    return;
  }

  session.removeItem(key);

  if (options.clearLocal !== false) {
    local.removeItem(key);
  }
}

function parseStoredState(rawValue) {
  try {
    const parsed = JSON.parse(rawValue);

    if (parsed && typeof parsed === "object" && "value" in parsed) {
      const expiresAt = Number(parsed.expiresAt || 0);

      if (Number.isFinite(expiresAt) && expiresAt > 0 && Date.now() > expiresAt) {
        return { isValid: false, value: null, rawValue };
      }

      return { isValid: true, value: parsed.value, rawValue };
    }

    return { isValid: true, value: parsed, rawValue };
  } catch (error) {
    return { isValid: false, value: null, rawValue };
  }
}

export function persistSearchResultsPayload(payload) {
  persistFlowState(FLOW_STORAGE_KEYS.searchResults, payload, {
    ttlMs: DEFAULT_FLOW_TTL_MS,
    mirrorToLocal: true
  });
}

export function loadSearchResultsPayload() {
  return loadFlowState(FLOW_STORAGE_KEYS.searchResults, {
    allowLocal: true
  });
}

export function persistSelectedHotelPayload(payload) {
  persistFlowState(FLOW_STORAGE_KEYS.selectedHotel, payload, {
    ttlMs: DEFAULT_FLOW_TTL_MS,
    mirrorToLocal: true
  });
}

export function loadSelectedHotelPayload() {
  return loadFlowState(FLOW_STORAGE_KEYS.selectedHotel, {
    allowLocal: true
  });
}

export function persistSelectedOfferPayload(payload) {
  persistFlowState(FLOW_STORAGE_KEYS.selectedOffer, payload, {
    ttlMs: DEFAULT_FLOW_TTL_MS,
    mirrorToLocal: true
  });
}

export function loadSelectedOfferPayload() {
  return loadFlowState(FLOW_STORAGE_KEYS.selectedOffer, {
    allowLocal: true
  });
}

export function persistCheckoutSession(payload) {
  persistFlowState(FLOW_STORAGE_KEYS.checkoutSession, payload, {
    ttlMs: DEFAULT_FLOW_TTL_MS,
    mirrorToLocal: true
  });
}

export function loadCheckoutSession() {
  return loadFlowState(FLOW_STORAGE_KEYS.checkoutSession, {
    allowLocal: true
  });
}

export function clearCheckoutSession() {
  clearFlowState(FLOW_STORAGE_KEYS.checkoutSession);
}

export function persistBookingResult(payload) {
  persistFlowState(FLOW_STORAGE_KEYS.bookingResult, payload, {
    ttlMs: LONG_FLOW_TTL_MS,
    mirrorToLocal: true
  });
}

export function loadBookingResult() {
  return loadFlowState(FLOW_STORAGE_KEYS.bookingResult, {
    allowLocal: true
  });
}

export function buildCanonicalCtx(searchFormData, overrides = {}) {
  const occupancy = normalizeOccupancy(searchFormData?.occupancy);
  const language = String(overrides.language || DEFAULT_LANGUAGE).trim() || DEFAULT_LANGUAGE;
  const currency = String(overrides.currency || DEFAULT_CURRENCY).trim() || DEFAULT_CURRENCY;

  return {
    mode: String(searchFormData?.mode || "destination"),
    placeId: String(searchFormData?.placeId || ""),
    name: String(searchFormData?.searchQuery || ""),
    aiSearch: String(searchFormData?.aiSearch || ""),
    checkin: String(searchFormData?.checkIn || searchFormData?.checkin || ""),
    checkout: String(searchFormData?.checkOut || searchFormData?.checkout || ""),
    rooms: 1,
    adults: occupancy.adults,
    children: occupancy.children,
    occupancies: encodeOccupancies([
      {
        adults: occupancy.adults,
        children: occupancy.childAges.map((age) => Number(age))
      }
    ]),
    language,
    currency
  };
}

export function normalizeCtxFromQuery(query = {}) {
  const mode = String(query.mode || "destination");
  const placeId = String(query.placeId || "");
  const name = String(query.name || "");
  const aiSearch = String(query.aiSearch || "");
  const checkin = String(query.checkin || query.checkIn || "");
  const checkout = String(query.checkout || query.checkOut || "");
  const rooms = normalizePositiveInteger(query.rooms, 1, 1);
  const adults = normalizePositiveInteger(query.adults, 2, 1);
  const children = normalizeNonNegativeInteger(query.children, 0);

  let occupancies = String(query.occupancies || "").trim();

  if (!occupancies) {
    occupancies = encodeOccupancies([
      {
        adults,
        children: []
      }
    ]);
  }

  return {
    hotelId: String(query.hotelId || ""),
    offerId: String(query.offerId || ""),
    prebookId: String(query.prebookId || ""),
    transactionId: String(query.transactionId || ""),
    mode,
    placeId,
    name,
    aiSearch,
    checkin,
    checkout,
    rooms,
    adults,
    children,
    occupancies,
    language: String(query.language || DEFAULT_LANGUAGE),
    currency: String(query.currency || DEFAULT_CURRENCY)
  };
}

export function buildSearchFormDataFromCtx(ctx = {}) {
  const occupancy = buildOccupancyFromCtx(ctx);

  return {
    mode: ctx.mode || "destination",
    searchQuery: ctx.name || "",
    placeId: ctx.placeId || "",
    aiSearch: ctx.aiSearch || "",
    checkIn: ctx.checkin || "",
    checkOut: ctx.checkout || "",
    occupancy
  };
}

export function buildOccupancyFromCtx(ctx = {}) {
  const decoded = decodeOccupancies(ctx.occupancies);
  const first = decoded[0];

  if (first && typeof first === "object") {
    const childAges = Array.isArray(first.children)
      ? first.children
          .map((age) => Number(age))
          .filter((age) => Number.isFinite(age))
          .map((age) => String(Math.max(0, Math.min(17, Math.floor(age)))))
      : [];

    return {
      adults: normalizePositiveInteger(first.adults, Number(ctx.adults || 2), 1),
      children: childAges.length,
      childAges
    };
  }

  return normalizeOccupancy({
    adults: ctx.adults,
    children: ctx.children,
    childAges: []
  });
}

export function encodeOccupancies(occupancies) {
  try {
    return btoa(JSON.stringify(Array.isArray(occupancies) ? occupancies : []));
  } catch (error) {
    return "";
  }
}

export function decodeOccupancies(encodedValue) {
  try {
    if (!encodedValue) {
      return [];
    }

    const parsed = JSON.parse(atob(String(encodedValue)));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

export function buildCtxQueryString(ctx = {}) {
  const params = new URLSearchParams();

  params.set("mode", String(ctx.mode || "destination"));

  if (ctx.placeId) {
    params.set("placeId", String(ctx.placeId));
  }

  if (ctx.name) {
    params.set("name", String(ctx.name));
  }

  if (ctx.aiSearch) {
    params.set("aiSearch", String(ctx.aiSearch));
  }

  params.set("checkin", String(ctx.checkin || ""));
  params.set("checkout", String(ctx.checkout || ""));
  params.set("rooms", String(ctx.rooms || 1));
  params.set("adults", String(ctx.adults || 2));
  params.set("children", String(ctx.children || 0));

  if (ctx.occupancies) {
    params.set("occupancies", String(ctx.occupancies));
  }

  params.set("language", String(ctx.language || DEFAULT_LANGUAGE));
  params.set("currency", String(ctx.currency || DEFAULT_CURRENCY));

  return params.toString();
}

export function buildHotelPageUrl(ctx, hotelId) {
  const params = new URLSearchParams(buildCtxQueryString(ctx));
  params.set("hotelId", String(hotelId || ""));
  return `${PAGE_PATHS.hotel}?${params.toString()}`;
}

export function buildCheckoutPageUrl(ctx, hotelId, offerId) {
  const params = new URLSearchParams(buildCtxQueryString(ctx));
  params.set("hotelId", String(hotelId || ""));
  params.set("offerId", String(offerId || ""));
  return `${PAGE_PATHS.checkout}?${params.toString()}`;
}

export function buildConfirmationReturnUrl(origin, ctx, ids = {}) {
  const params = new URLSearchParams(buildCtxQueryString(ctx));
  params.set("prebookId", String(ids.prebookId || ""));
  params.set("transactionId", String(ids.transactionId || ""));
  params.set("hotelId", String(ids.hotelId || ""));
  params.set("offerId", String(ids.offerId || ""));

  const resolvedOrigin = resolveAbsoluteOrigin(origin);
  return `${resolvedOrigin}${PAGE_PATHS.confirmation}?${params.toString()}`;
}

function resolveAbsoluteOrigin(origin) {
  if (/^https?:\/\//i.test(CANONICAL_SITE_BASE_URL)) {
    return CANONICAL_SITE_BASE_URL.replace(/\/$/, "");
  }

  const normalizedOrigin = String(origin || "").trim();

  if (/^https?:\/\//i.test(normalizedOrigin)) {
    return normalizedOrigin.replace(/\/$/, "");
  }

  try {
    const frontendBaseUrl = String(wixLocationFrontend?.baseUrl || "").trim();
    const frontendFullUrl = String(wixLocationFrontend?.url || "").trim();

    if (/^https?:\/\//i.test(frontendBaseUrl)) {
      return frontendBaseUrl.replace(/\/$/, "");
    }

    if (frontendFullUrl) {
      const frontendUrl = new URL(frontendFullUrl);
      const frontendEditorDestination = String(
        frontendUrl.searchParams.get("localEditorDestination") || ""
      ).trim();

      if (/^https?:\/\//i.test(frontendEditorDestination)) {
        return frontendEditorDestination.replace(/\/$/, "");
      }

      if (/^https?:\/\//i.test(frontendUrl.origin)) {
        return frontendUrl.origin.replace(/\/$/, "");
      }
    }

    if (typeof window !== "undefined" && window.location) {
      const currentHref = String(window.location.href || "").trim();
      const currentOrigin = String(window.location.origin || "").trim();

      if (currentHref) {
        const url = new URL(currentHref);
        const editorDestination = String(
          url.searchParams.get("localEditorDestination") || ""
        ).trim();

        if (/^https?:\/\//i.test(editorDestination)) {
          return editorDestination.replace(/\/$/, "");
        }
      }

      if (/^https?:\/\//i.test(currentOrigin)) {
        return currentOrigin.replace(/\/$/, "");
      }

      if (currentHref) {
        return new URL(currentHref).origin.replace(/\/$/, "");
      }
    }
  } catch (error) {}

  return normalizedOrigin.replace(/\/$/, "");
}

export function ctxMatches(left = {}, right = {}) {
  return (
    String(left.mode || "") === String(right.mode || "") &&
    String(left.placeId || "") === String(right.placeId || "") &&
    String(left.name || "") === String(right.name || "") &&
    String(left.aiSearch || "") === String(right.aiSearch || "") &&
    String(left.checkin || left.checkIn || "") === String(right.checkin || right.checkIn || "") &&
    String(left.checkout || left.checkOut || "") === String(right.checkout || right.checkOut || "") &&
    String(left.occupancies || "") === String(right.occupancies || "")
  );
}

export function selectedOfferMatchesCtx(payload, ctx = {}) {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const payloadCtx = payload.ctx || {};
  const payloadHotelId = String(payload.hotelId || payloadCtx.hotelId || "").trim();
  const payloadOfferId = String(payload.offerId || payload.offer?.offerId || "").trim();
  const ctxHotelId = String(ctx.hotelId || "").trim();
  const ctxOfferId = String(ctx.offerId || "").trim();

  if (ctxHotelId && payloadHotelId && ctxHotelId !== payloadHotelId) {
    return false;
  }

  if (ctxOfferId && payloadOfferId && ctxOfferId !== payloadOfferId) {
    return false;
  }

  return !payloadCtx || Object.keys(payloadCtx).length === 0 || ctxMatches(payloadCtx, ctx);
}

export function checkoutSessionMatches(sessionPayload, selectedOfferPayload, ctx = {}) {
  if (!sessionPayload || typeof sessionPayload !== "object") {
    return false;
  }

  if (!selectedOfferMatchesCtx(sessionPayload.selectedOffer || selectedOfferPayload, ctx)) {
    return false;
  }

  const prebook = sessionPayload.prebook || {};

  return Boolean(
    String(prebook.prebookId || "").trim() &&
      String(prebook.transactionId || "").trim() &&
      String(prebook.secretKey || "").trim()
  );
}

export function buildGuestsSummaryFromCtx(ctx = {}) {
  const adults = normalizePositiveInteger(ctx.adults, 2, 1);
  const children = normalizeNonNegativeInteger(ctx.children, 0);

  const adultsText = adults === 1 ? "1 Adult" : `${adults} Adults`;
  const childrenText = children === 1 ? "1 Child" : `${children} Children`;

  return children > 0
    ? `${adultsText}, ${childrenText}, 1 Room`
    : `${adultsText}, 1 Room`;
}

export function formatDisplayDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(date);
  } catch (error) {
    return String(value);
  }
}

export function formatRefundableTag(value) {
  const normalized = String(value || "").trim().toUpperCase();

  if (!normalized) {
    return "";
  }

  if (normalized === "RFN") {
    return "Refundable";
  }

  if (normalized === "NRFN") {
    return "Non-refundable";
  }

  return normalized;
}

export function formatPrice(priceObject) {
  if (!priceObject || typeof priceObject !== "object") {
    return "";
  }

  const amount = Number(priceObject.amount);
  const currency = String(priceObject.currency || "").trim();

  if (!Number.isFinite(amount) || !currency) {
    return "";
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  } catch (error) {
    return `${currency} ${amount}`;
  }
}

export function formatReviewCount(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "";
  }
  return `${numericValue} reviews`;
}

export function formatGuestRating(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "";
  }
  return Number.isInteger(numericValue) ? String(numericValue) : numericValue.toFixed(1);
}

export function normalizeOccupancy(occupancy) {
  const adults = normalizePositiveInteger(occupancy?.adults, 2, 1);
  const children = normalizeNonNegativeInteger(occupancy?.children, 0);
  const rawChildAges = Array.isArray(occupancy?.childAges) ? occupancy.childAges : [];

  const childAges = rawChildAges
    .slice(0, children)
    .map((age) => Number(age))
    .filter((age) => Number.isFinite(age))
    .map((age) => String(Math.max(0, Math.min(17, Math.floor(age)))));

  while (childAges.length < children) {
    childAges.push("");
  }

  return {
    adults,
    children,
    childAges
  };
}

function normalizePositiveInteger(value, fallback, minValue) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(minValue, Math.floor(parsed));
}

function normalizeNonNegativeInteger(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.floor(parsed));
}
