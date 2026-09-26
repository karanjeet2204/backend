import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Routes are outside src/
import authRoutes from "../routes/authRoutes.js";
import fileRoutes from "../routes/fileRoutes.js";
import adminRoutes from "../routes/adminRoutes.js";

// Firebase / Cloudinary configuration
import "../config/firebase.js";
import "../config/cloudinary.js";

const app = express();

/* =========================================================
   CONFIGURATION
========================================================= */

const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",

  // Replace this with your actual Netlify frontend URL
  "https://YOUR-NETLIFY-DOMAIN.netlify.app",
];

/* =========================================================
   CORS
========================================================= */

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without an Origin header
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(`CORS blocked origin: ${origin}`);

      return callback(new Error("Not allowed by CORS"));
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
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`
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
   API ROUTES
========================================================= */

app.use("/api/auth", authRoutes);

app.use("/api/files", fileRoutes);

app.use("/api/admin", adminRoutes);

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
  console.error("RÉTROVA SERVER ERROR");
  console.error(error);
  console.error("=================================");

  if (error.message === "Not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "CORS policy blocked this request",
    });
  }

  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      message: "File size exceeds the allowed limit",
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
    console.log("          RÉTROVA BACKEND");
    console.log("========================================");
    console.log(
      `Environment : ${process.env.NODE_ENV || "development"}`
    );
    console.log(`Port        : ${PORT}`);
    console.log(`Health      : /health`);
    console.log(`API         : /api`);
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

  setTimeout(() => {
    console.error(
      "Could not close connections in time. Force shutting down."
    );

    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("SIGINT", () => shutdown("SIGINT"));