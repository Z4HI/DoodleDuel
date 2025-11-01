import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useSelector } from 'react-redux';
import DrawingToolsPalette from '../COMPONENTS/DrawingToolsPalette';
import { RootState } from '../store';
import { supabase } from '../SUPABASE/supabaseConfig';
import { compressImageToBase64 } from '../utils/imageCompression';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface RouteParams {
  matchId: string;
  secretWord: string;
  turnOrder: string[];
  currentTurnIndex: number;
  participants?: Participant[];
  maxPlayers?: number;
}

interface Participant {
  user_id: string;
  turn_position: number;
  profiles: {
    username: string;
  };
}

interface TurnHistory {
  turnNumber: number;
  username: string;
  aiGuess: string;
  similarity: number;
  position?: number; // Optional for backwards compatibility
  wasCorrect: boolean;
}

export default function RouletteDrawingScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { matchId, secretWord, turnOrder, currentTurnIndex, participants: routeParticipants, maxPlayers } = route.params as RouteParams;
  const user = useSelector((state: RootState) => state.auth.user);
  const currentUserId = user?.user?.id;
  
  // Calculate turn limit: 5 turns per player (matching database logic)
  const maxTurns = (maxPlayers || turnOrder?.length || 2) * 5;
  
  // Animation state
  const slideAnimation = useRef(new Animated.Value(0)).current;
  
  // Drawing state
  const [paths, setPaths] = useState<Array<{ path: string; color: string; strokeWidth: number }>>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(3);
  const [currentPoints, setCurrentPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [isEraseMode, setIsEraseMode] = useState(false);
  const [isControlsExpanded, setIsControlsExpanded] = useState(false);
  const [strokeIndex, setStrokeIndex] = useState(0);
  
  // Game state - Initialize from route params
  const [timeLeft, setTimeLeft] = useState(20);
  const [currentTurnIndexState, setCurrentTurnIndexState] = useState(currentTurnIndex);
  const [currentTurnUser, setCurrentTurnUser] = useState<string>(turnOrder?.[currentTurnIndex] || '');
  const [turnNumberState, setTurnNumberState] = useState(1);
  const [participants, setParticipants] = useState<Participant[]>(routeParticipants || []);
  const [isMyTurn, setIsMyTurn] = useState(turnOrder?.[currentTurnIndex] === currentUserId);
  
  // Keep track of the turn order separately to avoid it being reset
  const [turnOrderState, setTurnOrderState] = useState<string[]>(turnOrder || []);
  
  // Debug effect to track isMyTurn changes
  useEffect(() => {
    console.log('isMyTurn state changed:', isMyTurn);
  }, [isMyTurn]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnHistory, setTurnHistory] = useState<TurnHistory[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastFeedback, setLastFeedback] = useState({ guess: '', similarity: 0 });
  const [waitingForBanner, setWaitingForBanner] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastTitle, setToastTitle] = useState('');
  const [isWinnerToast, setIsWinnerToast] = useState(false);
  
  const canvasRef = useRef<View>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const toastScaleAnim = useRef(new Animated.Value(0)).current; // Start at scale 0
  const toastOpacityAnim = useRef(new Animated.Value(0)).current; // Start invisible

  // Initialize and sync timer from server
  useEffect(() => {
    console.log('RouletteDrawingScreen initialized:', {
      matchId,
      secretWord,
      turnOrder,
      turnOrderState,
      currentTurnIndex,
      participantCount: routeParticipants?.length,
      initialCurrentUser: turnOrder?.[currentTurnIndex],
      currentUserId,
      isMyTurn: turnOrder?.[currentTurnIndex] === currentUserId
    });
    
    // Fetch the latest match data to ensure we have complete participant information
    const fetchMatchData = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('matchmaking', {
          body: {
            action: 'get_roulette_status',
            matchId: matchId
          }
        });

        if (error) {
          console.error('Error fetching match data:', error);
          return;
        }

        if (data.success) {
          const match = data.match;
          const participants = data.participants || [];
          
          console.log('Fetched match data:', {
            turnOrder: match.turn_order,
            currentTurnIndex: match.current_turn_index,
            participantCount: participants.length,
            participants: participants.map(p => ({ id: p.user_id, username: p.profiles?.username }))
          });
          
          // Update state with fresh data
          if (match.turn_order && match.turn_order.length > 0) {
            const expectedUser = match.turn_order[match.current_turn_index];
            const isMyTurnNow = expectedUser === currentUserId;
            
            console.log('Updating turn state:', {
              expectedUser,
              currentUserId,
              currentTurnIndex: match.current_turn_index,
              isMyTurnNow,
              turnOrderLength: match.turn_order.length
            });
            
            setTurnOrderState(match.turn_order);
            setCurrentTurnUser(expectedUser || '');
            setIsMyTurn(isMyTurnNow);
          }
          
          if (participants.length > 0) {
            setParticipants(participants);
          }
          
          if (match.turn_number) {
            setTurnNumberState(match.turn_number);
          }
        }
      } catch (error) {
        console.error('Error in fetchMatchData:', error);
      }
    };

    fetchMatchData();
  }, []);

  // Check if it's my turn
  useEffect(() => {
    console.log('Turn check effect:', {
      turnOrderState,
      currentTurnIndex,
      currentUserId,
      turnOrderLength: turnOrderState?.length,
      participantsCount: participants.length
    });
    
    if (turnOrderState && turnOrderState.length > 0) {
      const currentUser = turnOrderState[currentTurnIndexState];
      const isMyTurnNow = currentUser === currentUserId;
      
      console.log('Turn check effect - Current turn user ID:', currentUser);
      console.log('Turn check effect - My user ID:', currentUserId);
      console.log('Turn check effect - Is my turn?', isMyTurnNow);
      console.log('Turn check effect - Turn order:', turnOrderState);
      console.log('Turn check effect - Current turn index:', currentTurnIndexState);
      
      setCurrentTurnUser(currentUser);
      setIsMyTurn(isMyTurnNow);
      // Only wait for banner if there's feedback to show (not on game start)
      setWaitingForBanner(turnHistory.length > 0);
    } else {
      console.warn('Turn order is empty or undefined:', { turnOrderState, currentTurnIndex: currentTurnIndexState });
      // If turn order is empty, neither player should have a turn
      setIsMyTurn(false);
      setCurrentTurnUser('');
    }
  }, [currentTurnIndexState, turnOrderState, currentUserId, participants.length]);

  // Timer countdown - runs for ALL players, but only when guess banner is not showing
  useEffect(() => {
    if (!isSubmitting && timeLeft > 0 && !showFeedback && !waitingForBanner) {
      timerRef.current = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);
    } else if (timeLeft === 0 && isMyTurn && !isSubmitting) {
      // Only current player auto-submits
      handleSubmit();
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timeLeft, isMyTurn, isSubmitting, showFeedback, waitingForBanner]);

  // Subscribe to real-time match updates
  useEffect(() => {
    const channel = supabase
      .channel(`roulette-match-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'roulette_matches',
          filter: `id=eq.${matchId}`
        },
        async (payload) => {
          console.log('Roulette match update:', payload);
          if (payload.new) {
            const match = payload.new as any;
            
            console.log('Match update details:', {
              status: match.status,
              current_turn_index: match.current_turn_index,
              turn_number: match.turn_number,
              turn_order: match.turn_order,
              turn_start_time: match.turn_start_time
            });
            
            if (match.status === 'completed') {
              console.log('Match completed! Winner:', match.winner_id);
              
              // Find winner info from turn history
              const winner = turnHistory.reduce((best, current) => {
                return current.similarity > best.similarity ? current : best;
              }, turnHistory[0] || { similarity: 0, username: 'Unknown' });
              
              // Check if it's a tie (highest score under 50%)
              const isTie = winner.similarity < 50;
              
              navigation.navigate('RouletteResults' as never, { 
                matchId,
                winner: isTie ? 'Tie' : winner.username,
                winnerScore: winner.similarity,
                gameEndReason: isTie ? 'tie' : 'max_turns'
              } as never);
              return;
            }
            
            if (match.current_turn_index !== currentTurnIndexState || match.turn_start_time) {
              console.log('Turn advanced to index:', match.current_turn_index, 'from', currentTurnIndexState);
              console.log('Turn advancement condition met:', {
                turnIndexChanged: match.current_turn_index !== currentTurnIndexState,
                turnStartTimeChanged: !!match.turn_start_time,
                newTurnIndex: match.current_turn_index,
                oldTurnIndex: currentTurnIndexState
              });
              
              // Update the currentTurnIndex state to match the database
              setCurrentTurnIndexState(match.current_turn_index);
              
              // Calculate time left from server time
              if (match.turn_start_time) {
                const turnStartTime = new Date(match.turn_start_time).getTime();
                const now = Date.now();
                const elapsed = Math.floor((now - turnStartTime) / 1000);
                const remaining = Math.max(0, 20 - elapsed);
                console.log('Syncing timer from server - elapsed:', elapsed, 'remaining:', remaining);
                setTimeLeft(remaining);
              } else {
                setTimeLeft(20);
              }
              
              const newCurrentUser = match.turn_order[match.current_turn_index];
              console.log('New turn user:', newCurrentUser, 'Am I next?', newCurrentUser === currentUserId);
              
              // Always clear canvas for a new turn (whether it's your turn or someone else's)
              // Each turn starts with a blank canvas
              setPaths([]);
              setCurrentPath('');
              setCurrentPoints([]);
              setStrokeIndex(0);
              setShowFeedback(false);
              
              // Always safe to reset isSubmitting when turn changes
              setIsSubmitting(false);
              
              console.log('Real-time turn update:', {
                newCurrentUser,
                currentUserId,
                isMyTurnNow: newCurrentUser === currentUserId,
                turnNumber: match.turn_number
              });
              
              setTurnOrderState(match.turn_order);
              setCurrentTurnUser(newCurrentUser);
              setIsMyTurn(newCurrentUser === currentUserId);
              setTurnNumberState(match.turn_number);
              // Only wait for banner if there's feedback to show (not on game start)
              setWaitingForBanner(turnHistory.length > 0);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'roulette_drawing_strokes',
          filter: `match_id=eq.${matchId}`
        },
        (payload) => {
          if (payload.new && !isMyTurn) {
            const strokeData = payload.new as any;
            if (strokeData.turn_number === turnNumberState && strokeData.stroke_data) {
              let stroke = strokeData.stroke_data;
              
              // Handle case where stroke_data might be stringified
              if (typeof stroke === 'string') {
                try {
                  stroke = JSON.parse(stroke);
                  console.log('Parsed stringified stroke:', stroke);
                } catch (e) {
                  console.error('Failed to parse stroke_data string:', e);
                  return;
                }
              }
              
              // Validate stroke data before adding
              if (stroke && stroke.path && stroke.color && typeof stroke.strokeWidth === 'number') {
                // Additional validation: check if path is a valid string with M command
                if (typeof stroke.path === 'string' && stroke.path.match(/^M[\d\.\-,\sLQ]+/)) {
                  // Check for NaN or invalid numbers in the path
                  if (!stroke.path.includes('NaN') && !stroke.path.includes('Infinity')) {
                    setPaths(prev => [...prev, stroke]);
                  } else {
                    console.warn('Path contains invalid numbers (NaN/Infinity):', stroke.path);
                  }
                } else {
                  console.warn('Path format is invalid:', stroke.path);
                }
              } else {
                console.warn('Invalid stroke data received:', {
                  stroke,
                  hasPath: !!stroke?.path,
                  hasColor: !!stroke?.color,
                  hasStrokeWidth: typeof stroke?.strokeWidth === 'number',
                  type: typeof stroke
                });
              }
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'roulette_turns',
          filter: `match_id=eq.${matchId}`
        },
        (payload) => {
          if (payload.new) {
            const turn = payload.new as any;
            const username = getUsernameForId(turn.user_id);
            
            // Add to turn history
            setTurnHistory(prev => [...prev, {
              turnNumber: turn.turn_number,
              username: username,
              aiGuess: turn.ai_guess,
              similarity: turn.similarity_score,
              position: turn.position || 0, // Use position from DB, default to 0 if null
              wasCorrect: turn.was_correct
            }]);
            
            // Show toast notification
            const wasCorrect = turn.similarity_score >= 100;
            const title = wasCorrect ? '🎉 Winner!' : '✨ Turn Complete';
            const message = wasCorrect 
              ? `${username} guessed correctly: "${turn.ai_guess}"!`
              : `${username} guessed "${turn.ai_guess}" (${turn.similarity_score}%)`;
            
            showToast(title, message, wasCorrect);
            
            // Show feedback banner
            setLastFeedback({ guess: turn.ai_guess, similarity: turn.similarity_score });
            setShowFeedback(true);
            setWaitingForBanner(false); // Banner is now showing, stop waiting
            setTimeout(() => {
              setShowFeedback(false);
              setWaitingForBanner(false); // Banner disappeared, timer can start
            }, 3000);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'roulette_participants',
          filter: `match_id=eq.${matchId}`
        },
        (payload) => {
          console.log('New participant joined:', payload);
          // Refresh participant data when someone joins
          refreshParticipantData();
        }
      )
      .subscribe((status) => {
        console.log('Roulette subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, isMyTurn, turnNumberState]);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => {
      return isMyTurn && !isSubmitting;
    },
    onMoveShouldSetPanResponder: () => isMyTurn && !isSubmitting,
    onPanResponderGrant: (evt) => {
      if (!isMyTurn || isSubmitting) {
        console.log('Grant blocked - isMyTurn:', isMyTurn, 'isSubmitting:', isSubmitting);
        return;
      }
      setIsDrawing(true);
      const { locationX, locationY } = evt.nativeEvent;
      
      // Validate coordinates
      if (!isFinite(locationX) || !isFinite(locationY)) {
        console.error('Invalid coordinates on grant:', { locationX, locationY });
        setIsDrawing(false);
        return;
      }
      
      const newPoint = { x: locationX, y: locationY };
      setCurrentPoints([newPoint]);
      
      if (isEraseMode) {
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
        setCurrentPath(`M${locationX.toFixed(2)},${locationY.toFixed(2)}`);
      }
    },
    onPanResponderMove: (evt) => {
      if (!isDrawing || !isMyTurn || isSubmitting) return;
      const { locationX, locationY } = evt.nativeEvent;
      
      // Validate coordinates
      if (!isFinite(locationX) || !isFinite(locationY)) {
        console.error('Invalid coordinates on move:', { locationX, locationY });
        return;
      }
      
      if (isEraseMode) {
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
        setCurrentPath(prev => prev + ` L${locationX.toFixed(2)},${locationY.toFixed(2)}`);
        setCurrentPoints(prev => [...prev, { x: locationX, y: locationY }]);
      }
    },
    onPanResponderRelease: async () => {
      if (!isDrawing || !isMyTurn || isSubmitting) return;
      setIsDrawing(false);
      
      if (!isEraseMode && currentPath && currentPath.length > 0) {
        // Validate path before adding
        if (currentPath.startsWith('M') && currentPath.includes(',')) {
          // Ensure path has actual content (not just M command)
          const pathCommands = currentPath.split(' ');
          if (pathCommands.length < 2) {
            console.warn('Path too short, skipping:', currentPath);
            setCurrentPath('');
            setCurrentPoints([]);
            return;
          }
          
          // Check for invalid numbers in path
          if (currentPath.includes('NaN') || currentPath.includes('Infinity') || currentPath.includes('undefined')) {
            console.error('Path contains invalid values, skipping:', currentPath);
            setCurrentPath('');
            setCurrentPoints([]);
            return;
          }
          
          // Validate the path matches expected format (M for move, L for line, Q for curve)
          if (!currentPath.match(/^M[\d\.\-,\sLQ]+$/)) {
            console.error('Path does not match expected format, skipping:', currentPath);
            setCurrentPath('');
            setCurrentPoints([]);
            return;
          }
          
          const newStroke = {
            path: currentPath,
            color: brushColor,
            strokeWidth: brushSize
          };
          
          
          setPaths(prev => [...prev, newStroke]);
          
          // Send stroke for real-time sync
          try {
            await supabase.functions.invoke('matchmaking', {
              body: {
                action: 'add_roulette_stroke',
                matchId: matchId,
                turnNumber: turnNumberState,
                strokeData: newStroke,
                strokeIndex: strokeIndex
              }
            });
            setStrokeIndex(prev => prev + 1);
          } catch (error) {
            console.error('Error sending stroke:', error);
          }
        } else {
          console.warn('Invalid path generated, skipping:', currentPath);
        }
        
        setCurrentPath('');
      }
      
      setCurrentPoints([]);
    },
  });

  const clearCanvas = () => {
    if (!isMyTurn || isSubmitting) return;
    setPaths([]);
    setCurrentPath('');
    setCurrentPoints([]);
  };

  const undoLastStroke = () => {
    if (!isMyTurn || isSubmitting) return;
    if (paths.length > 0) {
      setPaths(prev => prev.slice(0, -1));
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting || !isMyTurn) {
      console.log('Submit blocked - isSubmitting:', isSubmitting, 'isMyTurn:', isMyTurn);
      return;
    }
    
    console.log('Submitting turn - current user:', currentUserId, 'expected:', currentTurnUser);
    
    // Check if we've reached the maximum turns - but still submit the turn first
    const isMaxTurns = turnNumberState >= maxTurns;
    
    // Capture the current turn user at the START of submission to handle race conditions
    const submittingForUser = currentTurnUser;
    
    // Double-check it's still our turn
    if (submittingForUser !== currentUserId) {
      console.warn('Not our turn anymore - turn changed before submit');
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // Extra check: verify with server that it's still our turn before doing expensive operations
      const { data: statusCheck } = await supabase.functions.invoke('matchmaking', {
        body: {
          action: 'get_roulette_status',
          matchId: matchId
        }
      });
      
      if (statusCheck?.success) {
        const currentTurnUserId = statusCheck.match.turn_order[statusCheck.match.current_turn_index];
        console.log('Status check - current turn user:', currentTurnUserId, 'my user:', currentUserId);
        if (currentTurnUserId !== currentUserId) {
          console.warn('Turn advanced before submit - aborting silently');
          setIsSubmitting(false);
          return;
        }
      }
      
      // Handle empty canvas - no API call needed
      if (paths.length === 0) {
        console.log('Empty canvas - submitting with no guess');
        
        console.log('Submitting empty turn to matchmaking function...');
        const { data: submitData, error: submitError } = await supabase.functions.invoke('matchmaking', {
          body: {
            action: 'submit_roulette_turn',
            matchId: matchId,
            svgUrl: '',  // Empty string instead of null
            pathsJson: { paths: [] },
            aiGuess: '(no drawing)',
            similarityScore: 0
          }
        });

        console.log('Empty turn submit response:', { submitData, submitError });

        if (submitError || !submitData?.success) {
          console.error('Error submitting empty turn:', submitError, submitData);
          
          // Check if it's a "not your turn" error (race condition)
          const errorMessage = submitError?.message || submitData?.error || '';
          if (errorMessage.includes('Not your turn') || errorMessage.includes('Expected:')) {
            console.warn('Turn already advanced for empty turn - ignoring error silently');
            setIsSubmitting(false);
            return;
          }
          
          Alert.alert('Error', `Failed to submit turn: ${errorMessage}`);
          setIsSubmitting(false);
          return;
        }

        console.log('Empty turn submitted, advancing to next player');
        setIsSubmitting(false);
        // Turn will advance via realtime
        return;
      }
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Error', 'You must be logged in.');
        setIsSubmitting(false);
        return;
      }

      const base64 = await compressImageToBase64(canvasRef);

      const svgString = `<svg width="${screenWidth - 40}" height="${screenWidth - 100}" xmlns="http://www.w3.org/2000/svg">
        ${paths.map((pathData, index) => (
          `<path d="${pathData.path}" stroke="${pathData.color}" stroke-width="${pathData.strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`
        )).join('')}
      </svg>`;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `roulette-${matchId}-turn${turnNumberState}-${timestamp}.svg`;

      const { error: uploadError } = await supabase.storage
        .from('drawings')
        .upload(filename, svgString, {
          contentType: 'image/svg+xml',
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        Alert.alert('Error', 'Failed to save drawing.');
        setIsSubmitting(false);
        return;
      }

      const { data: urlData } = supabase.storage.from('drawings').getPublicUrl(filename);

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
        Alert.alert('Error', 'Failed to analyze drawing.');
        setIsSubmitting(false);
        return;
      }

      const guessData = await guessResponse.json();
      const aiGuess = guessData.guess || 'unknown';
      const similarityScore = guessData.similarity || 0;
      const position = guessData.position || 0;
      
      console.log('AI guessed:', aiGuess, 'Score:', similarityScore, 'Position:', position);

      const pathsJson = { paths };

      console.log('Submitting turn with drawing to matchmaking function...');
      const { data: submitData, error: submitError } = await supabase.functions.invoke('matchmaking', {
        body: {
          action: 'submit_roulette_turn',
          matchId: matchId,
          svgUrl: urlData.publicUrl,
          pathsJson: pathsJson,
          aiGuess: aiGuess,
          similarityScore: similarityScore,
          position: position
        }
      });

      console.log('Turn submit response:', { submitData, submitError });

      if (submitError || !submitData?.success) {
        console.error('Error submitting turn:', submitError, submitData);
        
        // Check if it's a "not your turn" error (race condition)
        const errorMessage = submitError?.message || submitData?.error || '';
        if (errorMessage.includes('Not your turn') || errorMessage.includes('Expected:')) {
          console.warn('Turn already advanced - ignoring error silently');
          setIsSubmitting(false);
          // Don't show alert - turn already moved on, user will see it via realtime
          return;
        }
        
        Alert.alert('Error', 'Failed to submit turn: ' + errorMessage);
        setIsSubmitting(false);
        return;
      }

      console.log('Turn submitted successfully');
      console.log('Turn submit response details:', {
        submitData,
        gameOver: submitData?.gameOver,
        turnId: submitData?.turnId,
        turnLimitReached: submitData?.turnLimitReached
      });
      
      // Check if this was the last turn and we need to end the game
      if (isMaxTurns) {
        console.log('Maximum turns reached, calculating winner based on highest score');
        
        // Find the player with the highest score
        const winner = turnHistory.reduce((best, current) => {
          return current.similarity > best.similarity ? current : best;
        }, turnHistory[0] || { similarity: 0, username: 'No one' });
        
        console.log('Winner determined by highest score:', winner);
        
        // Check if it's a tie (highest score under 50%)
        const isTie = winner.similarity < 50;
        
        // End the game on the server so all players get notified
        try {
          await supabase.functions.invoke('matchmaking', {
            body: {
              action: 'complete_roulette_match',
              matchId: matchId,
              winnerUserId: isTie ? null : (winner.userId || winner.user_id),
              gameEndReason: isTie ? 'tie' : 'max_turns'
            }
          });
          
          // Navigate to results with winner information
          navigation.navigate('RouletteResults' as never, { 
            matchId, 
            winner: isTie ? 'Tie' : winner.username,
            winnerScore: winner.similarity,
            gameEndReason: isTie ? 'tie' : 'max_turns'
          } as never);
        } catch (error) {
          console.error('Error ending game:', error);
          // Still navigate to results even if server call fails
          navigation.navigate('RouletteResults' as never, { 
            matchId, 
            winner: isTie ? 'Tie' : winner.username,
            winnerScore: winner.similarity,
            gameEndReason: isTie ? 'tie' : 'max_turns'
          } as never);
        }
        return;
      }
      
      // Don't show alert here - the realtime subscription will show it for all players
      
      if (submitData.gameOver) {
        // Navigate to results after showing the winning alert (realtime will show it)
        setTimeout(() => {
          navigation.navigate('RouletteResults' as never, { matchId } as never);
        }, 3000);
      }
      // If not game over, turn will advance via realtime and canvas will clear automatically
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      Alert.alert('Error', 'Something went wrong.');
      setIsSubmitting(false);
    }
  };

  const getUsernameForId = (userId: string) => {
    const participant = participants.find(p => p.user_id === userId);
    const username = participant?.profiles?.username;
    
    // If we can't find the username, try to fetch it from the server
    if (!username && userId) {
      console.warn('Username not found for user ID:', userId, 'Available participants:', participants.map(p => ({ id: p.user_id, username: p.profiles?.username })));
      
      // Try to refresh participant data if we're missing usernames
      if (participants.length < 2) {
        console.log('Missing participant data, attempting to refresh...');
        refreshParticipantData();
      }
    }
    
    return username || 'Unknown';
  };

  // Function to refresh participant data
  const refreshParticipantData = async () => {
    try {
      console.log('Refreshing participant data...');
      const { data, error } = await supabase.functions.invoke('matchmaking', {
        body: {
          action: 'get_roulette_status',
          matchId: matchId
        }
      });

      if (error) {
        console.error('Error refreshing participant data:', error);
        return;
      }

      if (data.success && data.participants) {
        console.log('Refreshed participant data:', data.participants.map(p => ({ id: p.user_id, username: p.profiles?.username })));
        setParticipants(data.participants);
      }
    } catch (error) {
      console.error('Error in refreshParticipantData:', error);
    }
  };

  // Periodic participant data refresh to ensure synchronization
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      // Only refresh if we don't have complete participant data
      if (participants.length < 2) {
        console.log('Periodic refresh: Missing participant data, refreshing...');
        refreshParticipantData();
      }
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(refreshInterval);
  }, [participants.length, matchId]);

  // Refresh participant data when turn history changes (in case we're missing usernames)
  useEffect(() => {
    if (turnHistory.length > 0) {
      // Check if any turn history entries have 'Unknown' usernames
      const hasUnknownUsernames = turnHistory.some(turn => turn.username === 'Unknown');
      if (hasUnknownUsernames && participants.length < 2) {
        console.log('Turn history has unknown usernames, refreshing participant data...');
        refreshParticipantData();
      }
    }
  }, [turnHistory, participants.length]);

  const getCurrentUsername = () => {
    return getUsernameForId(currentTurnUser);
  };

  const showToast = (title: string, message: string, isWinner: boolean = false) => {
    setToastTitle(title);
    setToastMessage(message);
    setIsWinnerToast(isWinner);
    setToastVisible(true);
    
    // Animate in: scale from 0 to 1 and fade in
    Animated.parallel([
      Animated.spring(toastScaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 60,
        friction: 8,
      }),
      Animated.timing(toastOpacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      })
    ]).start();
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      // Animate out: scale to 0 and fade out
      Animated.parallel([
        Animated.timing(toastScaleAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(toastOpacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        })
      ]).start(() => {
        setToastVisible(false);
        // Reset for next time
        toastScaleAnim.setValue(0);
        toastOpacityAnim.setValue(0);
      });
    }, 5000);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Animated Toast Notification */}
      {toastVisible && (
        <Animated.View 
          style={[
            styles.toastContainer,
            isWinnerToast ? styles.toastWinner : styles.toastNormal,
            {
              opacity: toastOpacityAnim,
              transform: [{ scale: toastScaleAnim }]
            }
          ]}
        >
          <Text style={styles.toastTitle}>{toastTitle}</Text>
          <Text style={styles.toastMessage}>{toastMessage}</Text>
        </Animated.View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🎲 Roulette</Text>
        {isMyTurn && (
          <TouchableOpacity
            style={[styles.submitButton, (isSubmitting || timeLeft === 0) && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting || timeLeft === 0}
          >
            <Text style={styles.submitButtonText}>
              {isSubmitting ? 'Submitting...' : timeLeft === 0 ? 'Time Up!' : 'Submit'}
            </Text>
          </TouchableOpacity>
        )}
        {!isMyTurn && <View style={styles.submitButton} />}
      </View>

      {/* Game Info */}
      <View style={[
        styles.gameInfo,
        isMyTurn ? styles.gameInfoMyTurn : styles.gameInfoOtherTurn
      ]}>
        <Text style={styles.turnText}>
          {isMyTurn ? '🎨 Your Turn!' : `⏳ ${getCurrentUsername()}'s Turn`}
        </Text>
        
        {/* Word Display with underscores */}
        <View style={styles.wordRow}>
          {secretWord.split('').map((ch, idx) => (
            ch === ' ' ? (
              <View key={idx} style={styles.spaceCell} />
            ) : (
              <View key={idx} style={styles.charCell}>
                <Text style={styles.charLetterHidden}>
                  {ch.toUpperCase()}
                </Text>
                <View style={styles.charUnderline} />
              </View>
            )
          ))}
        </View>
        
        <Text style={styles.timerText}>
          Time: {timeLeft}s | Turn {turnNumberState}/{maxTurns}
        </Text>
      </View>

      {/* AI Feedback */}
      {showFeedback && (
        <View style={styles.currentGuessSmall}>
          <Text style={styles.guessTextSmall}>
            AI: "{lastFeedback.guess}" ({lastFeedback.similarity}%)
          </Text>
        </View>
      )}

      {/* Canvas */}
      <View style={styles.canvasContainer}>
        <View
          ref={canvasRef}
          style={styles.canvas}
          {...(isMyTurn ? panResponder.panHandlers : {})}
        >
          <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject}>
            {paths.map((pathData, index) => {
              // Validate path data before rendering
              if (!pathData?.path || typeof pathData.path !== 'string') {
                console.warn('Invalid path at index:', index, pathData);
                return null;
              }
              
              // Check if path contains valid commands (M, L, Q are allowed)
              if (!pathData.path.match(/^M[\d\.\-,\sLQ]+/)) {
                console.warn('Path does not start with valid M command:', pathData.path.substring(0, 50));
                return null;
              }
              
              return (
                <Path
                  key={index}
                  d={pathData.path}
                  stroke={pathData.color || '#000000'}
                  strokeWidth={pathData.strokeWidth || 3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              );
            })}
            {currentPath && currentPath.match(/^M[\d\.\-,\sLQ]+/) && (
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

      {/* Turn History */}
      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {turnHistory.length > 0 && (
          <View style={styles.guessesSection}>
            <Text style={styles.guessesTitle}>Turn History</Text>
            
            <View style={styles.previousGuesses}>
              {turnHistory
                .sort((a, b) => b.similarity - a.similarity) // Sort highest to lowest
                .map((turn, index) => {
                  let barColor = '#E57373';
                  if (turn.similarity === 100) {
                    barColor = '#64B5F6';
                  } else if (turn.similarity >= 80) {
                    barColor = '#81C784';
                  } else if (turn.similarity >= 60) {
                    barColor = '#FFE082';
                  } else if (turn.similarity >= 40) {
                    barColor = '#FFB74D';
                  }
                  
                  return (
                    <View key={index} style={styles.guessItem}>
                      <View style={styles.progressBarContainer}>
                        <View style={[styles.progressBar, { 
                          width: `${turn.similarity}%`,
                          backgroundColor: barColor 
                        }]} />
                        <View style={styles.guessContentInside}>
                          <Text style={styles.guessWordInside}>
                            {turn.username}: "{turn.aiGuess}"
                          </Text>
                        </View>
                        <Text style={styles.guessScoreOutside}>{turn.similarity}%</Text>
                      </View>
                    </View>
                  );
                })}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Side Controls Panel - Only when it's your turn */}
      {isMyTurn && (
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
              disabled={isSubmitting}
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
  toastContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateY: -50 }],
    width: screenWidth - 80,
    marginLeft: -(screenWidth - 80) / 2,
    padding: 24,
    borderRadius: 16,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 15,
    alignItems: 'center',
  },
  toastNormal: {
    backgroundColor: '#4A90E2',
  },
  toastWinner: {
    backgroundColor: '#4CAF50',
  },
  toastTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  toastMessage: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
    textAlign: 'center',
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
  gameInfo: {
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 10,
    borderRadius: 12,
  },
  gameInfoMyTurn: {
    backgroundColor: '#C8E6C9',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  gameInfoOtherTurn: {
    backgroundColor: '#FFCDD2',
    borderWidth: 2,
    borderColor: '#E57373',
  },
  turnText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
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
  charLetterHidden: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
    opacity: 0,
  },
  charUnderline: {
    marginTop: 2,
    width: '100%',
    height: 2,
    backgroundColor: '#333',
    borderRadius: 1,
  },
  timerText: {
    fontSize: 14,
    color: '#666',
  },
  currentGuessSmall: {
    backgroundColor: '#F0F0F0',
    padding: 8,
    borderRadius: 6,
    marginHorizontal: 20,
    marginBottom: 10,
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
    position: 'relative',
  },
  canvas: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContainer: {
    maxHeight: 200,
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
  previousGuesses: {
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
  controlsContainer: {
    position: 'absolute',
    right: 0,
    top: '50%',
    marginTop: -100,
    zIndex: 1000,
    flexDirection: 'row',
  },
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
});

