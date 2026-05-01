const SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY = "searchFlowContextQueryStringify";

const LITEAPI_SDK_URL = "https://components.liteapi.travel/v1.0/sdk.umd.js";
const LITEAPI_DOMAIN = "ozvia.travel";
const SEARCH_BAR_CUSTOM_ELEMENT_TAG_NAME = "search-bar-custom-element-2";

const DEFAULT_SEARCH_PLACE_ID = "ChIJYeZuBI9YwokRjMDs_IEyCwo";
const DEFAULT_SEARCH_PLACE_NAME = "New York";
const DEFAULT_CHECKIN_DATE_TEXT = "2026-05-02";
const DEFAULT_CHECKOUT_DATE_TEXT = "2026-05-03";
const DEFAULT_ADULTS = 2;
const DEFAULT_ROOMS = 1;
const DEFAULT_CHILDREN = "";
const DEFAULT_PRIMARY_COLOR = "#7057F0";

let sdkLoadPromise = null;
let searchBarCustomElementInstanceCounter = 0;

function loadLiteApiSdkOnce() {
  if (window.LiteAPI?.SearchBar?.create) {
    return Promise.resolve(window.LiteAPI);
  }

  if (sdkLoadPromise) {
    return sdkLoadPromise;
  }

  sdkLoadPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${LITEAPI_SDK_URL}"]`);

    if (existingScript) {
      existingScript.addEventListener("load", () => {
        window.LiteAPI?.SearchBar?.create
          ? resolve(window.LiteAPI)
          : reject(new Error("LiteAPI.SearchBar.create is missing."));
      });

      existingScript.addEventListener("error", () => {
        reject(new Error("LiteAPI SearchBar SDK failed to load."));
      });

      if (window.LiteAPI?.SearchBar?.create) {
        resolve(window.LiteAPI);
      }

      return;
    }

    const script = document.createElement("script");
    script.src = LITEAPI_SDK_URL;
    script.async = true;

    script.onload = () => {
      console.log("[SEARCH BAR CUSTOM ELEMENT 2] sdk loaded");

      window.LiteAPI?.SearchBar?.create
        ? resolve(window.LiteAPI)
        : reject(new Error("LiteAPI.SearchBar.create is missing."));
    };

    script.onerror = () => {
      reject(new Error("LiteAPI SearchBar SDK failed to load."));
    };

    document.head.appendChild(script);
  });

  return sdkLoadPromise;
}

class SearchBarCustomElement2 extends HTMLElement {
  constructor() {
    super();

    searchBarCustomElementInstanceCounter += 1;

    this._connected = false;
    this._targetElementId = `search-bar-custom-element-2-target-${Date.now()}-${searchBarCustomElementInstanceCounter}`;
  }

  connectedCallback() {
    if (this._connected) {
      return;
    }

    this._connected = true;
    this.innerHTML = `<div id="${this._targetElementId}" style="width: 100%;"></div>`;

    loadLiteApiSdkOnce()
      .then((LiteAPI) => {
        initializeLiteApiSdk(LiteAPI);

        console.log("[SEARCH BAR CUSTOM ELEMENT 2] create props", {
          selector: `#${this._targetElementId}`,
          primaryColor: DEFAULT_PRIMARY_COLOR,
          inputQuery: DEFAULT_SEARCH_PLACE_NAME,
          inputPlaceId: DEFAULT_SEARCH_PLACE_ID,
          inputCheckin: DEFAULT_CHECKIN_DATE_TEXT,
          inputCheckout: DEFAULT_CHECKOUT_DATE_TEXT,
          defaultAdults: DEFAULT_ADULTS,
          defaultRooms: DEFAULT_ROOMS,
          defaultChildren: DEFAULT_CHILDREN,
          openGuestPopup: false,
          isHandlingSearch: false,
          domain: LITEAPI_DOMAIN
        });

        LiteAPI.SearchBar.create({
          selector: `#${this._targetElementId}`,
          primaryColor: DEFAULT_PRIMARY_COLOR,
          inputQuery: DEFAULT_SEARCH_PLACE_NAME,
          inputPlaceId: DEFAULT_SEARCH_PLACE_ID,
          inputCheckin: new Date(`${DEFAULT_CHECKIN_DATE_TEXT}T00:00:00`),
          inputCheckout: new Date(`${DEFAULT_CHECKOUT_DATE_TEXT}T00:00:00`),
          openGuestPopup: false,
          isHandlingSearch: false,
          isSearching: false,
          labelsOverride: {
            placePlaceholder: DEFAULT_SEARCH_PLACE_NAME,
            searchAction: "Search"
          },
          onSearch: (searchData) => {
            console.log("[SEARCH BAR CUSTOM ELEMENT 2] onSearch", searchData);
          },
          onSearchClick: (searchData) => {
            console.log("[SEARCH BAR CUSTOM ELEMENT 2] onSearchClick", searchData);

            const rooms = normalizeOccupancies(searchData);

            console.log("[SEARCH BAR CUSTOM ELEMENT 2] rooms", rooms);

            const searchFlowContextUrl = new URL(
              `hotels?${new URLSearchParams({
                ...Object.fromEntries(new URLSearchParams(window.top.location.search)),
                ...JSON.parse(
                  window.top.sessionStorage.getItem(
                    SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY
                  ) || "{}"
                ),
                mode: "destination",
                placeId: String(
                  searchData?.place?.place_id || DEFAULT_SEARCH_PLACE_ID
                ).trim(),
                name: String(
                  searchData?.place?.description ||
                    searchData?.query ||
                    DEFAULT_SEARCH_PLACE_NAME
                ).trim(),
                checkin: dateText(
                  searchData?.checkin ||
                    searchData?.dates?.start ||
                    DEFAULT_CHECKIN_DATE_TEXT
                ),
                checkout: dateText(
                  searchData?.checkout ||
                    searchData?.dates?.end ||
                    DEFAULT_CHECKOUT_DATE_TEXT
                ),
                rooms: String(rooms.length || DEFAULT_ROOMS),
                adults: rooms
                  .map((room) => String(number(room?.adults, DEFAULT_ADULTS)))
                  .join(","),
                children: rooms
                  .flatMap((room, index) =>
                    (room?.children || []).map((age) => `${index + 1}_${number(age, 0)}`)
                  )
                  .join(","),
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
        });

        console.log("[SEARCH BAR CUSTOM ELEMENT 2] mounted", {
          tagName: SEARCH_BAR_CUSTOM_ELEMENT_TAG_NAME,
          selector: `#${this._targetElementId}`,
          domain: LITEAPI_DOMAIN,
          inputQuery: DEFAULT_SEARCH_PLACE_NAME,
          inputPlaceId: DEFAULT_SEARCH_PLACE_ID,
          inputCheckin: DEFAULT_CHECKIN_DATE_TEXT,
          inputCheckout: DEFAULT_CHECKOUT_DATE_TEXT,
          defaultAdults: DEFAULT_ADULTS,
          defaultRooms: DEFAULT_ROOMS,
          defaultChildren: DEFAULT_CHILDREN
        });
      })
      .catch((error) => {
        console.error("[SEARCH BAR CUSTOM ELEMENT 2] failed", error);
      });
  }
}

function initializeLiteApiSdk(LiteAPI) {
  if (window.__ozviaLiteApiSdkInitialized === true) {
    return;
  }

  LiteAPI.init({
    domain: LITEAPI_DOMAIN
  });

  window.__ozviaLiteApiSdkInitialized = true;
}

function normalizeOccupancies(searchData) {
  const rooms = number(searchData?.rooms, DEFAULT_ROOMS);
  const adults = number(searchData?.adults, DEFAULT_ADULTS);
  const childrenAges = normalizeChildrenAges(searchData?.children);

  return Array.from({ length: Math.max(1, rooms) }, (_, index) => ({
    adults: index === 0 ? adults : 1,
    children: index === 0 ? childrenAges : []
  }));
}

function normalizeChildrenAges(value) {
  if (Array.isArray(value)) {
    return value
      .map((age) => number(age, null))
      .filter((age) => Number.isFinite(age));
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim();

    if (!normalizedValue) {
      return [];
    }

    return normalizedValue
      .split(",")
      .map((childToken) => childToken.trim())
      .filter(Boolean)
      .map((childToken) => {
        if (childToken.includes("_")) {
          return number(childToken.split("_")[1], null);
        }

        return number(childToken, null);
      })
      .filter((age) => Number.isFinite(age));
  }

  const childrenCount = number(value, 0);

  return Array.from({ length: Math.max(0, childrenCount) }, () => 0);
}

function dateText(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value ?? "").trim();

  if (!raw) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = new Date(raw);

  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
}

function number(value, fallback) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

if (!customElements.get(SEARCH_BAR_CUSTOM_ELEMENT_TAG_NAME)) {
  customElements.define(SEARCH_BAR_CUSTOM_ELEMENT_TAG_NAME, SearchBarCustomElement2);
}
