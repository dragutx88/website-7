/* global LiteAPI */

const SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY = "searchFlowContextQueryStringify";

const LITEAPI_SDK_URL = "https://components.liteapi.travel/v1.0/sdk.umd.js";
const LITEAPI_DOMAIN = "ozvia.travel";
const SEARCH_BAR_CUSTOM_ELEMENT_TAG_NAME = "search-bar-custom-element-2";

const DEFAULT_PRIMARY_COLOR = "#7057F0";

const OCCUPANCY_MIN_ADULTS = 1;
const OCCUPANCY_MAX_ADULTS = 20;
const OCCUPANCY_MAX_CHILDREN = 10;

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
      ? buildOccupanciesFromSearchFlowContextQuery(searchBarPresetSearchFlowContextQuery)
      : [];

    const searchBarPresetChildrenAges = searchBarPresetOccupancies.flatMap(
      (occupancy) => occupancy.children || []
    );

    const searchBarPresetTotalAdults = searchBarPresetOccupancies.reduce(
      (sum, occupancy) => sum + number(occupancy.adults, 0),
      0
    );

    const searchBarPresetOccupanciesBase64 = searchBarPresetOccupancies.length
      ? btoa(JSON.stringify(searchBarPresetOccupancies))
      : "";

    console.log("[SEARCH BAR CUSTOM ELEMENT 2] create hydrate preset", {
      hasPreset: Boolean(searchBarPresetSearchFlowContextQuery),
      presetSearchFlowContextQuery: searchBarPresetSearchFlowContextQuery,
      presetOccupancies: searchBarPresetOccupancies,
      presetChildrenAges: searchBarPresetChildrenAges,
      presetTotalAdults: searchBarPresetTotalAdults,
      presetOccupanciesBase64: searchBarPresetOccupanciesBase64
    });

    const script = document.createElement("script");
    script.src = LITEAPI_SDK_URL;

    script.onload = () => {
      console.log("[SEARCH BAR CUSTOM ELEMENT 2] sdk script onload before bare LiteAPI init");

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

              /**
               * Candidate hydrate props:
               * Bu alanların hepsini create aşamasında test ediyoruz.
               * SDK hangi alanları gerçekten iç state'e yakıyorsa onSearchClick raw searchData'da göreceğiz.
               */
              query: searchBarPresetSearchFlowContextQuery.name,
              placeId: searchBarPresetSearchFlowContextQuery.placeId,
              place: {
                place_id: searchBarPresetSearchFlowContextQuery.placeId,
                description: searchBarPresetSearchFlowContextQuery.name
              },
              checkin: searchBarPresetSearchFlowContextQuery.checkin,
              checkout: searchBarPresetSearchFlowContextQuery.checkout,
              dates: {
                start: dateFromLiteApiDateText(searchBarPresetSearchFlowContextQuery.checkin),
                end: dateFromLiteApiDateText(searchBarPresetSearchFlowContextQuery.checkout)
              },
              inputDates: {
                start: dateFromLiteApiDateText(searchBarPresetSearchFlowContextQuery.checkin),
                end: dateFromLiteApiDateText(searchBarPresetSearchFlowContextQuery.checkout)
              },

              rooms: number(searchBarPresetSearchFlowContextQuery.rooms, 1),
              adults: searchBarPresetTotalAdults || 2,
              children: searchBarPresetChildrenAges,
              childrenAges: searchBarPresetChildrenAges,

              inputRooms: number(searchBarPresetSearchFlowContextQuery.rooms, 1),
              inputAdults: searchBarPresetTotalAdults || 2,
              inputChildren: searchBarPresetChildrenAges,
              inputChildrenAges: searchBarPresetChildrenAges,
              inputOccupancies: searchBarPresetOccupanciesBase64,
              occupancies: searchBarPresetOccupanciesBase64,

              labelsOverride: {
                searchAction: "Search",
                placePlaceholderText: searchBarPresetSearchFlowContextQuery.name
              }
            }
          : {}),
        onSearchClick: (searchData) => {
          console.log(
            "[SEARCH BAR CUSTOM ELEMENT 2] onSearchClick raw searchData",
            searchData
          );

          const decodedSdkOccupancies = decodeSdkOccupancies(searchData?.occupancies);

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
              ...Object.fromEntries(new URLSearchParams(window.top.location.search)),
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
    };

    script.onerror = () => {
      console.error("[SEARCH BAR CUSTOM ELEMENT 2] sdk script load failed");
    };

    document.head.appendChild(script);
  }
}

function buildRuntimeSearchFlowContextQueryFromSdkSearchData(
  searchData,
  decodedSdkOccupancies
) {
  const runtimeOccupancies = Array.isArray(decodedSdkOccupancies) &&
    decodedSdkOccupancies.length
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
      children: childrenByRoomNumber.get(roomNumber) || [],
      rooms: 1
    };
  });
}

function buildOccupanciesFromSdkSearchData(searchData) {
  const roomsNumber = number(searchData?.rooms, 1);
  const adultsNumber = number(searchData?.adults, 2);
  const childrenAges = normalizeSdkChildrenAges(searchData?.children);

  return Array.from({ length: Math.max(1, roomsNumber) }, (_, index) => ({
    adults: index === 0 ? adultsNumber : 1,
    children: index === 0 ? childrenAges : [],
    rooms: 1
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

if (!customElements.get(SEARCH_BAR_CUSTOM_ELEMENT_TAG_NAME)) {
  customElements.define(SEARCH_BAR_CUSTOM_ELEMENT_TAG_NAME, SearchBarCustomElement2);
}
