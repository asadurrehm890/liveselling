// socket-server.js
import { createServer } from "http";
import { Server } from "socket.io";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allows your Shopify app to connect
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("joinStream", ({ streamId }) => {
    socket.join(streamId);
    console.log(`User joined room: ${streamId}`);
  });

  socket.on("chatMessage", (data) => {
    // This sends the message to everyone in the room EXCEPT the sender
    socket.to(data.streamId).emit("chatMessage", data);
  });

  socket.on("disconnect", () => console.log("Disconnected"));
});

httpServer.listen(3001, () => {
  console.log("✅ Chat server is running on http://localhost:3001");
});