import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, useFonts } from '@expo-google-fonts/nunito';
import React, { useEffect } from 'react';
import { AppState, View } from 'react-native';
import mobileAds from 'react-native-google-mobile-ads';
import { Provider } from 'react-redux';
import RootNavigator from './NAVIGATION/rootNavigator';
import { store } from './store';
import { supabase } from './SUPABASE/supabaseConfig';

// Function to cleanup active matches when app goes to background
const cleanupActiveMatches = async () => {
  try {
    console.log('🧹 Starting cleanup of active matches...');
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('No user found, skipping cleanup');
      return;
    }

    // Cleanup all waiting matches (both regular and roulette)
    await supabase.functions.invoke('matchmaking', {
      body: {
        action: 'cleanup_all_waiting_matches'
      }
    }).catch(error => {
      console.error('Error cleaning up all waiting matches:', error);
    });
    
    console.log('✅ Cleanup completed');
  } catch (error) {
    console.error('❌ Error in cleanupActiveMatches:', error);
  }
};

export default function App() {
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });

  useEffect(() => {
    // Initialize AdMob
    console.log('🚀 Starting AdMob initialization...');
    
    mobileAds()
      .initialize()
      .then(adapterStatuses => {
        // Initialization complete!
        console.log('✅ AdMob initialized successfully!');
        
        // Only log ready adapters
        Object.entries(adapterStatuses).forEach(([name, status]) => {
          if (status.state === 1) { // Only log ready adapters
            console.log(`📱 ${name}: Ready`);
          }
        });
      })
      .catch(error => {
        console.error('❌ AdMob initialization failed:', error);
      });

    // Handle app lifecycle events for cleanup
    const handleAppStateChange = async (nextAppState: string) => {
      console.log('App state changed to:', nextAppState);
      
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        console.log('App going to background, cleaning up matches...');
        await cleanupActiveMatches();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
    };
  }, []);

  if (!fontsLoaded) {
    return <View />;
  }
  return (
    <Provider store={store}>
      <RootNavigator />
    </Provider>
  );
}