import { db } from "../config/firebase.js";
import { calculateChecksum } from "./integrityService.js";
import { uploadToNode } from "./storageService.js";

const NODE_NAMES = [
  "node1",
  "node2",
  "node3",
  "node4",
];

const getHealthySource = (file, targetNode) => {
  for (const node of NODE_NAMES) {
    if (node === targetNode) continue;

    const replica = file.replicas?.[node];

    if (
      replica &&
      replica.status === "HEALTHY"
    ) {
      return replica;
    }
  }

  return null;
};

export const repairReplica = async (
  fileId,
  targetNode
) => {
  const fileRef = db
    .collection("files")
    .doc(fileId);

  const fileDoc = await fileRef.get();

  if (!fileDoc.exists) {
    throw new Error("File not found");
  }

  const file = fileDoc.data();

  const targetReplica =
    file.replicas?.[targetNode];

  if (!targetReplica) {
    throw new Error("Target replica not found");
  }

  const sourceReplica = getHealthySource(
    file,
    targetNode
  );

  if (!sourceReplica) {
    throw new Error(
      "No healthy replica available for repair"
    );
  }

  console.log(
    `Repairing ${targetNode} using ${sourceReplica.node}`
  );

  // Mark target as repairing
  await fileRef.update({
    [`replicas.${targetNode}.status`]:
      "REPAIRING",
    status: "REPAIRING",
  });

  try {
    // Download healthy source
    const response = await fetch(
      sourceReplica.url
    );

    if (!response.ok) {
      throw new Error(
        "Healthy source replica could not be downloaded"
      );
    }

    const arrayBuffer =
      await response.arrayBuffer();

    const buffer = Buffer.from(arrayBuffer);

    // Verify source before using it
    const sourceChecksum =
      calculateChecksum(buffer);

    if (sourceChecksum !== file.checksum) {
      throw new Error(
        "Source replica failed integrity verification"
      );
    }

    // Upload healthy data to target node
    const repairedReplica =
      await uploadToNode(
        buffer,
        targetNode,
        fileId
      );

    // Verify repaired data locally
    const repairedChecksum =
      calculateChecksum(buffer);

    if (repairedChecksum !== file.checksum) {
      throw new Error(
        "Repaired replica checksum mismatch"
      );
    }

    const updatedReplica = {
      node: targetNode,
      publicId:
        repairedReplica.publicId,
      url: repairedReplica.url,
      checksum: repairedChecksum,
      status: "HEALTHY",
      resourceType:
        repairedReplica.resourceType,
      repairedAt:
        new Date().toISOString(),
    };

    await fileRef.update({
      [`replicas.${targetNode}`]:
        updatedReplica,
      status: "HEALTHY",
      lastRepairAt:
        new Date().toISOString(),
    });

    console.log(
      `${targetNode} repaired successfully`
    );

    return {
      success: true,
      targetNode,
      sourceNode: sourceReplica.node,
      replica: updatedReplica,
    };
  } catch (error) {
    await fileRef.update({
      [`replicas.${targetNode}.status`]:
        "CORRUPTED",
      status: "DEGRADED",
    });

    throw error;
  }
};