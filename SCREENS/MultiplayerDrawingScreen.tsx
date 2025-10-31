import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import DrawingToolsPalette from '../COMPONENTS/DrawingToolsPalette';
import { supabase } from '../SUPABASE/supabaseConfig';
import { compressImageToBase64 } from '../utils/imageCompression';

const { width, height } = Dimensions.get('window');

interface RouteParams {
  matchId: string;
  word: string;
}

export default function MultiplayerDrawingScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { matchId, word } = route.params as RouteParams;
  
  const [timeLeft, setTimeLeft] = useState(60); // 1 minute timer
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [paths, setPaths] = useState<Array<{ path: string; color: string; strokeWidth: number }>>([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [opponentSubmitted, setOpponentSubmitted] = useState(false);
  const [brushSize, setBrushSize] = useState(3);
  const [brushColor, setBrushColor] = useState('#000000');
  const [currentPoints, setCurrentPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [isEraseMode, setIsEraseMode] = useState(false);
  
  // Side controls animation
  const [isControlsExpanded, setIsControlsExpanded] = useState(false);
  const slideAnimation = useRef(new Animated.Value(0)).current;
  
  const svgRef = useRef<Svg>(null);
  const canvasRef = useRef<View>(null);

  // Timer countdown
  useEffect(() => {
    if (timeLeft > 0 && !isSubmitted) {
      const timer = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0 && !isSubmitted) {
      // Auto-submit when time runs out
      handleSubmit();
    }
  }, [timeLeft, isSubmitted]);

  // Subscribe to realtime updates for opponent status
  useEffect(() => {
    console.log('Setting up realtime subscription for drawing match:', matchId);
    
    const channel = supabase
      .channel(`drawing-match-${matchId}`)
      // Listen for participant submission changes
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_participants',
          filter: `match_id=eq.${matchId}`
        },
        async (payload) => {
          console.log('Participant submission update:', payload);
          
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            
            // Check if the opponent has submitted
            const { data: participants, error } = await supabase
              .from('match_participants')
              .select('user_id, submitted')
              .eq('match_id', matchId);
            
            if (participants && !error) {
              const opponent = participants.find(p => p.user_id !== user.id);
              if (opponent?.submitted) {
                console.log('Opponent has submitted their drawing!');
                setOpponentSubmitted(true);
              }
              
              // Also check if match is completed (in case match update event didn't fire)
              const { data: matchData, error: matchError } = await supabase
                .from('matches')
                .select('status')
                .eq('id', matchId)
                .single();
              
              if (matchData?.status === 'completed') {
                console.log('Match is completed, navigating to results');
                setTimeout(() => {
                  navigation.navigate('MultiplayerResults' as never, { matchId } as never);
                }, 500);
              }
            }
          } catch (error) {
            console.error('Error checking opponent submission:', error);
          }
        }
      )
      // Listen for match completion
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `id=eq.${matchId}`
        },
        async (payload) => {
          console.log('Match status update:', payload);
          if (payload.new?.status === 'completed') {
            console.log('Match completed, navigating to results');
            // Small delay to ensure database has finalized rankings
            setTimeout(() => {
              navigation.navigate('MultiplayerResults' as never, { matchId } as never);
            }, 500);
          }
        }
      )
      .subscribe((status) => {
        console.log('Drawing match subscription status:', status);
      });

    return () => {
      console.log('Cleaning up drawing match subscription');
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  // Create smooth path from points
  const createSmoothPath = (points: Array<{ x: number; y: number }>) => {
    if (points.length < 2) return '';
    
    // Validate first point
    if (!isFinite(points[0].x) || !isFinite(points[0].y)) {
      console.error('Invalid starting point:', points[0]);
      return '';
    }
    
    let path = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
    
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      
      // Validate current point
      if (!isFinite(curr.x) || !isFinite(curr.y)) {
        console.error('Invalid point at index', i, ':', curr);
        continue;
      }
      
      if (next) {
        // Validate next point
        if (!isFinite(next.x) || !isFinite(next.y)) {
          path += ` L${curr.x.toFixed(2)},${curr.y.toFixed(2)}`;
          continue;
        }
        
        // Use quadratic curves for smooth lines
        const cp1x = prev.x + (curr.x - prev.x) * 0.5;
        const cp1y = prev.y + (curr.y - prev.y) * 0.5;
        const cp2x = curr.x - (next.x - curr.x) * 0.5;
        const cp2y = curr.y - (next.y - curr.y) * 0.5;
        
        // Validate control points
        if (!isFinite(cp1x) || !isFinite(cp1y) || !isFinite(cp2x) || !isFinite(cp2y)) {
          path += ` L${curr.x.toFixed(2)},${curr.y.toFixed(2)}`;
        } else {
          path += ` Q${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${curr.x.toFixed(2)},${curr.y.toFixed(2)}`;
        }
      } else {
        path += ` L${curr.x.toFixed(2)},${curr.y.toFixed(2)}`;
      }
    }
    
    return path;
  };

  // PanResponder for drawing
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => !isSubmitted,
    onMoveShouldSetPanResponder: () => !isSubmitted,
    onPanResponderGrant: (evt) => {
      if (isSubmitted) return;
      const { locationX, locationY } = evt.nativeEvent;
      
      // Validate coordinates
      if (!isFinite(locationX) || !isFinite(locationY)) {
        console.error('Invalid coordinates on grant:', { locationX, locationY });
        return;
      }
      
      setIsDrawing(true);
      const newPoint = { x: locationX, y: locationY };
      setCurrentPoints([newPoint]);
      setCurrentPath(`M${locationX.toFixed(2)},${locationY.toFixed(2)}`);
    },
    onPanResponderMove: (evt) => {
      if (!isDrawing || isSubmitted) return;
      const { locationX, locationY } = evt.nativeEvent;
      
      // Validate coordinates
      if (!isFinite(locationX) || !isFinite(locationY)) {
        console.error('Invalid coordinates on move:', { locationX, locationY });
        return;
      }
      
      const newPoint = { x: locationX, y: locationY };
      setCurrentPoints(prev => [...prev, newPoint]);
      
      const smoothPath = createSmoothPath([...currentPoints, newPoint]);
      setCurrentPath(smoothPath);
    },
    onPanResponderRelease: () => {
      if (!isDrawing || isSubmitted) return;
      setIsDrawing(false);
      
      const finalPath = createSmoothPath(currentPoints);
      setPaths(prev => [...prev, {
        path: finalPath,
        color: brushColor,
        strokeWidth: brushSize
      }]);
      
      setCurrentPath('');
      setCurrentPoints([]);
    },
  });

  const clearDrawing = () => {
    if (isSubmitted) return;
    setPaths([]);
    setCurrentPath('');
    setCurrentPoints([]);
  };

  const undoLastStroke = () => {
    if (isSubmitted) return;
    if (paths.length > 0) {
      setPaths(prev => prev.slice(0, -1));
    }
  };

  const handleSubmit = async () => {
    if (isSubmitted) return;
    
    try {
      setIsSubmitted(true);
      
      // Get the current session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Error', 'You must be logged in to submit a drawing.');
        setIsSubmitted(false);
        return;
      }

      // Get the current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to submit a drawing.');
        setIsSubmitted(false);
        return;
      }

      // Compress the canvas to base64 using centralized compression utility
      console.log('Capturing drawing as JPEG...');
      const base64 = await compressImageToBase64(canvasRef);

      // Generate SVG string for storage (same as other screens)
      const svgString = `
        <svg width="${width - 40}" height="${height - 200}" xmlns="http://www.w3.org/2000/svg">
          ${paths.map((pathData, index) => (
            `<path key="${index}" d="${pathData.path}" stroke="${pathData.color}" strokeWidth="${pathData.strokeWidth}" fill="none" />`
          )).join('')}
          ${currentPath ? `<path d="${currentPath}" stroke="${brushColor}" strokeWidth="${brushSize}" fill="none" />` : ''}
        </svg>
      `;

      // Upload SVG to Supabase Storage (same as other screens)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `multiplayer-drawing-${user.id}-${matchId}-${timestamp}.svg`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('drawings')
        .upload(filename, svgString, {
          contentType: 'image/svg+xml',
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        Alert.alert('Error', 'Failed to save your drawing. Please try again.');
        setIsSubmitted(false);
        return;
      }

      // Get the public URL
      const { data: urlData } = supabase.storage
        .from('drawings')
        .getPublicUrl(filename);

      console.log('Generated SVG URL:', urlData.publicUrl);

      // Call the scoring function (same as WordOfTheDayScreen and DuelInProgressScreen)
      console.log('🎨 [MultiplayerDrawing] Calling AI scoring service...', {
        matchId,
        word,
        userId: user.id,
        base64Length: base64.length
      });
      
      // Add timeout wrapper for fetch to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Scoring request timed out after 30 seconds')), 30000);
      });
      
      const fetchPromise = fetch("https://qxqduzzqcivosdauqpis.functions.supabase.co/score-drawing", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          pngBase64: base64,
          word: word
        })
      });
      
      const scoreResponse = await Promise.race([fetchPromise, timeoutPromise]) as Response;

      if (!scoreResponse || !scoreResponse.ok) {
        const errorMessage = !scoreResponse 
          ? 'Request timed out or failed'
          : `${scoreResponse.status}: ${scoreResponse.statusText}`;
        
        console.error('❌ [MultiplayerDrawing] Score API error:', {
          status: scoreResponse?.status,
          statusText: scoreResponse?.statusText,
          matchId,
          word,
          errorMessage
        });
        Alert.alert('Scoring Error', `Failed to score your drawing: ${errorMessage}. Please try again.`);
        setIsSubmitted(false);
        return;
      }

      const responseText = await scoreResponse.text();
      console.log('📥 [MultiplayerDrawing] AI Response (raw):', {
        matchId,
        word,
        responseLength: responseText.length,
        responsePreview: responseText.substring(0, 200)
      });
      
      let scoreData;
      try {
        scoreData = JSON.parse(responseText);
        console.log('✅ [MultiplayerDrawing] AI Response (parsed):', {
          matchId,
          word,
          scoreData: JSON.stringify(scoreData, null, 2)
        });
      } catch (parseError) {
        console.error('❌ [MultiplayerDrawing] JSON parse error:', {
          matchId,
          word,
          error: parseError,
          responseText: responseText.substring(0, 500)
        });
        Alert.alert('Scoring Error', 'Invalid response from scoring service. Please try again.');
        setIsSubmitted(false);
        return;
      }

      const aiScore = scoreData.score || 0;
      const aiMessage = scoreData.message || 'Drawing scored successfully';
      
      console.log('🎯 [MultiplayerDrawing] AI Scoring Results:', {
        matchId,
        word,
        userId: user.id,
        score: aiScore,
        message: aiMessage,
        fullResponse: scoreData
      });

      // Submit the drawing with AI score to the match
      console.log('📤 [MultiplayerDrawing] Submitting to matchmaking function...', {
        matchId,
        word,
        userId: user.id,
        aiScore,
        aiMessage: aiMessage?.substring(0, 50)
      });
      
      const { data, error } = await supabase.functions.invoke('matchmaking', {
        body: {
          action: 'submit_match_drawing',
          matchId: matchId,
          svgUrl: urlData.publicUrl,
          aiScore: aiScore,
          aiMessage: aiMessage
        }
      });

      console.log('📥 [MultiplayerDrawing] Matchmaking response:', {
        matchId,
        word,
        userId: user.id,
        hasError: !!error,
        error: error ? {
          message: error.message,
          name: error.name,
          details: error
        } : null,
        hasData: !!data,
        data: data ? JSON.stringify(data).substring(0, 200) : null
      });

      if (error) {
        console.error('❌ [MultiplayerDrawing] Error submitting drawing:', {
          matchId,
          word,
          userId: user.id,
          error: {
            message: error.message,
            name: error.name,
            status: error.status,
            details: error
          }
        });
        Alert.alert('Error', `Failed to submit drawing: ${error.message || 'Unknown error'}. Please try again.`);
        setIsSubmitted(false);
        return;
      }

      if (!data) {
        console.error('❌ [MultiplayerDrawing] No data in response:', {
          matchId,
          word,
          userId: user.id
        });
        Alert.alert('Submission Error', 'No response from server. Please try again.');
        setIsSubmitted(false);
        return;
      }

      if (data.success) {
        console.log('✅ [MultiplayerDrawing] Drawing submitted successfully:', {
          matchId,
          word,
          userId: user.id,
          score: aiScore,
          message: aiMessage,
          drawingId: data.drawing_id
        });
        // Don't navigate immediately - wait for match to complete via realtime subscription
        // The realtime subscription will handle navigation when match status becomes 'completed'
      } else {
        console.error('❌ [MultiplayerDrawing] Submission failed:', {
          matchId,
          word,
          userId: user.id,
          score: aiScore,
          error: data.error,
          details: data.details,
          fullResponse: data
        });
        const errorMessage = data.error || data.details || 'Unknown error';
        Alert.alert('Submission Error', `Failed to submit drawing: ${errorMessage}. Please try again.`);
        setIsSubmitted(false);
        return;
      }
    } catch (error) {
      console.error('❌ [MultiplayerDrawing] Error in handleSubmit:', {
        matchId,
        word,
        userId: user?.id,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error
      });
      Alert.alert('Error', 'Something went wrong. Please try again.');
      setIsSubmitted(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.wordText}>Draw: {word}</Text>
        <Text style={styles.timerText}>
          {formatTime(timeLeft)}
        </Text>
      </View>

      <View style={styles.drawingContainer}>
        <View ref={canvasRef} style={styles.drawingArea} {...panResponder.panHandlers}>
          <Svg
            ref={svgRef}
            width={width - 40}
            height={height - 400}
            style={styles.svg}
          >
            {paths.map((pathData, index) => {
              // Validate path data before rendering
              if (!pathData?.path || typeof pathData.path !== 'string') {
                console.warn('Invalid path at index:', index, pathData);
                return null;
              }
              
              // Check if path contains invalid values
              if (pathData.path.includes('NaN') || pathData.path.includes('Infinity')) {
                console.warn('Path contains invalid numbers at index:', index);
                return null;
              }
              
              // Check if path has valid format (M for move, L for line, Q for curve)
              if (!pathData.path.match(/^M[\d\.\-,\sLQ]+/)) {
                console.warn('Path does not have valid format at index:', index);
                return null;
              }
              
              return (
                <Path
                  key={index}
                  d={pathData.path}
                  stroke={pathData.color || '#000000'}
                  strokeWidth={pathData.strokeWidth || 3}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}
            {currentPath && !currentPath.includes('NaN') && !currentPath.includes('Infinity') && (
              <Path
                d={currentPath}
                stroke={brushColor}
                strokeWidth={brushSize}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </Svg>
        </View>
      </View>

      {/* Side Controls Panel - Only show when not submitted */}
      {!isSubmitted && (
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
              onClear={clearDrawing}
              disabled={isSubmitted}
            />
          </View>
        </Animated.View>
      )}

      <View style={styles.controls}>
        <TouchableOpacity 
          style={[
            styles.submitButton, 
            isSubmitted && styles.buttonDisabled,
            timeLeft === 0 && styles.autoSubmitButton
          ]} 
          onPress={handleSubmit}
          disabled={isSubmitted}
        >
          <Text style={styles.submitButtonText}>
            {isSubmitted ? 'Submitted ✓' : timeLeft === 0 ? 'Auto-Submitted' : 'Submit Drawing'}
          </Text>
        </TouchableOpacity>
      </View>

      {opponentSubmitted && (
        <View style={styles.opponentStatus}>
          <Text style={styles.opponentStatusText}>
            🎨 Your opponent has submitted their drawing!
          </Text>
        </View>
      )}

      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          {isSubmitted 
            ? opponentSubmitted 
              ? 'Both drawings submitted! Calculating results...' 
              : 'Drawing submitted! Waiting for opponent...'
            : 'Draw the word above!'}
        </Text>
      </View>
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
    padding: 20,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  wordText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  timerText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF3B30',
  },
  drawingContainer: {
    flex: 1,
    backgroundColor: '#fff',
    margin: 20,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  drawingArea: {
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
  },
  svg: {
    backgroundColor: '#fff',
  },
  controlsContainer: {
    position: 'absolute',
    right: 0,
    top: '50%',
    marginTop: -100,
    zIndex: 1000,
    flexDirection: 'row',
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
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  submitButton: {
    backgroundColor: '#34C759',
    borderRadius: 8,
    padding: 12,
    minWidth: 150,
    alignItems: 'center',
  },
  autoSubmitButton: {
    backgroundColor: '#8E44AD',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  opponentStatus: {
    backgroundColor: '#E3F2FD',
    padding: 10,
    margin: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  opponentStatusText: {
    color: '#1976D2',
    fontSize: 14,
    fontWeight: '600',
  },
  statusContainer: {
    padding: 20,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
