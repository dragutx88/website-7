import wixWindowFrontend from "wix-window-frontend";
import {
  safeCollapseAndHide,
  safeExpand,
  safeGetItemElement,
  safeGetPageElement,
  safeShow,
  setOptionalTextIfExists
} from "public/liteApiHelpers";

const FALLBACK_IMAGE_URL =
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80";

$w.onReady(function () {
  const context = wixWindowFrontend.lightbox.getContext() || {};
  bindRoomDetailsPopup(context);
});

function bindRoomDetailsPopup(context) {
  bindRoomDetailsGallery(context?.images || []);

  setOptionalTextIfExists("#roomNameText", context?.roomName || "");
  setOptionalTextIfExists("#roomDescriptionText", context?.description || "");
  setOptionalTextIfExists("#roomSizeText", context?.sizeText || "");
  setOptionalTextIfExists("#roomSleepsText", context?.sleepsText || "");
  setOptionalTextIfExists("#roomBedTypesText", context?.bedTypesText || "");

  const amenitiesTitle = safeGetPageElement("#roomAmenitiesTitleText");
  const amenitiesRepeater = safeGetPageElement("#roomAmenitiesRepeater");
  const amenities = Array.isArray(context?.amenities) ? context.amenities : [];

  if (!amenities.length) {
    if (amenitiesTitle) {
      safeCollapseAndHide(amenitiesTitle);
    }

    if (amenitiesRepeater) {
      try {
        amenitiesRepeater.data = [];
      } catch (error) {}
      safeCollapseAndHide(amenitiesRepeater);
    }

    return;
  }

  if (amenitiesTitle) {
    safeShow(amenitiesTitle);
    safeExpand(amenitiesTitle);
  }

  if (!amenitiesRepeater) {
    return;
  }

  amenitiesRepeater.onItemReady(($item, itemData) => {
    const text = safeGetItemElement($item, "#roomAmenitiesText");
    if (!text) {
      return;
    }

    text.text = String(itemData.text || "");
    safeShow(text);
    safeExpand(text);
  });

  amenitiesRepeater.data = amenities.map((item, index) => ({
    _id: `amenity-${index + 1}`,
    text: String(item || "")
  }));

  safeShow(amenitiesRepeater);
  safeExpand(amenitiesRepeater);
}

function bindRoomDetailsGallery(images) {
  const gallery = safeGetPageElement("#roomDetailsGallery");
  if (!gallery) {
    return;
  }

  const items = (Array.isArray(images) ? images : [])
    .filter(Boolean)
    .map((url, index) => ({
      type: "image",
      src: url || FALLBACK_IMAGE_URL,
      title: `Room image ${index + 1}`
    }));

  const normalizedItems = items.length
    ? items
    : [
        {
          type: "image",
          src: FALLBACK_IMAGE_URL,
          title: "Room image"
        }
      ];

  try {
    gallery.items = normalizedItems;
  } catch (error) {
    console.error("ROOM POPUP gallery bind failed", error);
  }
}
