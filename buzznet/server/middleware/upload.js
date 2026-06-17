const multer     = require("multer");
const cloudinary = require("cloudinary").v2;
const { Readable } = require("stream");

cloudinary.config({
  cloud_name:  process.env.CLOUDINARY_CLOUD_NAME,
  api_key:     process.env.CLOUDINARY_API_KEY,
  api_secret:  process.env.CLOUDINARY_API_SECRET,
});

// ── Use memory storage — file goes to Cloudinary, not disk ───────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg","image/jpg","image/png","image/gif","image/webp",
      "video/mp4","video/mpeg","video/quicktime","video/webm",
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("File type not allowed. Supported: JPEG, PNG, GIF, WEBP, MP4, MOV, WEBM"), false);
  },
});

// ── Upload buffer to Cloudinary ───────────────────────────────────────────────
const uploadToCloudinary = (buffer, options) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
    Readable.from(buffer).pipe(stream);
  });
};

// ── Middleware: upload file to Cloudinary after multer parses it ──────────────
const uploadToCloud = (fieldName, folder = "buzznet") => [
  upload.single(fieldName),
  async (req, res, next) => {
    if (!req.file) return next();
    try {
      const isVideo   = req.file.mimetype.startsWith("video/");
      const result    = await uploadToCloudinary(req.file.buffer, {
        folder,
        resource_type: isVideo ? "video" : "image",
      });
      req.file.cloudinaryUrl  = result.secure_url;
      req.file.cloudinaryId   = result.public_id;
      next();
    } catch (err) {
      next(err);
    }
  },
];

const handleMulterError = (err, req, res, next) => {
  if (err && err.message) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
};

module.exports = { upload, uploadToCloud, handleMulterError };