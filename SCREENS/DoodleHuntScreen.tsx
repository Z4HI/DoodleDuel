import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, PanResponder, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useDispatch, useSelector } from 'react-redux';
import DrawingToolsPalette from '../COMPONENTS/DrawingToolsPalette';
import { useRewardedAd } from '../COMPONENTS/RewardedAd';
import XPBanner from '../COMPONENTS/XPBanner';
import { RootState } from '../store';
import { xpService } from '../store/services/xpService';
import { setUserInfo } from '../store/slices/authSlice';
import { supabase } from '../SUPABASE/supabaseConfig';
import { compressImageToBase64 } from '../utils/imageCompression';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function DoodleHuntScreen() {
  const navigation = useNavigation();
  const canvasRef = useRef<View>(null);
  
  // Get user info from Redux store
  const userInfo = useSelector((state: RootState) => state.auth.userInfo);
  const dispatch = useDispatch();
  
  // Animation state
  const slideAnimation = useRef(new Animated.Value(0)).current;
  
  // Game state
  const [secretWord, setSecretWord] = useState<string>('');
  const [displayWord, setDisplayWord] = useState<string>('');
  const [isLoadingWord, setIsLoadingWord] = useState(true);
  const [wordError, setWordError] = useState<string | null>(null);
  const [currentStreak, setCurrentStreak] = useState<number>(0);
  const [attempts, setAttempts] = useState(0);
  const [guessesLeft, setGuessesLeft] = useState(5);
  const [gameWon, setGameWon] = useState(false);
  const [gameLost, setGameLost] = useState(false);
  const [aiGuess, setAiGuess] = useState<string>('');
  const [similarityScore, setSimilarityScore] = useState<number>(0);
  const [previousAttempts, setPreviousAttempts] = useState<Array<{guess: string, score: number, hint: string, hintUsed: boolean, guessId?: string}>>([]);
  
  // Drawing state
  const [paths, setPaths] = useState<Array<{ path: string; color: string; strokeWidth: number }>>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(3);
  const [currentPoints, setCurrentPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEraseMode, setIsEraseMode] = useState(false);
  const [isControlsExpanded, setIsControlsExpanded] = useState(false);
  const [gameId, setGameId] = useState<string | null>(null);
  const [xpEarned, setXpEarned] = useState<number>(0);
  const [leveledUp, setLeveledUp] = useState(false);
  const [newLevel, setNewLevel] = useState<number>(0);

  // Rewarded Ad
  const { showAd: showRewardedAd, isLoaded, isLoading } = useRewardedAd();

  // Fetch current streak on mount
  useEffect(() => {
    fetchStreak();
  }, []);

  // Fetch current streak
  const fetchStreak = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('doodle_hunt_streak')
        .eq('id', user.id)
        .single();

      if (profile) {
        setCurrentStreak(profile.doodle_hunt_streak || 0);
      }
    } catch (error) {
      console.error('Error fetching streak:', error);
    }
  };

  // Update streak when playing
  const updateStreak = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = new Date().toISOString().split('T')[0];

      // Get current profile data
      const { data: profile } = await supabase
        .from('profiles')
        .select('doodle_hunt_streak, last_doodle_hunt_date')
        .eq('id', user.id)
        .single();

      if (!profile) return;

      const lastDate = profile.last_doodle_hunt_date;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      let newStreak = 0;

      if (lastDate === today) {
        // Already played today, keep current streak
        newStreak = profile.doodle_hunt_streak || 0;
      } else if (lastDate === yesterdayStr) {
        // Played yesterday, increment streak
        newStreak = (profile.doodle_hunt_streak || 0) + 1;
      } else if (!lastDate) {
        // First time ever playing
        newStreak = 1;
      } else {
        // Gap in playing, reset to 0
        newStreak = 0;
      }

      // Update database
      const { error } = await supabase
        .from('profiles')
        .update({
          doodle_hunt_streak: newStreak,
          last_doodle_hunt_date: today
        })
        .eq('id', user.id);

      if (!error) {
        setCurrentStreak(newStreak);
      }
    } catch (error) {
      console.error('Error updating streak:', error);
    }
  };

  // Function to subtract a token from user's profile
  const subtractToken = async (): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('No authenticated user found');
        return false;
      }

      // Get current tokens
      const { data: currentProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('game_tokens')
        .eq('id', user.id)
        .single();

      if (fetchError) {
        console.error('Error fetching current tokens:', fetchError);
        return false;
      }

      const currentTokens = currentProfile?.game_tokens || 0;
      
      if (currentTokens < 1) {
        console.log('User has no tokens to spend');
        return false;
      }

      const newTokens = currentTokens - 1;

      // Update tokens in database
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ game_tokens: newTokens })
        .eq('id', user.id);

      if (updateError) {
        console.error('Error updating tokens:', updateError);
        return false;
      }

      // Update Redux store with new token count
      if (userInfo) {
        dispatch(setUserInfo({
          ...userInfo,
          game_tokens: newTokens
        }));
      }

      console.log(`✅ Token spent: ${currentTokens} - 1 = ${newTokens}`);
      return true;
    } catch (error) {
      console.error('Error subtracting token:', error);
      return false;
    }
  };

  // Check for active game when component mounts
  useEffect(() => {
    checkForActiveGame();
  }, []);

  // Load previous game for current word and same day
  const loadPreviousGame = async (word: string): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      // Get today's date in YYYY-MM-DD format
      const today = new Date().toISOString().split('T')[0];

      // Find today's existing game for this word
      const { data: existingGame, error: gameErr } = await supabase
        .from('doodle_hunt_solo')
        .select('id, status, final_score, created_at')
        .eq('user_id', user.id)
        .eq('target_word', word)
        .gte('created_at', `${today}T00:00:00.000Z`)
        .lt('created_at', `${today}T23:59:59.999Z`)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (gameErr && gameErr.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error('Error checking for existing game:', gameErr);
        return false;
      }

      if (existingGame) {
        setGameId(existingGame.id);
        setGameWon(existingGame.status === 'won');
        setGameLost(existingGame.status === 'lost');
        await loadGameGuesses(existingGame.id);
        return true;
      } else {
        console.log('No existing game found for today\'s doodle hunt daily');
        return false;
      }
    } catch (error) {
      console.error('Error loading previous game:', error);
      return false;
    }
  };

  // Parse SVG paths from content (same as WordOfTheDayScreen)
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

  // Subscribe to doodle_hunt_daily changes for auto new game
  useEffect(() => {
    const channel = supabase
      .channel('doodle_hunt_daily_changes')
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'doodle_hunt_daily',
          filter: `date=eq.${new Date().toISOString().split('T')[0]}`
        }, 
        (payload) => {
          console.log('New daily word detected:', payload);
          startNewGameFromSubscription();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchRandomWord = async () => {
    try {
      setIsLoadingWord(true);
      setWordError(null);

      // Always get Doodle Hunt Daily word first (to get the category)
      const { data: dailyWord, error: dailyError } = await supabase.rpc('get_doodle_hunt_daily');

      if (dailyError || !dailyWord || dailyWord.length === 0) {
        console.error('Error fetching doodle hunt daily word:', dailyError);
        setWordError('Failed to load word');
        return;
      }

      const selectedWord = dailyWord[0]?.word;
      setSecretWord(selectedWord);

      // Check if there's already an active game
      const { data: activeGame, error } = await supabase
        .from('doodle_hunt_solo')
        .select('id, target_word, status, guesses_left, created_at')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .eq('status', 'in_progress')
        .single();

      if (activeGame && !error) {
        // Check if the game was created today
        const gameDate = new Date(activeGame.created_at).toISOString().split('T')[0];
        const today = new Date().toISOString().split('T')[0];
        
        console.log('📅 Date Check:', {
          gameDate,
          today,
          isToday: gameDate === today,
          activeGame: {
            id: activeGame.id,
            target_word: activeGame.target_word,
            created_at: activeGame.created_at,
            guesses_left: activeGame.guesses_left
          }
        });
        
        if (gameDate === today) {
          // Active game from today exists, load it
          console.log('✅ Active game from today found, loading existing game');
          setGameId(activeGame.id);
          setGuessesLeft(activeGame.guesses_left ?? 5);
          await loadGameGuesses(activeGame.id);
          return;
        } else {
          // Game is from a previous day, mark it as lost
          console.log('⚠️ Found in-progress game from previous day');
          console.log('🔄 Marking old game as lost...');
          
          const { error: updateError } = await supabase.rpc('complete_doodle_hunt_game', {
            game_uuid: activeGame.id,
            game_status: 'lost'
          });
          
          if (updateError) {
            console.error('❌ Error marking old game as lost:', updateError);
          } else {
            console.log('✅ Successfully marked old game as lost');
          }
          console.log('🆕 Continuing to create new game with today\'s word:', selectedWord);
          // Continue to create new game with today's word
        }
      }
      
      // Check if user has already completed today's doodle hunt daily
      const hasPrevious = await loadPreviousGame(selectedWord);
      
      // Only create a new game if no previous game was found
      if (!hasPrevious) {
        await createGame(selectedWord);
      }
      
    } catch (error) {
      console.error('Error in fetchRandomWord:', error);
      setWordError('Failed to load word');
    } finally {
      setIsLoadingWord(false);
    }
  };

  // Create display word with underscores (hangman style)
  useEffect(() => {
    if (secretWord) {
      const underscores = secretWord.split('').map(() => '_').join(' ');
      setDisplayWord(underscores);
    }
  }, [secretWord]);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => !gameWon && !gameLost,
    onMoveShouldSetPanResponder: () => !gameWon && !gameLost,
    onPanResponderGrant: (evt) => {
      // Don't allow drawing if game is completed
      if (gameWon || gameLost) return;
      const { locationX, locationY } = evt.nativeEvent;
      const newPoint = { x: locationX, y: locationY };
      setCurrentPoints([newPoint]);
      setIsDrawing(true);
      
      if (isEraseMode) {
        // When erasing, remove paths that are close to the touch point
        const eraseRadius = Math.max(15, brushSize * 2);
        setPaths(prev => prev.filter(pathData => {
          // Extract coordinates from the path
          const coordMatches = pathData.path.match(/\d+\.?\d*,\d+\.?\d*/g);
          if (!coordMatches) return true;
          
          // Check if any point in the path is close to the current touch point
          const hasClosePoint = coordMatches.some(coord => {
            const [x, y] = coord.split(',').map(Number);
            if (isNaN(x) || isNaN(y)) return false;
            
            const distance = Math.sqrt((x - locationX) ** 2 + (y - locationY) ** 2);
            return distance < eraseRadius;
          });
          
          return !hasClosePoint;
        }));
      } else {
        setCurrentPath(`M${newPoint.x},${newPoint.y}`);
      }
    },
    onPanResponderMove: (evt) => {
      if (!isDrawing) return;
      
      const { locationX, locationY } = evt.nativeEvent;
      const newPoint = { x: locationX, y: locationY };
      
      if (isEraseMode) {
        // Continue erasing as user moves
        const eraseRadius = Math.max(15, brushSize * 2);
        setPaths(prev => prev.filter(pathData => {
          const coordMatches = pathData.path.match(/\d+\.?\d*,\d+\.?\d*/g);
          if (!coordMatches) return true;
          
          const hasClosePoint = coordMatches.some(coord => {
            const [x, y] = coord.split(',').map(Number);
            if (isNaN(x) || isNaN(y)) return false;
            
            const distance = Math.sqrt((x - locationX) ** 2 + (y - locationY) ** 2);
            return distance < eraseRadius;
          });
          
          return !hasClosePoint;
        }));
      } else {
        setCurrentPath(prev => prev + ` L${newPoint.x},${newPoint.y}`);
        setCurrentPoints(prev => [...prev, newPoint]);
      }
    },
    onPanResponderRelease: () => {
      if (!isDrawing) return;
      
      if (!isEraseMode) {
        setPaths(prev => [...prev, { 
          path: currentPath, 
          color: brushColor, 
          strokeWidth: brushSize 
        }]);
        setCurrentPath('');
      }
      
      setIsDrawing(false);
      setCurrentPoints([]);
    },
  });

  const clearCanvas = () => {
    setPaths([]);
    setCurrentPath('');
    setCurrentPoints([]);
  };

  const undoLastStroke = () => {
    if (paths.length > 0) {
      setPaths(prev => prev.slice(0, -1));
    }
  };

  const checkForActiveGame = async () => {
    try {
      setIsLoadingWord(true);
      setWordError(null);

      // Check if user has an active game
      const { data: activeGame, error } = await supabase
        .from('doodle_hunt_solo')
        .select('id, target_word, status, guesses_left, created_at')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .eq('status', 'in_progress')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error('Error checking for active game:', error);
        // Continue to create new game
        await fetchRandomWord();
        return;
      }

      if (activeGame) {
        // Check if the game was created today
        const gameDate = new Date(activeGame.created_at).toISOString().split('T')[0];
        const today = new Date().toISOString().split('T')[0];
        
        console.log('📅 [checkForActiveGame] Date Check:', {
          gameDate,
          today,
          isToday: gameDate === today,
          activeGame: {
            id: activeGame.id,
            target_word: activeGame.target_word,
            created_at: activeGame.created_at,
            guesses_left: activeGame.guesses_left
          }
        });
        
        if (gameDate !== today) {
          // Game is from a previous day, mark it as lost
          console.log('⚠️ [checkForActiveGame] Found in-progress game from previous day');
          console.log('🔄 [checkForActiveGame] Marking old game as lost...');
          
          const { error: updateError } = await supabase.rpc('complete_doodle_hunt_game', {
            game_uuid: activeGame.id,
            game_status: 'lost'
          });
          
          if (updateError) {
            console.error('❌ [checkForActiveGame] Error marking old game as lost:', updateError);
          } else {
            console.log('✅ [checkForActiveGame] Successfully marked old game as lost');
          }
          
          // Fetch today's word and create new game
          console.log('🆕 [checkForActiveGame] Creating new game for today');
          await fetchRandomWord();
          return;
        }
        
        // Resume existing game from today
        console.log('✅ [checkForActiveGame] Resuming active game from today:', activeGame.id);
        console.log('Database guesses_left:', activeGame.guesses_left);
        setGameId(activeGame.id);
        setSecretWord(activeGame.target_word);
        // Ensure we set the exact value from database, not default to 5
        setGuessesLeft(activeGame.guesses_left ?? 5);
        console.log('Setting guessesLeft state to:', activeGame.guesses_left ?? 5);
        
        // Load previous guesses for this game
        await loadGameGuesses(activeGame.id);
        
        // Check if user has hit limits and show alert if needed
        // Use the actual guesses_left value from database, not the state
        if (activeGame.guesses_left === 0) {
          console.log('User has 0 guesses left, showing continue options');
          const userTokens = userInfo?.game_tokens || 0;
          
          // Show continue options based on user's token count
          if (userTokens >= 1) {
            // User has tokens - show token option first
            Alert.alert(
              'Keep Playing?', 
              `You've run out of guesses. You have ${userTokens} token${userTokens > 1 ? 's' : ''}. Use 1 token to continue, or watch an ad.`,
              [
                {
                  text: 'View Word (Loss)',
                  style: 'destructive',
                  onPress: async () => {
                    console.log('🏠 User chose to view word and accept loss');
                    setGameLost(true);
                    await completeGame('lost');
                  }
                },
                {
                  text: 'Use 1 Token',
                  onPress: async () => {
                    console.log('🪙 User chose to use 1 token');
                    const tokenUsed = await subtractToken();
                    if (tokenUsed) {
                      // Reset guesses_left in database
                      if (gameId) {
                        try {
                          const { error } = await supabase.rpc('reset_doodle_hunt_guesses_left', {
                            game_uuid: gameId
                          });
                          if (error) {
                            console.error('Error resetting guesses left:', error);
                          } else {
                            console.log('✅ Guesses left reset to 5 (token used)');
                            await fetchUpdatedGuessesLeft(); // Update from backend
                          }
                        } catch (error) {
                          console.error('Error calling reset function:', error);
                        }
                      }
                      console.log('✅ User can continue playing with 5 new guesses (token spent)');
                    } else {
                      Alert.alert('Error', 'Failed to use token. Please try again.');
                    }
                  }
                },
                {
                  text: 'Watch Ad Instead',
                  onPress: async () => {
                    console.log('🎬 User chose to watch ad');
                    const result = await showRewardedAd(async (rewarded) => {
                      console.log('🎁 Reward callback triggered, rewarded:', rewarded);
                      if (rewarded) {
                        console.log('🎉 User earned reward');
                        // Reset guesses_left in database
                        if (gameId) {
                          try {
                            const { error } = await supabase.rpc('reset_doodle_hunt_guesses_left', {
                              game_uuid: gameId
                            });
                            if (error) {
                              console.error('Error resetting guesses left:', error);
                            } else {
                              console.log('✅ Guesses left reset to 5 (ad watched)');
                              await fetchUpdatedGuessesLeft(); // Update from backend
                            }
                          } catch (error) {
                            console.error('Error calling reset function:', error);
                          }
                        }
                        console.log('✅ User can continue playing with 5 new guesses (ad watched)');
                        return true;
                      } else {
                        console.log('❌ No reward earned, but allowing user to continue');
                        // Still reset guesses even if ad didn't reward properly
                        if (gameId) {
                          try {
                            const { error } = await supabase.rpc('reset_doodle_hunt_guesses_left', {
                              game_uuid: gameId
                            });
                            if (!error) {
                              await fetchUpdatedGuessesLeft();
                            }
                          } catch (error) {
                            console.error('Error calling reset function:', error);
                          }
                        }
                        return true;
                      }
                    });
                    
                    console.log('📊 Ad result:', result);
                    if (!result.success) {
                      console.log('Ad not ready, allowing user to continue anyway');
                    }
                  }
                }
              ]
            );
          } else {
            // User has no tokens - show ad option only
            Alert.alert(
              'Keep Playing?', 
              'You\'ve run out of guesses and have no tokens. Watch an ad to continue playing.',
              [
                {
                  text: 'View Word (Loss)',
                  style: 'destructive',
                  onPress: async () => {
                    console.log('🏠 User chose to view word and accept loss');
                    setGameLost(true);
                    await completeGame('lost');
                  }
                },
                {
                  text: 'Watch Ad',
                  onPress: async () => {
                    console.log('🎬 User chose to watch ad');
                    const result = await showRewardedAd(async (rewarded) => {
                      console.log('🎁 Reward callback triggered, rewarded:', rewarded);
                      if (rewarded) {
                        console.log('🎉 User earned reward');
                        // Reset guesses_left in database
                        if (gameId) {
                          try {
                            const { error } = await supabase.rpc('reset_doodle_hunt_guesses_left', {
                              game_uuid: gameId
                            });
                            if (error) {
                              console.error('Error resetting guesses left:', error);
                            } else {
                              console.log('✅ Guesses left reset to 5 (ad watched)');
                              await fetchUpdatedGuessesLeft(); // Update from backend
                            }
                          } catch (error) {
                            console.error('Error calling reset function:', error);
                          }
                        }
                        console.log('✅ User can continue playing with 5 new guesses (ad watched)');
                        return true;
                      } else {
                        console.log('❌ No reward earned, but allowing user to continue');
                        // Still reset guesses even if ad didn't reward properly
                        if (gameId) {
                          try {
                            const { error } = await supabase.rpc('reset_doodle_hunt_guesses_left', {
                              game_uuid: gameId
                            });
                            if (!error) {
                              await fetchUpdatedGuessesLeft();
                            }
                          } catch (error) {
                            console.error('Error calling reset function:', error);
                          }
                        }
                        return true;
                      }
                    });
                    
                    console.log('📊 Ad result:', result);
                    if (!result.success) {
                      console.log('Ad not ready, allowing user to continue anyway');
                    }
                  }
                }
              ]
            );
          }
        }
      } else {
        // No active game, create new one
        console.log('No active game found, creating new game');
        await fetchRandomWord();
      }
    } catch (error) {
      console.error('Error in checkForActiveGame:', error);
      // Fallback to creating new game
      await fetchRandomWord();
    } finally {
      setIsLoadingWord(false);
    }
  };

  const loadGameGuesses = async (gameUuid: string) => {
    try {
      const { data: guesses, error } = await supabase
        .from('guesses')
        .select('id, guess_number, ai_guess_word, similarity_score, hint, hint_used')
        .eq('game_id', gameUuid)
        .order('guess_number', { ascending: true });

      if (error) {
        console.error('Error loading guesses:', error);
        return;
      }

      if (guesses && guesses.length > 0) {
        // Set the attempts count
        setAttempts(guesses.length);
        
        // Set previous attempts
        const previousAttemptsData = guesses.map(guess => ({
          guess: guess.ai_guess_word,
          score: guess.similarity_score,
          hint: guess.hint || '',
          hintUsed: guess.hint_used || false,
          guessId: guess.id
        }));
        setPreviousAttempts(previousAttemptsData);

        // Set the latest guess as current
        const latestGuess = guesses[guesses.length - 1];
        setAiGuess(latestGuess.ai_guess_word);
        setSimilarityScore(latestGuess.similarity_score);

        // Check if game should be completed
        if (latestGuess.similarity_score >= 100) {
          setGameWon(true);
          // Note: Ad won't show here since game was already completed
        }
      }
    } catch (error) {
      console.error('Error in loadGameGuesses:', error);
    }
  };

  const createGame = async (targetWord: string) => {
    try {
      const { data: newGameId, error } = await supabase.rpc('create_doodle_hunt_game', {
        target_word_text: targetWord,
        word_category: null
      });

      if (error) {
        console.error('Error creating game:', error);
        // Continue without database tracking
        return;
      }

      setGameId(newGameId);
      console.log('Game created with ID:', newGameId);
    } catch (error) {
      console.error('Error in createGame:', error);
      // Continue without database tracking
    }
  };

  const addGuessToDatabase = async (guess: string, score: number, hint: string) => {
    if (!gameId) return null;

    try {
      // Add guess to guesses table
      const { data: guessId, error } = await supabase.rpc('add_doodle_hunt_guess', {
        game_uuid: gameId,
        guess_num: attempts + 1,
        target_word_text: secretWord,
        ai_guess_text: guess,
        similarity_num: score,
        hint_text: hint
      });

      if (error) {
        console.error('Error adding guess:', error);
        return null;
      }

      console.log('Guess added with ID:', guessId);
      return guessId;
    } catch (error) {
      console.error('Error in addGuessToDatabase:', error);
      return null;
    }
  };

  const fetchUpdatedGuessesLeft = async () => {
    if (!gameId) return;

    try {
      const { data: gameData, error } = await supabase
        .from('doodle_hunt_solo')
        .select('guesses_left')
        .eq('id', gameId)
        .single();

      if (error) {
        console.error('Error fetching guesses left:', error);
        return;
      }

      if (gameData) {
        setGuessesLeft(gameData.guesses_left);
        console.log('Updated guesses left from backend:', gameData.guesses_left);
      }
    } catch (error) {
      console.error('Error in fetchUpdatedGuessesLeft:', error);
    }
  };

  const completeGame = async (status: 'won' | 'lost') => {
    if (!gameId) return;

    try {
      const { error } = await supabase.rpc('complete_doodle_hunt_game', {
        game_uuid: gameId,
        game_status: status
      });

      if (error) {
        console.error('Error completing game:', error);
        return;
      }

      console.log('Game completed with status:', status);
      
      // Award XP for loss (XP for wins is awarded separately)
      if (status === 'lost') {
        const xpResult = await xpService.awardDoodleHuntXP(false, attempts, currentStreak, dispatch);
        
        if (xpResult && xpResult.xp_earned > 0) {
          // Show a small toast or console log for loss XP
          console.log(`Earned ${xpResult.xp_earned} XP for playing!`);
        }
      }
    } catch (error) {
      console.error('Error in completeGame:', error);
    }
  };

  const generateProgressBar = (score: number): string => {
    // Generate 10 blocks for the progress bar
    const filledBlocks = Math.floor(score / 10);
    const emptyBlocks = 10 - filledBlocks;
    
    // Determine color based on score
    let colorBlock = '🟥'; // Red for 0-49%
    if (score >= 80) colorBlock = '🟩'; // Green for 80-100%
    else if (score >= 50) colorBlock = '🟨'; // Yellow for 50-79%
    
    return colorBlock.repeat(filledBlocks) + '⬜'.repeat(emptyBlocks);
  };

  const generateShareText = (): string => {
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const totalGuesses = previousAttempts.length;
    const scores = previousAttempts.map(a => a.score);
    const bestScore = Math.max(...scores);
    const isWon = gameWon && bestScore === 100;
    
    let shareText = `🎨 Doodle Hunt Daily - ${today}\n\n`;
    
    if (isWon) {
      shareText += `🏆 SOLVED in ${totalGuesses} guess${totalGuesses === 1 ? '' : 'es'}!\n\n`;
    } else if (bestScore >= 80) {
      shareText += `So close! Best: ${bestScore}% 😩\n\n`;
    } else {
      shareText += `😔 Didn't get it - Best: ${bestScore}%\n\n`;
    }
    
    // Add progress bars for each guess
    previousAttempts.forEach(attempt => {
      const bar = generateProgressBar(attempt.score);
      const emoji = attempt.score === 100 ? '✨' : '';
      shareText += `${bar}${emoji}\n`;
    });
    
    shareText += `\n`;
    
    if (isWon) {
      shareText += `Can you beat it?`;
    } else {
      shareText += `Can you solve it?`;
    }
    
    return shareText;
  };

  const handleShare = async () => {
    try {
      const shareText = generateShareText();
      
      await Share.share({
        message: shareText,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const unlockHint = async (guessId: string) => {
    if (!gameId || !guessId) return false;

    try {
      const { data, error } = await supabase.rpc('unlock_hint_with_token', {
        game_uuid: gameId,
        guess_id: guessId
      });

      if (error) {
        console.error('Error unlocking hint:', error);
        Alert.alert('Error', 'Failed to unlock hint. You may not have enough tokens or the hint is already unlocked.');
        return false;
      }

      // Find the hint text to show in alert
      const targetAttempt = previousAttempts.find(attempt => attempt.guessId === guessId);
      const hintToShow = targetAttempt?.hint || 'No hint available';

      // Update the hint_used status in local state
      setPreviousAttempts(prev => prev.map(attempt => 
        attempt.guessId === guessId 
          ? { ...attempt, hintUsed: true }
          : attempt
      ));

      // Update user tokens in Redux store
      if (userInfo) {
        dispatch(setUserInfo({
          ...userInfo,
          game_tokens: (userInfo.game_tokens || 2) - 2
        }));
      }

      // Show hint in alert
      Alert.alert('Hint Unlocked!', `💡 ${hintToShow}`);

      console.log('Hint unlocked successfully');
      return true;
    } catch (error) {
      console.error('Error in unlockHint:', error);
      return false;
    }
  };

  const submitDrawing = async () => {
    if (paths.length === 0 && !currentPath) {
      Alert.alert('No Drawing', 'Please draw something before submitting!');
      return;
    }

    setIsSubmitting(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to submit a drawing.');
        return;
      }

      // Compress the canvas to base64 using centralized compression utility
      const base64 = await compressImageToBase64(canvasRef);

      // Get the current session for authorization
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Error', 'You must be logged in to analyze your drawing.');
        return;
      }

      // Call the AI guessing function
      const guessResponse = await fetch("https://qxqduzzqcivosdauqpis.functions.supabase.co/guess-drawing", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          pngBase64: base64,
          targetWord: secretWord
        })
      });

      if (!guessResponse.ok) {
        console.error('AI Guess API error:', guessResponse.status, guessResponse.statusText);
        Alert.alert('Error', 'Failed to analyze your drawing. Please try again.');
        return;
      }

      const responseText = await guessResponse.text();
      let guessData;
      
      try {
        guessData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse AI response:', parseError);
        console.log('Raw response:', responseText);
        Alert.alert('Error', 'Failed to parse AI response. Please try again.');
        return;
      }

      // Handle the AI response
      const aiGuess = guessData.guess || guessData.word || 'unknown';
      const similarityScore = guessData.similarity || guessData.score || 0;
      const hint = guessData.hint || '';
      
      handleGuessResult(aiGuess, similarityScore, hint);
      
    } catch (error) {
      console.error('Error submitting drawing:', error);
      Alert.alert('Error', 'Failed to submit drawing. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGuessResult = async (guess: string, score: number, hint: string) => {
    setAiGuess(guess);
    setSimilarityScore(score);
    
    // Add to previous attempts with temporary guessId (will be updated after database call)
    const tempGuessId = `temp_${Date.now()}`;
    setPreviousAttempts(prev => [...prev, { guess, score, hint, hintUsed: false, guessId: tempGuessId }]);
    
    // Check if this will be the last guess before adding to database
    const willBeLastGuess = guessesLeft <= 1;
    
    // Add guess to database (this will decrement guesses_left in the database)
    const dbGuessId = await addGuessToDatabase(guess, score, hint);
    
    // Update the previous attempts with the real database ID
    if (dbGuessId) {
      setPreviousAttempts(prev => prev.map(attempt => 
        attempt.guessId === tempGuessId 
          ? { ...attempt, guessId: dbGuessId }
          : attempt
      ));
    }
    
    // Fetch updated guesses_left from backend
    await fetchUpdatedGuessesLeft();
    
    // Check if won first (takes priority over guesses left)
    if (score >= 100) {
      setGameWon(true);
      await completeGame('won');
      
      // Update streak for winning today
      await updateStreak();
      
      // Award XP with streak bonus
      const xpResult = await xpService.awardDoodleHuntXP(true, attempts + 1, currentStreak, dispatch);
      
      let xpMessage = '';
      if (xpResult) {
        xpMessage = `\n\n+${xpResult.xp_earned} XP`;
        if (xpResult.bonusXP && xpResult.bonusXP > 0) {
          xpMessage += ` (${xpResult.baseXP} base + ${xpResult.bonusXP} streak bonus!)`;
        }
        if (xpResult.leveled_up) {
          xpMessage += `\n🎉 Level Up! Now Level ${xpResult.new_level}!`;
        }
        if (xpResult.tier_up) {
          xpMessage += `\n🏆 TIER UP! You reached a new tier!`;
        }
        // Track XP state for banner
        setXpEarned(xpResult.xp_earned || 0);
        setLeveledUp(!!xpResult.leveled_up);
        setNewLevel(xpResult.new_level || 0);
      }
      
      // Show success message
      Alert.alert(
        'Congratulations!', 
        `You won! The word was "${secretWord}". Your drawing scored ${score}%!${xpMessage}`,
        [
          {
            text: 'Continue',
            onPress: () => {
              console.log('🎉 Doodle Hunt: Game completed successfully');
            }
          }
        ]
      );
    } else {
      setAttempts(prev => prev + 1);
      
      // Check if this was the last guess (only if they didn't win)
      if (willBeLastGuess) {
        const userTokens = userInfo?.game_tokens || 0;
        
        // Show continue options based on user's token count
        if (userTokens >= 1) {
          // User has tokens - show token option first
          Alert.alert(
            'Keep Playing?', 
            `You've run out of guesses. You have ${userTokens} token${userTokens > 1 ? 's' : ''}. Use 1 token to continue, or watch an ad.`,
            [
              {
                text: 'View Word (Loss)',
                style: 'destructive',
                onPress: async () => {
                  console.log('🏠 User chose to view word and accept loss');
                  setGameLost(true);
                  await completeGame('lost');
                }
              },
              {
                text: 'Use 1 Token',
                onPress: async () => {
                  console.log('🪙 User chose to use 1 token');
                  const tokenUsed = await subtractToken();
                  if (tokenUsed) {
                    // Reset guesses_left in database
                    if (gameId) {
                      try {
                        const { error } = await supabase.rpc('reset_doodle_hunt_guesses_left', {
                          game_uuid: gameId
                        });
                        if (error) {
                          console.error('Error resetting guesses left:', error);
                        } else {
                          console.log('✅ Guesses left reset to 5 (token used)');
                          await fetchUpdatedGuessesLeft(); // Update from backend
                        }
                      } catch (error) {
                        console.error('Error calling reset function:', error);
                      }
                    }
                    console.log('✅ User can continue playing with 5 new guesses (token spent)');
                  } else {
                    Alert.alert('Error', 'Failed to use token. Please try again.');
                  }
                }
              },
              {
                text: 'Watch Ad Instead',
                onPress: async () => {
                  console.log('🎬 User chose to watch ad instead of using token');
                  const result = await showRewardedAd(async (rewarded) => {
                    console.log('🎁 Doodle Hunt: Reward callback triggered, rewarded:', rewarded);
                    if (rewarded) {
                      console.log('🎉 Doodle Hunt: User earned reward');
                      
                      // Reset guesses_left in database
                      if (gameId) {
                        try {
                          const { error } = await supabase.rpc('reset_doodle_hunt_guesses_left', {
                            game_uuid: gameId
                          });
                          if (error) {
                            console.error('Error resetting guesses left:', error);
                          } else {
                            console.log('✅ Guesses left reset to 5');
                            await fetchUpdatedGuessesLeft(); // Update from backend
                          }
                        } catch (error) {
                          console.error('Error calling reset function:', error);
                        }
                      }
                      
                      // No alert - user already knows they can continue playing
                      console.log('✅ User can continue playing with 5 new guesses');
                    } else {
                      console.log('❌ Doodle Hunt: No reward earned, but allowing user to continue');
                      // Still reset guesses_left even if ad didn't reward properly
                      if (gameId) {
                        try {
                          const { error } = await supabase.rpc('reset_doodle_hunt_guesses_left', {
                            game_uuid: gameId
                          });
                          if (!error) {
                            await fetchUpdatedGuessesLeft(); // Update from backend
                            console.log('✅ Guesses left reset to 5 (no reward)');
                          }
                        } catch (error) {
                          console.error('Error calling reset function:', error);
                        }
                      }
                    }
                  });
                  
                  console.log('📊 Doodle Hunt: Ad result:', result);
                  if (!result.success) {
                    console.log('Ad not ready, allowing user to continue anyway');
                  }
                }
              }
            ]
          );
        } else {
          // User has no tokens - show ad option only
          Alert.alert(
            'Keep Playing?', 
            `You've run out of guesses. Watch an ad to continue playing, or view the word and accept the loss.`,
            [
              {
                text: 'View Word (Loss)',
                style: 'destructive',
                onPress: async () => {
                  console.log('🏠 User chose to view word and accept loss');
                  setGameLost(true);
                  await completeGame('lost');
                }
              },
              {
                text: 'Watch Ad to Keep Guessing',
                onPress: async () => {
                  console.log('🎬 User chose to watch ad and continue');
                  const result = await showRewardedAd(async (rewarded) => {
                    console.log('🎁 Doodle Hunt: Reward callback triggered, rewarded:', rewarded);
                    if (rewarded) {
                      console.log('🎉 Doodle Hunt: User earned reward');
                      
                      // Reset guesses_left in database
                      if (gameId) {
                        try {
                          const { error } = await supabase.rpc('reset_doodle_hunt_guesses_left', {
                            game_uuid: gameId
                          });
                          if (error) {
                            console.error('Error resetting guesses left:', error);
                          } else {
                            console.log('✅ Guesses left reset to 5');
                            await fetchUpdatedGuessesLeft(); // Update from backend
                          }
                        } catch (error) {
                          console.error('Error calling reset function:', error);
                        }
                      }
                      
                      // No alert - user already knows they can continue playing
                      console.log('✅ User can continue playing with 5 new guesses');
                    } else {
                      console.log('❌ Doodle Hunt: No reward earned, but allowing user to continue');
                      // Still reset guesses_left even if ad didn't reward properly
                      if (gameId) {
                        try {
                          const { error } = await supabase.rpc('reset_doodle_hunt_guesses_left', {
                            game_uuid: gameId
                          });
                          if (!error) {
                            await fetchUpdatedGuessesLeft(); // Update from backend
                            console.log('✅ Guesses left reset to 5 (no reward)');
                          }
                        } catch (error) {
                          console.error('Error calling reset function:', error);
                        }
                      }
                    }
                  });
                  
                  console.log('📊 Doodle Hunt: Ad result:', result);
                  if (!result.success) {
                    console.log('Ad not ready, allowing user to continue anyway');
                  }
                }
              }
            ]
          );
        }
      } else {
        Alert.alert(
          'AI Feedback', 
          `AI guessed: "${guess}"\nSimilarity: ${score}%\n\nTry again!`
        );
      }
    }

    // Clear canvas for next attempt
    clearCanvas();
  };



  // Auto-start new game when daily word changes
  const startNewGameFromSubscription = async () => {
    // Only start new game if user is not actively drawing
    if (isDrawing || isSubmitting) {
      console.log('User is actively drawing, deferring new game');
      return;
    }

    // Complete the current game if it exists
    if (gameId) {
      await completeGame('lost');
    }
    
    // Reset all game state
    setSecretWord('');
    setDisplayWord('');
    setAttempts(0);
    setGuessesLeft(5);
    setGameWon(false);
    setGameLost(false);
    setAiGuess('');
    setSimilarityScore(0);
    setPreviousAttempts([]);
    setGameId(null);
    clearCanvas();
    
    // Create a new game with fresh daily word
    await fetchRandomWord();
  };

  if (isLoadingWord) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading word...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (wordError) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{wordError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchRandomWord}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🔍 Doodle Hunt</Text>
        {!gameWon && !gameLost && (
          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={submitDrawing}
            disabled={isSubmitting}
          >
            <Text style={styles.submitButtonText}>
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </Text>
          </TouchableOpacity>
        )}
      </View>


      <View style={styles.gameInfo}>
        {/* Hint Button - Absolutely positioned */}
        <TouchableOpacity 
          style={styles.hintButtonTop}
          onPress={() => {
            if (previousAttempts.length === 0) {
              Alert.alert('No Guess', 'Make a guess first to unlock hints.');
              return;
            }

            // Find the most recent guess with an unused hint
            // Start from the most recent and work backwards
            let targetGuess = null;
            for (let i = previousAttempts.length - 1; i >= 0; i--) {
              const guess = previousAttempts[i];
              if (guess.guessId && !guess.hintUsed && guess.hint) {
                targetGuess = guess;
                break;
              }
            }

            if (!targetGuess) {
              Alert.alert('No Hints Available', 'Make another guess to unlock hints.');
              return;
            }

            const userTokens = userInfo?.game_tokens || 0;
            if (userTokens >= 2) {
              Alert.alert(
                'Get Hint',
                'Would you like to get a hint for 2 tokens?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: 'Get Hint', 
                    onPress: () => unlockHint(targetGuess.guessId!)
                  }
                ]
              );
            } else {
              Alert.alert(
                'No Tokens',
                'You need at least 2 tokens to get hints. Watch an ad to earn 1 token?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Watch Ad',
                    onPress: async () => {
                      console.log('🎬 User chose to watch ad for token');
                      const result = await showRewardedAd(async (rewarded) => {
                        console.log('🎁 Token: Reward callback triggered, rewarded:', rewarded);
                        if (rewarded) {
                          console.log('🎉 Token: User earned reward');
                          
                          // Add 1 token to user's profile
                          try {
                            const { error } = await supabase.rpc('add_user_token', {
                              token_amount: 1
                            });

                            if (error) {
                              console.error('Error adding token:', error);
                              Alert.alert('Error', 'Failed to add token. Please try again.');
                              return false;
                            }

                            // Update user tokens in Redux store
                            if (userInfo) {
                              const newTokenCount = (userInfo.game_tokens || 0) + 1;
                              dispatch(setUserInfo({
                                ...userInfo,
                                game_tokens: newTokenCount
                              }));

                              // Show appropriate message based on new token count
                              if (newTokenCount >= 2) {
                                Alert.alert('Token Earned!', 'You earned 1 token! Now you can unlock hints for 2 tokens.');
                              } else {
                                Alert.alert('Token Earned!', `You earned 1 token! You now have ${newTokenCount} token. Earn 1 more to unlock hints.`);
                              }
                            } else {
                              Alert.alert('Token Earned!', 'You earned 1 token!');
                            }
                            console.log('✅ Token added successfully via ad');
                            return true;
                          } catch (error) {
                            console.error('Error in addToken:', error);
                            Alert.alert('Error', 'Failed to add token. Please try again.');
                            return false;
                          }
                        } else {
                          console.log('❌ Token: No reward earned');
                          Alert.alert('No Reward', 'You did not earn a token. Please try again.');
                          return false;
                        }
                      });
                      
                      console.log('📊 Token: Ad result:', result);
                      if (!result.success) {
                        console.log('Ad not ready');
                        Alert.alert('Ad Not Ready', 'The ad is not ready to play. Please try again later.');
                      }
                    }
                  }
                ]
              );
            }
          }}
        >
          <Text style={styles.hintButtonIcon}>💡</Text>
          <Text style={styles.hintButtonLabel}>Hint</Text>
        </TouchableOpacity>

        {/* Word Display */}
        <View style={styles.wordRow}>
          {secretWord.split('').map((ch, idx) => (
            ch === ' ' ? (
              <View key={idx} style={styles.spaceCell} />
            ) : (
              <View key={idx} style={styles.charCell}>
                <Text style={[
                  styles.charLetter,
                  (gameWon || gameLost) ? styles.charLetterVisible : styles.charLetterHidden
                ]}>
                  {ch.toUpperCase()}
                </Text>
                <View style={styles.charUnderline} />
              </View>
            )
          ))}
        </View>
        <Text style={styles.attemptsText}>Guesses Left: {guessesLeft}</Text>
      </View>

      {/* Current AI Guess - Small display above canvas */}
      {aiGuess && (
        <View style={styles.currentGuessSmall}>
          <Text style={styles.guessTextSmall}>AI: "{aiGuess}" ({similarityScore}%)</Text>
        </View>
      )}

      {/* Completion Message */}
      {gameWon && (
        <XPBanner xpEarned={xpEarned} leveledUp={leveledUp} newLevel={newLevel} />
      )}

      {gameLost && (
        <View style={styles.completionContainer}>
          <Text style={styles.completionMessage}>
            😔 Game Over! The word was "{secretWord}". Better luck next time!
          </Text>
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Text style={styles.shareButtonText}>📤 Share Results</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Only show canvas when game is not completed */}
      {!gameWon && !gameLost && (
        <View style={styles.canvasContainer}>
          <View
            ref={canvasRef}
            style={styles.canvas}
            {...panResponder.panHandlers}
          >
            <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject}>
              {paths.map((pathData, index) => (
                <Path
                  key={index}
                  d={pathData.path}
                  stroke={pathData.color}
                  strokeWidth={pathData.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              ))}
              {currentPath && (
                <Path
                  d={currentPath}
                  stroke={brushColor}
                  strokeWidth={brushSize}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              )}
            </Svg>
          </View>
        </View>
      )}

      <ScrollView style={[
        styles.scrollContainer,
        (gameWon || gameLost) && styles.scrollContainerExpanded
      ]} showsVerticalScrollIndicator={false}>
        {/* Previous Attempts Section */}
        {previousAttempts.length > 0 && (
          <View style={styles.guessesSection}>
            <Text style={styles.guessesTitle}>Previous Attempts</Text>
            
            <View style={styles.previousGuesses}>
              {previousAttempts
                .sort((a, b) => b.score - a.score) // Sort by score descending
                .map((attempt, index) => {
                  // Five-level color coding: red, orange, yellow, green, blue(100%)
                  let barColor = '#E57373'; // dull red
                  if (attempt.score === 100) {
                    barColor = '#64B5F6'; // dull blue for 100%
                  } else if (attempt.score >= 80) {
                    barColor = '#81C784'; // dull green
                  } else if (attempt.score >= 60) {
                    barColor = '#FFE082'; // dull yellow (amber)
                  } else if (attempt.score >= 40) {
                    barColor = '#FFB74D'; // dull orange
                  }
                  
                  return (
                    <View key={index} style={styles.guessItem}>
                      <View style={styles.progressBarContainer}>
                        <View style={[styles.progressBar, { 
                          width: `${attempt.score}%`,
                          backgroundColor: barColor 
                        }]} />
                        <View style={styles.guessContentInside}>
                          <Text style={styles.guessWordInside}>{attempt.guess}</Text>
                          {attempt.hint && attempt.hintUsed && (
                            <Text style={styles.hintInside}>{attempt.hint}</Text>
                          )}
                        </View>
                        
                        {/* Centered unlock hint button */}
                        {attempt.hint && !attempt.hintUsed && attempt.guessId && (
                          <TouchableOpacity 
                            style={styles.unlockHintButtonCenter}
                            onPress={async () => {
                              const userTokens = userInfo?.game_tokens || 0;
                              if (userTokens >= 2) {
                                Alert.alert(
                                  'Unlock Hint',
                                  'Use 2 tokens to unlock this hint?',
                                  [
                                    { text: 'Cancel', style: 'cancel' },
                                    { 
                                      text: 'Unlock', 
                                      onPress: () => unlockHint(attempt.guessId!)
                                    }
                                  ]
                                );
                              } else {
                                Alert.alert('No Tokens', 'You need at least 2 tokens to unlock hints.');
                              }
                            }}
                          >
                            <Text style={styles.unlockHintIcon}>💡</Text>
                            <Text style={styles.unlockHintTextCenter}>Hint</Text>
                          </TouchableOpacity>
                        )}
                        
                        <Text style={styles.guessScoreOutside}>{attempt.score}%</Text>
                      </View>
                    </View>
                  );
                })}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Side Controls Panel - Only show when game is not completed */}
      {!gameWon && !gameLost && (
        <Animated.View 
          style={[
            styles.controlsContainer,
            {
              transform: [{
                translateX: slideAnimation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [200, 0], // Slide from off-screen (200px) to visible (0px)
                })
              }],
            }
          ]}
        >
        {/* Toggle Button - Moves with panel */}
        <TouchableOpacity
          style={styles.controlsToggle}
          onPress={() => {
            const newExpanded = !isControlsExpanded;
            setIsControlsExpanded(newExpanded);
            
            Animated.timing(slideAnimation, {
              toValue: newExpanded ? 1 : 0,
              duration: 300,
              useNativeDriver: false,
            }).start();
          }}
        >
          <Text style={styles.controlsToggleText}>
            {isControlsExpanded ? '✕' : '🎨'}
          </Text>
        </TouchableOpacity>
        
        {/* Tools Panel */}
        <View style={styles.sideControls}>
          <DrawingToolsPalette
            brushColor={brushColor}
            onColorChange={setBrushColor}
            brushSize={brushSize}
            onSizeChange={setBrushSize}
            isEraseMode={isEraseMode}
            onToggleEraseMode={() => setIsEraseMode(!isEraseMode)}
            onUndo={undoLastStroke}
            onClear={clearCanvas}
            disabled={gameWon || gameLost}
          />
        </View>
      </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContainer: {
    maxHeight: 200,
  },
  scrollContainerExpanded: {
    maxHeight: undefined,
    flex: 1,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
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
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    fontFamily: 'Nunito_700Bold',
  },
  gameInfo: {
    padding: 20,
    alignItems: 'center',
    position: 'relative',
  },
  hintButtonTop: {
    position: 'absolute',
    left: 20,
    top: 10,
    alignItems: 'center',
    backgroundColor: '#FFA500',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
    zIndex: 10,
  },
  hintButtonIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  hintButtonLabel: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  wordDisplay: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    letterSpacing: 2,
    marginBottom: 10,
    textAlign: 'center',
    fontFamily: 'Nunito_700Bold',
  },
  wordRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginTop: 6,
    marginBottom: 6,
  },
  charCell: {
    width: 18,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  spaceCell: {
    width: 18,
    marginHorizontal: 2,
  },
  charLetter: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  charLetterHidden: {
    opacity: 0,
  },
  charLetterVisible: {
    opacity: 1,
    color: '#333',
  },
  charUnderline: {
    marginTop: 2,
    width: '100%',
    height: 2,
    backgroundColor: '#333',
    borderRadius: 1,
  },
  secretWordText: {
    fontSize: 16,
    color: '#FF6B35',
    marginBottom: 10,
    textAlign: 'center',
    fontWeight: '600',
  },
  attemptsText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
    fontFamily: 'Nunito_600SemiBold',
  },
  feedbackText: {
    fontSize: 14,
    color: '#007AFF',
    textAlign: 'center',
  },
  previousAttempts: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  previousAttemptsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  previousAttemptText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  canvasContainer: {
    width: screenWidth - 40,
    height: screenWidth - 100,
    alignSelf: 'center',
    marginHorizontal: 20,
    marginTop: 0,
    marginBottom: 20,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  canvas: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  guessesSection: {
    padding: 20,
    backgroundColor: '#F8F9FA',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  guessesTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  currentGuessSmall: {
    backgroundColor: '#F0F0F0',
    padding: 8,
    borderRadius: 6,
    marginHorizontal: 20,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  guessTextSmall: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontWeight: '500',
  },
  currentGuess: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  guessText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 5,
    textAlign: 'center',
  },
  similarityText: {
    fontSize: 14,
    color: '#007AFF',
    textAlign: 'center',
    fontWeight: '600',
  },
  previousGuesses: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  previousGuessesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  bestScoreContainer: {
    backgroundColor: '#E8F5E8',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  bestScoreText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E7D32',
    textAlign: 'center',
  },
  guessItem: {
    marginBottom: 2,
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
    backgroundColor: '#4CAF50',
    borderRadius: 4,
    justifyContent: 'center',
    paddingLeft: 8,
  },
  guessContentInside: {
    position: 'absolute',
    left: 8,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    width: '70%', // Leave space for score on the right
  },
  guessWordInside: {
    fontSize: 14,
    color: '#000',
    fontWeight: '700',
    fontFamily: 'Nunito_700Bold',
    lineHeight: 16,
  },
  guessScoreOutside: {
    position: 'absolute',
    right: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  hintInside: {
    fontSize: 11,
    color: '#333',
    fontStyle: 'italic',
    marginTop: 3,
    lineHeight: 14,
    alignSelf: 'flex-start',
    maxWidth: '90%',
  },
  unlockHintButtonCenter: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: [{ translateX: -25 }, { translateY: -15 }],
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  unlockHintIcon: {
    fontSize: 12,
    marginRight: 2,
  },
  unlockHintTextCenter: {
    fontSize: 10,
    color: '#333',
    fontWeight: '600',
  },
  // Controls Container
  controlsContainer: {
    position: 'absolute',
    right: 0,
    top: '50%',
    marginTop: -100,
    zIndex: 1000,
    flexDirection: 'row',
  },
  // Side Controls Panel
  sideControls: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 15,
    borderBottomLeftRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    width: 200, // Fixed width for the expanded panel
  },
  sideControlsExpanded: {
    width: 200,
  },
  controlsToggle: {
    width: 50,
    height: 50,
    backgroundColor: '#007AFF',
    borderTopLeftRadius: 15,
    borderBottomLeftRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlsToggleText: {
    fontSize: 20,
  },
  controlsContent: {
    padding: 15,
    width: 200,
  },
  controlLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 10,
  },
  colorControls: {
    marginBottom: 15,
  },
  colorRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  colorButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  selectedColor: {
    borderColor: '#007AFF',
    borderWidth: 3,
  },
  disabledControl: {
    opacity: 0.5,
  },
  sizeControls: {
    marginBottom: 15,
  },
  sizeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginVertical: 2,
    borderRadius: 6,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  selectedSize: {
    backgroundColor: '#007AFF',
  },
  sizeButtonText: {
    fontSize: 12,
    color: '#333',
  },
  actionControls: {
    marginBottom: 15,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  selectedAction: {
    backgroundColor: '#FF3B30',
  },
  actionButtonText: {
    fontSize: 12,
    color: '#333',
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  completionContainer: {
    backgroundColor: '#E8F5E8',
    padding: 8,
    marginHorizontal: 20,
    marginBottom: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  completionMessage: {
    fontSize: 12,
    color: '#2E7D32',
    textAlign: 'center',
    fontWeight: '500',
    fontFamily: 'Nunito_600SemiBold',
  },
  shareButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 12,
    alignSelf: 'center',
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Nunito_700Bold',
  },
});
