// Native Chromium input checks for the isolated agent-browser QA session.
// Usage: node scripts/camera-input-audit.cjs <browser-websocket-url>
(async () => {
  const address = new URL(process.argv[2]);
  const pages = await (await fetch(`http://${address.host}/json/list`)).json();
  const page = pages.find(
    (p) => p.type === "page" && p.url === "http://127.0.0.1:4173/",
  );
  if (!page) throw new Error("Local preview page not found");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) =>
    socket.addEventListener("open", resolve, { once: true }),
  );
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const handler = pending.get(message.id);
    if (handler) {
      pending.delete(message.id);
      message.error
        ? handler.reject(message.error)
        : handler.resolve(message.result);
    }
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const read = async () =>
    (
      await call("Runtime.evaluate", {
        expression:
          'JSON.stringify({...document.querySelector("#world canvas").dataset})',
        returnByValue: true,
      })
    ).result.value;
  const pause = () => new Promise((resolve) => setTimeout(resolve, 120));
  try {
    const before = JSON.parse(await read());
    await call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 650,
      y: 400,
    });
    await call("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: 650,
      y: 400,
      deltaY: 150,
      deltaX: 0,
    });
    await pause();
    const wheel = JSON.parse(await read());
    if (Number(wheel.zoom) <= Number(before.zoom))
      throw new Error("Native wheel did not zoom out");
    await call("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: 650,
      y: 400,
      button: "left",
      clickCount: 1,
    });
    await call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 750,
      y: 430,
      buttons: 1,
    });
    await call("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: 750,
      y: 430,
      button: "left",
      clickCount: 1,
    });
    const orbit = JSON.parse(await read());
    if (orbit.orbit === wheel.orbit)
      throw new Error("Native drag did not orbit");
    await call("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 2,
    });
    await call("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: 600, y: 400, id: 0 },
        { x: 750, y: 400, id: 1 },
      ],
    });
    await call("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: 550, y: 400, id: 0 },
        { x: 800, y: 400, id: 1 },
      ],
    });
    await call("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await pause();
    const pinch = JSON.parse(await read());
    if (Number(pinch.zoom) >= Number(orbit.zoom))
      throw new Error("Native pinch did not zoom in");
    console.log(
      JSON.stringify({
        before: before.zoom,
        wheel: wheel.zoom,
        orbit: [wheel.orbit, orbit.orbit],
        pinch: pinch.zoom,
        passed: true,
      }),
    );
  } finally {
    await call("Emulation.setTouchEmulationEnabled", { enabled: false });
    socket.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
