import { buildLiteApiError, liteApiRequest, parseJson } from "./liteApiClient";

const LITE_API_BASE_URL = "https://api.liteapi.travel/v3.0";

export async function searchPlacesHandler(textQuery) {
  const normalizedTextQuery = normalizeText(textQuery);

  if (normalizedTextQuery.length < 2) {
    return [];
  }

  const searchPlacesResponse = await liteApiRequest(
    `${LITE_API_BASE_URL}/data/places?textQuery=${encodeURIComponent(normalizedTextQuery)}`,
    {
      method: "GET"
    }
  );

  const searchPlacesJson = await parseJson(searchPlacesResponse);

  if (!searchPlacesResponse.ok) {
    throw buildLiteApiError(
      searchPlacesJson,
      "Places autocomplete request failed."
    );
  }

  const searchPlacesData = Array.isArray(searchPlacesJson?.data)
    ? searchPlacesJson.data
    : [];

  return searchPlacesData.map((searchPlacesItem) => ({
    placeId: normalizeText(searchPlacesItem?.placeId),
    displayName: normalizeText(searchPlacesItem?.displayName),
    formattedAddress: normalizeText(searchPlacesItem?.formattedAddress)
  }));
}

function normalizeText(value) {
  return String(value || "").trim();
}
