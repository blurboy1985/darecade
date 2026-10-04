import { paymentBody } from "../server/payments.mjs";
import { randomUUID } from "node:crypto";

const security = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};
export const json = (value, status = 200, extra = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { ...security, ...extra },
  });
const fail = (message, status) => {
  const e = Error(message);
  e.status = status;
  throw e;
};
export async function readBody(request, maximum) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    fail("Send JSON data.", 415);
  const reader = request.body?.getReader();
  if (!reader) return {};
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) {
      await reader.cancel();
      fail("Request too large.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes) || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error();
    return value;
  } catch {
    fail("Send a JSON object.", 400);
  }
}

export async function handleApi(
  request,
  { community: c, store, files, rate, worlds, payments },
) {
  try {
    const url = new URL(request.url),
      path = url.pathname,
      method = request.method;
    if (!["GET", "POST"].includes(method))
      return json({ error: "Method not allowed." }, 405);
    if (method === "POST" && path === "/api/payments/webhook") {
      rate("payment-webhook", 180, 60000);
      return json(
        await payments.webhook(
          await paymentBody(request.body),
          request.headers.get("stripe-signature"),
        ),
      );
    }
    // The old address only hands players over to the new one.
    const legacy = !!c.legacyOrigin && url.origin === c.legacyOrigin;
    if (legacy && !(method === "POST" && path === "/api/move"))
      return json({ error: "Please use the game’s main address." }, 403);
    if (
      request.headers.get("origin") &&
      request.headers.get("origin") !== (legacy ? c.legacyOrigin : c.origin)
    )
      return json({ error: "This request came from another site." }, 403);
    if (request.headers.get("sec-fetch-site") === "cross-site")
      return json({ error: "This request came from another site." }, 403);
    rate("api-ip", 3000, 60000);
    const data =
      method === "POST"
        ? await readBody(
            request,
            ["/api/finish", "/api/move"].includes(path) ? 262144 : 8192,
          )
        : {};
    const token = request.headers
      .get("cookie")
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("darecade_session="))
      ?.slice(17);
    const id = c.lookup(token);
    rate("api", 360, 60000, id);
    const withCookie = (value, token) =>
      json(value, 200, {
        "Set-Cookie": `darecade_session=${token || ""}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${token ? 2592000 : 0}`,
      });
    if (method === "GET" && path === "/api/auth/config")
      return json(c.config());
    if (method === "POST" && path === "/api/auth/check") {
      rate("age", 12, 900000);
      c.eligible(data.month, data.year);
      return json({ ok: true });
    }
    if (method === "POST" && path === "/api/auth/join") {
      rate("join", 12, 900000);
      const joined = c.join(data, token);
      return withCookie(joined.me, joined.token);
    }
    if (method === "POST" && path === "/api/auth/verify") {
      rate("verify", 12, 900000);
      const signed = c.verifyCode(data.email, data.code, {
        switchAccount: data.switchAccount === true,
      });
      // No session changes until the player chooses which character to keep.
      if (signed.conflict) return json({ conflict: signed.conflict });
      return withCookie(signed.me, signed.token);
    }
    if (method === "POST" && path === "/api/auth/login-code") {
      rate("email", 6, 900000);
      return json(await c.requestExistingCode(data.email));
    }
    if (method === "POST" && path === "/api/move") {
      if (!legacy) return json({ error: "Not found." }, 404);
      rate("move", 12, 900000);
      return json(c.moveOut(token, data.saves));
    }
    if (method === "POST" && path === "/api/move/claim") {
      rate("move", 12, 900000);
      const moved = c.moveIn(data.code, token);
      return moved.token
        ? withCookie({ saves: moved.saves }, moved.token)
        : json({ saves: moved.saves });
    }
    if (!id)
      return json(
        { error: "Please complete the welcome check or sign in." },
        401,
      );
    if (method === "GET" && path === "/api/payments/config")
      return json(payments.config());
    if (method === "GET" && path === "/api/payments/history")
      return json(payments.history(id));
    if (method === "POST" && path === "/api/payments/checkout") {
      rate("checkout", 6, 60000, id);
      return json(await payments.checkout(id, data.product));
    }
    if (method === "POST" && path === "/api/payments/status") {
      rate("payment-status", 12, 60000, id);
      return json(await payments.reconcile(data.session, id));
    }
    if (method === "GET" && path === "/api/auth/me")
      return json(c.privateProfile(id));
    if (method === "GET" && path === "/api/worlds")
      return json(worlds.directory(id));
    if (method === "POST" && path === "/api/worlds/join")
      return json({ world: worlds.destination(id, data) });
    if (method === "POST" && path === "/api/auth/code") {
      rate("email", 6, 900000);
      return json(await c.requestCode(id, data.email));
    }
    if (method === "POST" && path === "/api/auth/logout") {
      await worlds?.disconnect(id);
      return withCookie(c.logout(id, token), null);
    }
    if (method === "GET" && path === "/api/privacy/export")
      return json(c.export(id));
    if (method === "POST" && path === "/api/privacy/delete") {
      if (data.confirm !== "DELETE") fail("Confirm account deletion.", 400);
      await worlds?.disconnect(id);
      return withCookie(c.delete(id), null);
    }
    if (method === "POST" && path === "/api/profile") {
      const profile = c.patch(id, data);
      await worlds?.refresh(id);
      return json(profile);
    }
    if (method === "POST" && path === "/api/progress")
      return json(c.progression(id, data.event, data.value));
    if (method === "POST" && path === "/api/invite") return json(c.invite(id));
    if (method === "POST" && path === "/api/invite/accept")
      return json(c.acceptInvite(id, data.code));
    if (method === "POST" && path === "/api/dares")
      return json(c.postDare(id, data.run));
    if (method === "POST" && path === "/api/report") {
      const result = c.report(id, data.target, data.reason);
      await worlds?.refresh(id, data.target);
      return json(result);
    }
    if (method === "POST" && path === "/api/playtest") {
      if (
        !data.answers ||
        typeof data.answers.device !== "string" ||
        !data.measurements
      )
        fail("Complete the phone test first.", 400);
      const feedback = {
        id: randomUUID(),
        player: id,
        savedAt: new Date().toISOString(),
        answers: data.answers,
        measurements: data.measurements,
      };
      files.saveFeedback(feedback);
      return json({ id: feedback.id });
    }
    if (method === "GET" && path === "/api/state") return json(c.state(id));
    if (method === "POST" && ["/api/presence", "/api/leave"].includes(path)) {
      const look = JSON.parse(
        store.db.prepare("SELECT look FROM players WHERE id=?").get(id).look,
      );
      store.heartbeat(id, { ...data, look }, path === "/api/leave");
      return json(path === "/api/leave" ? { ok: true } : c.presence(id));
    }
    if (method === "POST" && path === "/api/run")
      return json(c.begin(id, data.game, data.target, data.dare));
    if (method === "POST" && path === "/api/finish")
      return json(c.finish(id, data));
    if (method === "POST" && path === "/api/abandon") {
      store.abandon(id, data.id);
      return json({ ok: true });
    }
    return json({ error: "Not found." }, 404);
  } catch (error) {
    // Do not disclose SQL internals, paths or configuration in public responses.
    const unexpected =
      /SQLITE|SQL error|constraint failed|not a function|undefined|no such (table|column)/i.test(
        error.message,
      );
    return json(
      {
        error: unexpected
          ? "Unable to complete this request. Please try again."
          : error.message,
      },
      unexpected ? 500 : error.status || 400,
    );
  }
}
