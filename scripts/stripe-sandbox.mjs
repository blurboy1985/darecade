// Windows: npm install --prefix .browser/stripe-tools --no-audit --no-fund @stripe/cli
// Then: node scripts/stripe-sandbox.mjs
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const file = resolve(".env.stripe-sandbox");
const config = parseEnv(readFileSync(file, "utf8"));
if (!config.STRIPE_SECRET_KEY?.startsWith("sk_test_"))
  throw Error("Enter the Play Simi sandbox secret key in .env.stripe-sandbox.");
if (
  config.PUBLIC_ORIGIN !== "http://127.0.0.1:4174" ||
  config.PORT !== "4174" ||
  config.DARECADE_DATA !== "data/stripe-sandbox" ||
  config.MAIL_MODE !== "outbox"
)
  throw Error("Use the isolated localhost sandbox configuration.");
const check = await fetch("https://api.stripe.com/v1/account", {
  headers: { Authorization: `Bearer ${config.STRIPE_SECRET_KEY}` },
  signal: AbortSignal.timeout(15000),
});
if (!check.ok || (await check.json()).id !== "acct_1UMkqOPB58tsspFG")
  throw Error("This key does not belong to the Play Simi sandbox.");

const executable = resolve(
  ".browser/stripe-tools/node_modules/@stripe/cli-win32-x64/bin/stripe.exe",
);
const listener = spawn(
  executable,
  [
    "listen", "--forward-to", `${config.PUBLIC_ORIGIN}/api/payments/webhook`,
    "--events", "checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.expired,charge.refunded,charge.dispute.created",
  ],
  {
    env: { ...process.env, STRIPE_API_KEY: config.STRIPE_SECRET_KEY },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let pending = "";
let server;
const redact = (value) => value.replace(/(?:sk_test_|whsec_)[A-Za-z0-9]+/g, "[redacted]");
function receive(chunk) {
  pending += String(chunk);
  const lines = pending.split("\n");
  pending = lines.pop();
  for (const line of lines) {
    const secret = line.match(/whsec_[A-Za-z0-9]+/);
    if (secret && !server) {
      config.STRIPE_WEBHOOK_SECRET = secret[0];
      config.PAYMENTS_ENABLED = "true";
      const text = readFileSync(file, "utf8")
        .replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, `STRIPE_WEBHOOK_SECRET=${secret[0]}`)
        .replace(/^PAYMENTS_ENABLED=.*$/m, "PAYMENTS_ENABLED=true");
      writeFileSync(file, text);
      server = spawn(process.execPath, ["server/index.mjs"], {
        env: { ...process.env, ...config, NODE_ENV: "development" },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      server.stdout.on("data", (data) => process.stdout.write(redact(String(data))));
      server.stderr.on("data", (data) => process.stderr.write(redact(String(data))));
      server.on("error", () => { console.error("Could not start sandbox server."); listener.kill(); });
      server.on("exit", () => listener.kill());
      console.log("Stripe sandbox webhook listener connected. Test money only.");
    }
    // Stripe prints the signing secret on startup. Never echo that line.
    if (/checkout\.session|charge\.refunded|\[\d{3}\]/.test(line))
      console.log(redact(line));
  }
}
listener.stdout.on("data", receive);
listener.stderr.on("data", receive);
listener.on("error", () => {
  console.error("Stripe CLI unavailable. Run the installation command at the top of this script.");
  process.exitCode = 1;
});
listener.on("exit", (code) => {
  server?.kill();
  if (code) console.error("Stripe listener stopped. Check the sandbox key and connection.");
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => { server?.kill(); listener.kill(); });
