import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import GameModeInfoModal from '../COMPONENTS/GameModeInfoModal';
import ProfileIcon from '../COMPONENTS/ProfileIcon';
import ProfileModal from '../COMPONENTS/ProfileModal';
import { useRewardedAd } from '../COMPONENTS/RewardedAd';
import { updateExpoPushToken } from '../NOTIFICATIONS/updateExpoPushToken';
import { usePushNotifications } from '../NOTIFICATIONS/usePushNotifications';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { authService } from '../store/services/authService';
import { supabase } from '../SUPABASE/supabaseConfig';

export default function HomeScreen() {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const { userInfo } = useAppSelector((state) => state.auth);
  const [unacceptedChallenges, setUnacceptedChallenges] = useState(0);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [selectedGameMode, setSelectedGameMode] = useState('');
  const [dashCurrentLevel, setDashCurrentLevel] = useState<number | null>(null);
  const [doodleOfTheDayCompleted, setDoodleOfTheDayCompleted] = useState(false);
  const [doodleHuntDailyCompleted, setDoodleHuntDailyCompleted] = useState(false);
  const [dailyChecksLoading, setDailyChecksLoading] = useState(true);
  
  // Set up push notifications
  const { expoPushToken } = usePushNotifications(true);
  
  // Rewarded Ad
  const { showAd: showRewardedAd, isLoaded, isLoading } = useRewardedAd();

  // Function to handle earning tokens through ads
  const handleEarnToken = () => {
    Alert.alert(
      'Earn Token',
      'Watch an ad to earn 1 token!',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Watch Ad',
          onPress: async () => {
            console.log('🎬 User chose to watch ad for token');
            const result = await showRewardedAd(async (rewarded) => {
              console.log('🎁 HomeScreen: Reward callback triggered, rewarded:', rewarded);
              if (rewarded) {
                console.log('🎉 HomeScreen: User earned reward, adding 1 token');
                
                // Add 1 token to user's account
                await dispatch(authService.updateUserTokens(1));
                
                Alert.alert('Success!', 'You earned 1 token! 🪙');
              } else {
                console.log('❌ HomeScreen: No reward earned');
                Alert.alert('No Reward', 'You didn\'t complete the ad. Try again!');
              }
            });
            
            console.log('📊 HomeScreen: Ad result:', result);
            if (!result.success) {
              console.log('Ad not ready');
              Alert.alert('Ad Not Ready', 'Please try again in a moment.');
            }
          }
        }
      ]
    );
  };

  // Function to run all daily completion checks
  const runDailyCompletionChecks = async () => {
    setDailyChecksLoading(true);
    try {
      await Promise.all([
        checkDoodleOfTheDayCompletion(),
        checkDoodleHuntDailyCompletion()
      ]);
    } catch (error) {
      console.error('HomeScreen: Error running daily completion checks:', error);
    } finally {
      setDailyChecksLoading(false);
    }
  };

  // Function to check if Doodle of the Day is completed today
  const checkDoodleOfTheDayCompletion = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return;
      }
      
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      
      // First get today's word of the day
      const { data: wordData, error: wordError } = await supabase
        .from('word_of_the_day')
        .select('word')
        .eq('date', today)
        .single();

      if (wordError || !wordData) {
        console.log('HomeScreen: No word of the day found for today');
        return;
      }

      // Check if user has drawn today's word
      const { data, error } = await supabase
        .from('drawings')
        .select('id')
        .eq('user_id', user.id)
        .eq('word', wordData.word)
        .gte('created_at', `${today}T00:00:00.000Z`)
        .lt('created_at', `${today}T23:59:59.999Z`)
        .limit(1);

      if (error) {
        console.error('HomeScreen: Error checking doodle of the day completion:', error);
        return;
      }

      setDoodleOfTheDayCompleted(data && data.length > 0);
      console.log('HomeScreen: Doodle of the Day completed today:', data && data.length > 0);
    } catch (error) {
      console.error('HomeScreen: Error checking doodle of the day completion:', error);
    }
  };

  // Function to check if Doodle Hunt Daily is completed today
  const checkDoodleHuntDailyCompletion = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return;
      }
      
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      
      const { data, error } = await supabase
        .from('doodle_hunt_solo')
        .select('id')
        .eq('user_id', user.id)
        .in('status', ['won', 'lost'])
        .gte('created_at', `${today}T00:00:00.000Z`)
        .lt('created_at', `${today}T23:59:59.999Z`)
        .limit(1);

      if (error) {
        console.error('HomeScreen: Error checking doodle hunt daily completion:', error);
        return;
      }

      setDoodleHuntDailyCompleted(data && data.length > 0);
      console.log('HomeScreen: Doodle Hunt Daily completed today:', data && data.length > 0);
    } catch (error) {
      console.error('HomeScreen: Error checking doodle hunt daily completion:', error);
    }
  };

  // Function to get current Dash level
  const getDashCurrentLevel = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return;
      }
      
      // Get current level from active dash game
      const { data, error } = await supabase
        .from('doodle_hunt_dash_games')
        .select('current_level')
        .eq('user_id', user.id)
        .eq('status', 'in_progress')
        .single();

      if (error) {
        // No active game found or other error
        console.log('HomeScreen: No active dash game found');
        setDashCurrentLevel(1); // Default to level 1
        console.log('HomeScreen: Setting dashCurrentLevel to default: 1');
        return;
      }

      setDashCurrentLevel(data.current_level);
      console.log('HomeScreen: Current dash level:', data.current_level);
      console.log('HomeScreen: Setting dashCurrentLevel to:', data.current_level);
    } catch (error) {
      console.error('HomeScreen: Error getting dash level:', error);
      setDashCurrentLevel(1); // Default to level 1 on error
      console.log('HomeScreen: Setting dashCurrentLevel to default on error: 1');
    }
  };

  // Function to count unaccepted challenges
  const countUnacceptedChallenges = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return;
      }
      
      // Count duels where user is opponent and status is 'duel_sent' (unaccepted)
      const { data, error } = await supabase
        .from('duels')
        .select('id, status, accepted, challenger_id, opponent_id')
        .eq('opponent_id', user.id)
        .eq('status', 'duel_sent');

      if (error) {
        console.error('HomeScreen: Error counting challenges:', error);
        return;
      }

      const count = data?.length || 0;
      if (count > 0) {
        console.log('HomeScreen: Found', count, 'unaccepted challenges');
      }
      
      
      setUnacceptedChallenges(count);
    } catch (error) {
      console.error('HomeScreen: Error counting challenges:', error);
    }
  };

  // Update notification count based on realtime events
  const updateNotificationCount = async (payload: any) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('No user found in updateNotificationCount');
        return;
      }

      const duelData = payload.new || payload.old;
      if (!duelData) {
        console.log('No duel data in payload');
        return;
      }


      // Only update if this duel affects the current user (as opponent or challenger)
      if (duelData.opponent_id !== user.id && duelData.challenger_id !== user.id) {
        console.log('HomeScreen: Duel does not affect current user, skipping update');
        return;
      }

      console.log('HomeScreen: Duel affects current user, processing update...');

      // For any change that affects the current user, refresh the count to be accurate
      console.log('HomeScreen: Refreshing count due to duel change');
      await countUnacceptedChallenges();
    } catch (error) {
      console.error('HomeScreen: Error updating notification count:', error);
      // Fallback to full refresh
      await countUnacceptedChallenges();
    }
  };

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

  // Load unaccepted challenges count, dash level, and daily completion status on mount
  useEffect(() => {
    countUnacceptedChallenges();
    getDashCurrentLevel();
    runDailyCompletionChecks();
  }, []);

  // Refresh notification count, dash level, and daily completion status when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      console.log('HomeScreen focused, refreshing notification count...');
      countUnacceptedChallenges();
      getDashCurrentLevel();
      runDailyCompletionChecks();
    }, [])
  );

  // Subscribe to realtime changes on duels table for notifications
  useEffect(() => {
    console.log('HomeScreen: Setting up realtime subscription...');
    
    const channel = supabase
      .channel('home-duels-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'duels'
        },
        (payload) => {
          console.log('HomeScreen received real-time event:', payload);
          console.log('HomeScreen Event details:', {
            event: payload.event,
            new: payload.new,
            old: payload.old,
            table: payload.table,
            schema: payload.schema
          });
          // Update count based on the event type for smoother transitions
          updateNotificationCount(payload);
        }
      )
      .subscribe((status, err) => {
        console.log('HomeScreen subscription status:', status);
        if (err) {
          console.error('HomeScreen subscription error:', err);
        }
        if (status === 'SUBSCRIBED') {
          console.log('HomeScreen: Successfully subscribed to realtime updates');
        }
      });

    return () => {
      console.log('HomeScreen: Cleaning up realtime subscription...');
      supabase.removeChannel(channel);
    };
  }, []);

  const signOut = () => {
    setProfileModalVisible(false);
    dispatch(authService.signOut());
  };

  const openProfileModal = () => {
    setProfileModalVisible(true);
  };

  const closeProfileModal = () => {
    setProfileModalVisible(false);
  };

  const showGameModeInfo = (gameMode: string) => {
    setSelectedGameMode(gameMode);
    setInfoModalVisible(true);
  };

  const closeInfoModal = () => {
    setInfoModalVisible(false);
    setSelectedGameMode('');
  };

  const navigateToDrawing = () => {
    navigation.navigate('WordOfTheDay' as never);
  };

  const navigateToMyDrawings = () => {
    navigation.navigate('MyDrawings' as never);
  };

  const navigateToMultiplayer = () => {
    navigation.navigate('Multiplayer' as never);
  };

  const navigateToDuelFriend = () => {
    navigation.navigate('DuelFriend' as never);
  };

  const navigateToDoodleHunt = () => {
    navigation.navigate('DoodleHunt' as never);
  };

  const navigateToDoodleHuntDash = () => {
    navigation.navigate('DoodleHuntDash' as never);
  };



  // Show loading screen while daily checks are running
  if (dailyChecksLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Tokens and Profile Icon */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {userInfo && (
            <View style={styles.tokensContainer}>
              <Text style={styles.tokensText}>🪙 {userInfo.game_tokens || 0}</Text>
              <TouchableOpacity 
                style={styles.videoIconContainer}
                onPress={handleEarnToken}
                disabled={isLoading}
              >
                <Ionicons 
                  name="play-circle" 
                  size={20} 
                  color={isLoading ? "#999" : "#FF9500"} 
                />
              </TouchableOpacity>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          <View style={styles.profileSection}>
            {userInfo && (
              <Text style={styles.usernameText}>@{userInfo.username}</Text>
            )}
            <ProfileIcon onPress={openProfileModal} />
          </View>
        </View>
      </View>
      
      <View style={styles.content}>
        <Text style={styles.title}>Welcome to Doodle Duel!</Text>
        <Text style={styles.subtitle}>This is your home screen</Text>
        
        {/* Daily Games Section */}
        <View style={styles.dailySection}>
          <Text style={styles.sectionTitle}>Daily Games</Text>
          
          <View style={styles.gameModeButtonContainer}>
            <Ionicons 
              name={doodleOfTheDayCompleted ? "checkmark-circle" : "ellipse-outline"} 
              size={20} 
              color={doodleOfTheDayCompleted ? "#34C759" : "#999"} 
              style={styles.completionIcon}
            />
            <TouchableOpacity style={styles.drawButton} onPress={navigateToDrawing}>
              <Text style={styles.drawButtonText}>🎨 Doodle of the Day</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.infoIcon} 
              onPress={() => showGameModeInfo('Doodle of the Day')}
            >
              <Ionicons name="information-circle" size={28} color="#007AFF" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.gameModeButtonContainer}>
            <Ionicons 
              name={doodleHuntDailyCompleted ? "checkmark-circle" : "ellipse-outline"} 
              size={20} 
              color={doodleHuntDailyCompleted ? "#34C759" : "#999"} 
              style={styles.completionIcon}
            />
            <TouchableOpacity style={styles.doodleHuntButton} onPress={navigateToDoodleHunt}>
              <Text style={styles.doodleHuntButtonText}>🔍 Doodle Hunt Daily</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.infoIcon} 
              onPress={() => showGameModeInfo('Doodle Hunt Daily')}
            >
              <Ionicons name="information-circle" size={28} color="#007AFF" />
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.gameModeButtonContainer}>
          <TouchableOpacity style={styles.doodleHuntDashButton} onPress={navigateToDoodleHuntDash}>
            <Text style={styles.doodleHuntDashButtonText}>🎯 Doodle Hunt Dash</Text>
            {dashCurrentLevel !== null && (
              <Text style={styles.levelText}>Level {dashCurrentLevel}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.infoIcon} 
            onPress={() => showGameModeInfo('Doodle Hunt Dash')}
          >
            <Ionicons name="information-circle" size={28} color="#007AFF" />
          </TouchableOpacity>
        </View>
        
        <View style={styles.gameModeButtonContainer}>
          <TouchableOpacity style={styles.duelFriendButton} onPress={navigateToDuelFriend}>
            <View style={styles.duelButtonContent}>
              <Text style={styles.duelFriendButtonText}>⚔️ Duel a Friend</Text>
              {unacceptedChallenges > 0 && (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationText}>{unacceptedChallenges}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.infoIcon} 
            onPress={() => showGameModeInfo('Duel a Friend')}
          >
            <Ionicons name="information-circle" size={28} color="#007AFF" />
          </TouchableOpacity>
        </View>
        
        <View style={styles.gameModeButtonContainer}>
          <TouchableOpacity style={styles.multiplayerButton} onPress={navigateToMultiplayer}>
            <Text style={styles.multiplayerButtonText}>🎮 Multiplayer</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.infoIcon} 
            onPress={() => showGameModeInfo('Multiplayer')}
          >
            <Ionicons name="information-circle" size={28} color="#007AFF" />
          </TouchableOpacity>
        </View>
        
        <View style={styles.gameModeButtonContainer}>
          <TouchableOpacity style={styles.myDrawingsButton} onPress={navigateToMyDrawings}>
            <Text style={styles.myDrawingsButtonText}>📚 My Drawings</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.infoIcon} 
            onPress={() => showGameModeInfo('My Drawings')}
          >
            <Ionicons name="information-circle" size={28} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Profile Modal */}
      <ProfileModal
        visible={profileModalVisible}
        onClose={closeProfileModal}
        onSignOut={signOut}
        userInfo={userInfo}
      />

      {/* Game Mode Info Modal */}
      <GameModeInfoModal
        visible={infoModalVisible}
        onClose={closeInfoModal}
        gameMode={selectedGameMode}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tokensContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  tokensText: {
    fontSize: 16,
    color: '#FF9500',
    fontWeight: 'bold',
    marginRight: 8,
  },
  videoIconContainer: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 149, 0, 0.1)',
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  usernameText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    marginRight: 8,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dailySection: {
    marginBottom: 20,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  divider: {
    width: 200,
    height: 2,
    backgroundColor: '#FF9500',
    marginVertical: 15,
    borderRadius: 1,
  },
  gameModeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    position: 'relative',
  },
  gameModeButtonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    position: 'relative',
  },
  dailyGameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    position: 'relative',
  },
  levelText: {
    position: 'absolute',
    left: 120,
    top: 35,
    fontSize: 14,
    color: '#FF9500',
    fontWeight: 'bold',
    backgroundColor: 'white',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FF9500',
    zIndex: 10,
  },
  infoIcon: {
    position: 'absolute',
    right: -40,
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
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
  completionIcon: {
    position: 'absolute',
    left: -30,
    zIndex: 10,
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
  multiplayerButton: {
    backgroundColor: '#8E44AD',
    borderRadius: 8,
    padding: 16,
    width: 200,
    marginBottom: 15,
  },
  multiplayerButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  doodleHuntButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 8,
    padding: 16,
    width: 200,
    marginBottom: 15,
  },
  doodleHuntButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  doodleHuntDashButton: {
    backgroundColor: '#FF9500',
    borderRadius: 8,
    padding: 16,
    width: 200,
    marginBottom: 15,
    position: 'relative',
  },
  doodleHuntDashButtonText: {
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
  duelButtonContent: {
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  notificationText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});