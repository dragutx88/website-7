/* global LiteAPI */

const SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY =
  "searchFlowContextQueryStringify";

const LITEAPI_SDK_URL = "https://components.liteapi.travel/v1.0/sdk.umd.js";
const LITEAPI_DOMAIN = "ozvia.travel";
const SEARCH_BAR_CUSTOM_ELEMENT_TAG_NAME = "search-bar-custom-element-2";

const DEFAULT_PRIMARY_COLOR = "#7057F0";

const OCCUPANCY_MIN_ADULTS = 1;
const OCCUPANCY_MAX_ADULTS = 20;
const OCCUPANCY_MAX_CHILDREN = 10;

const SEARCH_BAR_DOM_READY_TIMEOUT_MS = 4000;
const SEARCH_BAR_DESTINATION_SUGGESTION_TIMEOUT_MS = 2600;
const SEARCH_BAR_OCCUPANCY_OVERLAY_TIMEOUT_MS = 3200;
const SEARCH_BAR_DOM_SETTLE_MS = 250;
const SEARCH_BAR_TYPE_CHARACTER_SETTLE_MS = 45;
const SEARCH_BAR_COUNTER_CLICK_SETTLE_MS = 160;
const SEARCH_BAR_COUNTER_MAX_CLICKS = 30;
const SEARCH_BAR_ACTIVATION_SETTLE_MS = 220;

class SearchBarCustomElement2 extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div id="search-bar" style="width: 100%"></div>`;

    const searchFlowContextQuery = {
      ...JSON.parse(
        window.top.sessionStorage.getItem(
          SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY
        ) || "{}"
      ),
      ...Object.fromEntries(new URLSearchParams(window.top.location.search))
    };

    console.log(
      "[SEARCH BAR CUSTOM ELEMENT 2] searchFlowContextQuery",
      searchFlowContextQuery
    );

    const searchFlowContextValidationResult =
      validateSearchFlowContextQuery(searchFlowContextQuery);

    console.log(
      "[SEARCH BAR CUSTOM ELEMENT 2] searchFlowContextValidationResult",
      searchFlowContextValidationResult
    );

    const searchBarPresetSearchFlowContextQuery =
      searchFlowContextValidationResult.ok &&
      searchFlowContextValidationResult.searchFlowContextQuery.mode ===
        "destination"
        ? searchFlowContextValidationResult.searchFlowContextQuery
        : null;

    const searchBarPresetOccupancies = searchBarPresetSearchFlowContextQuery
      ? buildOccupanciesFromSearchFlowContextQuery(
          searchBarPresetSearchFlowContextQuery
        )
      : [];

    const searchBarPresetChildrenAges = searchBarPresetOccupancies.flatMap(
      (occupancy) => occupancy.children || []
    );

    const searchBarPresetTotalAdults = searchBarPresetOccupancies.reduce(
      (sum, occupancy) => sum + number(occupancy.adults, 0),
      0
    );

    logJson("[SEARCH BAR CUSTOM ELEMENT 2] create hydrate preset", {
      hasPreset: Boolean(searchBarPresetSearchFlowContextQuery),
      presetSearchFlowContextQuery: searchBarPresetSearchFlowContextQuery,
      presetOccupancies: searchBarPresetOccupancies,
      presetChildrenAges: searchBarPresetChildrenAges,
      presetTotalAdults: searchBarPresetTotalAdults
    });

    const script = document.createElement("script");
    script.src = LITEAPI_SDK_URL;

    script.onload = () => {
      console.log(
        "[SEARCH BAR CUSTOM ELEMENT 2] sdk script onload before bare LiteAPI init"
      );

      LiteAPI.init({
        domain: LITEAPI_DOMAIN
      });

      const searchBarCreatePayload = {
        selector: "#search-bar",
        primaryColor: DEFAULT_PRIMARY_COLOR,
        ...(searchBarPresetSearchFlowContextQuery
          ? {
              inputQuery: searchBarPresetSearchFlowContextQuery.name,
              inputPlaceId: searchBarPresetSearchFlowContextQuery.placeId,
              inputCheckin: dateFromLiteApiDateText(
                searchBarPresetSearchFlowContextQuery.checkin
              ),
              inputCheckout: dateFromLiteApiDateText(
                searchBarPresetSearchFlowContextQuery.checkout
              ),
              labelsOverride: {
                searchAction: "Search",
                placePlaceholderText:
                  searchBarPresetSearchFlowContextQuery.name
              }
            }
          : {}),
        onSearchClick: (searchData) => {
          console.log(
            "[SEARCH BAR CUSTOM ELEMENT 2] onSearchClick raw searchData",
            searchData
          );

          const decodedSdkOccupancies = decodeSdkOccupancies(
            searchData?.occupancies
          );

          console.log(
            "[SEARCH BAR CUSTOM ELEMENT 2] decodedSdkOccupancies from raw SDK data",
            decodedSdkOccupancies
          );

          const runtimeSearchFlowContextQuery =
            buildRuntimeSearchFlowContextQueryFromSdkSearchData(
              searchData,
              decodedSdkOccupancies
            );

          console.log(
            "[SEARCH BAR CUSTOM ELEMENT 2] runtimeSearchFlowContextQuery from raw SDK data",
            runtimeSearchFlowContextQuery
          );

          const runtimeSearchFlowContextValidationResult =
            validateSearchFlowContextQuery(runtimeSearchFlowContextQuery);

          console.log(
            "[SEARCH BAR CUSTOM ELEMENT 2] runtimeSearchFlowContextValidationResult from raw SDK data",
            runtimeSearchFlowContextValidationResult
          );

          if (!runtimeSearchFlowContextValidationResult.ok) {
            console.warn(
              "[SEARCH BAR CUSTOM ELEMENT 2] raw SDK data failed validation; redirect skipped",
              runtimeSearchFlowContextValidationResult
            );
            return;
          }

          window.top.sessionStorage.setItem(
            SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY,
            JSON.stringify({
              ...JSON.parse(
                window.top.sessionStorage.getItem(
                  SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY
                ) || "{}"
              ),
              ...runtimeSearchFlowContextValidationResult.searchFlowContextQuery,
              language: "tr",
              currency: "TRY"
            })
          );

          const searchFlowContextUrl = new URL(
            `hotels?${new URLSearchParams({
              ...Object.fromEntries(
                new URLSearchParams(window.top.location.search)
              ),
              ...JSON.parse(
                window.top.sessionStorage.getItem(
                  SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY
                ) || "{}"
              ),
              ...runtimeSearchFlowContextValidationResult.searchFlowContextQuery,
              language: "tr",
              currency: "TRY"
            })}`,
            window.top.location.origin +
              window.top.location.pathname.replace(/\/?$/, "/")
          ).href;

          console.log("[SEARCH BAR CUSTOM ELEMENT 2] redirect", {
            searchFlowContextUrl
          });

          window.top.location.assign(searchFlowContextUrl);
        }
      };

      console.log("[SEARCH BAR CUSTOM ELEMENT 2] create payload", {
        ...searchBarCreatePayload,
        inputCheckin: searchBarCreatePayload.inputCheckin
          ? formatDateForLiteApi(searchBarCreatePayload.inputCheckin)
          : undefined,
        inputCheckout: searchBarCreatePayload.inputCheckout
          ? formatDateForLiteApi(searchBarCreatePayload.inputCheckout)
          : undefined,
        onSearchClick: "function"
      });

      LiteAPI.SearchBar.create(searchBarCreatePayload);

      if (searchBarPresetSearchFlowContextQuery) {
        void hydrateSearchBarDomAfterCreate({
          searchBarPresetSearchFlowContextQuery,
          searchBarPresetOccupancies
        });
      }
    };

    script.onerror = () => {
      console.error("[SEARCH BAR CUSTOM ELEMENT 2] sdk script load failed");
    };

    document.head.appendChild(script);
  }
}

async function hydrateSearchBarDomAfterCreate({
  searchBarPresetSearchFlowContextQuery,
  searchBarPresetOccupancies
}) {
  logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM hydrate start", {
    searchBarPresetSearchFlowContextQuery,
    searchBarPresetOccupancies
  });

  const searchBarRoot = await waitForSearchBarDomRoot();

  if (!searchBarRoot) {
    console.warn("[SEARCH BAR CUSTOM ELEMENT 2] DOM hydrate skipped", {
      reason: "searchBarRootNotReady"
    });
    return;
  }

  const searchBarOverlayRoot = document.body;

  logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM snapshot after SDK render", {
    mainSnapshot: buildSearchBarDomSnapshot(searchBarRoot),
    overlaySnapshot: buildSearchBarOverlayDomSnapshot(searchBarOverlayRoot)
  });

  await hydrateDestinationByDom({
    searchBarRoot,
    searchBarOverlayRoot,
    searchBarPresetSearchFlowContextQuery
  });

  await hydrateOccupancyByDom({
    searchBarRoot,
    searchBarOverlayRoot,
    searchBarPresetOccupancies
  });

  await waitForMilliseconds(SEARCH_BAR_DOM_SETTLE_MS);

  logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM snapshot after DOM hydrate", {
    mainSnapshot: buildSearchBarDomSnapshot(searchBarRoot),
    overlaySnapshot: buildSearchBarOverlayDomSnapshot(searchBarOverlayRoot)
  });
}

function waitForSearchBarDomRoot() {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const resolveIfReady = () => {
      const searchBarRoot = document.getElementById("search-bar");

      if (
        searchBarRoot &&
        getVisibleElements(
          searchBarRoot,
          "input, textarea, button, select, [role='button'], [role='combobox'], [contenteditable='true']"
        ).length
      ) {
        resolve(searchBarRoot);
        return true;
      }

      if (Date.now() - startedAt >= SEARCH_BAR_DOM_READY_TIMEOUT_MS) {
        resolve(searchBarRoot || null);
        return true;
      }

      return false;
    };

    if (resolveIfReady()) {
      return;
    }

    const mutationObserver = new MutationObserver(() => {
      if (resolveIfReady()) {
        mutationObserver.disconnect();
      }
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      mutationObserver.disconnect();
      resolve(document.getElementById("search-bar") || null);
    }, SEARCH_BAR_DOM_READY_TIMEOUT_MS);
  });
}

async function hydrateDestinationByDom({
  searchBarRoot,
  searchBarOverlayRoot,
  searchBarPresetSearchFlowContextQuery
}) {
  const destinationInput = findDestinationInput(searchBarRoot);

  if (!destinationInput) {
    logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM destination skipped", {
      reason: "destinationInputNotFound",
      mainSnapshot: buildSearchBarDomSnapshot(searchBarRoot),
      overlaySnapshot: buildSearchBarOverlayDomSnapshot(searchBarOverlayRoot)
    });
    return;
  }

  logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM destination input found", {
    tagName: destinationInput.tagName,
    type: destinationInput.getAttribute("type"),
    role: destinationInput.getAttribute("role"),
    placeholder: destinationInput.getAttribute("placeholder"),
    value: getElementValue(destinationInput)
  });

  await activateElementWithPointerSequence(destinationInput);
  focusElement(destinationInput);

  await typeTextLikeUser(
    destinationInput,
    searchBarPresetSearchFlowContextQuery.name
  );

  const destinationSuggestionElement = await waitForDestinationSuggestionElement({
    searchBarOverlayRoot,
    searchBarPresetSearchFlowContextQuery
  });

  logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM destination suggestion lookup", {
    hasDestinationSuggestionElement: Boolean(destinationSuggestionElement),
    suggestionText: destinationSuggestionElement
      ? getElementText(destinationSuggestionElement)
      : "",
    mainSnapshot: buildSearchBarDomSnapshot(searchBarRoot),
    overlaySnapshot: buildSearchBarOverlayDomSnapshot(searchBarOverlayRoot)
  });

  if (!destinationSuggestionElement) {
    await pressKeyboardKey(destinationInput, "ArrowDown");
    await pressKeyboardKey(destinationInput, "Enter");

    logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM destination keyboard fallback", {
      name: searchBarPresetSearchFlowContextQuery.name,
      mainSnapshot: buildSearchBarDomSnapshot(searchBarRoot),
      overlaySnapshot: buildSearchBarOverlayDomSnapshot(searchBarOverlayRoot)
    });

    return;
  }

  await activateElementWithAncestorLadder({
    element: destinationSuggestionElement,
    rootBoundary: searchBarOverlayRoot,
    shouldStop: () => !findDestinationSuggestionElement(
      searchBarOverlayRoot,
      searchBarPresetSearchFlowContextQuery
    ),
    logLabel: "destinationSuggestion"
  });

  await waitForMilliseconds(SEARCH_BAR_DOM_SETTLE_MS);

  logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM destination suggestion clicked", {
    placeId: searchBarPresetSearchFlowContextQuery.placeId,
    name: searchBarPresetSearchFlowContextQuery.name,
    suggestionText: getElementText(destinationSuggestionElement),
    mainSnapshot: buildSearchBarDomSnapshot(searchBarRoot),
    overlaySnapshot: buildSearchBarOverlayDomSnapshot(searchBarOverlayRoot)
  });
}

async function hydrateOccupancyByDom({
  searchBarRoot,
  searchBarOverlayRoot,
  searchBarPresetOccupancies
}) {
  if (
    !Array.isArray(searchBarPresetOccupancies) ||
    !searchBarPresetOccupancies.length
  ) {
    console.log("[SEARCH BAR CUSTOM ELEMENT 2] DOM occupancy skipped", {
      reason: "emptyPresetOccupancies"
    });
    return;
  }

  const desiredRoomCount = searchBarPresetOccupancies.length;
  const desiredAdultCount = searchBarPresetOccupancies.reduce(
    (sum, occupancy) => sum + number(occupancy?.adults, 0),
    0
  );
  const desiredChildrenAges = searchBarPresetOccupancies.flatMap(
    (occupancy) => occupancy?.children || []
  );
  const desiredChildrenCount = desiredChildrenAges.length;

  const occupancyTriggerElement = findOccupancyTriggerElement(searchBarRoot);

  if (!occupancyTriggerElement) {
    logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM occupancy skipped", {
      reason: "occupancyTriggerNotFound",
      desiredRoomCount,
      desiredAdultCount,
      desiredChildrenCount,
      desiredChildrenAges,
      mainSnapshot: buildSearchBarDomSnapshot(searchBarRoot),
      overlaySnapshot: buildSearchBarOverlayDomSnapshot(searchBarOverlayRoot)
    });
    return;
  }

  logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM occupancy trigger found", {
    triggerText: getElementText(occupancyTriggerElement),
    desiredRoomCount,
    desiredAdultCount,
    desiredChildrenCount,
    desiredChildrenAges,
    triggerSnapshot: buildElementSnapshot(occupancyTriggerElement)
  });

  const hasOccupancyOverlay = await openOccupancyOverlayByDom({
    searchBarRoot,
    searchBarOverlayRoot,
    occupancyTriggerElement
  });

  await waitForMilliseconds(SEARCH_BAR_DOM_SETTLE_MS);

  logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM occupancy popup snapshot", {
    hasOccupancyOverlay,
    mainSnapshot: buildSearchBarDomSnapshot(searchBarRoot),
    overlaySnapshot: buildSearchBarOverlayDomSnapshot(searchBarOverlayRoot),
    counterRows: buildCounterRowsSnapshot(searchBarOverlayRoot)
  });

  if (!hasOccupancyOverlay) {
    return;
  }

  await syncCounterRowToValue({
    searchBarRoot: searchBarOverlayRoot,
    rowLabel: "Rooms",
    desiredValue: desiredRoomCount
  });

  await waitForMilliseconds(SEARCH_BAR_DOM_SETTLE_MS);

  await syncCounterRowToValue({
    searchBarRoot: searchBarOverlayRoot,
    rowLabel: "Adults",
    desiredValue: desiredAdultCount
  });

  await waitForMilliseconds(SEARCH_BAR_DOM_SETTLE_MS);

  await syncCounterRowToValue({
    searchBarRoot: searchBarOverlayRoot,
    rowLabel: "Children",
    desiredValue: desiredChildrenCount
  });

  await waitForMilliseconds(SEARCH_BAR_DOM_SETTLE_MS);

  setChildrenAgesByDom({
    searchBarRoot: searchBarOverlayRoot,
    desiredChildrenAges
  });

  await waitForMilliseconds(SEARCH_BAR_DOM_SETTLE_MS);

  const applyOccupancyElement = findApplyOccupancyElement(searchBarOverlayRoot);

  logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM occupancy apply lookup", {
    hasApplyOccupancyElement: Boolean(applyOccupancyElement),
    applyText: applyOccupancyElement ? getElementText(applyOccupancyElement) : "",
    counterRows: buildCounterRowsSnapshot(searchBarOverlayRoot),
    overlaySnapshot: buildSearchBarOverlayDomSnapshot(searchBarOverlayRoot)
  });

  if (applyOccupancyElement) {
    await activateElementWithPointerSequence(applyOccupancyElement);
  } else {
    await activateElementWithPointerSequence(occupancyTriggerElement);
  }

  await waitForMilliseconds(SEARCH_BAR_DOM_SETTLE_MS);

  logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM occupancy finished", {
    desiredRoomCount,
    desiredAdultCount,
    desiredChildrenCount,
    desiredChildrenAges,
    counterRows: buildCounterRowsSnapshot(searchBarOverlayRoot),
    mainSnapshot: buildSearchBarDomSnapshot(searchBarRoot),
    overlaySnapshot: buildSearchBarOverlayDomSnapshot(searchBarOverlayRoot)
  });
}

async function openOccupancyOverlayByDom({
  searchBarRoot,
  searchBarOverlayRoot,
  occupancyTriggerElement
}) {
  const activationCandidates = buildActivationAncestorCandidates({
    element: occupancyTriggerElement,
    rootBoundary: searchBarRoot
  });

  logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM occupancy activation candidates", {
    candidates: activationCandidates.map((candidate, index) => ({
      index,
      snapshot: buildElementSnapshot(candidate)
    }))
  });

  for (const activationCandidate of activationCandidates) {
    await activateElementWithPointerSequence(activationCandidate);
    await waitForMilliseconds(SEARCH_BAR_ACTIVATION_SETTLE_MS);

    if (isOccupancyOverlayOpen(searchBarOverlayRoot)) {
      logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM occupancy opened", {
        openedBy: buildElementSnapshot(activationCandidate),
        overlaySnapshot: buildSearchBarOverlayDomSnapshot(searchBarOverlayRoot)
      });
      return true;
    }
  }

  return false;
}

async function syncCounterRowToValue({
  searchBarRoot,
  rowLabel,
  desiredValue
}) {
  const counterRow = findCounterRowByLabel(searchBarRoot, rowLabel);

  if (!counterRow) {
    logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM counter row not found", {
      rowLabel,
      desiredValue,
      counterRows: buildCounterRowsSnapshot(searchBarRoot),
      overlaySnapshot: buildSearchBarOverlayDomSnapshot(searchBarRoot)
    });
    return;
  }

  logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM counter row found", {
    rowLabel,
    desiredValue,
    rowText: getElementText(counterRow),
    currentValue: getCounterRowCurrentValue(counterRow),
    rowSnapshot: buildCounterRowSnapshot(counterRow)
  });

  for (
    let clickIndex = 0;
    clickIndex < SEARCH_BAR_COUNTER_MAX_CLICKS;
    clickIndex += 1
  ) {
    const currentValue = getCounterRowCurrentValue(counterRow);

    if (!Number.isFinite(currentValue)) {
      logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM counter current value missing", {
        rowLabel,
        desiredValue,
        rowText: getElementText(counterRow),
        rowSnapshot: buildCounterRowSnapshot(counterRow)
      });
      return;
    }

    if (currentValue === desiredValue) {
      logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM counter synced", {
        rowLabel,
        desiredValue,
        currentValue,
        clickIndex
      });
      return;
    }

    const nextButton =
      currentValue < desiredValue
        ? findCounterRowIncrementButton(counterRow)
        : findCounterRowDecrementButton(counterRow);

    if (!nextButton) {
      logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM counter button not found", {
        rowLabel,
        desiredValue,
        currentValue,
        direction: currentValue < desiredValue ? "increment" : "decrement",
        rowSnapshot: buildCounterRowSnapshot(counterRow)
      });
      return;
    }

    await activateElementWithPointerSequence(nextButton);

    logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM counter button clicked", {
      rowLabel,
      desiredValue,
      previousValue: currentValue,
      direction: currentValue < desiredValue ? "increment" : "decrement",
      buttonText: getElementText(nextButton),
      buttonAriaLabel: nextButton.getAttribute("aria-label"),
      clickIndex: clickIndex + 1
    });

    await waitForMilliseconds(SEARCH_BAR_COUNTER_CLICK_SETTLE_MS);
  }

  logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM counter sync max clicks reached", {
    rowLabel,
    desiredValue,
    currentValue: getCounterRowCurrentValue(counterRow),
    rowSnapshot: buildCounterRowSnapshot(counterRow)
  });
}

function waitForDestinationSuggestionElement({
  searchBarOverlayRoot,
  searchBarPresetSearchFlowContextQuery
}) {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const resolveIfReady = () => {
      const destinationSuggestionElement = findDestinationSuggestionElement(
        searchBarOverlayRoot,
        searchBarPresetSearchFlowContextQuery
      );

      if (destinationSuggestionElement) {
        resolve(destinationSuggestionElement);
        return true;
      }

      if (
        Date.now() - startedAt >=
        SEARCH_BAR_DESTINATION_SUGGESTION_TIMEOUT_MS
      ) {
        resolve(null);
        return true;
      }

      return false;
    };

    if (resolveIfReady()) {
      return;
    }

    const mutationObserver = new MutationObserver(() => {
      if (resolveIfReady()) {
        mutationObserver.disconnect();
      }
    });

    mutationObserver.observe(searchBarOverlayRoot, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      mutationObserver.disconnect();
      resolve(null);
    }, SEARCH_BAR_DESTINATION_SUGGESTION_TIMEOUT_MS);
  });
}

function waitForOccupancyOverlayReady(searchBarOverlayRoot) {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const resolveIfReady = () => {
      if (isOccupancyOverlayOpen(searchBarOverlayRoot)) {
        resolve(true);
        return true;
      }

      if (Date.now() - startedAt >= SEARCH_BAR_OCCUPANCY_OVERLAY_TIMEOUT_MS) {
        resolve(false);
        return true;
      }

      return false;
    };

    if (resolveIfReady()) {
      return;
    }

    const mutationObserver = new MutationObserver(() => {
      if (resolveIfReady()) {
        mutationObserver.disconnect();
      }
    });

    mutationObserver.observe(searchBarOverlayRoot, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      mutationObserver.disconnect();
      resolve(false);
    }, SEARCH_BAR_OCCUPANCY_OVERLAY_TIMEOUT_MS);
  });
}

function isOccupancyOverlayOpen(searchBarOverlayRoot) {
  return Boolean(findCounterRowByLabel(searchBarOverlayRoot, "Adults")) &&
    getVisibleElements(searchBarOverlayRoot, "div, span, p, label, button").some(
      (element) => {
        const text = getElementText(element).toLowerCase();

        return (
          text === "children" ||
          text.startsWith("children") ||
          text === "rooms" ||
          text.startsWith("rooms")
        );
      }
    );
}

function findCounterRowByLabel(searchBarRoot, rowLabel) {
  const normalizedRowLabel = rowLabel.toLowerCase();
  const counterControlSelector =
    "button, [role='button'], [aria-label], span, div, svg";

  const labelElements = getVisibleElements(
    searchBarRoot,
    "div, span, p, label, strong, button"
  ).filter((element) => {
    const text = getElementText(element).trim().toLowerCase();

    return text === normalizedRowLabel || text.startsWith(normalizedRowLabel);
  });

  const rowCandidates = [];

  labelElements.forEach((labelElement) => {
    let currentElement = labelElement;

    for (let depth = 0; currentElement && depth < 12; depth += 1) {
      if (currentElement === searchBarRoot) {
        break;
      }

      const currentText = getElementText(currentElement).toLowerCase();
      const counterControls = getVisibleElements(
        currentElement,
        counterControlSelector
      );

      if (
        currentText.includes(normalizedRowLabel) &&
        counterControls.some(isIncrementButtonElement) &&
        counterControls.some(isDecrementButtonElement) &&
        Number.isFinite(getCounterRowCurrentValue(currentElement)) &&
        isLikelySmallControlContainer(currentElement)
      ) {
        rowCandidates.push(currentElement);
      }

      currentElement = currentElement.parentElement;
    }
  });

  if (!rowCandidates.length) {
    getVisibleElements(searchBarRoot, "div, section, li").forEach((element) => {
      const text = getElementText(element).toLowerCase();
      const counterControls = getVisibleElements(
        element,
        counterControlSelector
      );

      if (
        text.includes(normalizedRowLabel) &&
        counterControls.some(isIncrementButtonElement) &&
        counterControls.some(isDecrementButtonElement) &&
        Number.isFinite(getCounterRowCurrentValue(element)) &&
        isLikelySmallControlContainer(element)
      ) {
        rowCandidates.push(element);
      }
    });
  }

  return dedupeElements(rowCandidates).sort(compareElementsByArea)[0] || null;
}

function getCounterRowCurrentValue(counterRow) {
  const numberElements = getVisibleElements(counterRow, "span, div, p, strong")
    .map((element) => ({
      element,
      text: getElementText(element).trim()
    }))
    .filter((item) => /^\d+$/.test(item.text));

  if (numberElements.length) {
    return Number(numberElements.sort(compareElementItemsByArea)[0].text);
  }

  const textMatch = getElementText(counterRow).match(/\b\d+\b/);
  return textMatch ? Number(textMatch[0]) : null;
}

function findCounterRowIncrementButton(counterRow) {
  return (
    getVisibleElements(
      counterRow,
      "button, [role='button'], [aria-label], span, div, svg"
    )
      .filter(isIncrementButtonElement)
      .sort(compareElementsByArea)[0] || null
  );
}

function findCounterRowDecrementButton(counterRow) {
  return (
    getVisibleElements(
      counterRow,
      "button, [role='button'], [aria-label], span, div, svg"
    )
      .filter(isDecrementButtonElement)
      .sort(compareElementsByArea)[0] || null
  );
}

function isIncrementButtonElement(element) {
  const elementText = getElementText(element).trim();
  const ariaLabel = normalizeText(
    element.getAttribute("aria-label")
  ).toLowerCase();
  const title = normalizeText(element.getAttribute("title")).toLowerCase();
  const className = normalizeText(element.getAttribute("class")).toLowerCase();

  return (
    elementText === "+" ||
    ariaLabel.includes("increase") ||
    ariaLabel.includes("increment") ||
    ariaLabel.includes("add") ||
    ariaLabel.includes("plus") ||
    title.includes("increase") ||
    title.includes("increment") ||
    title.includes("add") ||
    title.includes("plus") ||
    className.includes("plus") ||
    className.includes("increase")
  );
}

function isDecrementButtonElement(element) {
  const elementText = getElementText(element).trim();
  const ariaLabel = normalizeText(
    element.getAttribute("aria-label")
  ).toLowerCase();
  const title = normalizeText(element.getAttribute("title")).toLowerCase();
  const className = normalizeText(element.getAttribute("class")).toLowerCase();

  return (
    elementText === "-" ||
    elementText === "−" ||
    ariaLabel.includes("decrease") ||
    ariaLabel.includes("decrement") ||
    ariaLabel.includes("remove") ||
    ariaLabel.includes("minus") ||
    title.includes("decrease") ||
    title.includes("decrement") ||
    title.includes("remove") ||
    title.includes("minus") ||
    className.includes("minus") ||
    className.includes("decrease")
  );
}

function setChildrenAgesByDom({ searchBarRoot, desiredChildrenAges }) {
  if (!desiredChildrenAges.length) {
    console.log("[SEARCH BAR CUSTOM ELEMENT 2] DOM child age skipped", {
      reason: "noChildren"
    });
    return;
  }

  const visibleSelects = getVisibleElements(searchBarRoot, "select");

  logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM child age select lookup", {
    desiredChildrenAges,
    visibleSelectsCount: visibleSelects.length,
    selectSnapshots: visibleSelects.map((selectElement, index) => ({
      index,
      value: selectElement.value,
      rectangle: getElementRectangle(selectElement),
      options: Array.from(selectElement.options || []).map((option) => ({
        value: option.value,
        text: option.text
      }))
    }))
  });

  desiredChildrenAges.forEach((desiredChildAge, childAgeIndex) => {
    const selectElement = visibleSelects[childAgeIndex];

    if (!selectElement) {
      logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM child age skipped", {
        childAgeIndex,
        desiredChildAge,
        reason: "selectNotFound"
      });
      return;
    }

    const desiredChildAgeText = String(desiredChildAge);
    const matchingOption = Array.from(selectElement.options || []).find(
      (option) => {
        const optionValue = String(option.value || "").trim();
        const optionText = normalizeText(option.text).toLowerCase();

        return (
          optionValue === desiredChildAgeText ||
          optionText === desiredChildAgeText ||
          optionText.startsWith(`${desiredChildAgeText} `) ||
          optionText.includes(`${desiredChildAgeText} year`)
        );
      }
    );

    if (!matchingOption) {
      logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM child age skipped", {
        childAgeIndex,
        desiredChildAge,
        reason: "matchingOptionNotFound",
        options: Array.from(selectElement.options || []).map((option) => ({
          value: option.value,
          text: option.text
        }))
      });
      return;
    }

    selectElement.value = matchingOption.value;
    selectElement.dispatchEvent(
      new Event("change", {
        bubbles: true,
        cancelable: true
      })
    );

    selectElement.dispatchEvent(
      new Event("input", {
        bubbles: true,
        cancelable: true
      })
    );

    logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM child age selected", {
      childAgeIndex,
      desiredChildAge,
      selectedValue: selectElement.value,
      selectedText: matchingOption.text
    });
  });
}

function findDestinationInput(searchBarRoot) {
  const candidates = getVisibleElements(
    searchBarRoot,
    "input, textarea, [role='combobox'], [contenteditable='true']"
  );

  const destinationCandidates = candidates.filter((candidate) => {
    const elementText = [
      getElementValue(candidate),
      getElementText(candidate),
      candidate.getAttribute("placeholder"),
      candidate.getAttribute("aria-label"),
      candidate.getAttribute("name"),
      candidate.getAttribute("type")
    ]
      .join(" ")
      .toLowerCase();

    return (
      elementText.includes("destination") ||
      elementText.includes("search") ||
      elementText.includes("place") ||
      elementText.includes("city") ||
      elementText.includes("hotel")
    );
  });

  return destinationCandidates[0] || candidates[0] || null;
}

function findDestinationSuggestionElement(
  searchBarOverlayRoot,
  searchBarPresetSearchFlowContextQuery
) {
  const normalizedSearchName = normalizeText(
    searchBarPresetSearchFlowContextQuery?.name
  ).toLowerCase();

  if (!normalizedSearchName) {
    return null;
  }

  const firstSearchToken = normalizedSearchName
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)[0];

  const candidates = getVisibleElements(
    searchBarOverlayRoot,
    "[role='option'], [role='listitem'], li, button, div, span, a"
  )
    .filter((candidate) => {
      const candidateText = getElementText(candidate).toLowerCase();

      if (!candidateText) {
        return false;
      }

      if (isSearchSubmitElement(candidate)) {
        return false;
      }

      if (!isLikelySearchBarOverlayCandidate(candidate)) {
        return false;
      }

      return (
        candidateText.includes(normalizedSearchName) ||
        (firstSearchToken && candidateText.includes(firstSearchToken))
      );
    })
    .sort((leftCandidate, rightCandidate) => {
      const leftRoleScore = getSuggestionRoleScore(leftCandidate);
      const rightRoleScore = getSuggestionRoleScore(rightCandidate);

      if (leftRoleScore !== rightRoleScore) {
        return rightRoleScore - leftRoleScore;
      }

      return (
        getElementText(leftCandidate).length -
        getElementText(rightCandidate).length
      );
    });

  return candidates[0] || null;
}

function getSuggestionRoleScore(element) {
  const role = normalizeText(element.getAttribute("role")).toLowerCase();
  const tagName = normalizeText(element.tagName).toLowerCase();

  if (role === "option") {
    return 4;
  }

  if (role === "listitem") {
    return 3;
  }

  if (tagName === "li") {
    return 2;
  }

  if (tagName === "button" || tagName === "a") {
    return 1;
  }

  return 0;
}

function findOccupancyTriggerElement(searchBarRoot) {
  const candidates = getVisibleElements(
    searchBarRoot,
    "button, input, [role='button'], [role='combobox'], div, span"
  )
    .filter((candidate) => {
      const candidateText = [
        getElementText(candidate),
        getElementValue(candidate),
        candidate.getAttribute("aria-label"),
        candidate.getAttribute("placeholder")
      ]
        .join(" ")
        .toLowerCase();

      return (
        candidateText.includes("adult") ||
        candidateText.includes("guest") ||
        candidateText.includes("room") ||
        candidateText.includes("child")
      );
    })
    .sort((leftCandidate, rightCandidate) => {
      const leftClickableScore = getClickableElementScore(leftCandidate);
      const rightClickableScore = getClickableElementScore(rightCandidate);

      if (leftClickableScore !== rightClickableScore) {
        return rightClickableScore - leftClickableScore;
      }

      return (
        getElementText(leftCandidate).length -
        getElementText(rightCandidate).length
      );
    });

  return candidates[0] || null;
}

function findApplyOccupancyElement(searchBarOverlayRoot) {
  const candidates = getVisibleElements(
    searchBarOverlayRoot,
    "button, [role='button'], a"
  ).filter((candidate) => {
    const candidateText = [
      getElementText(candidate),
      candidate.getAttribute("aria-label"),
      candidate.getAttribute("title")
    ]
      .join(" ")
      .toLowerCase();

    return (
      candidateText.includes("apply") ||
      candidateText.includes("done") ||
      candidateText.includes("ok") ||
      candidateText.includes("close") ||
      candidateText.includes("confirm")
    );
  });

  return candidates[0] || null;
}

function buildSearchBarDomSnapshot(searchBarRoot) {
  return {
    inputs: getVisibleElements(
      searchBarRoot,
      "input, textarea, [role='combobox'], [contenteditable='true']"
    )
      .slice(0, 20)
      .map((element, index) => ({
        index,
        tagName: element.tagName,
        type: element.getAttribute("type"),
        role: element.getAttribute("role"),
        placeholder: element.getAttribute("placeholder"),
        ariaLabel: element.getAttribute("aria-label"),
        value: getElementValue(element),
        text: trimLongText(getElementText(element), 120)
      })),
    buttons: getVisibleElements(searchBarRoot, "button, [role='button'], a")
      .slice(0, 40)
      .map((element, index) => ({
        index,
        tagName: element.tagName,
        role: element.getAttribute("role"),
        ariaLabel: element.getAttribute("aria-label"),
        title: element.getAttribute("title"),
        text: trimLongText(getElementText(element), 120),
        className: trimLongText(element.getAttribute("class") || "", 120),
        parentText: trimLongText(getElementText(element.parentElement), 160)
      })),
    selects: getVisibleElements(searchBarRoot, "select")
      .slice(0, 15)
      .map((element, index) => ({
        index,
        value: element.value,
        optionsCount: element.options ? element.options.length : 0,
        options: Array.from(element.options || [])
          .slice(0, 25)
          .map((option) => ({
            value: option.value,
            text: option.text
          }))
      })),
    counterRows: buildCounterRowsSnapshot(searchBarRoot),
    textCandidates: getVisibleElements(
      searchBarRoot,
      "[role='option'], [role='listitem'], li, div, span"
    )
      .map((element) => trimLongText(getElementText(element), 120))
      .filter(Boolean)
      .filter((text, index, allTexts) => allTexts.indexOf(text) === index)
      .slice(0, 60)
  };
}

function buildSearchBarOverlayDomSnapshot(searchBarOverlayRoot) {
  return {
    counterRows: buildCounterRowsSnapshot(searchBarOverlayRoot),
    selects: getVisibleElements(searchBarOverlayRoot, "select")
      .filter(isLikelySearchBarOverlayCandidate)
      .slice(0, 20)
      .map((element, index) => ({
        index,
        value: element.value,
        rectangle: getElementRectangle(element),
        optionsCount: element.options ? element.options.length : 0,
        options: Array.from(element.options || [])
          .slice(0, 25)
          .map((option) => ({
            value: option.value,
            text: option.text
          }))
      })),
    buttons: getVisibleElements(
      searchBarOverlayRoot,
      "button, [role='button'], [aria-label], a, span, div"
    )
      .filter(isLikelySearchBarOverlayCandidate)
      .filter((element) => {
        const text = [
          getElementText(element),
          element.getAttribute("aria-label"),
          element.getAttribute("title"),
          element.getAttribute("class"),
          getElementText(element.parentElement)
        ]
          .join(" ")
          .toLowerCase();

        return (
          text.includes("adult") ||
          text.includes("children") ||
          text.includes("child") ||
          text.includes("room") ||
          text.includes("apply") ||
          text.includes("done") ||
          text.includes("select age") ||
          text.includes("year") ||
          text.includes("+") ||
          text.includes("−")
        );
      })
      .slice(0, 80)
      .map((element, index) => ({
        index,
        snapshot: buildElementSnapshot(element),
        isIncrement: isIncrementButtonElement(element),
        isDecrement: isDecrementButtonElement(element)
      })),
    textCandidates: getVisibleElements(
      searchBarOverlayRoot,
      "[role='option'], [role='listitem'], li, div, span, label, p"
    )
      .filter(isLikelySearchBarOverlayCandidate)
      .map((element) => trimLongText(getElementText(element), 180))
      .filter(Boolean)
      .filter((text) => {
        const normalizedText = text.toLowerCase();

        return (
          normalizedText.includes("adult") ||
          normalizedText.includes("children") ||
          normalizedText.includes("child") ||
          normalizedText.includes("room") ||
          normalizedText.includes("select age") ||
          normalizedText.includes("years old") ||
          normalizedText.includes("year old") ||
          normalizedText.includes("apply") ||
          normalizedText.includes("done")
        );
      })
      .filter((text, index, allTexts) => allTexts.indexOf(text) === index)
      .slice(0, 80)
  };
}

function buildCounterRowsSnapshot(searchBarRoot) {
  return ["Adults", "Children", "Rooms"].map((rowLabel) => {
    const counterRow = findCounterRowByLabel(searchBarRoot, rowLabel);

    return {
      rowLabel,
      found: Boolean(counterRow),
      ...(counterRow ? buildCounterRowSnapshot(counterRow) : {})
    };
  });
}

function buildCounterRowSnapshot(counterRow) {
  return {
    text: trimLongText(getElementText(counterRow), 200),
    currentValue: getCounterRowCurrentValue(counterRow),
    rectangle: getElementRectangle(counterRow),
    buttons: getVisibleElements(
      counterRow,
      "button, [role='button'], [aria-label], span, div, svg"
    ).map((button, index) => ({
      index,
      snapshot: buildElementSnapshot(button),
      isIncrement: isIncrementButtonElement(button),
      isDecrement: isDecrementButtonElement(button)
    }))
  };
}

function buildElementSnapshot(element) {
  return {
    tagName: element?.tagName || "",
    role: element?.getAttribute?.("role") || null,
    ariaLabel: element?.getAttribute?.("aria-label") || null,
    title: element?.getAttribute?.("title") || null,
    text: trimLongText(getElementText(element), 180),
    className: trimLongText(element?.getAttribute?.("class") || "", 180),
    parentText: trimLongText(getElementText(element?.parentElement), 220),
    rectangle: getElementRectangle(element)
  };
}

function buildActivationAncestorCandidates({ element, rootBoundary }) {
  const candidates = [];
  let currentElement = element;

  for (let depth = 0; currentElement && depth < 8; depth += 1) {
    if (currentElement === rootBoundary.parentElement) {
      break;
    }

    if (
      currentElement instanceof Element &&
      isVisibleElement(currentElement) &&
      !isLikelyWholePageContainer(currentElement)
    ) {
      candidates.push(currentElement);
    }

    if (currentElement === rootBoundary) {
      break;
    }

    currentElement = currentElement.parentElement;
  }

  return dedupeElements(candidates);
}

async function activateElementWithAncestorLadder({
  element,
  rootBoundary,
  shouldStop,
  logLabel
}) {
  const activationCandidates = buildActivationAncestorCandidates({
    element,
    rootBoundary
  });

  logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM activation ladder", {
    logLabel,
    candidates: activationCandidates.map((candidate, index) => ({
      index,
      snapshot: buildElementSnapshot(candidate)
    }))
  });

  for (const activationCandidate of activationCandidates) {
    await activateElementWithPointerSequence(activationCandidate);
    await waitForMilliseconds(SEARCH_BAR_ACTIVATION_SETTLE_MS);

    if (typeof shouldStop === "function" && shouldStop()) {
      logJson("[SEARCH BAR CUSTOM ELEMENT 2] DOM activation ladder stopped", {
        logLabel,
        stoppedBy: buildElementSnapshot(activationCandidate)
      });
      return true;
    }
  }

  return false;
}

async function activateElementWithPointerSequence(element) {
  if (!element) {
    return;
  }

  try {
    if (typeof element.scrollIntoView === "function") {
      element.scrollIntoView({
        block: "center",
        inline: "center"
      });
    }
  } catch {
    // no-op
  }

  const rectangle = element.getBoundingClientRect();
  const clientX = rectangle.left + rectangle.width / 2;
  const clientY = rectangle.top + rectangle.height / 2;

  element.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
      clientX,
      clientY
    })
  );

  element.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY
    })
  );

  if (typeof element.focus === "function") {
    element.focus();
  }

  element.dispatchEvent(
    new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
      clientX,
      clientY
    })
  );

  element.dispatchEvent(
    new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY
    })
  );

  element.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY
    })
  );

  try {
    if (typeof element.click === "function") {
      element.click();
    }
  } catch {
    // no-op
  }

  await waitForMilliseconds(SEARCH_BAR_ACTIVATION_SETTLE_MS);
}

async function typeTextLikeUser(element, text) {
  focusElement(element);

  setElementValue(element, "");
  element.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "deleteContentBackward",
      data: null
    })
  );

  element.dispatchEvent(
    new Event("change", {
      bubbles: true,
      cancelable: true
    })
  );

  await waitForMilliseconds(SEARCH_BAR_TYPE_CHARACTER_SETTLE_MS);

  const normalizedText = String(text || "");

  for (const character of normalizedText) {
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: character
      })
    );

    element.dispatchEvent(
      new KeyboardEvent("keypress", {
        bubbles: true,
        cancelable: true,
        key: character
      })
    );

    setElementValue(element, `${getElementValue(element)}${character}`);

    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: character
      })
    );

    element.dispatchEvent(
      new KeyboardEvent("keyup", {
        bubbles: true,
        cancelable: true,
        key: character
      })
    );

    await waitForMilliseconds(SEARCH_BAR_TYPE_CHARACTER_SETTLE_MS);
  }

  element.dispatchEvent(
    new Event("change", {
      bubbles: true,
      cancelable: true
    })
  );
}

async function pressKeyboardKey(element, key) {
  focusElement(element);

  element.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key
    })
  );

  element.dispatchEvent(
    new KeyboardEvent("keyup", {
      bubbles: true,
      cancelable: true,
      key
    })
  );

  await waitForMilliseconds(SEARCH_BAR_DOM_SETTLE_MS);
}

function getVisibleElements(rootElement, selector) {
  const queryRoots = getQueryRoots(rootElement);
  const elements = [];

  queryRoots.forEach((queryRoot) => {
    try {
      elements.push(...Array.from(queryRoot.querySelectorAll(selector)));
    } catch {
      // no-op
    }
  });

  return dedupeElements(elements).filter(isVisibleElement);
}

function getQueryRoots(rootElement) {
  const roots = [rootElement];

  try {
    Array.from(rootElement.querySelectorAll("*")).forEach((element) => {
      if (element.shadowRoot) {
        roots.push(element.shadowRoot);
      }
    });
  } catch {
    // no-op
  }

  return roots;
}

function isVisibleElement(element) {
  if (!element || !(element instanceof Element)) {
    return false;
  }

  const elementRectangle = element.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(element);

  return (
    elementRectangle.width > 0 &&
    elementRectangle.height > 0 &&
    computedStyle.visibility !== "hidden" &&
    computedStyle.display !== "none" &&
    computedStyle.opacity !== "0"
  );
}

function isLikelyWholePageContainer(element) {
  const rectangle = element.getBoundingClientRect();

  return (
    rectangle.width > window.innerWidth * 0.85 &&
    rectangle.height > window.innerHeight * 0.85
  );
}

function isLikelySmallControlContainer(element) {
  const rectangle = element.getBoundingClientRect();

  return (
    rectangle.width > 0 &&
    rectangle.height > 0 &&
    rectangle.width < Math.max(760, window.innerWidth * 0.75) &&
    rectangle.height < Math.max(420, window.innerHeight * 0.65)
  );
}

function isLikelySearchBarOverlayCandidate(element) {
  const rectangle = element.getBoundingClientRect();
  const text = getElementText(element);

  return (
    rectangle.width > 0 &&
    rectangle.height > 0 &&
    rectangle.width < Math.max(900, window.innerWidth * 0.9) &&
    rectangle.height < Math.max(640, window.innerHeight * 0.8) &&
    text.length < 700
  );
}

function compareElementsByArea(leftElement, rightElement) {
  const leftRectangle = leftElement.getBoundingClientRect();
  const rightRectangle = rightElement.getBoundingClientRect();

  return (
    leftRectangle.width * leftRectangle.height -
    rightRectangle.width * rightRectangle.height
  );
}

function compareElementItemsByArea(leftItem, rightItem) {
  return compareElementsByArea(leftItem.element, rightItem.element);
}

function dedupeElements(elements) {
  return Array.from(new Set(elements));
}

function getClickableElementScore(element) {
  const tagName = normalizeText(element.tagName).toLowerCase();
  const role = normalizeText(element.getAttribute("role")).toLowerCase();

  if (tagName === "button") {
    return 4;
  }

  if (role === "button") {
    return 3;
  }

  if (tagName === "input") {
    return 2;
  }

  return 1;
}

function isSearchSubmitElement(element) {
  const text = [
    getElementText(element),
    element.getAttribute("aria-label"),
    element.getAttribute("title")
  ]
    .join(" ")
    .toLowerCase();

  return text.includes("search") && !text.includes("destination");
}

function getElementValue(element) {
  if (!element) {
    return "";
  }

  if ("value" in element) {
    return String(element.value || "");
  }

  if (element.getAttribute("contenteditable") === "true") {
    return String(element.textContent || "");
  }

  return "";
}

function setElementValue(element, value) {
  const normalizedValue = String(value || "");

  if ("value" in element) {
    if (element instanceof HTMLInputElement) {
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;

      if (valueSetter) {
        valueSetter.call(element, normalizedValue);
      } else {
        element.value = normalizedValue;
      }

      return;
    }

    if (element instanceof HTMLTextAreaElement) {
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;

      if (valueSetter) {
        valueSetter.call(element, normalizedValue);
      } else {
        element.value = normalizedValue;
      }

      return;
    }

    element.value = normalizedValue;
    return;
  }

  if (element.getAttribute("contenteditable") === "true") {
    element.textContent = normalizedValue;
  }
}

function focusElement(element) {
  if (typeof element.focus === "function") {
    element.focus();
  }

  element.dispatchEvent(
    new FocusEvent("focus", {
      bubbles: true,
      cancelable: true
    })
  );
}

function getElementText(element) {
  return normalizeText(element?.innerText || element?.textContent || "");
}

function getElementRectangle(element) {
  if (!element) {
    return null;
  }

  const rectangle = element.getBoundingClientRect();

  return {
    x: Math.round(rectangle.x),
    y: Math.round(rectangle.y),
    width: Math.round(rectangle.width),
    height: Math.round(rectangle.height)
  };
}

function trimLongText(value, maxLength) {
  const normalizedValue = normalizeText(value);

  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, maxLength)}...`;
}

function waitForMilliseconds(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function logJson(label, value) {
  console.log(label, value);

  try {
    console.log(`${label} JSON`, JSON.stringify(value, null, 2));
  } catch (error) {
    console.warn(`${label} JSON stringify failed`, error);
  }
}

function buildRuntimeSearchFlowContextQueryFromSdkSearchData(
  searchData,
  decodedSdkOccupancies
) {
  const runtimeOccupancies =
    Array.isArray(decodedSdkOccupancies) && decodedSdkOccupancies.length
      ? decodedSdkOccupancies
      : buildOccupanciesFromSdkSearchData(searchData);

  return {
    mode: "destination",
    placeId: String(searchData?.place?.place_id || "").trim(),
    name: String(
      searchData?.place?.description ||
        searchData?.query ||
        ""
    ).trim(),
    aiSearch: "",
    checkin: dateText(searchData?.checkin || searchData?.dates?.start),
    checkout: dateText(searchData?.checkout || searchData?.dates?.end),
    rooms: String(runtimeOccupancies.length || number(searchData?.rooms, 1)),
    adults: runtimeOccupancies
      .map((occupancy) => String(number(occupancy?.adults, 1)))
      .join(","),
    children: runtimeOccupancies
      .flatMap((occupancy, occupancyIndex) =>
        (occupancy?.children || []).map(
          (age) => `${occupancyIndex + 1}_${number(age, 0)}`
        )
      )
      .join(","),
    sorting: "",
    language: "tr",
    currency: "TRY"
  };
}

function buildOccupanciesFromSearchFlowContextQuery(searchFlowContextQuery) {
  const roomsNumber = number(searchFlowContextQuery?.rooms, 1);
  const adultTokens = String(searchFlowContextQuery?.adults || "")
    .split(",")
    .map((adultToken) => number(adultToken, 1));

  const childrenByRoomNumber = new Map();

  String(searchFlowContextQuery?.children || "")
    .split(",")
    .map((childToken) => String(childToken || "").trim())
    .filter(Boolean)
    .forEach((childToken) => {
      const [roomNumberText, ageText] = childToken.split("_");
      const roomNumber = number(roomNumberText, 1);
      const age = number(ageText, 0);
      const currentChildrenAges = childrenByRoomNumber.get(roomNumber) || [];

      currentChildrenAges.push(age);
      childrenByRoomNumber.set(roomNumber, currentChildrenAges);
    });

  return Array.from({ length: Math.max(1, roomsNumber) }, (_, index) => {
    const roomNumber = index + 1;

    return {
      adults: number(adultTokens[index], 1),
      children: childrenByRoomNumber.get(roomNumber) || []
    };
  });
}

function buildOccupanciesFromSdkSearchData(searchData) {
  const roomsNumber = number(searchData?.rooms, 1);
  const adultsNumber = number(searchData?.adults, 2);
  const childrenAges = normalizeSdkChildrenAges(searchData?.children);

  return Array.from({ length: Math.max(1, roomsNumber) }, (_, index) => ({
    adults: index === 0 ? adultsNumber : 1,
    children: index === 0 ? childrenAges : []
  }));
}

function normalizeSdkChildrenAges(children) {
  if (Array.isArray(children)) {
    return children
      .map((age) => number(age, null))
      .filter((age) => Number.isFinite(age));
  }

  if (typeof children === "string") {
    return children
      .split(",")
      .map((childToken) => String(childToken || "").trim())
      .filter(Boolean)
      .map((childToken) => {
        if (childToken.includes("_")) {
          return number(childToken.split("_")[1], null);
        }

        return number(childToken, null);
      })
      .filter((age) => Number.isFinite(age));
  }

  const childrenCount = number(children, 0);

  return Array.from({ length: Math.max(0, childrenCount) }, () => 0);
}

function decodeSdkOccupancies(occupancies) {
  const occupanciesText = String(occupancies || "").trim();

  if (!occupanciesText) {
    return [];
  }

  try {
    const decodedOccupancies = JSON.parse(atob(occupanciesText));

    return Array.isArray(decodedOccupancies) ? decodedOccupancies : [];
  } catch (error) {
    console.warn(
      "[SEARCH BAR CUSTOM ELEMENT 2] failed to decode SDK occupancies",
      {
        occupancies,
        error
      }
    );

    return [];
  }
}

function validateSearchFlowContextQuery(searchFlowContextQuery) {
  const mode = String(searchFlowContextQuery?.mode || "").trim();
  const placeId = String(searchFlowContextQuery?.placeId || "").trim();
  const name = String(searchFlowContextQuery?.name || "").trim();
  const aiSearch = String(searchFlowContextQuery?.aiSearch || "").trim();
  const checkin = String(searchFlowContextQuery?.checkin || "").trim();
  const checkout = String(searchFlowContextQuery?.checkout || "").trim();
  const rooms = String(searchFlowContextQuery?.rooms || "").trim();
  const adults = String(searchFlowContextQuery?.adults || "").trim();
  const children = String(searchFlowContextQuery?.children || "").trim();
  const sorting = String(searchFlowContextQuery?.sorting || "").trim();
  const language = String(searchFlowContextQuery?.language || "").trim();
  const currency = String(searchFlowContextQuery?.currency || "").trim();

  if (mode !== "destination" && mode !== "vibe") {
    return {
      ok: false,
      searchFlowContextValidationArea: "mode",
      searchFlowContextValidationMessage: "Unsupported search mode."
    };
  }

  if (mode === "destination" && !name) {
    return {
      ok: false,
      searchFlowContextValidationArea: "destination",
      searchFlowContextValidationMessage: "Please enter a destination."
    };
  }

  if (mode === "destination" && !placeId) {
    return {
      ok: false,
      searchFlowContextValidationArea: "destination",
      searchFlowContextValidationMessage:
        "Please choose a destination from the suggestions list."
    };
  }

  if (mode === "vibe" && !aiSearch) {
    return {
      ok: false,
      searchFlowContextValidationArea: "vibe",
      searchFlowContextValidationMessage: "Please describe your ideal stay."
    };
  }

  const checkinDate = normalizeDateValue(checkin);
  if (!checkinDate) {
    return {
      ok: false,
      searchFlowContextValidationArea: "date",
      searchFlowContextValidationMessage: "Please select a check-in date."
    };
  }

  const checkoutDate = normalizeDateValue(checkout);
  if (!checkoutDate) {
    return {
      ok: false,
      searchFlowContextValidationArea: "date",
      searchFlowContextValidationMessage: "Please select a check-out date."
    };
  }

  if (checkoutDate <= checkinDate) {
    return {
      ok: false,
      searchFlowContextValidationArea: "date",
      searchFlowContextValidationMessage:
        "Check-out date must be after check-in date."
    };
  }

  const roomsNumber = Number(rooms);
  if (
    !Number.isFinite(roomsNumber) ||
    Math.trunc(roomsNumber) !== roomsNumber ||
    roomsNumber < 1
  ) {
    return {
      ok: false,
      searchFlowContextValidationArea: "occupancy",
      searchFlowContextValidationMessage: "Rooms value is invalid."
    };
  }

  const adultTokens = adults
    .split(",")
    .map((adultToken) => String(adultToken || "").trim())
    .filter(Boolean);

  if (adultTokens.length !== roomsNumber) {
    return {
      ok: false,
      searchFlowContextValidationArea: "occupancy",
      searchFlowContextValidationMessage: "Adults value is invalid."
    };
  }

  const normalizedAdultTokens = [];

  for (const adultToken of adultTokens) {
    const adultCount = Number(adultToken);

    if (
      !Number.isFinite(adultCount) ||
      Math.trunc(adultCount) !== adultCount ||
      adultCount < OCCUPANCY_MIN_ADULTS ||
      adultCount > OCCUPANCY_MAX_ADULTS
    ) {
      return {
        ok: false,
        searchFlowContextValidationArea: "occupancy",
        searchFlowContextValidationMessage: "Adults value is invalid."
      };
    }

    normalizedAdultTokens.push(String(adultCount));
  }

  const normalizedChildrenTokens = [];

  if (children) {
    const childTokens = children
      .split(",")
      .map((childToken) => String(childToken || "").trim())
      .filter(Boolean);

    if (childTokens.length > OCCUPANCY_MAX_CHILDREN) {
      return {
        ok: false,
        searchFlowContextValidationArea: "occupancy",
        searchFlowContextValidationMessage:
          `Children cannot exceed ${OCCUPANCY_MAX_CHILDREN}.`
      };
    }

    for (const childToken of childTokens) {
      const childTokenParts = childToken.split("_");

      if (childTokenParts.length !== 2) {
        return {
          ok: false,
          searchFlowContextValidationArea: "occupancy",
          searchFlowContextValidationMessage:
            "Please select an age for each child."
        };
      }

      const childRoomNumber = Number(childTokenParts[0]);
      const childAge = Number(childTokenParts[1]);

      if (
        !Number.isFinite(childRoomNumber) ||
        Math.trunc(childRoomNumber) !== childRoomNumber ||
        childRoomNumber < 1 ||
        childRoomNumber > roomsNumber
      ) {
        return {
          ok: false,
          searchFlowContextValidationArea: "occupancy",
          searchFlowContextValidationMessage:
            "Please select an age for each child."
        };
      }

      if (
        !Number.isFinite(childAge) ||
        Math.trunc(childAge) !== childAge ||
        childAge < 0 ||
        childAge > 17
      ) {
        return {
          ok: false,
          searchFlowContextValidationArea: "occupancy",
          searchFlowContextValidationMessage:
            "Please select an age for each child."
        };
      }

      normalizedChildrenTokens.push(`${childRoomNumber}_${childAge}`);
    }
  }

  if (!language) {
    return {
      ok: false,
      searchFlowContextValidationArea: "language",
      searchFlowContextValidationMessage: "Missing language query param."
    };
  }

  if (!currency) {
    return {
      ok: false,
      searchFlowContextValidationArea: "currency",
      searchFlowContextValidationMessage: "Missing currency query param."
    };
  }

  return {
    ok: true,
    searchFlowContextQuery: {
      mode,
      placeId,
      name,
      aiSearch,
      checkin: formatDateForLiteApi(checkinDate),
      checkout: formatDateForLiteApi(checkoutDate),
      rooms: String(roomsNumber),
      adults: normalizedAdultTokens.join(","),
      children: normalizedChildrenTokens.join(","),
      sorting,
      language,
      currency
    }
  };
}

function normalizeDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const raw = String(value ?? "").trim();

  if (!raw) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map((part) => Number(part));
    const parsedDate = new Date(year, month - 1, day);

    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  const parsedDate = new Date(raw);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return new Date(
    parsedDate.getFullYear(),
    parsedDate.getMonth(),
    parsedDate.getDate()
  );
}

function formatDateForLiteApi(value) {
  const date = normalizeDateValue(value);

  if (!date) {
    return "";
  }

  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function dateFromLiteApiDateText(value) {
  return normalizeDateValue(value);
}

function dateText(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateForLiteApi(value);
  }

  const raw = String(value ?? "").trim();

  if (!raw) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsedDate = normalizeDateValue(raw);

  return parsedDate ? formatDateForLiteApi(parsedDate) : raw;
}

function number(value, fallback) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

if (!customElements.get(SEARCH_BAR_CUSTOM_ELEMENT_TAG_NAME)) {
  customElements.define(
    SEARCH_BAR_CUSTOM_ELEMENT_TAG_NAME,
    SearchBarCustomElement2
  );
}
