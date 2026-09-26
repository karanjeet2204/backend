import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from "./routes/authRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

// Initialize Firebase / Cloudinary configuration
// These imports ensure configuration is initialized when the server starts.
import "./config/firebase.js";
import "./config/cloudinary.js";

const app = express();

/* =========================================================
   CONFIGURATION
========================================================= */

const PORT = process.env.PORT || 5000;

// Add your deployed Netlify URL here.
// Keep localhost entries for local development.
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",

  // RÉTROVA production frontend
  "https://YOUR-NETLIFY-DOMAIN.netlify.app",
];

/* =========================================================
   CORS
========================================================= */

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin
      // (Postman, curl, server-to-server requests, etc.)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(`CORS blocked origin: ${origin}`);

      return callback(
        new Error("Not allowed by CORS")
      );
    },

    credentials: true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  })
);

/* =========================================================
   BODY PARSERS
========================================================= */

app.use(
  express.json({
    limit: "10mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
);

/* =========================================================
   REQUEST LOGGER
========================================================= */

app.use((req, res, next) => {
  const timestamp = new Date().toISOString();

  console.log(
    `[${timestamp}] ${req.method} ${req.originalUrl}`
  );

  next();
});

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    service: "RÉTROVA Backend",
    status: "online",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "healthy",
    service: "retrova-backend",
    timestamp: new Date().toISOString(),
  });
});

/* =========================================================
   API ROUTES
========================================================= */

// Authentication
app.use("/api/auth", authRoutes);

// User file operations
app.use("/api/files", fileRoutes);

// Admin operations
app.use("/api/admin", adminRoutes);

/* =========================================================
   API STATUS
========================================================= */

app.get("/api", (req, res) => {
  res.status(200).json({
    success: true,
    message: "RÉTROVA API is running",
    endpoints: {
      auth: "/api/auth",
      files: "/api/files",
      admin: "/api/admin",
    },
  });
});

/* =========================================================
   404 HANDLER
========================================================= */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found",
    path: req.originalUrl,
    method: req.method,
  });
});

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use((error, req, res, next) => {
  console.error("=================================");
  console.error("SERVER ERROR");
  console.error(error);
  console.error("=================================");

  // CORS error
  if (error.message === "Not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "CORS policy blocked this request",
    });
  }

  // Multer errors
  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      message: "File size exceeds the 100 MB limit",
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error",
    error:
      process.env.NODE_ENV === "production"
        ? undefined
        : error.message,
  });
});

/* =========================================================
   START SERVER
========================================================= */

const server = app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log("");
    console.log("========================================");
    console.log("        RÉTROVA BACKEND");
    console.log("========================================");
    console.log(`Environment : ${process.env.NODE_ENV || "development"}`);
    console.log(`Port        : ${PORT}`);
    console.log(`Health      : http://localhost:${PORT}/health`);
    console.log(`API         : http://localhost:${PORT}/api`);
    console.log("Status      : ONLINE");
    console.log("========================================");
    console.log("");
  }
);

/* =========================================================
   GRACEFUL SHUTDOWN
========================================================= */

const shutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down...`);

  server.close(() => {
    console.log("RÉTROVA backend stopped.");
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error(
      "Could not close connections in time. Force shutting down."
    );

    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));