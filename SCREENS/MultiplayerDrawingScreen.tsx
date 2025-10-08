import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
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
        (payload) => {
          console.log('Match status update:', payload);
          if (payload.new?.status === 'completed') {
            console.log('Match completed, navigating to results');
            navigation.navigate('MultiplayerResults' as never, { matchId } as never);
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
    
    let path = `M${points[0].x},${points[0].y}`;
    
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      
      if (next) {
        // Use quadratic curves for smooth lines
        const cp1x = prev.x + (curr.x - prev.x) * 0.5;
        const cp1y = prev.y + (curr.y - prev.y) * 0.5;
        const cp2x = curr.x - (next.x - curr.x) * 0.5;
        const cp2y = curr.y - (next.y - curr.y) * 0.5;
        path += ` Q${cp1x},${cp1y} ${curr.x},${curr.y}`;
      } else {
        path += ` L${curr.x},${curr.y}`;
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
      setIsDrawing(true);
      const { locationX, locationY } = evt.nativeEvent;
      const newPoint = { x: locationX, y: locationY };
      setCurrentPoints([newPoint]);
      setCurrentPath(`M${locationX},${locationY}`);
    },
    onPanResponderMove: (evt) => {
      if (!isDrawing || isSubmitted) return;
      const { locationX, locationY } = evt.nativeEvent;
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
      console.log('Calling AI scoring service...');
      const scoreResponse = await fetch("https://qxqduzzqcivosdauqpis.functions.supabase.co/score-drawing", {
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

      if (!scoreResponse.ok) {
        console.error('Score API error:', scoreResponse.status, scoreResponse.statusText);
        Alert.alert('Scoring Error', 'Failed to score your drawing. Please try again.');
        setIsSubmitted(false);
        return;
      }

      const responseText = await scoreResponse.text();
      let scoreData;
      try {
        scoreData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        Alert.alert('Scoring Error', 'Invalid response from scoring service. Please try again.');
        setIsSubmitted(false);
        return;
      }

      console.log("Similarity score:", scoreData.score);
      console.log("Score message:", scoreData.message);

      const aiScore = scoreData.score || 0;
      const aiMessage = scoreData.message || 'Drawing scored successfully';

      // Submit the drawing with AI score to the match
      const { data, error } = await supabase.functions.invoke('matchmaking', {
        body: {
          action: 'submit_match_drawing',
          matchId: matchId,
          svgUrl: urlData.publicUrl,
          aiScore: aiScore,
          aiMessage: aiMessage
        }
      });

      if (error) {
        console.error('Error submitting drawing:', error);
        Alert.alert('Error', 'Failed to submit drawing. Please try again.');
        setIsSubmitted(false);
        return;
      }

      if (data.success) {
        console.log('Drawing submitted successfully with score:', aiScore);
        // Navigate to results screen
        navigation.navigate('MultiplayerResults' as never, { matchId: matchId } as never);
      }
    } catch (error) {
      console.error('Error in handleSubmit:', error);
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
            {currentPath && (
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

      {/* Brush Controls */}
      <View style={styles.brushControls}>
        <Text style={styles.brushLabel}>Brush Size:</Text>
        <View style={styles.brushSizeContainer}>
          {[1, 3, 5, 8, 12].map((size) => (
            <TouchableOpacity
              key={size}
              style={[
                styles.brushSizeButton,
                brushSize === size && styles.brushSizeButtonActive
              ]}
              onPress={() => setBrushSize(size)}
            >
              <View style={[styles.brushSizeIndicator, { 
                width: size * 2, 
                height: size * 2, 
                backgroundColor: brushColor 
              }]} />
            </TouchableOpacity>
          ))}
        </View>
        
        <Text style={styles.brushLabel}>Colors:</Text>
        <View style={styles.colorContainer}>
          {['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'].map((color) => (
            <TouchableOpacity
              key={color}
              style={[
                styles.colorButton,
                { backgroundColor: color },
                brushColor === color && styles.colorButtonActive
              ]}
              onPress={() => setBrushColor(color)}
            />
          ))}
        </View>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity 
          style={[styles.clearButton, isSubmitted && styles.buttonDisabled]} 
          onPress={clearDrawing}
          disabled={isSubmitted}
        >
          <Text style={styles.clearButtonText}>🗑️ Clear</Text>
        </TouchableOpacity>

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
          {isSubmitted ? 'Drawing submitted! Waiting for results...' : 'Draw the word above!'}
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
  brushControls: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    marginHorizontal: 20,
    borderRadius: 8,
    marginBottom: 10,
  },
  brushLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  brushSizeContainer: {
    flexDirection: 'row',
    marginBottom: 15,
    justifyContent: 'space-around',
  },
  brushSizeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brushSizeButtonActive: {
    borderColor: '#007AFF',
    backgroundColor: '#E3F2FD',
  },
  brushSizeIndicator: {
    borderRadius: 50,
  },
  colorContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  colorButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  colorButtonActive: {
    borderColor: '#007AFF',
    borderWidth: 3,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  clearButton: {
    backgroundColor: '#FF9500',
    borderRadius: 8,
    padding: 12,
    minWidth: 100,
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
