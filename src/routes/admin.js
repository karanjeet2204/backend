import express from "express";
import { db } from "../config/firebase.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { requireAdmin } from "../middleware/adminMiddleware.js";
import { calculateChecksum } from "../services/integrityService.js";
import { repairReplica } from "../services/repairService.js";
import { uploadToNode } from "../services/storageService.js";

const router = express.Router();

const NODES = ["node1", "node2", "node3", "node4"];

/*
|--------------------------------------------------------------------------
| GET USERS
|--------------------------------------------------------------------------
*/

router.get(
  "/users",
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const snapshot = await db
        .collection("users")
        .get();

      const users = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      res.json({
        success: true,
        users,
      });
    } catch (error) {
      console.error("Users error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to load users",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| GET ALL FILES
|--------------------------------------------------------------------------
*/

router.get(
  "/files",
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const snapshot = await db
        .collection("files")
        .get();

      const files = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      files.sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );

      res.json({
        success: true,
        files,
      });
    } catch (error) {
      console.error("Files error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to load files",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| VERIFY ALL REPLICAS
|--------------------------------------------------------------------------
*/

router.post(
  "/files/:fileId/verify",
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const { fileId } = req.params;

      const fileRef = db
        .collection("files")
        .doc(fileId);

      const fileDoc = await fileRef.get();

      if (!fileDoc.exists) {
        return res.status(404).json({
          success: false,
          message: "File not found",
        });
      }

      const file = fileDoc.data();

      const results = {};
      let healthyCount = 0;

      for (const node of NODES) {
        const replica = file.replicas?.[node];

        if (!replica) {
          results[node] = {
            status: "MISSING",
          };

          continue;
        }

        try {
          const response = await fetch(
            replica.url,
            {
              cache: "no-store",
            }
          );

          if (!response.ok) {
            results[node] = {
              status: "OFFLINE",
            };

            await fileRef.update({
              [`replicas.${node}.status`]:
                "OFFLINE",
            });

            continue;
          }

          const arrayBuffer =
            await response.arrayBuffer();

          const buffer = Buffer.from(arrayBuffer);

          const actualChecksum =
            calculateChecksum(buffer);

          if (
            actualChecksum === file.checksum
          ) {
            results[node] = {
              status: "HEALTHY",
              checksum: actualChecksum,
            };

            healthyCount++;

            await fileRef.update({
              [`replicas.${node}.status`]:
                "HEALTHY",
              [`replicas.${node}.checksum`]:
                actualChecksum,
            });
          } else {
            results[node] = {
              status: "CORRUPTED",
              checksum: actualChecksum,
              expectedChecksum:
                file.checksum,
            };

            await fileRef.update({
              [`replicas.${node}.status`]:
                "CORRUPTED",
              [`replicas.${node}.checksum`]:
                actualChecksum,
            });
          }
        } catch (error) {
          results[node] = {
            status: "OFFLINE",
            error: error.message,
          };

          await fileRef.update({
            [`replicas.${node}.status`]:
              "OFFLINE",
          });
        }
      }

      const finalStatus =
        healthyCount === 4
          ? "HEALTHY"
          : healthyCount > 0
          ? "DEGRADED"
          : "UNAVAILABLE";

      await fileRef.update({
        status: finalStatus,
        lastVerifiedAt:
          new Date().toISOString(),
      });

      res.json({
        success: true,
        fileId,
        status: finalStatus,
        healthyReplicas: healthyCount,
        results,
      });
    } catch (error) {
      console.error("Verification error:", error);

      res.status(500).json({
        success: false,
        message: "Integrity verification failed",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| MANUAL REPAIR
|--------------------------------------------------------------------------
*/

router.post(
  "/files/:fileId/repair/:node",
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const { fileId, node } = req.params;

      if (!NODES.includes(node)) {
        return res.status(400).json({
          success: false,
          message: "Invalid node",
        });
      }

      const result = await repairReplica(
        fileId,
        node
      );

      res.json({
        success: true,
        message: `${node} repaired successfully`,
        repair: result,
      });
    } catch (error) {
      console.error("Manual repair error:", error);

      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| CORRUPTION TEST
|--------------------------------------------------------------------------
|
| This deliberately corrupts one replica and then
| runs the actual automatic repair engine.
|
*/

router.post(
  "/files/:fileId/test-corruption/:node",
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const { fileId, node } = req.params;

      if (!NODES.includes(node)) {
        return res.status(400).json({
          success: false,
          message: "Invalid node",
        });
      }

      const fileRef = db
        .collection("files")
        .doc(fileId);

      const fileDoc = await fileRef.get();

      if (!fileDoc.exists) {
        return res.status(404).json({
          success: false,
          message: "File not found",
        });
      }

      const file = fileDoc.data();

      const targetReplica =
        file.replicas?.[node];

      if (!targetReplica) {
        return res.status(404).json({
          success: false,
          message: "Replica not found",
        });
      }

      /*
       * Download current replica
       */

      const response = await fetch(
        targetReplica.url,
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error(
          "Target replica unavailable"
        );
      }

      const arrayBuffer =
        await response.arrayBuffer();

      const buffer = Buffer.from(arrayBuffer);

      /*
       * Corrupt one byte
       */

      if (buffer.length > 0) {
        buffer[0] = buffer[0] ^ 255;
      }

      /*
       * Upload corrupted replica
       */

      await uploadToNode(
        buffer,
        node,
        fileId
      );

      const corruptedChecksum =
        calculateChecksum(buffer);

      /*
       * Mark corrupted
       */

      await fileRef.update({
        [`replicas.${node}.status`]:
          "CORRUPTED",

        [`replicas.${node}.checksum`]:
          corruptedChecksum,

        status: "DEGRADED",

        lastCorruptionAt:
          new Date().toISOString(),
      });

      /*
       * Automatically repair
       */

      const repairResult =
        await repairReplica(
          fileId,
          node
        );

      res.json({
        success: true,

        test: {
          node,
          expectedChecksum:
            file.checksum,
          corruptedChecksum,
          detected: true,
        },

        repair: repairResult,
      });
    } catch (error) {
      console.error(
        "Corruption test error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Corruption test failed",
        error: error.message,
      });
    }
  }
);

export default router;