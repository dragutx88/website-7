import { validatePrebook } from "../../../liteApiBooking";

const RESERVATION_TYPE_KEY = "reservationType";
const RESERVATION_TYPE_LABEL = "Reservation Type";
const FLEXIBLE_RESERVATION_TYPE_VALUE = "flexible";
const FLEXIBLE_RESERVATION_TYPE_DISPLAY = "Flexible";
const STANDARD_RESERVATION_TYPE_DISPLAY = "Standart";
const CHECK_IN_DATE_LABEL = "Check In Date";
const CHECK_OUT_DATE_LABEL = "Check Out Date";

export async function getCatalogItems(options = {}, context = {}) {
  const request = normalizeCatalogRequest(options, context);

  logInfo("liteApiCatalog getCatalogItems called", {
    requestSummary: buildRequestSummary(request),
    rawOptions: options,
    rawContext: context
  });

  const catalogReferences = Array.isArray(request?.catalogReferences)
    ? request.catalogReferences
    : [];

  logInfo("liteApiCatalog catalogReferences resolved", {
    count: catalogReferences.length,
    catalogItemIds: catalogReferences.map((item) =>
      String((item?.catalogReference || item)?.catalogItemId || "")
    )
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

  logInfo("liteApiCatalog getCatalogItems completed", {
    requestedCount: catalogReferences.length,
    returnedCount: catalogItems.length,
    returnedCatalogItemIds: catalogItems.map((item) =>
      String(item?.catalogReference?.catalogItemId || "")
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

  const catalogItemId = String(catalogReference?.catalogItemId || "");
  const requestId = String(request?.requestId || request?.__context?.requestId || "");

  try {
    logInfo("liteApiCatalog resolveCatalogItem start", {
      requestId,
      catalogItemId,
      catalogReference
    });

    if (!catalogReference || typeof catalogReference !== "object") {
      logWarn("liteApiCatalog missing catalogReference", {
        requestId,
        catalogItemId
      });
      return null;
    }

    const prebookShell = getPrebookShell(catalogReference);

    logInfo("liteApiCatalog shell extracted", {
      requestId,
      catalogItemId,
      shellSummary: buildShellSummary(prebookShell)
    });

    const prebookId = normalizeText(prebookShell?.prebookId);

    if (!prebookId) {
      logWarn("liteApiCatalog missing prebookId in prebookShell", {
        requestId,
        catalogItemId,
        shellSummary: buildShellSummary(prebookShell)
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

    logInfo("liteApiCatalog prebook validation result", {
      requestId,
      catalogItemId,
      prebookId,
      isPrebookValid
    });

    if (!isPrebookValid) {
      logWarn("liteApiCatalog prebook validation failed; excluding cart item", {
        requestId,
        catalogItemId,
        prebookId
      });
      return null;
    }

    const catalogItem = buildCatalogItem(catalogReference, prebookShell);

    logInfo("liteApiCatalog built catalogItem", {
      requestId,
      catalogItemId,
      prebookId,
      builtSummary: buildBuiltCatalogItemSummary(catalogItem),
      catalogItem
    });

    return catalogItem;
  } catch (error) {
    logError("liteApiCatalog resolveCatalogItem failed", {
      requestId,
      catalogItemId,
      error,
      catalogReference
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

  logInfo("liteApiCatalog buildCatalogItem inputs", {
    productName,
    hotelName,
    rateName,
    selectedMedia: media,
    selectedMediaSource: normalizeText(prebookShell?.wixHotelMainImageRef)
      ? "wixHotelMainImageRef"
      : normalizeText(prebookShell?.wixRoomMainImageRef)
      ? "wixRoomMainImageRef"
      : "",
    price,
    descriptionLineCount: descriptionLines.length,
    descriptionLinesPreview: descriptionLines.map((line) => ({
      name: line?.name?.original || "",
      plainText: line?.plainText?.original || ""
    }))
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
    const value = toPriceString(currentPrice);
    logInfo("liteApiCatalog price source selected", {
      source: "prebookShell.currentPrice",
      rawValue: currentPrice,
      normalizedValue: value
    });
    return value;
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

  logInfo("liteApiCatalog descriptionLines built", {
    count: lines.length,
    lines: lines.map((line) => ({
      name: line?.name?.original || "",
      plainText: line?.plainText?.original || ""
    }))
  });

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
    logWarn("liteApiCatalog validatePrebookWithRetry missing prebookId", meta);
    return false;
  }

  if (cache.has(normalizedPrebookId)) {
    logInfo("liteApiCatalog prebook validation cache hit", {
      ...meta,
      prebookId: normalizedPrebookId
    });
    return cache.get(normalizedPrebookId);
  }

  const validationPromise = (async () => {
    logInfo("liteApiCatalog prebook validation attempt 1 start", {
      ...meta,
      prebookId: normalizedPrebookId
    });

    try {
      const isValid = await validatePrebook(normalizedPrebookId);

      logInfo("liteApiCatalog prebook validation attempt 1 result", {
        ...meta,
        prebookId: normalizedPrebookId,
        isValid
      });

      if (!isValid) {
        return false;
      }

      return true;
    } catch (error) {
      const transient = isTransientPrebookError(error);

      logWarn("liteApiCatalog prebook validation attempt 1 failed", {
        ...meta,
        prebookId: normalizedPrebookId,
        transient,
        error
      });

      if (!transient) {
        return false;
      }

      await sleep(400);

      logInfo("liteApiCatalog prebook validation attempt 2 start", {
        ...meta,
        prebookId: normalizedPrebookId
      });

      try {
        const retryIsValid = await validatePrebook(normalizedPrebookId);

        logInfo("liteApiCatalog prebook validation attempt 2 result", {
          ...meta,
          prebookId: normalizedPrebookId,
          isValid: retryIsValid
        });

        return retryIsValid;
      } catch (retryError) {
        logWarn("liteApiCatalog prebook validation attempt 2 failed", {
          ...meta,
          prebookId: normalizedPrebookId,
          error: retryError
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
  return String(value || "").trim();
}

function normalizeCurrencyCode(value) {
  return normalizeText(value).toUpperCase();
}

function buildRequestSummary(request) {
  return {
    requestId: String(request?.requestId || request?.__context?.requestId || ""),
    currency: normalizeCurrencyCode(request?.currency || request?.__context?.currency),
    languages: Array.isArray(request?.languages || request?.__context?.languages)
      ? request.languages || request.__context.languages
      : [],
    catalogReferencesCount: Array.isArray(request?.catalogReferences)
      ? request.catalogReferences.length
      : 0
  };
}

function buildShellSummary(prebookShell) {
  return {
    mappedRoomId: normalizeText(prebookShell?.mappedRoomId),
    prebookId: normalizeText(prebookShell?.prebookId),
    hotelName: normalizeText(prebookShell?.hotelName),
    starRating: normalizeText(prebookShell?.starRating),
    hotelReview: normalizeText(prebookShell?.hotelReview),
    hotelAddress: normalizeText(prebookShell?.hotelAddress),
    checkInDate: normalizeText(prebookShell?.checkInDate),
    checkOutDate: normalizeText(prebookShell?.checkOutDate),
    rateName: normalizeText(prebookShell?.rateName),
    boardName: normalizeText(prebookShell?.boardName),
    adultCount: normalizeCount(prebookShell?.adultCount),
    childCount: normalizeCount(prebookShell?.childCount),
    occupancyNumber: normalizeCount(prebookShell?.occupancyNumber),
    refundableTag: normalizeText(prebookShell?.refundableTag),
    currency: normalizeCurrencyCode(prebookShell?.currency),
    currentPrice: Number(prebookShell?.currentPrice),
    beforeCurrentPrice: Number(prebookShell?.beforeCurrentPrice),
    reservationType: normalizeText(prebookShell?.[RESERVATION_TYPE_KEY]),
    hotelMainImage: normalizeText(prebookShell?.hotelMainImage),
    roomMainImage: normalizeText(prebookShell?.roomMainImage),
    wixHotelMainImageRef: normalizeText(prebookShell?.wixHotelMainImageRef),
    wixRoomMainImageRef: normalizeText(prebookShell?.wixRoomMainImageRef),
    hasPrebookSnapshot: Boolean(normalizeText(prebookShell?.prebookSnapshot))
  };
}

function buildBuiltCatalogItemSummary(catalogItem) {
  return {
    catalogItemId: String(catalogItem?.catalogReference?.catalogItemId || ""),
    productName: normalizeText(catalogItem?.data?.productName?.original),
    price: normalizeText(catalogItem?.data?.price),
    descriptionLineCount: Array.isArray(catalogItem?.data?.descriptionLines)
      ? catalogItem.data.descriptionLines.length
      : 0,
    media: normalizeText(catalogItem?.data?.media)
  };
}

function safeJson(value) {
  try {
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

        return currentValue;
      },
      2
    );
  } catch (error) {
    return `[unserializable: ${String(error?.message || error)}]`;
  }
}

function logInfo(message, payload) {
  console.log(message, safeJson(payload));
}

function logWarn(message, payload) {
  console.warn(message, safeJson(payload));
}

function logError(message, payload) {
  console.error(message, safeJson(payload));
}
