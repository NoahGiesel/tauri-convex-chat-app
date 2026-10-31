import type { Id } from "../../convex/_generated/dataModel";
import { ConversationView } from "@/components/conversation-view";
import { usePresenceHeartbeat } from "@/lib/presence";

/** Finestra staccata: una sola chat a tutta finestra, senza barra laterale né schede. */
export function PopoutChat({ conversationId }: { conversationId: string }) {
  usePresenceHeartbeat();
  return (
    <div className="flex h-screen flex-col bg-app-panel text-app-text">
      <ConversationView conversationId={conversationId as Id<"conversations">} showHeader />
    </div>
  );
}
