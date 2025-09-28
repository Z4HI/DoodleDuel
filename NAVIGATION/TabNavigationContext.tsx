import React, { createContext, useContext, useState, ReactNode, useMemo } from 'react';

interface TabNavigationContextType {
  currentTab: number;
  setCurrentTab: (tab: number) => void;
}

const TabNavigationContext = createContext<TabNavigationContextType | undefined>(undefined);

export const useTabNavigation = () => {
  const context = useContext(TabNavigationContext);
  if (!context) {
    throw new Error('useTabNavigation must be used within a TabNavigationProvider');
  }
  return context;
};

interface TabNavigationProviderProps {
  children: ReactNode;
}

export const TabNavigationProvider: React.FC<TabNavigationProviderProps> = ({ children }) => {
  const [currentTab, setCurrentTab] = useState(0);

  const value = useMemo(() => ({
    currentTab,
    setCurrentTab,
  }), [currentTab]);

  return (
    <TabNavigationContext.Provider value={value}>
      {children}
    </TabNavigationContext.Provider>
  );
};
