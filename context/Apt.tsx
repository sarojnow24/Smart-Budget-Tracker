import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import { supabase } from '../services/supabaseClient';
import { cloudDrive } from '../services/cloudDrive';
import { storage } from '../services/storage';
import { 
  Transaction, Account, Category, AppSettings, TransactionType, 
  CategoryBudget, SyncState, Notification, Wallet, UserProfile
} from '../types';
import { 
  INITIAL_ACCOUNTS, INITIAL_CATEGORIES, DEFAULT_SETTINGS, STORAGE_KEYS, 
  TRANSLATIONS, MOCK_ONLINE_LANGUAGES, MOCK_ONLINE_CURRENCIES 
} from '../constants';

interface AppContextProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  budget: number;
  categoryBudgets: CategoryBudget[];
  settings: AppSettings;
  syncState: SyncState;
  wallets: Wallet[];
  notification: Notification | null;
  isActionSheetOpen: boolean;
  setIsActionSheetOpen: (v: boolean) => void;
  aiInsight: string | null;
  isAIAnalysing: boolean;
  
  addTransaction: (t: Omit<Transaction, 'id'>) => void;
  updateTransaction: (t: Transaction) => void;
  deleteTransaction: (id: string) => Promise<boolean>;
  importTransactions: (txs: Transaction[]) => void;
  
  addAccount: (a: Omit<Account, 'id'>) => void;
  updateAccountName: (id: string, name: string) => void;
  deleteAccount: (id: string) => Promise<void>;
  getAccountBalance: (id: string) => number;
  
  addCategory: (c: Omit<Category, 'id'>) => void;
  updateCategory: (c: Category) => void;
  deleteCategory: (id: string) => Promise<void>;
  
  updateBudget: (amount: number) => void;
  updateCategoryBudget: (catId: string, amount: number) => void;
  
  updateSettings: (s: Partial<AppSettings>) => void;
  resetPreferences: () => void;
  
  t: (key: string) => string;
  formatPrice: (amount: number) => string;
  availableLanguages: string[];
  installLanguage: (code: string, dict: Record<string, string>) => void;
  uninstallLanguage: (code: string) => void;
  availableCurrencies: string[];
  installCurrency: (code: string) => void;
  uninstallCurrency: (code: string) => void;
  
  login: (e: string, p: string) => Promise<void>;
  signup: (e: string, p: string, n: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (pass: string) => Promise<void>;
  updateUserProfilePhoto: (url: string) => void;
  backupUserData: () => Promise<void>;
  restoreBackup: (strategy: 'merge' | 'replace' | 'skip') => Promise<boolean>;
  
  createWallet: (name: string, currency: string) => Promise<void>;
  switchWallet: (id: string | null) => Promise<void>;
  refreshWallets: () => Promise<void>;
  deleteWallet: (id: string) => Promise<void>;
  
  refreshAIInsights: (force?: boolean, txsOverride?: Transaction[]) => Promise<void>;
  
  showNotification: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State Initialization
  const [transactions, setTransactions] = useState<Transaction[]>(() => storage.get(STORAGE_KEYS.TRANSACTIONS, []));
  const [accounts, setAccounts] = useState<Account[]>(() => storage.get(STORAGE_KEYS.ACCOUNTS, INITIAL_ACCOUNTS));
  const [categories, setCategories] = useState<Category[]>(() => storage.get(STORAGE_KEYS.CATEGORIES, INITIAL_CATEGORIES));
  const [settings, setSettings] = useState<AppSettings>(() => storage.get(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS));
  const [budget, setBudgetState] = useState<number>(() => storage.get(STORAGE_KEYS.BUDGET, 0));
  const [categoryBudgets, setCategoryBudgets] = useState<CategoryBudget[]>(() => storage.get(STORAGE_KEYS.CATEGORY_BUDGETS, []));
  const [wallets, setWallets] = useState<Wallet[]>(() => storage.get(STORAGE_KEYS.WALLETS_LIST, []));
  
  const [syncState, setSyncState] = useState<SyncState>({
    isLoggedIn: false,
    user: null,
    lastSync: storage.get(STORAGE_KEYS.LAST_SYNC, null),
    backupSize: null,
    pendingRestoreAvailable: false,
    isOnline: navigator.onLine,
    pendingActionsCount: 0,
    isRealtimeConnected: false,
    unsyncedChanges: false,
    activeWalletId: storage.get(STORAGE_KEYS.ACTIVE_WALLET_ID, null),
  });

  const [notification, setNotification] = useState<Notification | null>(null);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAIAnalysing, setIsAIAnalysing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  
  // Dynamic Language State
  const [availableLanguageCodes, setAvailableLanguageCodes] = useState<string[]>(() => Object.keys(TRANSLATIONS));

  // Initialize dynamic translations from storage on mount
  useEffect(() => {
      const stored = storage.get<Record<string, Record<string, string>>>(STORAGE_KEYS.CUSTOM_TRANSLATIONS, {});
      let hasNew = false;
      Object.entries(stored).forEach(([code, dict]) => {
          if (!TRANSLATIONS[code]) {
              TRANSLATIONS[code] = dict;
              hasNew = true;
          }
      });
      if (hasNew) {
          setAvailableLanguageCodes(Object.keys(TRANSLATIONS));
      }
  }, []);

  // Mark data as needing sync
  const markAsDirty = useCallback(() => {
    setIsDirty(true);
    setSyncState(prev => ({ ...prev, unsyncedChanges: true }));
    storage.set(STORAGE_KEYS.UNSYNCED_CHANGES, true);
  }, []);

  // Persist State Effects
  useEffect(() => { storage.set(STORAGE_KEYS.TRANSACTIONS, transactions); }, [transactions]);
  useEffect(() => { storage.set(STORAGE_KEYS.ACCOUNTS, accounts); }, [accounts]);
  useEffect(() => { storage.set(STORAGE_KEYS.CATEGORIES, categories); }, [categories]);
  useEffect(() => { storage.set(STORAGE_KEYS.SETTINGS, settings); }, [settings]);
  useEffect(() => { storage.set(STORAGE_KEYS.BUDGET, budget); }, [budget]);
  useEffect(() => { storage.set(STORAGE_KEYS.CATEGORY_BUDGETS, categoryBudgets); }, [categoryBudgets]);
  useEffect(() => { storage.set(STORAGE_KEYS.WALLETS_LIST, wallets); }, [wallets]);
  useEffect(() => { storage.set(STORAGE_KEYS.ACTIVE_WALLET_ID, syncState.activeWalletId); }, [syncState.activeWalletId]);
  useEffect(() => { storage.set(STORAGE_KEYS.LAST_SYNC, syncState.lastSync); }, [syncState.lastSync]);

  // Auth Listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        cloudDrive.ensureUserProfile(session.user).then(profile => {
          setSyncState(prev => ({ ...prev, isLoggedIn: true, user: profile }));
        });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const profile = await cloudDrive.ensureUserProfile(session.user);
        setSyncState(prev => ({ ...prev, isLoggedIn: true, user: profile }));
        if (event === 'PASSWORD_RECOVERY') {
           setSyncState(prev => ({ ...prev, isPasswordRecovery: true }));
        }
      } else {
        setSyncState(prev => ({ ...prev, isLoggedIn: false, user: null }));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Online Status Listener
  useEffect(() => {
    const handleOnline = () => setSyncState(prev => ({ ...prev, isOnline: true }));
    const handleOffline = () => setSyncState(prev => ({ ...prev, isOnline: false }));
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // AI Insights
  const refreshAIInsights = useCallback(async (force = false, txsOverride?: Transaction[]) => {
    if (!settings.showAIInsightsOnDashboard) return;
    // Only fetch if forced (manual click) or if no insight exists (app open)
    // This satisfies the requirement: "refresh only when open app after that need to click manually"
    if (!force && aiInsight) return; 
    
    setIsAIAnalysing(true);
    try {
       const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
       const txsToAnalyze = txsOverride || transactions;
       // Take last 30 transactions to analyze
       const recentTxs = [...txsToAnalyze].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 30);
       
       if (recentTxs.length === 0) {
           setAiInsight("Start adding transactions to get AI insights.");
           return;
       }

       const prompt = `
         Analyze these financial transactions (Currency: ${settings.currency}):
         ${JSON.stringify(recentTxs.map(t => ({ 
             date: t.date.split('T')[0], 
             amount: t.amount, 
             type: t.type, 
             category: categories.find(c => c.id === t.categoryId)?.name || 'Unknown' 
         })))}
         
         Provide 1 or 2 short, helpful, friendly insights or tips for the user based on their spending habits. 
         Focus on high spending areas or savings opportunities.
         Format as plain text, bullet points using "•". Keep it concise (max 40 words total).
       `;

       const response = await ai.models.generateContent({
         model: 'gemini-3-flash-preview',
         contents: prompt
       });
       
       setAiInsight(response.text || "No insights available.");
    } catch (error: any) {
       console.error("AI Error", error);
       // Handle Quota Error specifically
       if (error.status === 429 || error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('Quota')) {
           // Only show "Limit reached" if we were forcing an update or have no previous insight
           if (force || !aiInsight) {
              setAiInsight("Daily AI limit reached. Try again later.");
           }
       }
    } finally {
       setIsAIAnalysing(false);
    }
  }, [transactions, settings.showAIInsightsOnDashboard, settings.currency, aiInsight, categories]);

  // Actions
  const addTransaction = useCallback((tData: Omit<Transaction, 'id'>) => {
    const newTx: Transaction = { ...tData, id: crypto.randomUUID(), isPendingSync: true };
    setTransactions(prev => [newTx, ...prev]);
    markAsDirty();
    // Auto-refresh removed per user preference
  }, [markAsDirty]);

  const updateTransaction = useCallback((data: Transaction) => {
    setTransactions(prev => prev.map(t => t.id === data.id ? { ...data, isPendingSync: true } : t));
    markAsDirty();
  }, [markAsDirty]);

  const deleteTransaction = useCallback(async (id: string) => {
    const newTxs = transactions.filter(t => t.id !== id);
    setTransactions(newTxs);
    markAsDirty();
    return true;
  }, [transactions, markAsDirty]);

  const importTransactions = useCallback((txs: Transaction[]) => {
      setTransactions(prev => [...prev, ...txs]);
      markAsDirty();
      showNotification(`${txs.length} transactions imported!`);
  }, [markAsDirty]);

  const addAccount = useCallback((a: Omit<Account, 'id'>) => {
    setAccounts(prev => [...prev, { ...a, id: `acc_${Date.now()}` }]);
    markAsDirty();
  }, [markAsDirty]);

  const updateAccountName = useCallback((id: string, name: string) => {
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, name } : a));
    markAsDirty();
  }, [markAsDirty]);

  const deleteAccount = useCallback(async (id: string) => {
    setAccounts(prev => prev.filter(a => a.id !== id));
    // Orphan transactions or delete? Logic: Orphan them (set accountId to undefined) handled in types optionally
    // But for now we just delete account. Transaction references will be broken (orphaned).
    markAsDirty();
  }, [markAsDirty]);

  const getAccountBalance = useCallback((id: string) => {
    return transactions.reduce((acc, t) => {
      if (t.accountId === id) {
        if (t.type === 'income') return acc + t.amount;
        if (t.type === 'expense') return acc - t.amount;
      }
      if (t.fromAccountId === id) return acc - t.amount;
      if (t.toAccountId === id) return acc + t.amount;
      return acc;
    }, 0);
  }, [transactions]);

  const addCategory = useCallback((c: Omit<Category, 'id'>) => {
    setCategories(prev => [...prev, { ...c, id: `cat_${Date.now()}` }]);
    markAsDirty();
  }, [markAsDirty]);

  const updateCategory = useCallback((c: Category) => {
    setCategories(prev => prev.map(cat => cat.id === c.id ? c : cat));
    markAsDirty();
  }, [markAsDirty]);

  const deleteCategory = useCallback(async (id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id));
    markAsDirty();
  }, [markAsDirty]);

  const updateBudget = useCallback((amount: number) => {
    setBudgetState(amount);
    markAsDirty();
  }, [markAsDirty]);

  const updateCategoryBudget = useCallback((catId: string, amount: number) => {
    setCategoryBudgets(prev => {
      const existing = prev.find(b => b.categoryId === catId);
      if (existing) return prev.map(b => b.categoryId === catId ? { ...b, amount } : b);
      return [...prev, { categoryId: catId, amount }];
    });
    markAsDirty();
  }, [markAsDirty]);

  const updateSettings = useCallback((s: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...s }));
    markAsDirty();
  }, [markAsDirty]);

  const resetPreferences = useCallback(() => {
     // Factory Reset: Clear entire localStorage to ensure no residual data
     try {
        localStorage.clear();
        console.log("Local data cleared.");
     } catch (e) {
        console.error("Failed to clear data:", e);
     }
     
     // Sign out from Supabase if connected
     supabase.auth.signOut().finally(() => {
        // Force reload to re-initialize app with defaults
        window.location.reload();
     });
  }, []);

  // Internationalization
  const t = useCallback((key: string) => {
    const lang = settings.language;
    const dict = TRANSLATIONS[lang] || TRANSLATIONS['en'];
    // Fallback to English if key missing in target lang
    return dict[key] || TRANSLATIONS['en'][key] || key;
  }, [settings.language]);

  const formatPrice = useCallback((amount: number) => {
    return new Intl.NumberFormat(settings.language === 'en' ? 'en-US' : settings.language, {
      style: 'currency',
      currency: settings.currency,
    }).format(amount);
  }, [settings.language, settings.currency]);

  // Language/Currency Management
  const availableLanguages = availableLanguageCodes;
  const availableCurrencies = useMemo(() => settings.currencies, [settings.currencies]);
  
  const installLanguage = useCallback((code: string, dict: Record<string, string>) => {
     // Update runtime
     TRANSLATIONS[code] = dict; 
     // Update State
     setAvailableLanguageCodes(Object.keys(TRANSLATIONS));
     
     // Persist custom translation
     const stored = storage.get<Record<string, Record<string, string>>>(STORAGE_KEYS.CUSTOM_TRANSLATIONS, {});
     stored[code] = dict;
     storage.set(STORAGE_KEYS.CUSTOM_TRANSLATIONS, stored);

     // Select it
     updateSettings({ language: code }); 
  }, [updateSettings]);
  
  const uninstallLanguage = useCallback((code: string) => {
      if(code === 'en') return;
      
      // Update runtime
      delete TRANSLATIONS[code];
      // Update State
      setAvailableLanguageCodes(Object.keys(TRANSLATIONS));
      
      // Remove from persistence
      const stored = storage.get<Record<string, Record<string, string>>>(STORAGE_KEYS.CUSTOM_TRANSLATIONS, {});
      delete stored[code];
      storage.set(STORAGE_KEYS.CUSTOM_TRANSLATIONS, stored);

      if (settings.language === code) {
          updateSettings({ language: 'en' });
      }
  }, [settings.language, updateSettings]);

  const installCurrency = useCallback((code: string) => {
     if (!settings.currencies.includes(code)) {
         updateSettings({ currencies: [...settings.currencies, code] });
     }
  }, [settings.currencies, updateSettings]);
  
  const uninstallCurrency = useCallback((code: string) => {
     if(code === 'USD') return;
     updateSettings({ currencies: settings.currencies.filter(c => c !== code), currency: settings.currency === code ? 'USD' : settings.currency });
  }, [settings.currencies, settings.currency, updateSettings]);

  // Auth Functions
  const login = async (e: string, p: string) => { await cloudDrive.login(e, p); };
  const signup = async (e: string, p: string, n: string) => { await cloudDrive.signup(e, p, n); };
  const logout = async () => { await supabase.auth.signOut(); setSyncState(prev => ({ ...prev, isLoggedIn: false, user: null })); };
  const resetPassword = async (e: string) => { await cloudDrive.resetPassword(e); };
  const updatePassword = async (p: string) => { await cloudDrive.updatePassword(p); };
  
  const updateUserProfilePhoto = useCallback((url: string) => {
      setSyncState(prev => prev.user ? { ...prev, user: { ...prev.user, photoURL: url } } : prev);
  }, []);

  const backupUserData = useCallback(async () => {
    if (!syncState.user) return;
    const data = {
        transactions, accounts, categories, settings, budget, categoryBudgets
    };
    await cloudDrive.backupUserData(syncState.user.id, data);
    setSyncState(prev => ({ ...prev, lastSync: new Date().toISOString(), unsyncedChanges: false }));
    setIsDirty(false);
  }, [syncState.user, transactions, accounts, categories, settings, budget, categoryBudgets]);

  const restoreBackup = useCallback(async (strategy: 'merge' | 'replace' | 'skip') => {
      if (!syncState.user) return false;
      const backup = await cloudDrive.restoreBackup(syncState.user.id);
      if (!backup) return false;
      
      const remoteData = backup.data;
      if (strategy === 'replace') {
          if (remoteData.transactions) setTransactions(remoteData.transactions);
          if (remoteData.accounts) setAccounts(remoteData.accounts);
          if (remoteData.categories) setCategories(remoteData.categories);
          if (remoteData.settings) setSettings(remoteData.settings);
          if (remoteData.budget) setBudgetState(remoteData.budget);
          if (remoteData.categoryBudgets) setCategoryBudgets(remoteData.categoryBudgets);
      } else if (strategy === 'merge') {
          // Simple merge for transactions (id check)
          const localIds = new Set(transactions.map(t => t.id));
          const newTxs = remoteData.transactions.filter((t: Transaction) => !localIds.has(t.id));
          setTransactions(prev => [...prev, ...newTxs]);
      }
      return true;
  }, [syncState.user, transactions]);

  // Wallet Functions
  const createWallet = useCallback(async (name: string, currency: string) => {
      if (!syncState.user) return;
      const w = await cloudDrive.createWallet(syncState.user.id, name, currency);
      setWallets(prev => [...prev, w]);
  }, [syncState.user]);

  const refreshWallets = useCallback(async () => {
      if (!syncState.user) return;
      const list = await cloudDrive.getMyWallets(syncState.user.id);
      setWallets(list);
  }, [syncState.user]);

  const switchWallet = useCallback(async (id: string | null) => {
      setSyncState(prev => ({ ...prev, activeWalletId: id }));
      if (id) {
         // Load wallet data
         const wData = await cloudDrive.getWalletData(id);
         if (wData) {
             setTransactions(wData.transactions || []);
             setAccounts(wData.accounts || []);
             setCategories(wData.categories || []);
             setBudgetState(wData.budget || 0);
         }
      } else {
         // Switch back to local (load from storage again implicitly or keep current if we sync local too)
         // For simplicity, reload from storage for local
         setTransactions(storage.get(STORAGE_KEYS.TRANSACTIONS, []));
         setAccounts(storage.get(STORAGE_KEYS.ACCOUNTS, INITIAL_ACCOUNTS));
         setCategories(storage.get(STORAGE_KEYS.CATEGORIES, INITIAL_CATEGORIES));
      }
  }, []);

  const deleteWallet = useCallback(async (id: string) => {
      await cloudDrive.deleteWallet(id);
      setWallets(prev => prev.filter(w => w.id !== id));
      if (syncState.activeWalletId === id) switchWallet(null);
  }, [syncState.activeWalletId, switchWallet]);

  const showNotification = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
      setNotification({ id: Date.now(), message, type });
      setTimeout(() => setNotification(null), 3000);
  }, []);

  const contextValue: AppContextProps = {
    transactions, accounts, categories, budget, categoryBudgets, settings, syncState, wallets, notification,
    isActionSheetOpen, setIsActionSheetOpen, aiInsight, isAIAnalysing,
    addTransaction, updateTransaction, deleteTransaction, importTransactions,
    addAccount, updateAccountName, deleteAccount, getAccountBalance,
    addCategory, updateCategory, deleteCategory,
    updateBudget, updateCategoryBudget, updateSettings, resetPreferences,
    t, formatPrice, availableLanguages, installLanguage, uninstallLanguage, availableCurrencies, installCurrency, uninstallCurrency,
    login, signup, logout, resetPassword, updatePassword, updateUserProfilePhoto, backupUserData, restoreBackup,
    createWallet, switchWallet, refreshWallets, deleteWallet,
    refreshAIInsights, showNotification
  };

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
};
