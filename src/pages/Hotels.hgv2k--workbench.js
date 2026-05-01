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

  console.log("HOTELS initialize searchFlowContextQuery", searchFlowContextQuery);

  configureRepeater();
  configureHotelOfferResultsProgressiveLoadingButton();
  hideNoResultsState();

  try {
    const getHotelsRatesResult = await getHotelsRates(searchFlowContextQuery);

    const normalizedHotelsRates = getHotelsRatesResult?.normalizedHotelsRates;

    if (!Array.isArray(normalizedHotelsRates)) {
      throw new Error(
        "getHotelsRatesResult.normalizedHotelsRates must be an array."
      );
    }

    console.log("HOTELS getHotelsRates normalizedHotelsRates summary", {
      normalizedHotelsRatesCount: normalizedHotelsRates.length,
      initialResultsCount: INITIAL_RESULTS_COUNT,
      hotelOfferResultsRenderStep: HOTEL_OFFER_RESULTS_RENDER_STEP
    });

    if (!normalizedHotelsRates.length) {
      renderNoResultsState();
      return;
    }

    allHotelOfferResults = normalizedHotelsRates.map((normalizedHotelItem) => ({
      ...normalizedHotelItem,
      _id: buildRepeaterId(normalizedHotelItem?.hotelId)
    }));

    renderedHotelOfferResultsCount = Math.min(
      INITIAL_RESULTS_COUNT,
      allHotelOfferResults.length
    );

    console.log("HOTELS prepared hotel offer results", {
      allHotelOfferResultsCount: allHotelOfferResults.length,
      renderedHotelOfferResultsCount
    });

    renderHotelOfferResults("initial");
  } catch (initializeHotelsPageError) {
    console.error("HOTELS initialization failed", {
      name: initializeHotelsPageError?.name,
      message: initializeHotelsPageError?.message,
      stack: initializeHotelsPageError?.stack
    });

    wixLocationFrontend.to(`/?${new URLSearchParams({
      ...wixLocationFrontend.query,
      ...JSON.parse(
        session.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY) || "{}"
      ),
      language: "tr",
      currency: "TRY"
    })}`);
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

  console.log("HOTELS renderHotelOfferResults", {
    renderHotelOfferResultsSource,
    renderedHotelOfferResultsCount,
    allHotelOfferResultsCount: allHotelOfferResults.length,
    remainingHotelOfferResultsCount: Math.max(
      0,
      allHotelOfferResults.length - renderedHotelOfferResultsCount
    )
  });
}

function renderNextHotelOfferResults(renderNextHotelOfferResultsSource) {
  if (isRenderingNextHotelOfferResults) {
    console.log("HOTELS renderNextHotelOfferResults skipped", {
      renderNextHotelOfferResultsSource,
      reason: "alreadyRendering",
      renderedHotelOfferResultsCount,
      allHotelOfferResultsCount: allHotelOfferResults.length
    });
    return;
  }

  if (renderedHotelOfferResultsCount >= allHotelOfferResults.length) {
    syncHotelOfferResultsProgressiveLoadingButton();

    console.log("HOTELS renderNextHotelOfferResults skipped", {
      renderNextHotelOfferResultsSource,
      reason: "allResultsRendered",
      renderedHotelOfferResultsCount,
      allHotelOfferResultsCount: allHotelOfferResults.length
    });
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

    console.log("HOTELS renderNextHotelOfferResults", {
      renderNextHotelOfferResultsSource,
      previousRenderedHotelOfferResultsCount,
      nextRenderedHotelOfferResultsCount: renderedHotelOfferResultsCount,
      allHotelOfferResultsCount: allHotelOfferResults.length
    });

    renderHotelOfferResults(renderNextHotelOfferResultsSource);
  } finally {
    isRenderingNextHotelOfferResults = false;
  }
}

function bindHotelRepeaterItem($item, itemData) {
  const hotelNameText = $item("#hotelNameText");
  const hotelAddressText = $item("#hotelAddressText");
  const hotelRatingText = $item("#hotelRatingText");
  const beforeCurrentPriceText = $item("#beforeCurrentPriceText");
  const currentPriceText = $item("#currentPriceText");
  const currentPriceNoteText = $item("#currentPriceNoteText");
  const hotelRoomOfferBoardNameText = $item("#hotelRoomOfferBoardNameText");
  const hotelMainImage = $item("#hotelMainImage");
  const hotelAvailabilityButton = $item("#hotelAvailabilityButton");
  const hotelOfferResultCard = $item("#hotelOfferResultCard");

  const normalizedHotelName = normalizeText(itemData?.hotelName);
  const normalizedHotelAddress = normalizeText(itemData?.hotelAddress);
  const normalizedHotelRating = Number(itemData?.hotelRating);
  const normalizedBeforeCurrentPriceText = normalizeText(
    itemData?.beforeCurrentPriceText
  );
  const normalizedCurrentPriceText = normalizeText(itemData?.currentPriceText);
  const normalizedCurrentPriceNoteText = normalizeText(
    itemData?.currentPriceNoteText
  );
  const normalizedHotelRoomOfferBoardName = normalizeText(
    itemData?.hotelRoomOfferBoardName
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

  if (!normalizedBeforeCurrentPriceText) {
    beforeCurrentPriceText.collapse();
  } else {
    beforeCurrentPriceText.text = normalizedBeforeCurrentPriceText;
    beforeCurrentPriceText.expand();
  }

  if (!normalizedCurrentPriceText) {
    currentPriceText.collapse();
  } else {
    currentPriceText.text = normalizedCurrentPriceText;
    currentPriceText.expand();
  }

  if (!normalizedCurrentPriceNoteText) {
    currentPriceNoteText.collapse();
  } else {
    currentPriceNoteText.text = normalizedCurrentPriceNoteText;
    currentPriceNoteText.expand();
  }

  if (!normalizedHotelRoomOfferBoardName) {
    hotelRoomOfferBoardNameText.collapse();
  } else {
    hotelRoomOfferBoardNameText.text = normalizedHotelRoomOfferBoardName;
    hotelRoomOfferBoardNameText.expand();
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
    console.warn("HOTELS openHotelDetailsPage skipped", {
      reason: "missingHotelId"
    });
    return;
  }

  const runtimeSearchFlowContextQuery = {
    hotelId
  };

  console.log("HOTELS openHotelDetailsPage", runtimeSearchFlowContextQuery);

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

  console.log("HOTELS renderNoResultsState", {
    allHotelOfferResultsCount: allHotelOfferResults.length,
    renderedHotelOfferResultsCount
  });
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

function buildRepeaterId(hotelId) {
  const safeHotelId = normalizeText(hotelId)
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, 40);

  if (!safeHotelId) {
    throw new Error("hotelId is required to build hotel offer repeater item id.");
  }

  return safeHotelId;
}

function normalizeText(value) {
  return String(value || "").trim();
}
