import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useDispatch } from 'react-redux';
import { xpService } from '../store/services/xpService';
import { supabase } from '../SUPABASE/supabaseConfig';

interface DuelFriendResultsRouteParams {
  duelId: string;
}

interface DuelData {
  id: string;
  challenger_id: string;
  opponent_id: string;
  word: string;
  difficulty: string;
  gamemode: 'doodleDuel' | 'doodleHunt';
  status: 'duel_sent' | 'in_progress' | 'completed';
  challenger_username: string;
  opponent_username: string;
  winner_id: string | null;
  isChallenger: boolean;
}

interface PlayerGuess {
  guess: string;
  score: number;
  attempt: number;
}

interface PlayerResults {
  username: string;
  guesses: PlayerGuess[];
  finalScore: number;
  totalGuesses: number;
  isWinner: boolean;
  drawingPaths?: Array<{ path: string; color: string; strokeWidth: number }>;
  drawingMessage?: string;
}

export default function DuelFriendResults() {
  const navigation = useNavigation();
  const route = useRoute();
  const { duelId } = route.params as DuelFriendResultsRouteParams;
  const dispatch = useDispatch();
  
  console.log('=== DuelFriendResults Component Loaded ===');
  console.log('DuelFriendResults: Received duelId:', duelId);
  
  const [duelData, setDuelData] = useState<DuelData | null>(null);
  const [playerResults, setPlayerResults] = useState<PlayerResults[]>([]);
  const [turnsList, setTurnsList] = useState<Array<{ turnNumber: number; username: string; aiGuess: string; similarity: number; isWinnerTurn: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [xpAwarded, setXpAwarded] = useState(false);
  const [xpEarned, setXpEarned] = useState<number>(0);
  const [leveledUp, setLeveledUp] = useState(false);
  const [newLevel, setNewLevel] = useState<number>(0);
  const [tierUp, setTierUp] = useState(false);

  // Parse SVG paths from content (same as other screens)
  const parseSVGPaths = (svgContent: string) => {
    if (!svgContent || typeof svgContent !== 'string') {
      return { paths: [], viewBox: '0 0 100% 100%' };
    }
    
    try {
      // Extract path elements from SVG content
      const pathRegex = /<path[^>]*d="([^"]*)"[^>]*(?:stroke="([^"]*)")?[^>]*(?:stroke-width="([^"]*)")?[^>]*\/>/g;
      const paths: Array<{path: string, color: string, strokeWidth: number}> = [];
      let match;
      
      while ((match = pathRegex.exec(svgContent)) !== null) {
        if (match[1]) { // d attribute is required
          paths.push({
            path: match[1],
            color: match[2] || '#000000', // default to black
            strokeWidth: parseFloat(match[3]) || 3 // default to 3
          });
        }
      }
      
      return { paths, viewBox: '0 0 100% 100%' };
    } catch (error) {
      console.error('Error parsing SVG:', error);
      return { paths: [], viewBox: '0 0 100% 100%' };
    }
  };

  const loadDuelResults = async () => {
    try {
      setLoading(true);
      console.log('=== DuelFriendResults: Starting to load results ===');
      console.log('DuelFriendResults: Loading duel results for duelId:', duelId);

      // Fetch the duel details
      const { data: duel, error: duelError } = await supabase
        .from('duels')
        .select('*')
        .eq('id', duelId)
        .single();

      if (duelError) {
        console.error('Error fetching duel:', duelError);
        Alert.alert('Error', 'Failed to load duel data');
        return;
      }

      // Fetch challenger username
      const { data: challengerData, error: challengerError } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', duel.challenger_id)
        .single();

      if (challengerError) {
        console.error('Error fetching challenger:', challengerError);
        Alert.alert('Error', 'Failed to load challenger data');
        return;
      }

      // Fetch opponent username
      const { data: opponentData, error: opponentError } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', duel.opponent_id)
        .single();

      if (opponentError) {
        console.error('Error fetching opponent:', opponentError);
        Alert.alert('Error', 'Failed to load opponent data');
        return;
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'User not authenticated');
        return;
      }

      const isChallenger = user.id === duel.challenger_id;

      const duelInfo: DuelData = {
        id: duel.id,
        challenger_id: duel.challenger_id,
        opponent_id: duel.opponent_id,
        word: duel.word,
        difficulty: duel.difficulty,
        gamemode: duel.gamemode,
        status: duel.status,
        challenger_username: challengerData.username,
        opponent_username: opponentData.username,
        winner_id: duel.winner_id,
        isChallenger,
      };

      setDuelData(duelInfo);

      // Load both players' game results
      await loadPlayerResults(duel.challenger_id, duel.opponent_id, duel.winner_id, duel.gamemode, duel.word);

      // Award XP (only once)
      if (!xpAwarded && user && duel.winner_id) {
        setXpAwarded(true);
        const won = user.id === duel.winner_id;
        
        // Get user's score for perfect bonus calculation
        let similarity = 0;
        if (duel.gamemode === 'doodleDuel') {
          // For doodle duel, use the score from drawings
          const drawingId = isChallenger ? duel.challenger_drawing_id : duel.opponent_drawing_id;
          if (drawingId) {
            const { data: drawing } = await supabase
              .from('drawings')
              .select('score')
              .eq('id', drawingId)
              .single();
            similarity = drawing?.score || 0;
          }
        }
        
        const xpResult = await xpService.awardDuelXP(won, similarity, dispatch);
        
        if (xpResult) {
          setXpEarned(xpResult.xp_earned);
          setLeveledUp(xpResult.leveled_up);
          setNewLevel(xpResult.new_level);
          setTierUp(xpResult.tier_up);
        }
      }

    } catch (error) {
      console.error('Error loading duel results:', error);
      Alert.alert('Error', 'Failed to load duel results');
    } finally {
      setLoading(false);
    }
  };

  const loadPlayerResults = async (challengerId: string, opponentId: string, winnerId: string | null, gamemode: string, word: string) => {
    try {
      console.log('Loading player results for duelId:', duelId);
      console.log('ChallengerId:', challengerId, 'OpponentId:', opponentId, 'WinnerId:', winnerId);
      console.log('Duel gamemode:', gamemode);
      
      const results: PlayerResults[] = [];

      if (gamemode === 'doodleDuel') {
        // Handle DoodleDuel results - get drawings from duels table with joined drawing data
        console.log('Loading DoodleDuel results from duels table with drawing references');
        
        const { data: duelWithDrawings, error: duelError } = await supabase
          .from('duels')
          .select(`
            challenger_drawing_id,
            opponent_drawing_id,
            challenger_drawing:challenger_drawing_id(score, message, svg_url, word, user_id),
            opponent_drawing:opponent_drawing_id(score, message, svg_url, word, user_id)
          `)
          .eq('id', duelId)
          .single();

        if (duelError) {
          console.error('Error fetching duel with drawings:', duelError);
          return;
        }

        console.log('Duel with drawings found:', duelWithDrawings);

        // Process challenger's drawing
        if (duelWithDrawings.challenger_drawing) {
          const drawing = duelWithDrawings.challenger_drawing;
          console.log('Processing challenger drawing:', drawing);
          
          // Get challenger username
          const { data: challengerProfile, error: challengerProfileError } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', challengerId)
            .single();

          if (!challengerProfileError && challengerProfile) {
            // Load and parse the SVG drawing
            let drawingPaths: Array<{ path: string; color: string; strokeWidth: number }> = [];
            if (drawing.svg_url) {
              try {
                console.log('Loading challenger SVG from URL:', drawing.svg_url);
                const response = await fetch(drawing.svg_url);
                if (response.ok) {
                  const svgContent = await response.text();
                  const { paths } = parseSVGPaths(svgContent);
                  drawingPaths = paths;
                  console.log('Parsed challenger drawing paths:', paths.length);
                }
              } catch (error) {
                console.error('Error loading challenger SVG:', error);
              }
            }

            const playerGuesses: PlayerGuess[] = [{
              guess: `Drawing for "${drawing.word || word}"`,
              score: drawing.score || 0,
              attempt: 1
            }];

            results.push({
              username: challengerProfile.username,
              finalScore: drawing.score || 0,
              totalGuesses: 1, // DoodleDuel is just one drawing
              isWinner: winnerId === challengerId,
              guesses: playerGuesses,
              drawingPaths: drawingPaths,
              drawingMessage: drawing.message
            });
          }
        }

        // Process opponent's drawing
        if (duelWithDrawings.opponent_drawing) {
          const drawing = duelWithDrawings.opponent_drawing;
          console.log('Processing opponent drawing:', drawing);
          
          // Get opponent username
          const { data: opponentProfile, error: opponentProfileError } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', opponentId)
            .single();

          if (!opponentProfileError && opponentProfile) {
            // Load and parse the SVG drawing
            let drawingPaths: Array<{ path: string; color: string; strokeWidth: number }> = [];
            if (drawing.svg_url) {
              try {
                console.log('Loading opponent SVG from URL:', drawing.svg_url);
                const response = await fetch(drawing.svg_url);
                if (response.ok) {
                  const svgContent = await response.text();
                  const { paths } = parseSVGPaths(svgContent);
                  drawingPaths = paths;
                  console.log('Parsed opponent drawing paths:', paths.length);
                }
              } catch (error) {
                console.error('Error loading opponent SVG:', error);
              }
            }

            const playerGuesses: PlayerGuess[] = [{
              guess: `Drawing for "${drawing.word || word}"`,
              score: drawing.score || 0,
              attempt: 1
            }];

            results.push({
              username: opponentProfile.username,
              finalScore: drawing.score || 0,
              totalGuesses: 1, // DoodleDuel is just one drawing
              isWinner: winnerId === opponentId,
              guesses: playerGuesses,
              drawingPaths: drawingPaths,
              drawingMessage: drawing.message
            });
          }
        }
      } else if (gamemode === 'doodleHunt') {
        // New turn-based friend DoodleHunt: read from doodle_hunt_friend_turns
        console.log('Loading DoodleHunt Friend results from doodle_hunt_friend_turns');

        const { data: turns, error: turnsError } = await supabase
          .from('doodle_hunt_friend_turns')
          .select('user_id, turn_number, ai_guess, similarity_score')
          .eq('duel_id', duelId)
          .order('turn_number', { ascending: true });

        if (turnsError) {
          console.error('Error fetching turns:', turnsError);
          return;
        }

        const userIds = Array.from(new Set((turns || []).map(t => t.user_id)));
        if (userIds.length === 0) {
          console.log('No turns found for duel');
        }

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', userIds as any);

        const idToUsername: Record<string, string> = {};
        (profiles || []).forEach((p: any) => {
          idToUsername[p.id] = p.username || 'Unknown';
        });

        // Build a single chronological turns list with winner/loser coloring
        const chronologicalTurns = (turns || []).map(t => ({
          turnNumber: t.turn_number,
          username: idToUsername[t.user_id] || 'Unknown',
          aiGuess: t.ai_guess || '',
          similarity: t.similarity_score || 0,
          isWinnerTurn: t.user_id === winnerId,
        })).sort((a, b) => a.turnNumber - b.turnNumber);
        setTurnsList(chronologicalTurns);

        // Also compute per-user summary for header stats
        const byUser: Record<string, { finalScore: number; count: number } > = {};
        (turns || []).forEach(t => {
          if (!byUser[t.user_id]) byUser[t.user_id] = { finalScore: 0, count: 0 };
          byUser[t.user_id].finalScore = Math.max(byUser[t.user_id].finalScore, t.similarity_score || 0);
          byUser[t.user_id].count += 1;
        });
        userIds.forEach(uid => {
          results.push({
            username: idToUsername[uid] || 'Unknown',
            guesses: [],
            finalScore: byUser[uid]?.finalScore || 0,
            totalGuesses: byUser[uid]?.count || 0,
            isWinner: uid === winnerId,
          });
        });
      } else {
        console.error('Unknown gamemode:', gamemode);
        return;
      }

      // Sort results: winner first, then by performance
      results.sort((a, b) => {
        if (a.isWinner && !b.isWinner) return -1;
        if (!a.isWinner && b.isWinner) return 1;
        
        // If both winners or both losers, sort by performance
        if (a.totalGuesses !== b.totalGuesses) {
          return a.totalGuesses - b.totalGuesses; // Fewer guesses first
        }
        return b.finalScore - a.finalScore; // Higher score first
      });

      console.log('Final player results:', results);
      setPlayerResults(results);

    } catch (error) {
      console.error('Error loading player results:', error);
    }
  };

  useEffect(() => {
    if (duelId) {
      console.log('DuelFriendResults: Loading results for duelId:', duelId);
      loadDuelResults();
    }
  }, [duelId]);


  const navigateToDuelFriend = () => {
    (navigation as any).navigate('DuelFriend');
  };

  // Render SVG drawing (same as DuelOutcomeScreen)
  const renderDrawing = (paths: Array<{ path: string; color: string; strokeWidth: number }>, title: string, score: number, message: string) => {
    if (paths.length === 0) {
      return (
        <View style={styles.drawingContainer}>
          <Text style={styles.drawingTitle}>{title}</Text>
          <View style={styles.drawingCanvas}>
            <Text style={styles.drawingPlaceholderText}>
              🎨 Loading drawing... ({paths.length} paths)
            </Text>
          </View>
          <View style={styles.scoreContainer}>
            <Text style={styles.scoreText}>Score: {score}%</Text>
            {message && <Text style={styles.messageText}>{message}</Text>}
          </View>
        </View>
      );
    }

    return (
      <View style={styles.drawingContainer}>
        <Text style={styles.drawingTitle}>{title}</Text>
        <View style={styles.drawingCanvas}>
          <Svg style={styles.drawingSvg} viewBox="0 0 300 300" preserveAspectRatio="xMidYMid meet">
            {paths.map((pathData, index) => (
              <Path
                key={index}
                d={pathData.path}
                stroke={pathData.color}
                strokeWidth={pathData.strokeWidth}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </Svg>
        </View>
        <View style={styles.scoreContainer}>
          <Text style={styles.scoreText}>Score: {score}%</Text>
          {message && <Text style={styles.messageText}>{message}</Text>}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading results...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!duelData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Failed to load duel data</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isTie = !duelData.winner_id;
  const currentUserWon = playerResults.find(p => p.isWinner)?.username === 
    (duelData.isChallenger ? duelData.challenger_username : duelData.opponent_username);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.navigate('DuelFriend' as never)}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Duel Results</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        {/* Word Display */}
        <View style={styles.wordSection}>
          <Text style={styles.wordLabel}>Word:</Text>
          <Text style={styles.wordText}>{duelData.word.toUpperCase()}</Text>
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

        {/* Results Summary */}
        <View style={[
          styles.summarySection,
          isTie 
            ? styles.tieContainer 
            : currentUserWon 
              ? styles.winContainer 
              : styles.lossContainer
        ]}>
          <Text style={[
            styles.summaryTitle,
            isTie 
              ? styles.tieTitle 
              : currentUserWon 
                ? styles.winTitle 
                : styles.lossTitle
          ]}>
            {isTie 
              ? "🤝 It's a Tie!" 
              : currentUserWon 
                ? "🎉 You Win!" 
                : "😔 You Lost"
            }
          </Text>
          <Text style={[
            styles.summarySubtitle,
            isTie 
              ? styles.tieSubtitle 
              : currentUserWon 
                ? styles.winSubtitle 
                : styles.lossSubtitle
          ]}>
            {isTie 
              ? "Both players performed equally well!" 
              : currentUserWon 
                ? "Congratulations on your victory!" 
                : "Better luck next time!"
            }
          </Text>
        </View>

        {/* Player Results */}
        {console.log('Rendering playerResults:', playerResults)}
        {playerResults.length === 0 ? (
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataText}>No player data found</Text>
            <Text style={styles.noDataSubtext}>Loading results...</Text>
          </View>
        ) : duelData?.gamemode === 'doodleDuel' ? (
          // DoodleDuel: Show drawings side by side
          <View style={styles.drawingsContainer}>
            {playerResults.map((player, index) => {
              const title = player.isWinner ? `${player.username} 👑` : player.username;
              return (
                <View key={index} style={styles.drawingWrapper}>
                  {renderDrawing(
                    player.drawingPaths || [],
                    title,
                    player.finalScore,
                    player.drawingMessage || ''
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          // DoodleHunt Friend (turn-based): single chronological table colored by winner/loser
          <View style={styles.turnsContainer}>
            <Text style={styles.turnsTitle}>Top Guesses</Text>
            {[...turnsList]
              .sort((a, b) => b.similarity - a.similarity)
              .map((t, idx) => {
                const barColor = t.isWinnerTurn ? '#81C784' : '#E57373';
                return (
                  <View key={idx} style={styles.guessItem}>
                    <View style={styles.progressBarContainer}>
                      <View style={[styles.progressBar, { width: `${t.similarity}%`, backgroundColor: barColor }]} />
                      <Text style={styles.guessWordInside}>{t.username}: "{t.aiGuess}"</Text>
                      <Text style={styles.guessScoreOutside}>{t.similarity}%</Text>
                    </View>
                  </View>
                );
              })}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.duelAgainButton} onPress={navigateToDuelFriend}>
            <Text style={styles.duelAgainButtonText}>Duel Again</Text>
          </TouchableOpacity>
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
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  placeholder: {
    width: 60,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#666',
  },
  errorText: {
    fontSize: 18,
    color: '#FF3B30',
  },
  wordSection: {
    backgroundColor: '#F8F9FA',
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
    alignItems: 'center',
  },
  wordLabel: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
  },
  wordText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    letterSpacing: 2,
  },
  summarySection: {
    backgroundColor: '#E8F5E8',
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
    alignItems: 'center',
  },
  summaryTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 5,
  },
  summarySubtitle: {
    fontSize: 16,
    color: '#4CAF50',
    textAlign: 'center',
  },
  // Win/Loss/Tie Container Styles
  winContainer: {
    backgroundColor: '#E8F5E8',
    borderColor: '#4CAF50',
    borderWidth: 2,
  },
  lossContainer: {
    backgroundColor: '#FFEBEE',
    borderColor: '#F44336',
    borderWidth: 2,
  },
  tieContainer: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FF9800',
    borderWidth: 2,
  },
  // Title Styles
  winTitle: {
    color: '#2E7D32',
    fontSize: 24,
    fontWeight: 'bold',
  },
  lossTitle: {
    color: '#C62828',
    fontSize: 24,
    fontWeight: 'bold',
  },
  tieTitle: {
    color: '#E65100',
    fontSize: 24,
    fontWeight: 'bold',
  },
  // Subtitle Styles
  winSubtitle: {
    color: '#2E7D32',
    fontSize: 16,
  },
  lossSubtitle: {
    color: '#C62828',
    fontSize: 16,
  },
  tieSubtitle: {
    color: '#E65100',
    fontSize: 16,
  },
  playerCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    flex: 1,
    marginHorizontal: 5,
  },
  playerHeader: {
    marginBottom: 15,
  },
  playerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  playerStats: {
    fontSize: 14,
    color: '#666',
  },
  guessesSection: {
    marginTop: 10,
  },
  guessesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  guessItem: {
    marginBottom: 2,
  },
  progressBarContainer: {
    height: 32,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
    justifyContent: 'center',
    paddingLeft: 8,
  },
  guessWordInside: {
    position: 'absolute',
    left: 8,
    fontSize: 14,
    color: '#000',
    fontWeight: '700',
    fontFamily: 'Nunito_700Bold',
  },
  guessScoreOutside: {
    position: 'absolute',
    right: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  actionButtons: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  duelAgainButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8,
    flex: 0.45,
  },
  duelAgainButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  noDataContainer: {
    backgroundColor: '#F8F9FA',
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
    alignItems: 'center',
  },
  noDataText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 5,
  },
  noDataSubtext: {
    fontSize: 14,
    color: '#999',
  },
  playersContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  turnsContainer: {
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 20,
  },
  turnsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  // Drawing styles for DoodleDuel
  drawingsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 10,
  },
  drawingWrapper: {
    flex: 1,
  },
  drawingContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  drawingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  drawingCanvas: {
    height: 200,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  drawingSvg: {
    width: '100%',
    height: '100%',
  },
  drawingPlaceholderText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  scoreContainer: {
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  xpSection: {
    backgroundColor: '#E8F5E9',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
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
