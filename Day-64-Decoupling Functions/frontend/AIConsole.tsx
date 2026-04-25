import React from 'react';
import { RefreshCw, Send } from 'lucide-react';

interface AIConsoleProps {
  typedText: string;
  userQuery: string;
  setUserQuery: (v: string) => void;
  isQuerying: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

const AIConsole = ({ typedText, userQuery, setUserQuery, isQuerying, onSubmit }: AIConsoleProps) => (
  <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
    <div className="flex items-center space-x-2 mb-4 border-b border-gray-100 pb-4">
      <div className="w-2 h-2 rounded-full bg-green-400"></div>
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">AI Agent Console</span>
    </div>
    <div className="font-mono text-sm text-green-600 min-h-[36px] mb-4 bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
      {typedText}<span className="animate-pulse text-green-400">_</span>
    </div>
    <form onSubmit={onSubmit} className="flex gap-2">
      <div className="flex-1 relative">
        <input
          type="text"
          value={userQuery}
          onChange={(e) => setUserQuery(e.target.value)}
          placeholder="Ask your agent (e.g., 'How much did I spend on food?')"
          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-green-400 transition"
          disabled={isQuerying}
        />
      </div>
      <button
        type="submit"
        disabled={isQuerying}
        className="bg-green-500 hover:bg-green-400 text-white px-5 py-2.5 rounded-lg transition flex items-center justify-center min-w-[50px] font-semibold text-sm"
      >
        {isQuerying ? <RefreshCw className="animate-spin h-4 w-4"/> : <Send className="h-4 w-4"/>}
      </button>
    </form>
  </section>
);

export default AIConsole;
