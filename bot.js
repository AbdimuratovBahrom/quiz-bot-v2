
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');
const express = require('express');

const token = process.env.BOT_TOKEN;
const url = process.env.WEBHOOK_URL;
const port = process.env.PORT || 10000;

const bot = new TelegramBot(token, { webHook: { port } });
bot.setWebHook(`${url}/bot${token}`);

const app = express();
app.use(express.json());

app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});
app.get('/', (req, res) => res.send('🤖 Quiz Bot v2 is running!'));

let users = {};

function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}

function sendFeedback(chatId, isCorrect, correctAnswer = '') {
  const message = isCorrect
    ? '✅ Правильно!'
    : `❌ Неверно! Правильный ответ: ${correctAnswer}`;
  bot.sendMessage(chatId, message);
}

bot.onText(/\/start/, msg => {
  const chatId = msg.chat.id;
  if (msg.chat.type !== 'private') {
    bot.sendMessage(chatId, 'Пожалуйста, начните квиз в личных сообщениях.');
    return;
  }

  users[chatId] = { score: 0, index: 0, questions: [] };

  bot.sendMessage(chatId, 'Выберите уровень:', {
    reply_markup: {
      keyboard: [['Beginner'], ['Intermediate'], ['Advanced'], ['/start']],
      one_time_keyboard: true,
      resize_keyboard: true
    }
  });
});

bot.on('message', msg => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const user = users[chatId];

  if (msg.chat.type !== 'private') return;

  const levels = ['Beginner', 'Intermediate', 'Advanced'];

  if (!user) return;

  if (levels.includes(text)) {
    const level = text.toLowerCase();
    db.all('SELECT * FROM questions WHERE level = ?', [level], (err, rows) => {
      if (err || rows.length === 0) return bot.sendMessage(chatId, 'Нет вопросов!');
      user.questions = shuffle(rows).slice(0, 20);
      user.index = 0;
      user.score = 0;
      sendQuestion(chatId);
    });
    return;
  }

  const current = user.questions[user.index];
  if (current) {
    const answerIndex = [current.option1, current.option2, current.option3, current.option4].indexOf(text);
    const isCorrect = answerIndex + 1 === current.correct;
    if (isCorrect) user.score++;

    sendFeedback(chatId, isCorrect, current[`option${current.correct}`]);
    user.index++;

    if (user.index < user.questions.length) {
      setTimeout(() => sendQuestion(chatId), 1500);
    } else {
      setTimeout(() => {
        bot.sendMessage(chatId, `🎯 Квиз завершён! Ваш результат: ${user.score}/${user.questions.length}`, {
          reply_markup: {
            keyboard: [['/start']],
            resize_keyboard: true
          }
        });
        delete users[chatId];
      }, 1000);
    }
  }
});

function sendQuestion(chatId) {
  const user = users[chatId];
  if (!user || !user.questions || user.index >= user.questions.length) return;

  const q = user.questions[user.index];
  bot.sendMessage(chatId, `📚 Вопрос ${user.index + 1} из ${user.questions.length}:
${q.question}`, {
    reply_markup: {
      keyboard: [
        [q.option1, q.option2],
        [q.option3, q.option4],
        ['/start']
      ],
      resize_keyboard: true
    }
  });
}

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
