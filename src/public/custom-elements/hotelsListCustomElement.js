<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LiteAPI Hotels List Example</title>
    <!-- Include LiteAPI SDK -->
    <script src="https://components.liteapi.travel/v1.0/sdk.umd.js"></script>
  </head>
  <body>
    <!-- Container for the hotel list -->
    <div id="hotels-list"></div>

    <script>
      // Initialize LiteAPI SDK with your domain
      LiteAPI.init({
        domain: 'ozvia.travel',
        deepLinkParams: 'language=fr&currency=EUR',
        labelsOverride: {
          searchAction: 'Search',
          placePlaceholderText: 'Search for a destination',
        },
      });

      // Create the hotels list and render it inside the container
      LiteAPI.HotelsList.create({
        selector: '#hotels-list',
        placeId: 'ChIJdd4hrwug2EcRmSrV3Vo6llI',
        primaryColor: '#7057F0',
        hasSearchBar: true,
        rows: 2,
      });
    </script>
  </body>
</html>
