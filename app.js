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
const Message = mongoose.model('Message');
mongoose.set('debug', true);

mongoose.connect(config.DATABASE_URL, {useNewUrlParser: true, autoIndex: false}, () => {
  let db = mongoose.connection.db;
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
              } else {
                console.log('wrong password');
                socket.emit('unauthorized', 'wrong password')
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

      socket.on('getEphemeralUser', (userId, callback) => {
        console.log('socket got getEphemeralUser');
        User.findById(userId).then((user) => {
          console.log('getEphemeralUser callback');
          callback(user);
        });
      });

      socket.on('getChannel', (channelId, callback) => {
        console.log('socket got getChannel');
        Channel.findById(channelId).then((channel) => {
          if (channel.alive) {
            socket.join(channel._id);
            console.log('getChannel callback');
            callback(channel);
          }
        });
      });

      socket.on('getEphemeralChannel', (channelId, callback) => {
        console.log('socket got getEphemeralChannel');
        Channel.findById(channelId).then((channel) => {
          if (channel.alive) {
            callback(channel);
          }
        });
      });

      socket.on('getAllChannels', (callback) => {
        console.log('socket got getAllChannels');
        Channel.find({alive: true}).sort({name:1}).then((channels) => {
          callback(channels);
        });
      });

      // request = {
      //   channelId: String
      //   mode: -10, 0, 10
      //   from: messageId
      // }
      socket.on('getMessages', (request, callback) => {
        console.log('socket got getMessages');
        var channelCollection = db.collection(request.channelId);
        if (request.mode == 0) {
          //get most recent ten messages
          channelCollection.find().sort({$natural:-1}).limit(10).toArray().then((results) => {
            console.log('getMessages callback');
            callback(results.reverse());
          });
        } else if (request.mode < 0) {
          //get the ten messages made before the startId
          var fromId = mongoose.Types.ObjectId(request.from)
          channelCollection.find({_id: {$lt: fromId}}).sort({$natural:-1}).limit(10).toArray().then((results) => {
            console.log('getMessages callback');
            callback(results.reverse());
          });
        } else {
          //get the ten messages made after the endId
          channelCollection.find({_id: {$gt: fromId}}).sort({$natural:1}).limit(10).toArray().then((results) => {
            console.log('getMessages callback');
            callback(results.reverse());
          });
        }
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

      socket.on('editChannel', (newChannelInfo) => {
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
              io.in(channel._id).in('channelView').emit('addChannel', channel);

            } else {
              console.log('editChannel failed: not owner')
            }
          }
        });
      });

      socket.on('createChannel', (createChannelArgs, callback) => {
        console.log('socket got createChannel');
        var newChannel = new Channel({
          owner: currentUser._id,
          time: Date.now(),
          name: createChannelArgs.name,
          description: createChannelArgs.description,
          avatar: config.DEFAULT_AVATAR_URL,
          public: createChannelArgs.isPublic,
          members: [currentUser._id],
          alive: true
        });
        newChannel.save().then(() => {
          currentUser.channels.push(newChannel._id);
          currentUser.save().then(() => {
            console.log('createChannel emit addUser to room');
            io.in(currentUser._id).emit('addUser', currentUser);
            console.log('createChannel emit addChannel to room');
            io.in(newChannel._id).in('channelView').emit('addChannel', newChannel);
          });
        });
      });

      socket.on('deleteChannel', (channelId, callback) => {
        console.log('socket got deleteChannel');
        Channel.findById(channelId).then((channel) => {
          if (channel) {
            // if user is owner of channel
            if (channel.owner.equals(currentUser._id)) {
              channel.alive = false;
              channel.save();
              console.log('deleteChannel deleting channel from all members channels list');
              for (key in channel.members) {
                User.findById(channel.members[key]).then((member) => {
                  var channelsIndex = member.channels.indexOf(channel._id)
                  if (channelsIndex != -1) {
                    // splice channel array
                    member.channels.splice(channelsIndex, 1);
                    member.save();
                    console.log('deleteChannel emitting addUser to room');
                    // notify sockets watching this user
                    io.in(member._id).emit('addUser', member);
                    console.log('member channel list saved');
                  }
                });
              }
              // notify everyone watching channel that it's dead
              io.in(channel._id).in('channelView').emit('addChannel', channel);
              console.log('deleteChannel callback');
              callback('deleted');
            } else {
              console.log('deleteChannel failed: not owner');
            }
          }
        });
      });

      socket.on('joinChannel', (channelId, callback) => {
        console.log('socket got joinChannel');
        Channel.findById(channelId).then((channel) => {
          if (channel.alive) {
            // add channel to user.channels
            currentUser.channels.push(channel._id);
            // add user to channel.members
            channel.members.push(currentUser);
            currentUser.save();
            channel.save();
            // notify socks watching user and channel
            io.in(currentUser._id).emit('addUser', currentUser);
            io.in(channel._id).in('channelView').emit('addChannel', channel);
            callback('joined');
          } else {
            callback('channel does not exist');
          }
        });
      });

      socket.on('leaveChannel', (channelId, callback) => {
        console.log('socket got leaveChannel');
        Channel.findById(channelId).then((channel) => {
          if (channel.alive) {
            if (!channel.owner.equals(currentUser._id)) {
              var membersIndex = channel.members.indexOf(currentUser._id);
              if (membersIndex !== -1) {
                channel.members.splice(membersIndex, 1);
              }
              var channelsIndex = currentUser.channels.indexOf(channel._id);
              if (channelsIndex !== -1) {
                currentUser.channels.splice(channelsIndex, 1);
              }
              currentUser.save().then(() => {
                channel.save().then(() => {
                  console.log('leavechannel:', currentUser._id, 'left channel', channel._id);
                  io.in(currentUser._id).emit('addUser', currentUser);
                  io.in(channel._id).emit('addChannel', channel);
                  callback('left');

                })
              });
            } else {
              callback('owner cant leave');
            }
          } else {
            callback('channel not found');
          }
        })
      });

      socket.on('createMessage', (message, callback) => {
        console.log('socket got createMessage');
        Channel.findById(message.channel).then((channel) => {
          if (channel.alive == true) {
            var MessageModel = mongoose.model('Message', Message.schema, message.channel);
            MessageData = new MessageModel({
              user: currentUser._id,
              time: Date.now(),
              channel: channel._id,
              messageText: message.messageText,
              edited: false,
              file: message.file,
              alive: true,
            });
            MessageData.save().then(() => {
              callback('message saved');
              io.to(channel._id).emit('newMessage', MessageData);
            })
          }
        })
      });
    });
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
