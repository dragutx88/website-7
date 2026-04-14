export async function getCatalogItems(options = {}, context = {}) {
  const request = normalizeCatalogRequest(options, context);

  console.log(
    "liteApiCatalog getCatalogItems called",
    JSON.stringify(request, null, 2)
  );

  const catalogReferences = Array.isArray(request?.catalogReferences)
    ? request.catalogReferences
    : [];

  const catalogItems = [];

  for (const item of catalogReferences) {
    const catalogReference = item?.catalogReference || item;
    const catalogItem = resolveCatalogItem(catalogReference, request);

    if (catalogItem) {
      catalogItems.push(catalogItem);
    }
  }

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

function resolveCatalogItem(rawCatalogReference, request) {
  try {
    const catalogReference =
      rawCatalogReference?.catalogReference || rawCatalogReference;

    console.log(
      "liteApiCatalog resolveCatalogItem input",
      JSON.stringify(catalogReference, null, 2)
    );

    if (!catalogReference || typeof catalogReference !== "object") {
      console.warn("liteApiCatalog missing catalogReference");
      return null;
    }

    const shell = getShellOptions(catalogReference);
    const snapshotRoot = extractSnapshotRoot(shell?.prebookSnapshot);

    if (!snapshotRoot) {
      console.warn("liteApiCatalog missing prebookSnapshot in catalogReference");
      return null;
    }

    const firstRate = getFirstRate(snapshotRoot);
    const sourceCurrency = extractSourceCurrency(firstRate, snapshotRoot);
    const requestCurrency = normalizeCurrencyCode(
      request?.currency || request?.__context?.currency
    );

    if (sourceCurrency && requestCurrency && sourceCurrency !== requestCurrency) {
      console.warn(
        "liteApiCatalog currency mismatch (price phase 1: no conversion)",
        JSON.stringify(
          {
            requestCurrency,
            sourceCurrency,
            catalogItemId: String(catalogReference?.catalogItemId || ""),
            requestId: request?.requestId || null
          },
          null,
          2
        )
      );
    }

    const catalogItem = buildCatalogItem(catalogReference, shell, snapshotRoot, firstRate);

    console.log(
      "liteApiCatalog built catalogItem",
      JSON.stringify(catalogItem, null, 2)
    );

    return catalogItem;
  } catch (error) {
    console.error(
      "liteApiCatalog resolveCatalogItem failed",
      error,
      JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
    );
    return null;
  }
}

function buildCatalogItem(catalogReference, shell, snapshotRoot, firstRate) {
  const hotelName = normalizeText(shell?.hotelName) || "Hotel";
  const rateName = normalizeText(firstRate?.name);
  const productName = rateName ? `${hotelName} — ${rateName}` : hotelName;

  const media = normalizeText(shell?.hotelMainImage || shell?.roomMainImage);

  const data = {
    productName: {
      original: productName
    },
    itemType: {
      preset: "PHYSICAL"
    },
    price: extractPriceValue(firstRate, snapshotRoot),
    descriptionLines: buildDescriptionLines(shell, snapshotRoot, firstRate),
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
    return toPriceString(retailAmount);
  }

  const fallbackAmount = snapshotRoot?.price;

  if (Number.isFinite(Number(fallbackAmount))) {
    return toPriceString(fallbackAmount);
  }

  return "0";
}

function buildDescriptionLines(shell, snapshotRoot, firstRate) {
  const lines = [];

  pushDescriptionLine(lines, shell?.hotelStars);
  pushDescriptionLine(lines, shell?.hotelReview);
  pushDescriptionLine(lines, shell?.hotelAddress);

  const checkin = normalizeText(snapshotRoot?.checkin);
  const checkout = normalizeText(snapshotRoot?.checkout);

  if (checkin && checkout) {
    const nights = getNightCount(checkin, checkout);
    pushDescriptionLine(
      lines,
      `Dates: ${checkin} → ${checkout} • ${nights} night${nights === 1 ? "" : "s"}`
    );
  }

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

  return lines;
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

function getNightCount(checkin, checkout) {
  const checkinDate = new Date(checkin);
  const checkoutDate = new Date(checkout);

  if (
    Number.isNaN(checkinDate.getTime()) ||
    Number.isNaN(checkoutDate.getTime())
  ) {
    return 1;
  }

  const diffMs = checkoutDate.getTime() - checkinDate.getTime();
  const nights = Math.round(diffMs / (1000 * 60 * 60 * 24));

  return nights > 0 ? nights : 1;
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