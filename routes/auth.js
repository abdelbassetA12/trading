const router = require('express').Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');

// REGISTER
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: 'Username and password are required'
      });
    }

    const existingUser = await User.findOne({ username });

    if (existingUser) {
      return res.status(400).json({
        error: 'Username already exists'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      password: hashedPassword
    });

    const token = jwt.sign(
      {
        id: user._id,
        username: user.username
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '7d'
      }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax'
    });

    return res.status(201).json({
      message: 'Registered successfully'
    });

  } catch (err) {
    console.error('REGISTER ERROR:', err);

    return res.status(500).json({
      error: err.message
    });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'User not found' });

    // compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Wrong password' });

    // create token
    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 🍪 نخزن في cookie بدل localStorage
    res.cookie('token', token, {
      httpOnly: true,
      secure: false, // true في production (https)
      sameSite: 'lax'
    });

    res.json({ message: 'Logged in' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    secure: false, // في production اجعلها true مع HTTPS
    sameSite: 'lax',
    expires: new Date(0) // 👈 يمسح الكوكي مباشرة
  });

  return res.json({ message: 'Logged out successfully' });
});

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');

    // المستخدم الموجود في التوكن لم يعد موجودًا في قاعدة البيانات
    if (!user) {
      return res.status(401).json({
        error: 'User no longer exists'
      });
    }

    return res.json({
      id: user._id,
      username: user.username
    });

  } catch (err) {
    console.error('GET /auth/me error:', err);

    return res.status(500).json({
      error: 'Server error'
    });
  }
});

module.exports = router;
 