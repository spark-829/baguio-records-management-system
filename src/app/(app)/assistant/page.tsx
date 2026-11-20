import { isAiDemo } from "@/lib/ai-demo";
import { Chat } from "./chat";

export default function AssistantPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Records assistant</h1>
        <p className="text-sm text-slate-600">
          Ask in plain words. The assistant searches only the records your account may see, and links every record it uses.
        </p>
      </div>
      {isAiDemo() && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <strong>Demo mode:</strong> this demo runs without an AI key, so answers come from a simple rule-based search, not Claude Haiku.
          It still searches live records under your own access rights. With a key, the same screen uses Haiku.
        </p>
      )}
      <Chat />
    </div>
  );
}
