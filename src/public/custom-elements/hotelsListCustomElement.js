class HotelsListCustomElement extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div
        id="hotels-list-debug"
        style="
          font-family: monospace;
          font-size: 12px;
          line-height: 1.4;
          padding: 8px;
          margin-bottom: 8px;
          background: #f5f5f5;
          color: #111;
          border: 1px solid #ddd;
          border-radius: 6px;
          white-space: pre-wrap;
        "
      ></div>
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
    const debugElement = this.querySelector("#hotels-list-debug");

    if (!debugElement) {
      return;
    }

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
    const debugElement = this.querySelector("#hotels-list-debug");

    if (debugElement) {
      debugElement.textContent = message;
    }

    console.error("[HOTELS LIST CUSTOM ELEMENT]", message);
  }
}

customElements.define("hotels-list-custom-element", HotelsListCustomElement);
