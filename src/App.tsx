import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, doc, setDoc, getDoc, 
  onSnapshot, query, addDoc, updateDoc, deleteDoc, 
  serverTimestamp, writeBatch, getDocs, where, limit 
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged 
} from 'firebase/auth';
import { 
  Users, ShoppingBag, LayoutDashboard, Plus, Search, Leaf, 
  Trash2, Calendar as CalendarIcon, Heart, 
  Filter, AlertTriangle, Clock, XCircle, 
  DollarSign, History, UserCircle, Receipt, TrendingUp, Cake, Edit3, 
  ChevronRight, Phone, Calendar as CalendarDays, ShoppingCart, 
  Settings, Image as ImageIcon, Briefcase, Upload, Check, Lock, 
  LogOut, ShieldCheck, Loader2, RotateCcw, Link as LinkIcon,
  Sun, Moon, Copy, BarChart3, Share2, Info, Laptop, Sparkles, Package, Mail, Shield, BrainCircuit, Wand2, ExternalLink
} from 'lucide-react';

// --- 1. CONFIGURACIÓN FIREBASE ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'holistic-app-jorge-pro';
const apiKey = ""; 

// --- 2. GEMINI API HELPER ---
const callGemini = async (prompt, systemInstruction = "Eres un asistente holístico experto del centro Kurama.") => {
  const model = "gemini-2.5-flash-preview-09-2025";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  const fetchWithRetry = async (retries = 0) => {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] }
        })
      });
      if (!response.ok) throw new Error("IA Busy");
      const result = await response.json();
      return result.candidates?.[0]?.content?.parts?.[0]?.text || "Sin respuesta.";
    } catch (error) {
      if (retries < 5) {
        await new Promise(res => setTimeout(res, Math.pow(2, retries) * 1000));
        return fetchWithRetry(retries + 1);
      }
      return "Error de conexión con la IA.";
    }
  };
  return fetchWithRetry();
};

// --- 3. COMPONENTES VISUALES ---
const GraficoFinanzas = ({ terapiaTotal, boticaTotal, isDarkMode }) => {
  const max = Math.max(terapiaTotal, boticaTotal, 1);
  return (
    <div className={`w-full h-32 flex items-end justify-around gap-10 p-4 rounded-2xl ${isDarkMode ? 'bg-black/40' : 'bg-slate-50'} border ${isDarkMode ? 'border-white/5' : 'border-slate-100'} shadow-inner`}>
      <div className="flex flex-col items-center gap-2">
        <div style={{ height: `${(terapiaTotal/max)*100}%`, minHeight: '4px' }} className="w-6 bg-emerald-500 rounded-t-lg transition-all duration-700 shadow-lg shadow-emerald-500/20"></div>
        <span className="text-[9px] font-bold text-emerald-500">${String(terapiaTotal)}</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <div style={{ height: `${(boticaTotal/max)*100}%`, minHeight: '4px' }} className="w-6 bg-amber-500 rounded-t-lg transition-all duration-700 shadow-lg shadow-amber-500/20"></div>
        <span className="text-[9px] font-bold text-amber-500">${String(boticaTotal)}</span>
      </div>
    </div>
  );
};

const TIPOS_TERAPIA = ["Reiki", "Radiestesia", "Flores de Bach", "Reflexología", "Masaje Bioenergético", "Consulta Holística"];
const CATEGORIAS = ['Todas', 'Emocional', 'Físico', 'Espiritual', 'Bienestar'];

// --- 4. COMPONENTE PRINCIPAL ---
const App = () => {
  // --- REFERENCIAS ---
  const fileInputRef = useRef(null);

  // --- ESTADOS ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ u: '', p: '' });
  const [appUsers, setAppUsers] = useState([]);
  const [isDataReady, setIsDataReady] = useState(false);
  const [authStatus, setAuthStatus] = useState('Iniciando...');
  const [user, setUser] = useState(null);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [sales, setSales] = useState([]);
  const [companyData, setCompanyData] = useState({ name: "Kurama", slogan: "Sincronía y Sanación", logoUrl: "", darkMode: true });
  
  const [showModal, setShowModal] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [notification, setNotification] = useState(null);
  const [formData, setFormData] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // IA
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("");

  const notify = (msg) => {
    setNotification(String(msg));
    setTimeout(() => setNotification(null), 3000);
  };

  // --- SINCRONIZACIÓN FIREBASE ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) { setAuthStatus('Error de Red'); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const path = (col) => collection(db, 'artifacts', appId, 'public', 'data', col);
    const configDoc = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'company');

    onSnapshot(path('clients'), (s) => setClients(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(path('appointments'), (s) => setAppointments(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(path('sales'), (s) => setSales(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(configDoc, (s) => s.exists() && setCompanyData(s.data()));

    onSnapshot(path('products'), async (s) => {
      const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
      if (data.length === 0) {
        const batch = writeBatch(db);
        [
          { name: "Felicidad y Ánimo", category: "Emocional", price: 300, stock: 10 },
          { name: "Antiestrés", category: "Bienestar", price: 300, stock: 10 }
        ].forEach(p => batch.set(doc(path('products')), { ...p, timestamp: serverTimestamp() }));
        await batch.commit();
      } else { setProducts(data); }
    });

    onSnapshot(path('users'), async (s) => {
      const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
      if (data.length === 0) {
        await setDoc(doc(path('users'), 'admin-master'), { username: 'admin', password: '1234', role: 'admin', name: 'Jorge Administrador', timestamp: serverTimestamp() });
      } else {
        setAppUsers(data);
        setIsDataReady(true);
        setAuthStatus('Conectado');
      }
    });
  }, [user]);

  // --- LÓGICA FINANCIERA ---
  const therapyIncome = useMemo(() => sales.filter(s => s.type === 'terapia').reduce((acc, s) => acc + Number(s.price || 0), 0), [sales]);
  const boticaIncome = useMemo(() => sales.filter(s => s.type === 'producto').reduce((acc, s) => acc + Number(s.price || 0), 0), [sales]);
  const totalIncome = therapyIncome + boticaIncome;

  // --- FUNCIONES IA ---
  const analyzeCenterAbundance = async () => {
    setAiLoading(true);
    try {
      const context = `Centro Kurama: Balance $${totalIncome}, Pacientes ${clients.length}. Dame 3 consejos.`;
      const res = await callGemini(context);
      setAiResponse(String(res));
      setShowModal('ai_response');
    } catch (e) { notify("IA Error"); } finally { setAiLoading(false); }
  };

  const suggestElixir = async () => {
    if (!formData.prompt) return;
    setAiLoading(true);
    try {
      const prompt = `Paciente: "${formData.prompt}". Sugiere elixir de: [${products.map(p => p.name).join(", ")}].`;
      const res = await callGemini(prompt);
      setAiResponse(String(res));
    } catch (e) { notify("Error Alquimia"); } finally { setAiLoading(false); }
  };

  // --- FUNCIONES DE ACCIÓN ---
  const handleLogin = (e) => {
    e.preventDefault();
    if (!isDataReady) return;
    const u = (loginForm.u || '').trim().toLowerCase();
    const p = (loginForm.p || '').trim();
    const found = appUsers.find(user => user.username.toLowerCase() === u && user.password.toString() === p);
    if (found) { setCurrentUser(found); setIsLoggedIn(true); notify(`Bienvenido, ${String(found.name)}`); } 
    else { notify("Datos incorrectos"); }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
    setLoginForm({ u: '', p: '' });
  };

  const toggleDarkMode = async () => {
    const newMode = !companyData.darkMode;
    setCompanyData(prev => ({ ...prev, darkMode: newMode }));
    if (user) {
      try { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'company'), { darkMode: newMode }, { merge: true }); } 
      catch (e) { console.error(e); }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!user || isSubmitting) return;
    setIsSubmitting(true);
    const colMap = { client:'clients', product:'products', appointment:'appointments', user:'users', sale:'sales', payment:'sales' };
    const colName = colMap[showModal];
    if (!colName) { setIsSubmitting(false); return; }

    const { id, ...dataToSave } = formData;

    try {
      if (showModal === 'sale') {
        const pRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', formData.productId);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists() && pSnap.data().stock >= (formData.quantity || 1)) {
          await updateDoc(pRef, { stock: pSnap.data().stock - (formData.quantity || 1) });
          await addDoc(collection(db, 'artifacts', appId, 'public', 'data', colName), { ...dataToSave, price: Number(formData.price || 0) * (formData.quantity || 1), quantity: (formData.quantity || 1), type: 'producto', timestamp: serverTimestamp() });
        } else { notify("Sin stock."); setIsSubmitting(false); return; }
      } else if (showModal === 'payment') {
        const saleRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'sales'), { 
          clientId: selectedItem.clientId, therapy: selectedItem.therapy, price: Number(formData.price || 0), type: 'terapia', date: todayStr, timestamp: serverTimestamp(), appointmentId: selectedItem.id 
        });
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'appointments', selectedItem.id), { 
          status: 'completada', isPaid: true, paidAmount: Number(formData.price || 0), associatedSaleId: saleRef.id 
        });
      } else {
        if (id) { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', colName, id), { ...dataToSave, updatedAt: serverTimestamp() }); } 
        else { await addDoc(collection(db, 'artifacts', appId, 'public', 'data', colName), { ...dataToSave, timestamp: serverTimestamp() }); }
      }
      notify("Sincronizado");
      setShowModal(null); setFormData({}); setSelectedItem(null);
    } catch (err) { notify("Error guardado"); }
    finally { setIsSubmitting(false); }
  };

  const handleUndoPayment = async (appItem) => {
    if (!window.confirm("¿Anular el cobro? Se restará de finanzas.")) return;
    try {
      if (appItem.associatedSaleId) {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sales', appItem.associatedSaleId));
      }
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'appointments', appItem.id), {
        status: 'pendiente', isPaid: false, paidAmount: 0, associatedSaleId: null
      });
      notify("Cobro anulado");
    } catch (err) { notify("Error"); }
  };

  const handleCopyLink = () => {
    const currentUrl = window.location.href;
    if (currentUrl.includes('blob:')) {
      notify("Usa el icono del cuadro primero."); return;
    }
    const el = document.createElement('textarea');
    el.value = currentUrl;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    notify("Link copiado");
  };

  const openAddModal = (type) => {
    let defaults = { name: '', phone: '', notes: '', quantity: 1, date: todayStr };
    if (type === 'product') defaults = { ...defaults, price: 300, stock: 10, category: 'Bienestar' };
    if (type === 'appointment') defaults = { ...defaults, cost: 1200 };
    setFormData(defaults);
    setShowModal(type);
  };

  const editItem = (type, item) => { setFormData(item); setShowModal(type); };
  const updateStock = (id, delta) => {
    const p = products.find(i => i.id === id);
    if(p) updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'products', id), { stock: Math.max(0, (p.stock||0)+delta) });
  };
  const deleteItem = async (col, id) => {
    if (!window.confirm("¿Eliminar?")) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', col, id));
    notify("Eliminado");
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file || file.size > 800000) { notify("Imagen no válida"); return; }
    const reader = new FileReader();
    reader.onloadend = () => setCompanyData(prev => ({ ...prev, logoUrl: reader.result }));
    reader.readAsDataURL(file);
  };

  const saveConfig = async (e) => {
    if (e) e.preventDefault();
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'company'), { ...companyData, updatedAt: serverTimestamp() });
      notify("Ajustes guardados");
    } catch (err) { notify("Fallo"); }
  };

  // --- VISTAS ---
  const todayStr = new Date().toISOString().split('T')[0];
  const appointmentsToday = useMemo(() => appointments.filter(a => a.date === todayStr).sort((a,b) => (a.time||'').localeCompare(b.time||'')), [appointments, todayStr]);
  const filteredProducts = useMemo(() => products.filter(p => (String(p.name)||"").toLowerCase().includes(searchQuery.toLowerCase()) && (selectedCategory === 'Todas' || p.category === selectedCategory) && (filterLowStock ? p.stock < 5 : true)), [products, searchQuery, selectedCategory, filterLowStock]);
  const filteredClients = useMemo(() => clients.filter(c => (String(c.name)||"").toLowerCase().includes(searchQuery.toLowerCase())), [clients, searchQuery]);
  const getClientName = (id) => clients.find(c => c.id === id)?.name || "Paciente";

  const isDarkMode = companyData.darkMode;
  const theme = {
    bg: isDarkMode ? 'bg-[#0a0f0d]' : 'bg-[#fcfdfc]',
    sidebar: isDarkMode ? 'bg-[#020605]' : 'bg-[#041a14]',
    card: isDarkMode ? 'bg-white/[0.05]' : 'bg-white',
    cardBorder: isDarkMode ? 'border-white/10' : 'border-slate-100',
    text: isDarkMode ? 'text-slate-50' : 'text-slate-800',
    input: isDarkMode ? 'bg-[#1a2b25] border-white/20 text-white placeholder-white/30' : 'bg-white border-slate-300 text-slate-900 shadow-sm'
  };

  if (!isLoggedIn) {
    return (
      <div className={`h-screen w-full flex items-center justify-center ${theme.sidebar} p-6 font-sans overflow-hidden transition-colors`}>
        <div className="bg-white/5 backdrop-blur-3xl p-10 rounded-[3rem] border border-white/10 shadow-2xl w-full max-w-sm z-10 animate-in zoom-in-95">
          <div className="text-center mb-8">
            <div className="bg-emerald-500 w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              {isDataReady ? <Lock className="text-white" size={24} /> : <Loader2 className="text-white animate-spin" size={24} />}
            </div>
            <h2 className="text-xl font-black text-white tracking-widest uppercase italic leading-none">Kurama Cloud</h2>
            <p className="text-emerald-300 text-[9px] font-bold uppercase mt-3">{String(authStatus)}</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input required className="w-full p-4 rounded-xl bg-white/10 border border-white/10 text-white placeholder-white/30 font-bold outline-none" placeholder="USUARIO" value={loginForm.u || ''} onChange={e => setLoginForm({...loginForm, u: e.target.value})} />
            <input required type="password" className="w-full p-4 rounded-xl bg-white/10 border border-white/10 text-white placeholder-white/30 font-bold outline-none" placeholder="CLAVE" value={loginForm.p || ''} onChange={e => setLoginForm({...loginForm, p: e.target.value})} />
            <button type="submit" disabled={!isDataReady} className={`w-full py-4 rounded-xl font-black uppercase text-[10px] shadow-xl transition-all mt-4 ${!isDataReady ? 'bg-slate-800 text-slate-600' : 'bg-emerald-500 text-white hover:scale-105'}`}>INGRESAR</button>
          </form>
          <div className="mt-8 flex justify-center border-t border-white/5 pt-6">
             <button onClick={toggleDarkMode} className="p-3 rounded-full bg-white/5 text-emerald-400 hover:bg-white/10 border border-white/5">{isDarkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${theme.bg} ${theme.text} font-sans flex flex-col md:flex-row relative transition-colors duration-700 overflow-hidden`}>
      <style>{`* { scrollbar-width: none !important; -ms-overflow-style: none !important; } *::-webkit-scrollbar { display: none !important; } select option { background-color: #1a2b25 !important; color: white !important; }`}</style>
      
      {notification && <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-emerald-950 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in border border-emerald-500/20"><Check size={16} strokeWidth={4} className="text-emerald-400" /><span className="font-black text-[10px] uppercase tracking-widest">{notification}</span></div>}
      
      <nav className={`w-full md:w-72 ${theme.sidebar} text-emerald-50 p-8 flex flex-col shadow-2xl z-30 shrink-0`}>
        <div className="flex items-center gap-4 mb-10">
          <div className="bg-white p-1 rounded-xl w-14 h-14 overflow-hidden flex items-center justify-center shadow-lg">{companyData.logoUrl ? <img src={companyData.logoUrl} className="w-full h-full object-contain" /> : <Leaf className="text-emerald-600 w-8 h-8" />}</div>
          <div className="min-w-0"><h1 className="text-lg font-black tracking-tighter truncate italic leading-none">{String(companyData.name || "Kurama")}</h1><p className="text-emerald-400 text-[8px] uppercase font-black truncate opacity-60 tracking-widest mt-1">{String(companyData.slogan || "Sanación")}</p></div>
        </div>
        <div className="space-y-1 flex-grow overflow-y-auto scrollbar-hide pr-1">
          {[
            { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard },
            { id: 'agenda', label: 'Agenda Reiki', icon: CalendarIcon },
            { id: 'clients', label: 'Pacientes', icon: Users },
            { id: 'store', label: 'Botica Sagrada', icon: ShoppingBag },
            { id: 'sales', label: 'Finanzas', icon: DollarSign },
            { id: 'socios', label: 'Equipo / Socios', icon: ShieldCheck, admin: true },
            { id: 'settings', label: 'Ajustes', icon: Settings, admin: true }
          ].map(item => (!item.admin || currentUser?.role === 'admin') && (
            <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center gap-4 px-5 py-3 rounded-xl transition-all duration-300 ${activeTab === item.id ? 'bg-emerald-600 text-white shadow-xl' : 'hover:bg-white/5 text-emerald-100/40'}`}><item.icon size={18} strokeWidth={2} /><span className="text-xs font-bold tracking-wide">{item.label}</span></button>
          ))}
        </div>
        <div className="mt-8 pt-6 border-t border-white/10 space-y-3 text-center">
          <button onClick={() => setShowModal('share_link')} className="w-full flex items-center justify-center gap-2 text-[10px] font-black uppercase text-emerald-400 hover:text-emerald-200 transition-all"><Share2 size={12}/> Compartir App</button>
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 text-rose-300/60 hover:text-rose-400 transition-all text-[10px] font-bold uppercase"><LogOut size={12} /> Salir</button>
        </div>
      </nav>

      <main className="flex-grow p-6 md:p-10 overflow-auto scrollbar-hide">
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
          <div><h2 className={`text-3xl font-black ${isDarkMode ? 'text-emerald-400' : 'text-emerald-950'} tracking-tighter uppercase italic leading-none`}>
              {activeTab === 'socios' ? 'Equipo' : activeTab === 'dashboard' ? 'Inicio' : activeTab === 'store' ? 'Botica' : activeTab === 'clients' ? 'Pacientes' : activeTab === 'sales' ? 'Balance' : activeTab.toUpperCase()}
          </h2><p className={`${theme.textMuted} text-[10px] font-black uppercase tracking-[0.2em] mt-2`}>Kurama Sincronizado ✨</p></div>
          <div className="flex gap-3 w-full lg:w-auto items-center">
            <button onClick={toggleDarkMode} className={`p-3 rounded-xl ${theme.card} border ${theme.cardBorder} shadow-sm hover:scale-105 transition-all`}>{isDarkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
            <div className="relative flex-grow lg:flex-none lg:w-64"><Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${theme.textMuted}`} size={14} /><input type="text" placeholder="Buscar..." className={`pl-10 pr-4 py-2.5 rounded-xl border ${theme.input} w-full text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500 transition-all`} value={searchQuery || ''} onChange={(e) => setSearchQuery(e.target.value)} /></div>
            <button onClick={() => { 
                const m = { store: 'product', clients: 'client', socios: 'user', sales: 'sale', dashboard: 'appointment', agenda: 'appointment' }; 
                openAddModal(m[activeTab] || 'appointment');
            }} className="bg-emerald-600 hover:bg-emerald-700 text-white p-3 rounded-xl shadow-xl hover:scale-110 active:scale-90 transition-all"><Plus size={24} strokeWidth={3} /></button>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in duration-500">
             <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
               {[
                 { label: 'Citas Hoy', val: String(appointmentsToday.length), icon: Clock, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                 { label: 'Abundancia', val: `$${totalIncome}`, icon: DollarSign, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                 { label: 'Pacientes', val: String(clients.length), icon: UserCircle, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
                 { label: 'Bajo Stock', val: String(products.filter(p => p.stock < 5).length), icon: AlertTriangle, color: 'text-rose-500', bg: 'bg-rose-500/10' }
               ].map((s, i) => (
                 <div key={i} className={`${theme.card} p-6 rounded-2xl shadow-sm border ${theme.cardBorder} flex items-center gap-4 shadow-inner`}>
                   <div className={`${s.bg} p-3 rounded-xl ${s.color}`}><s.icon size={24} /></div>
                   <div><p className={`${theme.textMuted} text-[9px] font-black uppercase mb-1`}>{String(s.label)}</p><p className={`text-xl font-black ${theme.text} leading-none`}>{String(s.val)}</p></div>
                 </div>
               ))}
             </div>
             <button onClick={analyzeCenterAbundance} disabled={aiLoading} className={`w-full p-8 rounded-3xl ${isDarkMode ? 'bg-emerald-950/20' : 'bg-emerald-50'} border-2 border-emerald-500/30 flex items-center gap-6 group hover:border-emerald-500 transition-all shadow-lg`}>
                <div className="p-4 bg-emerald-500 text-white rounded-2xl shadow-lg group-hover:scale-110 transition-transform">{aiLoading ? <Loader2 size={32} className="animate-spin" /> : <BrainCircuit size={32}/>}</div>
                <div className="text-left"><h3 className="text-lg font-black text-emerald-500 uppercase tracking-widest">Analista IA ✨</h3><p className={`${theme.textMuted} text-xs font-bold`}>Recibe guía espiritual para el crecimiento de tu centro</p></div>
             </button>
          </div>
        )}

        {activeTab === 'agenda' && (
          <div className={`${theme.card} rounded-3xl shadow-xl border ${theme.cardBorder} overflow-hidden animate-in fade-in`}>
             <table className="w-full text-left">
                <thead className={`${isDarkMode ? 'bg-black/30 text-emerald-400' : 'bg-emerald-50/50 text-emerald-800'} text-[10px] font-black uppercase tracking-[0.2em]`}>
                  <tr><th className="px-6 py-6 italic text-emerald-500">Sincronía</th><th className="px-6 py-6 italic text-emerald-500">Paciente</th><th className="px-6 py-6 text-center italic text-emerald-500">Estado</th><th className="px-6 py-6 text-center italic text-emerald-500">Acción</th></tr>
                </thead>
                <tbody className={`divide-y ${isDarkMode ? 'divide-white/5' : 'divide-slate-100'}`}>
                  {appointments.sort((a,b) => (b.date || '').localeCompare(a.date || '') || (b.time||'').localeCompare(a.time||'')).map(app => (
                    <tr key={app.id} className={`${isDarkMode ? 'hover:bg-white/[0.02]' : 'hover:bg-emerald-50/20'} transition-all group`}>
                      <td className="px-6 py-5 font-black text-xs">{String(app.date || '')}<p className="text-xl font-light text-emerald-500 leading-none mt-1">{String(app.time || '')}</p></td>
                      <td className="px-6 py-5 font-bold leading-none">{getClientName(app.clientId)}<p className="text-[10px] text-emerald-600 uppercase font-black tracking-widest mt-2 opacity-60 italic">{String(app.therapy || '')}</p></td>
                      <td className="px-6 py-5 text-center"><span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase shadow-sm ${app.isPaid ? 'bg-emerald-600 text-white' : 'bg-amber-400 text-white'}`}>{app.isPaid ? 'PAGADO' : 'PENDIENTE'}</span></td>
                      <td className="px-6 py-5 text-center">
                        <div className="flex justify-center gap-3">
                          {!app.isPaid ? <button onClick={() => { setSelectedItem(app); setFormData({ price: app.cost || 1200 }); setShowModal('payment'); }} className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg hover:bg-emerald-500 shadow-sm transition-all"><Receipt size={18}/></button> : <button onClick={() => handleUndoPayment(app)} className="p-2 bg-rose-500/10 text-rose-500 rounded-lg hover:bg-rose-500 shadow-sm transition-all"><RotateCcw size={18}/></button>}
                          <button onClick={() => editItem('appointment', app)} className={`p-2 ${isDarkMode ? 'bg-white/5 text-slate-300' : 'bg-slate-100 text-slate-400'} rounded-lg hover:bg-emerald-600 transition-all`}><Edit3 size={18}/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
             </table>
             {appointments.length === 0 && <p className="text-center py-20 opacity-20 text-xs font-black uppercase tracking-[0.5em]">Sin Sesiones</p>}
          </div>
        )}

        {activeTab === 'store' && (
          <div className="space-y-8 animate-in fade-in">
             <div className={`${theme.card} p-6 rounded-3xl border-2 border-emerald-500/20 bg-emerald-500/5`}>
               <div className="flex gap-4">
                 <input className={`flex-grow p-4 rounded-xl border text-sm outline-none ${theme.input}`} placeholder="Cómo se siente el paciente..." value={formData.prompt || ''} onChange={e => setFormData({...formData, prompt: e.target.value})} />
                 <button onClick={suggestElixir} disabled={aiLoading} className="bg-emerald-600 text-white px-6 py-4 rounded-xl font-black uppercase text-[10px] flex items-center gap-2 shadow-lg">{aiLoading ? <Loader2 className="animate-spin" size={16}/> : <Sparkles size={16}/>} SUGERIR</button>
               </div>
               {aiResponse && activeTab === 'store' && <div className="mt-4 p-5 rounded-2xl bg-black/40 border border-emerald-500/30 text-sm italic">{aiResponse}</div>}
             </div>
             <div className={`${theme.card} rounded-3xl border ${theme.cardBorder} overflow-hidden shadow-xl`}>
                <div className={`p-8 border-b ${theme.cardBorder} flex flex-col md:flex-row items-center justify-between gap-6 bg-black/10`}><h3 className="text-lg font-black tracking-tighter uppercase italic">Botica Sagrada</h3><div className="flex gap-2 items-center overflow-x-auto scrollbar-hide pb-2 w-full md:w-auto"><button onClick={() => setFilterLowStock(!filterLowStock)} className={`px-4 py-3 rounded-xl text-[9px] font-black uppercase shadow-md ${filterLowStock ? 'bg-rose-600 text-white' : 'bg-white text-rose-600 border border-rose-100'}`}>Stock Bajo</button><div className="w-px h-6 bg-white/10 mx-2"></div>{CATEGORIAS.map(cat => <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase whitespace-nowrap ${selectedCategory === cat ? 'bg-emerald-600 text-white' : (isDarkMode ? 'bg-white/[0.05] text-slate-400' : 'bg-white text-slate-400')}`}>{String(cat)}</button>)}</div></div>
                <div className="divide-y divide-white/5">{filteredProducts.map(p => (<div key={p.id} className="p-8 flex items-center justify-between group hover:bg-white/[0.02] transition-all gap-6"><div className="min-w-0"><p className={`text-xl font-black ${theme.text} tracking-tight mb-3`}>{String(p.name)}</p><div className="flex items-center gap-3"><span className={`text-[9px] px-3 py-1 rounded-lg font-black uppercase ${isDarkMode ? 'bg-white/10 text-slate-300' : 'bg-slate-100 text-slate-400'} border border-white/5`}>{String(p.category)}</span><span className={`text-[10px] font-black uppercase flex items-center gap-2 ${p.stock < 5 ? 'text-rose-500 animate-pulse' : 'text-emerald-500'}`}>{p.stock < 5 ? <AlertTriangle size={12}/> : <Package size={12}/>} {String(p.stock)} Disp.</span></div></div><div className="flex items-center gap-4"><div className={`flex items-center gap-2 ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'} rounded-2xl p-2 shrink-0 shadow-inner`}><button onClick={() => updateStock(p.id, -1)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 font-black text-xl shadow-xl text-emerald-500">-</button><button onClick={() => updateStock(p.id, 1)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 font-black text-xl shadow-xl text-emerald-500">+</button></div><button onClick={() => editItem('sale', { productId: p.id, price: p.price || 300, date: todayStr, quantity: 1 })} className="p-5 bg-gradient-to-br from-amber-500 to-amber-700 text-white rounded-2xl shadow-2xl hover:scale-105 transition-transform"><ShoppingCart size={20} strokeWidth={3}/></button><button onClick={() => editItem('product', p)} className={`p-3 ${theme.textMuted} hover:text-emerald-500 transition-all`}><Edit3 size={20}/></button></div></div>))}</div>
             </div>
          </div>
        )}

        {activeTab === 'clients' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
            {filteredClients.map(c => (
              <div key={c.id} className={`${theme.card} p-8 rounded-3xl border ${theme.cardBorder} flex flex-col group hover:shadow-xl shadow-inner`}>
                <div className="flex items-center gap-4 mb-6"><div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl shadow-inner"><UserCircle size={40}/></div><div className="min-w-0"><h3 className={`text-xl font-black ${theme.text} truncate`}>{String(c.name)}</h3><p className="text-xs text-emerald-500 font-bold">{String(c.phone || '')}</p></div></div>
                <div className={`p-5 rounded-2xl ${isDarkMode ? 'bg-black/20' : 'bg-slate-50'} flex-grow mb-6 shadow-inner border border-white/5`}><p className={`${theme.textMuted} text-xs italic line-clamp-4 leading-relaxed`}>"{String(c.notes || 'Sin notas registradas...')}"</p></div>
                <div className="flex gap-2"><button onClick={() => editItem('client', c)} className="flex-grow py-3 rounded-xl bg-emerald-500/10 text-emerald-500 font-black text-[10px] uppercase border border-emerald-500/20 shadow-sm transition-all hover:bg-emerald-500 hover:text-white">Ficha</button><button onClick={() => deleteItem('clients', c.id)} className="p-3 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all"><Trash2 size={16}/></button></div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-3xl mx-auto animate-in zoom-in-95 duration-700">
             <div className={`${theme.card} p-10 rounded-3xl border ${theme.cardBorder} text-center shadow-2xl`}>
                <h3 className={`text-xl font-black mb-8 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-950'} uppercase tracking-tight italic`}>Ajustes Kurama</h3>
                <div className="w-32 h-32 mx-auto bg-slate-50 dark:bg-slate-800 rounded-3xl flex items-center justify-center mb-8 overflow-hidden border-2 border-slate-100 dark:border-slate-700 relative group shadow-inner">
                  {companyData.logoUrl ? <img src={companyData.logoUrl} className="w-full h-full object-contain p-4"/> : <ImageIcon className="text-slate-300" size={40}/>}
                  <input type="file" ref={fileInputRef} onChange={handleLogoUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>
                <div className="space-y-6 max-sm mx-auto">
                  <input className={`w-full text-center text-xl font-black bg-transparent border-b-2 ${theme.cardBorder} outline-none pb-2 focus:border-emerald-500 transition-colors ${theme.text}`} value={companyData.name || ''} onChange={e => setCompanyData({...companyData, name: e.target.value})} placeholder="Nombre Empresa" />
                  <input className={`w-full text-center text-sm font-bold bg-transparent border-b-2 ${theme.cardBorder} outline-none pb-2 focus:border-emerald-500 transition-colors ${theme.textMuted}`} value={companyData.slogan || ''} onChange={e => setCompanyData({...companyData, slogan: e.target.value})} placeholder="Eslogan" />
                  <button onClick={saveConfig} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl mt-6 hover:scale-105 active:scale-95 transition-all">Guardar Identidad</button>
                  <div className="pt-8 border-t border-white/10 mt-8">
                     <button onClick={() => setShowModal('share_link')} className="w-full py-5 bg-emerald-500 text-white rounded-2xl font-black uppercase text-[10px] flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/20 hover:brightness-110 transition-all">
                       <ExternalLink size={18}/> COMPARTIR APP CON MI SOCIO
                     </button>
                  </div>
                </div>
             </div>
          </div>
        )}
      </main>

      {/* --- 6. MODALES --- */}
      {showModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300">
          <div className={`${isDarkMode ? 'bg-[#0a1a17]' : 'bg-white'} w-full max-w-sm p-8 rounded-[3rem] shadow-2xl relative border ${isDarkMode ? 'border-white/10' : 'border-slate-200'} max-h-[90vh] overflow-y-auto scrollbar-hide`}>
            <button onClick={() => setShowModal(null)} className="absolute top-6 right-6 text-slate-400 hover:text-rose-500 transition-all"><XCircle size={20}/></button>
            <h2 className={`text-lg font-black mb-6 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-950'} uppercase tracking-widest border-l-4 border-emerald-500 pl-4 leading-none italic`}>
               {showModal === 'share_link' ? 'ENLACE DE SOCIO' : showModal === 'ai_response' ? 'SABIDURÍA IA ✨' : showModal === 'client' ? 'FICHA DEL ALMA' : showModal === 'sale' ? 'NUEVA VENTA' : showModal === 'payment' ? 'COBRO FINAL' : showModal === 'user' ? 'ACCESO SOCIO' : showModal === 'product' ? 'NUEVA ESENCIA' : 'GESTIÓN'}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
               {showModal === 'share_link' && (
                 <div className="space-y-6">
                    <div className={`p-6 rounded-2xl ${isDarkMode ? 'bg-emerald-950/40' : 'bg-emerald-50'} border border-emerald-500/20 text-xs font-bold leading-relaxed`}>
                       {window.location.href.includes('blob:') ? (
                         <div className="text-rose-400 bg-rose-500/10 p-4 rounded-xl text-center">
                           <AlertTriangle className="mx-auto mb-2" size={24}/>
                           <p>Este link NO sirve porque es temporal.</p>
                           <p className="mt-2 font-black">USA EL ICONO DEL CUADRITO ARRIBA (al lado de Código) para abrir Kurama en una pestaña real y copiar el link de ahí.</p>
                         </div>
                       ) : (
                         <div className="space-y-4">
                           <p className="text-center text-emerald-500">¡Link Real detectado! Cópialo:</p>
                           <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-black/50' : 'bg-white'} border break-all text-[10px] font-mono select-all`}>
                             {window.location.href}
                           </div>
                           <button type="button" onClick={handleCopyLink} className="w-full py-4 bg-emerald-600 text-white rounded-xl font-black uppercase text-[10px] flex items-center justify-center gap-2 shadow-lg hover:scale-105 transition-all">
                             <Copy size={16}/> COPIAR LINK PARA MI SOCIO
                           </button>
                         </div>
                       )}
                    </div>
                    <button type="button" onClick={() => setShowModal(null)} className="w-full py-4 bg-slate-800 text-white rounded-xl font-black uppercase text-[10px]">Cerrar</button>
                 </div>
               )}
               {showModal === 'ai_response' && (
                 <div className="space-y-6">
                    <div className={`p-5 rounded-2xl ${isDarkMode ? 'bg-white/5 text-slate-100' : 'bg-slate-50 text-slate-800'} border border-emerald-500/20 text-sm font-medium leading-relaxed italic`}>
                       {String(aiResponse)}
                    </div>
                    <button type="button" onClick={() => setShowModal(null)} className="w-full py-4 bg-emerald-600 text-white rounded-xl font-black uppercase text-[10px] shadow-lg">Cerrar</button>
                 </div>
               )}
               {showModal === 'client' && (
                 <>
                    <input required className={`w-full p-3 rounded-xl border font-black text-sm ${theme.input}`} placeholder="Nombre Completo" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                    <input className={`w-full p-3 rounded-xl border font-bold text-xs ${theme.input}`} placeholder="WhatsApp" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} />
                    <textarea className={`w-full p-3 rounded-xl border font-medium text-xs h-24 ${theme.input}`} placeholder="Notas espirituales..." value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} />
                 </>
               )}
               {showModal === 'appointment' && (
                 <>
                    <select required className={`w-full p-3 rounded-xl border font-black text-sm ${theme.input}`} value={formData.clientId || ''} onChange={e => setFormData({...formData, clientId: e.target.value})}><option value="">¿Quién viene?</option>{clients.map(c => <option key={c.id} value={c.id}>{String(c.name)}</option>)}</select>
                    <select required className={`w-full p-3 rounded-xl border font-black text-sm ${theme.input}`} value={formData.therapy || ''} onChange={e => setFormData({...formData, therapy: e.target.value})}><option value="">Elegir Terapia...</option>{TIPOS_TERAPIA.map(t => <option key={t} value={t}>{t}</option>)}</select>
                    <div className="grid grid-cols-2 gap-4">
                       <input type="date" required className={`w-full p-3 rounded-xl border font-bold text-xs ${theme.input}`} value={formData.date || ''} onChange={e => setFormData({...formData, date: e.target.value})} />
                       <input type="time" required className={`w-full p-3 rounded-xl border font-bold text-xs ${theme.input}`} value={formData.time || ''} onChange={e => setFormData({...formData, time: e.target.value})} />
                    </div>
                    <input type="number" placeholder="Inversión ($)" className={`w-full p-4 rounded-xl border font-black text-xl text-emerald-500 text-center ${theme.input}`} value={formData.cost || ''} onChange={e => setFormData({...formData, cost: Number(e.target.value)})} />
                 </>
               )}
               {showModal === 'sale' && (
                 <>
                    <select className={`w-full p-3 rounded-xl border font-black text-sm ${theme.input}`} value={formData.clientId || ''} onChange={e => setFormData({...formData, clientId: e.target.value})} required><option value="">¿Quién compra?</option>{clients.map(c => <option key={c.id} value={c.id}>{String(c.name)}</option>)}</select>
                    <div className="grid grid-cols-2 gap-4">
                      <select className={`w-full p-3 rounded-xl border font-black text-sm ${theme.input}`} value={formData.productId || ''} onChange={e => setFormData({...formData, productId: e.target.value})} required><option value="">¿Cuál?</option>{products.filter(p => p.stock > 0 || p.id === formData.productId).map(p => <option key={p.id} value={p.id}>{String(p.name)}</option>)}</select>
                      <input type="number" min="1" className={`w-full p-3 rounded-xl border font-black text-sm ${theme.input}`} value={formData.quantity || 1} onChange={e => setFormData({...formData, quantity: Number(e.target.value)})} required /></div>
                    <div className="relative group"><span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-emerald-500 text-xl">$</span><input type="number" placeholder="Precio" className={`w-full pl-10 p-4 rounded-xl border font-black text-2xl text-emerald-600 text-center ${theme.input}`} value={formData.price || ''} onChange={e => setFormData({...formData, price: Number(e.target.value)})} required /></div>
                 </>
               )}
               {showModal === 'product' && (
                 <>
                    <input required className={`w-full p-4 rounded-xl border font-black text-sm ${theme.input}`} placeholder="Nombre Esencia" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                    <div className="grid grid-cols-2 gap-4">
                      <select className={`w-full p-3 rounded-xl border font-bold text-xs ${theme.input}`} value={formData.category || 'Bienestar'} onChange={e => setFormData({...formData, category: e.target.value})}>{CATEGORIAS.slice(1).map(c => <option key={c} value={c}>{c}</option>)}</select>
                      <input type="number" className={`w-full p-3 rounded-xl border font-bold text-xs ${theme.input}`} placeholder="Stock" value={formData.stock || 10} onChange={e => setFormData({...formData, stock: Number(e.target.value)})} />
                    </div>
                    <input type="number" className={`w-full p-4 rounded-xl border font-black text-lg ${theme.input}`} placeholder="Precio de Venta ($)" value={formData.price || 300} onChange={e => setFormData({...formData, price: Number(e.target.value)})} />
                 </>
               )}
               {showModal === 'user' && (
                 <>
                    <input required className={`w-full p-4 rounded-xl border font-black text-lg ${theme.input}`} placeholder="Nombre Real" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                    <div className="grid grid-cols-2 gap-4">
                      <input required className={`w-full p-3 rounded-xl border font-bold text-xs ${theme.input}`} placeholder="Login ID" value={formData.username || ''} onChange={e => setFormData({...formData, username: e.target.value})} />
                      <input required type="password" placeholder="Clave" className={`w-full p-3 rounded-xl border font-bold text-xs ${theme.input}`} value={formData.password || ''} onChange={e => setFormData({...formData, password: e.target.value})} />
                    </div>
                    <select className={`w-full p-3 rounded-xl border font-black text-xs ${theme.input}`} value={formData.role || 'colab'} onChange={e => setFormData({...formData, role: e.target.value})}><option value="colab">Colaborador</option><option value="admin">Administrador</option></select>
                 </>
               )}
               {showModal === 'payment' && (
                 <div className="text-center space-y-6 py-4 animate-in zoom-in-95">
                    <div className={`${isDarkMode ? 'bg-white/5' : 'bg-emerald-50'} p-6 rounded-3xl border ${theme.cardBorder} shadow-inner`}>
                       <p className="text-[9px] font-black uppercase text-emerald-500 mb-2 tracking-[0.4em]">REGISTRAR COBRO FINAL</p>
                       <p className={`text-2xl font-black ${theme.text} tracking-tighter`}>{getClientName(selectedItem?.clientId)}</p>
                    </div>
                    <div className="relative"><span className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-emerald-500 text-2xl opacity-30">$</span><input type="number" required className={`w-full p-6 rounded-xl font-black text-4xl text-emerald-500 outline-none text-center shadow-inner border-2 border-emerald-500/20 focus:border-emerald-500 transition-all ${theme.input}`} value={formData.price || ''} onChange={e => setFormData({...formData, price: e.target.value})} /></div>
                 </div>
               )}
               {!['ai_response', 'share_link'].includes(showModal) && (
                 <div className="flex gap-3 pt-6">
                   <button type="button" onClick={() => setShowModal(null)} className={`flex-grow py-4 rounded-xl ${isDarkMode ? 'bg-white/5 text-slate-500' : 'bg-slate-100 text-slate-500'} font-black text-[9px] uppercase hover:bg-rose-500/10 transition-all`}>CANCELAR</button>
                   <button type="submit" disabled={isSubmitting} className="flex-grow py-4 rounded-xl bg-emerald-600 text-white font-black shadow-xl hover:scale-105 transition-all uppercase text-[9px] flex items-center justify-center gap-2">
                     {isSubmitting ? <Loader2 className="animate-spin" size={14}/> : 'CONFIRMAR'}
                   </button>
                 </div>
               )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
