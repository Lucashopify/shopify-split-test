import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randF = (min: number, max: number) => Math.random() * (max - min) + min;
const randDate = (start: Date, end: Date) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));

const BATCH = 500;
async function batchInsert<T>(items: T[], fn: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += BATCH) await fn(items.slice(i, i + BATCH));
}

const SEED_EXP_IDS = [
  "seed-exp-1", "seed-exp-2", "seed-exp-3", "seed-exp-4", "seed-exp-5",
  "seed-exp-6", "seed-exp-7", "seed-exp-8", "seed-exp-9", "seed-exp-10",
  "seed-exp-11",
];
const SEED_SEG_IDS = [
  "seed-seg-1", "seed-seg-2", "seed-seg-3", "seed-seg-4", "seed-seg-5", "seed-seg-6",
];

async function main() {
  const shop = await prisma.shop.findFirst({ orderBy: { installedAt: "asc" } });
  if (!shop) { console.error("No shop found."); process.exit(1); }
  console.log(`Seeding: ${shop.shopDomain}`);
  const shopId = shop.id;
  const currency = shop.currency ?? "USD";

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log("Cleaning up previous seed data...");
  await prisma.experimentResult.deleteMany({ where: { experimentId: { in: SEED_EXP_IDS } } });
  await prisma.order.deleteMany({ where: { shopId, shopifyOrderId: { startsWith: "seed-" } } });
  await prisma.event.deleteMany({ where: { experimentId: { in: SEED_EXP_IDS } } });
  await prisma.allocation.deleteMany({ where: { experimentId: { in: SEED_EXP_IDS } } });
  await prisma.variant.deleteMany({ where: { experimentId: { in: SEED_EXP_IDS } } });
  await prisma.experiment.deleteMany({ where: { id: { in: SEED_EXP_IDS } } });
  await prisma.segment.deleteMany({ where: { id: { in: SEED_SEG_IDS } } });
  await prisma.visitor.deleteMany({ where: { shopId, visitorToken: { startsWith: "seed-v-" } } });

  // ── Segments ──────────────────────────────────────────────────────────────
  console.log("Creating segments...");
  await prisma.segment.createMany({
    data: [
      { id: "seed-seg-1", shopId, name: "Mobile shoppers", rules: { op: "AND", children: [{ field: "device", op: "eq", value: "mobile" }] } },
      { id: "seed-seg-2", shopId, name: "US visitors", rules: { op: "AND", children: [{ field: "country", op: "eq", value: "US" }] } },
      { id: "seed-seg-3", shopId, name: "Returning customers", rules: { op: "AND", children: [{ field: "customerType", op: "eq", value: "returning" }] } },
      { id: "seed-seg-4", shopId, name: "First-time visitors", rules: { op: "AND", children: [{ field: "customerType", op: "eq", value: "new" }] } },
      { id: "seed-seg-5", shopId, name: "Organic traffic", rules: { op: "AND", children: [{ field: "utmMedium", op: "eq", value: "organic" }] } },
      { id: "seed-seg-6", shopId, name: "Desktop — high intent", rules: { op: "AND", children: [{ field: "device", op: "eq", value: "desktop" }] } },
    ],
    skipDuplicates: true,
  });

  // ── Experiments ───────────────────────────────────────────────────────────
  console.log("Creating experiments...");

  // exp1: COMPLETED — significant +18.3% (30→10 days ago)
  const exp1 = await prisma.experiment.create({ data: { id: "seed-exp-1", shopId, name: "Homepage Hero — CTA button text", hypothesis: "Changing CTA from 'Shop now' to 'Explore collection' creates curiosity and will increase CVR by 10–20%.", type: "SECTION", status: "COMPLETED", startAt: daysAgo(30), endAt: daysAgo(10), trafficAllocation: 100, primaryMetric: "conversion_rate" } });
  const e1c = await prisma.variant.create({ data: { id: "seed-exp-1-v1", experimentId: exp1.id, name: "Control — Shop now", isControl: true, trafficWeight: 50 } });
  const e1t = await prisma.variant.create({ data: { id: "seed-exp-1-v2", experimentId: exp1.id, name: "Treatment — Explore collection", isControl: false, trafficWeight: 50 } });

  // exp2: RUNNING — significant +14.1% (14 days)
  const exp2 = await prisma.experiment.create({ data: { id: "seed-exp-2", shopId, name: "Free shipping threshold — $50 vs $75", hypothesis: "Lowering free shipping from $75 to $50 will increase AOV and CVR.", type: "PRICE", status: "RUNNING", startAt: daysAgo(14), trafficAllocation: 100, primaryMetric: "conversion_rate" } });
  const e2c = await prisma.variant.create({ data: { id: "seed-exp-2-v1", experimentId: exp2.id, name: "Control — $75 threshold", isControl: true, trafficWeight: 50 } });
  const e2t = await prisma.variant.create({ data: { id: "seed-exp-2-v2", experimentId: exp2.id, name: "Treatment — $50 threshold", isControl: false, trafficWeight: 50 } });

  // exp3: RUNNING — not yet significant +6.2% (8 days)
  const exp3 = await prisma.experiment.create({ data: { id: "seed-exp-3", shopId, name: "Product page — Single vs gallery image", hypothesis: "A single large hero image keeps shoppers focused, increasing ATC rate.", type: "SECTION", status: "RUNNING", startAt: daysAgo(8), trafficAllocation: 100, primaryMetric: "conversion_rate" } });
  const e3c = await prisma.variant.create({ data: { id: "seed-exp-3-v1", experimentId: exp3.id, name: "Control — Gallery", isControl: true, trafficWeight: 50 } });
  const e3t = await prisma.variant.create({ data: { id: "seed-exp-3-v2", experimentId: exp3.id, name: "Treatment — Single hero", isControl: false, trafficWeight: 50 } });

  // exp4: PAUSED — not significant +2.2% (22→5 days ago)
  const exp4 = await prisma.experiment.create({ data: { id: "seed-exp-4", shopId, name: "Collection sort — Featured vs Best Selling", hypothesis: "Sorting by best-selling surfaces popular products first.", type: "SECTION", status: "PAUSED", startAt: daysAgo(22), trafficAllocation: 80, primaryMetric: "conversion_rate" } });
  const e4c = await prisma.variant.create({ data: { id: "seed-exp-4-v1", experimentId: exp4.id, name: "Control — Featured", isControl: true, trafficWeight: 50 } });
  const e4t = await prisma.variant.create({ data: { id: "seed-exp-4-v2", experimentId: exp4.id, name: "Treatment — Best Selling", isControl: false, trafficWeight: 50 } });

  // exp5: DRAFT
  const exp5 = await prisma.experiment.create({ data: { id: "seed-exp-5", shopId, name: "Checkout — Trust badge placement", hypothesis: "Moving trust badges above the payment button reduces anxiety at decision moment.", type: "SECTION", status: "DRAFT", trafficAllocation: 100, primaryMetric: "conversion_rate" } });
  await prisma.variant.create({ data: { id: "seed-exp-5-v1", experimentId: exp5.id, name: "Control — Below form", isControl: true, trafficWeight: 50 } });
  await prisma.variant.create({ data: { id: "seed-exp-5-v2", experimentId: exp5.id, name: "Treatment — Above button", isControl: false, trafficWeight: 50 } });

  // exp6: ARCHIVED — significant +22.4%, treatment won (70→49 days ago)
  const exp6 = await prisma.experiment.create({ data: { id: "seed-exp-6", shopId, name: "Add to Cart — Button color (black vs green)", hypothesis: "A green CTA button creates a stronger purchase signal and will outperform the default black.", type: "SECTION", status: "ARCHIVED", startAt: daysAgo(70), endAt: daysAgo(49), trafficAllocation: 100, primaryMetric: "conversion_rate" } });
  const e6c = await prisma.variant.create({ data: { id: "seed-exp-6-v1", experimentId: exp6.id, name: "Control — Black button", isControl: true, trafficWeight: 50 } });
  const e6t = await prisma.variant.create({ data: { id: "seed-exp-6-v2", experimentId: exp6.id, name: "Treatment — Green button", isControl: false, trafficWeight: 50 } });

  // exp7: ARCHIVED — inconclusive, rolled back (55→41 days ago)
  const exp7 = await prisma.experiment.create({ data: { id: "seed-exp-7", shopId, name: "Homepage — Social proof section", hypothesis: "Displaying a live counter of recent purchases below the hero banner will increase urgency.", type: "SECTION", status: "ARCHIVED", startAt: daysAgo(55), endAt: daysAgo(41), trafficAllocation: 50, primaryMetric: "conversion_rate" } });
  const e7c = await prisma.variant.create({ data: { id: "seed-exp-7-v1", experimentId: exp7.id, name: "Control — No counter", isControl: true, trafficWeight: 50 } });
  const e7t = await prisma.variant.create({ data: { id: "seed-exp-7-v2", experimentId: exp7.id, name: "Treatment — Live purchase counter", isControl: false, trafficWeight: 50 } });

  // exp8: COMPLETED — significant +11.8%, ended 5 days ago (ran 18 days)
  const exp8 = await prisma.experiment.create({ data: { id: "seed-exp-8", shopId, name: "Cart page — Upsell widget position", hypothesis: "Placing the upsell widget directly below cart items (vs sidebar) increases average order value.", type: "SECTION", status: "COMPLETED", startAt: daysAgo(23), endAt: daysAgo(5), trafficAllocation: 100, primaryMetric: "conversion_rate" } });
  const e8c = await prisma.variant.create({ data: { id: "seed-exp-8-v1", experimentId: exp8.id, name: "Control — Sidebar", isControl: true, trafficWeight: 50 } });
  const e8t = await prisma.variant.create({ data: { id: "seed-exp-8-v2", experimentId: exp8.id, name: "Treatment — Below cart items", isControl: false, trafficWeight: 50 } });

  // exp9: ARCHIVED — significant -8.3%, control won (45→33 days ago)
  const exp9 = await prisma.experiment.create({ data: { id: "seed-exp-9", shopId, name: "PDP — Scarcity messaging ('Only 3 left')", hypothesis: "Scarcity messaging on product pages will create urgency and increase conversion rate.", type: "SECTION", status: "ARCHIVED", startAt: daysAgo(45), endAt: daysAgo(33), trafficAllocation: 100, primaryMetric: "conversion_rate" } });
  const e9c = await prisma.variant.create({ data: { id: "seed-exp-9-v1", experimentId: exp9.id, name: "Control — No scarcity", isControl: true, trafficWeight: 50 } });
  const e9t = await prisma.variant.create({ data: { id: "seed-exp-9-v2", experimentId: exp9.id, name: "Treatment — Scarcity badge", isControl: false, trafficWeight: 50 } });

  // exp10: COMPLETED — significant +9.1%, ended 20 days ago (ran 16 days)
  const exp10 = await prisma.experiment.create({ data: { id: "seed-exp-10", shopId, name: "Navigation — Mega menu vs dropdown", hypothesis: "A mega menu with visual product categories will reduce bounce rate and improve exploration.", type: "SECTION", status: "COMPLETED", startAt: daysAgo(36), endAt: daysAgo(20), trafficAllocation: 100, primaryMetric: "conversion_rate" } });
  const e10c = await prisma.variant.create({ data: { id: "seed-exp-10-v1", experimentId: exp10.id, name: "Control — Dropdown menu", isControl: true, trafficWeight: 50 } });
  const e10t = await prisma.variant.create({ data: { id: "seed-exp-10-v2", experimentId: exp10.id, name: "Treatment — Mega menu", isControl: false, trafficWeight: 50 } });

  // exp11: RUNNING — early, collecting data (3 days)
  const exp11 = await prisma.experiment.create({ data: { id: "seed-exp-11", shopId, name: "Search — Autocomplete with product images", hypothesis: "Showing product thumbnails in search autocomplete increases click-through and conversion.", type: "SECTION", status: "RUNNING", startAt: daysAgo(3), trafficAllocation: 100, primaryMetric: "conversion_rate" } });
  const e11c = await prisma.variant.create({ data: { id: "seed-exp-11-v1", experimentId: exp11.id, name: "Control — Text only", isControl: true, trafficWeight: 50 } });
  const e11t = await prisma.variant.create({ data: { id: "seed-exp-11-v2", experimentId: exp11.id, name: "Treatment — Images in autocomplete", isControl: false, trafficWeight: 50 } });

  // ── Visitor pools ─────────────────────────────────────────────────────────
  // Pool layout (non-overlapping):
  // exp1  : 0      – 5695  (5696 vis, split 2840/2856)
  // exp2  : 5696   – 8953  (3258 vis, split 1620/1638)
  // exp3  : 8954   – 10604 (1651 vis, split 820/831)
  // exp4  : 10605  – 14502 (3898 vis, split 1940/1958)
  // exp6  : 14503  – 18902 (4400 vis, split 2200/2200)
  // exp7  : 18903  – 21702 (2800 vis, split 1400/1400)
  // exp8  : 21703  – 26502 (4800 vis, split 2400/2400)
  // exp9  : 26503  – 28902 (2400 vis, split 1200/1200)
  // exp10 : 28903  – 32502 (3600 vis, split 1800/1800)
  // exp11 : 32503  – 33702 (1200 vis, split 600/600)
  // extra : 33703  – 34999
  const TOTAL_VISITORS = 35000;
  const devices = ["mobile", "mobile", "mobile", "desktop", "desktop", "tablet"];
  const countries = ["US", "US", "US", "US", "GB", "CA", "AU", "DE", "FR", "NL"];

  console.log(`Creating ${TOTAL_VISITORS} visitors...`);
  for (let i = 0; i < TOTAL_VISITORS; i += 1000) {
    await prisma.visitor.createMany({
      data: Array.from({ length: Math.min(1000, TOTAL_VISITORS - i) }, (_, j) => ({
        shopId,
        visitorToken: `seed-v-${i + j}`,
        device: devices[(i + j) % devices.length],
        country: countries[(i + j) % countries.length],
        customerType: (i + j) % 5 === 0 ? "returning" : "new",
        firstSeenAt: daysAgo(rand(1, 90)),
        lastSeenAt: daysAgo(rand(0, 3)),
      })),
      skipDuplicates: true,
    });
  }

  const allVis = await prisma.visitor.findMany({
    where: { shopId, visitorToken: { startsWith: "seed-v-" } },
    select: { id: true },
    orderBy: { visitorToken: "asc" },
  });
  const vIds = allVis.map(v => v.id);
  console.log(`  Fetched ${vIds.length} visitor IDs`);

  const pools = {
    e1c:  vIds.slice(0,     2840),
    e1t:  vIds.slice(2840,  5696),
    e2c:  vIds.slice(5696,  7316),
    e2t:  vIds.slice(7316,  8954),
    e3c:  vIds.slice(8954,  9774),
    e3t:  vIds.slice(9774,  10605),
    e4c:  vIds.slice(10605, 12545),
    e4t:  vIds.slice(12545, 14503),
    e6c:  vIds.slice(14503, 16703),
    e6t:  vIds.slice(16703, 18903),
    e7c:  vIds.slice(18903, 20303),
    e7t:  vIds.slice(20303, 21703),
    e8c:  vIds.slice(21703, 24103),
    e8t:  vIds.slice(24103, 26503),
    e9c:  vIds.slice(26503, 27703),
    e9t:  vIds.slice(27703, 28903),
    e10c: vIds.slice(28903, 30703),
    e10t: vIds.slice(30703, 32503),
    e11c: vIds.slice(32503, 33103),
    e11t: vIds.slice(33103, 33703),
  };

  // ── Allocations ───────────────────────────────────────────────────────────
  console.log("Creating allocations...");
  const allocGroups = [
    { expId: exp1.id,  varId: e1c.id,  vis: pools.e1c,  start: daysAgo(30), end: daysAgo(10) },
    { expId: exp1.id,  varId: e1t.id,  vis: pools.e1t,  start: daysAgo(30), end: daysAgo(10) },
    { expId: exp2.id,  varId: e2c.id,  vis: pools.e2c,  start: daysAgo(14), end: new Date() },
    { expId: exp2.id,  varId: e2t.id,  vis: pools.e2t,  start: daysAgo(14), end: new Date() },
    { expId: exp3.id,  varId: e3c.id,  vis: pools.e3c,  start: daysAgo(8),  end: new Date() },
    { expId: exp3.id,  varId: e3t.id,  vis: pools.e3t,  start: daysAgo(8),  end: new Date() },
    { expId: exp4.id,  varId: e4c.id,  vis: pools.e4c,  start: daysAgo(22), end: daysAgo(5) },
    { expId: exp4.id,  varId: e4t.id,  vis: pools.e4t,  start: daysAgo(22), end: daysAgo(5) },
    { expId: exp6.id,  varId: e6c.id,  vis: pools.e6c,  start: daysAgo(70), end: daysAgo(49) },
    { expId: exp6.id,  varId: e6t.id,  vis: pools.e6t,  start: daysAgo(70), end: daysAgo(49) },
    { expId: exp7.id,  varId: e7c.id,  vis: pools.e7c,  start: daysAgo(55), end: daysAgo(41) },
    { expId: exp7.id,  varId: e7t.id,  vis: pools.e7t,  start: daysAgo(55), end: daysAgo(41) },
    { expId: exp8.id,  varId: e8c.id,  vis: pools.e8c,  start: daysAgo(23), end: daysAgo(5) },
    { expId: exp8.id,  varId: e8t.id,  vis: pools.e8t,  start: daysAgo(23), end: daysAgo(5) },
    { expId: exp9.id,  varId: e9c.id,  vis: pools.e9c,  start: daysAgo(45), end: daysAgo(33) },
    { expId: exp9.id,  varId: e9t.id,  vis: pools.e9t,  start: daysAgo(45), end: daysAgo(33) },
    { expId: exp10.id, varId: e10c.id, vis: pools.e10c, start: daysAgo(36), end: daysAgo(20) },
    { expId: exp10.id, varId: e10t.id, vis: pools.e10t, start: daysAgo(36), end: daysAgo(20) },
    { expId: exp11.id, varId: e11c.id, vis: pools.e11c, start: daysAgo(3),  end: new Date() },
    { expId: exp11.id, varId: e11t.id, vis: pools.e11t, start: daysAgo(3),  end: new Date() },
  ];

  let totalAllocs = 0;
  for (const g of allocGroups) {
    const rows = g.vis.map(visitorId => ({ experimentId: g.expId, variantId: g.varId, visitorId, assignedAt: randDate(g.start, g.end) }));
    await batchInsert(rows, batch => prisma.allocation.createMany({ data: batch, skipDuplicates: true }));
    totalAllocs += rows.length;
  }
  console.log(`  Created ${totalAllocs} allocations`);

  // ── Events ────────────────────────────────────────────────────────────────
  console.log("Creating events...");

  interface EvRow { shopId: string; experimentId: string; variantId: string; visitorId: string; type: string; occurredAt: Date; }

  function buildEvents(expId: string, varId: string, vis: string[], start: Date, end: Date, atcRate: number, coRate: number): EvRow[] {
    const rows: EvRow[] = [];
    for (const visitorId of vis) {
      const pvDate = randDate(start, end);
      rows.push({ shopId, experimentId: expId, variantId: varId, visitorId, type: "PAGE_VIEW", occurredAt: pvDate });
      if (Math.random() < atcRate) {
        const atcDate = new Date(pvDate.getTime() + rand(30_000, 300_000));
        rows.push({ shopId, experimentId: expId, variantId: varId, visitorId, type: "ADD_TO_CART", occurredAt: atcDate });
        if (Math.random() < coRate) {
          rows.push({ shopId, experimentId: expId, variantId: varId, visitorId, type: "INITIATE_CHECKOUT", occurredAt: new Date(atcDate.getTime() + rand(30_000, 180_000)) });
        }
      }
    }
    return rows;
  }

  const eventGroups = [
    { expId: exp1.id,  varId: e1c.id,  vis: pools.e1c,  start: daysAgo(30), end: daysAgo(10), atc: 0.110, co: 0.635 },
    { expId: exp1.id,  varId: e1t.id,  vis: pools.e1t,  start: daysAgo(30), end: daysAgo(10), atc: 0.130, co: 0.650 },
    { expId: exp2.id,  varId: e2c.id,  vis: pools.e2c,  start: daysAgo(14), end: new Date(),  atc: 0.110, co: 0.630 },
    { expId: exp2.id,  varId: e2t.id,  vis: pools.e2t,  start: daysAgo(14), end: new Date(),  atc: 0.142, co: 0.660 },
    { expId: exp3.id,  varId: e3c.id,  vis: pools.e3c,  start: daysAgo(8),  end: new Date(),  atc: 0.115, co: 0.617 },
    { expId: exp3.id,  varId: e3t.id,  vis: pools.e3t,  start: daysAgo(8),  end: new Date(),  atc: 0.124, co: 0.631 },
    { expId: exp4.id,  varId: e4c.id,  vis: pools.e4c,  start: daysAgo(22), end: daysAgo(5),  atc: 0.104, co: 0.635 },
    { expId: exp4.id,  varId: e4t.id,  vis: pools.e4t,  start: daysAgo(22), end: daysAgo(5),  atc: 0.109, co: 0.640 },
    { expId: exp6.id,  varId: e6c.id,  vis: pools.e6c,  start: daysAgo(70), end: daysAgo(49), atc: 0.098, co: 0.612 },
    { expId: exp6.id,  varId: e6t.id,  vis: pools.e6t,  start: daysAgo(70), end: daysAgo(49), atc: 0.127, co: 0.660 },
    { expId: exp7.id,  varId: e7c.id,  vis: pools.e7c,  start: daysAgo(55), end: daysAgo(41), atc: 0.108, co: 0.628 },
    { expId: exp7.id,  varId: e7t.id,  vis: pools.e7t,  start: daysAgo(55), end: daysAgo(41), atc: 0.111, co: 0.631 },
    { expId: exp8.id,  varId: e8c.id,  vis: pools.e8c,  start: daysAgo(23), end: daysAgo(5),  atc: 0.112, co: 0.620 },
    { expId: exp8.id,  varId: e8t.id,  vis: pools.e8t,  start: daysAgo(23), end: daysAgo(5),  atc: 0.132, co: 0.655 },
    { expId: exp9.id,  varId: e9c.id,  vis: pools.e9c,  start: daysAgo(45), end: daysAgo(33), atc: 0.116, co: 0.638 },
    { expId: exp9.id,  varId: e9t.id,  vis: pools.e9t,  start: daysAgo(45), end: daysAgo(33), atc: 0.101, co: 0.608 },
    { expId: exp10.id, varId: e10c.id, vis: pools.e10c, start: daysAgo(36), end: daysAgo(20), atc: 0.109, co: 0.622 },
    { expId: exp10.id, varId: e10t.id, vis: pools.e10t, start: daysAgo(36), end: daysAgo(20), atc: 0.125, co: 0.648 },
    { expId: exp11.id, varId: e11c.id, vis: pools.e11c, start: daysAgo(3),  end: new Date(),  atc: 0.118, co: 0.624 },
    { expId: exp11.id, varId: e11t.id, vis: pools.e11t, start: daysAgo(3),  end: new Date(),  atc: 0.129, co: 0.641 },
  ];

  let totalEvents = 0;
  for (const g of eventGroups) {
    const rows = buildEvents(g.expId, g.varId, g.vis, g.start, g.end, g.atc, g.co);
    await batchInsert(rows, batch => prisma.event.createMany({ data: batch as Parameters<typeof prisma.event.createMany>[0]["data"] }));
    totalEvents += rows.length;
  }
  console.log(`  Created ${totalEvents} events`);

  // ── Orders ────────────────────────────────────────────────────────────────
  console.log("Creating orders...");

  interface OrdRow { shopId: string; shopifyOrderId: string; shopifyOrderGid: string; experimentId: string; variantId: string; visitorId: string; revenue: number; currency: string; itemCount: number; processedAt: Date; status: string; }

  function buildOrders(expId: string, varId: string, vis: string[], start: Date, end: Date, cvr: number, avgRev: number, prefix: string): OrdRow[] {
    return vis.flatMap((visitorId, i) =>
      Math.random() < cvr ? [{
        shopId, experimentId: expId, variantId: varId, visitorId,
        shopifyOrderId: `seed-${prefix}-${i}`,
        shopifyOrderGid: `gid://shopify/Order/seed-${prefix}-${i}`,
        revenue: Math.round(randF(avgRev * 0.5, avgRev * 1.6) * 100) / 100,
        currency, itemCount: rand(1, 4),
        processedAt: randDate(start, end), status: "paid",
      }] : []
    );
  }

  const orderGroups = [
    { expId: exp1.id,  varId: e1c.id,  vis: pools.e1c,  start: daysAgo(30), end: daysAgo(10), cvr: 0.050, rev: 131.86, prefix: "e1c" },
    { expId: exp1.id,  varId: e1t.id,  vis: pools.e1t,  start: daysAgo(30), end: daysAgo(10), cvr: 0.059, rev: 132.20, prefix: "e1t" },
    { expId: exp2.id,  varId: e2c.id,  vis: pools.e2c,  start: daysAgo(14), end: new Date(),  cvr: 0.054, rev: 118.40, prefix: "e2c" },
    { expId: exp2.id,  varId: e2t.id,  vis: pools.e2t,  start: daysAgo(14), end: new Date(),  cvr: 0.072, rev: 124.60, prefix: "e2t" },
    { expId: exp3.id,  varId: e3c.id,  vis: pools.e3c,  start: daysAgo(8),  end: new Date(),  cvr: 0.046, rev: 109.20, prefix: "e3c" },
    { expId: exp3.id,  varId: e3t.id,  vis: pools.e3t,  start: daysAgo(8),  end: new Date(),  cvr: 0.053, rev: 111.80, prefix: "e3t" },
    { expId: exp4.id,  varId: e4c.id,  vis: pools.e4c,  start: daysAgo(22), end: daysAgo(5),  cvr: 0.053, rev: 126.50, prefix: "e4c" },
    { expId: exp4.id,  varId: e4t.id,  vis: pools.e4t,  start: daysAgo(22), end: daysAgo(5),  cvr: 0.055, rev: 127.90, prefix: "e4t" },
    { expId: exp6.id,  varId: e6c.id,  vis: pools.e6c,  start: daysAgo(70), end: daysAgo(49), cvr: 0.046, rev: 122.40, prefix: "e6c" },
    { expId: exp6.id,  varId: e6t.id,  vis: pools.e6t,  start: daysAgo(70), end: daysAgo(49), cvr: 0.058, rev: 124.80, prefix: "e6t" },
    { expId: exp7.id,  varId: e7c.id,  vis: pools.e7c,  start: daysAgo(55), end: daysAgo(41), cvr: 0.051, rev: 119.60, prefix: "e7c" },
    { expId: exp7.id,  varId: e7t.id,  vis: pools.e7t,  start: daysAgo(55), end: daysAgo(41), cvr: 0.052, rev: 120.10, prefix: "e7t" },
    { expId: exp8.id,  varId: e8c.id,  vis: pools.e8c,  start: daysAgo(23), end: daysAgo(5),  cvr: 0.051, rev: 134.20, prefix: "e8c" },
    { expId: exp8.id,  varId: e8t.id,  vis: pools.e8t,  start: daysAgo(23), end: daysAgo(5),  cvr: 0.062, rev: 148.60, prefix: "e8t" },
    { expId: exp9.id,  varId: e9c.id,  vis: pools.e9c,  start: daysAgo(45), end: daysAgo(33), cvr: 0.055, rev: 117.80, prefix: "e9c" },
    { expId: exp9.id,  varId: e9t.id,  vis: pools.e9t,  start: daysAgo(45), end: daysAgo(33), cvr: 0.049, rev: 114.30, prefix: "e9t" },
    { expId: exp10.id, varId: e10c.id, vis: pools.e10c, start: daysAgo(36), end: daysAgo(20), cvr: 0.052, rev: 128.90, prefix: "e10c" },
    { expId: exp10.id, varId: e10t.id, vis: pools.e10t, start: daysAgo(36), end: daysAgo(20), cvr: 0.058, rev: 131.40, prefix: "e10t" },
    { expId: exp11.id, varId: e11c.id, vis: pools.e11c, start: daysAgo(3),  end: new Date(),  cvr: 0.048, rev: 112.40, prefix: "e11c" },
    { expId: exp11.id, varId: e11t.id, vis: pools.e11t, start: daysAgo(3),  end: new Date(),  cvr: 0.053, rev: 114.20, prefix: "e11t" },
  ];

  let totalOrders = 0;
  for (const g of orderGroups) {
    const rows = buildOrders(g.expId, g.varId, g.vis, g.start, g.end, g.cvr, g.rev, g.prefix);
    await batchInsert(rows, batch => prisma.order.createMany({ data: batch, skipDuplicates: true }));
    totalOrders += rows.length;
  }
  console.log(`  Created ${totalOrders} orders`);

  // ── ExperimentResult rollup rows ──────────────────────────────────────────
  console.log("Creating ExperimentResult rows...");
  await prisma.experimentResult.createMany({
    data: [
      // exp1 COMPLETED — significant +18.3%
      { experimentId: exp1.id, variantId: e1c.id, windowStart: daysAgo(30), windowEnd: daysAgo(10), sessions: 2840, uniqueVisitors: 2840, addToCartCount: 312, initiateCheckoutCount: 198, conversionCount: 142, revenue: 18724.50, cvr: 0.0500, aov: 131.86, rpv: 6.60, atcRate: 0.110, pValue: 0.003, liftPct: 0.0, liftCiLow: 0.0, liftCiHigh: 0.0, bayesianProbBest: 0.003 },
      { experimentId: exp1.id, variantId: e1t.id, windowStart: daysAgo(30), windowEnd: daysAgo(10), sessions: 2856, uniqueVisitors: 2856, addToCartCount: 371, initiateCheckoutCount: 241, conversionCount: 169, revenue: 22341.80, cvr: 0.0592, aov: 132.20, rpv: 7.82, atcRate: 0.130, pValue: 0.003, liftPct: 0.183, liftCiLow: 0.072, liftCiHigh: 0.301, bayesianProbBest: 0.997 },
      // exp2 RUNNING — significant +14.1%
      { experimentId: exp2.id, variantId: e2c.id, windowStart: daysAgo(14), windowEnd: new Date(), sessions: 1620, uniqueVisitors: 1620, addToCartCount: 178, initiateCheckoutCount: 112, conversionCount: 88, revenue: 10419.20, cvr: 0.0543, aov: 118.40, rpv: 6.43, atcRate: 0.110, pValue: 0.021, liftPct: 0.0, liftCiLow: 0.0, liftCiHigh: 0.0, bayesianProbBest: 0.048 },
      { experimentId: exp2.id, variantId: e2t.id, windowStart: daysAgo(14), windowEnd: new Date(), sessions: 1638, uniqueVisitors: 1638, addToCartCount: 232, initiateCheckoutCount: 158, conversionCount: 118, revenue: 14702.80, cvr: 0.0720, aov: 124.60, rpv: 8.97, atcRate: 0.142, pValue: 0.021, liftPct: 0.141, liftCiLow: 0.031, liftCiHigh: 0.258, bayesianProbBest: 0.952 },
      // exp3 RUNNING — not significant +6.2%
      { experimentId: exp3.id, variantId: e3c.id, windowStart: daysAgo(8), windowEnd: new Date(), sessions: 820, uniqueVisitors: 820, addToCartCount: 94, initiateCheckoutCount: 58, conversionCount: 38, revenue: 4149.60, cvr: 0.0463, aov: 109.20, rpv: 5.06, atcRate: 0.115, pValue: 0.31, liftPct: 0.0, liftCiLow: -0.08, liftCiHigh: 0.21, bayesianProbBest: 0.182 },
      { experimentId: exp3.id, variantId: e3t.id, windowStart: daysAgo(8), windowEnd: new Date(), sessions: 831, uniqueVisitors: 831, addToCartCount: 103, initiateCheckoutCount: 65, conversionCount: 44, revenue: 4919.20, cvr: 0.0529, aov: 111.80, rpv: 5.92, atcRate: 0.124, pValue: 0.31, liftPct: 0.062, liftCiLow: -0.08, liftCiHigh: 0.21, bayesianProbBest: 0.818 },
      // exp4 PAUSED — not significant +2.2%
      { experimentId: exp4.id, variantId: e4c.id, windowStart: daysAgo(22), windowEnd: daysAgo(5), sessions: 1940, uniqueVisitors: 1940, addToCartCount: 201, initiateCheckoutCount: 128, conversionCount: 102, revenue: 12903.00, cvr: 0.0526, aov: 126.50, rpv: 6.65, atcRate: 0.104, pValue: 0.44, liftPct: 0.0, liftCiLow: -0.06, liftCiHigh: 0.11, bayesianProbBest: 0.29 },
      { experimentId: exp4.id, variantId: e4t.id, windowStart: daysAgo(22), windowEnd: daysAgo(5), sessions: 1958, uniqueVisitors: 1958, addToCartCount: 213, initiateCheckoutCount: 137, conversionCount: 108, revenue: 13813.20, cvr: 0.0551, aov: 127.90, rpv: 7.05, atcRate: 0.109, pValue: 0.44, liftPct: 0.022, liftCiLow: -0.06, liftCiHigh: 0.11, bayesianProbBest: 0.71 },
      // exp6 ARCHIVED — significant +22.4%, treatment won
      { experimentId: exp6.id, variantId: e6c.id, windowStart: daysAgo(70), windowEnd: daysAgo(49), sessions: 2200, uniqueVisitors: 2200, addToCartCount: 216, initiateCheckoutCount: 142, conversionCount: 101, revenue: 12362.40, cvr: 0.0459, aov: 122.40, rpv: 5.62, atcRate: 0.098, pValue: 0.001, liftPct: 0.0, liftCiLow: 0.0, liftCiHigh: 0.0, bayesianProbBest: 0.002 },
      { experimentId: exp6.id, variantId: e6t.id, windowStart: daysAgo(70), windowEnd: daysAgo(49), sessions: 2200, uniqueVisitors: 2200, addToCartCount: 279, initiateCheckoutCount: 192, conversionCount: 128, revenue: 15974.40, cvr: 0.0582, aov: 124.80, rpv: 7.26, atcRate: 0.127, pValue: 0.001, liftPct: 0.224, liftCiLow: 0.109, liftCiHigh: 0.348, bayesianProbBest: 0.998 },
      // exp7 ARCHIVED — inconclusive, nearly flat
      { experimentId: exp7.id, variantId: e7c.id, windowStart: daysAgo(55), windowEnd: daysAgo(41), sessions: 1400, uniqueVisitors: 1400, addToCartCount: 151, initiateCheckoutCount: 97, conversionCount: 71, revenue: 8491.60, cvr: 0.0507, aov: 119.60, rpv: 6.07, atcRate: 0.108, pValue: 0.74, liftPct: 0.0, liftCiLow: -0.12, liftCiHigh: 0.14, bayesianProbBest: 0.38 },
      { experimentId: exp7.id, variantId: e7t.id, windowStart: daysAgo(55), windowEnd: daysAgo(41), sessions: 1400, uniqueVisitors: 1400, addToCartCount: 155, initiateCheckoutCount: 99, conversionCount: 73, revenue: 8767.30, cvr: 0.0521, aov: 120.10, rpv: 6.26, atcRate: 0.111, pValue: 0.74, liftPct: 0.028, liftCiLow: -0.12, liftCiHigh: 0.14, bayesianProbBest: 0.62 },
      // exp8 COMPLETED — significant +11.8%
      { experimentId: exp8.id, variantId: e8c.id, windowStart: daysAgo(23), windowEnd: daysAgo(5), sessions: 2400, uniqueVisitors: 2400, addToCartCount: 269, initiateCheckoutCount: 177, conversionCount: 122, revenue: 16372.40, cvr: 0.0508, aov: 134.20, rpv: 6.82, atcRate: 0.112, pValue: 0.008, liftPct: 0.0, liftCiLow: 0.0, liftCiHigh: 0.0, bayesianProbBest: 0.011 },
      { experimentId: exp8.id, variantId: e8t.id, windowStart: daysAgo(23), windowEnd: daysAgo(5), sessions: 2400, uniqueVisitors: 2400, addToCartCount: 317, initiateCheckoutCount: 213, conversionCount: 149, revenue: 22151.40, cvr: 0.0621, aov: 148.60, rpv: 9.23, atcRate: 0.132, pValue: 0.008, liftPct: 0.118, liftCiLow: 0.042, liftCiHigh: 0.199, bayesianProbBest: 0.989 },
      // exp9 ARCHIVED — significant but negative, control won
      { experimentId: exp9.id, variantId: e9c.id, windowStart: daysAgo(45), windowEnd: daysAgo(33), sessions: 1200, uniqueVisitors: 1200, addToCartCount: 139, initiateCheckoutCount: 90, conversionCount: 66, revenue: 7774.80, cvr: 0.0550, aov: 117.80, rpv: 6.48, atcRate: 0.116, pValue: 0.018, liftPct: 0.0, liftCiLow: 0.0, liftCiHigh: 0.0, bayesianProbBest: 0.971 },
      { experimentId: exp9.id, variantId: e9t.id, windowStart: daysAgo(45), windowEnd: daysAgo(33), sessions: 1200, uniqueVisitors: 1200, addToCartCount: 121, initiateCheckoutCount: 79, conversionCount: 59, revenue: 6743.70, cvr: 0.0492, aov: 114.30, rpv: 5.62, atcRate: 0.101, pValue: 0.018, liftPct: -0.105, liftCiLow: -0.198, liftCiHigh: -0.014, bayesianProbBest: 0.029 },
      // exp10 COMPLETED — significant +9.1%
      { experimentId: exp10.id, variantId: e10c.id, windowStart: daysAgo(36), windowEnd: daysAgo(20), sessions: 1800, uniqueVisitors: 1800, addToCartCount: 196, initiateCheckoutCount: 127, conversionCount: 94, revenue: 12116.60, cvr: 0.0522, aov: 128.90, rpv: 6.73, atcRate: 0.109, pValue: 0.029, liftPct: 0.0, liftCiLow: 0.0, liftCiHigh: 0.0, bayesianProbBest: 0.038 },
      { experimentId: exp10.id, variantId: e10t.id, windowStart: daysAgo(36), windowEnd: daysAgo(20), sessions: 1800, uniqueVisitors: 1800, addToCartCount: 225, initiateCheckoutCount: 152, conversionCount: 105, revenue: 13797.00, cvr: 0.0583, aov: 131.40, rpv: 7.66, atcRate: 0.125, pValue: 0.029, liftPct: 0.117, liftCiLow: 0.018, liftCiHigh: 0.221, bayesianProbBest: 0.962 },
      // exp11 RUNNING — early, collecting data
      { experimentId: exp11.id, variantId: e11c.id, windowStart: daysAgo(3), windowEnd: new Date(), sessions: 600, uniqueVisitors: 600, addToCartCount: 71, initiateCheckoutCount: 44, conversionCount: 29, revenue: 3259.60, cvr: 0.0483, aov: 112.40, rpv: 5.43, atcRate: 0.118, pValue: 0.62, liftPct: 0.0, liftCiLow: -0.18, liftCiHigh: 0.22, bayesianProbBest: 0.31 },
      { experimentId: exp11.id, variantId: e11t.id, windowStart: daysAgo(3), windowEnd: new Date(), sessions: 600, uniqueVisitors: 600, addToCartCount: 77, initiateCheckoutCount: 49, conversionCount: 32, revenue: 3654.40, cvr: 0.0533, aov: 114.20, rpv: 6.09, atcRate: 0.129, pValue: 0.62, liftPct: 0.103, liftCiLow: -0.18, liftCiHigh: 0.22, bayesianProbBest: 0.69 },
    ],
    skipDuplicates: true,
  });

  console.log(`\nDone!`);
  console.log(`  Visitors:    ${TOTAL_VISITORS.toLocaleString()}`);
  console.log(`  Segments:    6`);
  console.log(`  Experiments: 11 (3 running, 3 completed, 2 archived, 1 paused, 1 draft, 1 running early)`);
  console.log(`  Allocations: ${totalAllocs.toLocaleString()}`);
  console.log(`  Events:      ${totalEvents.toLocaleString()}`);
  console.log(`  Orders:      ${totalOrders.toLocaleString()}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
