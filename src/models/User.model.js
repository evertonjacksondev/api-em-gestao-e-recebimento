const { Schema, model } = require('mongoose')

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      lowercase: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
)

const User = model('User', userSchema)

module.exports = User
