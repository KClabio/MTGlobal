const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/mtglobal_db';
  await mongoose.connect(uri);
  console.log('MongoDB connected.');
}

module.exports = connectDB;
