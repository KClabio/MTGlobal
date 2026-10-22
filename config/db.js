const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/mtglobal_db';
  // 5 s instead of the default 30 s to find the database: if it goes away, visitors get the
  // "temporarily unavailable" page quickly (lib/db-guard.js) instead of a page that keeps loading.
  // A check every 2 s (not 10) notices it is back sooner: while it is away no page asks for it.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, heartbeatFrequencyMS: 2000 });
  console.log('MongoDB connected.');
}

module.exports = connectDB;
