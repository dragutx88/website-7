import wixWindowFrontend from "wix-window-frontend";
import {
  safeGetPageElement,
  setOptionalItemText
} from "public/liteApiHelpers";

$w.onReady(function () {
  const context = wixWindowFrontend.lightbox.getContext() || {};
  bindHotelFacilitiesPopup(context);
});

function bindHotelFacilitiesPopup(context) {
  const repeater = safeGetPageElement("#hotelFacilitiesRepeater");
  const facilities = Array.isArray(context?.facilities) ? context.facilities : [];

  if (!repeater) {
    return;
  }

  repeater.onItemReady(($item, itemData) => {
    setOptionalItemText($item, "#hotelFacilitiesText", itemData.text);
  });

  repeater.data = facilities.map((facility, index) => ({
    _id: `facility-${index + 1}`,
    text: String(facility || "")
  }));
}
