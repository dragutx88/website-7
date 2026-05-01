class HotelsListCustomElement extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div id="hotels-list"></div>`;

    const script = document.createElement("script");
    script.src = "https://components.liteapi.travel/v1.0/sdk.umd.js";

    script.onload = () => {
      window.LiteAPI.init({
        domain: "ozvia.travel"
      });

      window.LiteAPI.HotelsList.create({
        selector: "#hotels-list",
        placeId: "ChIJYeZuBI9YwokRjMDs_IEyCwo",
        primaryColor: "#7057F0",
        hasSearchBar: true,
        rows: 2
      });
    };

    document.head.appendChild(script);
  }
}

customElements.define("hotels-list-custom-element", HotelsListCustomElement);
