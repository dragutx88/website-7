import { getPrebookByIdHandler } from "../../../liteApiBooking";

const RESERVATION_DATE_TYPE_KEY = "reservationDateType";
const RESERVATION_DATE_TYPE_LABEL = "Reservation Date Type";
const FLEXIBLE_RESERVATION_DATE_TYPE_VALUE = "flexible";
const FLEXIBLE_RESERVATION_DATE_TYPE_DISPLAY = "Flexible";
const STANDARD_RESERVATION_DATE_TYPE_DISPLAY = "Standart";
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

    const shell = getShellOptions(catalogReference);
    const snapshotRoot = extractSnapshotRoot(shell?.prebookSnapshot);

    logInfo("liteApiCatalog shell extracted", {
      requestId,
      catalogItemId,
      shellSummary: buildShellSummary(shell),
      hasSnapshotRoot: Boolean(snapshotRoot)
    });

    if (!snapshotRoot) {
      logWarn("liteApiCatalog missing prebookSnapshot in catalogReference", {
        requestId,
        catalogItemId,
        shellSummary: buildShellSummary(shell)
      });
      return null;
    }

    const prebookId = extractPrebookId(shell, snapshotRoot);

    logInfo("liteApiCatalog prebook resolution", {
      requestId,
      catalogItemId,
      prebookId,
      snapshotSummary: buildSnapshotSummary(snapshotRoot)
    });

    if (!prebookId) {
      logWarn("liteApiCatalog missing prebookId in catalogReference options/snapshot", {
        requestId,
        catalogItemId,
        shellSummary: buildShellSummary(shell),
        snapshotSummary: buildSnapshotSummary(snapshotRoot)
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

    const firstRate = getFirstRate(snapshotRoot);

    logInfo("liteApiCatalog firstRate extracted", {
      requestId,
      catalogItemId,
      prebookId,
      firstRateSummary: buildFirstRateSummary(firstRate)
    });

    const sourceCurrency = extractSourceCurrency(firstRate, snapshotRoot);
    const requestCurrency = normalizeCurrencyCode(
      request?.currency || request?.__context?.currency
    );

    logInfo("liteApiCatalog currency comparison", {
      requestId,
      catalogItemId,
      prebookId,
      sourceCurrency,
      requestCurrency
    });

    if (sourceCurrency && requestCurrency && sourceCurrency !== requestCurrency) {
      logWarn("liteApiCatalog currency mismatch (price phase 1: no conversion)", {
        requestId,
        catalogItemId,
        prebookId,
        requestCurrency,
        sourceCurrency
      });
    }

    const catalogItem = buildCatalogItem(catalogReference, shell, snapshotRoot, firstRate);

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

function buildCatalogItem(catalogReference, shell, snapshotRoot, firstRate) {
  const hotelName = normalizeText(shell?.hotelName) || "Hotel";
  const rateName = normalizeText(firstRate?.name);
  const productName = rateName ? `${hotelName} — ${rateName}` : hotelName;

  const media = normalizeText(
    shell?.wixHotelMainImageRef || shell?.wixRoomMainImageRef
  );

  const price = extractPriceValue(firstRate, snapshotRoot);
  const descriptionLines = buildDescriptionLines(shell, snapshotRoot, firstRate);

  logInfo("liteApiCatalog buildCatalogItem inputs", {
    productName,
    hotelName,
    rateName,
    selectedMedia: media,
    selectedMediaSource: normalizeText(shell?.wixHotelMainImageRef)
      ? "wixHotelMainImageRef"
      : normalizeText(shell?.wixRoomMainImageRef)
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

function getShellOptions(catalogReference) {
  const rawOptions = catalogReference?.options || {};

  if (rawOptions.options && typeof rawOptions.options === "object") {
    return rawOptions.options;
  }

  return rawOptions;
}

function extractSnapshotRoot(value) {
  if (value?.data && typeof value.data === "object" && value.data) {
    return value.data;
  }

  if (value && typeof value === "object") {
    return value;
  }

  return null;
}

function extractPrebookId(shell, snapshotRoot) {
  return normalizeText(shell?.prebookId || snapshotRoot?.prebookId);
}

function getFirstRate(snapshotRoot) {
  const firstRoomType = Array.isArray(snapshotRoot?.roomTypes)
    ? snapshotRoot.roomTypes[0]
    : null;

  const firstRate = Array.isArray(firstRoomType?.rates)
    ? firstRoomType.rates[0]
    : null;

  if (!firstRate || typeof firstRate !== "object") {
    throw new Error(
      "prebookSnapshot.data.roomTypes[0].rates[0] is required."
    );
  }

  return firstRate;
}

function extractSourceCurrency(firstRate, snapshotRoot) {
  const retailCurrency = normalizeCurrencyCode(
    firstRate?.retailRate?.total?.[0]?.currency
  );

  if (retailCurrency) {
    return retailCurrency;
  }

  return normalizeCurrencyCode(snapshotRoot?.currency);
}

function extractPriceValue(firstRate, snapshotRoot) {
  const retailAmount = firstRate?.retailRate?.total?.[0]?.amount;

  if (Number.isFinite(Number(retailAmount))) {
    const value = toPriceString(retailAmount);
    logInfo("liteApiCatalog price source selected", {
      source: "firstRate.retailRate.total[0].amount",
      rawValue: retailAmount,
      normalizedValue: value
    });
    return value;
  }

  const fallbackAmount = snapshotRoot?.price;

  if (Number.isFinite(Number(fallbackAmount))) {
    const value = toPriceString(fallbackAmount);
    logWarn("liteApiCatalog price source fell back to snapshotRoot.price", {
      source: "snapshotRoot.price",
      rawValue: fallbackAmount,
      normalizedValue: value
    });
    return value;
  }

  logWarn("liteApiCatalog price source missing; defaulting to 0", {
    firstRateSummary: buildFirstRateSummary(firstRate),
    snapshotSummary: buildSnapshotSummary(snapshotRoot)
  });

  return "0";
}

function buildDescriptionLines(shell, snapshotRoot, firstRate) {
  const lines = [];

  pushDescriptionLine(lines, shell?.hotelStars);
  pushDescriptionLine(lines, shell?.hotelReview);
  pushDescriptionLine(lines, shell?.hotelAddress);

  const isFlexibleReservation = isFlexibleReservationDateType(
    shell?.[RESERVATION_DATE_TYPE_KEY]
  );

  pushNamedDescriptionLineAllowEmptyText(
    lines,
    RESERVATION_DATE_TYPE_LABEL,
    isFlexibleReservation
      ? FLEXIBLE_RESERVATION_DATE_TYPE_DISPLAY
      : STANDARD_RESERVATION_DATE_TYPE_DISPLAY
  );

  pushNamedDescriptionLineAllowEmptyText(
    lines,
    CHECK_IN_DATE_LABEL,
    isFlexibleReservation ? "" : normalizeText(snapshotRoot?.checkin)
  );

  pushNamedDescriptionLineAllowEmptyText(
    lines,
    CHECK_OUT_DATE_LABEL,
    isFlexibleReservation ? "" : normalizeText(snapshotRoot?.checkout)
  );

  const adultCount = normalizeCount(firstRate?.adultCount);
  const childCount = normalizeCount(firstRate?.childCount);

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

  const boardName = normalizeText(firstRate?.boardName);
  if (boardName) {
    pushDescriptionLine(lines, `Board: ${boardName}`);
  }

  const refundableText = formatRefundableTag(
    firstRate?.cancellationPolicies?.refundableTag
  );

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

function isFlexibleReservationDateType(value) {
  return (
    normalizeText(value).toLowerCase() === FLEXIBLE_RESERVATION_DATE_TYPE_VALUE
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
      const response = await getPrebookByIdHandler({ prebookId: normalizedPrebookId });

      logInfo("liteApiCatalog prebook validation attempt 1 success", {
        ...meta,
        prebookId: normalizedPrebookId,
        responseSummary: buildPrebookValidationResponseSummary(response)
      });

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
        const retryResponse = await getPrebookByIdHandler({
          prebookId: normalizedPrebookId
        });

        logInfo("liteApiCatalog prebook validation attempt 2 success", {
          ...meta,
          prebookId: normalizedPrebookId,
          responseSummary: buildPrebookValidationResponseSummary(retryResponse)
        });

        return true;
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

function buildShellSummary(shell) {
  return {
    hotelName: normalizeText(shell?.hotelName),
    hotelStars: normalizeText(shell?.hotelStars),
    hotelReview: normalizeText(shell?.hotelReview),
    hotelAddress: normalizeText(shell?.hotelAddress),
    prebookId: normalizeText(shell?.prebookId),
    reservationDateType: normalizeText(shell?.[RESERVATION_DATE_TYPE_KEY]),
    hotelMainImage: normalizeText(shell?.hotelMainImage),
    roomMainImage: normalizeText(shell?.roomMainImage),
    wixHotelMainImageRef: normalizeText(shell?.wixHotelMainImageRef),
    wixRoomMainImageRef: normalizeText(shell?.wixRoomMainImageRef)
  };
}

function buildSnapshotSummary(snapshotRoot) {
  return {
    prebookId: normalizeText(snapshotRoot?.prebookId),
    hotelId: normalizeText(snapshotRoot?.hotelId),
    checkin: normalizeText(snapshotRoot?.checkin),
    checkout: normalizeText(snapshotRoot?.checkout),
    currency: normalizeCurrencyCode(snapshotRoot?.currency),
    price: snapshotRoot?.price ?? null,
    roomTypesCount: Array.isArray(snapshotRoot?.roomTypes)
      ? snapshotRoot.roomTypes.length
      : 0
  };
}

function buildFirstRateSummary(firstRate) {
  return {
    name: normalizeText(firstRate?.name),
    mappedRoomId: String(firstRate?.mappedRoomId || ""),
    boardName: normalizeText(firstRate?.boardName),
    refundableTag: normalizeText(firstRate?.cancellationPolicies?.refundableTag),
    adultCount: normalizeCount(firstRate?.adultCount),
    childCount: normalizeCount(firstRate?.childCount),
    retailAmount: firstRate?.retailRate?.total?.[0]?.amount ?? null,
    retailCurrency: normalizeCurrencyCode(
      firstRate?.retailRate?.total?.[0]?.currency
    )
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

function buildPrebookValidationResponseSummary(response) {
  return {
    hasRaw: Boolean(response?.raw),
    hasNormalizedPrebook: Boolean(response?.normalizedPrebook),
    rawPrebookId: normalizeText(response?.raw?.data?.prebookId),
    normalizedPrebookId: normalizeText(response?.normalizedPrebook?.prebookId),
    rawHotelId: normalizeText(response?.raw?.data?.hotelId),
    rawOfferId: normalizeText(response?.raw?.data?.offerId)
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