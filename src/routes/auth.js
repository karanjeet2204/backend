import express from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { db } from "../config/firebase.js";
import { requireAdmin } from "../middleware/adminMiddleware.js";
const router = express.Router();

// Create / sync user profile
router.post("/sync-user", authenticate, async (req, res) => {
  try {
    const { uid, email } = req.user;

    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      await userRef.set({
        uid,
        email,
        role: "user",
        createdAt: new Date().toISOString(),
      });
    }

    const updatedDoc = await userRef.get();

    res.json({
      success: true,
      user: updatedDoc.data(),
    });
  } catch (error) {
    console.error("Sync user error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to sync user",
    });
  }
});

// Get current user
router.get("/me", authenticate, async (req, res) => {
  try {
    const userDoc = await db
      .collection("users")
      .doc(req.user.uid)
      .get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    res.json({
      success: true,
      user: userDoc.data(),
    });
  } catch (error) {
    console.error("Get user error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get user",
    });
  }
});
router.get("/admin-test", authenticate, requireAdmin, (req, res) => {
  res.json({
    success: true,
    message: "Admin API access verified",
  });
});
export default router;