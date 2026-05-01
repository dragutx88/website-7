const SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY = "searchFlowContextQueryStringify";

let sdkLoadPromise = null;

function loadLiteApiSdkOnce() {
  if (window.LiteAPI?.SearchBar?.create) return Promise.resolve(window.LiteAPI);
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://components.liteapi.travel/v1.0/sdk.umd.js";
    script.async = true;
    script.onload = () => {
      console.log("[SEARCH BAR CUSTOM ELEMENT] sdk loaded");
      window.LiteAPI?.SearchBar?.create
        ? resolve(window.LiteAPI)
        : reject(new Error("LiteAPI.SearchBar.create is missing."));
    };
    script.onerror = () => reject(new Error("LiteAPI SearchBar SDK failed to load."));
    document.head.appendChild(script);
  });

  return sdkLoadPromise;
}

class SearchBarCustomElement extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div id="search-bar" style="width: 100%;"></div>`;

    loadLiteApiSdkOnce().then((LiteAPI) => {
      LiteAPI.init({
        domain: "ozvia.travel"
      });

      LiteAPI.SearchBar.create({
        selector: "#search-bar",
        primaryColor: "#7057F0",
        onSearchClick: (searchData) => {
          console.log("[SEARCH BAR CUSTOM ELEMENT] onSearchClick", searchData);

          const occupancies = JSON.parse(atob(String(searchData?.occupancies ?? "").trim()));
          console.log("[SEARCH BAR CUSTOM ELEMENT] occupancies", occupancies);

          const rooms = Array.isArray(occupancies) && occupancies.length
            ? occupancies
            : normalizeOccupancies(searchData);

          console.log("[SEARCH BAR CUSTOM ELEMENT] rooms", rooms);

          console.log(
            "[SEARCH BAR CUSTOM ELEMENT] redirect",
            window.top.location.origin +
              window.top.location.pathname.replace(/\/?$/, "/") +
              "hotels"
          );

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
                placeId: String(searchData?.place?.place_id ?? "").trim(),
                name: String(searchData?.place?.description ?? searchData?.query ?? "").trim(),
                checkin: dateText(searchData?.checkin || searchData?.dates?.start),
                checkout: dateText(searchData?.checkout || searchData?.dates?.end),
                rooms: String(rooms.length || 1),
                adults: rooms.map((r) => String(number(r?.adults, 1))).join(","),
                children: rooms
                  .flatMap((r, i) =>
                    (r?.children ?? []).map((age) => `${i + 1}_${number(age, 0)}`)
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

      console.log("[SEARCH BAR CUSTOM ELEMENT] mounted");
    }).catch((error) => console.error("[SEARCH BAR CUSTOM ELEMENT] failed", error));
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

  console.log("[SEARCH BAR CUSTOM ELEMENT] normalizeOccupancies", result);

  return result;
}

function dateText(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

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

if (!customElements.get("search-bar-custom-element")) {
  customElements.define("search-bar-custom-element", SearchBarCustomElement);
}
