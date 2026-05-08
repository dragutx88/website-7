import wixLocationFrontend from "wix-location-frontend";
import wixWindow from "wix-window-frontend";
import { session } from "wix-storage-frontend";
import { getHotelsRates, getOzviaClubOffers } from "backend/liteApi.web";

const SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY =
  "searchFlowContextQueryStringify";

const INITIAL_RESULTS_COUNT = 40;
const HOTEL_RATE_RESULTS_RENDER_STEP = 40;

let allHotelRateResults = [];
let renderedHotelRateResultsCount = 0;
let isRenderingNextHotelRateResults = false;

$w.onReady(async function () {
  const renderingEnv = wixWindow.rendering.env;

  if (renderingEnv !== "browser") {
    console.log("HOTELS skipped outside browser", { renderingEnv });
    return;
  }

  await initializeHotelsPage();
});

async function initializeHotelsPage() {
  session.setItem(
    SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY,
    JSON.stringify({
      ...JSON.parse(
        session.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY) || "{}"
      ),
      ...wixLocationFrontend.query
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

  const isOzviaClubOffersMode =
    normalizeText(searchFlowContextQuery?.club).toLowerCase() === "ozvia";

  console.log("HOTELS initialize searchFlowContextQuery", {
    searchFlowContextQuery,
    searchBackendMode: isOzviaClubOffersMode
      ? "ozviaClubOffers"
      : "standardHotelsRates"
  });

  configureHotelRateResultsRepeater();
  configureHotelRateResultsProgressiveLoadingButton();
  hideNoResultsState();

  try {
    const getHotelsRatesResult = isOzviaClubOffersMode
      ? await getOzviaClubOffers(searchFlowContextQuery)
      : await getHotelsRates(searchFlowContextQuery);

    const normalizedHotelsRates = getHotelsRatesResult?.normalizedHotelsRates;

    if (!Array.isArray(normalizedHotelsRates)) {
      throw new Error(
        "getHotelsRatesResult.normalizedHotelsRates must be an array."
      );
    }

    console.log("HOTELS getHotelsRates normalizedHotelsRates summary", {
      searchBackendMode: isOzviaClubOffersMode
        ? "ozviaClubOffers"
        : "standardHotelsRates",
      normalizedHotelsRatesCount: normalizedHotelsRates.length,
      initialResultsCount: INITIAL_RESULTS_COUNT,
      hotelRateResultsRenderStep: HOTEL_RATE_RESULTS_RENDER_STEP
    });

    if (!normalizedHotelsRates.length) {
      renderNoResultsState();
      return;
    }

    allHotelRateResults = normalizedHotelsRates.map((normalizedHotelItem) => ({
      ...normalizedHotelItem,
      _id: buildRepeaterId(normalizedHotelItem?.hotelId)
    }));

    renderedHotelRateResultsCount = Math.min(
      INITIAL_RESULTS_COUNT,
      allHotelRateResults.length
    );

    console.log("HOTELS prepared hotel rate results", {
      searchBackendMode: isOzviaClubOffersMode
        ? "ozviaClubOffers"
        : "standardHotelsRates",
      allHotelRateResultsCount: allHotelRateResults.length,
      renderedHotelRateResultsCount
    });

    renderHotelRateResults("initial");
  } catch (initializeHotelsPageError) {
    console.error("HOTELS initialization failed", {
      searchBackendMode: isOzviaClubOffersMode
        ? "ozviaClubOffers"
        : "standardHotelsRates",
      name: initializeHotelsPageError?.name,
      message: initializeHotelsPageError?.message,
      stack: initializeHotelsPageError?.stack
    });

    wixLocationFrontend.to(`/hotels?${new URLSearchParams({
      ...wixLocationFrontend.query,
      ...JSON.parse(
        session.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY) || "{}"
      )
    })}`);
  }
}

function configureHotelRateResultsRepeater() {
  const hotelRateResultsRepeater = $w("#hotelRateResultsRepeater");

  hotelRateResultsRepeater.onItemReady(($item, itemData) => {
    bindHotelRateResultItem($item, itemData);
  });
}

function configureHotelRateResultsProgressiveLoadingButton() {
  const loadMoreHotelRateResultsButton = $w("#loadMoreHotelRateResultsButton");

  loadMoreHotelRateResultsButton.onClick(() => {
    renderNextHotelRateResults("loadMoreButtonClick");
  });

  loadMoreHotelRateResultsButton.onViewportEnter(() => {
    renderNextHotelRateResults("loadMoreButtonViewportEnter");
  });
}

function renderHotelRateResults(renderHotelRateResultsSource) {
  const hotelRateResultsRepeater = $w("#hotelRateResultsRepeater");

  hotelRateResultsRepeater.data = allHotelRateResults.slice(
    0,
    renderedHotelRateResultsCount
  );
  hotelRateResultsRepeater.expand();

  hideNoResultsState();
  syncHotelRateResultsProgressiveLoadingButton();

  console.log("HOTELS renderHotelRateResults", {
    renderHotelRateResultsSource,
    renderedHotelRateResultsCount,
    allHotelRateResultsCount: allHotelRateResults.length,
    remainingHotelRateResultsCount: Math.max(
      0,
      allHotelRateResults.length - renderedHotelRateResultsCount
    )
  });
}

function renderNextHotelRateResults(renderNextHotelRateResultsSource) {
  if (isRenderingNextHotelRateResults) {
    console.log("HOTELS renderNextHotelRateResults skipped", {
      renderNextHotelRateResultsSource,
      reason: "alreadyRendering",
      renderedHotelRateResultsCount,
      allHotelRateResultsCount: allHotelRateResults.length
    });
    return;
  }

  if (renderedHotelRateResultsCount >= allHotelRateResults.length) {
    syncHotelRateResultsProgressiveLoadingButton();

    console.log("HOTELS renderNextHotelRateResults skipped", {
      renderNextHotelRateResultsSource,
      reason: "allResultsRendered",
      renderedHotelRateResultsCount,
      allHotelRateResultsCount: allHotelRateResults.length
    });
    return;
  }

  isRenderingNextHotelRateResults = true;

  try {
    const previousRenderedHotelRateResultsCount =
      renderedHotelRateResultsCount;

    renderedHotelRateResultsCount = Math.min(
      renderedHotelRateResultsCount + HOTEL_RATE_RESULTS_RENDER_STEP,
      allHotelRateResults.length
    );

    console.log("HOTELS renderNextHotelRateResults", {
      renderNextHotelRateResultsSource,
      previousRenderedHotelRateResultsCount,
      nextRenderedHotelRateResultsCount: renderedHotelRateResultsCount,
      allHotelRateResultsCount: allHotelRateResults.length
    });

    renderHotelRateResults(renderNextHotelRateResultsSource);
  } finally {
    isRenderingNextHotelRateResults = false;
  }
}

function bindHotelRateResultItem($item, itemData) {
  const hotelNameText = $item("#hotelNameText");
  const hotelAddressText = $item("#hotelAddressText");
  const hotelRatingText = $item("#hotelRatingText");
  const beforeCurrentPriceText = $item("#beforeCurrentPriceText");
  const currentPriceText = $item("#currentPriceText");
  const currentPriceNoteText = $item("#currentPriceNoteText");
  const rateNameText = $item("#rateNameText");
  const rateBoardNameText = $item("#rateBoardNameText");
  const itemPointText = $item("#itemPointText");
  const itemGreenPointEarningRateText = $item(
    "#itemGreenPointEarningRateText"
  );
  const hotelMainImage = $item("#hotelMainImage");
  const hotelAvailabilityButton = $item("#hotelAvailabilityButton");
  const hotelRateResultCard = $item("#hotelRateResultCard");

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
  const normalizedRateName = normalizeText(itemData?.rateName);
  const normalizedRateBoardName = normalizeText(itemData?.rateBoardName);
  const normalizedItemPoint = Number(itemData?.itemPoint);
  const normalizedItemGreenPointEarningRate = Number(
    itemData?.itemGreenPointEarningRate
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

  if (!normalizedRateName) {
    rateNameText.collapse();
  } else {
    rateNameText.text = normalizedRateName;
    rateNameText.expand();
  }

  if (!normalizedRateBoardName) {
    rateBoardNameText.collapse();
  } else {
    rateBoardNameText.text = normalizedRateBoardName;
    rateBoardNameText.expand();
  }

  if (!Number.isFinite(normalizedItemPoint)) {
    itemPointText.collapse();
  } else {
    itemPointText.text = String(normalizedItemPoint);
    itemPointText.expand();
  }

  if (!Number.isFinite(normalizedItemGreenPointEarningRate)) {
    itemGreenPointEarningRateText.collapse();
  } else {
    itemGreenPointEarningRateText.text = String(
      normalizedItemGreenPointEarningRate
    );
    itemGreenPointEarningRateText.expand();
  }

  if (!normalizedHotelMainImage) {
    hotelMainImage.collapse();
  } else {
    hotelMainImage.src = normalizedHotelMainImage;
    hotelMainImage.expand();
  }

  hotelAvailabilityButton.label = "See availability";
  hotelAvailabilityButton.expand();

  hotelRateResultCard.expand();
  hotelRateResultCard.onClick(() => {
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
    ...JSON.parse(
      session.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY) || "{}"
    ),
    ...wixLocationFrontend.query,
    ...runtimeSearchFlowContextQuery
  })}`);
}

function renderNoResultsState() {
  const hotelRateResultsRepeater = $w("#hotelRateResultsRepeater");
  const loadMoreHotelRateResultsButton = $w(
    "#loadMoreHotelRateResultsButton"
  );
  const noResultsBox = $w("#noResultsBox");

  hotelRateResultsRepeater.data = [];
  hotelRateResultsRepeater.collapse();

  loadMoreHotelRateResultsButton.collapse();

  noResultsBox.expand();

  console.log("HOTELS renderNoResultsState", {
    allHotelRateResultsCount: allHotelRateResults.length,
    renderedHotelRateResultsCount
  });
}

function hideNoResultsState() {
  const noResultsBox = $w("#noResultsBox");

  noResultsBox.collapse();
}

function syncHotelRateResultsProgressiveLoadingButton() {
  const loadMoreHotelRateResultsButton = $w(
    "#loadMoreHotelRateResultsButton"
  );

  if (renderedHotelRateResultsCount >= allHotelRateResults.length) {
    loadMoreHotelRateResultsButton.collapse();
    return;
  }

  loadMoreHotelRateResultsButton.label = `Load More (${
    allHotelRateResults.length - renderedHotelRateResultsCount
  } left)`;

  loadMoreHotelRateResultsButton.expand();
}

function buildRepeaterId(hotelId) {
  const safeHotelId = normalizeText(hotelId)
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, 40);

  if (!safeHotelId) {
    throw new Error("hotelId is required to build hotel rate repeater item id.");
  }

  return safeHotelId;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
