import type { ResponseAnswer } from "../types";

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function formatQuestionType(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatScore(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }
  return value.toFixed(digits);
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

export function formatAnswerValue(answer: ResponseAnswer) {
  if (answer.value_text !== null && answer.value_text !== undefined) {
    return answer.value_text;
  }
  if (answer.value_number !== null) {
    return String(answer.value_number);
  }
  return formatValue(answer.value_options);
}

export function getQuestionOptions(options: unknown): string[] {
  if (Array.isArray(options)) {
    return options.map(String);
  }
  if (options && typeof options === "object") {
    const source = options as Record<string, unknown>;
    for (const key of ["options", "choices", "values"]) {
      if (Array.isArray(source[key])) {
        return source[key].map(String);
      }
    }
  }
  return [];
}
