import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, GestureResponderEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../SUPABASE/supabaseConfig';
import { compressImageToBase64 } from '../utils/imageCompression';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface DoodleHuntFriendRouteParams {
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
  isChallenger: boolean;
}

export default function DoodleHuntFriend() {
  const navigation = useNavigation();
  const route = useRoute();
  const canvasRef = useRef<View>(null);
  
  const { duelId } = route.params as DoodleHuntFriendRouteParams;
  
  // Animation state
  const slideAnimation = useRef(new Animated.Value(0)).current;
  
  // Duel data state
  const [duelData, setDuelData] = useState<DuelData | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Game state
  const [attempts, setAttempts] = useState(0);
  const [maxAttempts] = useState(5);
  const [gameWon, setGameWon] = useState(false);
  const [gameLost, setGameLost] = useState(false);
  const [aiGuess, setAiGuess] = useState<string>('');
  const [similarityScore, setSimilarityScore] = useState<number>(0);
  const [previousAttempts, setPreviousAttempts] = useState<Array<{guess: string, score: number}>>([]);
  const [gameId, setGameId] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('');
  const [turnHistory, setTurnHistory] = useState<Array<{ turnNumber: number; username: string; aiGuess: string; similarity: number; wasCorrect: boolean }>>([]);
  const [showHint, setShowHint] = useState<boolean>(false);
  
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
  const [bothPlayersCompleted, setBothPlayersCompleted] = useState(false);
  const [showResultsButton, setShowResultsButton] = useState(false);
  const [turnNumber, setTurnNumber] = useState<number>(1);
  const [strokeIndex, setStrokeIndex] = useState<number>(0);
  const [lastOpponentStrokeIndex, setLastOpponentStrokeIndex] = useState<number>(0);
  const [isMyTurn, setIsMyTurn] = useState<boolean>(false);
  const [currentTurnUsername, setCurrentTurnUsername] = useState<string>('');
  const [opponentOnline, setOpponentOnline] = useState<boolean>(false);

  const loadDuelData = async () => {
    try {
      setLoading(true);
      console.log('Loading duel data for duelId:', duelId);

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
        isChallenger,
      };

      console.log('Loaded duel data:', duelInfo);
      setDuelData(duelInfo);

      // Fetch category from words table
      const { data: wordData } = await supabase
        .from('words')
        .select('category')
        .eq('word', duel.word)
        .single();
      
      if (wordData?.category) {
        setCategory(wordData.category);
      }

      // Set current turn based on duel.turn_order if present (new system)
      try {
        if (Array.isArray(duel.turn_order) && duel.turn_order.length > 0 && typeof duel.current_turn_index === 'number') {
          const turnUserId = duel.turn_order[duel.current_turn_index];
          setIsMyTurn(turnUserId === user.id);
          if (typeof duel.roulette_turn_number === 'number' && duel.roulette_turn_number > 0) {
            setTurnNumber(duel.roulette_turn_number);
            setLastOpponentStrokeIndex(0);
          }
          if (turnUserId) {
            const { data: turnUserProfile } = await supabase
              .from('profiles')
              .select('username')
              .eq('id', turnUserId)
              .single();
            if (turnUserProfile?.username) {
              setCurrentTurnUsername(turnUserProfile.username);
            }
          }
        }
      } catch (e) {
        console.log('Failed to set turn state from duel record', e);
      }

      // Load previous turns (new system)
      await loadTurnHistory();

      // If duel already completed (e.g., on re-entry at end), go to results
      if (duel.status === 'completed') {
        (navigation as any).navigate('DuelFriendResults', { duelId });
      }

    } catch (error) {
      console.error('Error loading duel data:', error);
      Alert.alert('Error', 'Failed to load duel data');
    } finally {
      setLoading(false);
    }
  };

  // SVG safety helpers (match multiplayer roulette behavior)
  const isValidSvgPath = (value: any): boolean => {
    if (typeof value !== 'string') return false;
    if (!value) return false;
    if (value.includes('NaN') || value.includes('Infinity')) return false;
    // Allow only M/L/Q commands with numbers, dots, commas, dashes and spaces
    return /^M[0-9\.,\-\sLQ]+$/.test(value);
  };

  const isValidStrokeWidth = (w: any): boolean => {
    if (typeof w !== 'number') return false;
    return w >= 0.5 && w <= 50;
  };

  // Load previous turns (new system)
  const loadTurnHistory = async () => {
    try {
      const { data: turns, error } = await supabase
        .from('doodle_hunt_friend_turns')
        .select('turn_number, ai_guess, similarity_score, user_id, position')
        .eq('duel_id', duelId)
        .order('turn_number', { ascending: true });
      if (error) {
        console.log('Error loading turn history', error);
        return;
      }
      const rows = turns || [];
      const userIds = Array.from(new Set(rows.map((t: any) => t.user_id).filter(Boolean)));
      let idToUsername: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', userIds as any);
        (profiles || []).forEach((p: any) => { idToUsername[p.id] = p.username || 'Unknown'; });
      }
      const history = rows.map((t: any) => ({
        turnNumber: t.turn_number,
        username: idToUsername[t.user_id] || 'Unknown',
        aiGuess: t.ai_guess || '',
        similarity: t.similarity_score || 0,
        position: t.position || 0, // Use position from DB, default to 0 if null
        wasCorrect: (t.similarity_score || 0) >= 100
      }));
      setTurnHistory(history);
    } catch (e) {
      console.log('loadTurnHistory failed', e);
    }
  };

  const loadDuelGuesses = async (explicitGameId?: string | null) => {
    try {
      const gId = explicitGameId ?? gameId;
      // Guard: require a plausible UUID string
      if (!gId || typeof gId !== 'string' || gId.length < 36) {
        return;
      }
      const { data: guesses, error } = await supabase
        .from('doodle_hunt_duel_guesses')
        .select('guess_number, ai_guess_word, similarity_score, position')
        .eq('game_id', gId)
        .order('guess_number', { ascending: true });

      if (error) {
        console.error('Error loading guesses:', error);
        return;
      }

      if (guesses && guesses.length > 0) {
        setAttempts(guesses.length);
        setPreviousAttempts(guesses.map(g => ({ guess: g.ai_guess_word, score: g.similarity_score, position: g.position || 0 })));
        
        // Set the latest guess as current
        const latestGuess = guesses[guesses.length - 1];
        setAiGuess(latestGuess.ai_guess_word);
        setSimilarityScore(latestGuess.similarity_score);
        setPosition(latestGuess.position || 0);
        
        // Check if game is won or lost
        if (latestGuess.similarity_score >= 80) {
          setGameWon(true);
        } else if (guesses.length >= maxAttempts) {
          setGameLost(true);
        }
      }
    } catch (error) {
      console.error('Error loading duel guesses:', error);
    }
  };

  const checkBothPlayersCompleted = async (): Promise<boolean> => {
    try {
      console.log('Checking both players completion for duelId:', duelId);
      
      // First, let's check the duel status to see if it's completed
      const { data: duel, error: duelError } = await supabase
        .from('duels')
        .select('status, winner_id')
        .eq('id', duelId)
        .single();
      
      if (duelError) {
        console.error('Error checking duel status:', duelError);
      } else {
        console.log('Duel status:', duel);
        if (duel.status === 'completed') {
          console.log('Duel is already completed, both players must be done');
          setBothPlayersCompleted(true);
          setShowResultsButton(true);
          return true;
        }
      }
      
      const { data: games, error } = await supabase
        .from('doodle_hunt_duel')
        .select('status, user_id')
        .eq('duel_id', duelId);

      if (error) {
        console.error('Error checking player completion:', error);
        return false;
      }

      console.log('Games found:', games);
      
      if (games && games.length === 2) {
        const bothCompleted = games.every(game => game.status === 'completed');
        console.log('Both players completed:', bothCompleted);
        console.log('Game statuses:', games.map(g => ({ user_id: g.user_id, status: g.status })));
        setBothPlayersCompleted(bothCompleted);
        
        if (bothCompleted) {
          console.log('Setting showResultsButton to true');
          setShowResultsButton(true);
        }
        
        return bothCompleted;
      }
      
      console.log('Not enough games found:', games?.length);
      return false;
    } catch (error) {
      console.error('Error in checkBothPlayersCompleted:', error);
      return false;
    }
  };

  const createOrLoadDoodleHuntDuelGame = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'User not authenticated');
        return;
      }

      // Check if doodle_hunt_duel game already exists for this user and duel
      const { data: existingGame, error: fetchError } = await supabase
        .from('doodle_hunt_duel')
        .select('id, status, guesses, final_score, category')
        .eq('duel_id', duelId)
        .eq('user_id', user.id)
        .single();

      if (existingGame && !fetchError) {
        // Game exists, load it
        console.log('Loading existing doodle_hunt_duel game:', existingGame.id);
        setGameId(existingGame.id);
        setAttempts(existingGame.guesses || 0);
        
        // Set category from existing game if available, otherwise use the one we fetched earlier
        if (existingGame.category && !category) {
          setCategory(existingGame.category);
        }
        
        // Load existing guesses
        await loadDuelGuesses(existingGame.id);
      } else {
        // Create new game
        console.log('Creating new doodle_hunt_duel game');
        const { data: newGameId, error: createError } = await supabase.rpc('create_doodle_hunt_duel_game', {
          duel_uuid: duelId,
          user_uuid: user.id,
          target_word_text: duelData?.word || 'unknown',
          word_category: category || null
        });

        if (createError) {
          console.error('Error creating doodle_hunt_duel game:', createError);
          Alert.alert('Error', 'Failed to create game');
          return;
        }

        setGameId(newGameId);
        console.log('Created doodle_hunt_duel game with ID:', newGameId);
        // Load guesses immediately for the newly created game (will be empty initially)
        await loadDuelGuesses(newGameId);
      }
    } catch (error) {
      console.error('Error in createOrLoadDoodleHuntDuelGame:', error);
      Alert.alert('Error', 'Failed to create or load game');
    }
  };

  // When gameId becomes available (e.g., re-entering screen), load guesses
  useEffect(() => {
    if (gameId) {
      loadDuelGuesses(gameId);
    }
  }, [gameId]);

  useEffect(() => {
    if (duelId) {
      loadDuelData();
    }
  }, [duelId]);

  // Subscribe to realtime turn changes on duels (new system)
  useEffect(() => {
    if (!duelId) return;

    const channel = supabase
      .channel(`duel-turns-${duelId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'duels',
          filter: `id=eq.${duelId}`
        },
        async (payload) => {
          try {
            const updated: any = payload.new;
            if (!updated) return;
            // Only process for doodleHunt
            if (updated.gamemode !== 'doodleHunt') return;
            // If duel ended (turn limit or 100%), navigate to results
            if (updated.status === 'completed') {
              (navigation as any).navigate('DuelFriendResults', { duelId });
              return;
            }
            if (Array.isArray(updated.turn_order) && updated.turn_order.length > 0 && typeof updated.current_turn_index === 'number') {
              const { data: { user } } = await supabase.auth.getUser();
              const turnUserId = updated.turn_order[updated.current_turn_index];
              setIsMyTurn(!!user && turnUserId === user.id);
              if (typeof updated.roulette_turn_number === 'number' && updated.roulette_turn_number > 0) {
                setTurnNumber(updated.roulette_turn_number);
                // Clear canvas and reset when turn advances
                setPaths([]);
                setCurrentPath('');
                setStrokeIndex(0);
                setLastOpponentStrokeIndex(0);
              }
              if (turnUserId) {
                const { data: turnUserProfile } = await supabase
                  .from('profiles')
                  .select('username')
                  .eq('id', turnUserId)
                  .single();
                if (turnUserProfile?.username) {
                  setCurrentTurnUsername(turnUserProfile.username);
                }
              }
            }
          } catch (e) {
            console.log('Failed processing duel turn update', e);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [duelId]);

  // Subscribe to completed turns to refresh history (new system)
  useEffect(() => {
    if (!duelId) return;
    const channel = supabase
      .channel(`duel-turns-history-${duelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'doodle_hunt_friend_turns',
          filter: `duel_id=eq.${duelId}`
        },
        async () => {
          await loadTurnHistory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [duelId]);

  // Subscribe to real-time opponent strokes for current duel (new system)
  useEffect(() => {
    if (!duelId) return;
    const channel = supabase
      .channel(`duel-strokes-${duelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'doodle_hunt_friend_strokes',
          filter: `duel_id=eq.${duelId}`
        },
        (payload) => {
          try {
            if (isMyTurn) return; // Only render opponent strokes
            const row: any = payload.new;
            if (!row || row.turn_number !== turnNumber) return;
            let stroke = row.stroke_data;
            if (!stroke) return;
            // Handle explicit clear signal (object or stringified)
            if (typeof stroke === 'string') {
              try { stroke = JSON.parse(stroke); } catch {}
            }
            if (stroke && typeof stroke === 'object' && stroke.clear === true) {
              setPaths([]);
              setCurrentPath('');
              setLastOpponentStrokeIndex(0);
              return;
            }
            // Enforce monotonic index AFTER clear handling so clear always gets through
            if (typeof row.stroke_index === 'number') {
              if (row.stroke_index <= lastOpponentStrokeIndex) return; // duplicate/out-of-order
              setLastOpponentStrokeIndex(row.stroke_index);
            }
            if (typeof stroke === 'string') {
              try { stroke = JSON.parse(stroke); } catch { return; }
            }
            if (!stroke || !stroke.path || !stroke.color || typeof stroke.strokeWidth !== 'number') return;
            if (typeof stroke.path !== 'string') return;
            if (stroke.path.includes('NaN') || stroke.path.includes('Infinity')) return;
            if (!/^M[0-9\.,\-\sLQ]+$/.test(stroke.path)) return;
            if (stroke.strokeWidth < 0.5 || stroke.strokeWidth > 50) return;
            setPaths(prev => [...prev, { path: String(stroke.path), color: String(stroke.color), strokeWidth: Number(stroke.strokeWidth) }]);
          } catch (e) {
            console.log('Error handling stroke payload', e);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'doodle_hunt_friend_strokes',
          filter: `duel_id=eq.${duelId}`
        },
        (payload) => {
          try {
            // When remote clears current turn strokes, mirror locally if it's not our turn
            if (isMyTurn) return;
            const row: any = payload.old;
            if (!row || row.turn_number !== turnNumber) return;
            setPaths([]);
            setCurrentPath('');
            setLastOpponentStrokeIndex(0);
          } catch (e) {
            console.log('Error handling stroke delete payload', e);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [duelId, turnNumber, isMyTurn]);

  // Presence: show green dot if opponent is also on this screen
  useEffect(() => {
    let presenceChannel: any;
    const setupPresence = async () => {
      try {
        // Need both duelData and current user to establish presence
        const { data: { user } } = await supabase.auth.getUser();
        if (!duelId || !duelData || !user) return;

        const myUserId = user.id;
        const opponentId = duelData.isChallenger ? duelData.opponent_id : duelData.challenger_id;

        presenceChannel = supabase
          .channel(`duel-presence-${duelId}`, {
            config: { presence: { key: myUserId } }
          })
          .on('presence', { event: 'sync' }, () => {
            try {
              const state = presenceChannel.presenceState() as Record<string, any[]>;
              const onlineUserIds = Object.keys(state || {});
              setOpponentOnline(onlineUserIds.includes(opponentId));
            } catch (e) {
              console.log('Presence sync parse error', e);
            }
          })
          .subscribe(async (status: any) => {
            if (status === 'SUBSCRIBED') {
              try {
                await presenceChannel.track({ online_at: new Date().toISOString() });
              } catch (e) {
                console.log('Presence track failed', e);
              }
            }
          });
      } catch (e) {
        console.log('Presence setup failed', e);
      }
    };

    setupPresence();
    return () => {
      if (presenceChannel) supabase.removeChannel(presenceChannel);
    };
  }, [duelId, duelData]);

  // Subscribe to realtime changes on doodle_hunt_duel table
  useEffect(() => {
    if (!duelId) return;
    
    console.log('DoodleHuntFriend: Setting up realtime subscription for doodle_hunt_duel...');
    
    const channel = supabase
      .channel('doodle-hunt-duel-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'doodle_hunt_duel',
          filter: `duel_id=eq.${duelId}`
        },
        (payload) => {
          console.log('DoodleHuntFriend received real-time event:', payload);
          console.log('DoodleHuntFriend Event details:', {
            event: (payload as any).event,
            new: payload.new,
            old: payload.old,
            table: payload.table,
            schema: payload.schema
          });
          
          // Check if both players have completed after any change
          checkBothPlayersCompleted();
        }
      )
      .subscribe((status, err) => {
        console.log('DoodleHuntFriend subscription status:', status);
        if (err) {
          console.error('DoodleHuntFriend subscription error:', err);
        }
        if (status === 'SUBSCRIBED') {
          console.log('DoodleHuntFriend: Successfully subscribed to realtime updates');
        }
      });

    return () => {
      console.log('DoodleHuntFriend: Cleaning up realtime subscription...');
      supabase.removeChannel(channel);
    };
  }, [duelId]);

  const submitDrawing = async () => {
    if (!duelData || isSubmitting) return;
    try {
      setIsSubmitting(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Error', 'You must be logged in.');
        return;
      }

      // Compress canvas screenshot for AI guess
      const base64 = await compressImageToBase64(canvasRef);

      // Generate simple SVG string from current paths for storage
      const svgString = `<svg width="${screenWidth - 40}" height="${screenWidth - 100}" xmlns="http://www.w3.org/2000/svg">`
        + paths
          .filter(p => isValidSvgPath(p?.path) && isValidStrokeWidth(p?.strokeWidth))
          .map(p => `<path d="${p.path}" stroke="${typeof p.color === 'string' ? p.color : '#000000'}" stroke-width="${p.strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`)
        + `</svg>`;

      // Upload SVG
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `dhf-${duelId}-turn${turnNumber}-${timestamp}.svg`;
      const { error: uploadError } = await supabase.storage
        .from('drawings')
        .upload(filename, svgString, { contentType: 'image/svg+xml', upsert: false });
      if (uploadError) {
        Alert.alert('Error', 'Failed to save drawing.');
        return;
      }
      const { data: urlData } = supabase.storage.from('drawings').getPublicUrl(filename);

      // AI guess
      const guessResponse = await fetch("https://qxqduzzqcivosdauqpis.functions.supabase.co/guess-drawing", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ pngBase64: base64, targetWord: duelData.word })
      });
      if (!guessResponse.ok) {
        Alert.alert('Error', 'Failed to analyze drawing.');
        return;
      }
      const guessData = await guessResponse.json();
      const aiGuess = guessData.guess || 'unknown';
      const similarityScore = guessData.similarity || 0;
      const position = guessData.position || 0;

      // Submit turn through edge function; backend will advance or complete
      const { data: submitData, error: submitError } = await supabase.functions.invoke('matchmaking', {
        body: {
          action: 'submit_doodle_hunt_friend_turn',
          duelId,
          svgUrl: urlData.publicUrl,
          pathsJson: { paths },
          aiGuess,
          similarityScore,
          position
        }
      });
      if (submitError || !submitData?.success) {
        const msg = submitError?.message || submitData?.error || 'Failed to submit turn';
        Alert.alert('Error', msg);
        return;
      }

      // Show quick feedback
      Alert.alert('Turn submitted', `AI: "${aiGuess}" (${similarityScore}% | #${position})`);
      // Refresh history immediately in case realtime is delayed
      await loadTurnHistory();
      // Turn should advance via duels realtime update
    } catch (error) {
      console.error('Error submitting turn:', error);
      Alert.alert('Error', 'Failed to submit turn.');
    } finally {
      setIsSubmitting(false);
    }
  };


  const clearCanvas = async () => {
    try {
      // Only current drawer can clear and broadcast deletion
      if (isMyTurn) {
        // Delete all strokes for this duel and current turn from server so opponent view clears
        const { error: delError } = await supabase
          .from('doodle_hunt_friend_strokes')
          .delete()
          .eq('duel_id', duelId)
          .eq('turn_number', turnNumber);
        if (delError) {
          console.log('Failed to delete strokes for clear:', delError);
        }

        // Additionally send a lightweight "clear" signal as an INSERT to ensure opponent clears immediately
        try {
          const { error: insertError } = await supabase
            .from('doodle_hunt_friend_strokes')
            .insert({
              duel_id: duelId,
              turn_number: turnNumber,
              stroke_index: 0,
              stroke_data: { clear: true }
            });
          if (insertError) {
            console.log('Failed to insert clear signal stroke:', insertError);
          }
        } catch (e) {
          console.log('Error sending clear signal', e);
        }
      }
    } catch (e) {
      console.log('Error clearing strokes remotely', e);
    } finally {
      setPaths([]);
      setCurrentPath('');
    }
  };

  const undoLastPath = () => {
    setPaths(prev => prev.slice(0, -1));
  };

  const colors = ['#000000', '#FF0000', '#00FF00', '#0000FF'];
  const brushSizes = [2, 3, 5];

  const PanResponder = require('react-native').PanResponder.create({
    onStartShouldSetPanResponder: () => isMyTurn && !gameWon && !gameLost && !bothPlayersCompleted,
    onMoveShouldSetPanResponder: () => isMyTurn && !gameWon && !gameLost && !bothPlayersCompleted,
    onPanResponderGrant: (evt: GestureResponderEvent) => {
      // Don't allow drawing if game is completed or waiting for opponent
      if (gameWon || gameLost || bothPlayersCompleted) return;
      const { locationX, locationY } = evt.nativeEvent;
      setIsDrawing(true);
      
      if (isEraseMode) {
        // True erase functionality - remove paths that intersect with touch point
        const eraseRadius = Math.max(15, brushSize * 2);
        setPaths(prevPaths => 
          prevPaths.filter(pathData => {
            // Simple check: if any coordinate in the path is within erase radius
            const coords = pathData.path.match(/\d+\.?\d*,\d+\.?\d*/g);
            if (!coords) return true;
            
            return !coords.some(coord => {
              const [x, y] = coord.split(',').map(Number);
              const distance = Math.sqrt((x - locationX) ** 2 + (y - locationY) ** 2);
              return distance <= eraseRadius;
            });
          })
        );
      } else {
        setCurrentPath(`M${locationX},${locationY}`);
        setCurrentPoints([{ x: locationX, y: locationY }]);
      }
    },
    onPanResponderMove: (evt: GestureResponderEvent) => {
      if (!isDrawing) return;
      
      const { locationX, locationY } = evt.nativeEvent;
      
      if (isEraseMode) {
        // True erase functionality - remove paths that intersect with touch point
        const eraseRadius = Math.max(15, brushSize * 2);
        setPaths(prevPaths => 
          prevPaths.filter(pathData => {
            const coords = pathData.path.match(/\d+\.?\d*,\d+\.?\d*/g);
            if (!coords) return true;
            
            return !coords.some(coord => {
              const [x, y] = coord.split(',').map(Number);
              const distance = Math.sqrt((x - locationX) ** 2 + (y - locationY) ** 2);
              return distance <= eraseRadius;
            });
          })
        );
      } else {
        const newPoint = { x: locationX, y: locationY };
        setCurrentPoints(prev => [...prev, newPoint]);
        setCurrentPath(prev => `${prev} L${locationX},${locationY}`);
      }
    },
    onPanResponderRelease: async () => {
      if (!isDrawing) return;
      setIsDrawing(false);
      
      if (!isEraseMode && currentPath) {
        // Validate stroke before adding/broadcasting (similar to roulette)
        if (!isValidSvgPath(currentPath)) return;
        if (!isValidStrokeWidth(brushSize)) return;
        setPaths(prev => [...prev, { 
          path: currentPath, 
          color: brushColor, 
          strokeWidth: brushSize 
        }]);

        // Broadcast stroke to opponent (new system)
        try {
          if (!isMyTurn) return;
          const strokeData = { path: currentPath, color: brushColor, strokeWidth: brushSize };
          const nextIndex = strokeIndex + 1;
          setStrokeIndex(nextIndex);
          await supabase.functions.invoke('matchmaking', {
            body: {
              action: 'add_doodle_hunt_friend_stroke',
              duelId,
              turnNumber,
              strokeData,
              strokeIndex: nextIndex
            }
          });
        } catch (e) {
          console.log('Failed to broadcast stroke', e);
        }
      }
      
      setCurrentPath('');
      setCurrentPoints([]);
    },
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading duel...</Text>
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

  const opponentUsername = duelData.isChallenger ? duelData.opponent_username : duelData.challenger_username;
  const displayWord = duelData.word ? duelData.word.split('').map(() => '_').join(' ') : '';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          {!(gameWon || gameLost) && (
            isMyTurn ? (
              <TouchableOpacity
                style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
                onPress={submitDrawing}
                disabled={isSubmitting}
              >
                <Text style={styles.submitButtonText}>
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.submitButton}>
                <Text style={styles.submitButtonText}>
                  {currentTurnUsername ? `⏳ ${currentTurnUsername}'s Turn` : '⏳ Opponent\'s Turn'}
                </Text>
              </View>
            )
          )}

          {showResultsButton && (
            <TouchableOpacity
              style={styles.resultsButton}
              onPress={() => (navigation as any).navigate('DuelFriendResults', { duelId })}
            >
              <Text style={styles.resultsButtonText}>View Results</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.title}>DoodleHunt vs @{opponentUsername}</Text>
          {opponentOnline && <View style={styles.onlineDot} />}
        </View>
      </View>

      <ScrollView 
        style={styles.scrollContainer} 
        showsVerticalScrollIndicator={false}
        scrollEnabled={gameWon || gameLost || bothPlayersCompleted}
      >
        <View style={styles.content}>
          <View style={styles.wordRow}>
            {duelData.word.split('').map((ch, idx) => (
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
          
          
          {/* Show category after game ends */}
          {(gameWon || gameLost) && category && (
            <View style={styles.categoryContainer}>
              <Text style={styles.categoryLabel}>Category:</Text>
              <Text style={styles.categoryText}>{category}</Text>
            </View>
          )}
          
          <Text style={styles.attemptsText}>Turn {turnNumber}/10</Text>
          
          {(gameWon || gameLost) && !bothPlayersCompleted && (
            <View style={styles.waitingContainer}>
              <Text style={styles.waitingText}>⏳ Waiting for your opponent to finish...</Text>
            </View>
          )}

          {/* Current AI Guess - Small display above canvas */}
          {aiGuess && (
            <View style={styles.currentGuessSmall}>
              <Text style={styles.guessTextSmall}>AI: "{aiGuess}" ({similarityScore}%)</Text>
            </View>
          )}

          <View style={[styles.canvasContainer, isMyTurn && styles.canvasMyTurnGlow]}>
            <View
              ref={canvasRef}
              style={[styles.canvas, (gameWon || gameLost || bothPlayersCompleted) && styles.canvasDisabled]}
              {...PanResponder.panHandlers}
            >
              <Svg style={styles.svg}>
                {paths.map((pathData, index) => {
                  // Validate before rendering to avoid rnsvgparser errors
                  if (!isValidSvgPath(pathData?.path)) {
                    console.warn('Skipping invalid path at index', index);
                    return null;
                  }
                  const safeColor = typeof pathData?.color === 'string' ? pathData.color : '#000000';
                  const safeWidth = isValidStrokeWidth(pathData?.strokeWidth) ? pathData.strokeWidth : 3;
                  return (
                    <Path
                      key={index}
                      d={pathData.path}
                      stroke={safeColor}
                      strokeWidth={safeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  );
                })}
                {isValidSvgPath(currentPath) && (
                  <Path
                    d={currentPath}
                    stroke={brushColor}
                    strokeWidth={isValidStrokeWidth(brushSize) ? brushSize : 3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                )}
              </Svg>
            </View>
          </View>

          {/* Previous Turns (new system) */}
          {turnHistory.length > 0 && (
            <View style={styles.guessesSection}>
              <Text style={styles.guessesTitle}>Top Guesses</Text>
              <View style={styles.previousGuesses}>
                {[...turnHistory]
                  .sort((a, b) => b.similarity - a.similarity)
                  .map((t, index) => {
                  let barColor = '#E57373';
                  if (t.similarity === 100) barColor = '#64B5F6';
                  else if (t.similarity >= 80) barColor = '#81C784';
                  else if (t.similarity >= 60) barColor = '#FFE082';
                  else if (t.similarity >= 40) barColor = '#FFB74D';
                  const widthPercent = t.similarity <= 0 ? 0 : t.similarity;
                  return (
                    <View key={index} style={styles.guessItem}>
                      <View style={styles.progressBarContainer}>
                        <View style={[styles.progressBar, { width: `${widthPercent}%`, backgroundColor: barColor }]} />
                        <Text style={styles.guessWordInside}>{t.username}: {t.aiGuess}</Text>
                        <Text style={styles.guessScoreOutside}>{t.similarity}%{t.position ? ` | #${t.position}` : ''}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Side Controls Panel - match Doodle Hunt Daily */}
      <Animated.View 
        style={[
          styles.controlsContainer,
          {
            transform: [{
              translateX: slideAnimation.interpolate({
                inputRange: [0, 1],
                outputRange: [200, 0],
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
            <View style={[styles.controlsContent, !isMyTurn && styles.controlsDisabled]}>
            <View style={styles.colorControls}>
              <Text style={styles.controlLabel}>Colors</Text>
              <View style={styles.colorRow}>
                  <TouchableOpacity
                  style={[styles.colorButton, { backgroundColor: '#000000' }, brushColor === '#000000' && styles.selectedColor]}
                    onPress={() => { if (!isMyTurn) return; setBrushColor('#000000'); }}
                />
                <TouchableOpacity
                  style={[styles.colorButton, { backgroundColor: '#FF0000' }, brushColor === '#FF0000' && styles.selectedColor]}
                    onPress={() => { if (!isMyTurn) return; setBrushColor('#FF0000'); }}
                />
                <TouchableOpacity
                  style={[styles.colorButton, { backgroundColor: '#00FF00' }, brushColor === '#00FF00' && styles.selectedColor]}
                    onPress={() => { if (!isMyTurn) return; setBrushColor('#00FF00'); }}
                />
                <TouchableOpacity
                  style={[styles.colorButton, { backgroundColor: '#0000FF' }, brushColor === '#0000FF' && styles.selectedColor]}
                    onPress={() => { if (!isMyTurn) return; setBrushColor('#0000FF'); }}
                />
              </View>
            </View>

            <View style={styles.sizeControls}>
              <Text style={styles.controlLabel}>Size</Text>
              <TouchableOpacity
                style={[styles.sizeButton, brushSize === 2 && styles.selectedSize]}
                  onPress={() => { if (!isMyTurn) return; setBrushSize(2); }}
              >
                <Text style={styles.sizeButtonText}>Small</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sizeButton, brushSize === 3 && styles.selectedSize]}
                  onPress={() => { if (!isMyTurn) return; setBrushSize(3); }}
              >
                <Text style={styles.sizeButtonText}>Medium</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sizeButton, brushSize === 5 && styles.selectedSize]}
                  onPress={() => { if (!isMyTurn) return; setBrushSize(5); }}
              >
                <Text style={styles.sizeButtonText}>Large</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.actionControls}>
              <Text style={styles.controlLabel}>Tools</Text>
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.actionButton, isEraseMode && styles.selectedAction]}
                    onPress={() => { if (!isMyTurn) return; setIsEraseMode(!isEraseMode); }}
                >
                  <Text style={styles.actionButtonText}>
                    {isEraseMode ? '✏️ Draw' : '🧽 Erase'}
                  </Text>
                </TouchableOpacity>
                  <TouchableOpacity style={styles.actionButton} onPress={() => { if (!isMyTurn) return; undoLastPath(); }}>
                  <Text style={styles.actionButtonText}>Undo</Text>
                </TouchableOpacity>
                  <TouchableOpacity style={styles.actionButton} onPress={() => { if (!isMyTurn) return; clearCanvas(); }}>
                  <Text style={styles.actionButtonText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContainer: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 10,
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
    fontFamily: 'Nunito_700Bold',
    textAlign: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#28A745',
    marginLeft: 6,
  },
  submitButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Nunito_700Bold',
  },
  resultsButton: {
    backgroundColor: '#28A745',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 10,
  },
  resultsButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Nunito_700Bold',
  },
  wordDisplay: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    letterSpacing: 2,
    marginTop: 2,
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
  attemptsText: {
    fontSize: 16,
    color: '#666',
    marginTop: 6,
    marginBottom: 10,
    textAlign: 'center',
    fontFamily: 'Nunito_600SemiBold',
  },
  waitingContainer: {
    backgroundColor: '#FFF3CD',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#FFEAA7',
  },
  waitingText: {
    fontSize: 14,
    color: '#856404',
    textAlign: 'center',
    fontWeight: '500',
  },
  currentGuessSmall: {
    backgroundColor: '#F0F0F0',
    padding: 8,
    borderRadius: 6,
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
  canvasContainer: {
    width: '100%',
    height: screenWidth - 100,
    alignSelf: 'center',
    marginTop: 0,
    marginBottom: 20,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  canvasMyTurnGlow: {
    borderColor: '#34C759',
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    // Optional Android shadow via elevation (not true glow but helps)
    elevation: 6,
  },
  canvas: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  canvasDisabled: {
    opacity: 0.6,
    backgroundColor: '#F5F5F5',
  },
  svg: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  guessesSection: {
    paddingTop: 20,
    backgroundColor: '#F8F9FA',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    marginTop: 20,
  },
  guessesTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  previousGuesses: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
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
  controlsDisabled: {
    opacity: 0.5,
  },
  colorControls: {
    marginBottom: 15,
  },
  controlLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
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
    marginBottom: 10,
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
  categoryContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: '#FFF9E6',
    marginTop: 10,
    marginBottom: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFA500',
  },
  categoryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginRight: 8,
  },
  categoryText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF8C00',
    textTransform: 'capitalize',
  },
});
