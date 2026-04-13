import { fetch } from "wix-fetch";
import { getSecret } from "wix-secrets-backend";

const LITE_API_SECRET_NAME = "LITEAPI_KEY";
const LITE_BOOK_API_BASE_URL = "https://book.liteapi.travel/v3.0";

export async function getCatalogItems(options = {}) {
  console.log(
    "liteApiCatalog getCatalogItems called",
    JSON.stringify(options, null, 2)
  );

  const catalogReferences = Array.isArray(options?.catalogReferences)
    ? options.catalogReferences
    : [];

  const catalogItems = [];

  for (const item of catalogReferences) {
    const catalogReference = item?.catalogReference || item;
    const catalogItem = await resolveCatalogItem(catalogReference);

    if (catalogItem) {
      catalogItems.push(catalogItem);
    }
  }

  return { catalogItems };
}

async function resolveCatalogItem(rawCatalogReference) {
  try {
    const catalogReference =
      rawCatalogReference?.catalogReference || rawCatalogReference;

    console.log(
      "liteApiCatalog resolveCatalogItem input",
      JSON.stringify(catalogReference, null, 2)
    );

    const prebookId = extractPrebookId(catalogReference);

    if (!prebookId) {
      console.warn("liteApiCatalog missing prebookId in catalogReference");
      return null;
    }

    const livePrebook = await getPrebookById(prebookId);

    console.log(
      "liteApiCatalog livePrebook result",
      JSON.stringify(livePrebook, null, 2)
    );

    if (!livePrebook) {
      return null;
    }

    const catalogItem = buildCatalogItem(catalogReference, livePrebook);

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

function extractPrebookId(catalogReference) {
  const options = catalogReference?.options || {};

  const directPrebookId = String(options?.prebookId || "").trim();
  if (directPrebookId) {
    return directPrebookId;
  }

  const snapshotRoot = extractSnapshotRoot(options?.prebookSnapshot);
  const snapshotPrebookId = String(snapshotRoot?.prebookId || "").trim();

  return snapshotPrebookId;
}

async function getPrebookById(prebookId) {
  try {
    const response = await liteApiRequest(
      `${LITE_BOOK_API_BASE_URL}/prebooks/${encodeURIComponent(prebookId)}`,
      {
        method: "GET"
      }
    );

    const json = await parseJson(response);

    if (!response.ok) {
      console.warn(
        "liteApiCatalog getPrebookById non-ok response",
        JSON.stringify(
          {
            prebookId,
            status: response.status,
            body: json
          },
          null,
          2
        )
      );
      return null;
    }

    return extractSnapshotRoot(json);
  } catch (error) {
    console.error(
      "liteApiCatalog getPrebookById failed",
      error,
      JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
    );
    return null;
  }
}

function buildCatalogItem(catalogReference, livePrebook) {
  const shell = catalogReference?.options || {};
  const firstRoomType = Array.isArray(livePrebook?.roomTypes)
    ? livePrebook.roomTypes[0]
    : null;
  const firstRate = Array.isArray(firstRoomType?.rates)
    ? firstRoomType.rates[0]
    : null;

  const hotelName = String(shell?.hotelName || "").trim() || "Hotel";
  const rateName = String(firstRate?.name || "").trim();
  const productName = rateName ? `${hotelName} — ${rateName}` : hotelName;

  const media = String(
    shell?.hotelMainImage || shell?.roomMainImage || ""
  ).trim();

  const data = {
    productName: {
      original: productName
    },
    itemType: {
      preset: "PHYSICAL"
    },
    price: extractPriceValue(firstRate, livePrebook),
    descriptionLines: buildDescriptionLines(shell, livePrebook, firstRate),
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

function buildDescriptionLines(shell, livePrebook, firstRate) {
  const lines = [];

  pushDescriptionLine(lines, shell?.hotelStars);
  pushDescriptionLine(lines, shell?.hotelReview);
  pushDescriptionLine(lines, shell?.hotelAddress);

  const checkin = String(livePrebook?.checkin || "").trim();
  const checkout = String(livePrebook?.checkout || "").trim();

  if (checkin && checkout) {
    const nights = getNightCount(checkin, checkout);
    pushDescriptionLine(
      lines,
      `Dates: ${checkin} → ${checkout} • ${nights} night${nights === 1 ? "" : "s"}`
    );
  }

  const adultCount = Number(firstRate?.adultCount || 0);
  const childCount = Number(firstRate?.childCount || 0);

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

  const boardName = String(firstRate?.boardName || "").trim();
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
  const normalizedText = String(text || "").trim();
  if (!normalizedText) {
    return;
  }

  lines.push({
    plainText: {
      original: normalizedText
    }
  });
}

function extractPriceValue(firstRate, livePrebook) {
  const retailAmount = firstRate?.retailRate?.total?.[0]?.amount;
  if (Number.isFinite(Number(retailAmount))) {
    return toPriceString(retailAmount);
  }

  const fallbackAmount = livePrebook?.price;
  if (Number.isFinite(Number(fallbackAmount))) {
    return toPriceString(fallbackAmount);
  }

  return "0";
}

function toPriceString(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "0";
  }

  return String(Number(numericValue.toFixed(2)));
}

function formatRefundableTag(value) {
  const normalized = String(value || "").trim().toUpperCase();

  if (normalized === "RFN") {
    return "Refundable";
  }

  if (normalized === "NRFN") {
    return "Non-refundable";
  }

  return normalized;
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

async function liteApiRequest(url, options = {}) {
  const apiKey = await getSecret(LITE_API_SECRET_NAME);

  if (!apiKey) {
    throw new Error(
      `Missing secret "${LITE_API_SECRET_NAME}". Add your LiteAPI key to Wix Secrets Manager.`
    );
  }

  const headers = {
    "X-API-Key": apiKey,
    accept: "application/json"
  };

  const requestOptions = {
    method: options.method || "GET",
    headers
  };

  if (options.body) {
    requestOptions.headers["content-type"] = "application/json";
    requestOptions.body = JSON.stringify(options.body);
  }

  return fetch(url, requestOptions);
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}