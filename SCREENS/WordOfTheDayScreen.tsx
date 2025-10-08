import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useRewardedAd } from '../COMPONENTS/RewardedAd';
import { useAppDispatch } from '../store/hooks';
import { authService } from '../store/services/authService';
import { supabase } from '../SUPABASE/supabaseConfig';
import { compressImageToBase64 } from '../utils/imageCompression';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function WordOfTheDayScreen() {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const canvasRef = useRef<View>(null);
  
  // Word of the day state
  const [wordOfTheDay, setWordOfTheDay] = useState<string>('');
  const [isLoadingWord, setIsLoadingWord] = useState(true);
  const [wordError, setWordError] = useState<string | null>(null);
  
  // Drawing state
  const [paths, setPaths] = useState<Array<{ path: string; color: string; strokeWidth: number }>>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(3);
  const [currentPoints, setCurrentPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [scoreMessage, setScoreMessage] = useState<string | null>(null);
  const [isEraseMode, setIsEraseMode] = useState(false);
  const [erasePaths, setErasePaths] = useState<Array<{ path: string; strokeWidth: number }>>([]);

  // Rewarded Ad
  const { showAd: showRewardedAd, isLoaded, isLoading } = useRewardedAd();

  // Fetch word of the day when component mounts
  useEffect(() => {
    fetchWordOfTheDay();
  }, []);

  // Load previous drawing for current word and same day
  const loadPreviousDrawing = async (word: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get today's date in YYYY-MM-DD format
      const today = new Date().toISOString().split('T')[0];
      
      // Check if user has already drawn today's word of the day
      const { data: existingDrawing, error } = await supabase
        .from('drawings')
        .select('svg_url, score, message, created_at')
        .eq('user_id', user.id)
        .eq('word', word)
        .gte('created_at', `${today}T00:00:00.000Z`) // Start of today
        .lt('created_at', `${today}T23:59:59.999Z`)  // End of today
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error('Error checking for existing drawing:', error);
        return;
      }

      if (existingDrawing) {
        console.log('Found existing drawing for today\'s word of the day:', word);
        setScore(existingDrawing.score);
        setScoreMessage(existingDrawing.message);
        
        // Load the SVG content from the bucket
        if (existingDrawing.svg_url) {
          try {
            console.log('Loading SVG from URL:', existingDrawing.svg_url);
            const response = await fetch(existingDrawing.svg_url);
            
            if (!response.ok) {
              console.error('Failed to fetch SVG from bucket:', response.status);
              return;
            }
            
            const svgContent = await response.text();
            console.log('SVG content loaded, length:', svgContent.length);
            
            const { paths } = parseSVGPaths(svgContent);
            console.log('Parsed paths count:', paths.length);
            setPaths(paths);
          } catch (error) {
            console.error('Error loading SVG content from bucket:', error);
          }
        }
      } else {
        console.log('No existing drawing found for today\'s word of the day');
      }
    } catch (error) {
      console.error('Error loading previous drawing:', error);
    }
  };

  // Parse SVG paths from content (same as MyDrawingsScreen)
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

  // Subscribe to word_of_the_day changes for auto refresh
  useEffect(() => {
    const channel = supabase
      .channel('word_of_the_day_changes')
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'word_of_the_day',
          filter: `date=eq.${new Date().toISOString().split('T')[0]}`
        }, 
        (payload) => {
          console.log('New word of the day detected:', payload);
          fetchWordOfTheDay();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchWordOfTheDay = async () => {
    try {
      setIsLoadingWord(true);
      setWordError(null);

      const { data, error } = await supabase
        .rpc('get_word_of_the_day');

      if (error) {
        console.error('Error fetching word of the day:', error);
        setWordError('Failed to load word of the day');
        // No fallback word; keep empty to disable submit
        setWordOfTheDay('');
        return;
      }

      if (data && data.length > 0) {
        const word = data[0].word;
        setWordOfTheDay(word);
        // Load previous drawing for this word
        await loadPreviousDrawing(word);
      } else {
        // If no word is set, leave empty
        console.log('No word of the day found');
        setWordOfTheDay('');
      }
    } catch (error) {
      console.error('Error fetching word of the day:', error);
      setWordError('Failed to load word of the day');
      setWordOfTheDay('');
    } finally {
      setIsLoadingWord(false);
    }
  };

  // Function to create smooth SVG path from points
  const createSmoothPath = (points: Array<{ x: number; y: number }>) => {
    if (points.length < 2) return '';
    
    let path = `M${points[0].x},${points[0].y}`;
    
    if (points.length === 2) {
      path += ` L${points[1].x},${points[1].y}`;
    } else {
      for (let i = 1; i < points.length - 1; i++) {
        const current = points[i];
        const next = points[i + 1];
        const controlX = (current.x + next.x) / 2;
        const controlY = (current.y + next.y) / 2;
        path += ` Q${current.x},${current.y} ${controlX},${controlY}`;
      }
      const lastPoint = points[points.length - 1];
      path += ` L${lastPoint.x},${lastPoint.y}`;
    }
    
    return path;
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      setIsDrawing(true);
      const { locationX, locationY } = evt.nativeEvent;
      const newPoint = { x: locationX, y: locationY };
      setCurrentPoints([newPoint]);
      setCurrentPath(`M${locationX},${locationY}`);
    },
    onPanResponderMove: (evt) => {
      if (isDrawing) {
        const { locationX, locationY } = evt.nativeEvent;
        const newPoint = { x: locationX, y: locationY };
        
        if (isEraseMode) {
          // In erase mode, remove paths that are very close to the touch point
          setPaths(prev => prev.filter(pathData => {
            // Check if the path intersects with the current touch point
            const pathString = pathData.path;
            const points: Array<{ x: number; y: number }> = [];
            
            // Extract all coordinates from the path
            const coordMatches = pathString.match(/\d+\.?\d*,\d+\.?\d*/g);
            if (coordMatches) {
              coordMatches.forEach(coord => {
                const [x, y] = coord.split(',').map(Number);
                if (!isNaN(x) && !isNaN(y)) {
                  points.push({ x: x, y: y });
                }
              });
            }
            
            // Check if any point is within a very small erase radius
            const eraseRadius = Math.max(10, brushSize * 1.5); // Very small erase radius, minimum 10px
            const hasClosePoint = points.some(point => {
              const distance = Math.sqrt((point.x - locationX) ** 2 + (point.y - locationY) ** 2);
              return distance < eraseRadius;
            });
            
            return !hasClosePoint;
          }));
        } else {
          setCurrentPoints(prev => {
            const updatedPoints = [...prev, newPoint];
            const smoothPath = createSmoothPath(updatedPoints);
            setCurrentPath(smoothPath);
            return updatedPoints;
          });
        }
      }
    },
    onPanResponderRelease: () => {
      if (isDrawing) {
        setIsDrawing(false);
        
        if (!isEraseMode) {
          // Only add paths in draw mode, not erase mode
          const finalPath = createSmoothPath(currentPoints);
          setPaths(prev => [...prev, {
            path: finalPath,
            color: brushColor,
            strokeWidth: brushSize
          }]);
        }
        
        setCurrentPath('');
        setCurrentPoints([]);
      }
    },
  });

  const clearCanvas = () => {
    setPaths([]);
    setErasePaths([]);
    setCurrentPath('');
    setCurrentPoints([]);
  };

  const generateSVGString = () => {
    const svgContent = `
      <svg width="100%" height="100%" viewBox="0 0 500 400" xmlns="http://www.w3.org/2000/svg">
        ${paths.map((pathData, index) => (
          `<path key="${index}" d="${pathData.path}" stroke="${pathData.color}" stroke-width="${pathData.strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`
        )).join('')}
        ${currentPath ? `<path d="${currentPath}" stroke="${brushColor}" stroke-width="${brushSize}" fill="none" stroke-linecap="round" stroke-linejoin="round" />` : ''}
      </svg>
    `;
    return svgContent;
  };

  const handleSubmit = async () => {
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
        Alert.alert('Error', 'You must be logged in to score your drawing.');
        return;
      }

      // Call the scoring function
      const scoreResponse = await fetch("https://qxqduzzqcivosdauqpis.functions.supabase.co/score-drawing", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          pngBase64: base64,
          word: wordOfTheDay
        })
      });

      if (!scoreResponse.ok) {
        console.error('Score API error:', scoreResponse.status, scoreResponse.statusText);
        const errorText = await scoreResponse.text();
        console.error('Error response:', errorText);
        Alert.alert('Scoring Error', 'Failed to score your drawing. Please try again.');
        return;
      }

      const responseText = await scoreResponse.text();
      console.log('Raw response:', responseText);
      
      let scoreData;
      try {
        scoreData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Response was not JSON:', responseText);
        Alert.alert('Scoring Error', 'Invalid response from scoring service. Please try again.');
        return;
      }

      console.log("Similarity score:", scoreData.score);
      console.log("Score message:", scoreData.message);
      setScore(scoreData.score);
      setScoreMessage(scoreData.message);

      // Show score alert with continue option that triggers rewarded ad
      Alert.alert(
        'Drawing Complete!',
        `Your drawing scored ${scoreData.score}%!\n\n${scoreData.message}`,
        [
          {
            text: 'Continue',
            onPress: async () => {
              console.log('🎬 Word of the Day: Continue button pressed');
              // Automatically show rewarded ad when user continues
              const result = await showRewardedAd((rewarded) => {
                console.log('🎁 Word of the Day: Reward callback triggered, rewarded:', rewarded);
                if (rewarded) {
                  console.log('🎉 Word of the Day: User earned reward, updating tokens');
                  // Update user's tokens in database and local state
                  dispatch(authService.updateUserTokens(1));
                  Alert.alert(
                    'Reward Earned!',
                    'You earned 1 Token! Thanks for watching the ad.',
                    [{ text: 'Awesome!', style: 'default' }]
                  );
                } else {
                  console.log('❌ Word of the Day: No reward earned');
                }
              });
              
              console.log('📊 Word of the Day: Ad result:', result);
              if (!result.success) {
                console.log('Ad not ready, continuing without reward');
              }
            }
          }
        ]
      );

      // Generate SVG string for storage
      const svgString = generateSVGString();
      
      // Create a unique filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `drawing-${user.id}-${timestamp}.svg`;

      // Upload SVG to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('drawings')
        .upload(filename, svgString, {
          contentType: 'image/svg+xml',
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        Alert.alert('Upload Error', 'Failed to upload your drawing. Please try again.');
        return;
      }

      // Get the public URL
      const { data: urlData } = supabase.storage
        .from('drawings')
        .getPublicUrl(filename);

      // Save drawing data to database with score and message
      const { error: dbError } = await supabase
        .from('drawings')
        .insert({
          user_id: user.id,
          word: wordOfTheDay,
          svg_url: urlData.publicUrl,
          score: scoreData.score,
          message: scoreData.message,
          created_at: new Date().toISOString()
        });

      if (dbError) {
        console.error('Database error:', dbError);
        Alert.alert('Database Error', 'Failed to save your drawing. Please try again.');
        return;
      }

      // Remove the alert - score is now displayed above the image
      // Alert.alert(
      //   'Success!', 
      //   `Your drawing has been submitted successfully!\n\nAI Score: ${scoreData.score}%`,
      //   [
      //     {
      //       text: 'OK',
      //       onPress: () => navigation.goBack()
      //     }
      //   ]
      // );

    } catch (error) {
      console.error('Submit error:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const colors = ['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Word of the Day</Text>
        </View>
        <View style={styles.wordContainer}>
          {isLoadingWord ? (
            <Text style={styles.wordText}>Loading...</Text>
          ) : wordError ? (
            <View>
              <Text style={styles.wordText}>{wordOfTheDay}</Text>
              <Text style={styles.errorText}>{wordError}</Text>
            </View>
          ) : (
            <Text style={styles.wordText}>{wordOfTheDay}</Text>
          )}
        </View>
        {/* Drawing Instructions and Submit Button - only show if no score yet */}
        {score === null && !isLoadingWord && wordOfTheDay && (
          <View style={styles.drawingHeader}>
            <Text style={styles.subtitle}>Draw this word!</Text>
            <TouchableOpacity 
              style={[styles.submitButton, (isSubmitting || !wordOfTheDay) && styles.submitButtonDisabled]} 
              onPress={handleSubmit}
              disabled={isSubmitting || !wordOfTheDay}
            >
              <Text style={styles.submitButtonText}>
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        
        {/* Score Display */}
        {score !== null && (
          <View style={styles.scoreContainer}>
            <Text style={styles.scoreText}>
              AI Score: {score}%
            </Text>
            {scoreMessage && (
              <Text style={styles.scoreMessage}>
                {scoreMessage}
              </Text>
            )}
            <Text style={styles.completionMessage}>
              🎉 You've completed today's Word of the Day! Come back tomorrow for a new challenge.
            </Text>
          </View>
        )}
        
        {/* Drawing Canvas */}
        <View style={styles.canvasContainer}>
          <View ref={canvasRef} style={styles.canvas} {...(score === null ? panResponder.panHandlers : {})}>
            <Svg style={styles.svg}>
              {/* Render all completed paths */}
              {paths.map((pathData, pathIndex) => (
                <Path
                  key={pathIndex}
                  d={pathData.path}
                  stroke={pathData.color}
                  strokeWidth={pathData.strokeWidth}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              
              {/* Render current path being drawn */}
              {currentPath && !isEraseMode && (
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

        {/* Drawing Tools - only show if not completed */}
        {score === null && (
          <View style={styles.toolsContainer}>
            <View style={styles.colorPalette}>
              {colors.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorButton,
                    { backgroundColor: color },
                    brushColor === color && styles.selectedColor
                  ]}
                  onPress={() => setBrushColor(color)}
                />
              ))}
            </View>
            
            <View style={styles.brushSizeContainer}>
              <Text style={styles.brushSizeLabel}>Brush Size:</Text>
              <TouchableOpacity
                style={[styles.brushSizeButton, brushSize === 1 && styles.selectedBrushSize]}
                onPress={() => setBrushSize(1)}
              >
                <View style={[styles.brushSizeIndicator, { width: 4, height: 4, backgroundColor: brushColor }]} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.brushSizeButton, brushSize === 3 && styles.selectedBrushSize]}
                onPress={() => setBrushSize(3)}
              >
                <View style={[styles.brushSizeIndicator, { width: 8, height: 8, backgroundColor: brushColor }]} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.brushSizeButton, brushSize === 5 && styles.selectedBrushSize]}
                onPress={() => setBrushSize(5)}
              >
                <View style={[styles.brushSizeIndicator, { width: 12, height: 12, backgroundColor: brushColor }]} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.actionButtons}>
              <TouchableOpacity 
                style={[styles.actionButton, isEraseMode && styles.activeActionButton]} 
                onPress={() => setIsEraseMode(!isEraseMode)}
              >
                <Text style={[styles.actionButtonText, isEraseMode && styles.activeActionButtonText]}>
                  {isEraseMode ? '✏️ Draw' : '🧽 Erase'}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.clearButton} onPress={clearCanvas}>
                <Text style={styles.clearButtonText}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
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
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 10,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: '#34C759',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  wordContainer: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  wordText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  drawingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    fontStyle: 'italic',
    flex: 1,
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
    position: 'relative',
  },
  svg: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  toolsContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  colorPalette: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
  },
  colorButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedColor: {
    borderColor: '#007AFF',
    borderWidth: 3,
  },
  brushSizeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  brushSizeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginRight: 10,
  },
  brushSizeButton: {
    padding: 8,
    marginHorizontal: 5,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedBrushSize: {
    borderColor: '#007AFF',
  },
  brushSizeIndicator: {
    borderRadius: 50,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  actionButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 12,
    flex: 1,
    alignItems: 'center',
  },
  activeActionButton: {
    backgroundColor: '#34C759',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  activeActionButtonText: {
    color: '#fff',
  },
  clearButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    padding: 12,
    flex: 1,
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scoreContainer: {
    backgroundColor: '#e8f5e8',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#34C759',
  },
  scoreText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#34C759',
  },
  scoreMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  errorText: {
    fontSize: 12,
    color: '#FF6B6B',
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
  completionMessage: {
    fontSize: 12,
    color: '#2E7D32',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
    fontFamily: 'Nunito_600SemiBold',
  },
});
