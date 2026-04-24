import wixLocationFrontend from "wix-location-frontend";
import { session } from "wix-storage-frontend";
import { getHotelsRates } from "backend/liteApi.web";
import {
  safeCollapseAndHide,
  safeExpand,
  safeGetItemElement,
  safeGetPageElement,
  safeShow
} from "public/liteApiHelpers";

const RETURN_SEARCH_FLOW_CONTEXT_URL_STORAGE_KEY = "returnSearchFlowContextUrl";
const MAX_RESULTS_TOTAL = 30;
const INITIAL_RESULTS_COUNT = 10;
const LOAD_MORE_STEP = 10;
const FALLBACK_IMAGE_URL =
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80";

let allHotelOfferResults = [];
let renderedCount = 0;
let currentSearchFlowContextQuery = {};
let currentSearchFlowContextUrl = "";

$w.onReady(async function () {
  await initializeHotelsPage();
});

async function initializeHotelsPage() {
  currentSearchFlowContextQuery = wixLocationFrontend.query || {};
  currentSearchFlowContextUrl = buildCurrentSearchFlowContextUrl(
    currentSearchFlowContextQuery
  );

  if (currentSearchFlowContextUrl) {
    session.setItem(
      RETURN_SEARCH_FLOW_CONTEXT_URL_STORAGE_KEY,
      currentSearchFlowContextUrl
    );
  }

  configureRepeater();
  configureLoadMoreButton();

  try {
    const getHotelsRatesResult = await getHotelsRates(currentSearchFlowContextQuery);
    const normalizedHotelsRates = Array.isArray(
      getHotelsRatesResult?.normalizedHotelsRates
    )
      ? getHotelsRatesResult.normalizedHotelsRates
      : [];

    if (!normalizedHotelsRates.length) {
      renderEmptyState("No available hotels were found for this search.");
      return;
    }

    allHotelOfferResults = normalizedHotelsRates
      .slice(0, MAX_RESULTS_TOTAL)
      .map((hotel, index) => ({
        ...hotel,
        _id: buildRepeaterId(hotel?.hotelId, index)
      }));

    renderedCount = Math.min(INITIAL_RESULTS_COUNT, allHotelOfferResults.length);
    renderVisibleHotels();
  } catch (error) {
    console.error("HOTELS initialization failed", error);
    renderEmptyState("Something went wrong while loading hotel results.");
  }
}

function configureRepeater() {
  const hotelOfferResultsRepeater = safeGetPageElement(
    "#hotelOfferResultsRepeater"
  );

  if (!hotelOfferResultsRepeater) {
    console.error("Missing #hotelOfferResultsRepeater");
    return;
  }

  hotelOfferResultsRepeater.onItemReady(($item, itemData) => {
    bindHotelRepeaterItem($item, itemData);
  });
}

function configureLoadMoreButton() {
  const loadMoreHotelOffersButton = safeGetPageElement(
    "#loadMoreHotelOffersButton"
  );

  if (!loadMoreHotelOffersButton) {
    return;
  }

  loadMoreHotelOffersButton.onClick(() => {
    renderedCount = Math.min(
      renderedCount + LOAD_MORE_STEP,
      allHotelOfferResults.length
    );
    renderVisibleHotels();
  });
}

function renderVisibleHotels() {
  const hotelOfferResultsRepeater = safeGetPageElement(
    "#hotelOfferResultsRepeater"
  );

  if (!hotelOfferResultsRepeater) {
    return;
  }

  hotelOfferResultsRepeater.data = allHotelOfferResults.slice(0, renderedCount);
  safeShow(hotelOfferResultsRepeater);
  safeExpand(hotelOfferResultsRepeater);

  hideEmptyStateIfExists();
  syncLoadMoreButton();
}

function bindHotelRepeaterItem($item, itemData) {
  const hotelNameText = safeGetItemElement($item, "#hotelNameText");
  const hotelAddressText = safeGetItemElement($item, "#hotelAddressText");
  const hotelReviewCountText = safeGetItemElement($item, "#hotelReviewCountText");
  const hotelRatingText = safeGetItemElement($item, "#hotelRatingText");
  const hotelOffersBeforeMinCurrentPriceText = safeGetItemElement(
    $item,
    "#hotelOffersBeforeMinCurrentPriceText"
  );
  const hotelOffersMinCurrentPriceText = safeGetItemElement(
    $item,
    "#hotelOffersMinCurrentPriceText"
  );
  const hotelOffersMinCurrentPriceNoteText = safeGetItemElement(
    $item,
    "#hotelOffersMinCurrentPriceNoteText"
  );
  const hotelMainImage = safeGetItemElement($item, "#hotelMainImage");
  const hotelStarRatingDisplay = safeGetItemElement(
    $item,
    "#hotelStarRatingDisplay"
  );
  const hotelAvailabilityButton = safeGetItemElement(
    $item,
    "#hotelAvailabilityButton"
  );
  const hotelOfferResultCard = safeGetItemElement(
    $item,
    "#hotelOfferResultCard"
  );

  if (hotelNameText) {
    hotelNameText.text = normalizeText(itemData?.hotelName) || "Hotel";
    safeShow(hotelNameText);
    safeExpand(hotelNameText);
  }

  if (hotelAddressText) {
    const hotelAddress = normalizeText(itemData?.hotelAddress);

    if (!hotelAddress) {
      safeCollapseAndHide(hotelAddressText);
    } else {
      hotelAddressText.text = hotelAddress;
      safeShow(hotelAddressText);
      safeExpand(hotelAddressText);
    }
  }

  if (hotelReviewCountText) {
    const hotelReviewCount = Number(itemData?.hotelReviewCount);

    if (!Number.isFinite(hotelReviewCount)) {
      safeCollapseAndHide(hotelReviewCountText);
    } else {
      hotelReviewCountText.text = String(hotelReviewCount);
      safeShow(hotelReviewCountText);
      safeExpand(hotelReviewCountText);
    }
  }

  if (hotelRatingText) {
    const hotelRating = Number(itemData?.hotelRating);

    if (!Number.isFinite(hotelRating)) {
      safeCollapseAndHide(hotelRatingText);
    } else {
      hotelRatingText.text = String(hotelRating);
      safeShow(hotelRatingText);
      safeExpand(hotelRatingText);
    }
  }

  if (hotelOffersBeforeMinCurrentPriceText) {
    const beforePrice = Number(itemData?.hotelOffersBeforeMinCurrentPrice);
    const currency = normalizeText(currentSearchFlowContextQuery?.currency);

    if (!Number.isFinite(beforePrice) || !currency) {
      safeCollapseAndHide(hotelOffersBeforeMinCurrentPriceText);
    } else {
      hotelOffersBeforeMinCurrentPriceText.text = formatPrice(beforePrice, currency);
      safeShow(hotelOffersBeforeMinCurrentPriceText);
      safeExpand(hotelOffersBeforeMinCurrentPriceText);
    }
  }

  if (hotelOffersMinCurrentPriceText) {
    const currentPrice = Number(itemData?.hotelOffersMinCurrentPrice);
    const currency = normalizeText(currentSearchFlowContextQuery?.currency);

    if (!Number.isFinite(currentPrice) || !currency) {
      safeCollapseAndHide(hotelOffersMinCurrentPriceText);
    } else {
      hotelOffersMinCurrentPriceText.text = formatPrice(currentPrice, currency);
      safeShow(hotelOffersMinCurrentPriceText);
      safeExpand(hotelOffersMinCurrentPriceText);
    }
  }

  if (hotelOffersMinCurrentPriceNoteText) {
    const currentPriceNote = normalizeText(itemData?.hotelOffersMinCurrentPriceNote);

    if (!currentPriceNote) {
      safeCollapseAndHide(hotelOffersMinCurrentPriceNoteText);
    } else {
      hotelOffersMinCurrentPriceNoteText.text = currentPriceNote;
      safeShow(hotelOffersMinCurrentPriceNoteText);
      safeExpand(hotelOffersMinCurrentPriceNoteText);
    }
  }

  if (hotelMainImage) {
    hotelMainImage.src = normalizeText(itemData?.hotelMainImage) || FALLBACK_IMAGE_URL;
    safeShow(hotelMainImage);
    safeExpand(hotelMainImage);

    if (typeof hotelMainImage.onClick === "function") {
      hotelMainImage.onClick(() => {
        openHotelDetailsPage(itemData);
      });
    }
  }

  if (hotelStarRatingDisplay) {
    const hotelStarRating = Number(itemData?.hotelStarRating);

    if (!Number.isFinite(hotelStarRating) || hotelStarRating <= 0) {
      safeCollapseAndHide(hotelStarRatingDisplay);
    } else {
      hotelStarRatingDisplay.rating = hotelStarRating;
      safeShow(hotelStarRatingDisplay);
      safeExpand(hotelStarRatingDisplay);
    }
  }

  if (hotelAvailabilityButton) {
    hotelAvailabilityButton.label = "See availability";
    safeShow(hotelAvailabilityButton);
    safeExpand(hotelAvailabilityButton);

    hotelAvailabilityButton.onClick(() => {
      openHotelDetailsPage(itemData);
    });
  }

  if (hotelOfferResultCard) {
    safeShow(hotelOfferResultCard);
    safeExpand(hotelOfferResultCard);

    if (typeof hotelOfferResultCard.onClick === "function") {
      hotelOfferResultCard.onClick(() => {
        openHotelDetailsPage(itemData);
      });
    }
  }
}

function openHotelDetailsPage(itemData) {
  const hotelId = normalizeText(itemData?.hotelId);

  if (!hotelId) {
    return;
  }

  wixLocationFrontend.to(
    buildHotelPageUrlFromHotelOffer(hotelId, currentSearchFlowContextUrl)
  );
}

function buildHotelPageUrlFromHotelOffer(hotelId, searchFlowContextUrl) {
  const hotelPageQuery = new URLSearchParams();
  const [, currentQueryString = ""] = String(searchFlowContextUrl || "").split("?");
  const currentSearchFlowParams = new URLSearchParams(currentQueryString);

  currentSearchFlowParams.forEach((value, key) => {
    if (normalizeText(value)) {
      hotelPageQuery.set(key, value);
    }
  });

  hotelPageQuery.set("hotelId", normalizeText(hotelId));

  return `/hotel?${hotelPageQuery.toString()}`;
}

function buildCurrentSearchFlowContextUrl(searchFlowContextQuery) {
  const currentPath =
    Array.isArray(wixLocationFrontend.path) && wixLocationFrontend.path.length
      ? `/${wixLocationFrontend.path.join("/")}`
      : "/hotels";

  const currentSearchFlowParams = new URLSearchParams();

  Object.entries(searchFlowContextQuery || {}).forEach(([key, value]) => {
    const normalizedValue = normalizeText(value);

    if (normalizedValue) {
      currentSearchFlowParams.set(key, normalizedValue);
    }
  });

  const currentQueryString = currentSearchFlowParams.toString();

  return currentQueryString ? `${currentPath}?${currentQueryString}` : currentPath;
}

function renderEmptyState(message) {
  const hotelOfferResultsRepeater = safeGetPageElement(
    "#hotelOfferResultsRepeater"
  );
  const loadMoreHotelOffersButton = safeGetPageElement(
    "#loadMoreHotelOffersButton"
  );
  const resultsEmptyStateText = safeGetPageElement("#resultsEmptyStateText");

  if (hotelOfferResultsRepeater) {
    hotelOfferResultsRepeater.data = [];
    safeCollapseAndHide(hotelOfferResultsRepeater);
  }

  if (loadMoreHotelOffersButton) {
    safeCollapseAndHide(loadMoreHotelOffersButton);
  }

  if (resultsEmptyStateText) {
    resultsEmptyStateText.text = message;
    safeShow(resultsEmptyStateText);
    safeExpand(resultsEmptyStateText);
  }
}

function hideEmptyStateIfExists() {
  const resultsEmptyStateText = safeGetPageElement("#resultsEmptyStateText");

  if (resultsEmptyStateText) {
    safeCollapseAndHide(resultsEmptyStateText);
  }
}

function syncLoadMoreButton() {
  const loadMoreHotelOffersButton = safeGetPageElement(
    "#loadMoreHotelOffersButton"
  );

  if (!loadMoreHotelOffersButton) {
    return;
  }

  if (renderedCount >= allHotelOfferResults.length) {
    safeCollapseAndHide(loadMoreHotelOffersButton);
    return;
  }

  loadMoreHotelOffersButton.label = `Load More (${
    allHotelOfferResults.length - renderedCount
  } left)`;

  safeShow(loadMoreHotelOffersButton);
  safeExpand(loadMoreHotelOffersButton);
}

function formatPrice(amount, currency) {
  if (!Number.isFinite(amount) || !normalizeText(currency)) {
    return "";
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: String(currency).toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  } catch (formatError) {
    return `${amount.toFixed(2)} ${String(currency).toUpperCase()}`;
  }
}

function buildRepeaterId(hotelId, index) {
  const safeHotelId = normalizeText(hotelId)
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, 40);

  return safeHotelId || `hotel-${index + 1}`;
}

function normalizeText(value) {
  return String(value || "").trim();
}
