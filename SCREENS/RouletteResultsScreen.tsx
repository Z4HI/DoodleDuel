import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { xpService } from '../store/services/xpService';
import { supabase } from '../SUPABASE/supabaseConfig';

interface RouteParams {
  matchId: string;
  winner?: string;
  winnerScore?: number;
  gameEndReason?: string;
}

interface Turn {
  turn_number: number;
  user_id: string;
  ai_guess: string;
  similarity_score: number;
  was_correct: boolean;
}

interface Participant {
  user_id: string;
  turn_position: number;
  profiles: {
    username: string;
  };
}

interface MatchData {
  id: string;
  secret_word: string;
  winner_id: string;
  turn_number: number;
  status: string;
}

export default function RouletteResultsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { matchId, winner, winnerScore, gameEndReason } = route.params as RouteParams;
  const userInfo = useSelector((state: RootState) => state.auth.userInfo);
  const currentUserId = userInfo?.id;
  const dispatch = useDispatch();
  
  const [isLoading, setIsLoading] = useState(true);
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [winnerName, setWinnerName] = useState<string>('');
  const [isWinner, setIsWinner] = useState(false);
  const [xpAwarded, setXpAwarded] = useState(false);
  const [xpEarned, setXpEarned] = useState<number>(0);
  const [leveledUp, setLeveledUp] = useState(false);
  const [newLevel, setNewLevel] = useState<number>(0);
  const [tierUp, setTierUp] = useState(false);

  useEffect(() => {
    loadResults();
    markResultsViewed();
    
    // Cleanup check when leaving
    return () => {
      console.log('Leaving RouletteResultsScreen, attempting cleanup...');
      attemptCleanup();
    };
  }, []);

  const markResultsViewed = async () => {
    try {
      await supabase.functions.invoke('matchmaking', {
        body: {
          action: 'mark_results_viewed',
          matchId: matchId
        }
      });
      console.log('Marked results as viewed for match:', matchId);
    } catch (error) {
      console.error('Error marking results viewed:', error);
    }
  };

  const attemptCleanup = async () => {
    try {
      // This will trigger cleanup check - cleanup only happens if all players viewed
      await supabase.functions.invoke('matchmaking', {
        body: {
          action: 'mark_results_viewed',
          matchId: matchId
        }
      });
    } catch (error) {
      console.error('Error in cleanup attempt:', error);
    }
  };

  const loadResults = async () => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase.functions.invoke('matchmaking', {
        body: {
          action: 'get_roulette_status',
          matchId: matchId
        }
      });

      if (error) {
        console.error('Error loading results:', error);
        return;
      }

      if (data.success) {
        const match = data.match as MatchData;
        setMatchData(match);
        const won = match.winner_id === currentUserId;
        setIsWinner(won);
        
        if (data.participants) {
          setParticipants(data.participants);
          
          console.log('Winner debugging:', {
            winner_id: match.winner_id,
            participants: data.participants.map(p => ({
              user_id: p.user_id,
              username: p.profiles?.username
            }))
          });
          
          // Find winner name
          const winner = data.participants.find((p: Participant) => p.user_id === match.winner_id);
          console.log('Winner found:', winner);
          setWinnerName(winner?.profiles?.username || 'Unknown');
        }
        
        if (data.turns) {
          setTurns(data.turns);
        }

        // Award XP (only once) - but check if XP was already awarded by the database
        if (!xpAwarded) {
          setXpAwarded(true);
          const maxPlayers = match.max_players || data.participants?.length || 2;
          
          // Try to award XP, but handle the case where it might already be awarded
          try {
            const xpResult = await xpService.awardRouletteXP(won, maxPlayers, dispatch);
            
            if (xpResult) {
              setXpEarned(xpResult.xp_earned);
              setLeveledUp(xpResult.leveled_up);
              setNewLevel(xpResult.new_level);
              setTierUp(xpResult.tier_up);
            }
          } catch (error) {
            console.log('XP may have already been awarded automatically by the database:', error);
            // XP was likely already awarded by the database when the match completed
            // This is expected behavior when users close the app and reopen it later
          }
        }
      }
    } catch (error) {
      console.error('Error in loadResults:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getUsernameForId = (userId: string) => {
    const participant = participants.find(p => p.user_id === userId);
    return participant?.profiles?.username || 'Unknown';
  };

  const handlePlayAgain = () => {
    navigation.navigate('Multiplayer' as never);
  };

  const handleBackToHome = () => {
    navigation.navigate('Home' as never);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading results...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Action Buttons */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={handleBackToHome}>
          <Text style={styles.headerButtonText}>🏠 Home</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🎲 Roulette Results</Text>
        <TouchableOpacity style={styles.headerButton} onPress={handlePlayAgain}>
          <Text style={styles.headerButtonText}>🎲 Play Again</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Winner Section */}
        <View style={[
          styles.winnerSection,
          isWinner ? styles.winnerSectionYou : styles.winnerSectionOther
        ]}>
          <Text style={styles.winnerTitle}>
            {gameEndReason === 'tie' 
              ? '🤝 It\'s a Tie! 🤝' 
              : isWinner ? '🎉 You Won! 🎉' : '🏆 Winner 🏆'
            }
          </Text>
          <Text style={styles.winnerName}>
            {gameEndReason === 'tie' ? 'No one' : winnerName}
          </Text>
          <Text style={styles.secretWordLabel}>The word was:</Text>
          <Text style={styles.secretWord}>{matchData?.secret_word}</Text>
          <Text style={styles.turnsCount}>
            {turns.some(t => t.was_correct)
              ? `Guessed correctly in ${matchData?.turn_number} turn${matchData?.turn_number === 1 ? '' : 's'}!`
              : gameEndReason === 'tie'
                ? `Turn limit reached (${matchData?.turn_number} turns) - It's a tie! (Highest: ${winnerScore}%)`
                : gameEndReason === 'max_turns' 
                  ? `Turn limit reached (${matchData?.turn_number} turns) - ${winner} won with ${winnerScore}%!`
                  : `Turn limit reached (${matchData?.turn_number} turns) - Highest score wins!`
            }
          </Text>
        </View>

        {/* XP Earned Section */}
        {xpEarned > 0 && (
          <View style={styles.xpSection}>
            <Text style={styles.xpTitle}>💎 XP Earned</Text>
            <Text style={styles.xpAmount}>+{xpEarned} XP</Text>
            {leveledUp && (
              <Text style={styles.levelUpText}>
                🎉 Level Up! Now Level {newLevel}!
              </Text>
            )}
            {tierUp && (
              <Text style={styles.tierUpText}>
                🏆 TIER UP! You reached a new tier!
              </Text>
            )}
          </View>
        )}

        {/* Participants List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Players</Text>
          {participants.map((participant, index) => (
            <View key={participant.user_id} style={styles.participantItem}>
              <Text style={styles.participantNumber}>#{index + 1}</Text>
              <Text style={styles.participantName}>
                {participant.profiles?.username}
                {participant.user_id === currentUserId && ' (You)'}
                {participant.user_id === matchData?.winner_id && ' 👑'}
              </Text>
            </View>
          ))}
        </View>

        {/* Turn History - Sorted by Score */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Turn History</Text>
          <View style={styles.guessesContainer}>
            {turns
              .sort((a, b) => b.similarity_score - a.similarity_score)
              .map((turn, index) => {
                let barColor = '#E57373';
                if (turn.similarity_score === 100) {
                  barColor = '#64B5F6';
                } else if (turn.similarity_score >= 80) {
                  barColor = '#81C784';
                } else if (turn.similarity_score >= 60) {
                  barColor = '#FFE082';
                } else if (turn.similarity_score >= 40) {
                  barColor = '#FFB74D';
                }
                
                return (
                  <View key={index} style={styles.guessItem}>
                    <View style={styles.progressBarContainer}>
                      <View style={[styles.progressBar, { 
                        width: `${turn.similarity_score}%`,
                        backgroundColor: barColor 
                      }]} />
                      <View style={styles.guessContentInside}>
                        <Text style={styles.guessWordInside}>
                          {getUsernameForId(turn.user_id)}: "{turn.ai_guess}"
                        </Text>
                      </View>
                      <Text style={styles.guessScoreOutside}>{turn.similarity_score}%</Text>
                    </View>
                  </View>
                );
              })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  headerButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  headerButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  winnerSection: {
    padding: 24,
    borderRadius: 16,
    marginBottom: 24,
    alignItems: 'center',
  },
  winnerSectionYou: {
    backgroundColor: '#C8E6C9',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  winnerSectionOther: {
    backgroundColor: '#E3F2FD',
    borderWidth: 2,
    borderColor: '#2196F3',
  },
  winnerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  winnerName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 16,
  },
  secretWordLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  secretWord: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FF6B35',
    marginBottom: 8,
  },
  turnsCount: {
    fontSize: 14,
    color: '#666',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 8,
  },
  participantNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginRight: 12,
    width: 30,
  },
  participantName: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  guessesContainer: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  guessItem: {
    marginBottom: 8,
  },
  progressBarContainer: {
    height: 48,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  guessContentInside: {
    position: 'absolute',
    left: 8,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    width: '70%',
  },
  guessWordInside: {
    fontSize: 14,
    color: '#000',
    fontWeight: '700',
  },
  guessScoreOutside: {
    position: 'absolute',
    right: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  xpSection: {
    backgroundColor: '#E8F5E9',
    padding: 20,
    borderRadius: 12,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  xpTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  xpAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 8,
  },
  levelUpText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B35',
    marginTop: 8,
  },
  tierUpText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFD700',
    marginTop: 4,
  },
});

