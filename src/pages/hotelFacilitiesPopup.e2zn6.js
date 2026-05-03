import wixWindowFrontend from "wix-window-frontend";

$w.onReady(function () {
  const context = wixWindowFrontend.lightbox.getContext() || {};
  bindHotelFacilitiesPopup(context);
});

function bindHotelFacilitiesPopup(context) {
  const facilities = Array.isArray(context?.facilities)
    ? context.facilities
        .map((facility) => String(facility || "").trim())
        .filter(Boolean)
    : [];

  $w("#hotelFacilitiesRepeater").onItemReady(($item, itemData) => {
    const facilityText = String(itemData?.text || "").trim();

    $item("#hotelFacilitiesText").text = facilityText;

    if (facilityText) {
      $item("#hotelFacilitiesText").expand();
    } else {
      $item("#hotelFacilitiesText").collapse();
    }
  });

  if (!facilities.length) {
    $w("#hotelFacilitiesRepeater").data = [];
    $w("#hotelFacilitiesRepeater").collapse();
    return;
  }

  $w("#hotelFacilitiesRepeater").data = facilities.map((facility, index) => ({
    _id: `facility-${index + 1}`,
    text: facility
  }));

  $w("#hotelFacilitiesRepeater").expand();
}
