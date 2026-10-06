// Local synthetic profile only. No production accounts, tokens or API writes.
// node --experimental-strip-types scripts/character-review.mjs
import { replayRun } from "../shared/simulation.ts";
import { createServer } from "node:http";
import { mobileLobbyFixture } from "../tests/mobile-lobby-fixture.ts";
createServer(async (req, res) => {
  if (req.url === "/qa-finish") {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const data = JSON.parse(body);
      const checked = replayRun(
        "coast",
        data.id === "qa-standard" ? 42 : -43,
        data.replay,
      );
      if (checked.score !== data.score) throw Error("Replay score mismatch");
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          score: checked.score,
          race: { ...checked.race, newBest: !!checked.race?.finished },
          playMedal: Number(checked.playMedalEligible),
          verified: true,
          ranked: false,
        }),
      );
    } catch (error) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  mobileLobbyFixture(390, 844, false, false, false).emit("request", req, res);
}).listen(5184, "127.0.0.1");
