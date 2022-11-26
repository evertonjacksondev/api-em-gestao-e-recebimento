const { Schema, model } = require('mongoose')

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
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
      required: true,
      enum: ['Pendente', 'Retirado']
    },
    withDrawn: {
      type: String,
      required: false
    }
  },
  {
    timestamps: true
  }
)

const Packing = model('Packing', userSchema)

module.exports = Packing
