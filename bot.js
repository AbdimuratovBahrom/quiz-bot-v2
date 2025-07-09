
require('dotenv').config();

if (!process.env.BOT_TOKEN || !process.env.WEBHOOK_URL || !process.env.PORT) {
  console.error("❌ Missing .env variables. BOT_TOKEN, WEBHOOK_URL, PORT must be defined.");
  process.exit(1);
}

console.log('📦 BOT_TOKEN loaded:', !!process.env.BOT_TOKEN);
console.log('🌐 WEBHOOK_URL:', process.env.WEBHOOK_URL);
console.log('📡 PORT:', process.env.PORT);

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const shuffle = require('lodash.shuffle');
const db = require('./db'); // Подключаем SQLite
const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = process.env.PORT;

const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${WEBHOOK_URL}/bot`);

app.post(`/bot`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ==== ЛОГИКА БОТА ====

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

  bot.sendMessage(
    chatId,
    `📚 Вопрос ${number} из 20:

${question.text}`,
    options
  );
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, "Добро пожаловать! Нажмите кнопку ниже, чтобы начать тест.", {
    reply_markup: {
      keyboard: [
        [{ text: "📝 Начать тест" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
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
    bot.sendMessage(chatId, `Вы выбрали уровень: ${level.toUpperCase()} ✅
Начинаем...`);
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
        bot.sendMessage(chatId, `🎉 Викторина завершена!
Ваш результат: ${session.score} из 20`);
        saveResult(chatId, session.level, session.score);
        userSessions.delete(chatId);
      }
    });
  }
});

// Сохранение результата в БД
function saveResult(userId, level, score) {
  const stmt = db.prepare('INSERT INTO results (user_id, level, score, timestamp) VALUES (?, ?, ?, datetime("now"))');
  stmt.run(userId, level, score);
}

// Команда /top10
bot.onText(/\/top10/, (msg) => {
  const chatId = msg.chat.id;
  const rows = db.prepare(`
    SELECT user_id, level, MAX(score) as max_score
    FROM results
    GROUP BY user_id, level
    ORDER BY max_score DESC
    LIMIT 10
  `).all();

  if (rows.length === 0) {
    bot.sendMessage(chatId, "📭 Пока нет результатов.");
    return;
  }

  let response = "🏆 Топ 10 результатов:";

  rows.forEach((row, i) => {
    response += `${i + 1}. 👤 ${row.user_id} | ${row.level.toUpperCase()} | ${row.max_score}/20
`;
  });

  bot.sendMessage(chatId, response);
});



// Команда /myresults
bot.onText(/\/myresults/, (msg) => {
  const chatId = msg.chat.id;
  const rows = db.prepare('SELECT * FROM results WHERE user_id = ? ORDER BY timestamp DESC LIMIT 5').all(chatId);

  if (rows.length === 0) {
    bot.sendMessage(chatId, "📭 У вас пока нет сохранённых результатов.");
    return;
  }

  let response = "📊 Ваши последние результаты:";

  rows.forEach((r) => {
    response += `📅 ${r.timestamp} | ${r.level.toUpperCase()} | ${r.score}/20
`;
  });

  bot.sendMessage(chatId, response);
});

// Команда /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
    `ℹ️ Как пользоваться ботом:
` +
    `1. Нажмите /start или Начать тест и выберите уровень.
` +
    `2. Вам будет задано 20 вопросов.
` +
    `3. Отвечайте нажимая на варианты.
` +
    `4. После окончания увидите результат.

` +
    `Дополнительно:
` +
    `/top10 — лучшие результаты
` +
    `/myresults — ваши результаты
` +
    `/score — текущий прогресс
` +
    `/restart — начать заново`
  );
});



// Команда /level
bot.onText(/\/level/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Выберите уровень:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🟢 Beginner", callback_data: "level_beginner" }],
        [{ text: "🟡 Intermediate", callback_data: "level_intermediate" }],
        [{ text: "🔴 Advanced", callback_data: "level_advanced" }]
      ]
    }
  });
});

// Команда /score
bot.onText(/\/score/, (msg) => {
  const chatId = msg.chat.id;
  const session = userSessions.get(chatId);
  if (session) {
    bot.sendMessage(chatId, `🎯 Текущий результат: ${session.score} из ${session.index}`);
  } else {
    bot.sendMessage(chatId, `ℹ️ Пока нет активной викторины. Нажмите /start.`);
  }
});

// Команда /info
bot.onText(/\/info/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
    `📘 Этот бот поможет тебе проверить уровень английского!\n\n` +
    `📗 Уровни: Beginner, Intermediate, Advanced\n` +
    `🎯 По 20 случайных вопросов\n` +
    `📊 Итоговый результат — сразу после завершения.\n\n` +
    `Нажмите /start, чтобы начать!`
  );
});


// Команда /restart
bot.onText(/\/restart/, (msg) => {
  const chatId = msg.chat.id;
  userSessions.delete(chatId);
  bot.sendMessage(chatId, `🔄 Начинаем заново. Нажмите /start`);
});

app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});




