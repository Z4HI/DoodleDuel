// AuthContext.js
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { supabase } from '../SUPABASE/supabaseConfig';

interface AuthContextType {
  Authuser: any | null;
  AuthuserEmail: any | null;
  loading: boolean;
  setUserEmail: (email: string | null) => void;
}

const AuthContext = createContext<AuthContextType>({ 
  Authuser: null, 
  AuthuserEmail: null, 
  loading: true,
  setUserEmail: () => {}
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [Authuser, setUser] = useState<any | null>(null);
  const [AuthuserEmail, setUserEmail] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    checkUser();
    // Set up auth subscription
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        // Use requestAnimationFrame to defer state updates
        requestAnimationFrame(() => {
          setUser(session?.user ?? null);
          setUserEmail(session?.user?.email ?? null);
          setLoading(false);
        });
      }
    );

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession();
    // Use requestAnimationFrame to defer state updates
    requestAnimationFrame(() => {
      setUser(session?.user ?? null);
      setUserEmail(session?.user?.email ?? null);
      setLoading(false);
    });
  }

  return (
    <AuthContext.Provider value={{ Authuser, AuthuserEmail, loading, setUserEmail }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);