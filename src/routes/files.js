import express from "express";
import multer from "multer";
import { db } from "../config/firebase.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { calculateChecksum } from "../services/integrityService.js";
import { createReplicas } from "../services/storageService.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

// Upload file
router.post(
  "/upload",
  authenticate,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      const fileId = db.collection("files").doc().id;

      const checksum = calculateChecksum(req.file.buffer);

      console.log(`Uploading ${req.file.originalname}`);
      console.log(`Checksum: ${checksum}`);
      console.log("Creating 4 replicas...");

      const replicas = await createReplicas(
        req.file.buffer,
        fileId
      );

      // Add checksum to every replica
      Object.keys(replicas).forEach((node) => {
        replicas[node].checksum = checksum;
      });

      const fileMetadata = {
        fileId,
        ownerId: req.user.uid,
        ownerEmail: req.user.email || null,

        fileName: req.file.originalname,
        size: req.file.size,
        contentType: req.file.mimetype,

        checksum,

        replicas,

        replicaCount: 4,
        status: "HEALTHY",

        createdAt: new Date().toISOString(),
      };

      await db
        .collection("files")
        .doc(fileId)
        .set(fileMetadata);

      res.status(201).json({
        success: true,
        message: "File uploaded and replicated successfully",
        file: fileMetadata,
      });
    } catch (error) {
      console.error("Upload error:", error);

      res.status(500).json({
        success: false,
        message: "File upload failed",
        error: error.message,
      });
    }
  }
);

// Get user's files
router.get("/", authenticate, async (req, res) => {
  try {
    const snapshot = await db
      .collection("files")
      .where("ownerId", "==", req.user.uid)
      .get();

    const files = snapshot.docs.map((doc) => doc.data());

    files.sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );

    res.json({
      success: true,
      files,
    });
  } catch (error) {
    console.error("List files error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to retrieve files",
    });
  }
});

// Download file
router.get(
  "/:fileId/download",
  authenticate,
  async (req, res) => {
    try {
      const { fileId } = req.params;

      const fileDoc = await db
        .collection("files")
        .doc(fileId)
        .get();

      if (!fileDoc.exists) {
        return res.status(404).json({
          success: false,
          message: "File not found",
        });
      }

      const file = fileDoc.data();

      // User can only download their own files
      if (file.ownerId !== req.user.uid) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      const nodeNames = [
        "node1",
        "node2",
        "node3",
        "node4",
      ];

      let selectedReplica = null;

      for (const node of nodeNames) {
        const replica = file.replicas?.[node];

        if (replica && replica.status === "HEALTHY") {
          selectedReplica = replica;
          break;
        }
      }

      if (!selectedReplica) {
        return res.status(503).json({
          success: false,
          message: "No healthy replica available",
        });
      }

      console.log(
        `Downloading ${file.fileName} from ${selectedReplica.node}`
      );

      const cloudinaryResponse = await fetch(
        selectedReplica.url
      );

      if (!cloudinaryResponse.ok) {
        return res.status(502).json({
          success: false,
          message: "Storage node unavailable",
        });
      }

      const arrayBuffer =
        await cloudinaryResponse.arrayBuffer();

      const buffer = Buffer.from(arrayBuffer);

      // Verify downloaded replica
      const downloadedChecksum =
        calculateChecksum(buffer);

      if (downloadedChecksum !== file.checksum) {
        return res.status(500).json({
          success: false,
          message: "Replica integrity verification failed",
        });
      }

      res.setHeader(
        "Content-Type",
        file.contentType || "application/octet-stream"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(
          file.fileName
        )}"`
      );

      res.send(buffer);
    } catch (error) {
      console.error("Download error:", error);

      res.status(500).json({
        success: false,
        message: "Download failed",
      });
    }
  }
);

export default router;