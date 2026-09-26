import crypto from "crypto";

export const calculateChecksum = (buffer) => {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
};