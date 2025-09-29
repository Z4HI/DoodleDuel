// AuthContext.js
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { updateExpoPushToken } from '../NOTIFICATIONS/updateExpoPushToken';
import { usePushNotifications } from '../NOTIFICATIONS/usePushNotifications';
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
  
  // Hook that requests permissions and gets push token (only after login)
  const { expoPushToken } = usePushNotifications(!!Authuser);
  
  useEffect(() => {
    console.log('🔍 AuthContext: Setting up auth listener...');
    checkUser();
    // Set up auth subscription
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        console.log('🔍 AuthContext: Auth state change:', event);
        console.log('🔍 AuthContext: Session user ID:', session?.user?.id);
        console.log('🔍 AuthContext: Session user email:', session?.user?.email);
        console.log('🔍 AuthContext: User metadata:', session?.user?.user_metadata);
        
        // Handle new user creation - let Supabase trigger handle this
        if (event === 'SIGNED_IN' && session?.user) {
          console.log('✅ AuthContext: SIGNED_IN event detected');
          console.log('🔍 AuthContext: User details:', {
            id: session.user.id,
            email: session.user.email,
            created_at: session.user.created_at,
            is_anonymous: session.user.is_anonymous
          });
          
          // Check if profile exists (Supabase trigger should have created it)
          try {
            console.log('🔍 AuthContext: Checking if profile exists...');
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('id')
              .eq('id', session.user.id)
              .single();
            
            if (profileError && profileError.code === 'PGRST116') {
              console.log('⚠️ AuthContext: Profile not found, creating manually...');
              console.log('⚠️ AuthContext: This suggests the Supabase trigger is not working');
              await createUserProfile(session.user);
            } else if (profileError) {
              console.error('❌ AuthContext: Error checking profile:', profileError);
              console.log('🔧 AuthContext: Attempting to create profile anyway...');
              await createUserProfile(session.user);
            } else {
              console.log('✅ AuthContext: Profile exists');
            }
          } catch (error) {
            console.error('❌ AuthContext: Error in profile check:', error);
          }
        }
        
        // Use requestAnimationFrame to defer state updates
        requestAnimationFrame(() => {
          console.log('🔍 AuthContext: Updating user state...');
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

  // Auto-save push token to database when user is authenticated and token is available
  useEffect(() => {
    console.log('🔍 AuthContext token update effect triggered:', { 
      hasToken: !!expoPushToken, 
      hasUser: !!Authuser?.id,
      token: expoPushToken,
      userId: Authuser?.id 
    });
    
    if (expoPushToken && Authuser?.id) {
      console.log('🚀 AuthContext calling updateExpoPushToken...');
      updateExpoPushToken(expoPushToken, Authuser.id);
    }
  }, [expoPushToken, Authuser?.id]);

  async function createUserProfile(user: any) {
    console.log('🎯 createUserProfile: Starting for user:', user.id);
    console.log('🎯 createUserProfile: User email:', user.email);
    console.log('🎯 createUserProfile: User object:', user);
    
    try {
      console.log('🔍 createUserProfile: Step 1 - Checking if profile exists...');
      // Check if profile already exists
      const { data: existingProfile, error: checkError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single();

      console.log('🔍 createUserProfile: Check result:', { existingProfile, checkError });

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('❌ createUserProfile: Error checking existing profile:', checkError);
        console.error('❌ createUserProfile: Check error details:', {
          message: checkError.message,
          details: checkError.details,
          hint: checkError.hint,
          code: checkError.code
        });
        return;
      }

      if (existingProfile) {
        console.log('✅ createUserProfile: Profile already exists for user:', user.id);
        return;
      }

      console.log('🚀 createUserProfile: Step 2 - Creating new profile...');
      // Create minimal profile with all required fields
      const profileData = {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || null,
        avatar_url: user.user_metadata?.avatar_url || null,
        isNewUser: true,
        darkMode: false,
        expoPushToken: null
      };
      
      console.log('📝 createUserProfile: Profile data to insert:', profileData);
      
      const { data: insertData, error } = await supabase
        .from('profiles')
        .insert(profileData);
      
      console.log('📊 createUserProfile: Insert result:', { insertData, error });
      
      if (error) {
        console.error('❌ createUserProfile: DATABASE ERROR creating profile:');
        console.error('❌ createUserProfile: Error message:', error.message);
        console.error('❌ createUserProfile: Error details:', error.details);
        console.error('❌ createUserProfile: Error hint:', error.hint);
        console.error('❌ createUserProfile: Error code:', error.code);
        console.error('❌ createUserProfile: Full error object:', error);
        
        // Try to get table info
        console.log('🔍 createUserProfile: Attempting to get table info...');
        const { data: tableInfo, error: tableError } = await supabase
          .from('profiles')
          .select('*')
          .limit(1);
        
        console.log('🔍 createUserProfile: Table info result:', { tableInfo, tableError });
        
      } else {
        console.log('✅ createUserProfile: Profile created successfully for user:', user.id);
        console.log('✅ createUserProfile: Insert data:', insertData);
      }
    } catch (error) {
      console.error('❌ createUserProfile: EXCEPTION in createUserProfile:');
      console.error('❌ createUserProfile: Exception type:', typeof error);
      console.error('❌ createUserProfile: Exception message:', error.message);
      console.error('❌ createUserProfile: Exception stack:', error.stack);
      console.error('❌ createUserProfile: Full exception:', error);
    }
  }

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