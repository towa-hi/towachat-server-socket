const mongoose = require('mongoose');
const {Schema} = mongoose;

const MessageSchema = new Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId, ref: 'User',
    required: true,
  },
  time: {
    type: Number,
    required: true,
  },
  channel: {
    type: mongoose.Schema.Types.ObjectId, ref: 'Channel',
  },
  messageText: {
    type: String,
    required: true,
  },
  edited: {
    type: Boolean,
  },
  file: {
    type: String,
  },
  alive: {
    type: Boolean,
    required: true,
  },
  edlted: {
    type: Boolean,
  }
},
{
  toObject: {
    transform: function(doc, ret) {
      delete ret.__v;
    }
  },
  toJSON: {
    transform: function(doc, ret) {
      delete ret.__v;
    }
  }
});

mongoose.model('Message', MessageSchema);
