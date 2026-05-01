import wixLocationFrontend from "wix-location-frontend";
import { session } from "wix-storage-frontend";
import { getHotelsRates } from "backend/liteApi.web";

const SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY =
  "searchFlowContextQueryStringify";

const INITIAL_RESULTS_COUNT = 40;
const HOTEL_OFFER_RESULTS_RENDER_STEP = 40;

let allHotelOfferResults = [];
let renderedHotelOfferResultsCount = 0;
let isRenderingNextHotelOfferResults = false;

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

  console.log(
    "HOTELS initialize searchFlowContextQuery",
    JSON.stringify(searchFlowContextQuery)
  );

  configureRepeater();
  configureHotelOfferResultsProgressiveLoadingButton();
  hideNoResultsState();

  try {
    const getHotelsRatesResult = await getHotelsRates(searchFlowContextQuery);

    const normalizedHotelsRates = Array.isArray(
      getHotelsRatesResult?.normalizedHotelsRates
    )
      ? getHotelsRatesResult.normalizedHotelsRates
      : [];

    console.log(
      "HOTELS getHotelsRates normalizedHotelsRates summary",
      JSON.stringify({
        normalizedHotelsRatesCount: normalizedHotelsRates.length,
        initialResultsCount: INITIAL_RESULTS_COUNT,
        hotelOfferResultsRenderStep: HOTEL_OFFER_RESULTS_RENDER_STEP
      })
    );

    if (!normalizedHotelsRates.length) {
      renderNoResultsState();
      return;
    }

    allHotelOfferResults = normalizedHotelsRates.map(
      (normalizedHotelItem, normalizedHotelItemIndex) => ({
        ...normalizedHotelItem,
        _id: buildRepeaterId(
          normalizedHotelItem?.hotelId,
          normalizedHotelItemIndex
        )
      })
    );

    renderedHotelOfferResultsCount = Math.min(
      INITIAL_RESULTS_COUNT,
      allHotelOfferResults.length
    );

    console.log(
      "HOTELS prepared hotel offer results",
      JSON.stringify({
        allHotelOfferResultsCount: allHotelOfferResults.length,
        renderedHotelOfferResultsCount
      })
    );

    renderHotelOfferResults("initial");
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

function configureHotelOfferResultsProgressiveLoadingButton() {
  const loadMoreHotelOffersButton = $w("#loadMoreHotelOffersButton");

  loadMoreHotelOffersButton.onClick(() => {
    renderNextHotelOfferResults("loadMoreButtonClick");
  });

  loadMoreHotelOffersButton.onViewportEnter(() => {
    renderNextHotelOfferResults("loadMoreButtonViewportEnter");
  });
}

function renderHotelOfferResults(renderHotelOfferResultsSource) {
  const hotelOfferResultsRepeater = $w("#hotelOfferResultsRepeater");

  hotelOfferResultsRepeater.data = allHotelOfferResults.slice(
    0,
    renderedHotelOfferResultsCount
  );
  hotelOfferResultsRepeater.expand();

  hideNoResultsState();
  syncHotelOfferResultsProgressiveLoadingButton();

  console.log(
    "HOTELS renderHotelOfferResults",
    JSON.stringify({
      renderHotelOfferResultsSource,
      renderedHotelOfferResultsCount,
      allHotelOfferResultsCount: allHotelOfferResults.length,
      remainingHotelOfferResultsCount: Math.max(
        0,
        allHotelOfferResults.length - renderedHotelOfferResultsCount
      )
    })
  );
}

function renderNextHotelOfferResults(renderNextHotelOfferResultsSource) {
  if (isRenderingNextHotelOfferResults) {
    console.log(
      "HOTELS renderNextHotelOfferResults skipped",
      JSON.stringify({
        renderNextHotelOfferResultsSource,
        reason: "alreadyRendering",
        renderedHotelOfferResultsCount,
        allHotelOfferResultsCount: allHotelOfferResults.length
      })
    );
    return;
  }

  if (renderedHotelOfferResultsCount >= allHotelOfferResults.length) {
    syncHotelOfferResultsProgressiveLoadingButton();

    console.log(
      "HOTELS renderNextHotelOfferResults skipped",
      JSON.stringify({
        renderNextHotelOfferResultsSource,
        reason: "allResultsRendered",
        renderedHotelOfferResultsCount,
        allHotelOfferResultsCount: allHotelOfferResults.length
      })
    );
    return;
  }

  isRenderingNextHotelOfferResults = true;

  try {
    const previousRenderedHotelOfferResultsCount =
      renderedHotelOfferResultsCount;

    renderedHotelOfferResultsCount = Math.min(
      renderedHotelOfferResultsCount + HOTEL_OFFER_RESULTS_RENDER_STEP,
      allHotelOfferResults.length
    );

    console.log(
      "HOTELS renderNextHotelOfferResults",
      JSON.stringify({
        renderNextHotelOfferResultsSource,
        previousRenderedHotelOfferResultsCount,
        nextRenderedHotelOfferResultsCount: renderedHotelOfferResultsCount,
        allHotelOfferResultsCount: allHotelOfferResults.length
      })
    );

    renderHotelOfferResults(renderNextHotelOfferResultsSource);
  } finally {
    isRenderingNextHotelOfferResults = false;
  }
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
  }

  hotelAvailabilityButton.label = "See availability";
  hotelAvailabilityButton.expand();

  hotelOfferResultCard.expand();
  hotelOfferResultCard.onClick(() => {
    openHotelDetailsPage(itemData);
  });
}

function openHotelDetailsPage(itemData) {
  const hotelId = normalizeText(itemData?.hotelId);

  if (!hotelId) {
    console.warn(
      "HOTELS openHotelDetailsPage skipped",
      JSON.stringify({
        reason: "missingHotelId"
      })
    );
    return;
  }

  const runtimeSearchFlowContextQuery = {
    hotelId
  };

  console.log(
    "HOTELS openHotelDetailsPage",
    JSON.stringify(runtimeSearchFlowContextQuery)
  );

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

  console.log(
    "HOTELS renderNoResultsState",
    JSON.stringify({
      allHotelOfferResultsCount: allHotelOfferResults.length,
      renderedHotelOfferResultsCount
    })
  );
}

function hideNoResultsState() {
  const noResultsBox = $w("#noResultsBox");

  noResultsBox.collapse();
}

function syncHotelOfferResultsProgressiveLoadingButton() {
  const loadMoreHotelOffersButton = $w("#loadMoreHotelOffersButton");

  if (renderedHotelOfferResultsCount >= allHotelOfferResults.length) {
    loadMoreHotelOffersButton.collapse();
    return;
  }

  loadMoreHotelOffersButton.label = `Load More (${
    allHotelOfferResults.length - renderedHotelOfferResultsCount
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
