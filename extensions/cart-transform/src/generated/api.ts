export type Maybe<T> = T;
export type InputMaybe<T> = T;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /**
   * Represents an [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601)-encoded date string.
   * For example, September 7, 2019 is represented as `"2019-07-16"`.
   */
  Date: { input: any; output: any; }
  /**
   * Represents an [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601)-encoded date and time string.
   * For example, 3:50 pm on September 7, 2019 in the time zone of UTC (Coordinated Universal Time) is
   * represented as `"2019-09-07T15:50:00Z`".
   */
  DateTime: { input: any; output: any; }
  /**
   * A subset of the [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) format that
   * includes the date and time but not the timezone which is determined from context.
   *
   * For example, "2018-01-01T00:00:00".
   */
  DateTimeWithoutTimezone: { input: any; output: any; }
  /**
   * A signed decimal number, which supports arbitrary precision and is serialized as a string.
   *
   * Example values: `"29.99"`, `"29.999"`.
   */
  Decimal: { input: any; output: any; }
  /**
   * A function-scoped handle to a refer a resource.
   * The Handle type appears in a JSON response as a String, but it is not intended to be human-readable.
   * Example value: `"10079785100"`
   */
  Handle: { input: any; output: any; }
  /**
   * A [JSON](https://www.json.org/json-en.html) object.
   *
   * Example value:
   * `{
   *   "product": {
   *     "id": "gid://shopify/Product/1346443542550",
   *     "title": "White T-shirt",
   *     "options": [{
   *       "name": "Size",
   *       "values": ["M", "L"]
   *     }]
   *   }
   * }`
   */
  JSON: { input: any; output: any; }
  /**
   * A subset of the [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) format that
   * includes the time but not the date or timezone which is determined from context.
   * For example, "05:43:21".
   */
  TimeWithoutTimezone: { input: any; output: any; }
  /**
   * Represents an [RFC 3986](https://datatracker.ietf.org/doc/html/rfc3986) and
   * [RFC 3987](https://datatracker.ietf.org/doc/html/rfc3987)-compliant URI string.
   *
   * For example, `"https://example.myshopify.com"` is a valid URL. It includes a scheme (`https`) and a host
   * (`example.myshopify.com`).
   */
  URL: { input: any; output: any; }
  /** A void type that can be used to return a null value from a mutation. */
  Void: { input: any; output: any; }
};

/**
 * A custom property. Attributes are used to store additional information about a Shopify resource, such as
 * products, customers, or orders. Attributes are stored as key-value pairs.
 *
 * For example, a list of attributes might include whether a customer is a first-time buyer (`"customer_first_order": "true"`),
 * whether an order is gift-wrapped (`"gift_wrapped": "true"`), a preferred delivery date
 * (`"preferred_delivery_date": "2025-10-01"`), the discount applied (`"loyalty_discount_applied": "10%"`), and any
 * notes provided by the customer (`"customer_notes": "Please leave at the front door"`).
 */
export type Attribute = {
  __typename?: 'Attribute';
  /** The key or name of the attribute. For example, `"customer_first_order"`. */
  key: Scalars['String']['output'];
  /** The value of the attribute. For example, `"true"`. */
  value: Maybe<Scalars['String']['output']>;
};

/**
 * The custom attributes associated with a cart line to store additional information. Cart attributes
 * allow you to collect specific information from customers on the **Cart** page, such as order notes,
 * gift wrapping requests, or custom product details. Attributes are stored as key-value pairs.
 */
export type AttributeOutput = {
  /** The key of the cart line attribute to retrieve. For example, `"gift_wrapping"`. */
  key: Scalars['String']['input'];
  /** The value of the cart line attribute to retrieve. For example, `"true"`. */
  value: Scalars['String']['input'];
};

/**
 * Information about the customer that's interacting with the cart. It includes details such as the
 * customer's email and phone number, and the total amount of money the customer has spent in the store.
 * This information helps personalize the checkout experience and ensures that accurate pricing and delivery options
 * are displayed to customers.
 */
export type BuyerIdentity = {
  __typename?: 'BuyerIdentity';
  /** The [customer](https://help.shopify.com/manual/customers/manage-customers) that's interacting with the cart. */
  customer: Maybe<Customer>;
  /** The email address of the customer that's interacting with the cart. */
  email: Maybe<Scalars['String']['output']>;
  /**
   * Whether the customer is authenticated through their
   * [customer account](https://help.shopify.com/manual/customers/customer-accounts).
   */
  isAuthenticated: Scalars['Boolean']['output'];
  /** The phone number of the customer that's interacting with the cart. */
  phone: Maybe<Scalars['String']['output']>;
  /**
   * The company of a B2B customer that's interacting with the cart.
   * Used to manage and track purchases made by businesses rather than individual customers.
   */
  purchasingCompany: Maybe<PurchasingCompany>;
};

/**
 * The cart where the Function is running. A cart contains the merchandise that a customer intends to purchase
 * and information about the customer, such as the customer's email address and phone number.
 */
export type Cart = HasMetafields & {
  __typename?: 'Cart';
  /**
   * The custom attributes associated with a cart to store additional information. Cart attributes
   * allow you to collect specific information from customers on the **Cart** page, such as order notes,
   * gift wrapping requests, or custom product details. Attributes are stored as key-value pairs.
   */
  attribute: Maybe<Attribute>;
  /**
   * Information about the customer that's interacting with the cart. It includes details such as the
   * customer's email and phone number, and the total amount of money the customer has spent in the store.
   * This information helps personalize the checkout experience and ensures that accurate pricing and delivery options
   * are displayed to customers.
   */
  buyerIdentity: Maybe<BuyerIdentity>;
  /**
   * The items in a cart that the customer intends to purchase. A cart line is an entry in the
   * customer's cart that represents a single unit of a product variant. For example, if a customer adds two
   * different sizes of the same t-shirt to their cart, then each size is represented as a separate cart line.
   */
  lines: Array<CartLine>;
  /**
   * A [custom field](https://shopify.dev/docs/apps/build/custom-data) that stores additional information
   * about a Shopify resource, such as products, orders, and
   * [many more](https://shopify.dev/docs/api/admin-graphql/latest/enums/MetafieldOwnerType).
   * Using [metafields with Shopify Functions](https://shopify.dev/docs/apps/build/functions/input-output/metafields-for-input-queries)
   * enables you to customize the checkout experience.
   */
  metafield: Maybe<Metafield>;
  /** The physical location where a retail order is created or completed. */
  retailLocation: Maybe<Location>;
};


/**
 * The cart where the Function is running. A cart contains the merchandise that a customer intends to purchase
 * and information about the customer, such as the customer's email address and phone number.
 */
export type CartAttributeArgs = {
  key: InputMaybe<Scalars['String']['input']>;
};


/**
 * The cart where the Function is running. A cart contains the merchandise that a customer intends to purchase
 * and information about the customer, such as the customer's email address and phone number.
 */
export type CartMetafieldArgs = {
  key: Scalars['String']['input'];
  namespace: InputMaybe<Scalars['String']['input']>;
};

/**
 * Information about an item in a cart that a customer intends to purchase. A cart line is an entry in the
 * customer's cart that represents a single unit of a product variant. For example, if a customer adds two
 * different sizes of the same t-shirt to their cart, then each size is represented as a separate cart line.
 */
export type CartLine = {
  __typename?: 'CartLine';
  /**
   * The custom attributes associated with a cart to store additional information. Cart attributes
   * allow you to collect specific information from customers on the **Cart** page, such as order notes,
   * gift wrapping requests, or custom product details. Attributes are stored as key-value pairs.
   *
   * Cart line attributes are equivalent to the
   * [`line_item`](https://shopify.dev/docs/api/liquid/objects/line_item)
   * object in Liquid.
   */
  attribute: Maybe<Attribute>;
  /**
   * The cost of an item in a cart that the customer intends to purchase. Cart lines are entries in the customer's
   * cart that represent a single unit of a product variant. For example, if a customer adds two different sizes of
   * the same t-shirt to their cart, then each size is represented as a separate cart line.
   */
  cost: CartLineCost;
  /** The ID of the cart line. */
  id: Scalars['ID']['output'];
  /** The item that the customer intends to purchase. */
  merchandise: Merchandise;
  /** The quantity of the item that the customer intends to purchase. */
  quantity: Scalars['Int']['output'];
  /**
   * The [selling plan](https://shopify.dev/docs/apps/build/purchase-options/subscriptions/selling-plans)
   * associated with the cart line, including information about how a product variant can be sold and purchased.
   */
  sellingPlanAllocation: Maybe<SellingPlanAllocation>;
};


/**
 * Information about an item in a cart that a customer intends to purchase. A cart line is an entry in the
 * customer's cart that represents a single unit of a product variant. For example, if a customer adds two
 * different sizes of the same t-shirt to their cart, then each size is represented as a separate cart line.
 */
export type CartLineAttributeArgs = {
  key: InputMaybe<Scalars['String']['input']>;
};

/**
 * The cost of an item in a cart that the customer intends to purchase. Cart lines are entries in the customer's
 * cart that represent a single unit of a product variant. For example, if a customer adds two different sizes of
 * the same t-shirt to their cart, then each size is represented as a separate cart line.
 */
export type CartLineCost = {
  __typename?: 'CartLineCost';
  /**
   * The cost of a single unit. For example, if a customer purchases three units of a product
   * that are priced at $10 each, then the `amountPerQuantity` is $10.
   */
  amountPerQuantity: MoneyV2;
  /**
   * The `compareAt` price of a single unit before any discounts are applied. This field is used to calculate and display
   * savings for customers. For example, if a product's `compareAtAmountPerQuantity` is $25 and its current price
   * is $20, then the customer sees a $5 discount. This value can change based on the buyer's identity and is
   * `null` when the value is hidden from buyers.
   */
  compareAtAmountPerQuantity: Maybe<MoneyV2>;
  /**
   * The cost of items in the cart before applying any discounts to certain items.
   * This amount serves as the starting point for calculating any potential savings customers
   * might receive through promotions or discounts.
   */
  subtotalAmount: MoneyV2;
  /** The total cost of items in a cart. */
  totalAmount: MoneyV2;
};

export type CartLineInput = {
  /**
   * A [globally-unique ID](https://shopify.dev/docs/api/usage/gids)
   * for a line item in a cart. A cart line represents a single unit of a
   * product variant that a customer intends to purchase.
   */
  cartLineId: Scalars['ID']['input'];
  /** The quantity of the cart line to be merged.The max quantity is 2000. */
  quantity: Scalars['Int']['input'];
};

/**
 * An operation to apply to the cart. For example, you can expand a cart line item to display
 * its [bundled items](https://shopify.dev/docs/apps/build/product-merchandising/bundles), merge
 * multiple cart lines into a single line representing a bundle, and update the presentation of line items
 * in the cart to override their price, title, or image.
 */
export type CartOperation =
  /**
   * An operation that expands a single cart line item to form a
   * [bundle](https://shopify.dev/docs/apps/build/product-merchandising/bundles)
   * of components.
   */
  { expand: ExpandOperation; merge?: never; update?: never; }
  |  /**
   * An operation that merges multiple cart line items into a
   * single line, representing a
   * [bundle](https://shopify.dev/docs/apps/build/product-merchandising/bundles)
   * of components.
   */
  { expand?: never; merge: MergeOperation; update?: never; }
  |  /**
   * An operation that allows you to override the price, title,
   * and image of a cart line item. Only stores on a
   * [Shopify Plus plan](https://help.shopify.com/manual/intro-to-shopify/pricing-plans/plans-features/shopify-plus-plan)
   * can use apps with `update` operations.
   */
  { expand?: never; merge?: never; update: UpdateOperation; };

/**
 * A customization that changes the pricing and
 * presentation of items in a cart. For example,
 * you can modify the appearance of cart items,
 * such as updating titles and images,
 * or [bundling items](https://shopify.dev/docs/apps/build/product-merchandising/bundles).
 */
export type CartTransform = HasMetafields & {
  __typename?: 'CartTransform';
  /**
   * A [custom field](https://shopify.dev/docs/apps/build/custom-data) that stores additional information
   * about a Shopify resource, such as products, orders, and
   * [many more](https://shopify.dev/docs/api/admin-graphql/latest/enums/MetafieldOwnerType).
   * Using [metafields with Shopify Functions](https://shopify.dev/docs/apps/build/functions/input-output/metafields-for-input-queries)
   * enables you to customize the checkout experience.
   */
  metafield: Maybe<Metafield>;
};


/**
 * A customization that changes the pricing and
 * presentation of items in a cart. For example,
 * you can modify the appearance of cart items,
 * such as updating titles and images,
 * or [bundling items](https://shopify.dev/docs/apps/build/product-merchandising/bundles).
 */
export type CartTransformMetafieldArgs = {
  key: Scalars['String']['input'];
  namespace: InputMaybe<Scalars['String']['input']>;
};

/**
 * The output of the Function run target.
 * The object contains the operations to change the pricing and presentation of items
 * in a cart.
 */
export type CartTransformRunResult = {
  /**
   * The ordered list of operations to apply to the cart. For example, you can expand a cart line item to display
   * its [bundled items](https://shopify.dev/docs/apps/build/product-merchandising/bundles), merge
   * multiple cart lines into a single line representing a bundle, and update the presentation of line items
   * in the cart to override their price, title, or image.
   */
  operations: Array<Operation>;
};

/**
 * Whether the product is in the specified collection.
 *
 * A collection is a group of products that can be displayed in online stores and other sales channels in
 * categories, which makes it easy for customers to find them. For example, an athletics store might create
 * different collections for running attire and accessories.
 */
export type CollectionMembership = {
  __typename?: 'CollectionMembership';
  /**
   * A [globally-unique ID](https://shopify.dev/docs/api/usage/gids)
   * for the collection.
   */
  collectionId: Scalars['ID']['output'];
  /** Whether the product is in the specified collection. */
  isMember: Scalars['Boolean']['output'];
};

/** Represents information about a company which is also a customer of the shop. */
export type Company = HasMetafields & {
  __typename?: 'Company';
  /** The date and time ([ISO 8601 format](http://en.wikipedia.org/wiki/ISO_8601)) at which the company was created in Shopify. */
  createdAt: Scalars['DateTime']['output'];
  /** A unique externally-supplied ID for the company. */
  externalId: Maybe<Scalars['String']['output']>;
  /** The ID of the company. */
  id: Scalars['ID']['output'];
  /**
   * A [custom field](https://shopify.dev/docs/apps/build/custom-data) that stores additional information
   * about a Shopify resource, such as products, orders, and
   * [many more](https://shopify.dev/docs/api/admin-graphql/latest/enums/MetafieldOwnerType).
   * Using [metafields with Shopify Functions](https://shopify.dev/docs/apps/build/functions/input-output/metafields-for-input-queries)
   * enables you to customize the checkout experience.
   */
  metafield: Maybe<Metafield>;
  /** The name of the company. */
  name: Scalars['String']['output'];
  /** The date and time ([ISO 8601 format](http://en.wikipedia.org/wiki/ISO_8601)) at which the company was last modified. */
  updatedAt: Scalars['DateTime']['output'];
};


/** Represents information about a company which is also a customer of the shop. */
export type CompanyMetafieldArgs = {
  key: Scalars['String']['input'];
  namespace: InputMaybe<Scalars['String']['input']>;
};

/** A company's main point of contact. */
export type CompanyContact = {
  __typename?: 'CompanyContact';
  /**
   * The date and time ([ISO 8601 format](http://en.wikipedia.org/wiki/ISO_8601))
   * at which the company contact was created in Shopify.
   */
  createdAt: Scalars['DateTime']['output'];
  /** The ID of the company. */
  id: Scalars['ID']['output'];
  /** The company contact's locale (language). */
  locale: Maybe<Scalars['String']['output']>;
  /** The company contact's job title. */
  title: Maybe<Scalars['String']['output']>;
  /**
   * The date and time ([ISO 8601 format](http://en.wikipedia.org/wiki/ISO_8601))
   * at which the company contact was last modified.
   */
  updatedAt: Scalars['DateTime']['output'];
};

/** A company's location. */
export type CompanyLocation = HasMetafields & {
  __typename?: 'CompanyLocation';
  /**
   * The date and time ([ISO 8601 format](http://en.wikipedia.org/wiki/ISO_8601))
   * at which the company location was created in Shopify.
   */
  createdAt: Scalars['DateTime']['output'];
  /** A unique externally-supplied ID for the company. */
  externalId: Maybe<Scalars['String']['output']>;
  /** The ID of the company. */
  id: Scalars['ID']['output'];
  /** The preferred locale of the company location. */
  locale: Maybe<Scalars['String']['output']>;
  /**
   * A [custom field](https://shopify.dev/docs/apps/build/custom-data) that stores additional information
   * about a Shopify resource, such as products, orders, and
   * [many more](https://shopify.dev/docs/api/admin-graphql/latest/enums/MetafieldOwnerType).
   * Using [metafields with Shopify Functions](https://shopify.dev/docs/apps/build/functions/input-output/metafields-for-input-queries)
   * enables you to customize the checkout experience.
   */
  metafield: Maybe<Metafield>;
  /** The name of the company location. */
  name: Scalars['String']['output'];
  /**
   * The date and time ([ISO 8601 format](http://en.wikipedia.org/wiki/ISO_8601))
   * at which the company location was last modified.
   */
  updatedAt: Scalars['DateTime']['output'];
};


/** A company's location. */
export type CompanyLocationMetafieldArgs = {
  key: Scalars['String']['input'];
  namespace: InputMaybe<Scalars['String']['input']>;
};

/**
 * The country for which the store is customized, reflecting local preferences and regulations.
 * Localization might influence the language, currency, and product offerings available in a store to enhance
 * the shopping experience for customers in that region.
 */
export type Country = {
  __typename?: 'Country';
  /** The ISO code of the country. */
  isoCode: CountryCode;
};

/**
 * The code designating a country/region, which generally follows ISO 3166-1 alpha-2 guidelines.
 * If a territory doesn't have a country code value in the `CountryCode` enum, then it might be considered a subdivision
 * of another country. For example, the territories associated with Spain are represented by the country code `ES`,
 * and the territories associated with the United States of America are represented by the country code `US`.
 */
export type CountryCode =
  /** Ascension Island. */
  | 'AC'
  /** Andorra. */
  | 'AD'
  /** United Arab Emirates. */
  | 'AE'
  /** Afghanistan. */
  | 'AF'
  /** Antigua & Barbuda. */
  | 'AG'
  /** Anguilla. */
  | 'AI'
  /** Albania. */
  | 'AL'
  /** Armenia. */
  | 'AM'
  /** Netherlands Antilles. */
  | 'AN'
  /** Angola. */
  | 'AO'
  /** Argentina. */
  | 'AR'
  /** Austria. */
  | 'AT'
  /** Australia. */
  | 'AU'
  /** Aruba. */
  | 'AW'
  /** Åland Islands. */
  | 'AX'
  /** Azerbaijan. */
  | 'AZ'
  /** Bosnia & Herzegovina. */
  | 'BA'
  /** Barbados. */
  | 'BB'
  /** Bangladesh. */
  | 'BD'
  /** Belgium. */
  | 'BE'
  /** Burkina Faso. */
  | 'BF'
  /** Bulgaria. */
  | 'BG'
  /** Bahrain. */
  | 'BH'
  /** Burundi. */
  | 'BI'
  /** Benin. */
  | 'BJ'
  /** St. Barthélemy. */
  | 'BL'
  /** Bermuda. */
  | 'BM'
  /** Brunei. */
  | 'BN'
  /** Bolivia. */
  | 'BO'
  /** Caribbean Netherlands. */
  | 'BQ'
  /** Brazil. */
  | 'BR'
  /** Bahamas. */
  | 'BS'
  /** Bhutan. */
  | 'BT'
  /** Bouvet Island. */
  | 'BV'
  /** Botswana. */
  | 'BW'
  /** Belarus. */
  | 'BY'
  /** Belize. */
  | 'BZ'
  /** Canada. */
  | 'CA'
  /** Cocos (Keeling) Islands. */
  | 'CC'
  /** Congo - Kinshasa. */
  | 'CD'
  /** Central African Republic. */
  | 'CF'
  /** Congo - Brazzaville. */
  | 'CG'
  /** Switzerland. */
  | 'CH'
  /** Côte d’Ivoire. */
  | 'CI'
  /** Cook Islands. */
  | 'CK'
  /** Chile. */
  | 'CL'
  /** Cameroon. */
  | 'CM'
  /** China. */
  | 'CN'
  /** Colombia. */
  | 'CO'
  /** Costa Rica. */
  | 'CR'
  /** Cuba. */
  | 'CU'
  /** Cape Verde. */
  | 'CV'
  /** Curaçao. */
  | 'CW'
  /** Christmas Island. */
  | 'CX'
  /** Cyprus. */
  | 'CY'
  /** Czechia. */
  | 'CZ'
  /** Germany. */
  | 'DE'
  /** Djibouti. */
  | 'DJ'
  /** Denmark. */
  | 'DK'
  /** Dominica. */
  | 'DM'
  /** Dominican Republic. */
  | 'DO'
  /** Algeria. */
  | 'DZ'
  /** Ecuador. */
  | 'EC'
  /** Estonia. */
  | 'EE'
  /** Egypt. */
  | 'EG'
  /** Western Sahara. */
  | 'EH'
  /** Eritrea. */
  | 'ER'
  /** Spain. */
  | 'ES'
  /** Ethiopia. */
  | 'ET'
  /** Finland. */
  | 'FI'
  /** Fiji. */
  | 'FJ'
  /** Falkland Islands. */
  | 'FK'
  /** Faroe Islands. */
  | 'FO'
  /** France. */
  | 'FR'
  /** Gabon. */
  | 'GA'
  /** United Kingdom. */
  | 'GB'
  /** Grenada. */
  | 'GD'
  /** Georgia. */
  | 'GE'
  /** French Guiana. */
  | 'GF'
  /** Guernsey. */
  | 'GG'
  /** Ghana. */
  | 'GH'
  /** Gibraltar. */
  | 'GI'
  /** Greenland. */
  | 'GL'
  /** Gambia. */
  | 'GM'
  /** Guinea. */
  | 'GN'
  /** Guadeloupe. */
  | 'GP'
  /** Equatorial Guinea. */
  | 'GQ'
  /** Greece. */
  | 'GR'
  /** South Georgia & South Sandwich Islands. */
  | 'GS'
  /** Guatemala. */
  | 'GT'
  /** Guinea-Bissau. */
  | 'GW'
  /** Guyana. */
  | 'GY'
  /** Hong Kong SAR. */
  | 'HK'
  /** Heard & McDonald Islands. */
  | 'HM'
  /** Honduras. */
  | 'HN'
  /** Croatia. */
  | 'HR'
  /** Haiti. */
  | 'HT'
  /** Hungary. */
  | 'HU'
  /** Indonesia. */
  | 'ID'
  /** Ireland. */
  | 'IE'
  /** Israel. */
  | 'IL'
  /** Isle of Man. */
  | 'IM'
  /** India. */
  | 'IN'
  /** British Indian Ocean Territory. */
  | 'IO'
  /** Iraq. */
  | 'IQ'
  /** Iran. */
  | 'IR'
  /** Iceland. */
  | 'IS'
  /** Italy. */
  | 'IT'
  /** Jersey. */
  | 'JE'
  /** Jamaica. */
  | 'JM'
  /** Jordan. */
  | 'JO'
  /** Japan. */
  | 'JP'
  /** Kenya. */
  | 'KE'
  /** Kyrgyzstan. */
  | 'KG'
  /** Cambodia. */
  | 'KH'
  /** Kiribati. */
  | 'KI'
  /** Comoros. */
  | 'KM'
  /** St. Kitts & Nevis. */
  | 'KN'
  /** North Korea. */
  | 'KP'
  /** South Korea. */
  | 'KR'
  /** Kuwait. */
  | 'KW'
  /** Cayman Islands. */
  | 'KY'
  /** Kazakhstan. */
  | 'KZ'
  /** Laos. */
  | 'LA'
  /** Lebanon. */
  | 'LB'
  /** St. Lucia. */
  | 'LC'
  /** Liechtenstein. */
  | 'LI'
  /** Sri Lanka. */
  | 'LK'
  /** Liberia. */
  | 'LR'
  /** Lesotho. */
  | 'LS'
  /** Lithuania. */
  | 'LT'
  /** Luxembourg. */
  | 'LU'
  /** Latvia. */
  | 'LV'
  /** Libya. */
  | 'LY'
  /** Morocco. */
  | 'MA'
  /** Monaco. */
  | 'MC'
  /** Moldova. */
  | 'MD'
  /** Montenegro. */
  | 'ME'
  /** St. Martin. */
  | 'MF'
  /** Madagascar. */
  | 'MG'
  /** North Macedonia. */
  | 'MK'
  /** Mali. */
  | 'ML'
  /** Myanmar (Burma). */
  | 'MM'
  /** Mongolia. */
  | 'MN'
  /** Macao SAR. */
  | 'MO'
  /** Martinique. */
  | 'MQ'
  /** Mauritania. */
  | 'MR'
  /** Montserrat. */
  | 'MS'
  /** Malta. */
  | 'MT'
  /** Mauritius. */
  | 'MU'
  /** Maldives. */
  | 'MV'
  /** Malawi. */
  | 'MW'
  /** Mexico. */
  | 'MX'
  /** Malaysia. */
  | 'MY'
  /** Mozambique. */
  | 'MZ'
  /** Namibia. */
  | 'NA'
  /** New Caledonia. */
  | 'NC'
  /** Niger. */
  | 'NE'
  /** Norfolk Island. */
  | 'NF'
  /** Nigeria. */
  | 'NG'
  /** Nicaragua. */
  | 'NI'
  /** Netherlands. */
  | 'NL'
  /** Norway. */
  | 'NO'
  /** Nepal. */
  | 'NP'
  /** Nauru. */
  | 'NR'
  /** Niue. */
  | 'NU'
  /** New Zealand. */
  | 'NZ'
  /** Oman. */
  | 'OM'
  /** Panama. */
  | 'PA'
  /** Peru. */
  | 'PE'
  /** French Polynesia. */
  | 'PF'
  /** Papua New Guinea. */
  | 'PG'
  /** Philippines. */
  | 'PH'
  /** Pakistan. */
  | 'PK'
  /** Poland. */
  | 'PL'
  /** St. Pierre & Miquelon. */
  | 'PM'
  /** Pitcairn Islands. */
  | 'PN'
  /** Palestinian Territories. */
  | 'PS'
  /** Portugal. */
  | 'PT'
  /** Paraguay. */
  | 'PY'
  /** Qatar. */
  | 'QA'
  /** Réunion. */
  | 'RE'
  /** Romania. */
  | 'RO'
  /** Serbia. */
  | 'RS'
  /** Russia. */
  | 'RU'
  /** Rwanda. */
  | 'RW'
  /** Saudi Arabia. */
  | 'SA'
  /** Solomon Islands. */
  | 'SB'
  /** Seychelles. */
  | 'SC'
  /** Sudan. */
  | 'SD'
  /** Sweden. */
  | 'SE'
  /** Singapore. */
  | 'SG'
  /** St. Helena. */
  | 'SH'
  /** Slovenia. */
  | 'SI'
  /** Svalbard & Jan Mayen. */
  | 'SJ'
  /** Slovakia. */
  | 'SK'
  /** Sierra Leone. */
  | 'SL'
  /** San Marino. */
  | 'SM'
  /** Senegal. */
  | 'SN'
  /** Somalia. */
  | 'SO'
  /** Suriname. */
  | 'SR'
  /** South Sudan. */
  | 'SS'
  /** São Tomé & Príncipe. */
  | 'ST'
  /** El Salvador. */
  | 'SV'
  /** Sint Maarten. */
  | 'SX'
  /** Syria. */
  | 'SY'
  /** Eswatini. */
  | 'SZ'
  /** Tristan da Cunha. */
  | 'TA'
  /** Turks & Caicos Islands. */
  | 'TC'
  /** Chad. */
  | 'TD'
  /** French Southern Territories. */
  | 'TF'
  /** Togo. */
  | 'TG'
  /** Thailand. */
  | 'TH'
  /** Tajikistan. */
  | 'TJ'
  /** Tokelau. */
  | 'TK'
  /** Timor-Leste. */
  | 'TL'
  /** Turkmenistan. */
  | 'TM'
  /** Tunisia. */
  | 'TN'
  /** Tonga. */
  | 'TO'
  /** Türkiye. */
  | 'TR'
  /** Trinidad & Tobago. */
  | 'TT'
  /** Tuvalu. */
  | 'TV'
  /** Taiwan. */
  | 'TW'
  /** Tanzania. */
  | 'TZ'
  /** Ukraine. */
  | 'UA'
  /** Uganda. */
  | 'UG'
  /** U.S. Outlying Islands. */
  | 'UM'
  /** United States. */
  | 'US'
  /** Uruguay. */
  | 'UY'
  /** Uzbekistan. */
  | 'UZ'
  /** Vatican City. */
  | 'VA'
  /** St. Vincent & Grenadines. */
  | 'VC'
  /** Venezuela. */
  | 'VE'
  /** British Virgin Islands. */
  | 'VG'
  /** Vietnam. */
  | 'VN'
  /** Vanuatu. */
  | 'VU'
  /** Wallis & Futuna. */
  | 'WF'
  /** Samoa. */
  | 'WS'
  /** Kosovo. */
  | 'XK'
  /** Yemen. */
  | 'YE'
  /** Mayotte. */
  | 'YT'
  /** South Africa. */
  | 'ZA'
  /** Zambia. */
  | 'ZM'
  /** Zimbabwe. */
  | 'ZW'
  /** Unknown Region. */
  | 'ZZ';

/**
 * The currency codes that represent the world currencies throughout the Admin API. Currency codes include
 * [standard ISO 4217 codes](https://en.wikipedia.org/wiki/ISO_4217), legacy codes, non-standard codes,
 * digital currency codes.
 */
export type CurrencyCode =
  /** United Arab Emirates Dirham (AED). */
  | 'AED'
  /** Afghan Afghani (AFN). */
  | 'AFN'
  /** Albanian Lek (ALL). */
  | 'ALL'
  /** Armenian Dram (AMD). */
  | 'AMD'
  /** Netherlands Antillean Guilder. */
  | 'ANG'
  /** Angolan Kwanza (AOA). */
  | 'AOA'
  /** Argentine Pesos (ARS). */
  | 'ARS'
  /** Australian Dollars (AUD). */
  | 'AUD'
  /** Aruban Florin (AWG). */
  | 'AWG'
  /** Azerbaijani Manat (AZN). */
  | 'AZN'
  /** Bosnia and Herzegovina Convertible Mark (BAM). */
  | 'BAM'
  /** Barbadian Dollar (BBD). */
  | 'BBD'
  /** Bangladesh Taka (BDT). */
  | 'BDT'
  /** Bulgarian Lev (BGN). */
  | 'BGN'
  /** Bahraini Dinar (BHD). */
  | 'BHD'
  /** Burundian Franc (BIF). */
  | 'BIF'
  /** Bermudian Dollar (BMD). */
  | 'BMD'
  /** Brunei Dollar (BND). */
  | 'BND'
  /** Bolivian Boliviano (BOB). */
  | 'BOB'
  /** Brazilian Real (BRL). */
  | 'BRL'
  /** Bahamian Dollar (BSD). */
  | 'BSD'
  /** Bhutanese Ngultrum (BTN). */
  | 'BTN'
  /** Botswana Pula (BWP). */
  | 'BWP'
  /** Belarusian Ruble (BYN). */
  | 'BYN'
  /** Belarusian Ruble (BYR). */
  | 'BYR'
  /** Belize Dollar (BZD). */
  | 'BZD'
  /** Canadian Dollars (CAD). */
  | 'CAD'
  /** Congolese franc (CDF). */
  | 'CDF'
  /** Swiss Francs (CHF). */
  | 'CHF'
  /** Chilean Peso (CLP). */
  | 'CLP'
  /** Chinese Yuan Renminbi (CNY). */
  | 'CNY'
  /** Colombian Peso (COP). */
  | 'COP'
  /** Costa Rican Colones (CRC). */
  | 'CRC'
  /** Cape Verdean escudo (CVE). */
  | 'CVE'
  /** Czech Koruny (CZK). */
  | 'CZK'
  /** Djiboutian Franc (DJF). */
  | 'DJF'
  /** Danish Kroner (DKK). */
  | 'DKK'
  /** Dominican Peso (DOP). */
  | 'DOP'
  /** Algerian Dinar (DZD). */
  | 'DZD'
  /** Egyptian Pound (EGP). */
  | 'EGP'
  /** Eritrean Nakfa (ERN). */
  | 'ERN'
  /** Ethiopian Birr (ETB). */
  | 'ETB'
  /** Euro (EUR). */
  | 'EUR'
  /** Fijian Dollars (FJD). */
  | 'FJD'
  /** Falkland Islands Pounds (FKP). */
  | 'FKP'
  /** United Kingdom Pounds (GBP). */
  | 'GBP'
  /** Georgian Lari (GEL). */
  | 'GEL'
  /** Ghanaian Cedi (GHS). */
  | 'GHS'
  /** Gibraltar Pounds (GIP). */
  | 'GIP'
  /** Gambian Dalasi (GMD). */
  | 'GMD'
  /** Guinean Franc (GNF). */
  | 'GNF'
  /** Guatemalan Quetzal (GTQ). */
  | 'GTQ'
  /** Guyanese Dollar (GYD). */
  | 'GYD'
  /** Hong Kong Dollars (HKD). */
  | 'HKD'
  /** Honduran Lempira (HNL). */
  | 'HNL'
  /** Croatian Kuna (HRK). */
  | 'HRK'
  /** Haitian Gourde (HTG). */
  | 'HTG'
  /** Hungarian Forint (HUF). */
  | 'HUF'
  /** Indonesian Rupiah (IDR). */
  | 'IDR'
  /** Israeli New Shekel (NIS). */
  | 'ILS'
  /** Indian Rupees (INR). */
  | 'INR'
  /** Iraqi Dinar (IQD). */
  | 'IQD'
  /** Iranian Rial (IRR). */
  | 'IRR'
  /** Icelandic Kronur (ISK). */
  | 'ISK'
  /** Jersey Pound. */
  | 'JEP'
  /** Jamaican Dollars (JMD). */
  | 'JMD'
  /** Jordanian Dinar (JOD). */
  | 'JOD'
  /** Japanese Yen (JPY). */
  | 'JPY'
  /** Kenyan Shilling (KES). */
  | 'KES'
  /** Kyrgyzstani Som (KGS). */
  | 'KGS'
  /** Cambodian Riel. */
  | 'KHR'
  /** Kiribati Dollar (KID). */
  | 'KID'
  /** Comorian Franc (KMF). */
  | 'KMF'
  /** South Korean Won (KRW). */
  | 'KRW'
  /** Kuwaiti Dinar (KWD). */
  | 'KWD'
  /** Cayman Dollars (KYD). */
  | 'KYD'
  /** Kazakhstani Tenge (KZT). */
  | 'KZT'
  /** Laotian Kip (LAK). */
  | 'LAK'
  /** Lebanese Pounds (LBP). */
  | 'LBP'
  /** Sri Lankan Rupees (LKR). */
  | 'LKR'
  /** Liberian Dollar (LRD). */
  | 'LRD'
  /** Lesotho Loti (LSL). */
  | 'LSL'
  /** Lithuanian Litai (LTL). */
  | 'LTL'
  /** Latvian Lati (LVL). */
  | 'LVL'
  /** Libyan Dinar (LYD). */
  | 'LYD'
  /** Moroccan Dirham. */
  | 'MAD'
  /** Moldovan Leu (MDL). */
  | 'MDL'
  /** Malagasy Ariary (MGA). */
  | 'MGA'
  /** Macedonia Denar (MKD). */
  | 'MKD'
  /** Burmese Kyat (MMK). */
  | 'MMK'
  /** Mongolian Tugrik. */
  | 'MNT'
  /** Macanese Pataca (MOP). */
  | 'MOP'
  /** Mauritanian Ouguiya (MRU). */
  | 'MRU'
  /** Mauritian Rupee (MUR). */
  | 'MUR'
  /** Maldivian Rufiyaa (MVR). */
  | 'MVR'
  /** Malawian Kwacha (MWK). */
  | 'MWK'
  /** Mexican Pesos (MXN). */
  | 'MXN'
  /** Malaysian Ringgits (MYR). */
  | 'MYR'
  /** Mozambican Metical. */
  | 'MZN'
  /** Namibian Dollar. */
  | 'NAD'
  /** Nigerian Naira (NGN). */
  | 'NGN'
  /** Nicaraguan Córdoba (NIO). */
  | 'NIO'
  /** Norwegian Kroner (NOK). */
  | 'NOK'
  /** Nepalese Rupee (NPR). */
  | 'NPR'
  /** New Zealand Dollars (NZD). */
  | 'NZD'
  /** Omani Rial (OMR). */
  | 'OMR'
  /** Panamian Balboa (PAB). */
  | 'PAB'
  /** Peruvian Nuevo Sol (PEN). */
  | 'PEN'
  /** Papua New Guinean Kina (PGK). */
  | 'PGK'
  /** Philippine Peso (PHP). */
  | 'PHP'
  /** Pakistani Rupee (PKR). */
  | 'PKR'
  /** Polish Zlotych (PLN). */
  | 'PLN'
  /** Paraguayan Guarani (PYG). */
  | 'PYG'
  /** Qatari Rial (QAR). */
  | 'QAR'
  /** Romanian Lei (RON). */
  | 'RON'
  /** Serbian dinar (RSD). */
  | 'RSD'
  /** Russian Rubles (RUB). */
  | 'RUB'
  /** Rwandan Franc (RWF). */
  | 'RWF'
  /** Saudi Riyal (SAR). */
  | 'SAR'
  /** Solomon Islands Dollar (SBD). */
  | 'SBD'
  /** Seychellois Rupee (SCR). */
  | 'SCR'
  /** Sudanese Pound (SDG). */
  | 'SDG'
  /** Swedish Kronor (SEK). */
  | 'SEK'
  /** Singapore Dollars (SGD). */
  | 'SGD'
  /** Saint Helena Pounds (SHP). */
  | 'SHP'
  /** Sierra Leonean Leone (SLL). */
  | 'SLL'
  /** Somali Shilling (SOS). */
  | 'SOS'
  /** Surinamese Dollar (SRD). */
  | 'SRD'
  /** South Sudanese Pound (SSP). */
  | 'SSP'
  /** Sao Tome And Principe Dobra (STD). */
  | 'STD'
  /** Sao Tome And Principe Dobra (STN). */
  | 'STN'
  /** Syrian Pound (SYP). */
  | 'SYP'
  /** Swazi Lilangeni (SZL). */
  | 'SZL'
  /** Thai baht (THB). */
  | 'THB'
  /** Tajikistani Somoni (TJS). */
  | 'TJS'
  /** Turkmenistani Manat (TMT). */
  | 'TMT'
  /** Tunisian Dinar (TND). */
  | 'TND'
  /** Tongan Pa'anga (TOP). */
  | 'TOP'
  /** Turkish Lira (TRY). */
  | 'TRY'
  /** Trinidad and Tobago Dollars (TTD). */
  | 'TTD'
  /** Taiwan Dollars (TWD). */
  | 'TWD'
  /** Tanzanian Shilling (TZS). */
  | 'TZS'
  /** Ukrainian Hryvnia (UAH). */
  | 'UAH'
  /** Ugandan Shilling (UGX). */
  | 'UGX'
  /** United States Dollars (USD). */
  | 'USD'
  /** United States Dollars Coin (USDC). */
  | 'USDC'
  /** Uruguayan Pesos (UYU). */
  | 'UYU'
  /** Uzbekistan som (UZS). */
  | 'UZS'
  /** Venezuelan Bolivares (VED). */
  | 'VED'
  /** Venezuelan Bolivares (VEF). */
  | 'VEF'
  /** Venezuelan Bolivares Soberanos (VES). */
  | 'VES'
  /** Vietnamese đồng (VND). */
  | 'VND'
  /** Vanuatu Vatu (VUV). */
  | 'VUV'
  /** Samoan Tala (WST). */
  | 'WST'
  /** Central African CFA Franc (XAF). */
  | 'XAF'
  /** East Caribbean Dollar (XCD). */
  | 'XCD'
  /** West African CFA franc (XOF). */
  | 'XOF'
  /** CFP Franc (XPF). */
  | 'XPF'
  /** Unrecognized currency. */
  | 'XXX'
  /** Yemeni Rial (YER). */
  | 'YER'
  /** South African Rand (ZAR). */
  | 'ZAR'
  /** Zambian Kwacha (ZMW). */
  | 'ZMW';

/**
 * A custom product represents a product that doesn't map to Shopify's
 * [standard product categories](https://help.shopify.com/manual/products/details/product-type).
 * For example, you can use a custom product to manage gift cards, shipping requirements, localized product
 * information, or weight measurements and conversions.
 */
export type CustomProduct = {
  __typename?: 'CustomProduct';
  /** Whether the merchandise is a gift card. */
  isGiftCard: Scalars['Boolean']['output'];
  /**
   * Whether the item needs to be shipped to the customer. For example, a
   * digital gift card doesn't need to be shipped, but a t-shirt does
   * need to be shipped.
   */
  requiresShipping: Scalars['Boolean']['output'];
  /**
   * The localized name for the product that displays to customers. The title is used to construct the product's
   * handle, which is a unique, human-readable string of the product's title. For example, if a product is titled
   * "Black Sunglasses", then the handle is `black-sunglasses`.
   */
  title: Scalars['String']['output'];
  /** The product variant's weight, in the system of measurement set in the `weightUnit` field. */
  weight: Maybe<Scalars['Float']['output']>;
  /** The unit of measurement for weight. */
  weightUnit: WeightUnit;
};

/**
 * Represents a [customer](https://help.shopify.com/manual/customers/manage-customers).
 * `Customer` returns data including the customer's contact information and order history.
 */
export type Customer = HasMetafields & {
  __typename?: 'Customer';
  /**
   * The total amount that the customer has spent on orders.
   * The amount is converted from the shop's currency to the currency of the cart using a market rate.
   */
  amountSpent: MoneyV2;
  /**
   * The full name of the customer, based on the values for `firstName` and `lastName`.
   * If `firstName` and `lastName` aren't specified, then the value is the customer's email address.
   * If the email address isn't specified, then the value is the customer's phone number.
   */
  displayName: Scalars['String']['output'];
  /** The customer's email address. */
  email: Maybe<Scalars['String']['output']>;
  /** The customer's first name. */
  firstName: Maybe<Scalars['String']['output']>;
  /**
   * Whether the customer is associated with any of the specified tags. The customer must have at least one tag
   * from the list to return `true`.
   */
  hasAnyTag: Scalars['Boolean']['output'];
  /** Whether the customer is associated with the specified tags. */
  hasTags: Array<HasTagResponse>;
  /**
   * A [globally-unique ID](https://shopify.dev/docs/api/usage/gids)
   * for the customer.
   */
  id: Scalars['ID']['output'];
  /** The customer's last name. */
  lastName: Maybe<Scalars['String']['output']>;
  /**
   * A [custom field](https://shopify.dev/docs/apps/build/custom-data) that stores additional information
   * about a Shopify resource, such as products, orders, and
   * [many more](https://shopify.dev/docs/api/admin-graphql/latest/enums/MetafieldOwnerType).
   * Using [metafields with Shopify Functions](https://shopify.dev/docs/apps/build/functions/input-output/metafields-for-input-queries)
   * enables you to customize the checkout experience.
   */
  metafield: Maybe<Metafield>;
  /** The total number of orders that the customer has made at the store. */
  numberOfOrders: Scalars['Int']['output'];
};


/**
 * Represents a [customer](https://help.shopify.com/manual/customers/manage-customers).
 * `Customer` returns data including the customer's contact information and order history.
 */
export type CustomerHasAnyTagArgs = {
  tags?: Array<Scalars['String']['input']>;
};


/**
 * Represents a [customer](https://help.shopify.com/manual/customers/manage-customers).
 * `Customer` returns data including the customer's contact information and order history.
 */
export type CustomerHasTagsArgs = {
  tags?: Array<Scalars['String']['input']>;
};


/**
 * Represents a [customer](https://help.shopify.com/manual/customers/manage-customers).
 * `Customer` returns data including the customer's contact information and order history.
 */
export type CustomerMetafieldArgs = {
  key: Scalars['String']['input'];
  namespace: InputMaybe<Scalars['String']['input']>;
};

/**
 * An operation that expands a single cart line item to form a
 * [bundle](https://shopify.dev/docs/apps/build/product-merchandising/bundles)
 * of components.
 */
export type ExpandOperation = {
  /**
   * A [globally-unique ID](https://shopify.dev/docs/api/usage/gids)
   * for a line item in a cart. A cart line represents a single unit of a
   * product variant that a customer intends to purchase.
   */
  cartLineId: Scalars['ID']['input'];
  /**
   * The cart items to expand. Each item in the list is a component of the
   * [bundle](https://shopify.dev/docs/apps/build/product-merchandising/bundles). A
   * bundle is a group of products that are sold together as a single unit.
   */
  expandedCartItems: Array<ExpandedItem>;
  /**
   * The image that replaces the existing image for the group of cart line items.
   * The image must have a publicly accessible URL.
   */
  image: InputMaybe<ImageInput>;
  /**
   * A change to the original price of a group of items. Price adjustments include discounts or additional charges that
   * affect the final price the customer pays. Price adjustments are often used for promotions, special offers,
   * or any price changes that the customer qualifies for.
   */
  price: InputMaybe<PriceAdjustment>;
  /**
   * The title that replaces the existing title for the cart line item.
   * If you don't provide a title, then the title of the product variant is used.
   */
  title: InputMaybe<Scalars['String']['input']>;
};

/**
 * The cart item to expand. Each item is a component of the
 * [bundle](https://shopify.dev/docs/apps/build/product-merchandising/bundles). A
 * bundle is a group of products that are sold together as a single unit.
 */
export type ExpandedItem = {
  /**
   * The custom attributes associated with a cart line to store additional information. Cart attributes
   * allow you to collect specific information from customers on the **Cart** page, such as order notes,
   * gift wrapping requests, or custom product details. Attributes are stored as key-value pairs.
   */
  attributes: InputMaybe<Array<AttributeOutput>>;
  /**
   * A [globally-unique ID](https://shopify.dev/docs/api/usage/gids)
   * for the product variant that represents the expanded item.
   */
  merchandiseId: Scalars['ID']['input'];
  /**
   * A change to the original price of the expanded item. Price adjustments include discounts or additional charges that
   * affect the final price the customer pays. Price adjustments are often used for promotions, special offers,
   * or any price changes that the customer qualifies for.
   */
  price: InputMaybe<ExpandedItemPriceAdjustment>;
  /**
   * The quantity of the expanded item. The maximum quantity is
   * 2000.
   */
  quantity: Scalars['Int']['input'];
};

/** A fixed price per unit adjustment to apply to the expanded item. */
export type ExpandedItemFixedPricePerUnitAdjustment = {
  /** The fixed price amount per quantity of the expanded item in presentment currency. */
  amount: Scalars['Decimal']['input'];
};

/**
 * A change to the original price of the expanded item. Price adjustments include discounts or additional charges that
 * affect the final price the customer pays. Price adjustments are often used for promotions, special offers,
 * or any price changes that the customer qualifies for.
 */
export type ExpandedItemPriceAdjustment = {
  /** The value of the price adjustment to apply to the expanded item. */
  adjustment: ExpandedItemPriceAdjustmentValue;
};

/** A price adjustment to apply to a cart line. */
export type ExpandedItemPriceAdjustmentValue =
  /** A fixed price per unit adjustment to apply to the expanded item. */
  { fixedPricePerUnit: ExpandedItemFixedPricePerUnitAdjustment; };

/**
 * The output of the Function run target.
 * The object contains the operations to change the pricing and presentation of items
 * in a cart. In API versions 2023-10 and beyond, this type is deprecated in favor of `FunctionRunResult`.
 */
export type FunctionResult = {
  /**
   * The ordered list of operations to apply to the cart. For example, you can expand a cart line item to display
   * its [bundled items](https://shopify.dev/docs/apps/build/product-merchandising/bundles), merge
   * multiple cart lines into a single line representing a bundle, and update the presentation of line items
   * in the cart to override their price, title, or image.
   */
  operations: Array<CartOperation>;
};

/**
 * The output of the Function run target.
 * The object contains the operations to change the pricing and presentation of items
 * in a cart.
 */
export type FunctionRunResult = {
  /**
   * The ordered list of operations to apply to the cart. For example, you can expand a cart line item to display
   * its [bundled items](https://shopify.dev/docs/apps/build/product-merchandising/bundles), merge
   * multiple cart lines into a single line representing a bundle, and update the presentation of line items
   * in the cart to override their price, title, or image.
   */
  operations: Array<CartOperation>;
};

/** Represents information about the metafields associated to the specified resource. */
export type HasMetafields = {
  /**
   * A [custom field](https://shopify.dev/docs/apps/build/custom-data) that stores additional information
   * about a Shopify resource, such as products, orders, and
   * [many more](https://shopify.dev/docs/api/admin-graphql/latest/enums/MetafieldOwnerType).
   * Using [metafields with Shopify Functions](https://shopify.dev/docs/apps/build/functions/input-output/metafields-for-input-queries)
   * enables you to customize the checkout experience.
   */
  metafield: Maybe<Metafield>;
};


/** Represents information about the metafields associated to the specified resource. */
export type HasMetafieldsMetafieldArgs = {
  key: Scalars['String']['input'];
  namespace: InputMaybe<Scalars['String']['input']>;
};

/** Whether a Shopify resource, such as a product or customer, has a specified tag. */
export type HasTagResponse = {
  __typename?: 'HasTagResponse';
  /** Whether the Shopify resource has the tag. */
  hasTag: Scalars['Boolean']['output'];
  /**
   * A searchable keyword that's associated with a Shopify resource, such as a product or customer. For example,
   * a merchant might apply the `sports` and `summer` tags to products that are associated with sportswear for
   * summer.
   */
  tag: Scalars['String']['output'];
};

/**
 * An image that replaces the existing image for a single cart line item or group of cart line items.
 * The image must have a publicly accessible URL.
 */
export type ImageInput = {
  /** The URL of the image. */
  url: Scalars['URL']['input'];
};

export type Input = {
  __typename?: 'Input';
  /**
   * The cart where the Function is running. A cart contains the merchandise that a customer intends to purchase
   * and information about the customer, such as the customer's email address and phone number.
   */
  cart: Cart;
  /**
   * A customization that changes the pricing and
   * presentation of items in a cart. For example,
   * you can modify the appearance of cart items,
   * such as updating titles and images,
   * or [bundling items](https://shopify.dev/docs/apps/build/product-merchandising/bundles).
   */
  cartTransform: CartTransform;
  /**
   * The regional and language settings that determine how the Function
   * handles currency, numbers, dates, and other locale-specific values
   * during discount calculations. These settings are based on the store's configured
   * [localization practices](https://shopify.dev/docs/apps/build/functions/localization-practices-shopify-functions).
   */
  localization: Localization;
  /**
   * The exchange rate used to convert discounts between the shop's default
   * currency and the currency that displays to the customer during checkout.
   * For example, if a store operates in USD but a customer is viewing discounts in EUR,
   * then the presentment currency rate handles this conversion for accurate pricing.
   */
  presentmentCurrencyRate: Scalars['Decimal']['output'];
  /**
   * Information about the shop where the Function is running, including the shop's timezone
   * setting and associated [metafields](https://shopify.dev/docs/apps/build/custom-data).
   */
  shop: Shop;
};

/**
 * The language for which the store is customized, ensuring content is tailored to local customers.
 * This includes product descriptions and customer communications that resonate with the target audience.
 */
export type Language = {
  __typename?: 'Language';
  /** The ISO code. */
  isoCode: LanguageCode;
};

/** Language codes supported by Shopify. */
export type LanguageCode =
  /** Afrikaans. */
  | 'AF'
  /** Akan. */
  | 'AK'
  /** Amharic. */
  | 'AM'
  /** Arabic. */
  | 'AR'
  /** Assamese. */
  | 'AS'
  /** Azerbaijani. */
  | 'AZ'
  /** Belarusian. */
  | 'BE'
  /** Bulgarian. */
  | 'BG'
  /** Bambara. */
  | 'BM'
  /** Bangla. */
  | 'BN'
  /** Tibetan. */
  | 'BO'
  /** Breton. */
  | 'BR'
  /** Bosnian. */
  | 'BS'
  /** Catalan. */
  | 'CA'
  /** Chechen. */
  | 'CE'
  /** Central Kurdish. */
  | 'CKB'
  /** Czech. */
  | 'CS'
  /** Church Slavic. */
  | 'CU'
  /** Welsh. */
  | 'CY'
  /** Danish. */
  | 'DA'
  /** German. */
  | 'DE'
  /** Dzongkha. */
  | 'DZ'
  /** Ewe. */
  | 'EE'
  /** Greek. */
  | 'EL'
  /** English. */
  | 'EN'
  /** Esperanto. */
  | 'EO'
  /** Spanish. */
  | 'ES'
  /** Estonian. */
  | 'ET'
  /** Basque. */
  | 'EU'
  /** Persian. */
  | 'FA'
  /** Fulah. */
  | 'FF'
  /** Finnish. */
  | 'FI'
  /** Filipino. */
  | 'FIL'
  /** Faroese. */
  | 'FO'
  /** French. */
  | 'FR'
  /** Western Frisian. */
  | 'FY'
  /** Irish. */
  | 'GA'
  /** Scottish Gaelic. */
  | 'GD'
  /** Galician. */
  | 'GL'
  /** Gujarati. */
  | 'GU'
  /** Manx. */
  | 'GV'
  /** Hausa. */
  | 'HA'
  /** Hebrew. */
  | 'HE'
  /** Hindi. */
  | 'HI'
  /** Croatian. */
  | 'HR'
  /** Hungarian. */
  | 'HU'
  /** Armenian. */
  | 'HY'
  /** Interlingua. */
  | 'IA'
  /** Indonesian. */
  | 'ID'
  /** Igbo. */
  | 'IG'
  /** Sichuan Yi. */
  | 'II'
  /** Icelandic. */
  | 'IS'
  /** Italian. */
  | 'IT'
  /** Japanese. */
  | 'JA'
  /** Javanese. */
  | 'JV'
  /** Georgian. */
  | 'KA'
  /** Kikuyu. */
  | 'KI'
  /** Kazakh. */
  | 'KK'
  /** Kalaallisut. */
  | 'KL'
  /** Khmer. */
  | 'KM'
  /** Kannada. */
  | 'KN'
  /** Korean. */
  | 'KO'
  /** Kashmiri. */
  | 'KS'
  /** Kurdish. */
  | 'KU'
  /** Cornish. */
  | 'KW'
  /** Kyrgyz. */
  | 'KY'
  /** Luxembourgish. */
  | 'LB'
  /** Ganda. */
  | 'LG'
  /** Lingala. */
  | 'LN'
  /** Lao. */
  | 'LO'
  /** Lithuanian. */
  | 'LT'
  /** Luba-Katanga. */
  | 'LU'
  /** Latvian. */
  | 'LV'
  /** Malagasy. */
  | 'MG'
  /** Māori. */
  | 'MI'
  /** Macedonian. */
  | 'MK'
  /** Malayalam. */
  | 'ML'
  /** Mongolian. */
  | 'MN'
  /** Marathi. */
  | 'MR'
  /** Malay. */
  | 'MS'
  /** Maltese. */
  | 'MT'
  /** Burmese. */
  | 'MY'
  /** Norwegian (Bokmål). */
  | 'NB'
  /** North Ndebele. */
  | 'ND'
  /** Nepali. */
  | 'NE'
  /** Dutch. */
  | 'NL'
  /** Norwegian Nynorsk. */
  | 'NN'
  /** Norwegian. */
  | 'NO'
  /** Oromo. */
  | 'OM'
  /** Odia. */
  | 'OR'
  /** Ossetic. */
  | 'OS'
  /** Punjabi. */
  | 'PA'
  /** Polish. */
  | 'PL'
  /** Pashto. */
  | 'PS'
  /** Portuguese. */
  | 'PT'
  /** Portuguese (Brazil). */
  | 'PT_BR'
  /** Portuguese (Portugal). */
  | 'PT_PT'
  /** Quechua. */
  | 'QU'
  /** Romansh. */
  | 'RM'
  /** Rundi. */
  | 'RN'
  /** Romanian. */
  | 'RO'
  /** Russian. */
  | 'RU'
  /** Kinyarwanda. */
  | 'RW'
  /** Sanskrit. */
  | 'SA'
  /** Sardinian. */
  | 'SC'
  /** Sindhi. */
  | 'SD'
  /** Northern Sami. */
  | 'SE'
  /** Sango. */
  | 'SG'
  /** Sinhala. */
  | 'SI'
  /** Slovak. */
  | 'SK'
  /** Slovenian. */
  | 'SL'
  /** Shona. */
  | 'SN'
  /** Somali. */
  | 'SO'
  /** Albanian. */
  | 'SQ'
  /** Serbian. */
  | 'SR'
  /** Sundanese. */
  | 'SU'
  /** Swedish. */
  | 'SV'
  /** Swahili. */
  | 'SW'
  /** Tamil. */
  | 'TA'
  /** Telugu. */
  | 'TE'
  /** Tajik. */
  | 'TG'
  /** Thai. */
  | 'TH'
  /** Tigrinya. */
  | 'TI'
  /** Turkmen. */
  | 'TK'
  /** Tongan. */
  | 'TO'
  /** Turkish. */
  | 'TR'
  /** Tatar. */
  | 'TT'
  /** Uyghur. */
  | 'UG'
  /** Ukrainian. */
  | 'UK'
  /** Urdu. */
  | 'UR'
  /** Uzbek. */
  | 'UZ'
  /** Vietnamese. */
  | 'VI'
  /** Volapük. */
  | 'VO'
  /** Wolof. */
  | 'WO'
  /** Xhosa. */
  | 'XH'
  /** Yiddish. */
  | 'YI'
  /** Yoruba. */
  | 'YO'
  /** Chinese. */
  | 'ZH'
  /** Chinese (Simplified). */
  | 'ZH_CN'
  /** Chinese (Traditional). */
  | 'ZH_TW'
  /** Zulu. */
  | 'ZU';

/**
 * An operation that expands a single cart line item to form a
 * [bundle](https://shopify.dev/docs/apps/build/product-merchandising/bundles)
 * of components.
 */
export type LineExpandOperation = {
  /**
   * A [globally-unique ID](https://shopify.dev/docs/api/usage/gids)
   * for a line item in a cart. A cart line represents a single unit of a
   * product variant that a customer intends to purchase.
   */
  cartLineId: Scalars['ID']['input'];
  /**
   * The cart items to expand. Each item in the list is a component of the
   * [bundle](https://shopify.dev/docs/apps/build/product-merchandising/bundles). A
   * bundle is a group of products that are sold together as a single unit.
   */
  expandedCartItems: Array<ExpandedItem>;
  /**
   * The image that replaces the existing image for the group of cart line items.
   * The image must have a publicly accessible URL.
   */
  image: InputMaybe<ImageInput>;
  /**
   * A change to the original price of a group of items. Price adjustments include discounts or additional charges that
   * affect the final price the customer pays. Price adjustments are often used for promotions, special offers,
   * or any price changes that the customer qualifies for.
   */
  price: InputMaybe<PriceAdjustment>;
  /**
   * The title that replaces the existing title for the cart line item.
   * If you don't provide a title, then the title of the product variant is used.
   */
  title: InputMaybe<Scalars['String']['input']>;
};

/**
 * An operation that allows you to override the price, title,
 * and image of a cart line item. Only stores on a
 * [Shopify Plus plan](https://help.shopify.com/manual/intro-to-shopify/pricing-plans/plans-features/shopify-plus-plan)
 * can use apps with `update` operations.
 */
export type LineUpdateOperation = {
  /**
   * A [globally-unique ID](https://shopify.dev/docs/api/usage/gids)
   * for a line item in a cart. A cart line represents a single unit of a
   * product variant that a customer intends to purchase.
   */
  cartLineId: Scalars['ID']['input'];
  /**
   * The image that replaces the existing image for the cart line item.
   * The image must have a publicly accessible URL.
   * This image is visible in checkout only and is not persisted to orders.
   */
  image: InputMaybe<ImageInput>;
  /**
   * A change to an item's original price. Price adjustments include discounts or additional charges that affect the final
   * price the customer pays. Price adjustments are often used for promotions, special offers, or any price changes
   * for which the customer qualifies.
   */
  price: InputMaybe<LineUpdateOperationPriceAdjustment>;
  /**
   * The title that replaces the existing title for the cart line item.
   * If you don't provide a title, then the title of the product variant is used.
   */
  title: InputMaybe<Scalars['String']['input']>;
};

/** A fixed price per unit adjustment to apply to a cart line. */
export type LineUpdateOperationFixedPricePerUnitAdjustment = {
  /** The fixed price amount per quantity of the cart line item in presentment currency. */
  amount: Scalars['Decimal']['input'];
};

/**
 * A change to an item's original price. Price adjustments include discounts or additional charges that affect the final
 * price the customer pays. Price adjustments are often used for promotions, special offers, or any price changes
 * for which the customer qualifies.
 */
export type LineUpdateOperationPriceAdjustment = {
  /** The price adjustment per unit to apply to the cart line item. */
  adjustment: LineUpdateOperationPriceAdjustmentValue;
};

/** The value of the price adjustment to apply to the updated item. */
export type LineUpdateOperationPriceAdjustmentValue =
  /** A fixed price per unit adjustment to apply to a cart line. */
  { fixedPricePerUnit: LineUpdateOperationFixedPricePerUnitAdjustment; };

/**
 * An operation that merges multiple cart line items into a
 * single line, representing a
 * [bundle](https://shopify.dev/docs/apps/build/product-merchandising/bundles)
 * of components.
 */
export type LinesMergeOperation = {
  /**
   * The custom attributes associated with a cart line to store additional information. Cart attributes
   * allow you to collect specific information from customers on the **Cart** page, such as order notes,
   * gift wrapping requests, or custom product details. Attributes are stored as key-value pairs.
   */
  attributes: InputMaybe<Array<AttributeOutput>>;
  /**
   * The cart items to merge. Each item in the list is a component of the
   * [bundle](https://shopify.dev/docs/apps/build/product-merchandising/bundles).
   */
  cartLines: Array<CartLineInput>;
  /**
   * The image that replaces the existing image for the group of cart line items.
   * The image must have a publicly accessible URL.
   */
  image: InputMaybe<ImageInput>;
  /**
   * The [globally-unique ID](https://shopify.dev/docs/api/usage/gids)
   * of the product variant that represents the collection of cart line items.
   */
  parentVariantId: Scalars['ID']['input'];
  /**
   * A change to the original price of a group of items. Price adjustments include discounts or additional charges that
   * affect the final price the customer pays. Price adjustments are often used for promotions, special offers,
   * or any price changes that the customer qualifies for.
   */
  price: InputMaybe<PriceAdjustment>;
  /**
   * The title that replaces the existing title for a group of cart line items.
   * If you don't provide a title, then the title of the parent variant is used.
   */
  title: InputMaybe<Scalars['String']['input']>;
};

/**
 * The current time based on the
 * [store's timezone setting](https://help.shopify.com/manual/intro-to-shopify/initial-setup/setup-business-settings).
 */
export type LocalTime = {
  __typename?: 'LocalTime';
  /** The current date relative to the parent object. */
  date: Scalars['Date']['output'];
  /** Returns true if the current date and time is at or past the given date and time, and false otherwise. */
  dateTimeAfter: Scalars['Boolean']['output'];
  /** Returns true if the current date and time is before the given date and time, and false otherwise. */
  dateTimeBefore: Scalars['Boolean']['output'];
  /** Returns true if the current date and time is between the two given date and times, and false otherwise. */
  dateTimeBetween: Scalars['Boolean']['output'];
  /** Returns true if the current time is at or past the given time, and false otherwise. */
  timeAfter: Scalars['Boolean']['output'];
  /** Returns true if the current time is at or past the given time, and false otherwise. */
  timeBefore: Scalars['Boolean']['output'];
  /** Returns true if the current time is between the two given times, and false otherwise. */
  timeBetween: Scalars['Boolean']['output'];
};


/**
 * The current time based on the
 * [store's timezone setting](https://help.shopify.com/manual/intro-to-shopify/initial-setup/setup-business-settings).
 */
export type LocalTimeDateTimeAfterArgs = {
  dateTime: Scalars['DateTimeWithoutTimezone']['input'];
};


/**
 * The current time based on the
 * [store's timezone setting](https://help.shopify.com/manual/intro-to-shopify/initial-setup/setup-business-settings).
 */
export type LocalTimeDateTimeBeforeArgs = {
  dateTime: Scalars['DateTimeWithoutTimezone']['input'];
};


/**
 * The current time based on the
 * [store's timezone setting](https://help.shopify.com/manual/intro-to-shopify/initial-setup/setup-business-settings).
 */
export type LocalTimeDateTimeBetweenArgs = {
  endDateTime: Scalars['DateTimeWithoutTimezone']['input'];
  startDateTime: Scalars['DateTimeWithoutTimezone']['input'];
};


/**
 * The current time based on the
 * [store's timezone setting](https://help.shopify.com/manual/intro-to-shopify/initial-setup/setup-business-settings).
 */
export type LocalTimeTimeAfterArgs = {
  time: Scalars['TimeWithoutTimezone']['input'];
};


/**
 * The current time based on the
 * [store's timezone setting](https://help.shopify.com/manual/intro-to-shopify/initial-setup/setup-business-settings).
 */
export type LocalTimeTimeBeforeArgs = {
  time: Scalars['TimeWithoutTimezone']['input'];
};


/**
 * The current time based on the
 * [store's timezone setting](https://help.shopify.com/manual/intro-to-shopify/initial-setup/setup-business-settings).
 */
export type LocalTimeTimeBetweenArgs = {
  endTime: Scalars['TimeWithoutTimezone']['input'];
  startTime: Scalars['TimeWithoutTimezone']['input'];
};

/**
 * Details about the localized experience for the store in a specific region, including country and language
 * settings. The localized experience is determined by the store's settings and the customer's location.
 * Localization ensures that customers can access relevant content and options while browsing or purchasing
 * products in a store.
 */
export type Localization = {
  __typename?: 'Localization';
  /**
   * The country for which the store is customized, reflecting local preferences and regulations.
   * Localization might influence the language, currency, and product offerings available in a store to enhance
   * the shopping experience for customers in that region.
   */
  country: Country;
  /**
   * The language for which the store is customized, ensuring content is tailored to local customers.
   * This includes product descriptions and customer communications that resonate with the target audience.
   */
  language: Language;
  /**
   * The market of the active localized experience.
   * @deprecated This `market` field will be removed in a future version of the API.
   */
  market: Market;
};

/** Represents the location where the inventory resides. */
export type Location = HasMetafields & {
  __typename?: 'Location';
  /** The address of this location. */
  address: LocationAddress;
  /** The location handle. */
  handle: Scalars['Handle']['output'];
  /** The location id. */
  id: Scalars['ID']['output'];
  /**
   * A [custom field](https://shopify.dev/docs/apps/build/custom-data) that stores additional information
   * about a Shopify resource, such as products, orders, and
   * [many more](https://shopify.dev/docs/api/admin-graphql/latest/enums/MetafieldOwnerType).
   * Using [metafields with Shopify Functions](https://shopify.dev/docs/apps/build/functions/input-output/metafields-for-input-queries)
   * enables you to customize the checkout experience.
   */
  metafield: Maybe<Metafield>;
  /** The name of the location. */
  name: Scalars['String']['output'];
};


/** Represents the location where the inventory resides. */
export type LocationMetafieldArgs = {
  key: Scalars['String']['input'];
  namespace: InputMaybe<Scalars['String']['input']>;
};

/** Represents the address of a location. */
export type LocationAddress = {
  __typename?: 'LocationAddress';
  /** The first line of the address for the location. */
  address1: Maybe<Scalars['String']['output']>;
  /** The second line of the address for the location. */
  address2: Maybe<Scalars['String']['output']>;
  /** The city of the location. */
  city: Maybe<Scalars['String']['output']>;
  /** The country of the location. */
  country: Maybe<Scalars['String']['output']>;
  /** The country code of the location. */
  countryCode: Maybe<Scalars['String']['output']>;
  /** A formatted version of the address for the location. */
  formatted: Array<Scalars['String']['output']>;
  /** The approximate latitude coordinates of the location. */
  latitude: Maybe<Scalars['Float']['output']>;
  /** The approximate longitude coordinates of the location. */
  longitude: Maybe<Scalars['Float']['output']>;
  /** The phone number of the location. */
  phone: Maybe<Scalars['String']['output']>;
  /** The province of the location. */
  province: Maybe<Scalars['String']['output']>;
  /** The code for the province, state, or district of the address of the location. */
  provinceCode: Maybe<Scalars['String']['output']>;
  /** The ZIP code of the location. */
  zip: Maybe<Scalars['String']['output']>;
};

/**
 * A market is a group of one or more regions that you want to target for international sales.
 * By creating a market, you can configure a distinct, localized shopping experience for
 * customers from a specific area of the world. For example, you can
 * [change currency](https://shopify.dev/api/admin-graphql/current/mutations/marketCurrencySettingsUpdate),
 * [configure international pricing](https://shopify.dev/api/examples/product-price-lists),
 * or [add market-specific domains or subfolders](https://shopify.dev/api/admin-graphql/current/objects/MarketWebPresence).
 */
export type Market = HasMetafields & {
  __typename?: 'Market';
  /** A human-readable unique string for the market automatically generated from its title. */
  handle: Scalars['Handle']['output'];
  /** A globally-unique identifier. */
  id: Scalars['ID']['output'];
  /**
   * A [custom field](https://shopify.dev/docs/apps/build/custom-data) that stores additional information
   * about a Shopify resource, such as products, orders, and
   * [many more](https://shopify.dev/docs/api/admin-graphql/latest/enums/MetafieldOwnerType).
   * Using [metafields with Shopify Functions](https://shopify.dev/docs/apps/build/functions/input-output/metafields-for-input-queries)
   * enables you to customize the checkout experience.
   */
  metafield: Maybe<Metafield>;
  /** A geographic region which comprises a market. */
  regions: Array<MarketRegion>;
};


/**
 * A market is a group of one or more regions that you want to target for international sales.
 * By creating a market, you can configure a distinct, localized shopping experience for
 * customers from a specific area of the world. For example, you can
 * [change currency](https://shopify.dev/api/admin-graphql/current/mutations/marketCurrencySettingsUpdate),
 * [configure international pricing](https://shopify.dev/api/examples/product-price-lists),
 * or [add market-specific domains or subfolders](https://shopify.dev/api/admin-graphql/current/objects/MarketWebPresence).
 */
export type MarketMetafieldArgs = {
  key: Scalars['String']['input'];
  namespace: InputMaybe<Scalars['String']['input']>;
};

/** Represents a region. */
export type MarketRegion = {
  /** The name of the region in the language of the current localization. */
  name: Maybe<Scalars['String']['output']>;
};

/** A country which comprises a market. */
export type MarketRegionCountry = MarketRegion & {
  __typename?: 'MarketRegionCountry';
  /** The two-letter code for the country. */
  code: CountryCode;
  /** The country name in the language of the current localization. */
  name: Scalars['String']['output'];
};

/**
 * The item that a customer intends to purchase. Merchandise can be a product variant or a custom
 * product.
 *
 * A product variant is a specific version of a product that comes in more than one option, such as size or color.
 * For example, if a merchant sells t-shirts with options for size and color, then a small, blue t-shirt would be
 * one product variant and a large, blue t-shirt would be another.
 *
 * A custom product represents a product that doesn't map to Shopify's
 * [standard product categories](https://help.shopify.com/manual/products/details/product-type).
 * For example, you can use a custom product to manage gift cards, shipping requirements, localized product
 * information, or weight measurements and conversions.
 */
export type Merchandise = CustomProduct | ProductVariant;

/**
 * An operation that merges multiple cart line items into a
 * single line, representing a
 * [bundle](https://shopify.dev/docs/apps/build/product-merchandising/bundles)
 * of components.
 */
export type MergeOperation = {
  /**
   * The custom attributes associated with a cart line to store additional information. Cart attributes
   * allow you to collect specific information from customers on the **Cart** page, such as order notes,
   * gift wrapping requests, or custom product details. Attributes are stored as key-value pairs.
   */
  attributes: InputMaybe<Array<AttributeOutput>>;
  /**
   * The cart items to merge. Each item in the list is a component of the
   * [bundle](https://shopify.dev/docs/apps/build/product-merchandising/bundles).
   */
  cartLines: Array<CartLineInput>;
  /**
   * The image that replaces the existing image for the group of cart line items.
   * The image must have a publicly accessible URL.
   */
  image: InputMaybe<ImageInput>;
  /**
   * The [globally-unique ID](https://shopify.dev/docs/api/usage/gids)
   * of the product variant that represents the collection of cart line items.
   */
  parentVariantId: Scalars['ID']['input'];
  /**
   * A change to the original price of a group of items. Price adjustments include discounts or additional charges that
   * affect the final price the customer pays. Price adjustments are often used for promotions, special offers,
   * or any price changes that the customer qualifies for.
   */
  price: InputMaybe<PriceAdjustment>;
  /**
   * The title that replaces the existing title for a group of cart line items.
   * If you don't provide a title, then the title of the parent variant is used.
   */
  title: InputMaybe<Scalars['String']['input']>;
};

/**
 * [Custom fields](https://shopify.dev/docs/apps/build/custom-data) that store additional information
 * about a Shopify resource, such as products, orders, and
 * [many more](https://shopify.dev/docs/api/admin-graphql/latest/enums/MetafieldOwnerType).
 * Using [metafields with Shopify Functions](https://shopify.dev/docs/apps/build/functions/input-output/metafields-for-input-queries)
 * enables you to customize the checkout experience.
 */
export type Metafield = {
  __typename?: 'Metafield';
  /** The data that's stored in the metafield, using JSON format. */
  jsonValue: Scalars['JSON']['output'];
  /**
   * The [type of data](https://shopify.dev/apps/metafields/types) that the metafield stores in
   * the `value` field.
   */
  type: Scalars['String']['output'];
  /**
   * The data that's stored in the metafield. The data is always stored as a string,
   * regardless of the [metafield's type](https://shopify.dev/apps/metafields/types).
   */
  value: Scalars['String']['output'];
};

/**
 * A precise monetary value and its associated currency. Combines a decimal amount
 * with a three-letter currency code to express prices, costs, and other financial
 * values throughout the API. For example, 12.99 USD.
 */
export type MoneyV2 = {
  __typename?: 'MoneyV2';
  /**
   * A monetary value in decimal format, allowing for precise representation of cents or fractional
   * currency. For example, 12.99.
   */
  amount: Scalars['Decimal']['output'];
  /**
   * The three-letter currency code that represents a world currency used in a store. Currency codes
   * include standard [standard ISO 4217 codes](https://en.wikipedia.org/wiki/ISO_4217), legacy codes,
   * and non-standard codes. For example, USD.
   */
  currencyCode: CurrencyCode;
};

/** The root mutation for the API. */
export type MutationRoot = {
  __typename?: 'MutationRoot';
  /** Handles the Function result for the cart.transform.run target. */
  cartTransformRun: Scalars['Void']['output'];
  /**
   * Handles the Function result.
   * @deprecated Use the target-specific field instead.
   */
  handleResult: Scalars['Void']['output'];
  /** Handles the Function result for the purchase.cart-transform.run target. */
  run: Scalars['Void']['output'];
};


/** The root mutation for the API. */
export type MutationRootCartTransformRunArgs = {
  result: CartTransformRunResult;
};


/** The root mutation for the API. */
export type MutationRootHandleResultArgs = {
  result: FunctionResult;
};


/** The root mutation for the API. */
export type MutationRootRunArgs = {
  result: FunctionRunResult;
};

/**
 * An operation to apply to the cart. For example, you can expand a cart line item to display
 * its [bundled items](https://shopify.dev/docs/apps/build/product-merchandising/bundles), merge
 * multiple cart lines into a single line representing a bundle, and update the presentation of line items
 * in the cart to override their price, title, or image.
 */
export type Operation =
  /**
   * An operation that expands a single cart line item to form a
   * [bundle](https://shopify.dev/docs/apps/build/product-merchandising/bundles)
   * of components.
   */
  { lineExpand: LineExpandOperation; lineUpdate?: never; linesMerge?: never; }
  |  /**
   * An operation that allows you to override the price, title,
   * and image of a cart line item. Only stores on a
   * [Shopify Plus plan](https://help.shopify.com/manual/intro-to-shopify/pricing-plans/plans-features/shopify-plus-plan)
   * can use apps with `update` operations.
   */
  { lineExpand?: never; lineUpdate: LineUpdateOperation; linesMerge?: never; }
  |  /**
   * An operation that merges multiple cart line items into a
   * single line, representing a
   * [bundle](https://shopify.dev/docs/apps/build/product-merchandising/bundles)
   * of components.
   */
  { lineExpand?: never; lineUpdate?: never; linesMerge: LinesMergeOperation; };

/**
 * A change to the original price of a group of items. Price adjustments include discounts or additional charges that
 * affect the final price the customer pays. Price adjustments are often used for promotions, special offers,
 * or any price changes that the customer qualifies for.
 */
export type PriceAdjustment = {
  /** The percentage price decrease of the price adjustment. */
  percentageDecrease: InputMaybe<PriceAdjustmentValue>;
};

export type PriceAdjustmentValue = {
  /** The value of the price adjustment. */
  value: Scalars['Decimal']['input'];
};

/**
 * The goods and services that merchants offer to customers. Products can include details such as
 * title, vendor, and custom data stored in [metafields](https://shopify.dev/docs/apps/build/custom-data).
 * Products can be organized by grouping them into a collection.
 *
 * Learn more about [managing products in a merchant's store](https://help.shopify.com/manual/products).
 */
export type Product = HasMetafields & {
  __typename?: 'Product';
  /**
   * A unique, human-readable string of the product's title. A handle can contain letters, hyphens (`-`), and
   * numbers, but not spaces. The handle is used in the online store URL for the product. For example, if a product
   * is titled "Black Sunglasses", then the handle is `black-sunglasses`.
   */
  handle: Scalars['Handle']['output'];
  /**
   * Whether the product is associated with any of the specified tags. The product must have at least one tag
   * from the list to return `true`.
   */
  hasAnyTag: Scalars['Boolean']['output'];
  /** Whether the product is associated with the specified tags. */
  hasTags: Array<HasTagResponse>;
  /**
   * A [globally-unique ID](https://shopify.dev/docs/api/usage/gids)
   * for the product.
   */
  id: Scalars['ID']['output'];
  /**
   * Whether the product is in any of the specified collections. The product must be in at least one collection
   * from the list to return `true`.
   *
   * A collection is a group of products that can be displayed in online stores and other sales channels in
   * categories, which makes it easy for customers to find them. For example, an athletics store might create
   * different collections for running attire and accessories.
   */
  inAnyCollection: Scalars['Boolean']['output'];
  /**
   * Whether the product is in the specified collections. The product must be in all of the collections in the
   * list to return `true`.
   *
   * A collection is a group of products that can be displayed in online stores and other sales channels in
   * categories, which makes it easy for customers to find them. For example, an athletics store might create
   * different collections for running attire and accessories.
   */
  inCollections: Array<CollectionMembership>;
  /** Whether the product is a gift card. */
  isGiftCard: Scalars['Boolean']['output'];
  /**
   * A [custom field](https://shopify.dev/docs/apps/build/custom-data) that stores additional information
   * about a Shopify resource, such as products, orders, and
   * [many more](https://shopify.dev/docs/api/admin-graphql/latest/enums/MetafieldOwnerType).
   * Using [metafields with Shopify Functions](https://shopify.dev/docs/apps/build/functions/input-output/metafields-for-input-queries)
   * enables you to customize the checkout experience.
   */
  metafield: Maybe<Metafield>;
  /**
   * A custom category for a product. Product types allow merchants to define categories other than the
   * ones available in Shopify's
   * [standard product categories](https://help.shopify.com/manual/products/details/product-type).
   */
  productType: Maybe<Scalars['String']['output']>;
  /**
   * The localized name for the product that displays to customers. The title is used to construct the product's
   * handle, which is a unique, human-readable string of the product's title. For example, if a product is titled
   * "Black Sunglasses", then the handle is `black-sunglasses`.
   */
  title: Scalars['String']['output'];
  /** The name of the product's vendor. */
  vendor: Maybe<Scalars['String']['output']>;
};


/**
 * The goods and services that merchants offer to customers. Products can include details such as
 * title, vendor, and custom data stored in [metafields](https://shopify.dev/docs/apps/build/custom-data).
 * Products can be organized by grouping them into a collection.
 *
 * Learn more about [managing products in a merchant's store](https://help.shopify.com/manual/products).
 */
export type ProductHasAnyTagArgs = {
  tags?: Array<Scalars['String']['input']>;
};


/**
 * The goods and services that merchants offer to customers. Products can include details such as
 * title, vendor, and custom data stored in [metafields](https://shopify.dev/docs/apps/build/custom-data).
 * Products can be organized by grouping them into a collection.
 *
 * Learn more about [managing products in a merchant's store](https://help.shopify.com/manual/products).
 */
export type ProductHasTagsArgs = {
  tags?: Array<Scalars['String']['input']>;
};


/**
 * The goods and services that merchants offer to customers. Products can include details such as
 * title, vendor, and custom data stored in [metafields](https://shopify.dev/docs/apps/build/custom-data).
 * Products can be organized by grouping them into a collection.
 *
 * Learn more about [managing products in a merchant's store](https://help.shopify.com/manual/products).
 */
export type ProductInAnyCollectionArgs = {
  ids?: Array<Scalars['ID']['input']>;
};


/**
 * The goods and services that merchants offer to customers. Products can include details such as
 * title, vendor, and custom data stored in [metafields](https://shopify.dev/docs/apps/build/custom-data).
 * Products can be organized by grouping them into a collection.
 *
 * Learn more about [managing products in a merchant's store](https://help.shopify.com/manual/products).
 */
export type ProductInCollectionsArgs = {
  ids?: Array<Scalars['ID']['input']>;
};


/**
 * The goods and services that merchants offer to customers. Products can include details such as
 * title, vendor, and custom data stored in [metafields](https://shopify.dev/docs/apps/build/custom-data).
 * Products can be organized by grouping them into a collection.
 *
 * Learn more about [managing products in a merchant's store](https://help.shopify.com/manual/products).
 */
export type ProductMetafieldArgs = {
  key: Scalars['String']['input'];
  namespace: InputMaybe<Scalars['String']['input']>;
};

/**
 * A specific version of a product that comes in more than one option, such as size or color. For example,
 * if a merchant sells t-shirts with options for size and color, then a small, blue t-shirt would be one
 * product variant and a large, blue t-shirt would be another.
 */
export type ProductVariant = HasMetafields & {
  __typename?: 'ProductVariant';
  /**
   * A [globally-unique ID](https://shopify.dev/docs/api/usage/gids)
   * for the product variant.
   */
  id: Scalars['ID']['output'];
  /**
   * A [custom field](https://shopify.dev/docs/apps/build/custom-data) that stores additional information
   * about a Shopify resource, such as products, orders, and
   * [many more](https://shopify.dev/docs/api/admin-graphql/latest/enums/MetafieldOwnerType).
   * Using [metafields with Shopify Functions](https://shopify.dev/docs/apps/build/functions/input-output/metafields-for-input-queries)
   * enables you to customize the checkout experience.
   */
  metafield: Maybe<Metafield>;
  /**
   * The product associated with the product variant. For example, if a
   * merchant sells t-shirts with options for size and color, then a small,
   * blue t-shirt would be one product variant and a large, blue t-shirt would be another.
   * The product associated with the product variant would be the t-shirt itself.
   */
  product: Product;
  /**
   * Whether the item needs to be shipped to the customer. For example, a
   * digital gift card doesn't need to be shipped, but a t-shirt does
   * need to be shipped.
   */
  requiresShipping: Scalars['Boolean']['output'];
  /**
   * A case-sensitive identifier for the product variant in the merchant's store. For example, `"BBC-1"`.
   * A product variant must have a SKU to be connected to a
   * [fulfillment service](https://shopify.dev/docs/apps/build/orders-fulfillment/fulfillment-service-apps/build-for-fulfillment-services).
   */
  sku: Maybe<Scalars['String']['output']>;
  /** The localized name for the product variant that displays to customers. */
  title: Maybe<Scalars['String']['output']>;
  /** The product variant's weight, in the system of measurement set in the `weightUnit` field. */
  weight: Maybe<Scalars['Float']['output']>;
  /** The unit of measurement for weight. */
  weightUnit: WeightUnit;
};


/**
 * A specific version of a product that comes in more than one option, such as size or color. For example,
 * if a merchant sells t-shirts with options for size and color, then a small, blue t-shirt would be one
 * product variant and a large, blue t-shirt would be another.
 */
export type ProductVariantMetafieldArgs = {
  key: Scalars['String']['input'];
  namespace: InputMaybe<Scalars['String']['input']>;
};

/**
 * The company of a B2B customer that's interacting with the cart.
 * Used to manage and track purchases made by businesses rather than individual customers.
 */
export type PurchasingCompany = {
  __typename?: 'PurchasingCompany';
  /** The company associated to the order or draft order. */
  company: Company;
  /** The company contact associated to the order or draft order. */
  contact: Maybe<CompanyContact>;
  /** The company location associated to the order or draft order. */
  location: CompanyLocation;
};

/** Represents how products and variants can be sold and purchased. */
export type SellingPlan = HasMetafields & {
  __typename?: 'SellingPlan';
  /** The description of the selling plan. */
  description: Maybe<Scalars['String']['output']>;
  /** A globally-unique identifier. */
  id: Scalars['ID']['output'];
  /**
   * A [custom field](https://shopify.dev/docs/apps/build/custom-data) that stores additional information
   * about a Shopify resource, such as products, orders, and
   * [many more](https://shopify.dev/docs/api/admin-graphql/latest/enums/MetafieldOwnerType).
   * Using [metafields with Shopify Functions](https://shopify.dev/docs/apps/build/functions/input-output/metafields-for-input-queries)
   * enables you to customize the checkout experience.
   */
  metafield: Maybe<Metafield>;
  /** The name of the selling plan. For example, '6 weeks of prepaid granola, delivered weekly'. */
  name: Scalars['String']['output'];
  /** Whether purchasing the selling plan will result in multiple deliveries. */
  recurringDeliveries: Scalars['Boolean']['output'];
};


/** Represents how products and variants can be sold and purchased. */
export type SellingPlanMetafieldArgs = {
  key: Scalars['String']['input'];
  namespace: InputMaybe<Scalars['String']['input']>;
};

/**
 * Represents an association between a variant and a selling plan. Selling plan
 * allocations describe the options offered for each variant, and the price of the
 * variant when purchased with a selling plan.
 */
export type SellingPlanAllocation = {
  __typename?: 'SellingPlanAllocation';
  /**
   * A list of price adjustments, with a maximum of two. When there are two, the
   * first price adjustment goes into effect at the time of purchase, while the
   * second one starts after a certain number of orders. A price adjustment
   * represents how a selling plan affects pricing when a variant is purchased with
   * a selling plan. Prices display in the customer's currency if the shop is
   * configured for it.
   */
  priceAdjustments: Array<SellingPlanAllocationPriceAdjustment>;
  /**
   * A representation of how products and variants can be sold and purchased. For
   * example, an individual selling plan could be '6 weeks of prepaid granola,
   * delivered weekly'.
   */
  sellingPlan: SellingPlan;
};

/** The resulting prices for variants when they're purchased with a specific selling plan. */
export type SellingPlanAllocationPriceAdjustment = {
  __typename?: 'SellingPlanAllocationPriceAdjustment';
  /**
   * The effective price for a single delivery. For example, for a prepaid
   * subscription plan that includes 6 deliveries at the price of $48.00, the per
   * delivery price is $8.00.
   */
  perDeliveryPrice: MoneyV2;
  /**
   * The price of the variant when it's purchased with a selling plan For example,
   * for a prepaid subscription plan that includes 6 deliveries of $10.00 granola,
   * where the customer gets 20% off, the price is 6 x $10.00 x 0.80 = $48.00.
   */
  price: MoneyV2;
};

/**
 * Information about the store, including the store's timezone setting
 * and custom data stored in [metafields](https://shopify.dev/docs/apps/build/custom-data).
 */
export type Shop = HasMetafields & {
  __typename?: 'Shop';
  /**
   * The current time based on the
   * [store's timezone setting](https://help.shopify.com/manual/intro-to-shopify/initial-setup/setup-business-settings).
   */
  localTime: LocalTime;
  /**
   * A [custom field](https://shopify.dev/docs/apps/build/custom-data) that stores additional information
   * about a Shopify resource, such as products, orders, and
   * [many more](https://shopify.dev/docs/api/admin-graphql/latest/enums/MetafieldOwnerType).
   * Using [metafields with Shopify Functions](https://shopify.dev/docs/apps/build/functions/input-output/metafields-for-input-queries)
   * enables you to customize the checkout experience.
   */
  metafield: Maybe<Metafield>;
};


/**
 * Information about the store, including the store's timezone setting
 * and custom data stored in [metafields](https://shopify.dev/docs/apps/build/custom-data).
 */
export type ShopMetafieldArgs = {
  key: Scalars['String']['input'];
  namespace: InputMaybe<Scalars['String']['input']>;
};

/**
 * An operation that allows you to override the price, title,
 * and image of a cart line item. Only stores on a
 * [Shopify Plus plan](https://help.shopify.com/manual/intro-to-shopify/pricing-plans/plans-features/shopify-plus-plan)
 * can use apps with `update` operations.
 */
export type UpdateOperation = {
  /**
   * A [globally-unique ID](https://shopify.dev/docs/api/usage/gids)
   * for a line item in a cart. A cart line represents a single unit of a
   * product variant that a customer intends to purchase.
   */
  cartLineId: Scalars['ID']['input'];
  /**
   * The image that replaces the existing image for the cart line item.
   * The image must have a publicly accessible URL.
   */
  image: InputMaybe<ImageInput>;
  /**
   * A change to an item's original price. Price adjustments include discounts or additional charges that affect the final
   * price the customer pays. Price adjustments are often used for promotions, special offers, or any price changes
   * for which the customer qualifies.
   */
  price: InputMaybe<UpdateOperationPriceAdjustment>;
  /**
   * The title that replaces the existing title for the cart line item.
   * If you don't provide a title, then the title of the product variant is used.
   */
  title: InputMaybe<Scalars['String']['input']>;
};

/** A fixed price per unit adjustment to apply to a cart line. */
export type UpdateOperationFixedPricePerUnitAdjustment = {
  /** The fixed price amount per quantity of the cart line item in presentment currency. */
  amount: Scalars['Decimal']['input'];
};

/**
 * A change to an item's original price. Price adjustments include discounts or additional charges that affect the final
 * price the customer pays. Price adjustments are often used for promotions, special offers, or any price changes
 * for which the customer qualifies.
 */
export type UpdateOperationPriceAdjustment = {
  /** The price adjustment per unit to apply to the cart line item. */
  adjustment: UpdateOperationPriceAdjustmentValue;
};

/** The value of the price adjustment to apply to the updated item. */
export type UpdateOperationPriceAdjustmentValue =
  /** A fixed price per unit adjustment to apply to a cart line. */
  { fixedPricePerUnit: UpdateOperationFixedPricePerUnitAdjustment; };

/** Units of measurement for weight. */
export type WeightUnit =
  /** Metric system unit of mass. */
  | 'GRAMS'
  /** 1 kilogram equals 1000 grams. */
  | 'KILOGRAMS'
  /** Imperial system unit of mass. */
  | 'OUNCES'
  /** 1 pound equals 16 ounces. */
  | 'POUNDS';

export type RunInputQueryVariables = Exact<{ [key: string]: never; }>;


export type RunInputQuery = { __typename?: 'Input', cart: { __typename?: 'Cart', attribute: { __typename?: 'Attribute', value: string }, lines: Array<{ __typename?: 'CartLine', id: string, quantity: number, cost: { __typename?: 'CartLineCost', amountPerQuantity: { __typename?: 'MoneyV2', amount: any, currencyCode: CurrencyCode } }, attribute: { __typename?: 'Attribute', value: string }, merchandise: { __typename?: 'CustomProduct' } | { __typename?: 'ProductVariant', id: string, product: { __typename?: 'Product', id: string, handle: any } } }> }, cartTransform: { __typename?: 'CartTransform', metafield: { __typename?: 'Metafield', value: string } } };
