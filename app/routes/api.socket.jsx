// app/routes/api.socket.js
import { Server } from "socket.io";

// Store io instance globally to reuse across requests
let io;

export async function loader({ request, context }) {
  // Get the HTTP server from Vercel context
  const server = context?.server || global.__server;
  
  if (!server) {
    console.error("No server instance found for WebSocket");
    return new Response("WebSocket server not available", { status: 500 });
  }
  
  // Initialize Socket.io only once
  if (!io) {
    console.log("🚀 Initializing Socket.io server...");
    
    io = new Server(server, {
      path: "/api/socket",
      addTrailingSlash: false,
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ["websocket", "polling"]
    });
    
    io.on("connection", (socket) => {
      console.log("✅ Connected:", socket.id);
      
      socket.on("joinStream", ({ streamId }) => {
        if (streamId) {
          socket.join(streamId);
          console.log(`📡 User ${socket.id} joined room: ${streamId}`);
        }
      });
      
      socket.on("chatMessage", (data) => {
        if (data && data.streamId) {
          // Broadcast to everyone in the room EXCEPT sender
          socket.to(data.streamId).emit("chatMessage", data);
          console.log(`💬 Message in ${data.streamId}: ${data.text}`);
        }
      });
      
      socket.on("disconnect", () => {
        console.log("❌ Disconnected:", socket.id);
      });
    });
    
    // Store io in global for reuse
    global.__io = io;
  }
  
  // Return a response to satisfy the loader
  return new Response("WebSocket endpoint ready", { status: 200 });
}

// Disable body parsing for WebSocket connections
export const config = {
  api: {
    bodyParser: false,
  },
};