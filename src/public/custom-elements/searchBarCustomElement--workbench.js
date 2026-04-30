const LITEAPI_SEARCH_BAR_SDK_URL = "https://components.liteapi.travel/v1.0/sdk.umd.js";
const ELEMENT_TAG_NAME = "liteapi-search-bar-element";
const WHITELABEL_URL = "https://ozvia.travel/?language=en&currency=TRY";
const PRIMARY_COLOR = "#7057F0";
const SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY = "searchFlowContextQueryStringify";

let sdkLoadPromise = null;

function loadLiteApiSdkOnce() {
  if (window.LiteAPI?.SearchBar?.create) return Promise.resolve(window.LiteAPI);
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = LITEAPI_SEARCH_BAR_SDK_URL;
    script.async = true;
    script.onload = () => {
      console.log("[LITEAPI SEARCHBAR] sdk loaded");
      window.LiteAPI?.SearchBar?.create ? resolve(window.LiteAPI) : reject(new Error("LiteAPI.SearchBar.create is missing."));
    };
    script.onerror = () => reject(new Error("LiteAPI SearchBar SDK failed to load."));
    document.head.appendChild(script);
  });

  return sdkLoadPromise;
}

class LiteApiSearchBarElement extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div id="liteapi-searchbar-target"></div>`;

    const whiteLabelUrl = new URL(WHITELABEL_URL);

    loadLiteApiSdkOnce().then((LiteAPI) => {
      LiteAPI.init({
        domain: whiteLabelUrl.hostname,
        deepLinkParams: whiteLabelUrl.searchParams.toString()
      });

      LiteAPI.SearchBar.create({
        selector: "#liteapi-searchbar-target",
        primaryColor: PRIMARY_COLOR,
        onSearchClick: (searchData) => {
          console.log("[LITEAPI SEARCHBAR] onSearchClick", searchData);

          const occupancies = JSON.parse(atob(String(searchData?.occupancies ?? "").trim()));
          console.log("[LITEAPI SEARCHBAR] occupancies", occupancies);

          const rooms = Array.isArray(occupancies) && occupancies.length ? occupancies : normalizeOccupancies(searchData);
          console.log("[LITEAPI SEARCHBAR] rooms", rooms);

          console.log("[LITEAPI SEARCHBAR] redirect", window.top.location.origin + window.top.location.pathname.replace(/\/?$/, '/') + "hotels");

          window.top.location.assign(
            new URL(
              `hotels?${new URLSearchParams({
                ...Object.fromEntries(new URLSearchParams(window.top.location.search)),
                ...JSON.parse(window.top.sessionStorage.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY) || "{}"),
                mode: "destination",
                placeId: String(searchData?.place?.place_id ?? "").trim(),
                name: String(searchData?.place?.description ?? searchData?.query ?? "").trim(),
                checkin: dateText(searchData?.checkin || searchData?.dates?.start),
                checkout: dateText(searchData?.checkout || searchData?.dates?.end),
                rooms: String(rooms.length || 1),
                adults: rooms.map((r) => String(number(r?.adults, 1))).join(","),
                children: rooms.flatMap((r, i) => (r?.children ?? []).map((age) => `${i + 1}_${number(age, 0)}`)).join(",")
              })}`,
              window.top.location.origin + window.top.location.pathname.replace(/\/?$/, '/')
            ).href
          );
        }
      });

      console.log("[LITEAPI SEARCHBAR] mounted");
    }).catch((error) => console.error("[LITEAPI SEARCHBAR] failed", error));
  }
}

function normalizeOccupancies(searchData) {
  const rooms = number(searchData?.rooms, 1);
  const adults = number(searchData?.adults, 2);
  const childrenCount = number(searchData?.children, 0);
  const result = Array.from({ length: rooms }, (_, i) => ({
    adults: i === 0 ? adults : 1,
    children: i === 0 ? Array.from({ length: childrenCount }, () => 0) : []
  }));
  console.log("[LITEAPI SEARCHBAR] normalizeOccupancies", result);
  return result;
}

function dateText(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

if (!customElements.get(ELEMENT_TAG_NAME)) {
  customElements.define(ELEMENT_TAG_NAME, LiteApiSearchBarElement);
}
