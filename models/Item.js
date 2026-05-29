const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [80, 'Name must be 80 characters or fewer'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description must be 500 characters or fewer'],
      default: '',
    },
    age: {
      type: Number,
      trim: true,
      maxlength: [3, 'Age must be 3 characters or fewer'],
      required: [true, 'Age is required'],
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Item', itemSchema);
