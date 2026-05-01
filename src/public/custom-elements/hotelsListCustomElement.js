class HotelsListCustomElement extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div id="hotels-list"></div>`;

    console.log("[HOTELS LIST CUSTOM ELEMENT] before sdk load size", {
      innerWidth: window.innerWidth,
      documentClientWidth: document.documentElement.clientWidth,
      hostClientWidth: this.getBoundingClientRect().width
    });

    const script = document.createElement("script");
    script.src = "https://components.liteapi.travel/v1.0/sdk.umd.js";

    script.onload = () => {
      console.log("[HOTELS LIST CUSTOM ELEMENT] sdk loaded size", {
        innerWidth: window.innerWidth,
        documentClientWidth: document.documentElement.clientWidth,
        hostClientWidth: this.getBoundingClientRect().width
      });

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

      console.log("[HOTELS LIST CUSTOM ELEMENT] after create size", {
        innerWidth: window.innerWidth,
        documentClientWidth: document.documentElement.clientWidth,
        hostClientWidth: this.getBoundingClientRect().width
      });

      setTimeout(() => {
        console.log("[HOTELS LIST CUSTOM ELEMENT] after layout settle size", {
          innerWidth: window.innerWidth,
          documentClientWidth: document.documentElement.clientWidth,
          hostClientWidth: this.getBoundingClientRect().width
        });
      }, 1000);
    };

    document.head.appendChild(script);
  }
}

customElements.define("hotels-list-custom-element", HotelsListCustomElement);
