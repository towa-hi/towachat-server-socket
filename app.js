const express = require('express');
const app = express();
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const config = require('./config/main');
const jwt = require('jsonwebtoken');
const socketJWT = require('socketio-jwt');
const Validator = require('validator');

require('./models/user');
require('./models/message');
require('./models/channel');

const User = mongoose.model('User');
const Channel = mongoose.model('Channel');

mongoose.connect(config.DATABASE_URL, {useNewUrlParser: true, autoIndex: false}, () => {
  console.log('Mongoose connected.');
  const server = app.listen(config.PORT, () => {
    console.log('Server running on port ' + config.PORT);
    const io = socketIO(server);

    io.sockets.on('connection', (socket) => {
      console.log('socket got connection, id: ' + socket.id);
      //auth the token
      socketJWT.authorize({
        secret: config.SECRET,
        timeout: 150000
      })(socket);

      //unauthed socket emits and ons go here
      socket.on('login', (credentials, callback) => {
        console.log('socket got login');
        if (validateUsername(credentials.username)) {
          if (validatePassword(credentials.password)) {
            User.findOne({username: credentials.username}).then((user) => {
              if (!user) {
                console.log('login failed');
                socket.emit('unauthorized', 'no user found');
              } else if (user.validatePassword(credentials.password)) {
                var newToken = user.generateJWT();
                // exec callback
                console.log('login callback');
                callback({user: user, token: newToken});
              }
            });
          } else {
            console.log('bad password');
            socket.emit('unauthorized', 'bad password');
          }
        } else {
          console.log('bad username');
          socket.emit('unauthorized', 'bad username');
        }
      });

      socket.on('register', (credentials, callback) => {
        console.log('socket got register')
        if (validateUsername(credentials.username)) {
          if (validatePassword(credentials.password)) {
            User.findOne({username: credentials.username}).then((result) => {
              if (!result) {
                var newUser = new User({
                  username: credentials.username,
                  handle: credentials.username,
                  avatar: config.DEFAULT_AVATAR_URL,
                  hash: null,
                  salt: null,
                  alive: true
                });
                newUser.setPassword(credentials.password);
                newUser.save().then(() => {
                  var newToken = newUser.generateJWT();
                  console.log('register callback');
                  callback({user: newUser, token: newToken});
                });
              } else {
                socket.emit('unauthorized', 'username already exists');
              }
            });
          } else {
            socket.emit('unauthorized', 'bad password');
          }
        } else {
          socket.emit('unauthorized', 'bad username');
        }
      });

      socket.on('anything', (socket) => {
        console.log('socket got anything');
      });

      socket.on('getUser', (userId, callback) => {
        console.log('socket got getUser');
        User.findById(userId).then((user) => {
          socket.join(user._id);
          console.log('getUser callback');
          callback(user);
        });
      });

      socket.on('getChannel', (channelId, callback) => {
        console.log('socket got getChannel');
        Channel.findById(channelId).then((channel) => {
          socket.join(channel._id);
          console.log('getChannel callback');
          callback(channel);
        });
      });

    }).on('authenticated', (socket) => {
      console.log('authenticated ' + socket.decoded_token.username);
      let currentUser;
      User.findById(socket.decoded_token.id).then((user) => {
        currentUser = user;
        var newToken = user.generateJWT();
        console.log('socket emit addUser');
        socket.emit('addUser', user);
        console.log('socket emit addSelf');
        socket.emit('addSelf', user._id);
        console.log('socket emit addToken');
        socket.emit('newToken', newToken);
        socket.join(currentUser._id);
        var clients = io.sockets.adapter.rooms[currentUser._id].sockets;
        console.log(clients);
      });

      socket.on('anything2', (socket) => {
        console.log('socket got anything2');
      });

      socket.on('editSelf', (newUserInfo, callback) => {
        console.log('socket got editSelf');
        if (validateAvatar(newUserInfo.avatar)) {
          currentUser.avatar = newUserInfo.avatar;
        }
        if (validateHandle(newUserInfo.handle)) {
          currentUser.handle = newUserInfo.handle;
        }
        currentUser.save();
        console.log('editSelf emitting addUser to room');
        socket.to(currentUser._id).emit('addUser', currentUser);
        console.log('editSelf callback');
        callback(currentUser);
      });

      socket.on('editChannel', (newChannelInfo, callback) => {
        console.log('socket got editChannel');
        Channel.findById(newChannelInfo.channelId).then((channel) => {
          if (channel) {
            if (channel.owner.equals(currentUser._id)) {
              if (validateAvatar(newChannelInfo.avatar)) {
                channel.avatar = newChannelInfo.avatar;
              }
              if (validateChannelDescription(newChannelInfo.description)) {
                channel.description = newChannelInfo.description;
              }
              if (validateChannelName(newChannelInfo.name)) {
                channel.name = newChannelInfo.name;
              }
              channel.save();
              console.log('editChannel emitting addChannel to room');
              socket.to(channel._id).emit('addChannel', channel);
              console.log('editChannel callback');
              callback(channel);
            } else {
              console.log('editChannel failed: not owner')
            }
          }
        });

      })
    });

    // io.sockets.on('connection', socketJWT.authorize({
    //   secret: config.SECRET,
    //   timeout: 15000
    // }), (socket) => {
    //   socket.on('authenticated', () => {
    //     //auth events go here
    //     console.log('authenticated ' + socket.decoded_token.username);
    //     User.findById(socket.decoded_token.id).then((user) => {
    //       var newToken = user.generateJWT();
    //       socket.emit('newUser', user);
    //       socket.emit('newToken', newToken);
    //     });
    //   });
    // });

    //
    // io.sockets.on('connection', (socket) => {
    //   console.log('socket.io: user connected with socket id: ' + socket.id);
    //   socket.on('verify', (token) => {
    //     console.log('TOKEN GOT');
    //   });
    // });
  });
});

function validateUsername(username) {
  if (Validator.isAlphanumeric(username)) {
    if (Validator.isLength(username, config.MIN_USERNAME_LENGTH, config.MAX_USERNAME_LENGTH)) {
      return true;
    }
  }
  console.log('username validation failed')
  return false;
}

function validatePassword(password) {
  if (Validator.isLength(password, config.MIN_PASSWORD_LENGTH, config.MAX_PASSWORD_LENGTH)) {
    return true;
  }
  console.log('password validation failed')
  return false;
}

function validateAvatar(avatar) {
  if (Validator.isURL(avatar)) {
    return true;
  }
  return false;
}

function validateHandle(handle) {
  if (Validator.isLength(handle, config.MIN_HANDLE_LENGTH, config.MAX_HANDLE_LENGTH)) {
    return true;
  }
  console.log('App.js validateHandle failed');
  return false;
}

function validateChannelDescription(channelDescription) {
  if (Validator.isLength(channelDescription, config.MIN_CHANNEL_DESCRIPTION_LENGTH, config.MAX_CHANNEL_DESCRIPTION_LENGTH)) {
    return true;
  }
  console.log('App.js validateChannelDescription failed');
  return false;
}

function validateChannelName(channelName) {
  if (Validator.isLength(channelName, config.MIN_CHANNEL_NAME_LENGTH, config.MAX_CHANNEL_NAME_LENGTH)) {
    if (Validator.isAlphanumeric(channelName)) {
      return true;
    }
  }
  console.log('App.js validateChannelName failed');
  return false;
}
