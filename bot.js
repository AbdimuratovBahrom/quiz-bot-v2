require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const shuffle = require('lodash.shuffle');

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = process.env.PORT || 3000;

const bot = new TelegramBot(TOKEN, { webHook: { port: PORT } });

// Настраиваем Webhook
bot.setWebHook(`${WEBHOOK_URL}/bot`);

app.post(`/bot`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ==== ЛОГИКА БОТА ====

// Загружаем вопросы
const levels = ['beginner', 'intermediate', 'advanced'];
const questions = {};

for (let level of levels) {
  const raw = fs.readFileSync(`questions/${level}.json`);
  questions[level] = JSON.parse(raw);
}

// Храним сессии пользователей
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
    `📚 Вопрос ${number} из 20:\n\n${question.text}`,
    options
  );
}

// Команды
bot.onText(/\/start/, (msg) => {
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

// Ответы на inline кнопки
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const session = userSessions.get(chatId);

  // Если нажали на уровень
  if (query.data.startsWith('level_')) {
    const level = query.data.split('_')[1];
    bot.sendMessage(chatId, `Вы выбрали уровень: ${level.toUpperCase()} ✅\nНачинаем...`);
    startQuiz(chatId, level);
    return;
  }

  // Обработка ответа на вопрос
  if (session) {
    const answerIndex = parseInt(query.data);
    const currentQuestion = session.quiz[session.index];

    const isCorrect = answerIndex === currentQuestion.correct;
    const reply = isCorrect ? "✅ Верно!" : `❌ Неверно. Правильный ответ: ${currentQuestion.options[currentQuestion.correct]}`;

    if (isCorrect) session.score++;

    bot.sendMessage(chatId, reply).then(() => {
      session.index++;

      if (session.index < 20) {
        bot.sendMessage(chatId, '⏳ Следующий вопрос через 2 секунды...');
        setTimeout(() => sendQuestion(chatId), 2000);
      } else {
        bot.sendMessage(chatId, `🎉 Викторина завершена!\nВаш результат: ${session.score} из 20`);
        userSessions.delete(chatId);
      }
    });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
