import { Permissions, webMethod } from "wix-web-module";
import { searchHotelRatesHandler, searchPlacesHandler } from "./liteApiSearch";
import {
  getHotelDetailsHandler,
  getMappedRoomRatesByHotelIdHandler,
  getMergedMappedRoomOffersHandler
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
  async (searchFormData) => searchHotelRatesHandler(searchFormData)
);

export const getHotelDetails = webMethod(
  Permissions.Anyone,
  async (hotelId) => getHotelDetailsHandler(hotelId)
);

export const getMappedRoomRatesByHotelId = webMethod(
  Permissions.Anyone,
  async (payload) => getMappedRoomRatesByHotelIdHandler(payload)
);

export const getMergedMappedRoomOffers = webMethod(
  Permissions.Anyone,
  async (payload) => getMergedMappedRoomOffersHandler(payload)
);

export const createPrebookSession = webMethod(
  Permissions.Anyone,
  async (payload) => createPrebookSessionHandler(payload)
);

export const completeBooking = webMethod(
  Permissions.Anyone,
  async (payload) => completeBookingHandler(payload)
);