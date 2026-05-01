const SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY = "searchFlowContextQueryStringify";

const LITEAPI_SDK_URL = "https://components.liteapi.travel/v1.0/sdk.umd.js";
const LITEAPI_DOMAIN = "ozvia.travel";
const SEARCH_BAR_CUSTOM_ELEMENT_TAG_NAME = "search-bar-custom-element-2";
const DEFAULT_SEARCH_PLACE_ID = "ChIJYeZuBI9YwokRjMDs_IEyCwo";
const DEFAULT_SEARCH_PLACE_NAME = "New York";
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

        const searchFlowContextQuery = {
          ...Object.fromEntries(new URLSearchParams(window.top.location.search)),
          ...JSON.parse(
            window.top.sessionStorage.getItem(
              SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY
            ) || "{}"
          ),
          mode: "destination",
          placeId: DEFAULT_SEARCH_PLACE_ID,
          name: DEFAULT_SEARCH_PLACE_NAME,
          language: "tr",
          currency: "TRY"
        };

        const inputCheckin = resolveInitialDate(searchFlowContextQuery.checkin, 1);
        const inputCheckout = resolveInitialDate(searchFlowContextQuery.checkout, 2);

        LiteAPI.SearchBar.create({
          selector: `#${this._targetElementId}`,
          primaryColor: DEFAULT_PRIMARY_COLOR,
          inputQuery: String(searchFlowContextQuery.name || DEFAULT_SEARCH_PLACE_NAME).trim(),
          inputPlaceId: String(searchFlowContextQuery.placeId || DEFAULT_SEARCH_PLACE_ID).trim(),
          inputCheckin,
          inputCheckout,
          onSearchClick: (searchData) => {
            console.log("[SEARCH BAR CUSTOM ELEMENT 2] onSearchClick", searchData);

            const rooms = normalizeOccupancies(searchData);

            console.log("[SEARCH BAR CUSTOM ELEMENT 2] rooms", rooms);

            window.top.location.assign(
              new URL(
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
                  checkin: dateText(searchData?.checkin || searchData?.dates?.start || inputCheckin),
                  checkout: dateText(searchData?.checkout || searchData?.dates?.end || inputCheckout),
                  rooms: String(rooms.length || 1),
                  adults: rooms.map((room) => String(number(room?.adults, 1))).join(","),
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
              ).href
            );
          }
        });

        console.log("[SEARCH BAR CUSTOM ELEMENT 2] mounted", {
          tagName: SEARCH_BAR_CUSTOM_ELEMENT_TAG_NAME,
          selector: `#${this._targetElementId}`,
          domain: LITEAPI_DOMAIN,
          inputPlaceId: DEFAULT_SEARCH_PLACE_ID,
          inputQuery: DEFAULT_SEARCH_PLACE_NAME,
          inputCheckin: dateText(inputCheckin),
          inputCheckout: dateText(inputCheckout)
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
  const rooms = number(searchData?.rooms, 1);
  const adults = number(searchData?.adults, 2);
  const childrenAges = normalizeChildrenAges(searchData?.children);

  const normalizedRooms = Array.from({ length: Math.max(1, rooms) }, (_, index) => ({
    adults: index === 0 ? adults : 1,
    children: index === 0 ? childrenAges : []
  }));

  return normalizedRooms;
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

function resolveInitialDate(value, fallbackDaysFromToday) {
  const normalizedValue = dateText(value);

  if (normalizedValue) {
    const parsedDate = new Date(`${normalizedValue}T00:00:00`);

    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }

  const fallbackDate = new Date();
  fallbackDate.setDate(fallbackDate.getDate() + fallbackDaysFromToday);
  fallbackDate.setHours(0, 0, 0, 0);

  return fallbackDate;
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
