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
      <Chat />
    </div>
  );
}
