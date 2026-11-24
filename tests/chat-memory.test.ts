import { describe, expect, it } from "vitest";
import {
  buildChatRequest,
  capStoredTurns,
  clearOtherChats,
  parseStoredChat,
  serializeChat,
  type StoredTurn,
} from "../src/lib/chat-memory";

const src = { id: "a", tracking_no: "IN-2026-0001", n: 1 };

function turns(count: number, content = "hello"): StoredTurn[] {
  return Array.from({ length: count }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant", content: `${content} ${i}` }));
}

describe("parseStoredChat", () => {
  it("returns [] for missing or invalid input", () => {
    expect(parseStoredChat(null)).toEqual([]);
    expect(parseStoredChat("nope")).toEqual([]);
    expect(parseStoredChat("{}")).toEqual([]);
    expect(parseStoredChat(JSON.stringify({ v: 2, turns: [] }))).toEqual([]);
    expect(parseStoredChat(JSON.stringify({ v: 1, turns: "x" }))).toEqual([]);
    expect(parseStoredChat(JSON.stringify({ v: 1, turns: [{ role: "bot", content: "x" }, { role: "user", content: 5 }, null] }))).toEqual([]);
  });
  it("round trips a valid chat", () => {
    const chat: StoredTurn[] = [
      { role: "user", content: "q" },
      { role: "assistant", content: "a", demo: true, note: "n", sources: [src as never] },
    ];
    expect(parseStoredChat(serializeChat(chat))).toEqual(chat);
  });
  it("drops bad sources but keeps the turn", () => {
    const raw = JSON.stringify({ v: 1, turns: [{ role: "user", content: "q" }, { role: "assistant", content: "a", sources: [{ id: 1 }] }] });
    expect(parseStoredChat(raw)).toEqual([{ role: "user", content: "q" }, { role: "assistant", content: "a" }]);
  });
});

describe("capStoredTurns", () => {
  it("keeps the last 40 turns", () => {
    expect(capStoredTurns(turns(50))).toHaveLength(40);
  });
  it("trims by total characters", () => {
    const big = turns(10, "x".repeat(20_000));
    const out = capStoredTurns(big);
    expect(out.reduce((n, t) => n + t.content.length, 0)).toBeLessThanOrEqual(60_000);
    expect(out.length).toBeLessThan(10);
  });
  it("never starts with an assistant turn", () => {
    expect(capStoredTurns(turns(41))[0].role).toBe("user");
    expect(capStoredTurns(turns(40).slice(1))[0].role).toBe("user");
  });
});

describe("buildChatRequest", () => {
  it("sends everything with no summary for a short chat", () => {
    const r = buildChatRequest(turns(2) as never);
    expect(r.messages).toHaveLength(2);
    expect(r.summary).toBe("");
  });
  it("sends 5 messages and summarizes older turns for a long chat", () => {
    const list = turns(12, "x".repeat(2000)) as { role: "user" | "assistant"; content: string }[];
    list[1] = { role: "assistant", content: "It is IN-2026-0001 at Engineering." };
    list[6] = { role: "user", content: "Where is the drainage voucher?" };
    list[10] = { role: "assistant", content: "Also OUT-2026-0099 here." };
    list[11] = { role: "user", content: "q".repeat(5000) };
    const r = buildChatRequest(list);
    expect(r.messages).toHaveLength(5);
    expect(r.messages.slice(0, 4).every((m) => m.content.length <= 800)).toBe(true);
    expect(r.messages[4].content.length).toBe(4000);
    expect(r.summary).toContain("Where is the drainage voucher?");
    expect(r.summary).toContain("IN-2026-0001");
    expect(r.summary).not.toContain("OUT-2026-0099");
    expect(r.summary.length).toBeLessThanOrEqual(600);
  });
});

describe("clearOtherChats", () => {
  it("removes other chat keys and keeps unrelated ones", () => {
    const data = new Map([
      ["rms-chat:a", "1"],
      ["rms-chat:b", "2"],
      ["rms-idle", "3"],
    ]);
    const storage = {
      get length() {
        return data.size;
      },
      key: (i: number) => [...data.keys()][i] ?? null,
      removeItem: (k: string) => void data.delete(k),
    };
    clearOtherChats(storage, "rms-chat:b");
    expect([...data.keys()]).toEqual(["rms-chat:b", "rms-idle"]);
    clearOtherChats(storage);
    expect([...data.keys()]).toEqual(["rms-idle"]);
  });
});
