import wixWindowFrontend from "wix-window-frontend";

const guestsLimits = {
  minimumAdults: 1,
  maximumAdults: 8,
  minimumChildren: 0,
  maximumChildren: 8
};

let guestsState = {
  adults: 2,
  children: 0,
  childAges: []
};

const childAgeOptions = [
  { label: "Select age", value: "" },
  { label: "Under 1", value: "0" },
  ...Array.from({ length: 17 }, (_, index) => {
    const age = String(index + 1);
    return { label: age, value: age };
  })
];

$w.onReady(function () {
  initializeGuestsPopup();
});

function initializeGuestsPopup() {
  hydrateGuestsStateFromContext();
  bindGuestsPopupEvents();
  bindChildrenAgeRepeater();
  renderGuestsPopup();
}

function hydrateGuestsStateFromContext() {
  const context = wixWindowFrontend.lightbox.getContext();

  if (!context) {
    return;
  }

  const adults = Math.max(
    guestsLimits.minimumAdults,
    Number(context.adults || 2)
  );

  const children = Math.max(
    guestsLimits.minimumChildren,
    Number(context.children || 0)
  );

  let childAges = Array.isArray(context.childAges) ? [...context.childAges] : [];
  childAges = childAges.slice(0, children);

  while (childAges.length < children) {
    childAges.push("");
  }

  guestsState = {
    adults,
    children,
    childAges
  };
}

function bindGuestsPopupEvents() {
  $w("#guestsSelectionCloseButton").onClick(() => {
    closeGuestsPopupWithData();
  });

  $w("#adultsCounterIncreaseButton").onClick(() => {
    if (guestsState.adults < guestsLimits.maximumAdults) {
      guestsState.adults += 1;
      renderGuestsPopup();
    }
  });

  $w("#adultsCounterDecreaseButton").onClick(() => {
    if (guestsState.adults > guestsLimits.minimumAdults) {
      guestsState.adults -= 1;
      renderGuestsPopup();
    }
  });

  $w("#childrenCounterIncreaseButton").onClick(() => {
    if (guestsState.children < guestsLimits.maximumChildren) {
      guestsState.children += 1;
      guestsState.childAges.push("");
      renderGuestsPopup();
    }
  });

  $w("#childrenCounterDecreaseButton").onClick(() => {
    if (guestsState.children > guestsLimits.minimumChildren) {
      guestsState.children -= 1;
      guestsState.childAges.pop();
      renderGuestsPopup();
    }
  });
}

function bindChildrenAgeRepeater() {
  $w("#childrenAgeSelectionRepeater").onItemReady(($item, itemData, index) => {
    $item("#childrenAgeSectionTitleText").text = `Child ${index + 1}`;
    $item("#childrenAgeSectionDescriptionText").text = "Age";

    $item("#childrenAgeSelectionDropdown").options = childAgeOptions;
    $item("#childrenAgeSelectionDropdown").value = itemData.selectedAge || "";

    $item("#childrenAgeSelectionDropdown").onChange((event) => {
      guestsState.childAges[index] = event.target.value;
    });
  });
}

function renderGuestsPopup() {
  renderCounterTexts();
  renderCounterButtonStates();
  renderChildrenAgeRepeater();
}

function renderCounterTexts() {
  $w("#adultsCountValueText").text = String(guestsState.adults);
  $w("#childrenCountValueText").text = String(guestsState.children);
}

function renderCounterButtonStates() {
  if (guestsState.adults <= guestsLimits.minimumAdults) {
    $w("#adultsCounterDecreaseButton").disable();
  } else {
    $w("#adultsCounterDecreaseButton").enable();
  }

  if (guestsState.adults >= guestsLimits.maximumAdults) {
    $w("#adultsCounterIncreaseButton").disable();
  } else {
    $w("#adultsCounterIncreaseButton").enable();
  }

  if (guestsState.children <= guestsLimits.minimumChildren) {
    $w("#childrenCounterDecreaseButton").disable();
  } else {
    $w("#childrenCounterDecreaseButton").enable();
  }

  if (guestsState.children >= guestsLimits.maximumChildren) {
    $w("#childrenCounterIncreaseButton").disable();
  } else {
    $w("#childrenCounterIncreaseButton").enable();
  }
}

function renderChildrenAgeRepeater() {
  const repeaterData = guestsState.childAges.map((selectedAge, index) => {
    return {
      _id: `child-${index + 1}`,
      selectedAge
    };
  });

  $w("#childrenAgeSelectionRepeater").data = repeaterData;

  if (guestsState.children === 0) {
    $w("#childrenAgeSelectionRepeater").collapse();
  } else {
    $w("#childrenAgeSelectionRepeater").expand();
  }
}

function closeGuestsPopupWithData() {
  wixWindowFrontend.lightbox.close({
    adults: guestsState.adults,
    children: guestsState.children,
    childAges: [...guestsState.childAges]
  });
}