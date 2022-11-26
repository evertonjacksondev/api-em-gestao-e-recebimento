const { Schema, model } = require('mongoose')

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
    },
    torre: {
      type: String,
      required: true
      
    },
    numero: {
      type: Number,
      required: true,
      unique: true,
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
  },
  {
    timestamps: true
  }
)

const Resident = model('Resident', userSchema)

module.exports = Resident
