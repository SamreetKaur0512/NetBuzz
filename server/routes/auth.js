const express = require("express");
const router  = express.Router();
const { verifyToken }              = require("../middleware/auth");
const { upload, handleMulterError } = require("../middleware/upload");
const {
  register, login, googleAuth, googleSetup, setPassword, changePassword,
} = require("../controllers/authController");

router.post("/register",         register);
router.post("/login",            login);
router.post("/google",           googleAuth);
// google-setup accepts a profile picture upload
router.post("/google-setup",     upload.single("profilePicture"), handleMulterError, googleSetup);
router.post("/set-password",     setPassword);
router.post("/change-password",  verifyToken, changePassword);

module.exports = router;