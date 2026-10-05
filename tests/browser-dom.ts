import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

/** Stop only the isolated fixture tree and await process shutdown. */
export async function stopBrowser(browser: ChildProcess) {
  if (browser.pid) {
    if (process.platform === "win32") {
      if (browser.exitCode === null && browser.signalCode === null) {
        try {
          await promisify(execFile)(
            "taskkill",
            ["/pid", String(browser.pid), "/T", "/F"],
            { windowsHide: true },
          );
        } catch {
          // Chrome may have exited between the check and taskkill.
          browser.kill();
        }
      }
    } else {
      try {
        process.kill(-browser.pid, "SIGKILL");
      } catch {}
    }
  }
  await new Promise<void>((done) => {
    if (browser.exitCode !== null || browser.signalCode !== null) return done();
    const bound = setTimeout(done, 2000);
    browser.once("close", () => {
      clearTimeout(bound);
      done();
    });
  });
}

/** Run an isolated Chrome fixture until its DOM assertions finish, not shutdown. */
export async function browserDOM(
  chromium: string,
  url: string,
  directory: string,
  {
    virtualTime = 10000,
    flags = [] as string[],
    timeout = 15000,
    gpu = false,
  } = {},
) {
  const browser = spawn(
    chromium,
    [
      "--headless",
      ...(gpu ? [] : ["--disable-gpu"]),
      "--no-first-run",
      "--disable-background-networking",
      "--use-mock-keychain",
      "--password-store=basic",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
      `--user-data-dir=${directory}`,
      "--dump-dom",
      `--virtual-time-budget=${virtualTime}`,
      ...flags,
      url,
    ],
    { detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "",
    errors = "";
  // Inline fixture source contains literal pass/fail markup. Only the rendered
  // DOM may satisfy completion or assertions; otherwise missing imports pass.
  const dom = () =>
    output.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  const complete = () =>
    /<(?:body|p)\b[^>]*\bdata-result="(?:pass|fail)"/.test(dom()) &&
    output.includes("</html>");
  try {
    await new Promise<void>((done, reject) => {
      let settled = false;
      const timer = setTimeout(
        () =>
          finish(
            Error(
              `No browser DOM result within ${timeout}ms\n${dom().slice(-2000)}\n${errors.slice(-2000)}`,
            ),
          ),
        timeout,
      );
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        error ? reject(error) : done();
      };
      browser.stdout.on("data", (data) => {
        output += data;
        if (complete()) finish();
      });
      browser.stderr.on("data", (data) => {
        errors += data;
      });
      browser.on("error", finish);
      browser.on("close", (code) => {
        complete()
          ? finish()
          : finish(
              Error(
                `Chrome closed (${code}) without a DOM result\n${dom().slice(-2000)}\n${errors.slice(-2000)}`,
              ),
            );
      });
    });
    return dom();
  } finally {
    await stopBrowser(browser);
  }
}
