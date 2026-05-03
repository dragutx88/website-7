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
const SEARCH_BAR_DESTINATION_SUGGESTION_TIMEOUT_MS = 1800;
const SEARCH_BAR_DOM_SETTLE_MS = 250;

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
      searchFlowContextValidationResult.searchFlowContextQuery.mode === "destination"
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

    console.log("[SEARCH BAR CUSTOM ELEMENT 2] create hydrate preset", {
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
  console.log("[SEARCH BAR CUSTOM ELEMENT 2] DOM hydrate start", {
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

  console.log("[SEARCH BAR CUSTOM ELEMENT 2] DOM snapshot after SDK render", {
    snapshot: buildSearchBarDomSnapshot(searchBarRoot)
  });

  await hydrateDestinationByDom({
    searchBarRoot,
    searchBarPresetSearchFlowContextQuery
  });

  await hydrateOccupancyByDom({
    searchBarRoot,
    searchBarPresetOccupancies
  });

  await waitForMilliseconds(SEARCH_BAR_DOM_SETTLE_MS);

  console.log("[SEARCH BAR CUSTOM ELEMENT 2] DOM snapshot after DOM hydrate", {
    snapshot: buildSearchBarDomSnapshot(searchBarRoot)
  });
}

function waitForSearchBarDomRoot() {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const resolveIfReady = () => {
      const searchBarRoot = document.getElementById("search-bar");

      if (
        searchBarRoot &&
        searchBarRoot.querySelector(
          "input, textarea, button, select, [role='button'], [role='combobox'], [contenteditable='true']"
        )
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
  searchBarPresetSearchFlowContextQuery
}) {
  const destinationInput = findDestinationInput(searchBarRoot);

  if (!destinationInput) {
    console.warn("[SEARCH BAR CUSTOM ELEMENT 2] DOM destination skipped", {
      reason: "destinationInputNotFound",
      snapshot: buildSearchBarDomSnapshot(searchBarRoot)
    });
    return;
  }

  console.log("[SEARCH BAR CUSTOM ELEMENT 2] DOM destination input found", {
    tagName: destinationInput.tagName,
    type: destinationInput.getAttribute("type"),
    role: destinationInput.getAttribute("role"),
    placeholder: destinationInput.getAttribute("placeholder"),
    value: getElementValue(destinationInput)
  });

  clickElement(destinationInput);
  focusElement(destinationInput);

  setElementValue(
    destinationInput,
    searchBarPresetSearchFlowContextQuery.name
  );

  dispatchTextInputEvents(destinationInput);

  await waitForMilliseconds(SEARCH_BAR_DESTINATION_SUGGESTION_TIMEOUT_MS);

  const destinationSuggestionElement = findDestinationSuggestionElement(
    searchBarRoot,
    searchBarPresetSearchFlowContextQuery
  );

  console.log("[SEARCH BAR CUSTOM ELEMENT 2] DOM destination suggestion lookup", {
    hasDestinationSuggestionElement: Boolean(destinationSuggestionElement),
    suggestionText: destinationSuggestionElement
      ? getElementText(destinationSuggestionElement)
      : "",
    snapshot: buildSearchBarDomSnapshot(searchBarRoot)
  });

  if (!destinationSuggestionElement) {
    return;
  }

  clickElement(destinationSuggestionElement);

  await waitForMilliseconds(SEARCH_BAR_DOM_SETTLE_MS);

  console.log("[SEARCH BAR CUSTOM ELEMENT 2] DOM destination suggestion clicked", {
    placeId: searchBarPresetSearchFlowContextQuery.placeId,
    name: searchBarPresetSearchFlowContextQuery.name,
    suggestionText: getElementText(destinationSuggestionElement)
  });
}

async function hydrateOccupancyByDom({
  searchBarRoot,
  searchBarPresetOccupancies
}) {
  if (!Array.isArray(searchBarPresetOccupancies) || !searchBarPresetOccupancies.length) {
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
    console.warn("[SEARCH BAR CUSTOM ELEMENT 2] DOM occupancy skipped", {
      reason: "occupancyTriggerNotFound",
      desiredRoomCount,
      desiredAdultCount,
      desiredChildrenCount,
      desiredChildrenAges,
      snapshot: buildSearchBarDomSnapshot(searchBarRoot)
    });
    return;
  }

  console.log("[SEARCH BAR CUSTOM ELEMENT 2] DOM occupancy trigger found", {
    triggerText: getElementText(occupancyTriggerElement),
    desiredRoomCount,
    desiredAdultCount,
    desiredChildrenCount,
    desiredChildrenAges
  });

  clickElement(occupancyTriggerElement);

  await waitForMilliseconds(SEARCH_BAR_DOM_SETTLE_MS);

  console.log("[SEARCH BAR CUSTOM ELEMENT 2] DOM occupancy popup snapshot", {
    snapshot: buildSearchBarDomSnapshot(searchBarRoot)
  });

  const roomIncrementClickCount = Math.max(0, desiredRoomCount - 1);
  const assumedAdultCountAfterRoomClicks =
    2 + Math.max(0, desiredRoomCount - 1);
  const adultIncrementClickCount = Math.max(
    0,
    desiredAdultCount - assumedAdultCountAfterRoomClicks
  );
  const childrenIncrementClickCount = desiredChildrenCount;

  clickIncrementButtonByLabel({
    searchBarRoot,
    labelWords: ["room", "rooms"],
    clickCount: roomIncrementClickCount,
    logLabel: "rooms"
  });

  await waitForMilliseconds(SEARCH_BAR_DOM_SETTLE_MS);

  clickIncrementButtonByLabel({
    searchBarRoot,
    labelWords: ["adult", "adults"],
    clickCount: adultIncrementClickCount,
    logLabel: "adults"
  });

  await waitForMilliseconds(SEARCH_BAR_DOM_SETTLE_MS);

  clickIncrementButtonByLabel({
    searchBarRoot,
    labelWords: ["child", "children"],
    clickCount: childrenIncrementClickCount,
    logLabel: "children"
  });

  await waitForMilliseconds(SEARCH_BAR_DOM_SETTLE_MS);

  setChildrenAgesByDom({
    searchBarRoot,
    desiredChildrenAges
  });

  await waitForMilliseconds(SEARCH_BAR_DOM_SETTLE_MS);

  const applyOccupancyElement = findApplyOccupancyElement(searchBarRoot);

  console.log("[SEARCH BAR CUSTOM ELEMENT 2] DOM occupancy apply lookup", {
    hasApplyOccupancyElement: Boolean(applyOccupancyElement),
    applyText: applyOccupancyElement ? getElementText(applyOccupancyElement) : ""
  });

  if (applyOccupancyElement) {
    clickElement(applyOccupancyElement);
  }

  await waitForMilliseconds(SEARCH_BAR_DOM_SETTLE_MS);

  console.log("[SEARCH BAR CUSTOM ELEMENT 2] DOM occupancy finished", {
    desiredRoomCount,
    desiredAdultCount,
    desiredChildrenCount,
    desiredChildrenAges,
    snapshot: buildSearchBarDomSnapshot(searchBarRoot)
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
      elementText.includes("hotel") ||
      elementText.includes("roma") ||
      elementText.includes("paris")
    );
  });

  return destinationCandidates[0] || candidates[0] || null;
}

function findDestinationSuggestionElement(
  searchBarRoot,
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
    searchBarRoot,
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

      if (candidateText.length > 180) {
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

function clickIncrementButtonByLabel({
  searchBarRoot,
  labelWords,
  clickCount,
  logLabel
}) {
  if (clickCount <= 0) {
    console.log("[SEARCH BAR CUSTOM ELEMENT 2] DOM increment skipped", {
      logLabel,
      clickCount,
      reason: "noClicksRequired"
    });
    return;
  }

  for (let clickIndex = 0; clickIndex < clickCount; clickIndex += 1) {
    const incrementButton = findIncrementButtonByLabel(
      searchBarRoot,
      labelWords
    );

    if (!incrementButton) {
      console.warn("[SEARCH BAR CUSTOM ELEMENT 2] DOM increment failed", {
        logLabel,
        clickIndex,
        clickCount,
        reason: "incrementButtonNotFound",
        snapshot: buildSearchBarDomSnapshot(searchBarRoot)
      });
      return;
    }

    clickElement(incrementButton);

    console.log("[SEARCH BAR CUSTOM ELEMENT 2] DOM increment clicked", {
      logLabel,
      clickIndex: clickIndex + 1,
      clickCount,
      buttonText: getElementText(incrementButton),
      buttonAriaLabel: incrementButton.getAttribute("aria-label")
    });
  }
}

function findIncrementButtonByLabel(searchBarRoot, labelWords) {
  const buttons = getVisibleElements(
    searchBarRoot,
    "button, [role='button']"
  ).filter(isIncrementButtonElement);

  for (const button of buttons) {
    if (hasAncestorText(button, labelWords, searchBarRoot)) {
      return button;
    }
  }

  return buttons[0] || null;
}

function isIncrementButtonElement(element) {
  const elementText = getElementText(element).trim().toLowerCase();
  const ariaLabel = normalizeText(element.getAttribute("aria-label")).toLowerCase();
  const title = normalizeText(element.getAttribute("title")).toLowerCase();
  const className = normalizeText(element.getAttribute("class")).toLowerCase();

  return (
    elementText === "+" ||
    elementText.includes("+") ||
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

function setChildrenAgesByDom({ searchBarRoot, desiredChildrenAges }) {
  if (!desiredChildrenAges.length) {
    console.log("[SEARCH BAR CUSTOM ELEMENT 2] DOM child age skipped", {
      reason: "noChildren"
    });
    return;
  }

  const visibleSelects = getVisibleElements(searchBarRoot, "select");

  console.log("[SEARCH BAR CUSTOM ELEMENT 2] DOM child age select lookup", {
    desiredChildrenAges,
    visibleSelectsCount: visibleSelects.length,
    selectSnapshots: visibleSelects.map((selectElement) => ({
      value: selectElement.value,
      options: Array.from(selectElement.options || []).map((option) => ({
        value: option.value,
        text: option.text
      }))
    }))
  });

  desiredChildrenAges.forEach((desiredChildAge, childAgeIndex) => {
    const selectElement = visibleSelects[childAgeIndex];

    if (!selectElement) {
      console.warn("[SEARCH BAR CUSTOM ELEMENT 2] DOM child age skipped", {
        childAgeIndex,
        desiredChildAge,
        reason: "selectNotFound"
      });
      return;
    }

    const desiredChildAgeText = String(desiredChildAge);
    const matchingOption = Array.from(selectElement.options || []).find(
      (option) =>
        String(option.value) === desiredChildAgeText ||
        normalizeText(option.text) === desiredChildAgeText
    );

    if (!matchingOption) {
      console.warn("[SEARCH BAR CUSTOM ELEMENT 2] DOM child age skipped", {
        childAgeIndex,
        desiredChildAge,
        reason: "matchingOptionNotFound"
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

    console.log("[SEARCH BAR CUSTOM ELEMENT 2] DOM child age selected", {
      childAgeIndex,
      desiredChildAge,
      selectedValue: selectElement.value
    });
  });
}

function findApplyOccupancyElement(searchBarRoot) {
  const candidates = getVisibleElements(
    searchBarRoot,
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

function hasAncestorText(element, labelWords, stopElement) {
  let currentElement = element;

  for (let depth = 0; currentElement && depth < 7; depth += 1) {
    const currentText = getElementText(currentElement).toLowerCase();

    if (labelWords.some((labelWord) => currentText.includes(labelWord))) {
      return true;
    }

    if (currentElement === stopElement) {
      return false;
    }

    currentElement = currentElement.parentElement;
  }

  return false;
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
      .slice(0, 30)
      .map((element, index) => ({
        index,
        tagName: element.tagName,
        role: element.getAttribute("role"),
        ariaLabel: element.getAttribute("aria-label"),
        title: element.getAttribute("title"),
        text: trimLongText(getElementText(element), 120),
        className: trimLongText(element.getAttribute("class") || "", 120)
      })),
    selects: getVisibleElements(searchBarRoot, "select")
      .slice(0, 15)
      .map((element, index) => ({
        index,
        value: element.value,
        optionsCount: element.options ? element.options.length : 0
      })),
    textCandidates: getVisibleElements(
      searchBarRoot,
      "[role='option'], [role='listitem'], li, div, span"
    )
      .map((element) => trimLongText(getElementText(element), 120))
      .filter(Boolean)
      .filter((text, index, allTexts) => allTexts.indexOf(text) === index)
      .slice(0, 40)
  };
}

function getVisibleElements(rootElement, selector) {
  return Array.from(rootElement.querySelectorAll(selector)).filter(isVisibleElement);
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

function dispatchTextInputEvents(element) {
  element.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: getElementValue(element)
    })
  );

  element.dispatchEvent(
    new Event("change", {
      bubbles: true,
      cancelable: true
    })
  );

  element.dispatchEvent(
    new KeyboardEvent("keyup", {
      bubbles: true,
      cancelable: true,
      key: "a"
    })
  );
}

function clickElement(element) {
  element.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      view: window
    })
  );

  element.dispatchEvent(
    new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      view: window
    })
  );

  element.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window
    })
  );
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
