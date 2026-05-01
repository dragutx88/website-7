class HotelsListCustomElement extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div id="hotels-list"></div>
    `;

    this.renderDebugSize("before sdk load");

    const script = document.createElement("script");
    script.src = "https://components.liteapi.travel/v1.0/sdk.umd.js";

    script.onload = () => {
      this.renderDebugSize("sdk loaded");

      window.LiteAPI.init({
        domain: "ozvia.travel"
      });

      window.LiteAPI.HotelsList.create({
        selector: "#hotels-list",
        placeId: "ChIJYeZuBI9YwokRjMDs_IEyCwo",
        primaryColor: "#7057F0",
        hasSearchBar: true,
        rows: 1,
        currency: "TRY"
      });

      this.renderDebugSize("after create");

      setTimeout(() => {
        this.renderDebugSize("after layout settle");
      }, 1000);
    };

    script.onerror = () => {
      this.renderDebugMessage("sdk load failed");
    };

    document.head.appendChild(script);
  }

  renderDebugSize(stage) {
    const debugElement = this.getOrCreateDebugElement();

    const size = {
      stage,
      innerWidth: window.innerWidth,
      documentClientWidth: document.documentElement.clientWidth,
      hostClientWidth: Math.round(this.getBoundingClientRect().width),
      hostClientHeight: Math.round(this.getBoundingClientRect().height)
    };

    debugElement.textContent = JSON.stringify(size, null, 2);

    console.log("[HOTELS LIST CUSTOM ELEMENT] size", size);
  }

  renderDebugMessage(message) {
    const debugElement = this.getOrCreateDebugElement();

    debugElement.textContent = message;

    console.error("[HOTELS LIST CUSTOM ELEMENT]", message);
  }

  getOrCreateDebugElement() {
    let debugElement = document.getElementById("hotels-list-debug-fixed");

    if (debugElement) {
      return debugElement;
    }

    debugElement = document.createElement("pre");
    debugElement.id = "hotels-list-debug-fixed";
    debugElement.style.position = "fixed";
    debugElement.style.top = "12px";
    debugElement.style.left = "12px";
    debugElement.style.zIndex = "2147483647";
    debugElement.style.maxWidth = "420px";
    debugElement.style.padding = "10px";
    debugElement.style.margin = "0";
    debugElement.style.background = "#f5f5f5";
    debugElement.style.color = "#111";
    debugElement.style.border = "2px solid #111";
    debugElement.style.borderRadius = "8px";
    debugElement.style.fontFamily = "monospace";
    debugElement.style.fontSize = "12px";
    debugElement.style.lineHeight = "1.4";
    debugElement.style.whiteSpace = "pre-wrap";
    debugElement.style.boxShadow = "0 6px 20px rgba(0,0,0,.25)";

    document.body.appendChild(debugElement);

    return debugElement;
  }
}

customElements.define("hotels-list-custom-element", HotelsListCustomElement);
