// Create the S$1.99 product and price for any set that has none, and record
// them in the catalogue file. Safe to run again: existing entries are kept.
//   node scripts/stripe-add-sets.mjs sandbox
//   node scripts/stripe-add-sets.mjs live     (needs a key that may write Products and Prices)
//   add --check to list what exists without creating anything
import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { legendarySets } from "../src/collections.ts";

const mode = process.argv[2];
const accounts = {
  sandbox: "acct_1UMkqOPB58tsspFG",
  live: "acct_1UMkqGA6Maf1zlsl",
};
if (!accounts[mode]) throw Error("Say sandbox or live.");
const checkOnly = process.argv.includes("--check");
const key = parseEnv(
  readFileSync(`.env.stripe-${mode}`, "utf8"),
).STRIPE_SECRET_KEY;
if (
  !new RegExp(`^(sk|rk)_${mode === "live" ? "live" : "test"}_`).test(key || "")
)
  throw Error(`.env.stripe-${mode} has no ${mode} key.`);
const AMOUNT = 199;

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

// A restricted key cannot read the account, so identify it from a product.
const products = (await stripe("products?limit=100&active=true")).data;
const file = `stripe-${mode}-catalog.json`;
const catalog = JSON.parse(readFileSync(file, "utf8"));
const known = Object.values(catalog)[0]?.priceId;
if (known) {
  const price = await stripe(`prices/${known}`);
  if (!products.some((p) => p.id === price.product))
    throw Error(
      "This key does not belong to the account in the catalogue file.",
    );
}
console.log(
  `${mode}: ${products.length} active products;`,
  "sample:",
  JSON.stringify(
    products
      .slice(0, 2)
      .map((p) => ({
        name: p.name,
        description: p.description,
        metadata: p.metadata,
      })),
  ),
);
for (const set of legendarySets.filter((set) => set.tier !== "Free")) {
  if (catalog[set.id]) continue;
  if (checkOnly) {
    console.log(`missing: ${set.id} (${set.name})`);
    continue;
  }
  const product = await stripe("products", {
    // Same wording as the first ten products.
    name: `Play Simi — ${set.name} Set`,
    description: `Unlock the complete ${set.name} cosmetic set in Play Simi: complete boy and girl outfits, pet and magic effect. A one-time digital purchase for your saved Play Simi account. Cosmetic only; no gameplay advantage.`,
    "metadata[set]": set.id,
    "default_price_data[currency]": "sgd",
    "default_price_data[unit_amount]": String(AMOUNT),
  });
  catalog[set.id] = { priceId: product.default_price, amount: AMOUNT };
  console.log(`created: ${set.id} ${product.default_price}`);
}
if (!checkOnly) writeFileSync(file, JSON.stringify(catalog, null, 2) + "\n");
