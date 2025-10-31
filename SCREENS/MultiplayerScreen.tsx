import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../SUPABASE/supabaseConfig';

interface Match {
  id: string;
  word?: string;
  secret_word?: string;
  status: 'waiting' | 'active' | 'completed' | 'in_progress';
  max_players: number;
  turn_order?: string[];
  participants?: Array<{
    id: number;
    user_id: string;
    submitted: boolean;
    profiles: {
      username: string;
    };
  }>;
  roulette_participants?: Array<{
    id: number;
    user_id: string;
    turn_position: number;
    is_active: boolean;
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
  const [selectedPlayerCount, setSelectedPlayerCount] = useState<2 | 4>(2);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Helper to get participants for any match type
  const getParticipants = (match: Match | null) => {
    if (!match) return [];
    return match.roulette_participants || match.participants || [];
  };

  // Countdown effect for match starting
  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      // Countdown finished, navigate to game
      if (currentMatch) {
        const isRouletteMatch = currentMatch.roulette_participants !== undefined;
        if (isRouletteMatch) {
          navigation.navigate('RouletteDrawing' as never, { 
            matchId: currentMatch.id,
            secretWord: currentMatch.secret_word,
            turnOrder: currentMatch.turn_order,
            currentTurnIndex: currentMatch.current_turn_index,
            participants: currentMatch.roulette_participants,
            maxPlayers: currentMatch.max_players
          } as never);
        }
      }
      setCountdown(null);
    }
  }, [countdown, currentMatch, navigation]);


  const findDoodleDuelMatch = async (playerCount: 2 | 4) => {
    setIsLoading(true);
    setShowGameModeSelection(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to play multiplayer');
        return;
      }

      // Clean up any existing waiting matches first
      console.log('Cleaning up any existing waiting matches...');
      await supabase.functions.invoke('matchmaking', {
        body: {
          action: 'cleanup_waiting_matches'
        }
      });

      const { data, error } = await supabase.functions.invoke('matchmaking', {
        body: {
          action: 'find_or_create_match',
          matchType: 'multiplayer',
          difficulty: 'easy',
          maxPlayers: playerCount
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
        
        // Update selected player count to match the current match
        if (data.match.max_players) {
          setSelectedPlayerCount(data.match.max_players as 2 | 4);
        }
        
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

  const findRouletteMatch = async (playerCount: 2 | 4) => {
    setIsLoading(true);
    setShowGameModeSelection(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to play');
        return;
      }

      const { data, error } = await supabase.functions.invoke('matchmaking', {
        body: {
          action: 'find_or_create_roulette',
          maxPlayers: playerCount
        }
      });

      if (error) {
        console.error('Error finding roulette match:', error);
        Alert.alert('Error', 'Failed to find a match. Please try again.');
        return;
      }

      if (data.success) {
        console.log('Roulette match data received:', data.match);
        console.log('Match status:', data.match.status);
        console.log('Participants in match:', data.match.roulette_participants);
        console.log('Participants from response:', data.participants);
        console.log('Participant count:', getParticipants(data.match).length);
        
        // Ensure participants data is properly set
        const matchWithParticipants = {
          ...data.match,
          roulette_participants: data.participants || data.match.roulette_participants
        };
        
        setCurrentMatch(matchWithParticipants);
        
        // Check if match already started while we were joining
        if (data.match.status === 'in_progress') {
          console.log('Match is already in progress! Starting countdown...');
          setMatchStatus('active');
          setCountdown(3); // 3 second countdown for consistency
          return;
        }
        
        setMatchStatus(data.match.status === 'waiting' ? 'waiting' : 'active');
        
        if (data.match.max_players) {
          setSelectedPlayerCount(data.match.max_players as 2 | 4);
        }
        
        // If match is active (full), start countdown
        if (data.match.status === 'in_progress') {
          setMatchStatus('active');
          setCountdown(3); // 3 second countdown for consistency
        }
      } else {
        Alert.alert('Error', 'Failed to create or join match. Please try again.');
      }
    } catch (error) {
      console.error('Error in findRouletteMatch:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const checkMatchStatus = async (matchId: string) => {
    try {
      console.log('Checking match status for:', matchId);
      
      // Determine if this is a roulette match
      const isRouletteMatch = currentMatch?.roulette_participants !== undefined;
      const action = isRouletteMatch ? 'get_roulette_status' : 'get_match_status';
      
      const { data, error } = await supabase.functions.invoke('matchmaking', {
        body: {
          action: action,
          matchId: matchId
        }
      });

      if (error) {
        console.error('Error checking match status:', error);
        return;
      }

      if (data.success) {
        const match = isRouletteMatch ? data.match : data.match;
        const participantCount = match.participants?.length || match.roulette_participants?.length || 0;
        
        console.log('Match status update:', {
          status: match.status,
          participants: participantCount,
          isRoulette: isRouletteMatch,
          participantsData: isRouletteMatch ? match.roulette_participants : match.participants,
          rawMatchData: match,
          rawResponseData: data
        });
        
        // For roulette matches, ensure participants are properly set
        const matchWithParticipants = isRouletteMatch ? {
          ...match,
          roulette_participants: data.participants || match.roulette_participants
        } : match;
        
        setCurrentMatch(matchWithParticipants);
        
        if (match.status === 'in_progress' && isRouletteMatch) {
          console.log('Roulette match is now active, starting countdown');
          setMatchStatus('active');
          setCountdown(3); // 3 second countdown for consistency
        } else if (match.status === 'active' && !isRouletteMatch) {
          console.log('Match is now active, navigating to drawing screen');
          setMatchStatus('active');
          navigation.navigate('MultiplayerDrawing' as never, { 
            matchId: match.id,
            word: match.word 
          } as never);
        } else if (match.status === 'completed') {
          console.log('Match is completed, navigating to results screen');
          setMatchStatus('completed');
          if (isRouletteMatch) {
            navigation.navigate('RouletteResults' as never, { 
              matchId: match.id 
            } as never);
          } else {
            navigation.navigate('MultiplayerResults' as never, { 
              matchId: match.id 
            } as never);
          }
        } else {
          console.log('Match still waiting, participants:', participantCount);
        }
      } else {
        console.error('Failed to get match status:', data);
      }
    } catch (error) {
      console.error('Error in checkMatchStatus:', error);
    }
  };

  // Clean up when leaving the screen
  useEffect(() => {
    return () => {
      // Only leave match if we have a current match and it's still waiting
      if (currentMatch && matchStatus === 'waiting') {
        console.log('Leaving waiting match on screen exit:', currentMatch.id);
        const isRouletteMatch = currentMatch.roulette_participants !== undefined;
        const action = isRouletteMatch ? 'leave_roulette_match' : 'leave_match';
        
        supabase.functions.invoke('matchmaking', {
          body: {
            action: action,
            matchId: currentMatch.id
          }
        }).catch(error => {
          console.error('Error leaving match on cleanup:', error);
        });
      }
    };
  }, [currentMatch, matchStatus]);

  // Subscribe to realtime updates for the match
  useEffect(() => {
    if (!currentMatch) return;

    console.log('Setting up realtime subscription for match:', currentMatch.id);
    
    // Check if this is a roulette match or regular match
    // Use roulette_participants to detect (more reliable than turn_order which may not exist yet)
    const isRouletteMatch = currentMatch.roulette_participants !== undefined;
    const matchTable = isRouletteMatch ? 'roulette_matches' : 'matches';
    const participantsTable = isRouletteMatch ? 'roulette_participants' : 'match_participants';
    
    console.log('Match type detected:', isRouletteMatch ? 'ROULETTE' : 'REGULAR');
    
    console.log('🎧 Setting up subscription for table:', matchTable);
    console.log('🎧 Listening for match ID:', currentMatch.id);
    console.log('🎧 Participants table:', participantsTable);
    
    const channel = supabase
      .channel(`match-${currentMatch.id}`, {
        config: {
          broadcast: { self: true },
          presence: { key: currentMatch.id }
        }
      })
      // Listen for match status changes (waiting → active → completed)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: matchTable,
          filter: `id=eq.${currentMatch.id}`
        },
        async (payload) => {
          console.log('🔥 REALTIME UPDATE RECEIVED!');
          console.log('Match status update:', payload);
          console.log('Match type is:', isRouletteMatch ? 'ROULETTE' : 'REGULAR');
          console.log('Table:', matchTable);
          console.log('Event:', payload.eventType);
          
          if (payload.new) {
            const match = payload.new as any;
            console.log('New match status:', match.status);
            console.log('Current turn index:', match.current_turn_index);
            console.log('Turn order:', match.turn_order);
            
            if (match.status === 'in_progress' && isRouletteMatch) {
              console.log('Roulette match is now active! Starting countdown...');
              setMatchStatus('active');
              setCountdown(3); // 3 second countdown for consistency
            } else if (match.status === 'active' && !isRouletteMatch) {
              console.log('Match is now active, navigating to drawing screen');
              setMatchStatus('active');
              navigation.navigate('MultiplayerDrawing' as never, { 
                matchId: match.id,
                word: match.word 
              } as never);
            } else if (match.status === 'completed') {
              console.log('Match is completed, navigating to results screen');
              setMatchStatus('completed');
              if (isRouletteMatch) {
                navigation.navigate('RouletteResults' as never, { 
                  matchId: match.id 
                } as never);
              } else {
                navigation.navigate('MultiplayerResults' as never, { 
                  matchId: match.id 
                } as never);
              }
            } else {
              // For other status changes, just update the state
              setCurrentMatch(prev => ({ 
                ...prev, 
                ...match,
                roulette_participants: prev?.roulette_participants
              }));
            }
          }
        }
      )
      // Listen for participant changes (new players joining)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: participantsTable
        },
        async (payload) => {
          console.log('🔥 PARTICIPANT INSERT EVENT!', payload);
          console.log('🔥 New row:', payload.new);
          
          // Check if this insert is for our match
          const newParticipant = payload.new as any;
          if (newParticipant && newParticipant.match_id === currentMatch.id) {
            console.log('✅ New participant joined OUR match! Refreshing match data...');
            
            // Refresh match data to get updated participants
            await checkMatchStatus(currentMatch.id);
          } else {
            console.log('ℹ️ Participant joined different match, ignoring');
          }
        }
      )
      .subscribe((status) => {
        console.log('🎧 Realtime subscription status:', status);
        console.log('🎧 Subscribed to table:', matchTable);
        console.log('🎧 For match ID:', currentMatch.id);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to match updates!');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Channel subscription error!');
        } else if (status === 'TIMED_OUT') {
          console.error('⏰ Subscription timed out!');
        }
      });

    return () => {
      console.log('Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [currentMatch]);

  const getStatusText = () => {
    if (countdown !== null && countdown > 0) {
      return `Match starting in ${countdown}...`;
    }
    
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
            <Text style={[styles.matchStatus, { color: getStatusColor() }]}>
              {getStatusText()}
            </Text>
            
            <View style={styles.matchInfo}>
              <Text style={styles.matchInfoText}>Match ID: {String(currentMatch.id || '').slice(0, 8)}...</Text>
              <Text style={styles.matchInfoText}>
                Players: {getParticipants(currentMatch).length}/{currentMatch.max_players || selectedPlayerCount}
              </Text>
            </View>

            <View style={styles.participantsContainer}>
              <Text style={styles.participantsTitle}>Players:</Text>
              {getParticipants(currentMatch).length > 0 ? (
                getParticipants(currentMatch).map((participant: any, index: number) => (
                  <View key={participant.id} style={styles.participantItem}>
                    <Text style={styles.participantName}>
                      {participant.profiles?.username || 'Unknown'}
                      {participant.submitted && ' ✓'}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.participantName}>Loading participants...</Text>
              )}
            </View>

            {matchStatus === 'waiting' && (
              <View style={styles.waitingContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.waitingText}>
                  Waiting for players to join...
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.gameModeContainer}>
            <Text style={styles.gameModeTitle}>Select Player Count</Text>
            <Text style={styles.gameModeSubtitle}>Choose how many players for any game mode</Text>
            
            {/* Player Count Selection */}
            <View style={styles.playerCountContainer}>
              <TouchableOpacity 
                style={[
                  styles.playerCountButton, 
                  selectedPlayerCount === 2 && styles.playerCountButtonActive
                ]} 
                onPress={() => setSelectedPlayerCount(2)}
              >
                <Text style={[
                  styles.playerCountText,
                  selectedPlayerCount === 2 && styles.playerCountTextActive
                ]}>👥 2 Players</Text>
                <Text style={[
                  styles.playerCountSubtext,
                  selectedPlayerCount === 2 && styles.playerCountSubtextActive
                ]}>1v1 Duel</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[
                  styles.playerCountButton, 
                  selectedPlayerCount === 4 && styles.playerCountButtonActive
                ]} 
                onPress={() => setSelectedPlayerCount(4)}
              >
                <Text style={[
                  styles.playerCountText,
                  selectedPlayerCount === 4 && styles.playerCountTextActive
                ]}>👥👥 4 Players</Text>
                <Text style={[
                  styles.playerCountSubtext,
                  selectedPlayerCount === 4 && styles.playerCountSubtextActive
                ]}>Battle Royale</Text>
              </TouchableOpacity>
            </View>

            {/* Game Mode Selection */}
            <Text style={styles.gameModeSectionTitle}>Then Choose Game Mode</Text>

            {/* Doodle Match Button */}
            <TouchableOpacity 
              style={styles.startMatchButton} 
              onPress={() => findDoodleDuelMatch(selectedPlayerCount)}
              disabled={isLoading}
            >
              <Text style={styles.startMatchButtonText}>
                🎨 Find {selectedPlayerCount}-Player Doodle Match
              </Text>
              <Text style={styles.startMatchDescription}>
                Draw against {selectedPlayerCount - 1} {selectedPlayerCount === 2 ? 'opponent' : 'opponents'} in real-time
              </Text>
            </TouchableOpacity>
            
            {/* Doodle Hunt Roulette */}
            <TouchableOpacity 
              style={[styles.gameModeButton, styles.rouletteButton]} 
              onPress={() => findRouletteMatch(selectedPlayerCount)}
              disabled={isLoading}
            >
              <Text style={styles.gameModeButtonText}>
                🎲 Find {selectedPlayerCount}-Player Roulette
              </Text>
              <Text style={styles.gameModeDescription}>
                Take turns drawing - First to guess wins!
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity 
          style={styles.backButton} 
          onPress={async () => {
            // Leave match if still waiting
            if (currentMatch && matchStatus === 'waiting') {
              console.log('Leaving waiting match on back button:', currentMatch.id);
              const isRouletteMatch = currentMatch.roulette_participants !== undefined;
              const action = isRouletteMatch ? 'leave_roulette_match' : 'leave_match';
              
              await supabase.functions.invoke('matchmaking', {
                body: {
                  action: action,
                  matchId: currentMatch.id
                }
              }).catch(error => {
                console.error('Error leaving match:', error);
              });
            }
            navigation.goBack();
          }}
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
  waitingHint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
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
  gameModeSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 10,
    marginBottom: 20,
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
  rouletteButton: {
    backgroundColor: '#FF6B35',
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
  playerCountContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
    gap: 10,
  },
  playerCountButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  playerCountButtonActive: {
    borderColor: '#007AFF',
    backgroundColor: '#E3F2FD',
  },
  playerCountText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  playerCountTextActive: {
    color: '#007AFF',
  },
  playerCountSubtext: {
    fontSize: 12,
    color: '#666',
  },
  playerCountSubtextActive: {
    color: '#007AFF',
  },
  startMatchButton: {
    backgroundColor: '#34C759',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    alignItems: 'center',
    marginBottom: 15,
  },
  startMatchButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 5,
  },
  startMatchDescription: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.9,
  },
});
