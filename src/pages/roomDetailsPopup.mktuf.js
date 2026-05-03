import wixWindowFrontend from "wix-window-frontend";

$w.onReady(function () {
  const context = wixWindowFrontend.lightbox.getContext() || {};
  bindRoomDetailsPopup(context);
});

function bindRoomDetailsPopup(context) {
  bindRoomDetailsGallery(context?.images || []);

  const roomName = String(context?.roomName || "").trim();
  const description = String(context?.description || "").trim();
  const sizeText = String(context?.sizeText || "").trim();
  const sleepsText = String(context?.sleepsText || "").trim();
  const bedTypesText = String(context?.bedTypesText || "").trim();

  $w("#roomNameText").text = roomName;
  if (roomName) {
    $w("#roomNameText").expand();
  } else {
    $w("#roomNameText").collapse();
  }

  $w("#roomDescriptionText").text = description;
  if (description) {
    $w("#roomDescriptionText").expand();
  } else {
    $w("#roomDescriptionText").collapse();
  }

  $w("#roomSizeText").text = sizeText;
  if (sizeText) {
    $w("#roomSizeText").expand();
  } else {
    $w("#roomSizeText").collapse();
  }

  $w("#roomSleepsText").text = sleepsText;
  if (sleepsText) {
    $w("#roomSleepsText").expand();
  } else {
    $w("#roomSleepsText").collapse();
  }

  $w("#roomBedTypesText").text = bedTypesText;
  if (bedTypesText) {
    $w("#roomBedTypesText").expand();
  } else {
    $w("#roomBedTypesText").collapse();
  }

  const amenities = Array.isArray(context?.amenities)
    ? context.amenities
        .map((amenity) => String(amenity || "").trim())
        .filter(Boolean)
    : [];

  $w("#roomAmenitiesRepeater").onItemReady(($item, itemData) => {
    const amenityText = String(itemData?.text || "").trim();

    $item("#roomAmenitiesText").text = amenityText;

    if (amenityText) {
      $item("#roomAmenitiesText").expand();
    } else {
      $item("#roomAmenitiesText").collapse();
    }
  });

  if (!amenities.length) {
    $w("#roomAmenitiesTitleText").collapse();
    $w("#roomAmenitiesRepeater").data = [];
    $w("#roomAmenitiesRepeater").collapse();
    return;
  }

  $w("#roomAmenitiesTitleText").expand();

  $w("#roomAmenitiesRepeater").data = amenities.map((amenity, index) => ({
    _id: `amenity-${index + 1}`,
    text: amenity
  }));

  $w("#roomAmenitiesRepeater").expand();
}

function bindRoomDetailsGallery(images) {
  const galleryItems = (Array.isArray(images) ? images : [])
    .map((imageUrl) => String(imageUrl || "").trim())
    .filter(Boolean)
    .map((imageUrl, index) => ({
      type: "image",
      src: imageUrl,
      title: `Room image ${index + 1}`
    }));

  if (!galleryItems.length) {
    $w("#roomDetailsGallery").items = [];
    $w("#roomDetailsGallery").collapse();
    return;
  }

  $w("#roomDetailsGallery").items = galleryItems;
  $w("#roomDetailsGallery").expand();
}
