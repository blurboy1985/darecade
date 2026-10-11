// Move every catalogued set to the S$4.99 outfit price: a new Price on the
// existing Stripe product, with the product renamed and described as an
// outfit. Sets with no catalogue entry are charged through the server's
// inline price and need nothing here. Safe to run again: entries already at
// the price are kept. The old price stays active so a deployment that still
// charges it keeps working; archive it in Stripe once the new one is live.
//   node scripts/stripe-add-sets.mjs sandbox
//   node scripts/stripe-add-sets.mjs live     (needs a key that may write Products and Prices)
//   add --check to list what would change without changing anything
import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { legendarySets, setPriceSGD } from "../src/collections.ts";

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
let changed = 0;
for (const set of legendarySets.filter((set) => set.tier !== "Free")) {
  const entry = catalog[set.id];
  if (!entry || entry.amount === setPriceSGD) continue;
  const old = await stripe(`prices/${entry.priceId}`);
  if (old.livemode !== (mode === "live") || old.currency !== "sgd")
    throw Error(`${set.id}: ${entry.priceId} is not a ${mode} SGD price.`);
  if (checkOnly) {
    console.log(
      `would reprice: ${set.id} ${old.unit_amount} -> ${setPriceSGD}`,
    );
    continue;
  }
  const price = await stripe("prices", {
    product: old.product,
    currency: "sgd",
    unit_amount: String(setPriceSGD),
    "metadata[set]": set.id,
  });
  await stripe(`products/${old.product}`, {
    name: `Play Simi — ${set.name} Outfit`,
    description: `Unlock the ${set.name} outfit in Play Simi: the boy and girl outfits with headwear. The pet and magic effect are not included. A one-time digital purchase for your saved Play Simi account. Cosmetic only; no gameplay advantage.`,
    default_price: price.id,
  });
  catalog[set.id] = { priceId: price.id, amount: setPriceSGD };
  // Written after each set, so a failure part-way never loses a created price.
  writeFileSync(file, JSON.stringify(catalog, null, 2) + "\n");
  changed++;
  console.log(`repriced: ${set.id} ${price.id} (was ${entry.priceId})`);
}
console.log(`${mode}: ${changed} repriced.`);
