export const FLOW_DEBUG_ENABLED = true;

export function debugGroup(scope, label, payload = {}) {
  if (!FLOW_DEBUG_ENABLED || typeof console === "undefined") {
    return;
  }

  const title = `[LiteAPI][${scope}] ${label}`;

  try {
    if (typeof console.groupCollapsed === "function") {
      console.groupCollapsed(title);
      console.log(payload);
      console.groupEnd();
      return;
    }
  } catch (error) {}

  try {
    console.log(title, payload);
  } catch (error) {}
}

export function debugError(scope, label, error, payload = {}) {
  if (!FLOW_DEBUG_ENABLED || typeof console === "undefined") {
    return;
  }

  const title = `[LiteAPI][${scope}] ${label}`;

  try {
    if (typeof console.groupCollapsed === "function") {
      console.groupCollapsed(title);
      console.error(error);
      console.log(payload);
      console.groupEnd();
      return;
    }
  } catch (groupError) {}

  try {
    console.error(title, error, payload);
  } catch (consoleError) {}
}

export function summarizePrebook(prebook) {
  return {
    prebookId: String(prebook?.prebookId || ""),
    transactionId: String(prebook?.transactionId || ""),
    paymentEnvironment: String(prebook?.paymentEnvironment || ""),
    secretKeyPresent: Boolean(prebook?.secretKey),
    secretKeyLength: String(prebook?.secretKey || "").length,
    refundableTag: String(prebook?.refundableTag || "")
  };
}

export function summarizePaymentConfig(config) {
  return {
    publicKey: String(config?.publicKey || ""),
    prebookId: String(config?.prebookId || ""),
    transactionId: String(config?.transactionId || ""),
    returnUrl: String(config?.returnUrl || ""),
    secretKeyPresent: Boolean(config?.secretKey),
    secretKeyLength: String(config?.secretKey || "").length
  };
}
