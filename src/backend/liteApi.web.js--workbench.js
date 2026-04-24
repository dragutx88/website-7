import { Permissions, webMethod } from "wix-web-module";
import { getHotelsRatesHandler, searchPlacesHandler } from "./liteApiSearch";
import {
  getHotelDetailsHandler,
  getHotelMappedRoomRatesHandler,
  getHotelMappedRoomOffersHandler
} from "./liteApiHotel";
import {
  completeBookingHandler,
  createPrebookSessionHandler
} from "./liteApiBooking";

export const searchPlaces = webMethod(Permissions.Anyone, async (textQuery) =>
  searchPlacesHandler(textQuery)
);

export const getHotelsRates = webMethod(
  Permissions.Anyone,
  async (searchFlowContextQuery) =>
    getHotelsRatesHandler(searchFlowContextQuery)
);

export const getHotelDetails = webMethod(
  Permissions.Anyone,
  async (hotelId) => getHotelDetailsHandler(hotelId)
);

export const getMappedRoomRatesByHotelId = webMethod(
  Permissions.Anyone,
  async (payload) => {
    const getHotelMappedRoomRatesResult = await getHotelMappedRoomRatesHandler(payload);

    return {
      hotelId: getHotelMappedRoomRatesResult.hotelId,
      getMappedRoomRatesByHotelIdResponse:
        getHotelMappedRoomRatesResult.getHotelMappedRoomRatesResponse,
      normalizedMappedRoomRatesByHotelId:
        getHotelMappedRoomRatesResult.normalizedHotelMappedRoomRates
    };
  }
);

export const getMergedMappedRoomOffers = webMethod(
  Permissions.Anyone,
  async (payload) => {
    const getHotelMappedRoomOffersResult = await getHotelMappedRoomOffersHandler(payload);

    return {
      hotelId: getHotelMappedRoomOffersResult.hotelId,
      getHotelDetailsResponse: getHotelMappedRoomOffersResult.getHotelDetailsResponse,
      getMappedRoomRatesByHotelIdResponse:
        getHotelMappedRoomOffersResult.getHotelMappedRoomRatesResponse,
      normalizedHotelDetails: getHotelMappedRoomOffersResult.normalizedHotelDetails,
      normalizedMergedMappedRoomOffers:
        getHotelMappedRoomOffersResult.normalizedHotelMappedRoomOffers
    };
  }
);

export const createPrebookSession = webMethod(
  Permissions.Anyone,
  async (payload) => createPrebookSessionHandler(payload)
);

export const completeBooking = webMethod(
  Permissions.Anyone,
  async (payload) => completeBookingHandler(payload)
);
