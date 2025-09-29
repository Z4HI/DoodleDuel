import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AppState {
  expoPushToken: string | null;
  darkMode: boolean;
  currentTab: number;
  isOnline: boolean;
}

const initialState: AppState = {
  expoPushToken: null,
  darkMode: false,
  currentTab: 0,
  isOnline: true,
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setExpoPushToken: (state, action: PayloadAction<string | null>) => {
      state.expoPushToken = action.payload;
    },
    setDarkMode: (state, action: PayloadAction<boolean>) => {
      state.darkMode = action.payload;
    },
    setCurrentTab: (state, action: PayloadAction<number>) => {
      state.currentTab = action.payload;
    },
    setOnlineStatus: (state, action: PayloadAction<boolean>) => {
      state.isOnline = action.payload;
    },
  },
});

export const { setExpoPushToken, setDarkMode, setCurrentTab, setOnlineStatus } = appSlice.actions;
export default appSlice.reducer;
