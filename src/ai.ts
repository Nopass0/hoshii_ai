import { OpenAI } from "openai";
import type { ChatCompletionCreateParamsBase, ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { z } from "zod";

// Проверка режима разработки
// Можно добавить в .env: DEBUG=true
const IS_DEBUG = process.env.DEBUG === "true";

/**
 * Простой логгер для отладки
 */
export const logger = {
  info: (message: string, ...args: any[]) => {
    if (IS_DEBUG) {
      console.log(`[ИНФО] ${message}`, ...args);
    }
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[ОШИБКА] ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    if (IS_DEBUG) {
      console.warn(`[ПРЕДУПРЕЖДЕНИЕ] ${message}`, ...args);
    }
  },
  debug: (message: string, ...args: any[]) => {
    if (IS_DEBUG) {
      console.debug(`[ОТЛАДКА] ${message}`, ...args);
    }
  },
}

/**
 * Инициализация клиента OpenAI с настройками для OpenRouter
 */
export const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "hoshii.ai",
    "X-Title": "Hoshii AI",
  },
});

/**
 * Класс для управления квотами API
 */
class RateLimiter {
  private queue: Array<{ resolve: Function; reject: Function; task: () => Promise<any>; priority: number }> = [];
  private isProcessing = false;
  private lastRequestTime = 0;
  private requestCount = 0;
  private readonly minDelayMs = 1000; // Минимальная задержка между запросами
  private readonly maxRetries = 5;
  private readonly maxRequestsPerMinute = 20; // Лимит для free моделей
  private readonly windowMs = 60 * 1000; // Окно в 1 минуту
  private requestTimestamps: number[] = [];

  constructor() {
    // Периодическая очистка старых временных меток
    setInterval(() => {
      const now = Date.now();
      this.requestTimestamps = this.requestTimestamps.filter(time => (now - time) < this.windowMs);
    }, 5000);
  }

  /**
   * Добавляет задачу в очередь и возвращает промис, который разрешится,
   * когда задача будет выполнена
   */
  async enqueue<T>(task: () => Promise<T>, priority: number = 0): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject, task, priority });
      // Сортировка очереди по приоритету (высший приоритет сначала)
      this.queue.sort((a, b) => b.priority - a.priority);
      
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * Проверяет, не превышен ли лимит запросов
   */
  private isRateLimited(): boolean {
    const now = Date.now();
    // Удаляем старые записи
    this.requestTimestamps = this.requestTimestamps.filter(time => (now - time) < this.windowMs);
    return this.requestTimestamps.length >= this.maxRequestsPerMinute;
  }

  /**
   * Обрабатывает очередь запросов
   */
  private async processQueue() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;

    if (this.isRateLimited()) {
      const waitTime = this.calculateWaitTime();
      logger.warn(`Превышен лимит запросов, ожидание ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    // Если не прошло достаточно времени с последнего запроса
    if (timeSinceLastRequest < this.minDelayMs) {
      const delay = this.minDelayMs - timeSinceLastRequest;
      logger.debug(`Добавляем задержку ${delay}ms между запросами`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const { resolve, reject, task } = this.queue.shift()!;

    try {
      // Запускаем задачу с повторными попытками
      const result = await this.executeWithRetries(task);
      
      // Обновляем время последнего запроса и добавляем в список запросов
      this.lastRequestTime = Date.now();
      this.requestTimestamps.push(this.lastRequestTime);
      
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      // Продолжаем обработку очереди
      setTimeout(() => this.processQueue(), 0);
    }
  }

  /**
   * Вычисляет время ожидания при превышении лимита
   */
  private calculateWaitTime(): number {
    const now = Date.now();
    if (this.requestTimestamps.length === 0) return 0;
    
    // Находим самый старый запрос в окне
    const oldestTimestamp = Math.min(...this.requestTimestamps);
    // Вычисляем, сколько осталось до выхода из окна
    return Math.max(0, oldestTimestamp + this.windowMs - now + 500); // +500ms запас
  }

  /**
   * Выполняет задачу с повторными попытками в случае ошибок
   */
  private async executeWithRetries<T>(task: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await task();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Проверяем, является ли ошибка превышением квоты или временной ошибкой
        const isRateLimitError = 
          error instanceof Error && 
          (error.message.includes('429') || 
           error.message.includes('rate limit') ||
           error.message.includes('timeout'));
        
        // Если это последняя попытка или не ошибка лимита
        if (attempt === this.maxRetries || !isRateLimitError) {
          logger.error(`Попытка #${attempt} не удалась: ${lastError.message}`);
          throw lastError;
        }

        // Если это ошибка лимита, ждем все дольше и дольше
        const delay = Math.min(2000 * attempt, 10000); // Экспоненциальное увеличение задержки, но не более 10 секунд
        logger.warn(`Ошибка API (попытка ${attempt}/${this.maxRetries}), повтор через ${delay}ms: ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Этот код не должен выполниться, но TypeScript требует возврата
    throw lastError || new Error('Неизвестная ошибка');
  }
}

// Создаем единый экземпляр RateLimiter для всего приложения
export const rateLimiter = new RateLimiter();

/**
 * Карта кодов языков для локализации
 */
export const languageMap: Record<string, string> = {
  "en": "English",
  "ru": "Russian",
  "es": "Spanish",
  "fr": "French",
  "de": "German",
  "zh": "Chinese",
  "ja": "Japanese",
  "ko": "Korean",
  "it": "Italian",
  "pt": "Portuguese",
  "ar": "Arabic",
  "hi": "Hindi",
  "tr": "Turkish",
  "nl": "Dutch",
  "pl": "Polish",
  "id": "Indonesian"
};

/**
 * Типы инструментов для AI
 */
export interface AIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

/**
 * Типы вызовов инструментов
 */
export interface AIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Результат выполнения инструмента
 */
export interface AIToolResult {
  tool_call_id: string;
  role: 'tool';
  content: string;
}

/**
 * Типы сообщений для чата с AI
 */
export type AIMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: AIToolCall[];
};

/**
 * Опции для генерации текста
 */
export interface TextGenerationOptions {
  /** Системное сообщение для задания контекста AI */
  systemMessage?: string;
  /** История предыдущих сообщений */
  messageHistory?: AIMessage[];
  /** Язык ответа */
  languageCode?: string;
  /** Массив инструментов, доступных для AI */
  tools?: AIToolDefinition[];
  /** Выбор инструмента - auto, none или конкретный инструмент */
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  /** Режим потоковой генерации */
  stream?: boolean;
  /** Обработчик для потоковой генерации */
  onChunk?: (chunk: string) => void;
  /** Дополнительные параметры для API */
  params?: Partial<ChatCompletionCreateParamsBase>;
}

/**
 * Опции для генерации структурированного ответа
 */
export interface StructuredGenerationOptions<T extends z.ZodType> extends TextGenerationOptions {
  /** Zod схема для валидации и типизации ответа */
  schema: T;
  /** JSON схема для OpenAI */
  jsonSchema: OpenAI.ResponseFormatJSONSchema["json_schema"];
}

/**
 * Генерирует текстовый ответ от AI на основе запроса
 * 
 * @param prompt - Запрос к AI
 * @param options - Настройки генерации текста
 * @returns Строка с ответом от AI или вызовы инструментов
 */
export const generateText = async (
  prompt: string,
  options: TextGenerationOptions = {}
): Promise<{
  content: string;
  toolCalls?: AIToolCall[];
}> => {
  const { 
    systemMessage = "Ты полезный ассистент, который отвечает на русском языке.", 
    messageHistory = [],
    languageCode = "ru",
    tools,
    toolChoice,
    stream = false,
    onChunk,
    params = {}
  } = options;

  // Формируем сообщения для запроса
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemMessage },
  ];

  // Обрабатываем историю сообщений с учетом возможных вызовов инструментов
  for (const msg of messageHistory) {
    if (msg.role === 'tool' && msg.tool_call_id) {
      // Формируем сообщение от инструмента
      messages.push({
        role: 'tool',
        tool_call_id: msg.tool_call_id,
        content: msg.content
      });
    } else if (msg.role === 'assistant' && msg.tool_calls) {
      // Формируем сообщение ассистента с вызовами инструментов
      messages.push({
        role: 'assistant',
        content: msg.content || "",
        tool_calls: msg.tool_calls.map(tc => ({
          id: tc.id,
          type: tc.type,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments
          }
        }))
      });
    } else {
      // Обычное сообщение
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }
  }

  // Добавляем текущий запрос пользователя
  messages.push({ 
    role: "user", 
    content: languageCode ? 
      `${prompt} (Ответь на ${languageMap[languageCode]})` : 
      prompt 
  });

  // Создаем параметры запроса
  const requestParams: any = {
    ...params,
    model: process.env.OPENROUTER_MODEL || "google/gemini-2.5-pro-exp-03-25:free",
    messages,
  };

  // Добавляем инструменты, если есть
  if (tools && tools.length > 0) {
    requestParams.tools = tools;
  }

  // Добавляем выбор инструмента, если указан
  if (toolChoice) {
    requestParams.tool_choice = toolChoice;
  }

  // Запускаем функцию через rateLimiter для обработки лимитов
  if (stream && onChunk) {
    // Потоковая генерация
    return rateLimiter.enqueue(async () => {
      logger.info(`Начало потоковой генерации текста с ${messages.length} сообщениями`);
      
      let fullContent = '';
      let toolCalls: AIToolCall[] | undefined;
      
      const stream = await openai.chat.completions.create({
        ...requestParams,
        stream: true
      });
      
      for await (const chunk of stream) {
        // Обработка текстового фрагмента
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullContent += content;
          onChunk(content);
        }
        
        // Обработка вызовов инструментов
        if (chunk.choices[0]?.delta?.tool_calls) {
          if (!toolCalls) toolCalls = [];
          
          for (const toolCall of chunk.choices[0].delta.tool_calls) {
            // Находим существующий вызов или создаем новый
            const existingCall = toolCalls.find(tc => tc.id === toolCall.id);
            
            if (existingCall) {
              // Обновляем существующий вызов
              if (toolCall.function?.name) {
                existingCall.function.name = toolCall.function.name;
              }
              if (toolCall.function?.arguments) {
                existingCall.function.arguments += toolCall.function.arguments;
              }
            } else if (toolCall.id) {
              // Создаем новый вызов
              toolCalls.push({
                id: toolCall.id,
                type: 'function',
                function: {
                  name: toolCall.function?.name || '',
                  arguments: toolCall.function?.arguments || ''
                }
              });
            }
          }
          
          // Уведомляем о вызове инструмента
          onChunk(JSON.stringify({ type: 'tool_call', toolCalls }));
        }
      }
      
      logger.info(`Завершена потоковая генерация, получено ${fullContent.length} символов`);
      
      return { content: fullContent, toolCalls };
    });
  } else {
    // Обычная генерация
    return rateLimiter.enqueue(async () => {
      logger.info(`Начало генерации текста с ${messages.length} сообщениями`);
      
      try {
        const response = await openai.chat.completions.create({
          ...requestParams,
          stream: false,
        });
        
        if (!response || !response.choices || !response.choices[0]) {
          throw new Error('Пустой ответ от API');
        }
        
        const content = response.choices[0].message.content || "";
        const toolCalls = response.choices[0].message.tool_calls as any[];
        
        // Преобразуем вызовы инструментов в наш формат
        const formattedToolCalls = toolCalls?.map((tc: any) => ({
          id: tc.id,
          type: tc.type,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments
          }
        })) as AIToolCall[] | undefined;
        
        logger.info(`Завершена генерация текста, получено ${content.length} символов`);
        if (formattedToolCalls?.length) {
          logger.info(`Получено ${formattedToolCalls.length} вызовов инструментов`);
        }
        
        return { 
          content, 
          toolCalls: formattedToolCalls 
        };
      } catch (error) {
        logger.error(`Ошибка при генерации текста:`, error);
        throw error;
      }
    });
  }
};

/**
 * Генерирует структурированный ответ от AI на основе запроса и схемы
 * 
 * @param prompt - Запрос к AI
 * @param options - Настройки генерации структурированного ответа
 * @returns Типизированный объект, соответствующий переданной схеме
 */
export const generateStructured = async <T extends z.ZodType>(
  prompt: string,
  options: StructuredGenerationOptions<T>
): Promise<z.infer<T>> => {
  const { 
    schema,
    jsonSchema,
    systemMessage = "Ты полезный ассистент, который создает структурированные данные по запросу.", 
    messageHistory = [],
    languageCode = "ru",
    tools,
    toolChoice,
    stream = false,
    onChunk,
    params = {}
  } = options;

  // Создаем дополнительные инструкции для модели
  const schemaDescription = `
Ты должен вернуть данные JSON с конкретными значениями, а НЕ СХЕМУ.
НЕ ВОЗВРАЩАЙ ОПИСАНИЕ СХЕМЫ, возвращай только заполненный данными JSON.

Пример схемы:
{
  "type": "object",
  "properties": { ... }
}

ПРИМЕР ПРАВИЛЬНОГО ОТВЕТА (с реальными данными):
{
  "scene": "Описание сцены...",
  "options": [
    { "id": "option1", "text": "...", "consequence": "..." },
    { "id": "option2", "text": "...", "consequence": "..." }
  ]
}

Тип данных и структура:
\`\`\`json
${JSON.stringify(jsonSchema.schema, null, 2)}
\`\`\`

Важно: верни ТОЛЬКО JSON объект с данными, без схемы, без типов, без описаний полей.`;

  // Формируем сообщения для запроса
  const messages: ChatCompletionMessageParam[] = [
    { 
      role: "system", 
      content: `${systemMessage}\n\n${schemaDescription}` 
    }
  ];

  // Обрабатываем историю сообщений с учетом возможных вызовов инструментов
  for (const msg of messageHistory) {
    if (msg.role === 'tool' && msg.tool_call_id) {
      // Формируем сообщение от инструмента
      messages.push({
        role: 'tool',
        tool_call_id: msg.tool_call_id,
        content: msg.content
      });
    } else if (msg.role === 'assistant' && msg.tool_calls) {
      // Формируем сообщение ассистента с вызовами инструментов
      messages.push({
        role: 'assistant',
        content: msg.content || "",
        tool_calls: msg.tool_calls.map(tc => ({
          id: tc.id,
          type: tc.type,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments
          }
        }))
      });
    } else {
      // Обычное сообщение
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }
  }

  // Добавляем текущий запрос пользователя
  messages.push({ 
    role: "user", 
    content: languageCode ? 
      `${prompt} (Ответь на ${languageMap[languageCode]})` : 
      prompt 
  });

  // Создаем параметры запроса
  const requestParams: any = {
    ...params,
    model: process.env.OPENROUTER_MODEL || "google/gemini-2.5-pro-exp-03-25:free",
    messages,
  };

  // Добавляем инструменты, если есть
  if (tools && tools.length > 0) {
    requestParams.tools = tools;
  }

  // Добавляем выбор инструмента, если указан
  if (toolChoice) {
    requestParams.tool_choice = toolChoice;
  }
  // Применяем обработку через rateLimiter для управления лимитами и повторными попытками
  return rateLimiter.enqueue(async () => {
    // Максимальное количество попыток
    const maxRetries = 3;
    let lastError: Error | null = null;
  
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Попытка генерации структурированного ответа #${attempt}`);
        
        // Создаем параметры запроса для текущей попытки
        const currentMessages = [...messages];

        // Если это не первая попытка, добавляем инструкцию об ошибке
        if (attempt > 1 && lastError) {
          currentMessages.push({
            role: "user",
            content: `Предыдущая попытка не удалась. Ошибка: ${lastError.message}. Пожалуйста, верни ТОЛЬКО JSON с данными, а не схему JSON.`
          });
        }
        
        // Проверим наличие API ключа
        if (!process.env.OPENROUTER_API_KEY) {
          logger.error('Отсутствует OPENROUTER_API_KEY. Проверьте файл .env');
          throw new Error('Отсутствует API ключ. Проверьте конфигурацию');
        }

        // Изменяем модель на более стабильную для работы с JSON
        requestParams.model = process.env.OPENROUTER_MODEL || "google/gemini-2.5-pro-exp-03-25:free";
        
        // Добавляем дополнительные параметры для улучшения стабильности
        requestParams.max_tokens = 1024; // Ограничиваем размер ответа
        requestParams.temperature = 0.5; // Сниженная температура для более предсказуемых результатов
        requestParams.timeout = 30000; // Таймаут 30 секунд
        
        // Добавляем поддержку structured outputs согласно документации OpenRouter
        requestParams.response_format = {
          type: "json_schema",
          json_schema: {
            name: "structuredResponse",
            strict: true,
            schema: jsonSchema.schema
          }
        }
        
        // Логируем обновленные параметры запроса
        logger.debug(`Отправка запроса к API (модель: ${requestParams.model}, сообщений: ${currentMessages.length})`);
        
        // Выполняем запрос к API с обработкой возможных сетевых ошибок
        let response;
        try {
          response = await openai.chat.completions.create({
            ...requestParams,
            stream: false,
            messages: currentMessages,
          });
          
          logger.debug(`Ответ получен, статус запроса: ${response ? 'успешно' : 'ошибка'}`);
        } catch (apiError) {
          logger.error(`Ошибка при вызове API:`, apiError);
          throw new Error(`Ошибка вызова API: ${apiError instanceof Error ? apiError.message : String(apiError)}`);
        }
      
        // Проверим структуру ответа
        if (!response || !response.choices || !response.choices[0]) {
          logger.error('Структура ответа некорректна:', JSON.stringify(response));
          throw new Error('Некорректный ответ от API: отсутствуют варианты ответов');
        }
        
        if (!response.choices[0].message) {
          logger.error('Отсутствует сообщение в ответе:', JSON.stringify(response.choices[0]));
          throw new Error('Пустой ответ от API: отсутствует сообщение');
        }
        
        const content = response.choices[0].message.content || "";
        logger.debug(`Получен ответ от API (${content.length} байт)`);
      
        // Ищем JSON в ответе с помощью регулярного выражения
        const jsonRegex = /```json\s*([\s\S]*?)\s*```|^\s*(\{[\s\S]*\})\s*$/m;
        const match = content.match(jsonRegex);
        
        // Проверяем, что у нас есть совпадение и захваченные группы не пустые
        let jsonStr = "";
        if (match) {
          // Пробуем использовать первую или вторую группу захвата
          if (match[1]) {
            jsonStr = match[1];
          } else if (match[2]) {
            jsonStr = match[2];
          }
        }
        
        // Если ничего не нашли в группах захвата, используем весь контент
        if (!jsonStr) {
          jsonStr = content;
        }
        
        // Убираем лишние символы и пробелы перед/после JSON
        jsonStr = jsonStr.trim();
        
        // Проверяем, что строка не пуста
        if (!jsonStr) {
          throw new Error('Пустой ответ от модели');
        }

        // Парсим JSON
        let parsedData;
        try {
          parsedData = JSON.parse(jsonStr);
          logger.debug('Успешно распарсили JSON');
        } catch (parseError) {
          logger.error('Ошибка парсинга JSON:', parseError);
          logger.error('Сырой ответ:', jsonStr);
          throw new Error(`Некорректный JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        }
        
        // Проверка, что это не схема, а данные
        if (parsedData.type === 'object' && parsedData.properties) {
          logger.warn('Модель вернула схему вместо данных');
          throw new Error('Модель вернула схему вместо данных');
        }

        // Валидируем и возвращаем типизированный ответ
        try {
          const validatedData = schema.parse(parsedData);
          logger.info(`Успешно сгенерирован структурированный ответ (попытка #${attempt})`);
          return validatedData;
        } catch (validationError) {
          logger.error('Ошибка валидации данных:', validationError);
          throw new Error(`Данные не соответствуют схеме: ${validationError instanceof Error ? validationError.message : String(validationError)}`);
        }
        
      } catch (error) {
        logger.error(`Попытка #${attempt} не удалась:`, error);
        logger.info('Пробуем снова...');
        
        // Сохраняем ошибку для использования в следующей попытке
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Если это последняя попытка, выбрасываем исключение
        if (attempt === maxRetries) {
          logger.error(`Все ${maxRetries} попытки не удались`);
          throw new Error(`Не удалось сгенерировать структурированный ответ после ${maxRetries} попыток. Последняя ошибка: ${lastError.message}`);
        }
      }
    }
    
    // Этот код не должен выполниться, но TypeScript требует возврата
    throw new Error("Unexpected end of function");
  });
};