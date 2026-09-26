import { db } from "../config/firebase.js";

export const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const userDoc = await db
      .collection("users")
      .doc(req.user.uid)
      .get();

    if (!userDoc.exists) {
      return res.status(403).json({
        success: false,
        message: "User profile not found",
      });
    }

    const userData = userDoc.data();

    if (userData.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    next();
  } catch (error) {
    console.error("Admin authorization error:", error);

    res.status(500).json({
      success: false,
      message: "Authorization check failed",
    });
  }
};