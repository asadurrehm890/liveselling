// server/index.js (or server/index.ts)
import http from "http";
import express from "express";
import { Server } from "socket.io";
import { createRequestHandler } from "@react-router/node";
// import your built app; in dev, this might be wired differently
import * as build from "../build/server/index.js"; // adjust path to your build output

const app = express();
const server = http.createServer(app);

// 1) Attach socket.io to the same HTTP server
const io = new Server(server, {
  cors: {
    origin: "*", // tighten this in production
  },
});

// 2) Basic socket.io chat logic
io.on("connection", (socket) => {
  console.log("New socket connected:", socket.id);

  // Client joins a specific stream room
  socket.on("joinStream", ({ streamId }) => {
    if (!streamId) return;
    console.log(`Socket ${socket.id} joining room ${streamId}`);
    socket.join(streamId);
  });

  // Receive a chat message and broadcast it to the stream's room
  socket.on("chatMessage", ({ streamId, author, text }) => {
    if (!streamId || !text) return;

    const message = {
      id: Date.now(), // simplistic ID
      author: author || "Viewer",
      text,
      ts: new Date().toISOString(),
    };

    // Broadcast to everyone in this stream
    io.to(streamId).emit("chatMessage", message);
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

// 3) Let React Router handle all HTTP routes as before
app.all(
  "*",
  createRequestHandler({
    // React Router build
    build,
  }),
);

// 4) Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server + socket.io listening on port ${PORT}`);
});