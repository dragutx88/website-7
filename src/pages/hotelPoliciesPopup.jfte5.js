import wixWindowFrontend from "wix-window-frontend";
import {
  safeGetPageElement,
  setOptionalItemText
} from "public/liteApiHelpers";

$w.onReady(function () {
  const context = wixWindowFrontend.lightbox.getContext() || {};
  bindHotelPoliciesPopup(context);
});

function bindHotelPoliciesPopup(context) {
  const repeater = safeGetPageElement("#hotelPoliciesRepeater");
  const policies = Array.isArray(context?.policies) ? context.policies : [];

  if (!repeater) {
    return;
  }

  repeater.onItemReady(($item, itemData) => {
    setOptionalItemText($item, "#hotelPoliciesNameText", itemData.name);
    setOptionalItemText($item, "#hotelPoliciesDescriptionText", itemData.description);
  });

  repeater.data = policies.map((policy, index) => ({
    _id: `policy-${index + 1}`,
    name: String(policy?.name || ""),
    description: String(policy?.description || "")
  }));
}
