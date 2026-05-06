import { Permissions, webMethod } from "wix-web-module";
import { searchPlacesHandler } from "./liteApiPlaces";
import { getHotelsRatesHandler } from "./liteApiSearch";
import { getOzviaClubOffersHandler } from "./ozviaClubOffers";
import { getHotelMappedRoomRatesHandler } from "./liteApiHotel";
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

export const getOzviaClubOffers = webMethod(
  Permissions.Anyone,
  async (searchFlowContextQuery) =>
    getOzviaClubOffersHandler(searchFlowContextQuery)
);

export const getHotelMappedRoomRates = webMethod(
  Permissions.Anyone,
  async (searchFlowContextQuery) =>
    getHotelMappedRoomRatesHandler(searchFlowContextQuery)
);

export const createPrebookSession = webMethod(
  Permissions.Anyone,
  async (payload) => createPrebookSessionHandler(payload)
);

export const completeBooking = webMethod(
  Permissions.Anyone,
  async (payload) => completeBookingHandler(payload)
);
