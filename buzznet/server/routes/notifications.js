const express = require("express");
const router  = express.Router();
const { verifyToken } = require("../middleware/auth");
const Notification = require("../models/Notification");

// GET all notifications for logged in user
router.get("/", verifyToken, async (req, res) => {
  try {
    const notifs = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    const unreadCount = notifs.filter(n => !n.read).length;
    res.json({ success: true, notifications: notifs, unreadCount });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT mark one as read
router.put("/:id/read", verifyToken, async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { read: true }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
// DELETE one notification
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT mark ALL as read
router.put("/read-all", verifyToken, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user._id, read: false }, { read: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;