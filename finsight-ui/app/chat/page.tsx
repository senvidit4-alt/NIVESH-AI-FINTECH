"use client";
import { TopBar } from "@/components/layout/TopBar";
import { ChatInterface } from "@/components/features/ChatInterface";

export default function ChatPage() {
  return (
    <div className="flex flex-col h-screen">
      <TopBar title="AI Chat" />
      <div className="flex-1 p-6 overflow-hidden">
        <ChatInterface />
      </div>
    </div>
  );
}
