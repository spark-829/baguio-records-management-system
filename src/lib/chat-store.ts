import { useSyncExternalStore } from "react";
import { capStoredTurns, chatKey, clearOtherChats, parseStoredChat, serializeChat, type StoredTurn } from "./chat-memory";

const memory = new Map<string, StoredTurn[]>();
const listeners = new Set<() => void>();
const EMPTY: StoredTurn[] = [];

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Stable reference between writes (required by useSyncExternalStore). */
export function readChat(userId: string): StoredTurn[] {
  const hit = memory.get(userId);
  if (hit) return hit;
  for (const k of [...memory.keys()]) if (k !== userId) memory.delete(k);
  let turns = EMPTY;
  try {
    clearOtherChats(sessionStorage, chatKey(userId));
    const parsed = parseStoredChat(sessionStorage.getItem(chatKey(userId)));
    if (parsed.length > 0) turns = parsed;
  } catch {
    // storage blocked: keep the chat in memory only
  }
  memory.set(userId, turns);
  return turns;
}

export function writeChat(userId: string, turns: StoredTurn[]) {
  const capped = capStoredTurns(turns);
  memory.set(userId, capped);
  try {
    sessionStorage.setItem(chatKey(userId), serializeChat(capped));
  } catch {
    // quota or blocked: ignore
  }
  notify();
}

export function clearChat(userId: string) {
  memory.set(userId, EMPTY);
  try {
    sessionStorage.removeItem(chatKey(userId));
  } catch {
    // ignore
  }
  notify();
}

export function wipeAllChats() {
  memory.clear();
  try {
    clearOtherChats(sessionStorage);
  } catch {
    // ignore
  }
  notify();
}

export function useChatHistory(userId: string): StoredTurn[] {
  return useSyncExternalStore(subscribe, () => readChat(userId), () => EMPTY);
}
