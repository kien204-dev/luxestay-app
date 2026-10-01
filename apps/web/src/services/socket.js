import { io } from "socket.io-client";

// Socket.io has its own path/handshake, not the REST "/api" prefix — strip
// that suffix off the same base URL api.js already uses, so both stay in
// sync with VITE_API_URL instead of hardcoding a second origin.
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, "");

let socket = null;

// Lazily creates a single shared connection (not auto-connected — callers
// decide when to actually connect, e.g. only once we know the signed-in
// user is an admin).
export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      withCredentials: true,
      autoConnect: false,
    });
  }
  return socket;
}
