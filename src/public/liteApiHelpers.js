export function safeGetPageElement(selector) {
  try {
    return $w(selector);
  } catch (error) {
    return null;
  }
}

export function safeGetItemElement($item, selector) {
  try {
    return $item(selector);
  } catch (error) {
    return null;
  }
}

export function safeShow(element) {
  try {
    if (typeof element?.show === "function") {
      element.show();
    }
  } catch (error) {}
}

export function safeExpand(element) {
  try {
    if (typeof element?.expand === "function") {
      element.expand();
    }
  } catch (error) {}
}

export function safeHide(element) {
  try {
    if (typeof element?.hide === "function") {
      element.hide();
    }
  } catch (error) {}
}

export function safeCollapse(element) {
  try {
    if (typeof element?.collapse === "function") {
      element.collapse();
    }
  } catch (error) {}
}

export function safeCollapseAndHide(element) {
  safeHide(element);
  safeCollapse(element);
}

export function setTextIfExists(selector, value) {
  const element = safeGetPageElement(selector);
  if (!element) return;
  element.text = String(value || "");
  safeShow(element);
  safeExpand(element);
}

export function setOptionalTextIfExists(selector, value) {
  const element = safeGetPageElement(selector);
  if (!element) return;
  if (!value) {
    safeCollapseAndHide(element);
    return;
  }
  element.text = String(value);
  safeShow(element);
  safeExpand(element);
}

export function setImageIfExists(selector, imageUrl) {
  const element = safeGetPageElement(selector);
  if (!element) return;
  const normalized = String(imageUrl || "").trim();
  if (!normalized) {
    safeCollapseAndHide(element);
    return;
  }
  try {
    element.src = normalized;
    safeShow(element);
    safeExpand(element);
  } catch (error) {
    console.error(`Failed to set image for ${selector}`, error);
  }
}

export function setInputValueIfExists(selector, value) {
  const element = safeGetPageElement(selector);
  if (!element) return;
  try {
    element.value = String(value || "");
  } catch (error) {}
}

export function setItemText($item, selector, value) {
  const element = safeGetItemElement($item, selector);
  if (!element) return;
  element.text = String(value || "");
  safeShow(element);
  safeExpand(element);
}

export function setOptionalItemText($item, selector, value) {
  const element = safeGetItemElement($item, selector);
  if (!element) return;
  if (!value) {
    safeCollapseAndHide(element);
    return;
  }
  element.text = String(value);
  safeShow(element);
  safeExpand(element);
}

export function setItemImage($item, selector, imageUrl, fallbackImageUrl = "") {
  const element = safeGetItemElement($item, selector);
  if (!element) {
    return;
  }

  try {
    element.src = imageUrl || fallbackImageUrl;
    safeShow(element);
    safeExpand(element);
  } catch (error) {
    console.error(`Failed to set image for ${selector}`, error);
  }
}

export function showAndExpandIfExists(selector) {
  const element = safeGetPageElement(selector);
  if (!element) return;
  safeShow(element);
  safeExpand(element);
}

export function collapseAndHideIfExists(selector) {
  const element = safeGetPageElement(selector);
  if (!element) return;
  safeCollapseAndHide(element);
}
