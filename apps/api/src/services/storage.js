const fs = require("fs");
const path = require("path");

// Where uploaded images (room photos, avatars, the logo, the home page
// background, destination photos) are kept.
//
//   STORAGE_DRIVER=local (default)  files under apps/api/uploads, served by
//                                   this API at /uploads/...
//   STORAGE_DRIVER=s3               any S3-compatible bucket (AWS S3,
//                                   Cloudflare R2, MinIO, ...) whose objects
//                                   are publicly readable at S3_PUBLIC_URL
//
// An upload is referred to everywhere else by one string, stored in the
// database: "/uploads/<folder>/<file>" for local files, or the object's full
// public URL for S3. Both work as an <img src> (the web app prefixes the
// first kind with the API's address).

const UPLOADS_ROOT = path.join(__dirname, "../../uploads");
const FOLDERS = ["rooms", "avatars", "branding", "destinations"];

function getDriver() {
  return (process.env.STORAGE_DRIVER || "local").trim().toLowerCase() === "s3" ? "s3" : "local";
}

function getS3Config() {
  const endpoint = (process.env.S3_ENDPOINT || "").trim();
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE;

  return {
    bucket: (process.env.S3_BUCKET || "").trim(),
    region: (process.env.S3_REGION || "").trim() || "auto",
    endpoint,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    publicUrl: (process.env.S3_PUBLIC_URL || "").trim().replace(/\/+$/, ""),
    // Custom endpoints (MinIO, R2) usually want path-style addressing.
    forcePathStyle: forcePathStyle === undefined || forcePathStyle === "" ? Boolean(endpoint) : forcePathStyle === "true",
  };
}

// What is wrong with the storage configuration, for the startup check.
function getStorageProblems() {
  if (getDriver() !== "s3") return [];

  const config = getS3Config();
  const problems = [];
  if (!config.bucket) problems.push("S3_BUCKET is not set (STORAGE_DRIVER=s3)");
  if (!config.accessKeyId) problems.push("S3_ACCESS_KEY_ID is not set (STORAGE_DRIVER=s3)");
  if (!config.secretAccessKey) problems.push("S3_SECRET_ACCESS_KEY is not set (STORAGE_DRIVER=s3)");
  if (!/^https?:\/\//i.test(config.publicUrl)) {
    problems.push("S3_PUBLIC_URL must be the http(s) address the bucket's files are publicly readable at");
  }
  return problems;
}

let s3Client = null;

// The AWS SDK is only loaded when the S3 driver is actually in use.
function getS3() {
  const sdk = require("@aws-sdk/client-s3");
  if (!s3Client) {
    const config = getS3Config();
    s3Client = new sdk.S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }
  return { sdk, client: s3Client };
}

function assertFolder(folder) {
  if (!FOLDERS.includes(folder)) throw new Error(`Unknown upload folder: ${folder}`);
}

// Stores one verified image and returns the reference to keep in the database.
async function storeUpload(folder, filename, buffer, mime) {
  assertFolder(folder);

  if (getDriver() === "s3") {
    const { sdk, client } = getS3();
    const config = getS3Config();
    await client.send(
      new sdk.PutObjectCommand({
        Bucket: config.bucket,
        Key: `${folder}/${filename}`,
        Body: buffer,
        ContentType: mime,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
    return `${config.publicUrl}/${folder}/${filename}`;
  }

  const dir = path.join(UPLOADS_ROOT, folder);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, filename), buffer, { flag: "wx" });
  return `/uploads/${folder}/${filename}`;
}

// The file name of one of OUR uploads in `folder`, or null when the
// reference points anywhere else (an external URL, another folder, a path
// with traversal in it). Deleting only ever acts on what this returns.
function ownFilename(reference, folder) {
  if (typeof reference !== "string" || !reference) return null;

  const config = getS3Config();
  const prefixes = [`/uploads/${folder}/`];
  if (config.publicUrl) prefixes.push(`${config.publicUrl}/${folder}/`);

  for (const prefix of prefixes) {
    const at = reference.indexOf(prefix);
    // A local path may be stored with the API's own address in front of it;
    // an S3 reference must start with the public URL.
    if (at === -1 || (prefix.startsWith("http") && at !== 0)) continue;

    const filename = reference.slice(at + prefix.length).split(/[?#]/)[0];
    if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) return null;
    return { filename, remote: prefix.startsWith("http") };
  }
  return null;
}

// Best-effort removal of an upload that is no longer referenced. Never
// throws and is not awaited by callers: a leftover file is logged, it must
// not fail the request that replaced it.
function removeUpload(reference, folder, context = {}) {
  assertFolder(folder);
  const own = ownFilename(reference, folder);
  if (!own) return Promise.resolve();

  const fail = (err) => {
    console.error("UPLOAD CLEANUP FAILED:", { ...context, folder, file: own.filename, error: err.message });
  };

  if (own.remote) {
    if (getDriver() !== "s3") return Promise.resolve();
    const { sdk, client } = getS3();
    return client
      .send(new sdk.DeleteObjectCommand({ Bucket: getS3Config().bucket, Key: `${folder}/${own.filename}` }))
      .then(() => undefined, fail);
  }

  return fs.promises.unlink(path.join(UPLOADS_ROOT, folder, own.filename)).then(() => undefined, fail);
}

// The address a browser can load a stored reference from.
function publicUrl(req, reference) {
  if (/^https?:\/\//i.test(reference)) return reference;
  return `${req.protocol}://${req.get("host")}${reference}`;
}

function describeStorage() {
  if (getDriver() !== "s3") return "local disk (apps/api/uploads)";
  const config = getS3Config();
  return `s3 bucket "${config.bucket}" at ${config.endpoint || "AWS"} -> ${config.publicUrl}`;
}

module.exports = {
  FOLDERS,
  UPLOADS_ROOT,
  describeStorage,
  getDriver,
  getStorageProblems,
  ownFilename,
  publicUrl,
  removeUpload,
  storeUpload,
};
