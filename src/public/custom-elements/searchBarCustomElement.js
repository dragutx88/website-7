const LITEAPI_SEARCH_BAR_SDK_URL =
  "https://components.liteapi.travel/v1.0/sdk.umd.js";

const ELEMENT_TAG_NAME = "liteapi-search-bar-element";
const WHITELABEL_URL = "https://ozvia.travel/?language=en&currency=TRY";
const PRIMARY_COLOR = "#7057F0";
const SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY =
  "searchFlowContextQueryStringify";

let sdkLoadPromise = null;

function loadLiteApiSdkOnce() {
  if (window.LiteAPI?.SearchBar?.create) {
    return Promise.resolve(window.LiteAPI);
  }

  if (sdkLoadPromise) {
    return sdkLoadPromise;
  }

  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");

    script.src = LITEAPI_SEARCH_BAR_SDK_URL;
    script.async = true;

    script.onload = () => {
      if (window.LiteAPI?.SearchBar?.create) {
        console.log("[LITEAPI SEARCHBAR] sdk loaded");
        resolve(window.LiteAPI);
        return;
      }

      reject(new Error("LiteAPI.SearchBar.create is missing."));
    };

    script.onerror = () => {
      reject(new Error("LiteAPI SearchBar SDK failed to load."));
    };

    document.head.appendChild(script);
  });

  return sdkLoadPromise;
}

class LiteApiSearchBarElement extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div id="liteapi-searchbar-target"></div>`;

    loadLiteApiSdkOnce()
      .then((LiteAPI) => {
        const whiteLabelUrl = new URL(WHITELABEL_URL);

        LiteAPI.init({
          domain: whiteLabelUrl.hostname,
          deepLinkParams: whiteLabelUrl.searchParams.toString()
        });

        LiteAPI.SearchBar.create({
          selector: "#liteapi-searchbar-target",
          primaryColor: PRIMARY_COLOR,
          onSearchClick: (searchData) => {
            console.log("[LITEAPI SEARCHBAR] onSearchClick", searchData);

            const occupancies = decodeOccupancies(searchData?.occupancies);
            const runtimeSearchFlowContextQuery =
              buildRuntimeSearchFlowContextQuery(searchData, occupancies);

            const targetUrl = `/hotels?${new URLSearchParams({
              ...getCurrentUrlQueryObject(),
              ...getSessionSotQueryObject(),
              ...runtimeSearchFlowContextQuery
            })}`;

            console.log("[LITEAPI SEARCHBAR] redirect", {
              occupancies,
              runtimeSearchFlowContextQuery,
              targetUrl
            });

            window.location.assign(targetUrl);
          }
        });

        console.log("[LITEAPI SEARCHBAR] mounted");
      })
      .catch((error) => {
        console.error("[LITEAPI SEARCHBAR] failed", error);
      });
  }
}

function buildRuntimeSearchFlowContextQuery(searchData, occupancies) {
  const placeId = text(searchData?.place?.place_id);
  const name = text(searchData?.place?.description) || text(searchData?.query);
  const checkin = dateText(searchData?.checkin || searchData?.dates?.start);
  const checkout = dateText(searchData?.checkout || searchData?.dates?.end);
  const rooms = Array.isArray(occupancies) && occupancies.length
    ? occupancies
    : normalizeOccupancies(searchData);

  return {
    mode: "destination",
    placeId,
    name,
    checkin,
    checkout,
    rooms: String(rooms.length || 1),
    adults: rooms.map((room) => String(number(room?.adults, 1))).join(","),
    children: rooms
      .flatMap((room, roomIndex) =>
        (Array.isArray(room?.children) ? room.children : []).map(
          (age) => `${roomIndex + 1}_${number(age, 0)}`
        )
      )
      .join(",")
  };
}

function decodeOccupancies(value) {
  try {
    const raw = text(value);
    if (!raw) {
      return [];
    }

    const decoded = JSON.parse(atob(raw));
    return Array.isArray(decoded) ? decoded : [];
  } catch (error) {
    console.error("[LITEAPI SEARCHBAR] occupancies decode failed", error);
    return [];
  }
}

function normalizeOccupancies(searchData) {
  const rooms = number(searchData?.rooms, 1);
  const adults = number(searchData?.adults, 2);
  const childrenCount = number(searchData?.children, 0);

  return Array.from({ length: rooms }, (_, index) => ({
    adults: index === 0 ? adults : 1,
    children: index === 0 ? Array.from({ length: childrenCount }, () => 0) : []
  }));
}

function getCurrentUrlQueryObject() {
  return Object.fromEntries(new URL(window.location.href).searchParams.entries());
}

function getSessionSotQueryObject() {
  try {
    const raw = window.sessionStorage.getItem(
      SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY
    );

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (error) {
    console.error("[LITEAPI SEARCHBAR] session SOT parse failed", error);
    return {};
  }
}

function dateText(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = text(value);
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

function text(value) {
  return String(value ?? "").trim();
}

if (!customElements.get(ELEMENT_TAG_NAME)) {
  customElements.define(ELEMENT_TAG_NAME, LiteApiSearchBarElement);
}
