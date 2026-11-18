import { createServer } from "node:http";
import { Duplex } from "node:stream";
// Exercise the actual HTTP parser/Express stack over an in-memory duplex, no listening port.
export function request(
  app,
  path,
  { method = "GET", body, headers = {} } = {},
) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const socket = new Duplex({
      read() {},
      write(chunk, enc, done) {
        chunks.push(Buffer.from(chunk));
        done();
      },
      final(done) {
        done();
        const text = Buffer.concat(chunks).toString();
        const split = text.indexOf("\r\n\r\n");
        const head = text.slice(0, split),
          raw = text.slice(split + 4);
        const status = Number(head.split(" ")[1]);
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          data = raw;
        }
        resolve({ status, head, data });
      },
    });
    socket.remoteAddress = "127.0.0.1";
    socket.on("error", reject);
    const server = createServer(app);
    server.emit("connection", socket);
    const content = body === undefined ? "" : JSON.stringify(body);
    const h = {
      Host: "127.0.0.1:4389",
      Connection: "close",
      ...(body === undefined
        ? {}
        : {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(content),
          }),
      ...headers,
    };
    socket.push(
      Buffer.from(
        `${method} ${path} HTTP/1.1\r\n${Object.entries(h)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n")}\r\n\r\n${content}`,
      ),
    );
  });
}
export async function client(app) {
  const s = await request(app, "/api/session");
  const cookie = s.head.match(/Set-Cookie: ([^;]+)/i)[1];
  return {
    session: s.data,
    request: (path, method = "GET", body, headers = {}) =>
      request(app, "/api" + path, {
        method,
        body,
        headers: {
          Cookie: cookie,
          "X-CSRF-Token": s.data.token,
          "X-Data-Epoch": s.data.epoch,
          ...headers,
        },
      }),
  };
}
