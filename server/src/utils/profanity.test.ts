import { describe, it, expect } from "vitest";
import { containsProfanity } from "./profanity.js";

describe("containsProfanity", () => {
  it("returns false for clean text", () => {
    expect(containsProfanity("Привет из Москвы!")).toBe(false);
    expect(containsProfanity("Hello world")).toBe(false);
    expect(containsProfanity("Смотрю с первого выпуска")).toBe(false);
    expect(containsProfanity("")).toBe(false);
  });

  it("detects Russian mat roots", () => {
    expect(containsProfanity("хуй")).toBe(true);
    expect(containsProfanity("пиздец")).toBe(true);
    expect(containsProfanity("блять")).toBe(true);
    expect(containsProfanity("мудак")).toBe(true);
  });

  it("detects mat inside longer words", () => {
    expect(containsProfanity("охуенно")).toBe(true);
    expect(containsProfanity("пиздатый")).toBe(true);
  });

  it("detects English profanity", () => {
    expect(containsProfanity("fuck this")).toBe(true);
    expect(containsProfanity("what the shit")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(containsProfanity("ХУЙНЯ")).toBe(true);
    expect(containsProfanity("Блять")).toBe(true);
    expect(containsProfanity("FUCK")).toBe(true);
  });

  it("handles ё→е substitution", () => {
    expect(containsProfanity("ёбаный")).toBe(true);
    expect(containsProfanity("ебаный")).toBe(true);
  });

  it("handles repeated chars (leetspeak-style)", () => {
    expect(containsProfanity("хуууй")).toBe(true);
  });

  it("does not false-positive on similar clean words", () => {
    expect(containsProfanity("блюдо")).toBe(false);
    expect(containsProfanity("заблудился")).toBe(false);
  });
});
