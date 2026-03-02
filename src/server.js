import express from "express";
import dotenv from "dotenv";
import http from "node:http";
import fs from "node:fs/promises";
import compression from "compression";
import { Server } from "socket.io";
import { verifyAuthToken } from "../lib/auth.js";
import { initializeDbHelpers } from "../lib/db-helpers.js";
import {
  startWhatsApp,
  stopWhatsApp,
  getWhatsAppState,
  whatsappEvents,
  sendAdminMessage,
} from "./whatsapp.js";
import { initSentry, sentryErrorHandler } from "../config/sentry.js";
import logger from "../config/logger.js";
import {
  apiRateLimiter,
  authRateLimiter,
  whatsappRateLimiter,
  securityHeaders,
  requestLogger,
} from "../middleware/security.js";
// Import graceful shutdown handler (Task 10.4)
import "./shutdown.js";

dotenv.config();

const app = express();

// Initialize Sentry (must be first)
initSentry(app);

// Security headers
app.use(securityHeaders);

// Compression
app.use(compression());

// Body parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);

const DEFAULT_PORT = 3001;
const BASE_PORT = Number(process.env.PORT) || DEFAULT_PORT;
const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "http://localhost:3000";
const FRONTEND_ORIGINS = new Set(
  (process.env.FRONTEND_ORIGINS || `${FRONTEND_ORIGIN},http://localhost:3001`)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const BACKEND_SCOPE = "backend";

const parseAdminId = (value) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const adminId = Number(normalized);
  return Number.isInteger(adminId) && adminId > 0 ? adminId : null;
};

const extractBearerToken = (value) => {
  const header = String(value || "");
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
};

const getScopedAdminIdFromRequest = (req) => {
  const queryAdminId = parseAdminId(req.query?.adminId);
  if (queryAdminId != null) return queryAdminId;
  const bodyAdminId = parseAdminId(req.body?.adminId);
  if (bodyAdminId != null) return bodyAdminId;
  const authAdminId = parseAdminId(req.backendAuth?.id);
  return authAdminId != null ? authAdminId : undefined;
};

const verifyBackendAuthPayload = (payload) => {
  const adminId = parseAdminId(payload?.id);
  if (!payload || payload?.scope !== BACKEND_SCOPE || adminId == null) {
    return null;
  }
  return payload;
};

const requireBackendAuth = (req, res, next) => {
  const token = extractBearerToken(req.headers.authorization);
  const payload = verifyBackendAuthPayload(verifyAuthToken(token));
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const requestedAdminId = parseAdminId(req.query?.adminId ?? req.body?.adminId);
  if (
    requestedAdminId != null &&
    payload.admin_tier !== "super_admin" &&
    requestedAdminId !== parseAdminId(payload.id)
  ) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  req.backendAuth = payload;
  next();
};

const isLocalhostOrigin = (origin) =>
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

const resolveOrigin = (origin) => {
  if (!origin) return FRONTEND_ORIGIN;
  if (FRONTEND_ORIGINS.has(origin) || isLocalhostOrigin(origin)) return origin;
  return FRONTEND_ORIGIN;
};

app.use((req, res, next) => {
  const origin = resolveOrigin(req.headers.origin);
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.get("/", (req, res) => {
  res.json({ 
    status: 'ok',
    message: 'Backend running',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
  });
});

app.get("/health/storage", async (req, res) => {
  if (process.env.DEBUG_STORAGE_CHECK !== "true") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const authPath = process.env.WHATSAPP_AUTH_PATH || ".wwebjs_auth";
  try {
    const stats = await fs.stat(authPath);
    const entries = await fs.readdir(authPath).catch(() => []);
    res.json({
      ok: true,
      authPath,
      exists: true,
      isDirectory: stats.isDirectory(),
      entryCount: entries.length,
      sampleEntries: entries.slice(0, 10),
    });
  } catch (err) {
    res.json({
      ok: false,
      authPath,
      exists: false,
      error: err?.message || "Unknown error",
    });
  }
});

app.use("/whatsapp", requireBackendAuth, whatsappRateLimiter);

app.get("/whatsapp/status", (req, res) => {
  try {
    const state = getWhatsAppState(getScopedAdminIdFromRequest(req));
    res.json(state);
  } catch (err) {
    logger.error("Failed to get WhatsApp status", { error: err.message });
    res.status(500).json({ error: "Failed to get status" });
  }
});

app.post("/whatsapp/start", async (req, res) => {
  try {
    const result = await startWhatsApp(getScopedAdminIdFromRequest(req));
    if (result?.error) {
      logger.warn("WhatsApp start failed", { error: result.error, adminId: getScopedAdminIdFromRequest(req) });
      res.status(400).json(result);
      return;
    }
    logger.info("WhatsApp started successfully", { adminId: getScopedAdminIdFromRequest(req) });
    res.json(result);
  } catch (err) {
    logger.error("Failed to start WhatsApp", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Failed to start WhatsApp" });
  }
});

app.post("/whatsapp/disconnect", async (req, res) => {
  try {
    const result = await stopWhatsApp(getScopedAdminIdFromRequest(req));
    if (result?.error) {
      logger.warn("WhatsApp disconnect failed", { error: result.error, adminId: getScopedAdminIdFromRequest(req) });
      res.status(400).json(result);
      return;
    }
    logger.info("WhatsApp disconnected successfully", { adminId: getScopedAdminIdFromRequest(req) });
    res.json(result);
  } catch (err) {
    logger.error("Failed to disconnect WhatsApp", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Failed to disconnect WhatsApp" });
  }
});

app.post("/whatsapp/send", async (req, res) => {
  try {
    const userId = Number(req.body?.userId);
    const message = String(req.body?.message || "").trim();
    const result = await sendAdminMessage({
      adminId: getScopedAdminIdFromRequest(req),
      userId: Number.isFinite(userId) ? userId : undefined,
      text: message,
    });
    if (result?.error) {
      res.status(result.status || 400).json({ success: false, error: result.error, code: result.code });
      return;
    }
    res.json({ success: true, data: result?.data || null });
  } catch (err) {
    console.error("❌ Failed to send WhatsApp message:", err);
    res.status(500).json({ success: false, error: "Failed to send WhatsApp message" });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || FRONTEND_ORIGINS.has(origin) || isLocalhostOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST"],
  },
});

io.use((socket, next) => {
  const authHeaderToken = extractBearerToken(socket.handshake.headers?.authorization);
  const handshakeToken = String(socket.handshake.auth?.token || "").trim();
  const token = handshakeToken || authHeaderToken;
  const payload = verifyBackendAuthPayload(verifyAuthToken(token));
  if (!payload) {
    next(new Error("Unauthorized"));
    return;
  }

  const requestedAdminId = parseAdminId(socket.handshake.query?.adminId);
  const tokenAdminId = parseAdminId(payload.id);
  if (tokenAdminId == null) {
    next(new Error("Unauthorized"));
    return;
  }

  if (
    requestedAdminId != null &&
    payload.admin_tier !== "super_admin" &&
    requestedAdminId !== tokenAdminId
  ) {
    next(new Error("Forbidden"));
    return;
  }

  socket.data.backendAuth = payload;
  socket.data.adminId = requestedAdminId != null ? requestedAdminId : tokenAdminId;
  next();
});

const enableRedisAdapter = async (ioServer) => {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return;
  try {
    const { createClient } = await import("redis");
    const { createAdapter } = await import("@socket.io/redis-adapter");
    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    ioServer.adapter(createAdapter(pubClient, subClient));
    console.log("✅ Socket.IO Redis adapter enabled");
  } catch (err) {
    console.warn("⚠️ Redis adapter not enabled:", err?.message || err);
  }
};

try {
  await initializeDbHelpers();
  logger.info("Database helpers initialized");
} catch (err) {
  logger.warn("Database helpers initialization skipped at startup (will retry later)", {
    error: err?.message || err
  });
}

await enableRedisAdapter(io);

// Error handling middleware (must be after all routes)
app.use(sentryErrorHandler());

// 404 handler
app.use((req, res) => {
  logger.warn("Route not found", { path: req.path, method: req.method });
  res.status(404).json({
    error: "Not Found",
    message: "The requested resource was not found",
    path: req.path,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error("Unhandled error", {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });
  
  res.status(err.status || 500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === 'development' ? err.message : "An error occurred",
  });
});

io.on("connection", (socket) => {
  const adminId = parseAdminId(socket.data?.adminId);
  if (adminId != null) {
    const room = `admin:${adminId}`;
    socket.join(room);
    const state = getWhatsAppState(adminId);
    socket.emit("whatsapp:status", state);
    if (state.qrImage) {
      socket.emit("whatsapp:qr", { qrImage: state.qrImage });
    }
  } else {
    socket.emit("whatsapp:status", getWhatsAppState());
  }
});

whatsappEvents.on("status", (payload) => {
  const adminId = Number(payload?.adminId);
  if (Number.isFinite(adminId)) {
    io.to(`admin:${adminId}`).emit("whatsapp:status", payload);
    return;
  }
  io.emit("whatsapp:status", payload);
});

whatsappEvents.on("qr", (payload) => {
  const adminId = Number(payload?.adminId);
  const qrPayload =
    payload && typeof payload === "object"
      ? { qr: payload.qr, qrImage: payload.qrImage }
      : payload;
  if (Number.isFinite(adminId)) {
    io.to(`admin:${adminId}`).emit("whatsapp:qr", qrPayload);
    return;
  }
  io.emit("whatsapp:qr", qrPayload);
});

let currentPort = BASE_PORT;

const startServer = (port) => {
  server.listen(port, () => {
    const publicUrl = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
    const normalized =
      publicUrl && publicUrl.endsWith("/") ? publicUrl.slice(0, -1) : publicUrl;
    const logUrl = normalized || `http://localhost:${port}`;
    logger.info(`Backend running on ${logUrl}`, {
      port,
      environment: process.env.NODE_ENV || 'development',
    });
  });
};

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    const nextPort = currentPort + 1;
    logger.warn(`Port ${currentPort} in use, trying ${nextPort}...`);
    currentPort = nextPort;
    setTimeout(() => startServer(currentPort), 200);
    return;
  }
  logger.error("Server error", { error: err.message, code: err.code });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

startServer(currentPort);
