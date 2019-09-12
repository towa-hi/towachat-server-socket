const mongoose = require('mongoose');
const {Schema} = mongoose;

const ChannelSchema = new Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId, ref: 'User',
  },
  time: {
    type: Number,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  avatar: {
    type: String,
    required: true,
  },
  public: {
    type: Boolean,
    required: true,
  },
  members: [{
    type: Schema.Types.ObjectId, ref: 'User'
  }],
  banned: [{
    type: Schema.Types.ObjectId, ref: 'User'
  }],
  officers: [{
    type: Schema.Types.ObjectId, ref: 'User'
  }],
  messages: [{
    type: Schema.Types.ObjectId, ref: 'Message'
  }],
  pinnedMessages: [{
    type: Schema.Types.ObjectId, ref: 'Message'
  }],
  alive: {
    type: Boolean
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

mongoose.model('Channel', ChannelSchema);
