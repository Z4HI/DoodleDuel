import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Session } from '@supabase/supabase-js';

interface UserInfo {
  username: string;
  email: string;
  game_tokens?: number;
}

interface AuthState {
  user: Session | null;
  userInfo: UserInfo | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  userInfo: null,
  loading: true,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setUser: (state, action: PayloadAction<Session | null>) => {
      state.user = action.payload;
    },
    setUserInfo: (state, action: PayloadAction<UserInfo | null>) => {
      state.userInfo = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    clearAuth: (state) => {
      state.user = null;
      state.userInfo = null;
      state.error = null;
      state.loading = false;
    },
  },
});

export const { setLoading, setUser, setUserInfo, setError, clearAuth } = authSlice.actions;
export default authSlice.reducer;
