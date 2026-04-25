import { Permissions, webMethod } from "wix-web-module";
import { searchHotelRatesHandler, searchPlacesHandler } from "./liteApiSearch";
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

export const searchHotelRates = webMethod(
  Permissions.Anyone,
  async (searchFlowContextQuery) => searchHotelRatesHandler(searchFlowContextQuery)
);

export const getHotelDetails = webMethod(
  Permissions.Anyone,
  async (searchFlowContextQuery) =>
    getHotelDetailsHandler(searchFlowContextQuery)
);

export const getHotelMappedRoomRates = webMethod(
  Permissions.Anyone,
  async (searchFlowContextQuery) => {
    const getHotelMappedRoomRatesResult =
      await getHotelMappedRoomRatesHandler(searchFlowContextQuery);

    return {
      hotelId: getHotelMappedRoomRatesResult.hotelId,
      getHotelMappedRoomRatesResponse:
        getHotelMappedRoomRatesResult.getHotelMappedRoomRatesResponse,
      normalizedHotelMappedRoomRates:
        getHotelMappedRoomRatesResult.normalizedHotelMappedRoomRates
    };
  }
);

export const getHotelMappedRoomOffers = webMethod(
  Permissions.Anyone,
  async (searchFlowContextQuery) => {
    const getHotelMappedRoomOffersResult =
      await getHotelMappedRoomOffersHandler(searchFlowContextQuery);

    return {
      hotelId: getHotelMappedRoomOffersResult.hotelId,
      getHotelDetailsResponse:
        getHotelMappedRoomOffersResult.getHotelDetailsResponse,
      getHotelMappedRoomRatesResponse:
        getHotelMappedRoomOffersResult.getHotelMappedRoomRatesResponse,
      normalizedHotelDetails:
        getHotelMappedRoomOffersResult.normalizedHotelDetails,
      normalizedHotelMappedRoomOffers:
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
