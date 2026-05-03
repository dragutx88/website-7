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

  session.setItem(
    SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY,
    JSON.stringify({
      ...JSON.parse(
        session.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY) || "{}"
      ),
      ...wixLocationFrontend.query,
      language: "tr",
      currency: "TRY"
    })
  );

  wixLocationFrontend.queryParams.add(
    JSON.parse(session.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY))
  );

  const searchFlowContextQuery = {
    ...JSON.parse(
      session.getItem(SEARCH_FLOW_CONTEXT_QUERY_STRINGIFY_SESSION_KEY) || "{}"
    ),
    ...wixLocationFrontend.query,
    language: "tr",
    currency: "TRY"
  };

  console.log("HOME session/query init", {
    searchFlowContextQuery
  });

  initSearchForm({ $w });
});
