/**
 * Split Test — Cart Transform Function
 *
 * Reads cart attribute _spt_asgn (JSON: { experimentId: variantId, ... })
 * and the function's metafield split_test_app.cart_transform_config
 * (JSON: { experiments: [{ experimentId, targetProductId, variants: [...] }] })
 *
 * Instead of applying a discount (which shows a label and strikethrough price),
 * this expands the cart line with a new fixedPricePerUnit — the price appears
 * as the regular product price with no discount indicator.
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
    var variantId = merch.id;
    var originalAmount = parseFloat(merch.price && merch.price.amount);
    var currencyCode = (merch.price && merch.price.currencyCode) || 'USD';
    if (isNaN(originalAmount) || originalAmount <= 0) continue;

    for (var j = 0; j < experiments.length; j++) {
      var exp = experiments[j];
      // Match by GID, numeric ID, or handle — DB may store any of these formats
      var numericId = productId.split('/').pop();
      var matched = exp.targetProductId === productId ||
                    exp.targetProductId === numericId ||
                    exp.targetProductId === productHandle ||
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

      // adjValue convention: negative = price decrease, positive = price increase
      // e.g. adjValue = -10, adjType = 'percent' → 10% off
      var newAmount = adjType === 'percent'
        ? originalAmount * (1 + adjValue / 100)
        : originalAmount + adjValue;
      if (newAmount < 0) newAmount = 0;

      operations.push({
        expand: {
          cartLineId: line.id,
          expandedCartItems: [{
            merchandiseId: variantId,
            quantity: line.quantity,
            price: {
              adjustment: {
                fixedPricePerUnit: {
                  amount: newAmount.toFixed(2),
                  currencyCode: currencyCode,
                },
              },
            },
          }],
        },
      });
      break; // only first matching experiment per line
    }
  }

  return { operations: operations };
}

var input = ShopifyFunction.readInput();
var output = run(input);
ShopifyFunction.writeOutput(output);
