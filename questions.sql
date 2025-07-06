DROP TABLE IF EXISTS questions;
CREATE TABLE questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT,
  option1 TEXT,
  option2 TEXT,
  option3 TEXT,
  option4 TEXT,
  correct INTEGER,
  level TEXT
);

-- Примеры вопросов (замени или расширь сам)
INSERT INTO questions (question, option1, option2, option3, option4, correct, level) VALUES
('What is 2 + 2?', '3', '4', '5', '6', 2, 'beginner'),
('What is the capital of France?', 'London', 'Berlin', 'Paris', 'Rome', 3, 'beginner');