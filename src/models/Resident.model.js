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
    document: {
      type: Number,
      unique: true,
      required: true
    },
    category: {
      type: String,
      unique: true,
      required: true
    },
    numero: {
      type: Number,
      required: true
    },
    type: {
      type: String,
      required: true
    },
    phoneNumber: {
      type: String,
      required: true
    },
    status: {
      type: String,
      required: true
    },
    withDrawn: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
)

const Resident = model('Resident', userSchema)

module.exports = Resident
