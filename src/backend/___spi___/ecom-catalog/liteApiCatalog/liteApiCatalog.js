import { validatePrebook } from "../../../liteApiPrebook";

const RESERVATION_TYPE_KEY = "reservationType";
const RESERVATION_TYPE_LABEL = "Reservation Type";
const FLEXIBLE_RESERVATION_TYPE_VALUE = "flexible";
const FLEXIBLE_RESERVATION_TYPE_DISPLAY = "Flexible";
const STANDARD_RESERVATION_TYPE_DISPLAY = "Standart";
const CHECK_IN_DATE_LABEL = "Check In Date";
const CHECK_OUT_DATE_LABEL = "Check Out Date";

export async function getCatalogItems(options = {}, context = {}) {
  const request = normalizeCatalogRequest(options, context);
  const catalogReferences = Array.isArray(request?.catalogReferences)
    ? request.catalogReferences
    : [];

  const requestId = normalizeText(
    request?.requestId || request?.__context?.requestId
  );

  const requestLanguages = Array.isArray(
    request?.languages || request?.__context?.languages
  )
    ? request.languages || request.__context.languages
    : [];

  console.log("liteApiCatalog getCatalogItems start", {
    requestId,
    currency: normalizeText(
      request?.currency || request?.__context?.currency
    ).toUpperCase(),
    languagesCount: requestLanguages.length,
    catalogReferencesCount: catalogReferences.length
  });

  console.log("liteApiCatalog catalogReferences resolved", {
    requestId,
    catalogReferencesCount: catalogReferences.length
  });

  const catalogItems = [];
  const prebookValidationCache = new Map();

  for (const item of catalogReferences) {
    const catalogReference = item?.catalogReference || item;
    const catalogItem = await resolveCatalogItem(
      catalogReference,
      request,
      prebookValidationCache
    );

    if (catalogItem) {
      catalogItems.push(catalogItem);
    }
  }

  console.log("liteApiCatalog getCatalogItems completed", {
    requestId,
    requestedCount: catalogReferences.length,
    returnedCount: catalogItems.length,
    returnedCatalogItemIds: catalogItems.map((item) =>
      normalizeText(item?.catalogReference?.catalogItemId)
    )
  });

  return { catalogItems };
}

function normalizeCatalogRequest(options, context) {
  const request =
    options && typeof options === "object" ? { ...options } : {};

  if (context && typeof context === "object") {
    request.__context = context;

    if (!request.currency && context.currency) {
      request.currency = context.currency;
    }

    if (!request.requestId && context.requestId) {
      request.requestId = context.requestId;
    }

    if (!request.languages && context.languages) {
      request.languages = context.languages;
    }
  }

  return request;
}

async function resolveCatalogItem(rawCatalogReference, request, prebookValidationCache) {
  const catalogReference =
    rawCatalogReference?.catalogReference || rawCatalogReference;

  const catalogItemId = normalizeText(catalogReference?.catalogItemId);
  const requestId = normalizeText(
    request?.requestId || request?.__context?.requestId
  );

  try {
    console.log("liteApiCatalog resolveCatalogItem start", {
      requestId,
      catalogItemId,
      hasCatalogReference: Boolean(
        catalogReference && typeof catalogReference === "object"
      ),
      hasOptions: Boolean(
        catalogReference?.options &&
          typeof catalogReference.options === "object" &&
          !Array.isArray(catalogReference.options)
      )
    });

    if (!catalogReference || typeof catalogReference !== "object") {
      console.warn("liteApiCatalog missing catalogReference", {
        requestId,
        catalogItemId
      });
      return null;
    }

    const prebookShell = getPrebookShell(catalogReference);
    const prebookId = normalizeText(prebookShell?.prebookId);

    console.log("liteApiCatalog prebookShell extracted", {
      requestId,
      catalogItemId,
      hasPrebookId: Boolean(prebookId),
      hasPrebookSnapshot: Boolean(normalizeText(prebookShell?.prebookSnapshot)),
      hasCurrentPrice: Number.isFinite(Number(prebookShell?.currentPrice)),
      hasMedia: Boolean(
        normalizeText(prebookShell?.wixHotelMainImageRef) ||
          normalizeText(prebookShell?.wixRoomMainImageRef)
      ),
      hasReservationType: Boolean(normalizeText(prebookShell?.[RESERVATION_TYPE_KEY]))
    });

    if (!prebookId) {
      console.warn("liteApiCatalog missing prebookId in prebookShell", {
        requestId,
        catalogItemId,
        hasPrebookShell: Boolean(prebookShell && typeof prebookShell === "object"),
        hasPrebookSnapshot: Boolean(normalizeText(prebookShell?.prebookSnapshot))
      });
      return null;
    }

    const isPrebookValid = await validatePrebookWithRetry(
      prebookId,
      prebookValidationCache,
      {
        requestId,
        catalogItemId
      }
    );

    console.log("liteApiCatalog prebook validation result", {
      requestId,
      catalogItemId,
      hasPrebookId: Boolean(prebookId),
      isPrebookValid
    });

    if (!isPrebookValid) {
      console.warn("liteApiCatalog prebook validation failed; excluding cart item", {
        requestId,
        catalogItemId,
        hasPrebookId: Boolean(prebookId)
      });
      return null;
    }

    const catalogItem = buildCatalogItem(catalogReference, prebookShell);

    console.log("liteApiCatalog catalogItem built", {
      requestId,
      catalogItemId,
      hasProductName: Boolean(
        normalizeText(catalogItem?.data?.productName?.original)
      ),
      hasPrice: Boolean(normalizeText(catalogItem?.data?.price)),
      hasMedia: Boolean(normalizeText(catalogItem?.data?.media)),
      descriptionLineCount: Array.isArray(catalogItem?.data?.descriptionLines)
        ? catalogItem.data.descriptionLines.length
        : 0
    });

    return catalogItem;
  } catch (error) {
    console.error("liteApiCatalog resolveCatalogItem failed", {
      requestId,
      catalogItemId,
      name: error?.name,
      message: error?.message,
      stack: error?.stack
    });
    return null;
  }
}

function buildCatalogItem(catalogReference, prebookShell) {
  const hotelName = normalizeText(prebookShell?.hotelName) || "Hotel";
  const rateName = normalizeText(prebookShell?.rateName);
  const productName = rateName ? `${hotelName} — ${rateName}` : hotelName;

  const media = normalizeText(
    prebookShell?.wixHotelMainImageRef || prebookShell?.wixRoomMainImageRef
  );

  const price = extractPriceValue(prebookShell);
  const descriptionLines = buildDescriptionLines(prebookShell);

  console.log("liteApiCatalog buildCatalogItem summary", {
    hasProductName: Boolean(productName),
    hasMedia: Boolean(media),
    hasPrice: Boolean(price),
    descriptionLineCount: descriptionLines.length
  });

  const data = {
    productName: {
      original: productName
    },
    itemType: {
      preset: "PHYSICAL"
    },
    price,
    descriptionLines,
    physicalProperties: {
      shippable: false
    },
    quantityAvailable: 1
  };

  if (media) {
    data.media = media;
  }

  return {
    catalogReference,
    data
  };
}

function getPrebookShell(catalogReference) {
  const rawOptions = catalogReference?.options || {};

  return rawOptions && typeof rawOptions === "object" && !Array.isArray(rawOptions)
    ? rawOptions
    : {};
}

function extractPriceValue(prebookShell) {
  const currentPrice = Number(prebookShell?.currentPrice);

  if (Number.isFinite(currentPrice)) {
    return toPriceString(currentPrice);
  }

  throw new Error("prebookShell.currentPrice is required.");
}

function buildDescriptionLines(prebookShell) {
  const lines = [];

  pushDescriptionLine(lines, prebookShell?.starRating);
  pushDescriptionLine(lines, prebookShell?.hotelReview);
  pushDescriptionLine(lines, prebookShell?.hotelAddress);

  const isFlexibleReservation = isFlexibleReservationType(
    prebookShell?.[RESERVATION_TYPE_KEY]
  );

  pushNamedDescriptionLineAllowEmptyText(
    lines,
    RESERVATION_TYPE_LABEL,
    isFlexibleReservation
      ? FLEXIBLE_RESERVATION_TYPE_DISPLAY
      : STANDARD_RESERVATION_TYPE_DISPLAY
  );

  pushNamedDescriptionLineAllowEmptyText(
    lines,
    CHECK_IN_DATE_LABEL,
    isFlexibleReservation ? "" : normalizeText(prebookShell?.checkInDate)
  );

  pushNamedDescriptionLineAllowEmptyText(
    lines,
    CHECK_OUT_DATE_LABEL,
    isFlexibleReservation ? "" : normalizeText(prebookShell?.checkOutDate)
  );

  const adultCount = normalizeCount(prebookShell?.adultCount);
  const childCount = normalizeCount(prebookShell?.childCount);

  if (adultCount > 0 || childCount > 0) {
    const guestParts = [];

    if (adultCount > 0) {
      guestParts.push(`${adultCount} Adult${adultCount === 1 ? "" : "s"}`);
    }

    if (childCount > 0) {
      guestParts.push(`${childCount} Child${childCount === 1 ? "" : "ren"}`);
    }

    pushDescriptionLine(lines, `Guests: ${guestParts.join(", ")}`);
  }

  const boardName = normalizeText(prebookShell?.boardName);
  if (boardName) {
    pushDescriptionLine(lines, `Board: ${boardName}`);
  }

  const refundableText = formatRefundableTag(prebookShell?.refundableTag);

  if (refundableText) {
    pushDescriptionLine(lines, `Refundability: ${refundableText}`);
  }

  return lines;
}

function isFlexibleReservationType(value) {
  return (
    normalizeText(value).toLowerCase() === FLEXIBLE_RESERVATION_TYPE_VALUE
  );
}

function pushDescriptionLine(lines, text) {
  const normalizedText = normalizeText(text);

  if (!normalizedText) {
    return;
  }

  lines.push({
    plainText: {
      original: normalizedText
    }
  });
}

function pushNamedDescriptionLineAllowEmptyText(lines, name, text) {
  const normalizedName = normalizeText(name);

  if (!normalizedName) {
    return;
  }

  lines.push({
    name: {
      original: normalizedName
    },
    plainText: {
      original: text === null || text === undefined ? "" : String(text)
    }
  });
}

function toPriceString(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "0";
  }

  return numericValue.toFixed(2);
}

function formatRefundableTag(value) {
  const normalized = normalizeText(value).toUpperCase();

  if (normalized === "RFN") {
    return "Refundable";
  }

  if (normalized === "NRFN") {
    return "Non-refundable";
  }

  return normalized;
}

async function validatePrebookWithRetry(prebookId, cache, meta = {}) {
  const normalizedPrebookId = normalizeText(prebookId);
  if (!normalizedPrebookId) {
    console.warn("liteApiCatalog validatePrebookWithRetry missing prebookId", {
      requestId: meta?.requestId,
      catalogItemId: meta?.catalogItemId,
      hasPrebookId: false
    });
    return false;
  }

  if (cache.has(normalizedPrebookId)) {
    console.log("liteApiCatalog prebook validation cache hit", {
      requestId: meta?.requestId,
      catalogItemId: meta?.catalogItemId,
      hasPrebookId: true
    });
    return cache.get(normalizedPrebookId);
  }

  const validationPromise = (async () => {
    console.log("liteApiCatalog prebook validation attempt 1 start", {
      requestId: meta?.requestId,
      catalogItemId: meta?.catalogItemId,
      hasPrebookId: true
    });

    try {
      const isValid = await validatePrebook(normalizedPrebookId);

      console.log("liteApiCatalog prebook validation attempt 1 result", {
        requestId: meta?.requestId,
        catalogItemId: meta?.catalogItemId,
        hasPrebookId: true,
        isValid
      });

      if (!isValid) {
        return false;
      }

      return true;
    } catch (error) {
      const transient = isTransientPrebookError(error);

      console.warn("liteApiCatalog prebook validation attempt 1 failed", {
        requestId: meta?.requestId,
        catalogItemId: meta?.catalogItemId,
        hasPrebookId: true,
        transient,
        name: error?.name,
        message: error?.message,
        stack: error?.stack
      });

      if (!transient) {
        return false;
      }

      await sleep(400);

      console.log("liteApiCatalog prebook validation attempt 2 start", {
        requestId: meta?.requestId,
        catalogItemId: meta?.catalogItemId,
        hasPrebookId: true
      });

      try {
        const retryIsValid = await validatePrebook(normalizedPrebookId);

        console.log("liteApiCatalog prebook validation attempt 2 result", {
          requestId: meta?.requestId,
          catalogItemId: meta?.catalogItemId,
          hasPrebookId: true,
          isValid: retryIsValid
        });

        return retryIsValid;
      } catch (retryError) {
        console.warn("liteApiCatalog prebook validation attempt 2 failed", {
          requestId: meta?.requestId,
          catalogItemId: meta?.catalogItemId,
          hasPrebookId: true,
          name: retryError?.name,
          message: retryError?.message,
          stack: retryError?.stack
        });
        return false;
      }
    }
  })();

  cache.set(normalizedPrebookId, validationPromise);
  return validationPromise;
}

function isTransientPrebookError(error) {
  const statusCode = Number(error?.statusCode || 0);

  if (!Number.isFinite(statusCode) || statusCode <= 0) {
    return true;
  }

  return statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeCount(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.floor(parsed));
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
