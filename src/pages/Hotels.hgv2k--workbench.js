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

let allHotelOfferResults = [];
let renderedCount = 0;
let currentSearchFlowContextUrl = "";

$w.onReady(async function () {
  await initializeHotelsPage();
});

async function initializeHotelsPage() {
  const searchFlowContextQuery = wixLocationFrontend.query || {};

  currentSearchFlowContextUrl =
    buildCurrentSearchFlowContextUrl(searchFlowContextQuery);

  if (currentSearchFlowContextUrl) {
    session.setItem(
      RETURN_SEARCH_FLOW_CONTEXT_URL_STORAGE_KEY,
      currentSearchFlowContextUrl
    );
  }

  configureRepeater();
  configureLoadMoreButton();

  try {
    const getHotelsRatesResult = await getHotelsRates(searchFlowContextQuery);

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
      .map((normalizedHotelItem, normalizedHotelItemIndex) => ({
        ...normalizedHotelItem,
        _id: buildRepeaterId(
          normalizedHotelItem?.hotelId,
          normalizedHotelItemIndex
        )
      }));

    renderedCount = Math.min(INITIAL_RESULTS_COUNT, allHotelOfferResults.length);

    renderVisibleHotels();
  } catch (initializeHotelsPageError) {
    console.error("HOTELS initialization failed", initializeHotelsPageError);
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
    const hotelName = normalizeText(itemData?.hotelName);

    if (!hotelName) {
      safeCollapseAndHide(hotelNameText);
    } else {
      hotelNameText.text = hotelName;
      safeShow(hotelNameText);
      safeExpand(hotelNameText);
    }
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
    const normalizedHotelReviewCountText = normalizeText(
      itemData?.hotelReviewCountText
    );

    if (!normalizedHotelReviewCountText) {
      safeCollapseAndHide(hotelReviewCountText);
    } else {
      hotelReviewCountText.text = normalizedHotelReviewCountText;
      safeShow(hotelReviewCountText);
      safeExpand(hotelReviewCountText);
    }
  }

  if (hotelRatingText) {
    const normalizedHotelRating = Number(itemData?.hotelRating);

    if (!Number.isFinite(normalizedHotelRating)) {
      safeCollapseAndHide(hotelRatingText);
    } else {
      hotelRatingText.text = String(normalizedHotelRating);
      safeShow(hotelRatingText);
      safeExpand(hotelRatingText);
    }
  }

  if (hotelOffersBeforeMinCurrentPriceText) {
    const normalizedHotelOffersBeforeMinCurrentPriceText = normalizeText(
      itemData?.hotelOffersBeforeMinCurrentPriceText
    );

    if (!normalizedHotelOffersBeforeMinCurrentPriceText) {
      safeCollapseAndHide(hotelOffersBeforeMinCurrentPriceText);
    } else {
      hotelOffersBeforeMinCurrentPriceText.text =
        normalizedHotelOffersBeforeMinCurrentPriceText;
      safeShow(hotelOffersBeforeMinCurrentPriceText);
      safeExpand(hotelOffersBeforeMinCurrentPriceText);
    }
  }

  if (hotelOffersMinCurrentPriceText) {
    const normalizedHotelOffersMinCurrentPriceText = normalizeText(
      itemData?.hotelOffersMinCurrentPriceText
    );

    if (!normalizedHotelOffersMinCurrentPriceText) {
      safeCollapseAndHide(hotelOffersMinCurrentPriceText);
    } else {
      hotelOffersMinCurrentPriceText.text =
        normalizedHotelOffersMinCurrentPriceText;
      safeShow(hotelOffersMinCurrentPriceText);
      safeExpand(hotelOffersMinCurrentPriceText);
    }
  }

  if (hotelOffersMinCurrentPriceNoteText) {
    const normalizedHotelOffersMinCurrentPriceNoteText = normalizeText(
      itemData?.hotelOffersMinCurrentPriceNoteText
    );

    if (!normalizedHotelOffersMinCurrentPriceNoteText) {
      safeCollapseAndHide(hotelOffersMinCurrentPriceNoteText);
    } else {
      hotelOffersMinCurrentPriceNoteText.text =
        normalizedHotelOffersMinCurrentPriceNoteText;
      safeShow(hotelOffersMinCurrentPriceNoteText);
      safeExpand(hotelOffersMinCurrentPriceNoteText);
    }
  }

  if (hotelMainImage) {
    const normalizedHotelMainImage = normalizeText(itemData?.hotelMainImage);

    if (!normalizedHotelMainImage) {
      safeCollapseAndHide(hotelMainImage);
    } else {
      hotelMainImage.src = normalizedHotelMainImage;
      safeShow(hotelMainImage);
      safeExpand(hotelMainImage);

      if (typeof hotelMainImage.onClick === "function") {
        hotelMainImage.onClick(() => {
          openHotelDetailsPage(itemData);
        });
      }
    }
  }

  if (hotelStarRatingDisplay) {
    const normalizedHotelStarRating = Number(itemData?.hotelStarRating);

    if (!Number.isFinite(normalizedHotelStarRating) || normalizedHotelStarRating <= 0) {
      safeCollapseAndHide(hotelStarRatingDisplay);
    } else {
      hotelStarRatingDisplay.rating = normalizedHotelStarRating;
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

  new URLSearchParams(currentQueryString).forEach((value, key) => {
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

  Object.entries(searchFlowContextQuery || {}).forEach(
    ([searchFlowContextQueryKey, searchFlowContextQueryValue]) => {
      const normalizedSearchFlowContextQueryValue = normalizeText(
        searchFlowContextQueryValue
      );

      if (normalizedSearchFlowContextQueryValue) {
        currentSearchFlowParams.set(
          searchFlowContextQueryKey,
          normalizedSearchFlowContextQueryValue
        );
      }
    }
  );

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
    resultsEmptyStateText.text = normalizeText(message);
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

function buildRepeaterId(hotelId, index) {
  const safeHotelId = normalizeText(hotelId)
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, 40);

  return safeHotelId || `hotel-${index + 1}`;
}

function normalizeText(value) {
  return String(value || "").trim();
}
