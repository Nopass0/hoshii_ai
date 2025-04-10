import type { GameWorld, GameTime, Weather, Player } from "@/types";

// Начальная настройка игрового мира
export const gameWorld: GameWorld = {
  name: "Эльдерхейм",
  description: "Мир меча и магии, полный древних руин, загадочных лесов и опасных подземелий.",
  rules: "Стандартные правила D&D 5e с некоторыми упрощениями для текстового формата.",
  setting: "Средневековое фэнтези с элементами стимпанка в некоторых регионах.",
  mainStoryline: "Поиск древнего артефакта, способного остановить надвигающуюся катастрофу."
};

// Начальное время
export const initialTime: GameTime = {
  minute: 0,
  hour: 9, // Начало в 9 утра
  day: 1,
  month: 5, // Весна
  year: 1247, // Год от основания Империи
  dayTime: "утро",
  totalMinutes: 0
};

// Начальная погода
export const initialWeather: Weather = {
  current: "солнечно",
  temperature: 18,
  effects: ["хорошая видимость", "сухая земля", "лёгкий ветер"]
};

// Начальный игрок
export const initialPlayer: Player = {
  name: "Альтаир",
  gender: "мужской",
  age: 27,
  background: "Бывший стражник, ищущий приключений после несправедливого увольнения.",
  health: 100,
  maxHealth: 100,
  inventory: [
    {
      id: "sword1",
      name: "Простой меч",
      description: "Надежный стальной меч.",
      type: "weapon",
      properties: { damage: 10 },
      quantity: 1
    },
    {
      id: "armor1",
      name: "Кожаная броня",
      description: "Легкая защита.",
      type: "armor",
      properties: { defense: 5 },
      quantity: 1
    },
    {
      id: "potion_heal1",
      name: "Малое зелье лечения",
      description: "Восстанавливает немного здоровья.",
      type: "potion",
      properties: { healing: 25 },
      quantity: 2
    }
  ],
  abilities: ["владение мечом", "выносливость", "выживание"],
  gold: 15
};
