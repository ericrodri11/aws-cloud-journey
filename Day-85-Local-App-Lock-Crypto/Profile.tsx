import React, { useState, useRef } from 'react';
import { Camera, AlertTriangle, Trash2, CheckCircle2, Save, Mail, TrendingDown, BrainCircuit, LogOut, X, Smartphone, LockKeyhole, TimerReset } from 'lucide-react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { API_URL } from '../constants';

interface ProfileProps {
  avatarUrl: string;
  setAvatarUrl: (url: string) => void;
  prefName: string;
  setPrefName: (name: string) => void;
  prefSavingsGoal: string;
  setPrefSavingsGoal: (goal: string) => void;
  prefTone: string;
  setPrefTone: (tone: string) => void;
  prefWantsEmail: boolean;
  setPrefWantsEmail: (wants: boolean) => void;
  prefWantsSms: boolean;
  setPrefWantsSms: (wants: boolean) => void;
  prefAlertPhone: string;
  setPrefAlertPhone: (phone: string) => void;
  onSave: () => Promise<void>;
  isSaving: boolean;
  onSignOut: () => void;
  appLockTimeoutMinutes: number;
  onSetAppLockTimeout: (minutes: number) => void;
  onChangeAppPin: () => void;
}

const Profile = ({ 
  avatarUrl, setAvatarUrl, 
  prefName, setPrefName, 
  prefSavingsGoal, setPrefSavingsGoal, 
  prefTone, setPrefTone, 
  prefWantsEmail, setPrefWantsEmail, 
  prefWantsSms, setPrefWantsSms,
  prefAlertPhone, setPrefAlertPhone,
  onSave, isSaving, onSignOut,
  appLockTimeoutMinutes, onSetAppLockTimeout, onChangeAppPin
}: ProfileProps) => {

  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Compresión en Frontend antes de enviar a AWS ──
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validación de tamaño (Máx 2MB para evitar bloqueos de API Gateway)
    if (file.size > 2 * 1024 * 1024) {
      alert("Image is too large. Please choose a file under 2MB.");
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        // Forzamos un ancho máximo de 400px (suficiente para un avatar)
        const MAX_WIDTH = 400;
        const scaleSize = MAX_WIDTH / img.width;
        
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;

        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Comprime a JPEG con 80% de calidad (reduce el peso un 90%)
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);

        // ⬇️ Enviamos la imagen comprimida a AWS
        try {
          const { tokens } = await fetchAuthSession();
          const response = await fetch(`${API_URL}?action=upload_avatar`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokens?.idToken?.toString()}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ image: compressedBase64 })
          });
          
          const res = await response.json();
          if (res.status === 'success') {
            setAvatarUrl(res.avatar_url); // Actualiza la foto en toda la app
          }
        } catch (error) {
          console.error("Error uploading avatar", error);
          alert("Failed to upload image. Check console for details.");
        } finally {
          setIsUploading(false);
        }
      };
    };
  };

  const hasCustomAvatar = avatarUrl && !avatarUrl.includes('default-avatar.png');

  const handleDeleteAvatar = async () => {
    setIsUploading(true);
    try {
      const { tokens } = await fetchAuthSession();
      const response = await fetch(`${API_URL}?action=delete_avatar`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${tokens?.idToken?.toString()}` }
      });
      const res = await response.json();
      if (res.status === 'success') {
        setAvatarUrl(res.avatar_url);
      }
    } catch (error) {
      console.error("Error deleting avatar", error);
    } finally {
      setIsUploading(false);
    }
  };

  // --- Botón Nuclear ---
  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const { tokens } = await fetchAuthSession();
      await fetch(`${API_URL}?action=delete_account`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${tokens?.idToken?.toString()}` }
      });
      localStorage.clear();
      onSignOut();
    } catch (error) {
      console.error("Error deleting account", error);
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-6">

      <div className="mb-8">
        <h2 className="text-2xl font-black text-gray-900 tracking-tight" style={{ letterSpacing: '-0.03em' }}>Account Settings</h2>
        <p className="text-sm text-gray-500">Manage your profile, agent behaviors, and security.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-3xl shadow-sm overflow-hidden mb-8">
        
        {/* Sección 1: Avatar y Nombre Rápido */}
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
            {/* Contenedor de Botones de Foto */}
            <div className="absolute -bottom-2 -right-2 flex gap-1">
              {hasCustomAvatar && (
                <button onClick={handleDeleteAvatar} disabled={isUploading} className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg border-2 border-white transition-transform hover:scale-105" title="Remove Photo">
                  <X size={14} />
                </button>
              )}
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="p-2 bg-gray-900 hover:bg-gray-800 text-white rounded-full shadow-lg border-2 border-white transition-transform hover:scale-105"
                title="Upload Photo"
              >
                <Camera size={14} />
              </button>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/jpeg, image/png" className="hidden" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">{prefName || 'Your Name'}</h3>
            <div className="flex items-center gap-2 text-xs font-bold text-green-700 bg-green-100 px-3 py-1.5 rounded-full inline-flex mt-2 border border-green-200">
              <CheckCircle2 size={14} /> Pro Agent Active
            </div>
          </div>
        </div>

        {/* Sección 2: Preferencias del Agente (Formulario) */}
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5"><Smartphone size={14} className="text-emerald-500"/> SMS Alert Phone</label>
              <input
                type="tel"
                value={prefAlertPhone}
                onChange={(e) => setPrefAlertPhone(e.target.value)}
                placeholder="+34600111222"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400 focus:bg-white transition"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5"><Smartphone size={14} className="text-emerald-500"/> Spending SMS Alerts</label>
              <div className="flex items-center h-[42px]">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={prefWantsSms} onChange={(e) => setPrefWantsSms(e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                  <span className="ml-3 text-sm font-medium text-gray-700">{prefWantsSms ? 'Enabled' : 'Disabled'}</span>
                </label>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex justify-end">
            <button 
              onClick={onSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2.5 bg-green-500 hover:bg-green-400 disabled:bg-green-300 text-white text-sm font-bold rounded-xl transition shadow-sm"
            >
              {isSaving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Saving...</> : <><Save size={16}/> Save Preferences</>}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-3xl shadow-sm overflow-hidden mb-8">
        <div className="p-8 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Security</h3>
          <p className="text-sm text-gray-500">Control local App Lock protection for this device.</p>
        </div>

        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
              <TimerReset size={14} className="text-green-500"/> Inactivity Lock
            </label>
            <select
              value={appLockTimeoutMinutes}
              onChange={(e) => onSetAppLockTimeout(Number(e.target.value))}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400 focus:bg-white transition appearance-none cursor-pointer"
            >
              <option value={1}>After 1 minute</option>
              <option value={5}>After 5 minutes</option>
              <option value={10}>After 10 minutes (Recommended)</option>
              <option value={15}>After 15 minutes</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
              <LockKeyhole size={14} className="text-gray-900"/> App Lock PIN
            </label>
            <button
              type="button"
              onClick={onChangeAppPin}
              className="w-full h-[42px] bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold rounded-xl transition shadow-sm"
            >
              Change PIN
            </button>
          </div>
        </div>
      </div>

{/* DANGER ZONE */}
      <div className="bg-white border border-red-100 rounded-3xl p-8 shadow-sm relative overflow-hidden mb-8">
        {/* Franja roja decorativa a la izquierda */}
        <div className="absolute top-0 left-0 w-1.5 h-full bg-red-500"></div>
        
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-2">
          <AlertTriangle size={20} className="text-red-500" /> Danger Zone
        </h3>
        <p className="text-sm text-gray-500 mb-6 max-w-2xl leading-relaxed">
          Once you delete your account, there is no going back. This will permanently wipe your profile, transaction history, and AI semantic memory from AWS DynamoDB and Cognito.
        </p>

        {showDeleteConfirm ? (
          <div className="bg-red-50/50 border border-red-100 rounded-2xl p-6 w-full max-w-md">
            <h4 className="text-sm font-bold text-red-900 mb-1">Permanent Deletion</h4>
            <p className="text-xs text-red-700 mb-4">
              Type <span className="font-mono font-bold bg-red-100 px-1.5 py-0.5 rounded text-red-900 tracking-tight">confirm</span> to proceed.
            </p>
            <input 
              type="text" 
              placeholder='Type "confirm"' 
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full bg-white border border-red-200 p-2.5 rounded-xl text-sm mb-4 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition placeholder-gray-300"
            />
            <div className="flex gap-3">
              <button 
                onClick={handleDeleteAccount}
                disabled={confirmText !== "confirm" || isDeleting}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-white text-sm font-bold rounded-xl transition shadow-sm ${
                  confirmText === "confirm" ? 'bg-red-600 hover:bg-red-700' : 'bg-red-300 cursor-not-allowed'
                }`}
              >
                {isDeleting ? 'Erasing...' : 'Delete Permanently'}
              </button>
              <button 
                onClick={() => { setShowDeleteConfirm(false); setConfirmText(""); }}
                disabled={isDeleting}
                className="px-5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-bold rounded-xl transition shadow-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button 
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 text-sm font-bold rounded-xl transition shadow-sm"
          >
            <Trash2 size={16} /> Delete Account
          </button>
        )}
      </div>

      {/* Botón de Sign Out centrado y sin la línea divisoria superior */}
      <div className="flex justify-center mt-2">
        <button onClick={onSignOut} className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold rounded-xl transition shadow-sm">
          <LogOut size={16}/> Sign Out
        </button>
      </div>

    </div>
  );
};

export default Profile;
