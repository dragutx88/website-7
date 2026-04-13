import wixLocationFrontend from "wix-location-frontend";
import { searchHotelRates } from "backend/liteApi.web";
import {
  buildHotelPageUrl,
  buildSearchFormDataFromCtx,
  ctxMatches,
  formatGuestRating,
  formatPrice,
  formatReviewCount,
  loadSearchResultsPayload,
  normalizeCtxFromQuery,
  persistSearchResultsPayload,
  persistSelectedHotelPayload
} from "public/liteApiFlow";
import {
  safeCollapseAndHide,
  safeExpand,
  safeGetItemElement,
  safeGetPageElement,
  safeShow,
  setItemImage,
  setItemText,
  setOptionalItemText
} from "public/liteApiHelpers";

const MAX_RESULTS_TOTAL = 30;
const INITIAL_RESULTS_COUNT = 10;
const LOAD_MORE_STEP = 10;
const FALLBACK_IMAGE_URL =
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80";

let allHotels = [];
let renderedCount = 0;
let currentCtx = {};
let currentSearchFormData = null;

$w.onReady(async function () {
  await initializeHotelsPage();
});

async function initializeHotelsPage() {
  currentCtx = normalizeCtxFromQuery(wixLocationFrontend.query || {});
  currentSearchFormData = buildSearchFormDataFromCtx(currentCtx);

  configureRepeater();
  configureLoadMoreButton();

  try {
    const cachedPayload = loadSearchResultsPayload();

    const canUseCache =
      cachedPayload &&
      ctxMatches(cachedPayload?.searchContext, currentCtx) &&
      Array.isArray(cachedPayload?.normalizedHotels);

    let normalizedHotels = [];

    if (canUseCache) {
      normalizedHotels = cachedPayload.normalizedHotels;
      console.log("HOTELS using cache", normalizedHotels.length);
    } else {
      const searchResult = await searchHotelRates(currentSearchFormData);
      normalizedHotels = Array.isArray(searchResult?.normalizedHotels)
        ? searchResult.normalizedHotels
        : [];

      persistSearchResultsPayload({
        searchedAt: Date.now(),
        mode: currentSearchFormData.mode,
        searchContext: currentCtx,
        normalizedHotels
      });
    }

    if (!normalizedHotels.length) {
      renderEmptyState("No available hotels were found for this search.");
      return;
    }

    allHotels = normalizedHotels
      .slice(0, MAX_RESULTS_TOTAL)
      .map((hotel, index) => normalizeHotelForRepeater(hotel, index));

    renderedCount = Math.min(INITIAL_RESULTS_COUNT, allHotels.length);
    renderVisibleHotels();
  } catch (error) {
    console.error("HOTELS initialization failed", error);
    renderEmptyState("Something went wrong while loading hotel results.");
  }
}

function configureRepeater() {
  const repeater = safeGetPageElement("#hotelResultsRepeater");
  if (!repeater) {
    console.error("Missing #hotelResultsRepeater");
    return;
  }

  repeater.onItemReady(($item, itemData) => {
    bindHotelRepeaterItem($item, itemData);
  });
}

function configureLoadMoreButton() {
  const loadMoreButton = safeGetPageElement("#loadMoreHotelsButton");
  if (!loadMoreButton) {
    return;
  }

  loadMoreButton.onClick(() => {
    renderedCount = Math.min(renderedCount + LOAD_MORE_STEP, allHotels.length);
    renderVisibleHotels();
  });
}

function renderVisibleHotels() {
  const repeater = $w("#hotelResultsRepeater");
  const visibleHotels = allHotels.slice(0, renderedCount);

  repeater.data = visibleHotels;
  safeExpand(repeater);
  safeShow(repeater);

  hideEmptyStateIfExists();
  syncLoadMoreButton();
}

function bindHotelRepeaterItem($item, itemData) {
  setItemText($item, "#hotelNameText", itemData.name);
  setItemText($item, "#hotelAddressText", itemData.address);
  setOptionalItemText($item, "#hotelReviewCountText", itemData.reviewCountText);
  setOptionalItemText($item, "#hotelGuestRatingText", itemData.guestRatingText);
  setOptionalItemText($item, "#hotelDiscountBeforePriceText", itemData.beforePriceText);
  setOptionalItemText($item, "#hotelCurrentPriceText", itemData.currentPriceText);
  setOptionalItemText($item, "#hotelPriceNoteText", itemData.priceNoteText);
  setItemImage($item, "#hotelCardMainImage", itemData.imageUrl);
  setItemStars($item, "#hotelStarsRatingDisplay", itemData.starRatingValue);
  bindAvailabilityButton($item, "#hotelAvailabilityButton", itemData);

  const card = safeGetItemElement($item, "#hotelResulCard");
  if (card) {
    safeExpand(card);
    safeShow(card);
    try {
      if (typeof card.onClick === "function") {
        card.onClick(() => {
          openHotelDetailsPage(itemData);
        });
      }
    } catch (error) {}
  }

  const image = safeGetItemElement($item, "#hotelCardMainImage");
  if (image) {
    try {
      if (typeof image.onClick === "function") {
        image.onClick(() => {
          openHotelDetailsPage(itemData);
        });
      }
    } catch (error) {}
  }
}

function bindAvailabilityButton($item, selector, itemData) {
  const button = safeGetItemElement($item, selector);
  if (!button) {
    return;
  }

  button.label = "See availability";
  safeShow(button);
  safeExpand(button);

  button.onClick(() => {
    openHotelDetailsPage(itemData);
  });
}

function openHotelDetailsPage(itemData) {
  persistSelectedHotelPayload({
    ctx: currentCtx,
    hotelId: itemData.hotelId,
    offerId: itemData.offerId,
    name: itemData.name,
    rawHotel: itemData.rawHotel,
    selectedAt: Date.now()
  });

  wixLocationFrontend.to(buildHotelPageUrl(currentCtx, itemData.hotelId));
}

function normalizeHotelForRepeater(hotel, index) {
  return {
    _id: buildRepeaterId(hotel?.hotelId, index),
    hotelId: hotel?.hotelId || "",
    offerId: hotel?.offerId || "",
    name: String(hotel?.name || "Hotel"),
    address: String(hotel?.address || ""),
    reviewCountText: formatReviewCount(hotel?.reviewCount),
    guestRatingText: formatGuestRating(hotel?.guestRating),
    beforePriceText: formatPrice(hotel?.beforePrice),
    currentPriceText: formatPrice(hotel?.currentPrice),
    priceNoteText: String(hotel?.priceNote || ""),
    starRatingValue: normalizeStarRating(hotel?.starRating),
    imageUrl: String(hotel?.mainPhoto || FALLBACK_IMAGE_URL),
    rawHotel: hotel
  };
}

function renderEmptyState(message) {
  const repeater = safeGetPageElement("#hotelResultsRepeater");
  if (repeater) {
    repeater.data = [];
    safeCollapseAndHide(repeater);
  }

  const loadMoreButton = safeGetPageElement("#loadMoreHotelsButton");
  if (loadMoreButton) {
    safeCollapseAndHide(loadMoreButton);
  }

  const emptyStateText = safeGetPageElement("#resultsEmptyStateText");
  if (emptyStateText) {
    emptyStateText.text = message;
    safeShow(emptyStateText);
    safeExpand(emptyStateText);
  }
}

function hideEmptyStateIfExists() {
  const emptyStateText = safeGetPageElement("#resultsEmptyStateText");
  if (emptyStateText) {
    safeCollapseAndHide(emptyStateText);
  }
}

function syncLoadMoreButton() {
  const loadMoreButton = safeGetPageElement("#loadMoreHotelsButton");
  if (!loadMoreButton) {
    return;
  }

  if (renderedCount >= allHotels.length) {
    safeCollapseAndHide(loadMoreButton);
    return;
  }

  loadMoreButton.label = `Load More (${allHotels.length - renderedCount} left)`;
  safeShow(loadMoreButton);
  safeExpand(loadMoreButton);
}




function setItemStars($item, selector, ratingValue) {
  const element = safeGetItemElement($item, selector);
  if (!element) {
    return;
  }

  const numericRating = Number(ratingValue || 0);

  if (!Number.isFinite(numericRating) || numericRating <= 0) {
    safeCollapseAndHide(element);
    return;
  }

  try {
    element.rating = numericRating;
    safeShow(element);
    safeExpand(element);
  } catch (error) {
    console.error(`Failed to set stars for ${selector}`, error);
  }
}



function normalizeStarRating(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(5, Math.round(numericValue)));
}

function buildRepeaterId(hotelId, index) {
  const safeHotelId = String(hotelId || `hotel-${index + 1}`)
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, 40);
  return safeHotelId || `hotel-${index + 1}`;
}







