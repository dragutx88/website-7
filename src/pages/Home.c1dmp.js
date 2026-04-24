import wixLocationFrontend from "wix-location-frontend";
import { session } from "wix-storage-frontend";
import { searchPlaces } from "backend/liteApi.web";
import { initSearchForm } from "public/searchForm";

const SEARCH_FLOW_CONTEXT_CURRENCY_AND_LANGUAGE =
  "searchFlowContextCurrencyAndLanguage";

const DEFAULT_SEARCH_FLOW_CONTEXT_CURRENCY_AND_LANGUAGE =
  "?language=tr&currency=TRY";

$w.onReady(function () {
  initSearchForm({
    $w,
    searchPlacesFn: searchPlaces,
    debug: false
  });

  const existingSessionValue = session.getItem(
    SEARCH_FLOW_CONTEXT_CURRENCY_AND_LANGUAGE
  );

  if (!existingSessionValue) {
    session.setItem(
      SEARCH_FLOW_CONTEXT_CURRENCY_AND_LANGUAGE,
      DEFAULT_SEARCH_FLOW_CONTEXT_CURRENCY_AND_LANGUAGE
    );

    const currentParams = new URLSearchParams();

    Object.entries(wixLocationFrontend.query || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        currentParams.set(key, String(value));
      }
    });

    const defaultParams = new URLSearchParams(
      DEFAULT_SEARCH_FLOW_CONTEXT_CURRENCY_AND_LANGUAGE.slice(1)
    );

    defaultParams.forEach((value, key) => {
      currentParams.set(key, value);
    });

    const relativePath =
      Array.isArray(wixLocationFrontend.path) && wixLocationFrontend.path.length
        ? `/${wixLocationFrontend.path.join("/")}`
        : "/";

    wixLocationFrontend.to(`${relativePath}?${currentParams.toString()}`);
  }
});