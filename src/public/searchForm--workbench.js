import wixLocationFrontend from "wix-location-frontend";
import { session } from "wix-storage-frontend";
import { searchPlaces } from "backend/liteApi.web";

const SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY =
  "searchFlowContextQueryStringify";

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

  const searchFlowContextQuery = {
    ...wixLocationFrontend.query,
    ...JSON.parse(
      session.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY) || "{}"
    )
  };

  const searchFlowContextValidationResult =
    validateSearchFlowContextQuery(searchFlowContextQuery);

  if (searchFlowContextValidationResult.ok) {
    hydrateSearchFormInitialState(
      normalizeSearchFormInitialState(
        searchFlowContextValidationResult.searchFlowContextQuery
      )
    );
  }

  syncSearchModeUi();
  syncDateStateFromInputs();
  syncOccupancySummaryInput();
  syncCorrelatedDatePickerBounds();

  function initializeForm() {
    $w("#guestsOccupancySelectionInput").readOnly = true;

    $w("#searchModeSwitch").checked = false;
    $w("#searchQueryInput").value = "";
    $w("#checkInDatePickerInput").value = null;
    $w("#checkOutDatePickerInput").value = null;

    $w("#searchSuggestionsRepeater").data = [];
    $w("#searchSuggestionsBox").collapse();
    $w("#occupancySelectionBox").collapse();

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
      $w("#occupancySelectionBox").expand();
    });

    guestsInput.onFocus(() => {
      state.isOccupancyInputFocused = true;
      clearOccupancyCloseTimer();
      $w("#occupancySelectionBox").expand();
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

    const runtimeSearchFlowContextQuery = buildRuntimeSearchFlowContextQuery();
    const searchFlowContextValidationResult =
      validateSearchFlowContextQuery(runtimeSearchFlowContextQuery);

    if (!searchFlowContextValidationResult.ok) {
      console.warn(
        "Search validation error:",
        searchFlowContextValidationResult.searchFlowContextValidationMessage
      );

      if (
        searchFlowContextValidationResult.searchFlowContextValidationArea ===
        "occupancy"
      ) {
        $w("#occupancySelectionBox").expand();
      }

      return null;
    }

    const searchFormButton = $w("#searchFormButton");
    const originalButtonLabel = searchFormButton.label;

    searchFormButton.label = "Searching...";
    searchFormButton.disable();

    try {
      const searchFlowContextUrl = `/hotels?${new URLSearchParams({
        ...wixLocationFrontend.query,
        ...JSON.parse(
          session.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY) || "{}"
        ),
        ...runtimeSearchFlowContextQuery,
        language: "tr",
        currency: "TRY"
      })}`;

      console.log(
        "[searchForm] runtimeSearchFlowContextQuery",
        runtimeSearchFlowContextQuery
      );
      console.log("[searchForm] searchFlowContextUrl", searchFlowContextUrl);

      wixLocationFrontend.to(searchFlowContextUrl);

      return {
        searchFlowContextUrl
      };
    } finally {
      searchFormButton.label = originalButtonLabel;
      searchFormButton.enable();
    }
  }

  function normalizeSearchFormInitialState(searchFlowContextQuery) {
    const mode = searchFlowContextQuery.mode === "vibe" ? "vibe" : "destination";
    const placeId = String(searchFlowContextQuery.placeId || "").trim() || null;
    const name = String(searchFlowContextQuery.name || "").trim();
    const aiSearch = String(searchFlowContextQuery.aiSearch || "").trim();
    const searchQuery = mode === "vibe" ? aiSearch : name;

    const checkIn = normalizeDateValue(
      String(searchFlowContextQuery.checkin || "").trim()
    );
    const checkOut = normalizeDateValue(
      String(searchFlowContextQuery.checkout || "").trim()
    );

    const adultsTokens = String(searchFlowContextQuery.adults || "")
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

    const childrenRaw = String(searchFlowContextQuery.children || "").trim();
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

    $w("#searchSuggestionsRepeater").data = [];
    $w("#searchSuggestionsBox").collapse();
    $w("#occupancySelectionBox").collapse();
    syncSearchModeUi();
    syncCorrelatedDatePickerBounds();
  }

  function buildRuntimeSearchFlowContextQuery() {
    const mode = state.searchMode.mode === "vibe" ? "vibe" : "destination";
    const searchQuery = String($w("#searchQueryInput").value || "").trim();
    const { checkIn, checkOut } = getResolvedDateSelection();

    const searchFlowContextQuery = {
      ...wixLocationFrontend.query,
      ...JSON.parse(
        session.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY) || "{}"
      )
    };

    const children = state.occupancy.childAges
      .slice(0, state.occupancy.children)
      .map((age) => `1_${String(age ?? "").trim()}`)
      .join(",");

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
      children,
      sorting: String(searchFlowContextQuery.sorting || "").trim(),
      language: "tr",
      currency: "TRY"
    };
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
    $w("#searchSuggestionsRepeater").data = [];
    $w("#searchSuggestionsBox").collapse();
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
      $w("#searchSuggestionsRepeater").data = [];
      $w("#searchSuggestionsBox").collapse();
      return;
    }

    const query = String($w("#searchQueryInput").value || "").trim();

    state.searchMode.selectedDestinationPlaceId = null;
    clearAutocompleteDebounceTimer();

    if (query.length < autocompleteMinChars) {
      state.autocompleteSuggestions = [];
      $w("#searchSuggestionsRepeater").data = [];
      $w("#searchSuggestionsBox").collapse();
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
        $w("#searchSuggestionsRepeater").data = [];
        $w("#searchSuggestionsBox").collapse();
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

    $w("#searchSuggestionsRepeater").data = [];
    $w("#searchSuggestionsBox").collapse();
  }

  function renderSuggestionsPanel(suggestions) {
    const repeater = $w("#searchSuggestionsRepeater");

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      $w("#searchSuggestionsRepeater").data = [];
      $w("#searchSuggestionsBox").collapse();
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

    $w("#searchSuggestionsBox").expand();
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
        $w("#searchSuggestionsBox").collapse();
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
    const occupancyValidationMessage = validateOccupancyState(state.occupancy);

    if (occupancyValidationMessage) {
      console.warn("Occupancy validation error:", occupancyValidationMessage);
      $w("#occupancySelectionBox").expand();
      return false;
    }

    syncOccupancySummaryInput();
    $w("#occupancySelectionBox").collapse();
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
  if (!Number.isFinite(roomsNumber) || Math.trunc(roomsNumber) !== roomsNumber) {
    return {
      ok: false,
      searchFlowContextValidationArea: "occupancy",
      searchFlowContextValidationMessage: "Rooms value is invalid."
    };
  }

  if (roomsNumber !== 1) {
    return {
      ok: false,
      searchFlowContextValidationArea: "occupancy",
      searchFlowContextValidationMessage:
        "Only 1 room is supported by this search form."
    };
  }

  const adultTokens = adults
    .split(",")
    .map((adultToken) => String(adultToken || "").trim())
    .filter(Boolean);

  if (adultTokens.length !== 1) {
    return {
      ok: false,
      searchFlowContextValidationArea: "occupancy",
      searchFlowContextValidationMessage: "Adults value is invalid."
    };
  }

  const adultCount = Number(adultTokens[0]);
  if (!Number.isFinite(adultCount) || Math.trunc(adultCount) !== adultCount) {
    return {
      ok: false,
      searchFlowContextValidationArea: "occupancy",
      searchFlowContextValidationMessage: "Adults value is invalid."
    };
  }

  const childAges = [];

  if (children) {
    const childTokens = children
      .split(",")
      .map((childToken) => String(childToken || "").trim());

    if (
      childTokens.length < OCCUPANCY_MIN_CHILDREN ||
      childTokens.length > OCCUPANCY_MAX_CHILDREN
    ) {
      return {
        ok: false,
        searchFlowContextValidationArea: "occupancy",
        searchFlowContextValidationMessage:
          `Children cannot exceed ${OCCUPANCY_MAX_CHILDREN}.`
      };
    }

    for (const childToken of childTokens) {
      const childTokenParts = childToken.split("_");

      if (childTokenParts.length !== 2 || childTokenParts[0] !== "1") {
        return {
          ok: false,
          searchFlowContextValidationArea: "occupancy",
          searchFlowContextValidationMessage:
            "Please select an age for each child."
        };
      }

      const childAge = Number(childTokenParts[1]);

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

      childAges.push(String(childAge));
    }
  }

  const occupancyValidationMessage = validateOccupancyState({
    adults: adultCount,
    children: childAges.length,
    childAges
  });

  if (occupancyValidationMessage) {
    return {
      ok: false,
      searchFlowContextValidationArea: "occupancy",
      searchFlowContextValidationMessage: occupancyValidationMessage
    };
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
      adults: String(adultCount),
      children,
      sorting,
      language,
      currency
    }
  };
}

function buildControllerConfig(options = {}) {
  if (!options.$w) {
    throw new Error("initSearchForm requires $w.");
  }

  return {
    $w: options.$w,
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
  const totalGuests = normalized.adults + normalized.children;
  const guestsText =
    totalGuests === 1 ? "1 Guest" : `${totalGuests} Guests`;

  return `${guestsText}, 1 Room`;
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
