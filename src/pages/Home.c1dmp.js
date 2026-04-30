import wixWindow from "wix-window-frontend";
import wixLocationFrontend from "wix-location-frontend";
import { session } from "wix-storage-frontend";
import { initSearchForm } from "public/searchForm";

const SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY =
  "searchFlowContextQueryStringify";

$w.onReady(function () {
  const renderingEnv = wixWindow.rendering.env;

  if (renderingEnv !== "browser") {
    console.log("HOME skipped outside browser", { renderingEnv });
    return;
  }

  initSearchForm({ $w });

  session.setItem(
    SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY,
    JSON.stringify({ ...wixLocationFrontend.query, language: "tr", currency: "TRY" })
  );

  wixLocationFrontend.queryParams.add({
    ...wixLocationFrontend.query,
    language: "tr",
    currency: "TRY"
  });

  console.log("HOME session/query init", {
    query: { ...wixLocationFrontend.query, language: "tr", currency: "TRY" }
  });
});
