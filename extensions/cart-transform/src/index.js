/**
 * Split Test — Cart Transform Function
 *
 * Uses update operation to override price at checkout without discount label.
 *
 * Reads assignment from (in order of priority):
 *   1. cart.attribute("spt_asgn")       — set by syncCartAttr() on page load
 *   2. line.attribute("spt_asgn")        — set via hidden form input (Buy it Now flow)
 *   cartTransform.metafield             → { experiments: [...] }
 */

var NO_OP = { operations: [] };

export function run(input) {
  var cart = input && input.cart;
  var cartAsgnStr = cart && cart.attribute && cart.attribute.value;

  var cartTransform = input && input.cartTransform;
  var configStr = cartTransform && cartTransform.metafield && cartTransform.metafield.value;
  if (!configStr) return NO_OP;

  var cartAsgn, config;
  try {
    cartAsgn = cartAsgnStr ? JSON.parse(cartAsgnStr) : null;
    config = JSON.parse(configStr);
  } catch (_) {
    return NO_OP;
  }

  var experiments = config.experiments;
  if (!Array.isArray(experiments) || !experiments.length) return NO_OP;

  var operations = [];
  var lines = (cart && cart.lines) || [];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var merch = line.merchandise;
    if (!merch || !merch.product) continue;

    var productId = merch.product.id;
    var productHandle = merch.product.handle;
    var apq = line.cost && line.cost.amountPerQuantity;
    var originalAmount = parseFloat(apq && apq.amount);
    if (isNaN(originalAmount) || originalAmount <= 0) continue;

    // Resolve assignment: cart-level first, then line-level property (Buy it Now)
    var lineAsgnStr = line.attribute && line.attribute.value;
    var asgn = cartAsgn;
    if (!asgn && lineAsgnStr) {
      try { asgn = JSON.parse(lineAsgnStr); } catch (_) {}
    }
    if (!asgn) continue;

    for (var j = 0; j < experiments.length; j++) {
      var exp = experiments[j];
      var numericId = productId ? productId.split('/').pop() : null;
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

      var newAmount = adjType === 'percent'
        ? originalAmount * (1 + adjValue / 100)
        : originalAmount + adjValue;
      if (newAmount < 0) newAmount = 0;

      var rounded = Math.round(newAmount * 100) / 100;
      var str = String(Math.floor(rounded)) + '.' + (rounded % 1 < 0.1 ? '0' : '') + String(Math.round((rounded % 1) * 100));

      operations.push({
        update: {
          cartLineId: line.id,
          price: {
            adjustment: {
              fixedPricePerUnit: {
                amount: str,
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
