// app/routes/api.socket.js
import { Server } from "socket.io";

let io;
let isInitialized = false;

export async function loader({ request }) {
  // Get the HTTP server from the request
  const server = global.__server || request.server;
  
  if (!io && server) {
    console.log("🚀 Initializing Socket.io server (polling-only mode)...");
    
    try {
      io = new Server(server, {
        path: "/api/socket",
        addTrailingSlash: false,
        cors: {
          origin: "*",
          methods: ["GET", "POST"],
          credentials: true
        },
        // Force polling only - NO WEBSOCKETS
        transports: ['polling'],
        allowEIO3: true,
        pingTimeout: 60000,
        pingInterval: 25000,
        // Disable WebSocket upgrades
        allowUpgrades: false,
        upgrade: false
      });
      
      io.on("connection", (socket) => {
        console.log("✅ Connected:", socket.id);
        console.log("Transport:", socket.conn.transport.name);
        
        socket.on("joinStream", ({ streamId }) => {
          if (streamId) {
            socket.join(streamId);
            console.log(`📡 User ${socket.id} joined room: ${streamId}`);
            socket.emit("joined", { streamId });
          }
        });
        
        socket.on("chatMessage", (data) => {
          if (data && data.streamId) {
            socket.to(data.streamId).emit("chatMessage", data);
            console.log(`💬 Message in ${data.streamId}: ${data.text?.substring(0, 50)}`);
          }
        });
        
        socket.on("disconnect", () => {
          console.log("❌ Disconnected:", socket.id);
        });
      });
      
      isInitialized = true;
      global.__io = io;
      console.log("✅ Socket.io server initialized (polling mode)");
      
    } catch (error) {
      console.error("❌ Failed to initialize Socket.io:", error.message);
    }
  }
  
  return new Response(JSON.stringify({ 
    status: "Socket.io endpoint ready",
    mode: "polling-only",
    initialized: isInitialized
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

export const config = {
  api: {
    bodyParser: false,
  },
};