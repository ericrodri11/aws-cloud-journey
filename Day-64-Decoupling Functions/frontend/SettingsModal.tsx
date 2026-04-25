import React from 'react';
import { X } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  isSaving: boolean;
  prefName: string;
  setPrefName: (v: string) => void;
  prefSavingsGoal: string;
  setPrefSavingsGoal: (v: string) => void;
  prefTone: string;
  setPrefTone: (v: string) => void;
  prefWantsEmail: boolean;
  setPrefWantsEmail: (v: boolean) => void;
}

const SettingsModal = ({
  isOpen, onClose, onSave, isSaving,
  prefName, setPrefName,
  prefSavingsGoal, setPrefSavingsGoal,
  prefTone, setPrefTone,
  prefWantsEmail, setPrefWantsEmail,
}: SettingsModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-gray-900">Preferences</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X size={20} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Display Name</label>
            <input
              type="text"
              value={prefName}
              onChange={(e) => setPrefName(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-green-400 transition"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Daily Savings Goal (€)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={prefSavingsGoal}
              onChange={(e) => setPrefSavingsGoal(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-green-400 transition"
            />
            <p className="text-xs text-gray-400 mt-1">To keep your streak alive, save this amount daily.</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">AI Tone</label>
            <select
              value={prefTone}
              onChange={(e) => setPrefTone(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-green-400 transition"
            >
              <option value="brutal">Brutal</option>
              <option value="supportive">Supportive</option>
              <option value="professional">Professional</option>
              <option value="polite">Polite</option>
            </select>
          </div>

          <div className="flex items-center mt-4 border-t border-gray-100 pt-4">
            <input
              type="checkbox"
              id="wantsEmail"
              checked={prefWantsEmail}
              onChange={(e) => setPrefWantsEmail(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-green-500 focus:ring-green-400 cursor-pointer"
            />
            <label htmlFor="wantsEmail" className="ml-3 block text-sm text-gray-700 cursor-pointer">
              Receive Daily "Tough Love" Email
            </label>
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold py-2.5 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className="flex-1 bg-green-500 hover:bg-green-400 text-white text-sm font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
