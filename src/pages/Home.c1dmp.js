import wixLocationFrontend from "wix-location-frontend";
import { searchPlaces, searchHotelRates } from "backend/liteApi.web";
import {
  createSearchFormController,
  loadPersistedSearchFormState,
  persistSearchFormState
} from "public/searchForm";
import {
  PAGE_PATHS,
  DEFAULT_CURRENCY,
  DEFAULT_LANGUAGE,
  buildCanonicalCtx,
  buildCtxQueryString,
  persistSearchResultsPayload
} from "public/liteApiFlow";

let homeSearchFormController;

$w.onReady(function () {
  homeSearchFormController = createSearchFormController({
    $w,
    searchPlacesFn: searchPlaces,
    searchHotelRatesFn: searchHotelRates,
    onValidationError: ({ message }) => {
      console.warn("HOME V5 validation error:", message);
    },
    onSearchError: ({ error }) => {
      console.error("HOME V5 search failed:", error);
    },
    onSearchSuccess: async ({ searchFormData, searchResult }) => {
      persistSearchFormState(searchFormData);

      const ctx = buildCanonicalCtx(searchFormData, {
        language: getCurrentLanguage(),
        currency: getCurrentCurrency()
      });

      persistSearchResultsPayload({
        searchedAt: Date.now(),
        mode: searchResult?.mode || searchFormData?.mode || null,
        searchContext: ctx,
        normalizedHotels: Array.isArray(searchResult?.normalizedHotels)
          ? searchResult.normalizedHotels
          : []
      });

      wixLocationFrontend.to(`${PAGE_PATHS.hotels}?${buildCtxQueryString(ctx)}`);
    },
    debug: false
  });

  const persistedSearchFormState = loadPersistedSearchFormState();
  homeSearchFormController.init(persistedSearchFormState);
});

function getCurrentLanguage() {
  const queryLanguage = String(wixLocationFrontend.query?.language || "").trim();
  return queryLanguage || DEFAULT_LANGUAGE;
}

function getCurrentCurrency() {
  const queryCurrency = String(wixLocationFrontend.query?.currency || "").trim();
  return queryCurrency || DEFAULT_CURRENCY;
}
