import https from "node:https";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import express from "express";

const app = express();
app.get("/ping", (req, res) => res.send("pong"));

const certPath = path.resolve(process.cwd(), "server/certs/server.crt");
const keyPath = path.resolve(process.cwd(), "server/certs/server.key");
const caPath = path.resolve(process.cwd(), "server/certs/aods-ca.crt");

const tlsOptions = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
  ca: fs.readFileSync(caPath)
};

const server = https.createServer(tlsOptions, app);

server.on("error", (err) => {
  console.error("SERVER ERROR EVENT:", err);
});

server.on("close", () => {
  console.log("SERVER CLOSE EVENT TRIGGERED");
});

server.listen(3443, "0.0.0.0", () => {
  console.log("HTTPS server successfully listening on 0.0.0.0:3443");
});

setTimeout(() => {
  console.log("Still running after 5 seconds... server.listening =", server.listening);
  server.close(() => process.exit(0));
}, 5000);

