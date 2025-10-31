import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import LoginScreen from '../AUTH/login';
import { useNotificationNavigation } from '../NOTIFICATIONS/useNotificationNavigation';
import DatabaseConnectionTest from '../SCREENS/DatabaseConnectionTest';
import DatabaseTestScreen from '../SCREENS/DatabaseTestScreen';
import DoodleDuelFriend from '../SCREENS/DoodleDuelFriend';
import DoodleHuntFriend from '../SCREENS/DoodleHuntFriend';
import DoodleHuntScreen from '../SCREENS/DoodleHuntScreen';
import DoodleHuntDashScreen from '../SCREENS/DoodleHuntScreenDash';
import DuelFriendResults from '../SCREENS/DuelFriendResults';
import DuelFriendScreen from '../SCREENS/DuelFriendScreen';
import DuelOutcomeScreen from '../SCREENS/DuelOutcomeScreen';
import HomeScreen from '../SCREENS/HomeScreen';
import MultiplayerDrawingScreen from '../SCREENS/MultiplayerDrawingScreen';
import MultiplayerResultsScreen from '../SCREENS/MultiplayerResultsScreen';
import MultiplayerScreen from '../SCREENS/MultiplayerScreen';
import MyDrawingsScreen from '../SCREENS/MyDrawingsScreen';
import RouletteDrawingScreen from '../SCREENS/RouletteDrawingScreen';
import RouletteResultsScreen from '../SCREENS/RouletteResultsScreen';
import SimpleSignInTest from '../SCREENS/SimpleSignInTest';
import TestNavigationScreen from '../SCREENS/TestNavigationScreen';
import UserCheckScreen from '../SCREENS/UserCheckScreen';
import UsernameScreen from '../SCREENS/UsernameScreen';
import WordOfTheDayScreen from '../SCREENS/WordOfTheDayScreen';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { authService } from '../store/services/authService';
import { supabase } from '../SUPABASE/supabaseConfig';

const Stack = createStackNavigator();

function LoadingScreen() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#007AFF" />
    </View>
  );
}



function AuthNavigator() {
  const dispatch = useAppDispatch();
  const { user: session, userInfo, loading } = useAppSelector((state) => state.auth);
  
  // Handle notification navigation
  useNotificationNavigation();

  useEffect(() => {
    // Initialize auth
    dispatch(authService.initializeAuth());

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      dispatch(authService.handleAuthStateChange(event, session));
    });

    return () => subscription.unsubscribe();
  }, [dispatch]);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack.Navigator 
        screenOptions={{ 
          headerShown: false,
          gestureEnabled: false 
        }}
      >
        {session ? (
          <>
            <Stack.Screen 
              name="UserCheck" 
              component={UserCheckScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="WordOfTheDay" component={WordOfTheDayScreen} />
            <Stack.Screen name="DoodleHunt" component={DoodleHuntScreen} />
            <Stack.Screen name="DoodleHuntDash" component={DoodleHuntDashScreen} />
            <Stack.Screen name="DuelFriend" component={DuelFriendScreen} />
            <Stack.Screen name="DoodleDuelFriend" component={DoodleDuelFriend} />
            <Stack.Screen name="DoodleHuntFriend" component={DoodleHuntFriend} />
            <Stack.Screen name="DuelFriendResults" component={DuelFriendResults} />
            <Stack.Screen name="DuelOutcome" component={DuelOutcomeScreen} />
            <Stack.Screen name="Multiplayer" component={MultiplayerScreen} />
            <Stack.Screen name="MultiplayerDrawing" component={MultiplayerDrawingScreen} />
            <Stack.Screen name="MultiplayerResults" component={MultiplayerResultsScreen} />
            <Stack.Screen name="RouletteDrawing" component={RouletteDrawingScreen} />
            <Stack.Screen name="RouletteResults" component={RouletteResultsScreen} />
            <Stack.Screen name="MyDrawings" component={MyDrawingsScreen} />
            <Stack.Screen name="Username" component={UsernameScreen} />
            <Stack.Screen name="DatabaseTest" component={DatabaseTestScreen} />
            <Stack.Screen name="TestNavigation" component={TestNavigationScreen} />
            <Stack.Screen name="SimpleSignInTest" component={SimpleSignInTest} />
            <Stack.Screen name="DatabaseConnectionTest" component={DatabaseConnectionTest} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </GestureHandlerRootView>
  );
}

export default function RootNavigator() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <NavigationContainer>
        <AuthNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  homeContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 30,
    color: '#666',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#007AFF',
  },
});