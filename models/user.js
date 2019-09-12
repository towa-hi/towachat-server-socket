const mongoose = require('mongoose');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/main');
const {Schema} = mongoose;

const UserSchema = new Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  handle: {
    type: String,
  },
  hash: {
    type: String,
    required: true,
  },
  salt: {
    type: String,
    required: true,
  },
  avatar: {
    type: String,
    required: true,
  },
  channels: [{
    type: Schema.Types.ObjectId, ref: 'Channel'
  }],
  alive: {
    type: Boolean,
    required: true,
  }
},
{
  toObject: {
    transform: function(doc, ret) {
      delete ret.__v;
      delete ret.hash;
      delete ret.salt;
    }
  },
  toJSON: {
    transform: function(doc, ret) {
      delete ret.__v;
      delete ret.hash;
      delete ret.salt;
    }
  }
});

UserSchema.methods.setPassword = function(password) {
  this.salt = crypto.randomBytes(16).toString('hex');
  this.hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, 'sha512').toString('hex');
};

UserSchema.methods.validatePassword = function(password) {
  const hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, 'sha512').toString('hex');
  return this.hash === hash;
};

UserSchema.methods.generateJWT = function() {
  const today = new Date();
  const expirationDate = new Date(today);
  expirationDate.setDate(today.getDate() + 60);

  return jwt.sign({
    username: this.username,
    id: this._id,
    exp: parseInt(expirationDate.getTime() / 1000, 10),
  }, config.SECRET);
}

UserSchema.methods.toAuthJSON = function() {
  return {
    _id: this._id,
    username: this.username,
    handle: this.handle,
    avatar: this.avatar,
    channels: this.channels,
    alive: this.alive,
    token: this.generateJWT(),
  };
}

UserSchema.methods.toClient = function() {
  return {
    _id: this._id,
    username: this.username,
    handle: this.handle,
    avatar: this.avatar,
    channels: this.channels,
    alive: this.alive
  }
}

mongoose.model('User', UserSchema);
