/**
 * Single source of truth for required OAuth scopes.
 * read_X scopes are implied by write_X and not listed explicitly by Shopify,
 * but we still request them so they're clear in the OAuth prompt.
 */
export const REQUIRED_SCOPES =
  "read_products,write_products,read_themes,write_themes,read_orders,write_discounts";
