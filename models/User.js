const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },

  password: {
    type: String,
    required: true
  },

  bio: {
    type: String,
    default: ''
  },

  avatar: {
    type: String,
    default: ''
  },

  theme: {
    type: String,
    default: 'theme1'
  },

  socialIcons: [
    {
      platform: {
        type: String
      },

      url: {
        type: String
      },

      active: {
        type: Boolean,
        default: true
      }
    }
  ]
});

module.exports = mongoose.model('User', userSchema);