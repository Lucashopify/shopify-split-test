/**
 * Split Test — Cart Transform Function
 *
 * Uses lineUpdate to override the price of a cart line item without
 * showing a discount label or strikethrough. Requires Shopify Plus
 * or a development store.
 *
 * Reads:
 *   cart.attribute("_spt_asgn")  → { experimentId: variantId }
 *   cartTransform.metafield      → { experiments: [...] }
 */

var NO_OP = { operations: [] };

function run(input) {
  var asgnAttr = input.cart && input.cart.attribute && input.cart.attribute.value;
  if (!asgnAttr) return NO_OP;

  var configStr = input.cartTransform && input.cartTransform.metafield && input.cartTransform.metafield.value;
  if (!configStr) return NO_OP;

  var asgn, config;
  try {
    asgn = JSON.parse(asgnAttr);
    config = JSON.parse(configStr);
  } catch (_) {
    return NO_OP;
  }

  var experiments = config.experiments;
  if (!Array.isArray(experiments) || !experiments.length) return NO_OP;

  var operations = [];
  var lines = (input.cart && input.cart.lines) || [];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var merch = line.merchandise;
    if (!merch || !merch.product) continue;

    var productId = merch.product.id;
    var productHandle = merch.product.handle;
    var originalAmount = parseFloat(line.cost && line.cost.amountPerQuantity && line.cost.amountPerQuantity.amount);
    var currencyCode = (line.cost && line.cost.amountPerQuantity && line.cost.amountPerQuantity.currencyCode) || 'USD';
    if (isNaN(originalAmount) || originalAmount <= 0) continue;

    for (var j = 0; j < experiments.length; j++) {
      var exp = experiments[j];
      var numericId = productId.split('/').pop();
      var matched = exp.targetProductId === productId ||
                    exp.targetProductId === numericId ||
                    (exp.targetProductHandle && exp.targetProductHandle === productHandle);
      if (!matched) continue;

      var assignedVariantId = asgn[exp.experimentId];
      if (!assignedVariantId) continue;

      var variantConfig = null;
      var variants = exp.variants || [];
      for (var k = 0; k < variants.length; k++) {
        if (variants[k].id === assignedVariantId) {
          variantConfig = variants[k];
          break;
        }
      }
      if (!variantConfig || variantConfig.isControl) continue;

      var adjType = variantConfig.priceAdjType;
      var adjValue = variantConfig.priceAdjValue;
      if (!adjType || adjValue == null || adjValue === 0) continue;

      // adjValue: negative = decrease, positive = increase
      var newAmount = adjType === 'percent'
        ? originalAmount * (1 + adjValue / 100)
        : originalAmount + adjValue;
      if (newAmount < 0) newAmount = 0;

      operations.push({
        lineUpdate: {
          cartLineId: line.id,
          price: {
            adjustment: {
              fixedPricePerUnit: {
                amount: newAmount.toFixed(2),
                currencyCode: currencyCode,
              },
            },
          },
        },
      });
      break;
    }
  }

  return { operations: operations };
}

var input = ShopifyFunction.readInput();
var output = run(input);
ShopifyFunction.writeOutput(output);
