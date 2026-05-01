import wixLocationFrontend from "wix-location-frontend";
import { session } from "wix-storage-frontend";
import { getHotelsRates } from "backend/liteApi.web";

const SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY =
  "searchFlowContextQueryStringify";

const MAX_RESULTS_TOTAL = 30;
const INITIAL_RESULTS_COUNT = 10;
const LOAD_MORE_STEP = 10;

let allHotelOfferResults = [];
let renderedCount = 0;

$w.onReady(async function () {
  await initializeHotelsPage();
});

async function initializeHotelsPage() {
  session.setItem(
    SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY,
    JSON.stringify({
      ...wixLocationFrontend.query,
      ...JSON.parse(
        session.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY) || "{}"
      ),
      language: "tr",
      currency: "TRY"
    })
  );

  wixLocationFrontend.queryParams.add(
    JSON.parse(session.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY))
  );

  const searchFlowContextQuery = {
    ...JSON.parse(
      session.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY) || "{}"
    ),
    ...wixLocationFrontend.query
  };

  configureRepeater();
  configureLoadMoreButton();
  hideNoResultsState();

  try {
    const getHotelsRatesResult = await getHotelsRates(searchFlowContextQuery);

    const normalizedHotelsRates = Array.isArray(
      getHotelsRatesResult?.normalizedHotelsRates
    )
      ? getHotelsRatesResult.normalizedHotelsRates
      : [];

    if (!normalizedHotelsRates.length) {
      renderNoResultsState();
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
    renderNoResultsState();
  }
}

function configureRepeater() {
  const hotelOfferResultsRepeater = $w("#hotelOfferResultsRepeater");

  hotelOfferResultsRepeater.onItemReady(($item, itemData) => {
    bindHotelRepeaterItem($item, itemData);
  });
}

function configureLoadMoreButton() {
  const loadMoreHotelOffersButton = $w("#loadMoreHotelOffersButton");

  loadMoreHotelOffersButton.onClick(() => {
    renderedCount = Math.min(
      renderedCount + LOAD_MORE_STEP,
      allHotelOfferResults.length
    );

    renderVisibleHotels();
  });
}

function renderVisibleHotels() {
  const hotelOfferResultsRepeater = $w("#hotelOfferResultsRepeater");

  hotelOfferResultsRepeater.data = allHotelOfferResults.slice(0, renderedCount);
  hotelOfferResultsRepeater.expand();

  hideNoResultsState();
  syncLoadMoreButton();
}

function bindHotelRepeaterItem($item, itemData) {
  const hotelNameText = $item("#hotelNameText");
  const hotelAddressText = $item("#hotelAddressText");
  const hotelRatingText = $item("#hotelRatingText");
  const hotelOffersBeforeMinCurrentPriceText = $item(
    "#hotelOffersBeforeMinCurrentPriceText"
  );
  const hotelOffersMinCurrentPriceText = $item(
    "#hotelOffersMinCurrentPriceText"
  );
  const hotelOffersMinCurrentPriceNoteText = $item(
    "#hotelOffersMinCurrentPriceNoteText"
  );
  const hotelMainImage = $item("#hotelMainImage");
  const hotelAvailabilityButton = $item("#hotelAvailabilityButton");
  const hotelOfferResultCard = $item("#hotelOfferResultCard");

  const normalizedHotelName = normalizeText(itemData?.hotelName);
  const normalizedHotelAddress = normalizeText(itemData?.hotelAddress);
  const normalizedHotelRating = Number(itemData?.hotelRating);
  const normalizedHotelOffersBeforeMinCurrentPriceText = normalizeText(
    itemData?.hotelOffersBeforeMinCurrentPriceText
  );
  const normalizedHotelOffersMinCurrentPriceText = normalizeText(
    itemData?.hotelOffersMinCurrentPriceText
  );
  const normalizedHotelOffersMinCurrentPriceNoteText = normalizeText(
    itemData?.hotelOffersMinCurrentPriceNoteText
  );
  const normalizedHotelMainImage = normalizeText(itemData?.hotelMainImage);

  if (!normalizedHotelName) {
    hotelNameText.collapse();
  } else {
    hotelNameText.text = normalizedHotelName;
    hotelNameText.expand();
  }

  if (!normalizedHotelAddress) {
    hotelAddressText.collapse();
  } else {
    hotelAddressText.text = normalizedHotelAddress;
    hotelAddressText.expand();
  }

  if (!Number.isFinite(normalizedHotelRating)) {
    hotelRatingText.collapse();
  } else {
    hotelRatingText.text = String(normalizedHotelRating);
    hotelRatingText.expand();
  }

  if (!normalizedHotelOffersBeforeMinCurrentPriceText) {
    hotelOffersBeforeMinCurrentPriceText.collapse();
  } else {
    hotelOffersBeforeMinCurrentPriceText.text =
      normalizedHotelOffersBeforeMinCurrentPriceText;
    hotelOffersBeforeMinCurrentPriceText.expand();
  }

  if (!normalizedHotelOffersMinCurrentPriceText) {
    hotelOffersMinCurrentPriceText.collapse();
  } else {
    hotelOffersMinCurrentPriceText.text =
      normalizedHotelOffersMinCurrentPriceText;
    hotelOffersMinCurrentPriceText.expand();
  }

  if (!normalizedHotelOffersMinCurrentPriceNoteText) {
    hotelOffersMinCurrentPriceNoteText.collapse();
  } else {
    hotelOffersMinCurrentPriceNoteText.text =
      normalizedHotelOffersMinCurrentPriceNoteText;
    hotelOffersMinCurrentPriceNoteText.expand();
  }

  if (!normalizedHotelMainImage) {
    hotelMainImage.collapse();
  } else {
    hotelMainImage.src = normalizedHotelMainImage;
    hotelMainImage.expand();

    hotelMainImage.onClick(() => {
      openHotelDetailsPage(itemData);
    });
  }

  hotelAvailabilityButton.label = "See availability";
  hotelAvailabilityButton.expand();
  hotelAvailabilityButton.onClick(() => {
    openHotelDetailsPage(itemData);
  });

  hotelOfferResultCard.expand();
  hotelOfferResultCard.onClick(() => {
    openHotelDetailsPage(itemData);
  });
}

function openHotelDetailsPage(itemData) {
  const hotelId = normalizeText(itemData?.hotelId);

  if (!hotelId) {
    return;
  }

  const runtimeSearchFlowContextQuery = {
    hotelId
  };

  wixLocationFrontend.to(`/hotel?${new URLSearchParams({
    ...wixLocationFrontend.query,
    ...JSON.parse(
      session.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY) || "{}"
    ),
    ...runtimeSearchFlowContextQuery,
    language: "tr",
    currency: "TRY"
  })}`);
}

function renderNoResultsState() {
  const hotelOfferResultsRepeater = $w("#hotelOfferResultsRepeater");
  const loadMoreHotelOffersButton = $w("#loadMoreHotelOffersButton");
  const noResultsBox = $w("#noResultsBox");

  hotelOfferResultsRepeater.data = [];
  hotelOfferResultsRepeater.collapse();

  loadMoreHotelOffersButton.collapse();

  noResultsBox.expand();
}

function hideNoResultsState() {
  const noResultsBox = $w("#noResultsBox");

  noResultsBox.collapse();
}

function syncLoadMoreButton() {
  const loadMoreHotelOffersButton = $w("#loadMoreHotelOffersButton");

  if (renderedCount >= allHotelOfferResults.length) {
    loadMoreHotelOffersButton.collapse();
    return;
  }

  loadMoreHotelOffersButton.label = `Load More (${
    allHotelOfferResults.length - renderedCount
  } left)`;

  loadMoreHotelOffersButton.expand();
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
