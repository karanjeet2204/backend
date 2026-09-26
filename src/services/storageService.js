import cloudinary from "../config/cloudinary.js";

const NODES = ["node1", "node2", "node3", "node4"];

export const uploadToNode = (buffer, node, fileId) => {
  return new Promise((resolve, reject) => {
    const publicId = `vault/${node}/${fileId}`;

    const stream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: "auto",
        overwrite: true,
        invalidate: true,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({
          node,
          publicId,
          url: result.secure_url,
          resourceType: result.resource_type,
        });
      }
    );

    stream.end(buffer);
  });
};

export const createReplicas = async (buffer, fileId) => {
  const replicas = {};

  for (const node of NODES) {
    const result = await uploadToNode(
      buffer,
      node,
      fileId
    );

    replicas[node] = {
      node,
      publicId: result.publicId,
      url: result.url,
      checksum: null,
      status: "HEALTHY",
      resourceType: result.resourceType,
    };
  }

  return replicas;
};

export { NODES };