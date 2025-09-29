import { useNavigation } from '@react-navigation/native';
import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { updateExpoPushToken } from '../NOTIFICATIONS/updateExpoPushToken';
import { usePushNotifications } from '../NOTIFICATIONS/usePushNotifications';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { authService } from '../store/services/authService';
import { supabase } from '../SUPABASE/supabaseConfig';

export default function HomeScreen() {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const { userInfo } = useAppSelector((state) => state.auth);
  
  // Set up push notifications
  const { expoPushToken } = usePushNotifications(true);

  // Save push token to database when it's available
  useEffect(() => {
    const savePushToken = async () => {
      if (expoPushToken && userInfo) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await updateExpoPushToken(expoPushToken, user.id);
          }
        } catch (error) {
          console.error('Error saving push token:', error);
        }
      }
    };

    savePushToken();
  }, [expoPushToken, userInfo]);

  const signOut = () => {
    dispatch(authService.signOut());
  };

  const navigateToDrawing = () => {
    navigation.navigate('WordOfTheDay' as never);
  };

  const navigateToMyDrawings = () => {
    navigation.navigate('MyDrawings' as never);
  };

  const navigateToClueClash = () => {
    // TODO: Navigate to Clue Clash screen when implemented
    console.log('Clue Clash button pressed');
  };

  const navigateToDuelFriend = () => {
    navigation.navigate('DuelFriend' as never);
  };


  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.userInfoContainer}>
        {userInfo && (
          <>
            <Text style={styles.userInfoText}>@{userInfo.username}</Text>
            <Text style={styles.userInfoText}>{userInfo.email}</Text>
          </>
        )}
      </View>
      
      <View style={styles.content}>
        <Text style={styles.title}>Welcome to Doodle Duel!</Text>
        <Text style={styles.subtitle}>This is your home screen</Text>
        
        <TouchableOpacity style={styles.drawButton} onPress={navigateToDrawing}>
          <Text style={styles.drawButtonText}>🎨 Draw Word of the Day</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.duelFriendButton} onPress={navigateToDuelFriend}>
          <Text style={styles.duelFriendButtonText}>⚔️ Duel a Friend</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.myDrawingsButton} onPress={navigateToMyDrawings}>
          <Text style={styles.myDrawingsButtonText}>📚 My Drawings</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.clueClashButton} onPress={navigateToClueClash}>
          <Text style={styles.clueClashButtonText}>⚔️ Clue Clash</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.button} onPress={signOut}>
          <Text style={styles.buttonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  userInfoContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  userInfoText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
    marginBottom: 2,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  drawButton: {
    backgroundColor: '#34C759',
    borderRadius: 8,
    padding: 16,
    width: 200,
    marginBottom: 15,
  },
  drawButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  duelFriendButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 8,
    padding: 16,
    width: 200,
    marginBottom: 15,
  },
  duelFriendButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  myDrawingsButton: {
    backgroundColor: '#FF9500',
    borderRadius: 8,
    padding: 16,
    width: 200,
    marginBottom: 15,
  },
  myDrawingsButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  clueClashButton: {
    backgroundColor: '#8E44AD',
    borderRadius: 8,
    padding: 16,
    width: 200,
    marginBottom: 15,
  },
  clueClashButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  testButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    padding: 16,
    width: 200,
    marginBottom: 15,
  },
  testButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  navTestButton: {
    backgroundColor: '#32D74B',
    borderRadius: 8,
    padding: 16,
    width: 200,
    marginBottom: 15,
  },
  navTestButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    width: 200,
    marginBottom: 20,
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
});