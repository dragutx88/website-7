import { Permissions, webMethod } from "wix-web-module";
import { searchPlacesHandler } from "./liteApiPlaces";
import { getHotelsRatesHandler } from "./liteApiSearch";
import {
  getHotelDetailsHandler,
  getHotelMappedRoomRatesHandler,
  getHotelMappedRoomOffersHandler
} from "./liteApiHotel";
import { createPrebookSessionHandler } from "./liteApiPrebook";
import { completeBookingHandler } from "./liteApiBooking";

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
