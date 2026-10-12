// Byte ranges for the intro film. Static assets answer a Range request with
// the whole file, and Safari will not play a video served that way.

/** The asset request to make for a ranged one: the whole file, unconditionally. */
export function wholeFile(request) {
  const headers = new Headers(request.headers);
  for (const name of ["range", "if-range", "if-none-match", "if-modified-since"])
    headers.delete(name);
  return new Request(request.url, { method: request.method, headers });
}

/** Cuts the bytes a Range header asks for out of a whole-file response. */
export async function ranged(response, range) {
  const headers = new Headers(response.headers);
  headers.set("Accept-Ranges", "bytes");
  const asked = /^bytes=(\d*)-(\d*)$/.exec(range || "");
  if (!response.ok || !asked || (!asked[1] && !asked[2]))
    return new Response(response.body, { status: response.status, headers });
  const body = await response.arrayBuffer();
  const size = body.byteLength;
  // "bytes=-500" is the last 500 bytes; "bytes=500-" runs to the end.
  const start = asked[1] ? Number(asked[1]) : Math.max(0, size - Number(asked[2]));
  const end = asked[1] && asked[2] ? Math.min(Number(asked[2]), size - 1) : size - 1;
  if (start >= size || start > end) {
    headers.set("Content-Range", `bytes */${size}`);
    headers.delete("Content-Length");
    return new Response(null, { status: 416, headers });
  }
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(body.slice(start, end + 1), { status: 206, headers });
}
