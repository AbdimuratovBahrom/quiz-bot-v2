require('dotenv').config();

if (!process.env.BOT_TOKEN || !process.env.WEBHOOK_URL) {
  console.error("❌ Missing .env variables. BOT_TOKEN, WEBHOOK_URL must be defined.");
  process.exit(1);
}

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const shuffle = require('lodash.shuffle');
const db = require('./db');

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = process.env.PORT || 3000;

const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${WEBHOOK_URL}/bot${TOKEN}`);
console.log('📡 Webhook set to:', `${WEBHOOK_URL}/bot${TOKEN}`);

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Health check route
app.get('/', (req, res) => {
  res.send('✅ Bot is running.');
});

const levels = ['beginner', 'intermediate', 'advanced'];
const questions = {};

for (let level of levels) {
  const raw = fs.readFileSync(`questions/${level}.json`);
  questions[level] = JSON.parse(raw);
}

const userSessions = new Map();

function startQuiz(chatId, level) {
  const selected = shuffle(questions[level]).slice(0, 20);
  userSessions.set(chatId, {
    level,
    index: 0,
    score: 0,
    quiz: selected
  });
  sendQuestion(chatId);
}

function sendQuestion(chatId) {
  const session = userSessions.get(chatId);
  const question = session.quiz[session.index];
  const number = session.index + 1;

  const options = {
    reply_markup: {
      inline_keyboard: [
        question.options.map((opt, i) => ({
          text: opt,
          callback_data: i.toString()
        }))
      ]
    }
  };

  bot.sendMessage(chatId, `📚 Вопрос ${number} из 20:\n\n${question.text}`, options);
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Добро пожаловать! Выберите уровень:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🟢 Beginner", callback_data: "level_beginner" }],
        [{ text: "🟡 Intermediate", callback_data: "level_intermediate" }],
        [{ text: "🔴 Advanced", callback_data: "level_advanced" }]
      ]
    }
  });
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "📝 Начать тест") {
    bot.sendMessage(chatId, "Выберите уровень:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🟢 Beginner", callback_data: "level_beginner" }],
          [{ text: "🟡 Intermediate", callback_data: "level_intermediate" }],
          [{ text: "🔴 Advanced", callback_data: "level_advanced" }]
        ]
      }
    });
  }
});

bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const session = userSessions.get(chatId);

  if (query.data.startsWith('level_')) {
    const level = query.data.split('_')[1];
    bot.sendMessage(chatId, `Вы выбрали уровень: ${level.toUpperCase()} ✅\nНачинаем...`);
    startQuiz(chatId, level);
    return;
  }

  if (session) {
    const answerIndex = parseInt(query.data);
    const currentQuestion = session.quiz[session.index];
    const isCorrect = answerIndex === currentQuestion.correct;

    const reply = isCorrect ? "✅ Верно!" : `❌ Неверно. Правильный ответ: ${currentQuestion.options[currentQuestion.correct]}`;
    if (isCorrect) session.score++;

    bot.sendMessage(chatId, reply).then(() => {
      session.index++;

      if (session.index < 20) {
        setTimeout(() => {
          bot.sendMessage(chatId, '⏳ Следующий вопрос...');
          setTimeout(() => sendQuestion(chatId), 1000);
        }, 1000);
      } else {
        bot.sendMessage(chatId, `🎉 Викторина завершена!\nВаш результат: ${session.score} из 20`);
        saveResult(chatId, session.level, session.score);
        userSessions.delete(chatId);
      }
    });
  }
});

function saveResult(userId, level, score) {
  const stmt = db.prepare("INSERT INTO results (user_id, level, score, created_at) VALUES (?, ?, ?, datetime('now'))");
  stmt.run(userId, level, score);
}

bot.onText(/\/myresults/, (msg) => {
  const chatId = msg.chat.id;
  const stmt = db.prepare("SELECT level, score, created_at FROM results WHERE user_id = ? ORDER BY created_at DESC LIMIT 5");
  const results = stmt.all(chatId);

  if (results.length === 0) {
    bot.sendMessage(chatId, "⛔ У вас пока нет результатов.");
  } else {
    const message = results.map(r =>
      `📅 ${r.created_at} | ${r.level} — ${r.score}/20`
    ).join("\n");
    bot.sendMessage(chatId, `🗂 Ваши последние результаты:\n\n${message}`);
  }
});

bot.onText(/\/top10/, (msg) => {
  const stmt = db.prepare(`
    SELECT user_id, MAX(score) as score, level
    FROM results
    GROUP BY user_id
    ORDER BY score DESC
    LIMIT 10
  `);
  const rows = stmt.all();

  if (rows.length === 0) {
    bot.sendMessage(msg.chat.id, "Нет результатов для отображения.");
  } else {
    const message = rows.map((r, i) =>
      `#${i + 1} 👤 ${r.user_id} | ${r.level} — ${r.score}/20`
    ).join("\n");
    bot.sendMessage(msg.chat.id, `🏆 ТОП-10 игроков:\n\n${message}`);
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
