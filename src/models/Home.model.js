const { Schema, model } = require('mongoose')

const userSchema = new Schema(
  {
    phoneNumber: {
      type: Number,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    name: {
      type: String,
      required: true,
      lowercase: true
    },
    category: { 
      type: String,
       required: true }
  },
  {
    timestamps: true
  }
)

const Home = model('Home', userSchema)

module.exports = Home
