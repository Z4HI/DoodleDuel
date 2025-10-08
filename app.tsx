import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, useFonts } from '@expo-google-fonts/nunito';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import mobileAds from 'react-native-google-mobile-ads';
import { Provider } from 'react-redux';
import RootNavigator from './NAVIGATION/rootNavigator';
import { store } from './store';

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