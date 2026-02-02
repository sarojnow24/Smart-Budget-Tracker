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

  // Auth & Cloud Check Logic
  const checkCloudBackup = useCallback(async (userId: string) => {
      try {
          // Check for cloud backup timestamp
          const backup = await cloudDrive.restoreBackup(userId);
          if (backup && backup.metadata?.timestamp) {
              const localLastSync = storage.get(STORAGE_KEYS.LAST_SYNC, null);
              const cloudTime = new Date(backup.metadata.timestamp).getTime();
              const localTime = localLastSync ? new Date(localLastSync).getTime() : 0;
              
              // If cloud is newer than local (or local doesn't exist), prompt restore
              if (cloudTime > localTime) {
                  setSyncState(prev => ({ ...prev, pendingRestoreAvailable: true }));
              }
          }
      } catch (e) {
          console.warn("Failed to check backup on login", e);
      }
  }, []);

  // Auth Listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        cloudDrive.ensureUserProfile(session.user).then(profile => {
          setSyncState(prev => ({ ...prev, isLoggedIn: true, user: profile }));
          checkCloudBackup(session.user.id); // Check on initial load if session exists
        });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const profile = await cloudDrive.ensureUserProfile(session.user);
        setSyncState(prev => ({ ...prev, isLoggedIn: true, user: profile }));
        
        if (event === 'SIGNED_IN') {
             checkCloudBackup(session.user.id);
        }
        if (event === 'PASSWORD_RECOVERY') {
           setSyncState(prev => ({ ...prev, isPasswordRecovery: true }));
        }
      } else {
        setSyncState(prev => ({ ...prev, isLoggedIn: false, user: null }));
      }
    });

    return () => subscription.unsubscribe();
  }, [checkCloudBackup]);

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
    if (!force && aiInsight) return; 
    
    setIsAIAnalysing(true);
    try {
       const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
       const txsToAnalyze = txsOverride || transactions;
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
       if (error.status === 429 || error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('Quota')) {
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
    // Clean up transactions associated with this category to avoid "ghost" references
    setTransactions(prev => prev.map(t => {
        if (t.categoryId === id) {
            return { ...t, categoryId: undefined, subCategory: undefined, note: t.note ? `${t.note} (Uncategorized)` : '(Uncategorized)' };
        }
        return t;
    }));
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
     try {
        localStorage.clear();
        console.log("Local data cleared.");
     } catch (e) {
        console.error("Failed to clear data:", e);
     }
     
     supabase.auth.signOut().finally(() => {
        window.location.reload();
     });
  }, []);

  // Internationalization
  const t = useCallback((key: string) => {
    const lang = settings.language;
    const dict = TRANSLATIONS[lang] || TRANSLATIONS['en'];
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
     TRANSLATIONS[code] = dict; 
     setAvailableLanguageCodes(Object.keys(TRANSLATIONS));
     const stored = storage.get<Record<string, Record<string, string>>>(STORAGE_KEYS.CUSTOM_TRANSLATIONS, {});
     stored[code] = dict;
     storage.set(STORAGE_KEYS.CUSTOM_TRANSLATIONS, stored);
     updateSettings({ language: code }); 
  }, [updateSettings]);
  
  const uninstallLanguage = useCallback((code: string) => {
      if(code === 'en') return;
      delete TRANSLATIONS[code];
      setAvailableLanguageCodes(Object.keys(TRANSLATIONS));
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
    
    // Updated: Properly await the result to get timestamp
    const result = await cloudDrive.backupUserData(syncState.user.id, data);
    
    setSyncState(prev => ({ 
        ...prev, 
        lastSync: result.timestamp, 
        unsyncedChanges: false 
    }));
    setIsDirty(false);
  }, [syncState.user, transactions, accounts, categories, settings, budget, categoryBudgets]);

  const restoreBackup = useCallback(async (strategy: 'merge' | 'replace' | 'skip') => {
      if (strategy === 'skip') {
          setSyncState(prev => ({ ...prev, pendingRestoreAvailable: false }));
          return true;
      }
      
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
          const localIds = new Set(transactions.map(t => t.id));
          const newTxs = remoteData.transactions.filter((t: Transaction) => !localIds.has(t.id));
          setTransactions(prev => [...prev, ...newTxs]);
      }
      
      setSyncState(prev => ({ 
          ...prev, 
          lastSync: backup.metadata.timestamp, 
          pendingRestoreAvailable: false,
          unsyncedChanges: false
      }));
      return true;
  }, [syncState.user, transactions]);
  
  // Auto Backup Effect
  useEffect(() => {
    // Only run if we have a valid lastSync to compare against
    if (!syncState.isLoggedIn || !syncState.isOnline || settings.autoBackup === 'off' || !syncState.lastSync) return;

    const checkBackup = async () => {
      const last = new Date(syncState.lastSync!).getTime();
      const now = Date.now();
      const intervalHours = settings.autoBackup === 'daily' ? 24 : 168;
      const intervalMs = intervalHours * 60 * 60 * 1000;
      
      if (now - last > intervalMs) {
         console.log("Auto-backup executing...");
         try {
             await backupUserData();
         } catch (e) {
             console.error("Auto-backup failed", e);
         }
      }
    };
    
    // Check immediately and then every minute
    checkBackup();
    const timer = setInterval(checkBackup, 60000); 

    return () => clearInterval(timer);
  }, [syncState.isLoggedIn, syncState.isOnline, syncState.lastSync, settings.autoBackup, backupUserData]);

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
         const wData = await cloudDrive.getWalletData(id);
         if (wData) {
             setTransactions(wData.transactions || []);
             setAccounts(wData.accounts || []);
             setCategories(wData.categories || []);
             setBudgetState(wData.budget || 0);
         }
      } else {
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