// A tiny SMTP server for the browser tests: accepts every message the API
// sends and keeps it, so a test can open the link in a password reset email
// as a guest would. Plain SMTP on 127.0.0.1, no TLS, no sign-in.

import net from "node:net";

// Quoted-printable bodies (what nodemailer sends for HTML) back to text.
function decodeQuotedPrintable(text) {
  return text.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export async function startInbox() {
  const messages = [];
  const waiting = [];

  const server = net.createServer((socket) => {
    let buffer = "";
    let inData = false;
    let current = { to: [], data: "" };
    socket.write("220 e2e-inbox ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index;
      while ((index = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            const message = { to: current.to, raw: current.data, text: decodeQuotedPrintable(current.data) };
            messages.push(message);
            waiting.splice(0).forEach((resolve) => resolve());
            current = { to: [], data: "" };
            socket.write("250 OK\r\n");
          } else {
            current.data += `${line.startsWith("..") ? line.slice(1) : line}\r\n`;
          }
          continue;
        }
        const command = line.slice(0, 4).toUpperCase();
        if (command === "EHLO" || command === "HELO") socket.write("250 e2e-inbox\r\n");
        else if (command === "MAIL") socket.write("250 OK\r\n");
        else if (command === "RCPT") {
          current.to.push(line.replace(/^RCPT TO:\s*<?([^>]*)>?.*$/i, "$1"));
          socket.write("250 OK\r\n");
        } else if (command === "DATA") {
          inData = true;
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        } else if (command === "QUIT") {
          socket.end("221 Bye\r\n");
        } else socket.write("250 OK\r\n");
      }
    });
    socket.on("error", () => {});
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    port: server.address().port,
    messages,
    // The first message to `to` after the first `since` messages (take
    // `messages.length` before the action that sends it); waits for it.
    async next(to, since, timeoutMs = 10000) {
      const deadline = Date.now() + timeoutMs;
      const seen = since;
      while (Date.now() < deadline) {
        const found = messages.slice(seen).find((message) => message.to.includes(to));
        if (found) return found;
        await new Promise((resolve) => {
          waiting.push(resolve);
          setTimeout(resolve, 200);
        });
      }
      throw new Error(`No email to ${to} arrived`);
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
