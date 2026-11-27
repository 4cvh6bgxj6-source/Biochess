'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { getUiDict, type UiDictionary } from '@/lib/i18n';
import type { ChatMessage } from '@/lib/types';

interface MatchChatProps {
  messages: ChatMessage[];
  myUsername: string;
  opponentUsername: string;
  isBotGame: boolean;
  dict?: UiDictionary;
  onSend: (text: string) => void;
}

export function MatchChat({
  messages,
  myUsername,
  opponentUsername,
  isBotGame,
  dict,
  onSend,
}: MatchChatProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const d = dict || getUiDict('en');

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setDraft('');
  }

  return (
    <div className="flex flex-col flex-1 min-h-[220px] bg-[#21201D] border-t border-[#3C3A36]">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#3C3A36] bg-[#262421]">
        <span className="text-xs font-bold text-[#DAD9D7] truncate">
          Chat · {opponentUsername}
        </span>
        <span className="text-[11px] text-[#8B8987] shrink-0">
          {isBotGame ? 'Bot' : d.chatLive}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3.5 py-2.5 space-y-1.5 text-xs max-h-[210px]"
      >
        {messages.length === 0 && (
          <p className="text-[#8B8987] py-4 text-center">{d.chatEmpty}</p>
        )}

        {messages.map((msg) => {
          if (msg.kind === 'system') {
            return (
              <p key={msg.id} className="text-[11px] text-[#9E9D9A] py-0.5">
                {msg.text}
              </p>
            );
          }

          const isMine = msg.sender.toLowerCase() === myUsername.toLowerCase();

          return (
            <div key={msg.id} className="leading-snug break-words">
              <span
                className={`font-bold mr-1.5 ${
                  isMine ? 'text-[#81B64C]' : 'text-[#E5E4E2]'
                }`}
              >
                {msg.sender}:
              </span>
              <span className="text-[#DAD9D7]">{msg.text}</span>
            </div>
          );
        })}
      </div>

      <div className="px-3 py-1.5 border-t border-[#32302C] flex items-center gap-1.5 overflow-x-auto">
        {d.chatQuickPhrases.map((phrase) => (
          <button
            key={phrase}
            type="button"
            onClick={() => onSend(phrase)}
            className="text-[11px] text-[#DAD9D7] hover:text-white bg-[#302E2B] hover:bg-[#3C3A36] rounded px-2 py-1 whitespace-nowrap shrink-0 transition-colors"
          >
            {phrase}
          </button>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 p-2.5 border-t border-[#3C3A36] bg-[#262421]"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={400}
          placeholder={d.chatPlaceholder}
          className="flex-1 min-w-0 bg-[#302E2B] border border-[#3C3A36] rounded px-3 py-1.5 text-xs text-white placeholder:text-[#8B8987] focus:outline-none focus:border-[#81B64C]"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label={d.chatSendAria}
          className="px-3 py-1.5 rounded bg-[#3C3A36] hover:bg-[#81B64C] disabled:opacity-40 text-white text-xs font-semibold inline-flex items-center gap-1 shrink-0 transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
