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
      socket.on('login', (credentials) => {
        console.log('socket got login');
        if (validateUsername(credentials.username)) {
          if (validatePassword(credentials.password)) {
            User.findOne({username: credentials.username}).then((user) => {
              if (!user) {
                console.log('login failed');
                socket.emit('unauthorized');
              } else if (user.validatePassword(credentials.password)) {
                var newToken = user.generateJWT();
                console.log('socket emit addUser');
                socket.emit('addUser', user);
                console.log('socket emit addSelf');
                socket.emit('addSelf', user._id);
                console.log('socket emit addToken');
                socket.emit('newToken', newToken);
              }
            });
          } else {
            socket.emit('unauthorized');
          }
        } else {
          socket.emit('unauthorized');
        }
      });

      socket.on('anything', (socket) => {
        console.log('socket got anything');
      });

      socket.on('getUser', (userId, callback) => {
        console.log('socket got getUser');
        User.findById(userId).then((user) => {
          console.log('socket emit newUser');
          // socket.emit('newUser', user);
          callback(user);
        });
      });

      socket.on('getChannel', (channelId, callback) => {
        console.log('socket got getChannel');
        Channel.findById(channelId).then((channel) => {
          console.log('socket emit get addChannel');
          // socket.emit('addChannel', channel);
          callback(channel);
        });

      });

    }).on('authenticated', (socket) => {
      console.log('authenticated ' + socket.decoded_token.username);
      User.findById(socket.decoded_token.id).then((user) => {
        var newToken = user.generateJWT();
        console.log('socket emit addUser');
        socket.emit('addUser', user);
        console.log('socket emit addSelf');
        socket.emit('addSelf', user._id);
        console.log('socket emit addToken');
        socket.emit('newToken', newToken);
      });
      socket.on('anything2', (socket) => {
        console.log('socket got anything2');
      });
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
  return false;
}

function validatePassword(password) {
  if (Validator.isLength(password, config.MIN_PASSWORD_LENGTH, config.MAX_PASSWORD_LENGTH)) {
    return true;
  }
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
  return false;
}
