// 🏆 Sprint Awards — standalone server (Node + Express + Socket.io)
const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const awards = require("./awards");

const PORT = process.env.PORT || 3000;
const app = express();
app.get(["/", "/awards"], (_, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/health", (_, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 20000 });
awards.attach(io);

server.listen(PORT, () => console.log(`Sprint Awards listening on port ${PORT}`));
