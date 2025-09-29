import { Session } from '@supabase/supabase-js';
import { supabase } from '../../SUPABASE/supabaseConfig';
import { AppDispatch } from '../index';
import { clearAuth, setError, setLoading, setUser, setUserInfo } from '../slices/authSlice';

export const authService = {
  // Initialize auth state
  initializeAuth: () => async (dispatch: AppDispatch) => {
    try {
      dispatch(setLoading(true));
      const { data: { session } } = await supabase.auth.getSession();
      dispatch(setUser(session));
      
      if (session) {
        await authService.fetchUserInfo(session)(dispatch);
      }
    } catch (error) {
      dispatch(setError('Failed to initialize auth'));
      console.error('Auth initialization error:', error);
    } finally {
      dispatch(setLoading(false));
    }
  },

  // Fetch user info from profiles table
  fetchUserInfo: (session: Session) => async (dispatch: AppDispatch) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('username, email')
        .eq('id', session.user.id)
        .maybeSingle(); // Use maybeSingle() instead of single() to handle no results

      if (error) {
        console.error('Error fetching profile:', error);
        dispatch(setUserInfo({
          username: 'No username',
          email: session.user.email || 'No email'
        }));
        return;
      }

      // If no profile exists, try to create one
      if (!profile) {
        console.log('No profile found, trying to create one...');
        
        // First check if profile exists (in case of race condition)
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('username, email')
          .eq('id', session.user.id)
          .maybeSingle();

        if (existingProfile) {
          // Profile exists, use it
          const userInfo = {
            username: existingProfile?.username || 'No username',
            email: existingProfile?.email || session.user.email || 'No email'
          };
          dispatch(setUserInfo(userInfo));
          return;
        }

        // Profile doesn't exist, create it
        const { error: createError } = await supabase
          .from('profiles')
          .insert({
            id: session.user.id,
            email: session.user.email,
            full_name: session.user.user_metadata?.full_name || null,
            avatar_url: session.user.user_metadata?.avatar_url || null,
            isNewUser: true,
            darkMode: false,
            expoPushToken: null
          });

        if (createError) {
          console.error('Failed to create profile:', createError);
          
          // If it's a duplicate key error, try to fetch the existing profile
          if (createError.code === '23505') {
            console.log('Profile already exists, fetching it...');
            const { data: existingProfile } = await supabase
              .from('profiles')
              .select('username, email')
              .eq('id', session.user.id)
              .maybeSingle();

            if (existingProfile) {
              const userInfo = {
                username: existingProfile?.username || 'No username',
                email: existingProfile?.email || session.user.email || 'No email'
              };
              dispatch(setUserInfo(userInfo));
              return;
            }
          }
          
          // Set fallback user info even if creation failed
          dispatch(setUserInfo({
            username: 'No username',
            email: session.user.email || 'No email'
          }));
          return;
        }

        // After creating profile, fetch it again to get the updated data
        const { data: newProfile } = await supabase
          .from('profiles')
          .select('username, email')
          .eq('id', session.user.id)
          .maybeSingle();

        if (newProfile) {
          const userInfo = {
            username: newProfile?.username || 'No username',
            email: newProfile?.email || session.user.email || 'No email'
          };
          dispatch(setUserInfo(userInfo));
        } else {
          // Set fallback user info
          dispatch(setUserInfo({
            username: 'No username',
            email: session.user.email || 'No email'
          }));
        }
        return;
      }

      const userInfo = {
        username: profile?.username || 'No username',
        email: profile?.email || session.user.email || 'No email'
      };
      
      dispatch(setUserInfo(userInfo));
    } catch (error) {
      console.error('Error fetching user info:', error);
      dispatch(setUserInfo({
        username: 'No username',
        email: session.user.email || 'No email'
      }));
    }
  },

  // Handle auth state changes
  handleAuthStateChange: (event: string, session: Session | null) => async (dispatch: AppDispatch) => {
    dispatch(setUser(session));
    
    if (session) {
      await authService.fetchUserInfo(session)(dispatch);
    } else {
      dispatch(clearAuth());
    }
  },

  // Sign out
  signOut: () => async (dispatch: AppDispatch) => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        dispatch(setError(error.message));
      } else {
        dispatch(clearAuth());
      }
    } catch (error) {
      dispatch(setError('Failed to sign out'));
      console.error('Sign out error:', error);
    }
  },

  // Clear error
  clearError: () => (dispatch: AppDispatch) => {
    dispatch(setError(null));
  }
};
