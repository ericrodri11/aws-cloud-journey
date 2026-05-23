import React, { useRef, useState } from 'react';
import { Camera, CheckCircle2, TrendingDown, BrainCircuit, Mail, Save } from 'lucide-react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { API_URL } from '../constants';

interface SettingsModalProps {
  isOpen: boolean;
  onSave: () => void;
  isSaving: boolean;
  prefName: string;
  setPrefName: (val: string) => void;
  prefSavingsGoal: string;
  setPrefSavingsGoal: (val: string) => void;
  prefTone: string;
  setPrefTone: (val: string) => void;
  prefWantsEmail: boolean;
  setPrefWantsEmail: (val: boolean) => void;
  avatarUrl: string;
  setAvatarUrl: (url: string) => void;
}

const SettingsModal = ({
  isOpen, onSave, isSaving,
  prefName, setPrefName, prefSavingsGoal, setPrefSavingsGoal,
  prefTone, setPrefTone, prefWantsEmail, setPrefWantsEmail,
  avatarUrl, setAvatarUrl
}: SettingsModalProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("Image is too large. Please choose a file under 2MB.");
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      try {
        const { tokens } = await fetchAuthSession();
        const response = await fetch(`${API_URL}?action=upload_avatar`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokens?.idToken?.toString()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ image: base64String })
        });
        
        const res = await response.json();
        if (res.status === 'success') {
          setAvatarUrl(res.avatar_url);
          localStorage.setItem('finai_avatar', res.avatar_url);
        }
      } catch (error) {
        console.error("Error uploading avatar", error);
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-50/95 backdrop-blur-sm">
      <div className="bg-white border border-gray-200 rounded-3xl shadow-sm overflow-hidden max-w-3xl w-full mx-4">
        
        {/* Cabecera idéntica al Perfil */}
        <div className="p-8 flex items-center gap-6 border-b border-gray-100 bg-gray-50/50">
          <div className="relative group shrink-0">
            <div className="w-24 h-24 rounded-full border-4 border-white shadow-sm overflow-hidden bg-gray-100 relative">
              <img src={avatarUrl || "/default-avatar.png"} alt="Profile" className="w-full h-full object-cover" />
              {isUploading && (
                <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="absolute bottom-0 right-0 p-2 bg-gray-900 hover:bg-gray-800 text-white rounded-full shadow-lg border-2 border-white transition-transform hover:scale-105"
            >
              <Camera size={14} />
            </button>
            <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/jpeg, image/png" className="hidden" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">{prefName || 'Your Name'}</h3>
            <div className="flex items-center gap-2 text-xs font-bold text-green-700 bg-green-100 px-3 py-1.5 rounded-full inline-flex mt-2 border border-green-200">
              <CheckCircle2 size={14} /> Pro Agent Active
            </div>
          </div>
        </div>

        {/* Configuración idéntica al Perfil */}
        <div className="p-8 space-y-6">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Agent Configuration</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">Display Name</label>
              <input 
                type="text" 
                value={prefName} 
                onChange={(e) => setPrefName(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400 focus:bg-white transition"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5"><TrendingDown size={14} className="text-green-500"/> Daily Savings Goal (€)</label>
              <input 
                type="number" 
                min="0"
                value={prefSavingsGoal} 
                onChange={(e) => setPrefSavingsGoal(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400 focus:bg-white transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5"><BrainCircuit size={14} className="text-purple-500"/> AI Personality Tone</label>
              <select 
                value={prefTone} 
                onChange={(e) => setPrefTone(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400 focus:bg-white transition appearance-none cursor-pointer"
              >
                <option value="brutal">Brutal & Sarcastic (Recommended)</option>
                <option value="polite">Polite & Professional</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5"><Mail size={14} className="text-blue-500"/> Daily Reports</label>
              <div className="flex items-center h-[42px]">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={prefWantsEmail} onChange={(e) => setPrefWantsEmail(e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                  <span className="ml-3 text-sm font-medium text-gray-700">{prefWantsEmail ? 'Enabled' : 'Disabled'}</span>
                </label>
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button 
              onClick={onSave}
              disabled={isSaving || !prefName.trim()}
              className="flex items-center gap-2 px-6 py-2.5 bg-green-500 hover:bg-green-400 disabled:bg-green-300 text-white text-sm font-bold rounded-xl transition shadow-sm"
            >
              {isSaving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Saving...</> : <><Save size={16}/> Save Preferences</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;