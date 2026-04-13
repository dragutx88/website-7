import { currentCart } from "wix-ecom-backend";

$w.onReady(async function () {
  try {
    const cart = await currentCart.getCurrentCart();
    console.log("CART PAGE currentCart", JSON.stringify(cart, null, 2));
  } catch (error) {
    console.error(
      "CART PAGE getCurrentCart failed",
      error,
      JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
    );
  }
});