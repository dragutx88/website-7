import { buildLiteApiError, liteApiRequest, parseJson } from "./liteApiClient";

const LITE_API_BASE_URL = "https://api.liteapi.travel/v3.0";
const DEFAULT_CURRENCY = "TRY";
const DEFAULT_LANGUAGE = "tr";
const DEFAULT_GUEST_NATIONALITY = "TR";
const DEFAULT_ROOMS = 1;
const DEFAULT_FIRST_ROOM_ADULTS = 2;
const DEFAULT_EXTRA_ROOM_ADULTS = 1;

export async function getHotelsRatesHandler(searchFlowContextQuery) {
  const getHotelsRatesRequest = buildHotelsRatesRequest(searchFlowContextQuery);

  const getHotelsRatesResponse = await liteApiRequest(
    `${LITE_API_BASE_URL}/hotels/rates`,
    {
      method: "POST",
      body: getHotelsRatesRequest
    }
  );

  const getHotelsRatesJson = await parseJson(getHotelsRatesResponse);

  if (!getHotelsRatesResponse.ok) {
    throw buildLiteApiError(getHotelsRatesJson, "Hotel rates request failed.");
  }

  return {
    getHotelsRatesResponse: getHotelsRatesJson,
    normalizedHotelsRates: normalizeHotelsRates(
      getHotelsRatesJson,
      searchFlowContextQuery
    )
  };
}

function buildHotelsRatesRequest(searchFlowContextQuery) {
  const normalizedMode = normalizeText(searchFlowContextQuery?.mode);
  const normalizedPlaceId = normalizeText(searchFlowContextQuery?.placeId);
  const normalizedAiSearch =
    normalizeText(searchFlowContextQuery?.aiSearch) ||
    normalizeText(searchFlowContextQuery?.message) ||
    normalizeText(searchFlowContextQuery?.query);
  const normalizedCheckin = normalizeText(searchFlowContextQuery?.checkin);
  const normalizedCheckout = normalizeText(searchFlowContextQuery?.checkout);
  const normalizedCurrency =
    normalizeText(searchFlowContextQuery?.currency).toUpperCase() ||
    DEFAULT_CURRENCY;
  const normalizedLanguage =
    normalizeText(searchFlowContextQuery?.language).toLowerCase() ||
    DEFAULT_LANGUAGE;
  const normalizedGuestNationality =
    normalizedLanguage.toUpperCase() || DEFAULT_GUEST_NATIONALITY;
  const getHotelsRatesOccupancies =
    buildHotelsRatesRequestOccupancies(searchFlowContextQuery);

  if (!normalizedCheckin || !normalizedCheckout) {
    throw new Error("checkin and checkout are required.");
  }

  if (!getHotelsRatesOccupancies.length) {
    throw new Error("occupancies are required.");
  }

  const getHotelsRatesRequest = {
    occupancies: getHotelsRatesOccupancies,
    currency: normalizedCurrency,
    guestNationality: normalizedGuestNationality,
    checkin: normalizedCheckin,
    checkout: normalizedCheckout,
    roomMapping: true,
    includeHotelData: true,
    maxRatesPerHotel: 1,
    margin: 0
  };

  if (normalizedMode === "destination") {
    if (!normalizedPlaceId) {
      throw new Error("placeId is required for destination mode.");
    }

    getHotelsRatesRequest.placeId = normalizedPlaceId;
    return getHotelsRatesRequest;
  }

  if (normalizedMode === "vibe") {
    if (!normalizedAiSearch) {
      throw new Error("aiSearch is required for vibe mode.");
    }

    getHotelsRatesRequest.aiSearch = normalizedAiSearch;
    return getHotelsRatesRequest;
  }

  throw new Error("Unsupported search mode.");
}

function buildHotelsRatesRequestOccupancies(searchFlowContextQuery) {
  const normalizedRooms = normalizePositiveInteger(
    searchFlowContextQuery?.rooms,
    DEFAULT_ROOMS
  );

  const normalizedAdultsList = normalizeText(searchFlowContextQuery?.adults)
    .split(",")
    .map((normalizedAdultsItem) =>
      normalizePositiveInteger(normalizedAdultsItem, null)
    )
    .filter((normalizedAdultsItem) => Number.isFinite(normalizedAdultsItem));

  const normalizedChildrenByRoom = new Map();

  const normalizedChildrenList = normalizeText(searchFlowContextQuery?.children)
    .split(",")
    .map((normalizedChildrenItem) => normalizeText(normalizedChildrenItem))
    .filter(Boolean);

  for (const normalizedChildrenItem of normalizedChildrenList) {
    const [normalizedRoomNumberText, normalizedChildAgeText] =
      normalizedChildrenItem.split("_");

    const normalizedRoomNumber = normalizePositiveInteger(
      normalizedRoomNumberText,
      null
    );
    const normalizedChildAge = normalizeIntegerOrNull(normalizedChildAgeText);

    if (
      !Number.isFinite(normalizedRoomNumber) ||
      normalizedRoomNumber < 1 ||
      normalizedRoomNumber > normalizedRooms ||
      !Number.isFinite(normalizedChildAge)
    ) {
      continue;
    }

    if (!normalizedChildrenByRoom.has(normalizedRoomNumber)) {
      normalizedChildrenByRoom.set(normalizedRoomNumber, []);
    }

    normalizedChildrenByRoom.get(normalizedRoomNumber).push(normalizedChildAge);
  }

  const getHotelsRatesOccupancies = [];

  for (
    let normalizedRoomNumber = 1;
    normalizedRoomNumber <= normalizedRooms;
    normalizedRoomNumber += 1
  ) {
    const normalizedAdults =
      Number.isFinite(normalizedAdultsList[normalizedRoomNumber - 1])
        ? normalizedAdultsList[normalizedRoomNumber - 1]
        : normalizedRoomNumber === 1
          ? DEFAULT_FIRST_ROOM_ADULTS
          : DEFAULT_EXTRA_ROOM_ADULTS;

    getHotelsRatesOccupancies.push({
      adults: normalizePositiveInteger(
        normalizedAdults,
        DEFAULT_FIRST_ROOM_ADULTS
      ),
      children: normalizedChildrenByRoom.get(normalizedRoomNumber) || []
    });
  }

  return getHotelsRatesOccupancies.filter(
    (getHotelsRatesOccupancyItem) =>
      normalizePositiveInteger(getHotelsRatesOccupancyItem?.adults, 0) > 0
  );
}

function normalizeHotelsRates(getHotelsRatesResponse, searchFlowContextQuery) {
  const getHotelsRatesData = Array.isArray(getHotelsRatesResponse?.data)
    ? getHotelsRatesResponse.data
    : [];
  const getHotelsRatesHotels = Array.isArray(getHotelsRatesResponse?.hotels)
    ? getHotelsRatesResponse.hotels
    : [];

  const normalizedLanguage =
    normalizeText(searchFlowContextQuery?.language).toLowerCase() ||
    DEFAULT_LANGUAGE;

  const normalizedCheckin = normalizeText(searchFlowContextQuery?.checkin);
  const normalizedCheckout = normalizeText(searchFlowContextQuery?.checkout);

  const normalizedCheckinDate = new Date(normalizedCheckin);
  const normalizedCheckoutDate = new Date(normalizedCheckout);

  const normalizedNightCount =
    !Number.isNaN(normalizedCheckinDate.getTime()) &&
    !Number.isNaN(normalizedCheckoutDate.getTime())
      ? Math.max(
          1,
          Math.round(
            (normalizedCheckoutDate.getTime() - normalizedCheckinDate.getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : 1;

  const normalizedHotelsRates = [];

  for (const dataItem of getHotelsRatesData) {
    const dataItemHotelId = normalizeText(dataItem?.hotelId);

    if (!dataItemHotelId) {
      continue;
    }

    const getHotelsRatesHotel =
      getHotelsRatesHotels.find(
        (hotelItem) => normalizeText(hotelItem?.id) === dataItemHotelId
      ) || null;

    if (!getHotelsRatesHotel) {
      continue;
    }

    if (!dataItem?.roomTypes?.[0]) {
      continue;
    }

    if (!dataItem?.roomTypes?.[0]?.rates?.[0]) {
      continue;
    }

    const getHotelsRatesHotelName =
      normalizeText(getHotelsRatesHotel?.name) || null;

    if (!getHotelsRatesHotelName) {
      continue;
    }

    const getHotelsRatesHotelAddress =
      normalizeText(getHotelsRatesHotel?.address) || null;
    const getHotelsRatesHotelRating = normalizeNumberOrNull(
      getHotelsRatesHotel?.rating
    );
    const getHotelsRatesHotelMainImage =
      normalizeText(getHotelsRatesHotel?.main_photo) || null;

    const hotelOffersBeforeMinCurrentPrice = normalizeNumberOrNull(
      dataItem?.roomTypes?.[0]?.rates?.[0]?.retailRate
        ?.suggestedSellingPrice?.[0]?.amount
    );

    const hotelOffersMinCurrentPrice = normalizeNumberOrNull(
      dataItem?.roomTypes?.[0]?.rates?.[0]?.retailRate?.total?.[0]?.amount
    );

    const hotelOffersMinCurrentPriceCurrency =
      normalizeText(
        dataItem?.roomTypes?.[0]?.rates?.[0]?.retailRate?.total?.[0]?.currency
      ) || null;

    const hotelOffersMinCurrentPriceOccupancyNumber = normalizePositiveInteger(
      dataItem?.roomTypes?.[0]?.rates?.[0]?.occupancyNumber,
      1
    );

    const hotelOffersMinCurrentPriceTaxesAndFees = Array.isArray(
      dataItem?.roomTypes?.[0]?.rates?.[0]?.retailRate?.taxesAndFees
    )
      ? dataItem.roomTypes[0].rates[0].retailRate.taxesAndFees
      : [];

    const hotelOffersMinCurrentPriceHasExcludedTaxesAndFees =
      hotelOffersMinCurrentPriceTaxesAndFees.some(
        (hotelOffersMinCurrentPriceTaxesAndFeesItem) =>
          hotelOffersMinCurrentPriceTaxesAndFeesItem?.included === false
      );

    const hotelOffersMinCurrentPriceTaxesAndFeesText =
      hotelOffersMinCurrentPriceHasExcludedTaxesAndFees ? "excl." : "incl.";

    const hotelOffersBeforeMinCurrentPriceText = formatCurrencyText(
      hotelOffersBeforeMinCurrentPrice,
      hotelOffersMinCurrentPriceCurrency,
      normalizedLanguage
    );

    const hotelOffersMinCurrentPriceText = formatCurrencyText(
      hotelOffersMinCurrentPrice,
      hotelOffersMinCurrentPriceCurrency,
      normalizedLanguage
    );

    const hotelOffersMinCurrentPriceNoteText = Number.isFinite(
      hotelOffersMinCurrentPriceOccupancyNumber
    )
      ? `${normalizedNightCount} night, ${hotelOffersMinCurrentPriceOccupancyNumber} room, ${hotelOffersMinCurrentPriceTaxesAndFeesText} taxes & fees`
      : null;

    normalizedHotelsRates.push({
      hotelId: dataItemHotelId,
      hotelName: getHotelsRatesHotelName,
      hotelAddress: getHotelsRatesHotelAddress,
      hotelRating: getHotelsRatesHotelRating,
      hotelOffersBeforeMinCurrentPriceText,
      hotelOffersMinCurrentPriceText,
      hotelOffersMinCurrentPriceNoteText,
      hotelMainImage: getHotelsRatesHotelMainImage
    });
  }

  return normalizedHotelsRates;
}

function formatCurrencyText(amount, currency, language) {
  const normalizedAmount = normalizeNumberOrNull(amount);
  const normalizedCurrency = normalizeText(currency).toUpperCase();
  const normalizedLanguage =
    normalizeText(language).toLowerCase() || DEFAULT_LANGUAGE;

  if (!Number.isFinite(normalizedAmount) || !normalizedCurrency) {
    return null;
  }

  const normalizedLocale = normalizedLanguage === "tr" ? "tr-TR" : "en-US";

  try {
    return new Intl.NumberFormat(normalizedLocale, {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(normalizedAmount);
  } catch (formatCurrencyError) {
    return `${normalizedCurrency} ${normalizedAmount.toFixed(2)}`;
  }
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeNumberOrNull(value) {
  const normalizedNumber = Number(value);
  return Number.isFinite(normalizedNumber) ? normalizedNumber : null;
}

function normalizeIntegerOrNull(value) {
  const normalizedInteger = Number(value);
  return Number.isFinite(normalizedInteger)
    ? Math.trunc(normalizedInteger)
    : null;
}

function normalizePositiveInteger(value, fallbackValue) {
  const normalizedInteger = Number(value);

  if (!Number.isFinite(normalizedInteger) || normalizedInteger <= 0) {
    return fallbackValue;
  }

  return Math.trunc(normalizedInteger);
}
