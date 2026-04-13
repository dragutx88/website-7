const LITEAPI_PAYMENT_SDK_URL = "https://payment-wrapper.liteapi.travel/dist/liteAPIPayment.js?v=a1";
let liteApiElementCounter = 0;

let liteApiSdkPromise = null;

function loadLiteApiSdkOnce() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Window is not available."));
  }

  if (window.LiteAPIPayment) {
    return Promise.resolve(window.LiteAPIPayment);
  }

  if (liteApiSdkPromise) {
    return liteApiSdkPromise;
  }

  liteApiSdkPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${LITEAPI_PAYMENT_SDK_URL}"]`);
    if (existingScript) {
      if (window.LiteAPIPayment) {
        resolve(window.LiteAPIPayment);
        return;
      }
      existingScript.addEventListener("load", () => resolve(window.LiteAPIPayment));
      existingScript.addEventListener("error", () => {
        reject(new Error("Failed to load LiteAPI payment SDK."));
      });
      return;
    }

    const script = document.createElement("script");
    script.src = LITEAPI_PAYMENT_SDK_URL;
    script.async = true;
    script.onload = () => resolve(window.LiteAPIPayment);
    script.onerror = () => reject(new Error("Failed to load LiteAPI payment SDK."));
    document.head.appendChild(script);
  });

  return liteApiSdkPromise;
}

class LiteApiPaymentElement extends HTMLElement {
  static get observedAttributes() {
    return [
      "public-key",
      "secret-key",
      "return-url",
      "prebook-id",
      "transaction-id",
      "mount-cycle-token"
    ];
  }

  constructor() {
    super();

    this._connected = false;
    this._statusElementId = `liteapi-payment-status-${Date.now()}-${liteApiElementCounter + 1}`;
    this._targetElementId = `liteapi-payment-target-${Date.now()}-${liteApiElementCounter + 1}`;
    this._statusElement = null;
    this._targetElement = null;
    this._activeMountCycleToken = "";
    this._submitStarted = false;
    this._mounted = false;
    this._mountInFlight = false;
    this._redirectSignalEmitted = false;
    liteApiElementCounter += 1;

    this._onClickCapture = this._onClickCapture.bind(this);
    this._onSubmitCapture = this._onSubmitCapture.bind(this);
    this._onPageHide = this._onPageHide.bind(this);
  }

  connectedCallback() {
    if (this._connected) {
      return;
    }

    this._connected = true;
    this._ensureTemplate();
    this.addEventListener("click", this._onClickCapture, true);
    this.addEventListener("submit", this._onSubmitCapture, true);
    window.addEventListener("pagehide", this._onPageHide);

    this._emit("liteapi-payment-ready", {
      source: "custom-element",
      producerVersion: "2026-04-09"
    });

    this._maybeMount();
  }

  disconnectedCallback() {
    this.removeEventListener("click", this._onClickCapture, true);
    this.removeEventListener("submit", this._onSubmitCapture, true);
    window.removeEventListener("pagehide", this._onPageHide);
    this._connected = false;
  }

  attributeChangedCallback() {
    this._maybeMount();
  }

  _getConfigFromAttributes() {
    return {
      publicKey: String(this.getAttribute("public-key") || "").trim(),
      secretKey: String(this.getAttribute("secret-key") || "").trim(),
      returnUrl: String(this.getAttribute("return-url") || "").trim(),
      prebookId: String(this.getAttribute("prebook-id") || "").trim(),
      transactionId: String(this.getAttribute("transaction-id") || "").trim(),
      mountCycleToken: String(this.getAttribute("mount-cycle-token") || "").trim()
    };
  }

  _hasRequiredConfig(config) {
    return Boolean(
      config &&
      config.publicKey &&
      config.secretKey &&
      config.returnUrl &&
      config.prebookId &&
      config.transactionId &&
      config.mountCycleToken
    );
  }

  async _maybeMount() {
    if (!this._connected || this._mountInFlight) {
      return;
    }

    const config = this._getConfigFromAttributes();
    if (!this._hasRequiredConfig(config)) {
      return;
    }

    if (config.mountCycleToken === this._activeMountCycleToken && this._mounted) {
      return;
    }

    this._mountInFlight = true;

    try {
      this._activeMountCycleToken = config.mountCycleToken;
      this._submitStarted = false;
      this._mounted = false;
      this._redirectSignalEmitted = false;

      this._setStatus("Loading secure payment form...");
      this._targetElement.innerHTML = "";

      const LiteAPIPayment = await loadLiteApiSdkOnce();
      if (!LiteAPIPayment) {
        throw new Error("LiteAPI payment SDK is unavailable.");
      }

      const liteApiConfig = {
        publicKey: config.publicKey,
        appearance: {
          theme: "flat"
        },
        options: {
          business: {
            name: "LiteAPI"
          }
        },
        targetElement: `#${this._targetElementId}`,
        secretKey: config.secretKey,
        returnUrl: config.returnUrl
      };

      const paymentInstance = new LiteAPIPayment(liteApiConfig);
      paymentInstance.handlePayment();

      this._mounted = true;
      this._setStatus("Secure payment form is ready.");
      this._emit("liteapi-payment-mounted", {
        prebookId: config.prebookId,
        transactionId: config.transactionId,
        mountCycleToken: config.mountCycleToken,
        returnUrl: config.returnUrl,
        source: "custom-element"
      });
    } catch (error) {
      this._setStatus("Payment form failed to load.");
      this._emit("liteapi-payment-error", {
        prebookId: config.prebookId,
        transactionId: config.transactionId,
        mountCycleToken: config.mountCycleToken,
        returnUrl: config.returnUrl,
        source: "custom-element",
        message: error && error.message ? error.message : "Payment SDK mount failed."
      });
    } finally {
      this._mountInFlight = false;
    }
  }

  _onClickCapture(event) {
    if (!this._mounted) {
      return;
    }

    const clickable =
      event && event.target && typeof event.target.closest === "function"
        ? event.target.closest("button,[role='button'],input[type='submit']")
        : null;

    if (clickable) {
      this._emitSubmitStarted("click");
    }
  }

  _onSubmitCapture() {
    if (!this._mounted) {
      return;
    }

    this._emitSubmitStarted("submit");
    this._emitRedirectRequest("submit");
  }

  _onPageHide() {
    if (!this._submitStarted) {
      return;
    }

    this._emitRedirectRequest("pagehide");
  }

  _emitSubmitStarted(source) {
    if (this._submitStarted) {
      return;
    }

    this._submitStarted = true;
    this._emit("liteapi-payment-submit-started", {
      ...this._baseDetail(),
      source: source || "unknown"
    });
  }

  _emitRedirectRequest(source) {
    if (this._redirectSignalEmitted) {
      return;
    }
    this._redirectSignalEmitted = true;
    this._emit("liteapi-payment-redirect-request", {
      ...this._baseDetail(),
      source: source || "unknown"
    });
  }

  _baseDetail() {
    const config = this._getConfigFromAttributes();
    return {
      prebookId: config.prebookId,
      transactionId: config.transactionId,
      mountCycleToken: config.mountCycleToken,
      returnUrl: config.returnUrl
    };
  }

  _setStatus(message) {
    if (this._statusElement) {
      this._statusElement.textContent = String(message || "");
    }
  }

  _ensureTemplate() {
    if (this._statusElement && this._targetElement) {
      return;
    }

    this.style.display = "block";
    this.style.minHeight = "560px";

    this.innerHTML = `
      <div data-liteapi-payment-root="true" style="min-height:560px;padding:8px;box-sizing:border-box;background:#ffffff;font-family:Arial,sans-serif;">
        <div id="${this._statusElementId}" style="font-size:14px;color:#444;margin-bottom:12px;">Waiting for payment session…</div>
        <div id="${this._targetElementId}"></div>
      </div>
    `;

    this._statusElement = this.querySelector(`#${this._statusElementId}`);
    this._targetElement = this.querySelector(`#${this._targetElementId}`);
  }

  _emit(type, detail) {
    this.dispatchEvent(
      new CustomEvent(type, {
        bubbles: true,
        composed: true,
        detail: detail && typeof detail === "object" ? detail : {}
      })
    );
  }
}

if (!customElements.get("liteapi-payment-element")) {
  customElements.define("liteapi-payment-element", LiteApiPaymentElement);
}
