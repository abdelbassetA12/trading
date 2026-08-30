const router = require('express').Router();
const User = require('../models/User');
const Link = require('../models/Link');

// ============================
// جلب بيانات المستخدم مع روابطه
// ============================
router.get('/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ error: "User not found" });
 
    const links = await Link.find({ userId: user._id });
    res.json({ user, links });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// تحديث البروفايل
// ============================
router.post('/update', async (req, res) => {
  try {
    const { oldUsername, newUsername, bio, avatar, theme } = req.body;
    const user = await User.findOneAndUpdate(
     //{ username },
     { username: oldUsername },
      { username: newUsername, bio, avatar, theme },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// إضافة رابط جديد
// ============================
router.post('/add-link', async (req, res) => {
  try {
    const { username, title, url, active } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: "User not found" });

   //const link = await Link.create({ userId: user._id, title, url });
   const link = await Link.create({ userId: user._id, title, url, active: active ?? true });
   
    res.json(link);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// تحديث رابط موجود (title, url, active)
// ============================
router.post('/update-link', async (req, res) => {
  try {
    const { linkId, title, url, active } = req.body;
    const link = await Link.findByIdAndUpdate(
      linkId,
      { title, url, active },
      { new: true }
    );
    if (!link) return res.status(404).json({ error: "Link not found" });
    res.json(link);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// حذف رابط
// ============================
router.post('/delete-link', async (req, res) => {
  try {
    const { linkId } = req.body;
    const link = await Link.findByIdAndDelete(linkId);
    if (!link) return res.status(404).json({ error: "Link not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// إضافة أيقونة اجتماعية
// ============================
router.post('/add-social', async (req, res) => {
  try {
    const { username, platform, url, active } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: "User not found" });

    user.socialIcons.push({ platform, url, active: active ?? true });
    await user.save();
    res.json(user.socialIcons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// تحديث أيقونة اجتماعية
// ============================
router.post('/update-social', async (req, res) => {
  try {
    const { username, index, platform, url, active } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.socialIcons[index]) return res.status(404).json({ error: "Social icon not found" });
    user.socialIcons[index] = { platform, url, active };
    await user.save();
    res.json(user.socialIcons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// حذف أيقونة اجتماعية
// ============================
router.post('/delete-social', async (req, res) => {
  try {
    const { username, index } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: "User not found" });

    user.socialIcons.splice(index, 1);
    await user.save();
    res.json(user.socialIcons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;