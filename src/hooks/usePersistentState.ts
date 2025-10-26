import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

type UsePersistentStateOptions<T> = {
  serialize?: (value: T) => string;
  deserialize?: (value: string) => T;
  validate?: (value: T) => boolean;
};

const defaultSerialize = <T>(value: T) => JSON.stringify(value);
const defaultDeserialize = <T>(value: string) =>
  JSON.parse(value) as unknown as T;

const isStorageAvailable = () => {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const testKey = "__storage_test__";
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
};

export function usePersistentState<T>(
  key: string,
  defaultValue: T,
  options: UsePersistentStateOptions<T> = {},
): [T, Dispatch<SetStateAction<T>>] {
  const {
    serialize = defaultSerialize,
    deserialize = defaultDeserialize,
    validate,
  } = options;

  const [storageAvailable] = useState(isStorageAvailable);

  const [value, setValue] = useState<T>(() => {
    if (!storageAvailable) {
      return defaultValue;
    }

    try {
      const storedValue = window.localStorage.getItem(key);
      if (storedValue === null) {
        return defaultValue;
      }

      const parsedValue = deserialize(storedValue);
      if (validate && !validate(parsedValue)) {
        return defaultValue;
      }

      return parsedValue;
    } catch {
      return defaultValue;
    }
  });

  const setPersistentValue = useCallback(
    (update: SetStateAction<T>) => {
      setValue((currentValue) => {
        const nextValue =
          typeof update === "function"
            ? (update as (prevState: T) => T)(currentValue)
            : update;

        if (storageAvailable) {
          try {
            const serializedValue = serialize(nextValue);
            window.localStorage.setItem(key, serializedValue);
          } catch {
            // Swallow storage write errors (e.g. quota exceeded/tab privacy mode)
          }
        }

        return nextValue;
      });
    },
    [key, serialize, storageAvailable],
  );

  return [value, setPersistentValue];
}
