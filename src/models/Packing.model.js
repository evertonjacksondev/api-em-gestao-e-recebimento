const { Schema, model } = require('mongoose')

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    torre: {
      type: String,
      unique: true,
      required: true
    },
    numero: {
      type: Number,
      required: true
    },
    phoneNumber: {
      type: String,
      required: true
    },
    document: {
      type: Number,
      required: true,
      unique: true
    },
    category: {
      type: String,
      required: true,
      unique: true
    }
  },
  {
    timestamps: true
  }
)

const Packing = model('Packing', userSchema)

module.exports = Packing
