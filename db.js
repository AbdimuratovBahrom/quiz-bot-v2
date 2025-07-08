const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./quiz.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS results (
    user_id INTEGER,
    username TEXT,
    score INTEGER,
    total INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

module.exports = db;
