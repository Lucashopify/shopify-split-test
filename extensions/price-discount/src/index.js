/**
 * Split Test — Price Discount Function
 *
 * Reads cart attribute _spt_asgn (JSON: { experimentId: variantId, ... })
 * and discount node metafield split_test_app.discount_config
 * (JSON: { experimentId, targetProductId, variants: [{ id, isControl, priceAdjType, priceAdjValue }] })
 * to apply a real price adjustment at checkout.
 */

const NO_DISCOUNT = {
  discounts: [],
  discountApplicationStrategy: "FIRST",
};

function run(input) {
  const asgnAttr = input.cart?.attribute?.value;
  if (!asgnAttr) return NO_DISCOUNT;

  const configStr = input.discountNode?.metafield?.value;
  if (!configStr) return NO_DISCOUNT;

  let asgn, config;
  try {
    asgn = JSON.parse(asgnAttr);
    config = JSON.parse(configStr);
  } catch (_) {
    return NO_DISCOUNT;
  }

  const { experimentId, targetProductId, variants } = config;
  if (!experimentId || !targetProductId || !Array.isArray(variants)) {
    return NO_DISCOUNT;
  }

  const assignedVariantId = asgn[experimentId];
  if (!assignedVariantId) return NO_DISCOUNT;

  const variantConfig = variants.find(function (v) { return v.id === assignedVariantId; });
  if (!variantConfig || variantConfig.isControl) return NO_DISCOUNT;

  var priceAdjType = variantConfig.priceAdjType;
  var priceAdjValue = variantConfig.priceAdjValue;
  if (!priceAdjType || priceAdjValue == null || priceAdjValue <= 0) return NO_DISCOUNT;

  const matchingLines = input.cart.lines.filter(function (line) {
    return line.merchandise && line.merchandise.product && line.merchandise.product.id === targetProductId;
  });
  if (!matchingLines.length) return NO_DISCOUNT;

  var discountValue;
  if (priceAdjType === "percent") {
    discountValue = { percentage: { value: String(priceAdjValue) } };
  } else {
    discountValue = {
      fixedAmount: {
        amount: String(priceAdjValue),
        appliesToEachItem: true,
      },
    };
  }

  return {
    discounts: [{
      targets: matchingLines.map(function (line) {
        return { cartLine: { id: line.id } };
      }),
      value: discountValue,
    }],
    discountApplicationStrategy: "FIRST",
  };
}

// Shopify Functions runtime entry point
var input = ShopifyFunction.readInput();
var output = run(input);
ShopifyFunction.writeOutput(output);
