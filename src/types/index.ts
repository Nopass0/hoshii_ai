// Интерфейсы для инвентаря и предметов
export interface Item {
  id: string;
  name: string;
  description: string;
  type: "weapon" | "armor" | "potion" | "key" | "misc";
  properties?: {
    damage?: number;
    defense?: number;
    healing?: number;
    effects?: string[];
  };
  quantity: number;
}

// Интерфейс для NPC (персонажей и существ)
export interface NPC {
  id: string;
  name: string;
  type: "human" | "animal" | "monster" | "other";
  age?: number;
  gender?: "male" | "female" | "unknown" | "other";
  description: string;
  personality: string;
  background: string;
  intentions: string;
  inventory?: Item[];
  health?: number;
  maxHealth?: number;
  isHostile: boolean;
}

// Интерфейс для погодных условий
export interface Weather {
  current: string; // Например: "солнечно", "дождливо", "снег", и т.д.
  temperature: number; // Температура в Цельсиях
  effects: string[]; // Эффекты погоды на игровой процесс
}

// Интерфейс для времени
export interface GameTime {
  minute: number;
  hour: number;
  day: number;
  month: number;
  year: number;
  dayTime: "утро" | "день" | "вечер" | "ночь";
  totalMinutes: number; // Общее количество игровых минут, прошедших с начала игры
}

// Интерфейс для состояния героя
export interface Player {
  name: string;
  gender: string;
  age: number;
  background: string;
  health: number;
  maxHealth: number;
  inventory: Item[];
  abilities: string[];
  gold: number;
}

// Интерфейс для игрового мира
export interface GameWorld {
  name: string;
  description: string;
  rules: string;
  setting: string;
  mainStoryline: string;
}

// Расширенный интерфейс для игрового состояния
export interface GameState {
  scene: string;
  location: {
    name: string;
    description: string;
    terrain: string;
  };
  weather: Weather;
  time: GameTime;
  player: Player;
  world: GameWorld;
  npcsPresent: NPC[];
  options: Array<{
    id: string;
    text: string;
    consequence: string;
    timeChange?: number; // Минуты, которые пройдут при выборе этого варианта
    goldChange?: number; // Изменение количества золота: положительное - получение, отрицательное - трата
  }>;
}

// Интерфейс для истории игры (для передачи в AI)
export interface GameHistory {
  role: "user" | "assistant" | "system";
  content: string;
}
