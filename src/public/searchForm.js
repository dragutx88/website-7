import wixLocationFrontend from "wix-location-frontend";
import { searchPlaces } from "backend/liteApi.web";

const CHILD_AGE_DROPDOWN_COUNT = 10;
const OCCUPANCY_MIN_ADULTS = 1;
const OCCUPANCY_MAX_ADULTS = 20;
const OCCUPANCY_MIN_CHILDREN = 0;
const OCCUPANCY_MAX_CHILDREN = 10;

const DEFAULT_AUTOCOMPLETE_MIN_CHARS = 2;
const DEFAULT_AUTOCOMPLETE_DEBOUNCE_MS = 350;

const DEFAULT_OCCUPANCY_STATE = Object.freeze({
  adults: 2,
  children: 0,
  childAges: []
});

const CHILD_AGE_OPTIONS = [
  { label: "Select age", value: "" },
  { label: "Under 1", value: "0" },
  ...Array.from({ length: 17 }, (_, index) => {
    const age = String(index + 1);
    return { label: age, value: age };
  })
];

export function initSearchForm(options = {}) {
  const config = buildControllerConfig(options);

  const {
    $w,
    debug,
    autocompleteMinChars,
    autocompleteDebounceMs
  } = config;

  const state = {
    searchMode: {
      mode: "destination",
      selectedDestinationPlaceId: null
    },
    dateSelection: {
      checkIn: null,
      checkOut: null
    },
    occupancy: cloneOccupancyState(DEFAULT_OCCUPANCY_STATE),
    autocompleteSuggestions: [],
    autocompleteDebounceTimer: null,
    autocompleteRequestToken: 0,
    isSearchInputFocused: false,
    isPointerInsideSuggestions: false,
    suggestionCloseTimer: null,
    isOccupancyInputFocused: false,
    isPointerInsideOccupancy: false,
    occupancyCloseTimer: null
  };

  initializeForm();
  bindSearchModeEvents();
  bindDestinationSuggestionEvents();
  bindOccupancyEvents();
  bindDatePickerEvents();
  bindSubmitEvent();

  const initialState = normalizeSearchFormInitialState(
    wixLocationFrontend.query || {}
  );

  hydrateSearchFormInitialState(initialState);
  syncSearchModeUi();
  syncDateStateFromInputs();
  syncOccupancySummaryInput();
  syncCorrelatedDatePickerBounds();

  function initializeForm() {
    $w("#guestsOccupancySelectionInput").readOnly = true;

    clearSuggestionsPanel();
    collapseSuggestionsBox();
    collapseOccupancyBox();
    renderOccupancyPopover();
    syncOccupancySummaryInput();
  }

  function bindSearchModeEvents() {
    $w("#destinationSearchModeButton").onClick(() => {
      applySearchMode("destination");
    });

    $w("#vibeSearchModeButton").onClick(() => {
      applySearchMode("vibe");
    });

    $w("#searchModeSwitch").onChange(() => {
      const nextMode = $w("#searchModeSwitch").checked ? "vibe" : "destination";
      applySearchMode(nextMode);
    });
  }

  function bindDestinationSuggestionEvents() {
    const searchInput = $w("#searchQueryInput");
    const suggestionsBox = $w("#searchSuggestionsBox");
    const suggestionsRepeater = $w("#searchSuggestionsRepeater");

    searchInput.onInput(() => {
      void handleSearchQueryInput();
    });

    searchInput.onFocus(() => {
      state.isSearchInputFocused = true;
      clearSuggestionCloseTimer();
      void handleSearchQueryInput();
    });

    searchInput.onBlur(() => {
      state.isSearchInputFocused = false;
      queueSuggestionsCloseCheck();
    });

    suggestionsBox.onMouseIn(() => {
      state.isPointerInsideSuggestions = true;
      clearSuggestionCloseTimer();
    });

    suggestionsBox.onMouseOut(() => {
      state.isPointerInsideSuggestions = false;
      queueSuggestionsCloseCheck();
    });

    suggestionsRepeater.onItemReady(($item, itemData) => {
      $item("#searchSuggestionTitleText").text = itemData.title || "";
      $item("#searchSuggestionSubtitleText").text = itemData.subtitle || "";

      $item("#searchSuggestionItem").onClick(() => {
        handleSuggestionSelection(itemData);
      });
    });
  }

  function bindOccupancyEvents() {
    const guestsInput = $w("#guestsOccupancySelectionInput");
    const occupancyBox = $w("#occupancySelectionBox");

    guestsInput.onClick(() => {
      state.isOccupancyInputFocused = true;
      clearOccupancyCloseTimer();
      expandOccupancyBox();
    });

    guestsInput.onFocus(() => {
      state.isOccupancyInputFocused = true;
      clearOccupancyCloseTimer();
      expandOccupancyBox();
    });

    guestsInput.onBlur(() => {
      state.isOccupancyInputFocused = false;
      queueOccupancyCloseCheck();
    });

    occupancyBox.onMouseIn(() => {
      state.isPointerInsideOccupancy = true;
      clearOccupancyCloseTimer();
    });

    occupancyBox.onMouseOut(() => {
      state.isPointerInsideOccupancy = false;
      queueOccupancyCloseCheck();
    });

    $w("#occupancySelectionApplyButton").onClick(() => {
      attemptCloseOccupancyPopover();
    });

    $w("#adultsCounterDecreaseButton").onClick(() => {
      if (state.occupancy.adults > OCCUPANCY_MIN_ADULTS) {
        state.occupancy.adults -= 1;
        renderOccupancyPopover();
      }
    });

    $w("#adultsCounterIncreaseButton").onClick(() => {
      if (state.occupancy.adults < OCCUPANCY_MAX_ADULTS) {
        state.occupancy.adults += 1;
        renderOccupancyPopover();
      }
    });

    $w("#childrenCounterDecreaseButton").onClick(() => {
      if (state.occupancy.children > OCCUPANCY_MIN_CHILDREN) {
        setChildrenCount(state.occupancy.children - 1);
      }
    });

    $w("#childrenCounterIncreaseButton").onClick(() => {
      if (state.occupancy.children < OCCUPANCY_MAX_CHILDREN) {
        setChildrenCount(state.occupancy.children + 1);
      }
    });

    bindChildAgeDropdownEvents();
  }

  function bindChildAgeDropdownEvents() {
    for (let index = 0; index < CHILD_AGE_DROPDOWN_COUNT; index += 1) {
      const dropdown = $w(`#childrenAgeSelectionDropdown${index + 1}`);

      dropdown.options = CHILD_AGE_OPTIONS;

      dropdown.onChange((event) => {
        state.occupancy.childAges[index] = String(event.target.value || "");
      });
    }
  }

  function bindDatePickerEvents() {
    $w("#checkInDatePickerInput").onChange(() => {
      state.dateSelection.checkIn = normalizeDateValue(
        $w("#checkInDatePickerInput").value
      );

      const checkInDate = state.dateSelection.checkIn;
      const currentCheckOut = state.dateSelection.checkOut;

      if (checkInDate && currentCheckOut && currentCheckOut <= checkInDate) {
        state.dateSelection.checkOut = null;
        $w("#checkOutDatePickerInput").value = null;
      }

      syncCorrelatedDatePickerBounds();
    });

    $w("#checkOutDatePickerInput").onChange(() => {
      state.dateSelection.checkOut = normalizeDateValue(
        $w("#checkOutDatePickerInput").value
      );

      syncCorrelatedDatePickerBounds();
    });
  }

  function bindSubmitEvent() {
    $w("#searchFormButton").onClick(() => {
      void runSearch();
    });
  }

  function runSearch() {
    syncDateStateFromInputs();

    const searchQuery = String($w("#searchQueryInput").value || "").trim();
    const { checkIn, checkOut } = getResolvedDateSelection();
    const currentQuery = wixLocationFrontend.query || {};

    if (state.searchMode.mode === "destination") {
      if (!searchQuery) {
        console.warn("Search validation error: Please enter a destination.");
        return null;
      }

      if (!state.searchMode.selectedDestinationPlaceId) {
        console.warn(
          "Search validation error: Please choose a destination from the suggestions list."
        );
        return null;
      }
    }

    if (state.searchMode.mode === "vibe") {
      if (!searchQuery) {
        console.warn("Search validation error: Please describe your ideal stay.");
        return null;
      }
    }

    if (!checkIn) {
      console.warn("Search validation error: Please select a check-in date.");
      return null;
    }

    if (!checkOut) {
      console.warn("Search validation error: Please select a check-out date.");
      return null;
    }

    if (checkOut <= checkIn) {
      console.warn(
        "Search validation error: Check-out date must be after check-in date."
      );
      return null;
    }

    const occupancyValidationError = validateOccupancyState(state.occupancy);
    if (occupancyValidationError) {
      console.warn("Search validation error:", occupancyValidationError);
      expandOccupancyBox();
      return null;
    }

    if (!String(currentQuery.language || "").trim()) {
      console.warn("Search validation error: Missing language query param.");
      return null;
    }

    if (!String(currentQuery.currency || "").trim()) {
      console.warn("Search validation error: Missing currency query param.");
      return null;
    }

    const searchFormButton = $w("#searchFormButton");
    const originalButtonLabel = searchFormButton.label;

    searchFormButton.label = "Searching...";
    searchFormButton.disable();

    try {
      const normalizedSearchForm = normalizeSearchForm();
      const searchFlowContextUrl =
        buildSearchFlowContextUrl(normalizedSearchForm);

      debugLog("normalizedSearchForm", normalizedSearchForm);
      debugLog("searchFlowContextUrl", searchFlowContextUrl);

      navigateSearchFlowContextUrl(searchFlowContextUrl);

      return {
        searchFlowContextUrl
      };
    } finally {
      searchFormButton.label = originalButtonLabel;
      searchFormButton.enable();
    }
  }

  function normalizeSearchFormInitialState(query) {
    const mode = query.mode === "vibe" ? "vibe" : "destination";
    const placeId = String(query.placeId || "").trim() || null;
    const name = String(query.name || "").trim();
    const aiSearch = String(query.aiSearch || "").trim();
    const searchQuery = mode === "vibe" ? aiSearch : name;

    const checkIn = normalizeDateValue(String(query.checkin || "").trim());
    const checkOut = normalizeDateValue(String(query.checkout || "").trim());

    const adultsTokens = String(query.adults || "")
      .split(",")
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    const firstAdultsToken = adultsTokens[0] || "";
    const adults = clampInteger(
      firstAdultsToken,
      DEFAULT_OCCUPANCY_STATE.adults,
      OCCUPANCY_MIN_ADULTS,
      OCCUPANCY_MAX_ADULTS
    );

    const childrenRaw = String(query.children || "").trim();
    let childAges = [];

    if (childrenRaw.includes("_")) {
      childAges = childrenRaw
        .split(",")
        .map((token) => String(token || "").trim())
        .filter(Boolean)
        .map((token) => token.split("_"))
        .filter((parts) => parts.length === 2 && parts[0] === "1")
        .map((parts) => String(parts[1] || "").trim())
        .filter((age) => age !== "");
    } else if (childrenRaw) {
      const normalizedChildrenCount = clampInteger(
        childrenRaw,
        0,
        OCCUPANCY_MIN_CHILDREN,
        OCCUPANCY_MAX_CHILDREN
      );
      childAges = Array.from({ length: normalizedChildrenCount }, () => "");
    }

    const occupancy = normalizeOccupancyState({
      adults,
      children: childAges.length,
      childAges
    });

    return {
      mode,
      placeId,
      searchQuery,
      checkIn,
      checkOut,
      occupancy
    };
  }

  function hydrateSearchFormInitialState(initialState) {
    if (!initialState || typeof initialState !== "object") {
      return;
    }

    const nextMode = initialState.mode === "vibe" ? "vibe" : "destination";
    applySearchMode(nextMode, { resetSelectedDestination: false });

    state.searchMode.selectedDestinationPlaceId = initialState.placeId || null;

    $w("#searchQueryInput").value = String(
      initialState.searchQuery || ""
    ).trim();

    const checkInDate = normalizeDateValue(initialState.checkIn);
    const checkOutDate = normalizeDateValue(initialState.checkOut);

    state.dateSelection.checkIn = checkInDate;
    state.dateSelection.checkOut = checkOutDate;

    $w("#checkInDatePickerInput").value = checkInDate;
    $w("#checkOutDatePickerInput").value = checkOutDate;

    state.occupancy = normalizeOccupancyState(
      initialState.occupancy || DEFAULT_OCCUPANCY_STATE
    );

    renderOccupancyPopover();
    syncOccupancySummaryInput();

    clearSuggestionsPanel();
    collapseSuggestionsBox();
    collapseOccupancyBox();
    syncSearchModeUi();
    syncCorrelatedDatePickerBounds();
  }

  function normalizeSearchForm() {
    const mode = state.searchMode.mode === "vibe" ? "vibe" : "destination";
    const searchQuery = String($w("#searchQueryInput").value || "").trim();
    const { checkIn, checkOut } = getResolvedDateSelection();
    const currentQuery = wixLocationFrontend.query || {};

    const childTokens = state.occupancy.childAges
      .map((age) => String(age || "").trim())
      .filter(Boolean)
      .map((age) => `1_${age}`);

    return {
      mode,
      placeId:
        mode === "destination"
          ? String(state.searchMode.selectedDestinationPlaceId || "").trim()
          : "",
      name: mode === "destination" ? searchQuery : "",
      aiSearch: mode === "vibe" ? searchQuery : "",
      checkin: formatDateForLiteApi(checkIn),
      checkout: formatDateForLiteApi(checkOut),
      rooms: "1",
      adults: String(state.occupancy.adults),
      children: childTokens.join(","),
      sorting: String(currentQuery.sorting || "").trim(),
      language: String(currentQuery.language || "").trim(),
      currency: String(currentQuery.currency || "").trim()
    };
  }

  function buildSearchFlowContextUrl(normalizedSearchForm) {
    const params = new URLSearchParams();

    params.set("mode", normalizedSearchForm.mode);

    if (normalizedSearchForm.mode === "destination") {
      params.set("placeId", normalizedSearchForm.placeId);
      params.set("name", normalizedSearchForm.name);
    }

    if (normalizedSearchForm.mode === "vibe") {
      params.set("aiSearch", normalizedSearchForm.aiSearch);
    }

    params.set("checkin", normalizedSearchForm.checkin);
    params.set("checkout", normalizedSearchForm.checkout);
    params.set("rooms", normalizedSearchForm.rooms);
    params.set("adults", normalizedSearchForm.adults);

    if (normalizedSearchForm.children) {
      params.set("children", normalizedSearchForm.children);
    }

    if (normalizedSearchForm.sorting) {
      params.set("sorting", normalizedSearchForm.sorting);
    }

    params.set("language", normalizedSearchForm.language);
    params.set("currency", normalizedSearchForm.currency);

    return `/hotels?${params.toString()}`;
  }

  function navigateSearchFlowContextUrl(searchFlowContextUrl) {
    if (!searchFlowContextUrl) {
      return;
    }

    wixLocationFrontend.to(searchFlowContextUrl);
  }

  function applySearchMode(mode, options = {}) {
    const { resetSelectedDestination = true } = options;

    state.searchMode.mode = mode === "vibe" ? "vibe" : "destination";

    $w("#searchModeSwitch").checked = state.searchMode.mode === "vibe";

    if (resetSelectedDestination) {
      state.searchMode.selectedDestinationPlaceId = null;
    }

    clearAutocompleteDebounceTimer();
    state.autocompleteSuggestions = [];
    clearSuggestionsPanel();
    collapseSuggestionsBox();
    syncSearchModeUi();
  }

  function syncSearchModeUi() {
    const searchQueryInput = $w("#searchQueryInput");
    const isVibeMode = state.searchMode.mode === "vibe";

    searchQueryInput.placeholder = isVibeMode
      ? "Describe your ideal stay..."
      : "Search for a destination...";
  }

  async function handleSearchQueryInput() {
    if (state.searchMode.mode !== "destination") {
      clearAutocompleteDebounceTimer();
      clearSuggestionsPanel();
      collapseSuggestionsBox();
      return;
    }

    const query = String($w("#searchQueryInput").value || "").trim();

    state.searchMode.selectedDestinationPlaceId = null;
    clearAutocompleteDebounceTimer();

    if (query.length < autocompleteMinChars) {
      state.autocompleteSuggestions = [];
      clearSuggestionsPanel();
      collapseSuggestionsBox();
      return;
    }

    const requestToken = ++state.autocompleteRequestToken;

    state.autocompleteDebounceTimer = setTimeout(async () => {
      try {
        const suggestions = await searchPlaces(query);

        if (requestToken !== state.autocompleteRequestToken) {
          return;
        }

        state.autocompleteSuggestions = Array.isArray(suggestions)
          ? suggestions
          : [];

        renderSuggestionsPanel(state.autocompleteSuggestions);
      } catch (error) {
        console.error("Autocomplete error:", error);
        state.autocompleteSuggestions = [];
        clearSuggestionsPanel();
        collapseSuggestionsBox();
      }
    }, autocompleteDebounceMs);
  }

  function handleSuggestionSelection(itemData) {
    if (!itemData || !itemData.placeId) {
      return;
    }

    state.searchMode.selectedDestinationPlaceId = itemData.placeId;
    $w("#searchQueryInput").value =
      itemData.displayName || itemData.title || "";

    clearSuggestionsPanel();
    collapseSuggestionsBox();
  }

  function renderSuggestionsPanel(suggestions) {
    const repeater = $w("#searchSuggestionsRepeater");

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      clearSuggestionsPanel();
      collapseSuggestionsBox();
      return;
    }

    repeater.data = suggestions.map((item, index) => ({
      _id: `suggestion-${index + 1}`,
      placeId: item.placeId,
      displayName: item.displayName || "",
      formattedAddress: item.formattedAddress || "",
      title: item.displayName || "",
      subtitle: item.formattedAddress || ""
    }));

    expandSuggestionsBox();
  }

  function clearSuggestionsPanel() {
    $w("#searchSuggestionsRepeater").data = [];
  }

  function expandSuggestionsBox() {
    $w("#searchSuggestionsBox").expand();
  }

  function collapseSuggestionsBox() {
    $w("#searchSuggestionsBox").collapse();
  }

  function clearAutocompleteDebounceTimer() {
    if (state.autocompleteDebounceTimer) {
      clearTimeout(state.autocompleteDebounceTimer);
      state.autocompleteDebounceTimer = null;
    }
  }

  function clearSuggestionCloseTimer() {
    if (state.suggestionCloseTimer) {
      clearTimeout(state.suggestionCloseTimer);
      state.suggestionCloseTimer = null;
    }
  }

  function queueSuggestionsCloseCheck() {
    clearSuggestionCloseTimer();

    state.suggestionCloseTimer = setTimeout(() => {
      if (!state.isSearchInputFocused && !state.isPointerInsideSuggestions) {
        collapseSuggestionsBox();
      }
    }, 180);
  }

  function setChildrenCount(nextChildrenCount) {
    const normalizedChildren = Math.max(
      OCCUPANCY_MIN_CHILDREN,
      Math.min(OCCUPANCY_MAX_CHILDREN, Number(nextChildrenCount || 0))
    );

    state.occupancy.children = normalizedChildren;
    state.occupancy.childAges = state.occupancy.childAges.slice(
      0,
      normalizedChildren
    );

    while (state.occupancy.childAges.length < normalizedChildren) {
      state.occupancy.childAges.push("");
    }

    renderOccupancyPopover();
  }

  function renderOccupancyPopover() {
    renderOccupancyCounterTexts();
    renderOccupancyCounterButtonStates();
    renderChildrenAgeDropdowns();
  }

  function renderOccupancyCounterTexts() {
    $w("#adultsCountValueText").text = String(state.occupancy.adults);
    $w("#childrenCountValueText").text = String(state.occupancy.children);
  }

  function renderOccupancyCounterButtonStates() {
    if (state.occupancy.adults <= OCCUPANCY_MIN_ADULTS) {
      $w("#adultsCounterDecreaseButton").disable();
    } else {
      $w("#adultsCounterDecreaseButton").enable();
    }

    if (state.occupancy.adults >= OCCUPANCY_MAX_ADULTS) {
      $w("#adultsCounterIncreaseButton").disable();
    } else {
      $w("#adultsCounterIncreaseButton").enable();
    }

    if (state.occupancy.children <= OCCUPANCY_MIN_CHILDREN) {
      $w("#childrenCounterDecreaseButton").disable();
    } else {
      $w("#childrenCounterDecreaseButton").enable();
    }

    if (state.occupancy.children >= OCCUPANCY_MAX_CHILDREN) {
      $w("#childrenCounterIncreaseButton").disable();
    } else {
      $w("#childrenCounterIncreaseButton").enable();
    }
  }

  function renderChildrenAgeDropdowns() {
    if (state.occupancy.children === 0) {
      $w("#occupancyChildrenAgeSelectionBox").collapse();
    } else {
      $w("#occupancyChildrenAgeSelectionBox").expand();
    }

    for (let index = 0; index < CHILD_AGE_DROPDOWN_COUNT; index += 1) {
      const dropdown = $w(`#childrenAgeSelectionDropdown${index + 1}`);
      const shouldBeVisible = index < state.occupancy.children;

      dropdown.options = CHILD_AGE_OPTIONS;
      dropdown.value = shouldBeVisible
        ? state.occupancy.childAges[index] || ""
        : "";

      if (shouldBeVisible) {
        dropdown.expand();
      } else {
        dropdown.collapse();
      }
    }
  }

  function expandOccupancyBox() {
    $w("#occupancySelectionBox").expand();
  }

  function collapseOccupancyBox() {
    $w("#occupancySelectionBox").collapse();
  }

  function clearOccupancyCloseTimer() {
    if (state.occupancyCloseTimer) {
      clearTimeout(state.occupancyCloseTimer);
      state.occupancyCloseTimer = null;
    }
  }

  function queueOccupancyCloseCheck() {
    clearOccupancyCloseTimer();

    state.occupancyCloseTimer = setTimeout(() => {
      if (!state.isOccupancyInputFocused && !state.isPointerInsideOccupancy) {
        attemptCloseOccupancyPopover();
      }
    }, 180);
  }

  function attemptCloseOccupancyPopover() {
    const occupancyValidationError = validateOccupancyState(state.occupancy);

    if (occupancyValidationError) {
      console.warn("Occupancy validation error:", occupancyValidationError);
      expandOccupancyBox();
      return false;
    }

    syncOccupancySummaryInput();
    collapseOccupancyBox();
    return true;
  }

  function syncOccupancySummaryInput() {
    $w("#guestsOccupancySelectionInput").value =
      buildGuestsSummaryText(state.occupancy);
  }

  function syncDateStateFromInputs() {
    state.dateSelection.checkIn = normalizeDateValue(
      $w("#checkInDatePickerInput").value
    );

    state.dateSelection.checkOut = normalizeDateValue(
      $w("#checkOutDatePickerInput").value
    );
  }

  function getResolvedDateSelection() {
    const checkIn =
      state.dateSelection.checkIn ||
      normalizeDateValue($w("#checkInDatePickerInput").value);

    const checkOut =
      state.dateSelection.checkOut ||
      normalizeDateValue($w("#checkOutDatePickerInput").value);

    return { checkIn, checkOut };
  }

  function syncCorrelatedDatePickerBounds() {
    const checkInDatePickerInput = $w("#checkInDatePickerInput");
    const checkOutDatePickerInput = $w("#checkOutDatePickerInput");

    const { checkIn, checkOut } = getResolvedDateSelection();

    if (checkIn) {
      const checkoutMinDate = new Date(checkIn);
      checkoutMinDate.setDate(checkoutMinDate.getDate() + 1);
      checkOutDatePickerInput.minDate = checkoutMinDate;
    } else {
      checkOutDatePickerInput.minDate = undefined;
    }

    if (checkOut) {
      const checkinMaxDate = new Date(checkOut);
      checkinMaxDate.setDate(checkinMaxDate.getDate() - 1);
      checkInDatePickerInput.maxDate = checkinMaxDate;
    } else {
      checkInDatePickerInput.maxDate = undefined;
    }
  }

  function debugLog(label, value) {
    if (!debug) {
      return;
    }

    console.log(`[searchForm] ${label}`, value);
  }
}

function buildControllerConfig(options = {}) {
  if (!options.$w) {
    throw new Error("initSearchForm requires $w.");
  }

  return {
    $w: options.$w,
    debug: Boolean(options.debug),
    autocompleteMinChars:
      Number(options.autocompleteMinChars) || DEFAULT_AUTOCOMPLETE_MIN_CHARS,
    autocompleteDebounceMs:
      Number(options.autocompleteDebounceMs) || DEFAULT_AUTOCOMPLETE_DEBOUNCE_MS
  };
}

function cloneOccupancyState(occupancy) {
  return {
    adults: occupancy.adults,
    children: occupancy.children,
    childAges: [...occupancy.childAges]
  };
}

function clampInteger(value, fallback, minValue, maxValue) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const integer = Math.floor(parsed);
  return Math.max(minValue, Math.min(maxValue, integer));
}

function buildGuestsSummaryText(occupancy) {
  const normalized = normalizeOccupancyState(occupancy);

  const adultsText =
    normalized.adults === 1 ? "1 Adult" : `${normalized.adults} Adults`;

  const childrenText =
    normalized.children === 1 ? "1 Child" : `${normalized.children} Children`;

  const roomText = "1 Room";

  if (normalized.children === 0) {
    return `${adultsText}, ${roomText}`;
  }

  return `${adultsText}, ${childrenText}, ${roomText}`;
}

function normalizeOccupancyState(data) {
  const adults = clampInteger(
    data?.adults,
    2,
    OCCUPANCY_MIN_ADULTS,
    OCCUPANCY_MAX_ADULTS
  );

  const children = clampInteger(
    data?.children,
    0,
    OCCUPANCY_MIN_CHILDREN,
    OCCUPANCY_MAX_CHILDREN
  );

  let childAges = Array.isArray(data?.childAges) ? [...data.childAges] : [];
  childAges = childAges.slice(0, children);

  while (childAges.length < children) {
    childAges.push("");
  }

  return {
    adults,
    children,
    childAges
  };
}

function validateOccupancyState(occupancy) {
  const normalized = normalizeOccupancyState(occupancy);

  if (normalized.adults < OCCUPANCY_MIN_ADULTS) {
    return "At least 1 adult is required.";
  }

  if (normalized.adults > OCCUPANCY_MAX_ADULTS) {
    return `Adults cannot exceed ${OCCUPANCY_MAX_ADULTS}.`;
  }

  if (normalized.children < OCCUPANCY_MIN_CHILDREN) {
    return "Children count cannot be negative.";
  }

  if (normalized.children > OCCUPANCY_MAX_CHILDREN) {
    return `Children cannot exceed ${OCCUPANCY_MAX_CHILDREN}.`;
  }

  if (normalized.children > 0) {
    for (let index = 0; index < normalized.children; index += 1) {
      const age = normalized.childAges[index];

      if (age === "" || age === null || age === undefined) {
        return "Please select an age for each child.";
      }
    }
  }

  return "";
}

function formatDateForLiteApi(dateValue) {
  const normalizedDate = normalizeDateValue(dateValue);

  if (!normalizedDate) {
    return "";
  }

  const year = normalizedDate.getFullYear();
  const month = String(normalizedDate.getMonth() + 1).padStart(2, "0");
  const day = String(normalizedDate.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeDateValue(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const dateFromParts = new Date(year, month - 1, day);

    if (!Number.isNaN(dateFromParts.getTime())) {
      return dateFromParts;
    }
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}
