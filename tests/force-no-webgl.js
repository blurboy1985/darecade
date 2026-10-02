// Browser QA fixture: prove that lack of WebGL does not block the arcade.
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type, ...args) {
  if (type === "webgl" || type === "webgl2" || type === "experimental-webgl")
    return null;
  return originalGetContext.call(this, type, ...args);
};
