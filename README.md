# Tool for code generation validators by typescript model description

Кодогенерация валидаторов на основе typescript моделей

Содержание:

- [Мотивация](#мотивация)
- [Установка](#установка)
- [Использование](#usage)
- [Как это работает](#как-это-работает)
  - [Конфигурация кодогенерации](#конфигурация-кодогенерации)
  - [Конфигурация валидаторов](#конфигурация-валидаторов)
  - [Валидатор](#валидатор)
  - [Локализация](#локализация)
  - [Декораторы](#декораторы)
    - [Для классов](#для-классов)
    - [Для свойств классов](#для-свойств-классов)
- [Лицензия](#license)

# Мотивация

В ходе анализа популярных библиотек для валидации, таких как:

- validator.js
- class-validator
- yup
- joi
- ajv

стало понятно, что все они заставляют разработчика вручную писать валидационную схему. Т.е. во многом дублировать код на typescript.

Поэтому возникла идея сделать кодогенерацию валидации на основании TS описания. По примеру нашей библиотеки
https://www.npmjs.com/package/grunt-generate-view-model

Что хотим от валидации:

1. изоморфность (возможность использования как на клиенте, так и на сервере);
2. не описывать отдельную схему валидации, а использовать typescript-описание;
3. для случаев, выходящих за рамки TS (проверка на соотвествие regexp, минимального значения, максимального значения и т.п.) использовать декораторы;
4. возможность использования кастомной валидации в виде функции, возможно асинхронной;
5. мультиязычность (вывод ошибок валидации на разных языках);
6. удобство использования;

# Установка

```bash
npm install ts-generate-validator -D
```

# Использование

1. Создать внутри папки `src` класс-модель на typescript и добавить к этому классу декоратор `@Validation`:

```typescript
// src/model.ts
import { Validation } from 'ts-generate-validator';

@Validation
export class User {
  public name: string = '';
  public age: number = 0;
  public website?: string;
}
```

2. Добавить в раздел `scripts` файла `package.json` инициализирующую команду "generateValidator", например:

```json
  "scripts": {
    "generation": "generateValidator"
  }
```

3. Запустить кодогенерацию

```bash
npm run generation
```

4. В папке `src/generated/validators` появится новый файл `src.model.ts` экспортирующий функцию-валидатор `userValidator`

5. Использовать валидатор для проверки соответствия данных json схеме, описанной в typescript моделе:

```typescript
// src/index.ts
import { ValidationException } from 'ts-generate-validator';
import { userValidator } from 'src/generated/validators';

const data = {
  name: 'John',
  age: 30
};

try {
  userValidator(data, { stopAtFirstError: true });
} catch (exception) {
  if (exception instanceof ValidationException) {
    console.log(`Неправильный формат данных`);
    exception.errors.map(({ field, message }) => `[${field}] - ${message}`).forEach(console.log);
  } else {
    throw exception;
  }
}
```

# Как это работает

## Конфигурация кодогенерации

Для изменения конфигурации по умолчанию, создайте файл "`ts-generate-validator-config.json`" в корне проекта, содержащий объект с любыми из следующих свойств:

`inputPath`_(string)_ - путь к папке с моделями для которых необходимо сгенерировать валидаторы (по умолчанию _"./src"_).

`outputPath`_(string)_ - путь к папке, в которой появятся сгенерированные валидаторы (по умолчанию _"./src/generated/validators"_).

`unknownPropertySeverityLevel`_(number)_ - уровень проверки неизвестных параметров (параметров, имеющих 1) тип в виде ссылки на другие классы моделей без `@Validation` декораторов или 2) typescript типы, отличающиеся от примитивных и без `@CustomValidation` декораторов). Может иметь следующие значения:

- `2` _(error)_ - при генерации валидаторов выбрасывается ошибка
- `1` _(warning)_ - кодогенерация проходит, но в консоли появляется предупреждение об отсутствии валидации
- `0` _(silent)_ - кодогенерация проходит

по умолчанию: `1` _("warning")_

Например:

```json
{
  "inputPath": "src/models",
  "outputPath": "generated/validators",
  "unknownPropertySeverityLevel": 2
}
```

## Конфигурация валидаторов

Конфигурацию валидаторов можно изменить двумя способами

1. Изменения глобальной конфигурации валидаторов с помощью функции `changeConfig`:

```typescript
import { changeConfig } from 'ts-generate-validator';

changeConfig({ stopAtFirstError: true });
```

2. Изменение конфигурации только для текущего вызова валидатора:

```typescript
import { userValidator } from 'src/generated/validators';

userValidator(data, { stopAtFirstError: true });
```

Следующие параметры могут быть сконфигурированы:

`stopAtFirstError`_(boolean)_ - не продолжать валидацию после первой найденной ошибки _(по умолчанию false)_.

`emailRegExp`_(RegExp)_ - заменяет регулярное выражение по умолчанию для проверки email.

`messages`_(object)_ - словарь с сообщениями об ошибках _(по умолчанию используются стандартные сообщения на английском)_.

## Валидатор

Сгенерированная из класса-модели функция-валидатор данных является асинхронной, если хотя бы для одного из свойств в классе-модели добавлен асинхронный custom валидатор. Она принимает в качестве аргументов:

`data`_(any) (обязательный)_ - JSON данные для проверки

`config`_(object) (необязательный)_ - объект с параметрами конфигурации

`context`_(any) (необязательный)_ - любое пользовательское значение, которое будет доступно в пользовательских валидаторах

**Результат выполнения:**
Пустой результат в результате успешной валидации. Если валидация завершилась неудачей, то выбрасывается `ValidationException`.

## Локализация

Сообщения об ошибке по умолчанию на английском языке, но они могут быть заменены на любые другие с помощью декораторов свойств классов-моделей (смотрите раздел [декораторы для свойств классов](#для-свойств-классов)), либо через установку параметра `messages` в конфигурации валидаторов (смотрите раздел [конфигурация валидаторов](#конфигурация-валидаторов)).

## Декораторы

Декораторы могут быть применены на классах, и на свойствах классов.

### Для классов

- `@Validation(config?: ValidationConfig)` - помечает класс, как требующий генерации функции-валидатора.

- `@RequiredOneOfValidation(fields: string[], message?: Message)` - добавляет к нескольким свойствам класса, перечисленным в первом аргументе fields, валидатор, проверяющий заполненность как минимум одного из указанных полей.

### Для свойств классов

- **all types**

  - `@TypeValidation(message: Message)` - заменяет стандартное сообщение об ошибке для валидатора типа.

  - `@CustomValidation(validator: CustomValidator, message: Message)` - добавляет к свойству пользовательскую функцию-валидатор, которая принимает в качестве первого аргумента объект со следующими свойствами:

    `property`_(any)_ - значение свойства для валидации

    `propertyName`_(string)_ - имя свойства для валидации

    `data`_(object)_ - объект с JSON данными для валидации

    `config`_(object)_ - объект с текущей конфигурацией валидаторов

    `context`_(any)_ - пользовательский контекст, переданный в сгенерированную функцию-валидатор

  - `@IgnoreValidation` - помечает свойство как игнорируемое в функции-валидаторе - оно не будет проверяться на соответствие типу, а любые примененные декораторы для дополнительной валидацией будут проигнорированы.

- **number**

  - `@MinValidation(threshold: number, message?: Message)` - добавляет валидатор, который проверяет число на соответствие минимальному значению `threshold`(включительно).

  - `@MaxValidation(threshold: number, message?: Message)` - добавляет валидатор, который проверяет число на соответствие максимальному значению `threshold`(включительно).

  - `@EqualValidation(value: number, message?: Message)` - добавляет валидатор, который проверяет соответствие числа значению, переданному в первом аргументе.

  - `@NegativeValidation(message?: Message)` - добавляет валидатор, который проверяет - является ли число отрицательным.

  - `@PositiveValidation(message?: Message)` - добавляет валидатор, который проверяет - является ли число положительным.

  - `@IntegerValidation(message?: Message)` - добавляет валидатор, который проверяет - является ли число целым.

  - `@FloatValidation(message?: Message)` - добавляет валидатор, который проверяет - содержит ли число плавающую точку.

  - `@LessThanValidation(propName: string, message?: Message)` - добавляет валидатор, который проверяет - является ли число меньшим, чем число в свойстве `propName`.

  - `@MoreThanValidation(propName: string, message?: Message)` - добавляет валидатор, который проверяет - является ли число большим, чем число в свойстве `propName`.

  - `@EqualToValidation(propName: string, message?: Message)` - добавляет валидатор, который проверяет соответствие числа значению, содержащемуся в свойстве `propName`.

- **string**

  - `@TrimValidation(message?: Message)` - добавляет валидатор, который проверяет отсутствие пробелов в начале и конце строки.

  - `@LowercaseValidation(message?: Message)` - добавляет валидатор, который проверяет отсутствие заглавных букв в строке.

  - `@UppercaseValidation(message?: Message)` - добавляет валидатор, который проверяет отсутствие строчных букв в строке.

  - `@MinLengthValidation(threshold: number, message?: Message)` - добавляет валидатор, который проверяет длину строки на соответствие максимальному значению `threshold`(включительно).

  - `@maxLength(threshold: number, message?: Message)` - добавляет валидатор, который проверяет длину строки на соответствие максимальному значению `threshold`(включительно).

  - `@EmailValidation(message?: Message)` - добавляет валидатор, который проверяет - является ли строка корректным email адресом.

  - `@UrlValidation(message?: Message)` - добавляет валидатор, который проверяет - является ли строка корректным url адресом.

  - `@MatchValidation(regexp: RegExp, message?: Message)` - добавляет валидатор, который проверяет строку на соответствие регулярному выражению, переданному в первом аргументе.

  - `@EqualValidation(value: string, message?: Message)` - добавляет валидатор, который проверяет - соответствует ли строка значению, переданному в первом аргументе.

  - `@EqualToValidation(propName: string, message?: Message)` - добавляет валидатор, который проверяет - соответствует ли строка значению, содержащемуся в свойстве `propName`.

# Лицензия

[MIT License](./LICENSE)
