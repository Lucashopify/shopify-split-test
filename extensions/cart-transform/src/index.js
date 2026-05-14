/**
 * Split Test — Cart Transform Function
 *
 * Uses lineUpdate to override the price of a cart line item without
 * showing a discount label or strikethrough.
 *
 * Reads:
 *   cart.attribute("_spt_asgn")  → { experimentId: variantId }
 *   cartTransform.metafield      → { experiments: [...] }
 */

const NO_OP = { operations: [] };

export function run(input) {
  const asgnAttr = input.cart?.attribute?.value;
  if (!asgnAttr) return NO_OP;

  const configStr = input.cartTransform?.metafield?.value;
  if (!configStr) return NO_OP;

  let asgn, config;
  try {
    asgn = JSON.parse(asgnAttr);
    config = JSON.parse(configStr);
  } catch (_) {
    return NO_OP;
  }

  const experiments = config.experiments;
  if (!Array.isArray(experiments) || !experiments.length) return NO_OP;

  const operations = [];
  const lines = input.cart?.lines ?? [];

  for (const line of lines) {
    const merch = line.merchandise;
    if (!merch || !merch.product) continue;

    const productId = merch.product?.id;
    const productHandle = merch.product?.handle;
    const originalAmount = parseFloat(line.cost?.amountPerQuantity?.amount);
    if (isNaN(originalAmount) || originalAmount <= 0) continue;

    for (const exp of experiments) {
      const numericId = productId?.split("/").pop();
      const matched =
        exp.targetProductId === productId ||
        exp.targetProductId === numericId ||
        (exp.targetProductHandle && exp.targetProductHandle === productHandle);
      if (!matched) continue;

      const assignedVariantId = asgn[exp.experimentId];
      if (!assignedVariantId) continue;

      const variantConfig = (exp.variants ?? []).find(
        (v) => v.id === assignedVariantId,
      );
      if (!variantConfig || variantConfig.isControl) continue;

      const adjType = variantConfig.priceAdjType;
      const adjValue = variantConfig.priceAdjValue;
      if (!adjType || adjValue == null || adjValue === 0) continue;

      let newAmount =
        adjType === "percent"
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
              },
            },
          },
        },
      });
      break;
    }
  }

  return { operations };
}
