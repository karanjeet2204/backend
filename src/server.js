import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Actual route files in your project
import authRoutes from "./routes/auth.js";
import fileRoutes from "./routes/files.js";
import adminRoutes from "./routes/admin.js";

// Actual config files
import "./config/firebase.js";
import "./config/cloudinary.js";

const app = express();

/* =========================================================
   PORT
========================================================= */

const PORT = process.env.PORT || 5000;

/* =========================================================
   ALLOWED FRONTEND ORIGINS
========================================================= */

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://euphonious-faloodeh-fb753c.netlify.app",
];

/* =========================================================
   CORS
========================================================= */

app.use(
  cors({
    origin: (origin, callback) => {
      // Requests without Origin:
      // curl, Postman, server-to-server, etc.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(`CORS blocked origin: ${origin}`);

      // Don't throw an error here.
      // Simply deny the origin.
      return callback(null, false);
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
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
    ],

    optionsSuccessStatus: 204,
  })
);

/*
 * Explicitly handle OPTIONS preflight requests.
 */
app.options("*", cors());

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
   ROOT / HEALTH CHECK
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
   AUTH ROUTES
========================================================= */

app.use("/api/auth", authRoutes);

/* =========================================================
   FILE ROUTES
========================================================= */

app.use("/api/files", fileRoutes);

/* =========================================================
   ADMIN ROUTES
========================================================= */

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
  console.error("========================================");
  console.error("RÉTROVA SERVER ERROR");
  console.error("========================================");
  console.error(error);
  console.error("========================================");

  /* File upload size error */
  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      message: "File size exceeds the allowed limit",
    });
  }

  /* Generic server error */
  return res.status(500).json({
    success: false,
    message: "Internal server error",

    // Don't expose internal errors in production
    ...(process.env.NODE_ENV !== "production" && {
      error: error.message,
    }),
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
  console.log(`\n${signal} received.`);
  console.log("Shutting down RÉTROVA backend...");

  server.close(() => {
    console.log("RÉTROVA backend stopped.");
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error(
      "Could not close connections in time."
    );

    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  shutdown("SIGINT");
});