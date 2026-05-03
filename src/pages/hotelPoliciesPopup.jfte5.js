import wixWindowFrontend from "wix-window-frontend";

$w.onReady(function () {
  const context = wixWindowFrontend.lightbox.getContext() || {};
  bindHotelPoliciesPopup(context);
});

function bindHotelPoliciesPopup(context) {
  const policies = Array.isArray(context?.policies)
    ? context.policies
    : [];

  $w("#hotelPoliciesRepeater").onItemReady(($item, itemData) => {
    const policyName = String(itemData?.name || "").trim();
    const policyDescription = String(itemData?.description || "").trim();

    $item("#hotelPoliciesNameText").text = policyName;
    if (policyName) {
      $item("#hotelPoliciesNameText").expand();
    } else {
      $item("#hotelPoliciesNameText").collapse();
    }

    $item("#hotelPoliciesDescriptionText").text = policyDescription;
    if (policyDescription) {
      $item("#hotelPoliciesDescriptionText").expand();
    } else {
      $item("#hotelPoliciesDescriptionText").collapse();
    }
  });

  if (!policies.length) {
    $w("#hotelPoliciesRepeater").data = [];
    $w("#hotelPoliciesRepeater").collapse();
    return;
  }

  $w("#hotelPoliciesRepeater").data = policies.map((policy, index) => ({
    _id: `policy-${index + 1}`,
    name: String(policy?.name || "").trim(),
    description: String(policy?.description || "").trim()
  }));

  $w("#hotelPoliciesRepeater").expand();
}
