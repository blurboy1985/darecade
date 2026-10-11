// Bring the Stripe catalogue in line with what the game sells:
//   an outfit (clothes, headwear, pet and magic) at S$4.99, one product per
//   catalogued set, tagged kind=outfit;
//   a single item at S$1.99, one product per kind of item (clothes, headwear,
//   pet, magic), tagged kind=piece. The order records which set's item.
// Sets with no catalogue entry are charged through the server's inline price.
// Safe to run again: it only writes what differs.
//   node scripts/stripe-add-sets.mjs sandbox
//   node scripts/stripe-add-sets.mjs live     (needs a key that may write Products and Prices)
//   add --check to list what would change without changing anything
import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import {
  legendarySets,
  piecePriceSGD,
  setPriceSGD,
} from "../src/collections.ts";

const mode = process.argv[2];
if (mode !== "sandbox" && mode !== "live") throw Error("Say sandbox or live.");
const checkOnly = process.argv.includes("--check");
const key = parseEnv(
  readFileSync(`.env.stripe-${mode}`, "utf8"),
).STRIPE_SECRET_KEY;
if (
  !new RegExp(`^(sk|rk)_${mode === "live" ? "live" : "test"}_`).test(key || "")
)
  throw Error(`.env.stripe-${mode} has no ${mode} key.`);

async function stripe(path, body) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body && { "Content-Type": "application/x-www-form-urlencoded" }),
    },
    body: body && new URLSearchParams(body),
    signal: AbortSignal.timeout(20000),
  });
  const json = await response.json();
  if (!response.ok)
    throw Error(
      `${path}: ${json.error?.code || response.status} ${json.error?.message || ""}`,
    );
  return json;
}

const file = `stripe-${mode}-catalog.json`;
const catalog = JSON.parse(readFileSync(file, "utf8"));
const save = () => writeFileSync(file, JSON.stringify(catalog, null, 2) + "\n");
let changed = 0;

/** Make a product's name, description and tags match; returns whether it wrote. */
async function tag(priceId, want, tags) {
  const price = await stripe(`prices/${priceId}?expand[]=product`);
  if (price.livemode !== (mode === "live") || price.currency !== "sgd")
    throw Error(`${priceId} is not a ${mode} SGD price.`);
  const product = price.product;
  const same =
    product.name === want.name &&
    product.description === want.description &&
    Object.entries(tags).every(
      ([k, v]) => product.metadata[k] === v && price.metadata[k] === v,
    );
  if (same) return false;
  if (checkOnly) {
    console.log(`would tag: ${want.name}`);
    return false;
  }
  const metadata = Object.fromEntries(
    Object.entries(tags).map(([k, v]) => [`metadata[${k}]`, v]),
  );
  await stripe(`products/${product.id}`, { ...want, ...metadata });
  await stripe(`prices/${priceId}`, metadata);
  return true;
}

for (const set of legendarySets.filter((set) => set.tier !== "Free")) {
  const entry = catalog[set.id];
  if (!entry) continue;
  if (entry.amount !== setPriceSGD)
    throw Error(`${set.id} is not at ${setPriceSGD}. Reprice it first.`);
  const wrote = await tag(
    entry.priceId,
    {
      name: `Play Simi — ${set.name} Outfit`,
      description: `Unlock the complete ${set.name} outfit in Play Simi: boy and girl clothes, headwear, pet and magic effect. A one-time digital purchase for your saved Play Simi account. Cosmetic only; no gameplay advantage.`,
    },
    {
      kind: "outfit",
      set: set.id,
      tier: set.tier.toLowerCase(),
      includes: "clothes,headwear,pet,magic",
    },
  );
  if (wrote) {
    changed++;
    console.log(`tagged: ${set.id}`);
  }
}

const pieces = {
  clothing: ["Clothes", "the clothes"],
  hair: ["Headwear", "the headwear"],
  pet: ["Pet", "the pet"],
  accessory: ["Magic", "the magic effect"],
};
for (const [slot, [label, phrase]] of Object.entries(pieces)) {
  const id = `piece-${slot}`;
  const want = {
    name: `Play Simi — Single item: ${label}`,
    description: `Unlock one item from a Play Simi outfit: ${phrase} of the outfit you chose in the game. The rest of the outfit is not included. A one-time digital purchase for your saved Play Simi account. Cosmetic only; no gameplay advantage.`,
  };
  const tags = { kind: "piece", slot, includes: label.toLowerCase() };
  if (catalog[id]) {
    if (catalog[id].amount !== piecePriceSGD)
      throw Error(`${id} is not at ${piecePriceSGD}.`);
    if (await tag(catalog[id].priceId, want, tags)) {
      changed++;
      console.log(`tagged: ${id}`);
    }
    continue;
  }
  if (checkOnly) {
    console.log(`would create: ${id} at ${piecePriceSGD}`);
    continue;
  }
  const product = await stripe("products", {
    ...want,
    ...Object.fromEntries(
      Object.entries(tags).flatMap(([k, v]) => [
        [`metadata[${k}]`, v],
        [`default_price_data[metadata][${k}]`, v],
      ]),
    ),
    "default_price_data[currency]": "sgd",
    "default_price_data[unit_amount]": String(piecePriceSGD),
  });
  catalog[id] = { priceId: product.default_price, amount: piecePriceSGD };
  // Written after each product, so a failure part-way never loses one.
  save();
  changed++;
  console.log(`created: ${id} ${product.default_price}`);
}
console.log(`${mode}: ${changed} changed.`);
