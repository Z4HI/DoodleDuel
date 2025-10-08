import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../SUPABASE/supabaseConfig';

interface Match {
  id: string;
  word: string;
  status: 'waiting' | 'active' | 'completed';
  participants: Array<{
    id: number;
    user_id: string;
    submitted: boolean;
    profiles: {
      username: string;
    };
  }>;
}

export default function MultiplayerScreen() {
  const navigation = useNavigation();
  const [isLoading, setIsLoading] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const [matchStatus, setMatchStatus] = useState<'searching' | 'waiting' | 'active' | 'completed'>('searching');
  const [showGameModeSelection, setShowGameModeSelection] = useState(true);


  const findDoodleDuelMatch = async () => {
    setIsLoading(true);
    setShowGameModeSelection(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to play multiplayer');
        return;
      }

      const { data, error } = await supabase.functions.invoke('matchmaking', {
        body: {
          action: 'find_or_create_match',
          matchType: 'multiplayer',
          difficulty: 'easy'
        }
      });

      if (error) {
        console.error('Error finding match:', error);
        Alert.alert('Error', 'Failed to find a match. Please try again.');
        return;
      }

      if (data.success) {
        console.log('Match data received:', data.match);
        console.log('Participants data:', data.match.participants);
        
        setCurrentMatch(data.match);
        setMatchStatus(data.match.status === 'waiting' ? 'waiting' : 'active');
        
        // If match is active, navigate to drawing screen
        if (data.match.status === 'active') {
          navigation.navigate('MultiplayerDrawing' as never, { 
            matchId: data.match.id,
            word: data.match.word 
          } as never);
        }
      } else {
        console.error('Match creation failed:', data);
        Alert.alert('Error', 'Failed to create or join match. Please try again.');
      }
    } catch (error) {
      console.error('Error in findMatch:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const findDoodleHuntMatch = () => {
    Alert.alert('Coming Soon!', 'Doodle Hunt multiplayer mode is coming soon. Stay tuned!');
    setShowGameModeSelection(false);
  };

  const checkMatchStatus = async (matchId: string) => {
    try {
      console.log('Checking match status for:', matchId);
      const { data, error } = await supabase.functions.invoke('matchmaking', {
        body: {
          action: 'get_match_status',
          matchId: matchId
        }
      });

      if (error) {
        console.error('Error checking match status:', error);
        return;
      }

      if (data.success) {
        const match = data.match;
        console.log('Match status update:', {
          status: match.status,
          participants: match.participants?.length || 0,
          participants_data: match.participants
        });
        
        setCurrentMatch(match);
        
        if (match.status === 'active') {
          console.log('Match is now active, navigating to drawing screen');
          setMatchStatus('active');
          navigation.navigate('MultiplayerDrawing' as never, { 
            matchId: match.id,
            word: match.word 
          } as never);
        } else if (match.status === 'completed') {
          console.log('Match is completed, navigating to results screen');
          setMatchStatus('completed');
          navigation.navigate('MultiplayerResults' as never, { 
            matchId: match.id 
          } as never);
        } else {
          console.log('Match still waiting, participants:', match.participants?.length || 0);
        }
      } else {
        console.error('Failed to get match status:', data);
      }
    } catch (error) {
      console.error('Error in checkMatchStatus:', error);
    }
  };

  // Subscribe to realtime updates for the match
  useEffect(() => {
    if (!currentMatch) return;

    console.log('Setting up realtime subscription for match:', currentMatch.id);
    
    const channel = supabase
      .channel(`match-${currentMatch.id}`)
      // Listen for match status changes (waiting → active → completed)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `id=eq.${currentMatch.id}`
        },
        (payload) => {
          console.log('Match status update:', payload);
          if (payload.new) {
            const match = payload.new;
            setCurrentMatch(prev => ({ ...prev, ...match }));
            
            if (match.status === 'active') {
              console.log('Match is now active, navigating to drawing screen');
              setMatchStatus('active');
              navigation.navigate('MultiplayerDrawing' as never, { 
                matchId: match.id,
                word: match.word 
              } as never);
            } else if (match.status === 'completed') {
              console.log('Match is completed, navigating to results screen');
              setMatchStatus('completed');
              navigation.navigate('MultiplayerResults' as never, { 
                matchId: match.id 
              } as never);
            }
          }
        }
      )
      // Listen for participant changes (new players joining)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_participants',
          filter: `match_id=eq.${currentMatch.id}`
        },
        (payload) => {
          console.log('Participant update:', payload);
          // Refresh match data to get updated participant list
          checkMatchStatus(currentMatch.id);
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to match updates');
        }
      });

    return () => {
      console.log('Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [currentMatch]);

  const getStatusText = () => {
    switch (matchStatus) {
      case 'searching':
        return 'Searching for opponents...';
      case 'waiting':
        return 'Waiting for more players...';
      case 'active':
        return 'Match starting!';
      case 'completed':
        return 'Match completed!';
      default:
        return 'Ready to play!';
    }
  };

  const getStatusColor = () => {
    switch (matchStatus) {
      case 'searching':
        return '#FF9500';
      case 'waiting':
        return '#007AFF';
      case 'active':
        return '#34C759';
      case 'completed':
        return '#8E44AD';
      default:
        return '#666';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>🎮 Multiplayer</Text>
        <Text style={styles.subtitle}>Draw against players worldwide!</Text>
        
        {currentMatch ? (
          <View style={styles.matchContainer}>
            <Text style={styles.matchStatus} style={[styles.matchStatus, { color: getStatusColor() }]}>
              {getStatusText()}
            </Text>
            
            <View style={styles.matchInfo}>
              <Text style={styles.matchInfoText}>Match ID: {String(currentMatch.id || '').slice(0, 8)}...</Text>
              <Text style={styles.matchInfoText}>Players: {currentMatch.participants?.length || 0}/2</Text>
            </View>

            <View style={styles.participantsContainer}>
              <Text style={styles.participantsTitle}>Players:</Text>
              {currentMatch.participants?.map((participant, index) => (
                <View key={participant.id} style={styles.participantItem}>
                  <Text style={styles.participantName}>
                    {participant.profiles?.username || 'Unknown'}
                    {participant.submitted && ' ✓'}
                  </Text>
                </View>
              )) || (
                <Text style={styles.participantName}>Loading participants...</Text>
              )}
            </View>

            {matchStatus === 'waiting' && (
              <View style={styles.waitingContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.waitingText}>
                  Waiting for another player to join...
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.gameModeContainer}>
            <Text style={styles.gameModeTitle}>Choose Game Mode</Text>
            <Text style={styles.gameModeSubtitle}>Select the type of multiplayer game you want to play</Text>
            
            <TouchableOpacity 
              style={styles.gameModeButton} 
              onPress={findDoodleDuelMatch}
            >
              <Text style={styles.gameModeButtonText}>🎨 Find Match for Doodling</Text>
              <Text style={styles.gameModeDescription}>Draw against other players in real-time</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.gameModeButton, styles.comingSoonButton]} 
              onPress={findDoodleHuntMatch}
            >
              <Text style={styles.gameModeButtonText}>🔍 Find Match for Doodle Hunt</Text>
              <Text style={styles.gameModeDescription}>Coming Soon</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← Back to Home</Text>
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
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
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
  matchContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    marginBottom: 30,
  },
  matchStatus: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 15,
  },
  matchInfo: {
    marginBottom: 15,
  },
  matchInfoText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 5,
  },
  participantsContainer: {
    marginBottom: 15,
  },
  participantsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  participantItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 5,
  },
  participantName: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
  },
  waitingContainer: {
    alignItems: 'center',
    marginTop: 15,
  },
  waitingText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
  },
  backButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 12,
    width: 150,
  },
  backButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  gameModeContainer: {
    alignItems: 'center',
    marginBottom: 30,
    width: '100%',
  },
  gameModeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    color: '#333',
  },
  gameModeSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  gameModeButton: {
    backgroundColor: '#34C759',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    alignItems: 'center',
    marginBottom: 15,
  },
  comingSoonButton: {
    backgroundColor: '#8E8E93',
  },
  gameModeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 5,
  },
  gameModeDescription: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.9,
  },
});
