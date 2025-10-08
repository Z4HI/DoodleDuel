import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../SUPABASE/supabaseConfig';
import { compressImageToBase64 } from '../utils/imageCompression';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface DuelInProgressRouteParams {
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

export default function DuelInProgressScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const canvasRef = useRef<View>(null);
  
  const { duelId } = route.params as DuelInProgressRouteParams;
  
  // Duel data state
  const [duelData, setDuelData] = useState<DuelData | null>(null);
  const [loading, setLoading] = useState(true);
  
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
  const [duelStatus, setDuelStatus] = useState<'pending' | 'completed'>('pending');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [scoreMessage, setScoreMessage] = useState<string | null>(null);
  const [hasNavigatedToOutcome, setHasNavigatedToOutcome] = useState(false);

  const loadDuelData = async () => {
    try {
      setLoading(true);
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        Alert.alert('Error', 'You must be logged in to view this duel.');
        navigation.goBack();
        return;
      }

      // Get duel data
      const { data: duel, error } = await supabase
        .from('duels')
        .select(`
          id,
          challenger_id,
          opponent_id,
          word,
          difficulty,
          gamemode,
          status
        `)
        .eq('id', duelId)
        .single();

      if (error) {
        console.error('Error loading duel:', error);
        Alert.alert('Error', 'Failed to load duel data.');
        navigation.goBack();
        return;
      }

      if (!duel) {
        Alert.alert('Error', 'Duel not found.');
        navigation.goBack();
        return;
      }

      // Get challenger and opponent usernames separately
      const [challengerResult, opponentResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('username')
          .eq('id', duel.challenger_id)
          .single(),
        supabase
          .from('profiles')
          .select('username')
          .eq('id', duel.opponent_id)
          .single()
      ]);

      const challengerUsername = challengerResult.data?.username || 'Unknown';
      const opponentUsername = opponentResult.data?.username || 'Unknown';

      console.log('Loaded duel data:', {
        duelId: duel.id,
        challengerUsername,
        opponentUsername,
        currentUserId: currentUser.id,
        challengerId: duel.challenger_id,
        opponentId: duel.opponent_id
      });

      // Transform the data
      const transformedDuel: DuelData = {
        id: duel.id,
        challenger_id: duel.challenger_id,
        opponent_id: duel.opponent_id,
        word: duel.word,
        difficulty: duel.difficulty,
        gamemode: duel.gamemode as 'doodleDuel' | 'doodleHunt',
        status: duel.status as 'duel_sent' | 'in_progress' | 'completed',
        challenger_username: challengerUsername,
        opponent_username: opponentUsername,
        isChallenger: duel.challenger_id === currentUser.id
      };

      setDuelData(transformedDuel);
    } catch (error) {
      console.error('Error loading duel data:', error);
      Alert.alert('Error', 'Failed to load duel data.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDuelData();
  }, [duelId]);

  const parseSVGPaths = (svgContent: string) => {
    if (!svgContent) return { paths: [], viewBox: '0 0 100% 100%' };
    
    try {
      // Extract viewBox from SVG
      const viewBoxMatch = svgContent.match(/viewBox="([^"]*)"/);
      const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 100% 100%';
      
      // Extract path elements from SVG content
      const pathRegex = /<path[^>]*d="([^"]*)"[^>]*stroke="([^"]*)"[^>]*stroke-width="([^"]*)"[^>]*\/>/g;
      const paths = [];
      let match;
      
      while ((match = pathRegex.exec(svgContent)) !== null) {
        paths.push({
          path: match[1],
          color: match[2],
          strokeWidth: parseFloat(match[3]) || 3
        });
      }
      
      return { paths, viewBox };
    } catch (error) {
      console.error('Error parsing SVG:', error);
      return { paths: [], viewBox: '0 0 100% 100%' };
    }
  };

  // Check if user has already submitted a drawing
  useEffect(() => {
    const checkSubmissionStatus = async () => {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (!currentUser) return;

        const { data: duelData, error } = await supabase
          .from('duels')
          .select(`
            challenger_drawing_id, 
            opponent_drawing_id, 
            challenger_id, 
            opponent_id,
            challenger_drawing:challenger_drawing_id(score, message, svg_url),
            opponent_drawing:opponent_drawing_id(score, message, svg_url)
          `)
          .eq('id', duelId)
          .single();

        if (error || !duelData) {
          console.error('Error checking duel status:', error);
          return;
        }

        // Check if current user has already submitted
        const isChallenger = duelData.challenger_id === currentUser.id;
        const hasUserSubmitted = isChallenger 
          ? duelData.challenger_drawing_id !== null 
          : duelData.opponent_drawing_id !== null;

        if (hasUserSubmitted) {
          setHasSubmitted(true);
          
          // Get the user's drawing data from the joined query
          const userDrawing = isChallenger ? duelData.challenger_drawing : duelData.opponent_drawing;
          
          if (userDrawing) {
            setScore(userDrawing.score);
            setScoreMessage(userDrawing.message || `Your drawing scored ${userDrawing.score}%!`);
            
            // Load the existing SVG content
            if (userDrawing.svg_url) {
              try {
                console.log('Attempting to fetch SVG from URL:', userDrawing.svg_url);
                // Fetch the SVG content from the URL (same as MyDrawingsScreen)
                const response = await fetch(userDrawing.svg_url);
                console.log('SVG fetch response status:', response.status);
                
                if (!response.ok) {
                  console.error('SVG fetch failed with status:', response.status);
                  return;
                }
                
                const svgContent = await response.text();
                console.log('SVG content length:', svgContent.length);
                const { paths } = parseSVGPaths(svgContent);
                console.log('Parsed paths count:', paths.length);
                setPaths(paths);
              } catch (error) {
                console.error('Error loading SVG content:', error);
                console.error('SVG URL was:', userDrawing.svg_url);
              }
            } else {
              console.log('No SVG URL found for user drawing');
            }
          }
        }
      } catch (error) {
        console.error('Error checking submission status:', error);
      }
    };

    checkSubmissionStatus();
  }, [duelId]);

  // Poll for duel completion when user has submitted but duel is still in progress
  useEffect(() => {
    if (!hasSubmitted || hasNavigatedToOutcome) return;

    const pollForCompletion = async () => {
      try {
        const { data: duelData, error } = await supabase
          .from('duels')
          .select(`
            id,
            status,
            winner_id,
            challenger_id,
            opponent_id
          `)
          .eq('id', duelId)
          .single();

        if (error || !duelData) {
          console.error('Error polling duel status:', error);
          return;
        }

        if (duelData.status === 'completed') {
          // Set flag to prevent multiple navigations
          setHasNavigatedToOutcome(true);
          
          // Determine if current user won
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          const userWon = currentUser && duelData.winner_id === currentUser.id;
          
          // Navigate to results screen
          navigation.replace('DuelFriendResults', {
            duelId: duelId
          });
        }
      } catch (error) {
        console.error('Error polling for completion:', error);
      }
    };

    // Poll every 2 seconds if user has submitted but duel is still in progress
    const interval = setInterval(pollForCompletion, 2000);

    return () => clearInterval(interval);
  }, [hasSubmitted, hasNavigatedToOutcome, duelId, navigation, duelData]);

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
    onStartShouldSetPanResponder: () => !hasSubmitted,
    onMoveShouldSetPanResponder: () => !hasSubmitted,
    onPanResponderGrant: (evt) => {
      if (hasSubmitted) return;
      setIsDrawing(true);
      const { locationX, locationY } = evt.nativeEvent;
      const newPoint = { x: locationX, y: locationY };
      setCurrentPoints([newPoint]);
      
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
        setCurrentPath(`M${locationX},${locationY}`);
      }
    },
    onPanResponderMove: (evt) => {
      if (!isDrawing || hasSubmitted) return;
      
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
        setCurrentPath(prev => prev + ` L${locationX},${locationY}`);
        setCurrentPoints(prev => [...prev, newPoint]);
      }
    },
    onPanResponderRelease: () => {
      if (!isDrawing || hasSubmitted) return;
      
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
          word: duelData?.word || ''
        })
      });

      if (!scoreResponse.ok) {
        console.error('Score API error:', scoreResponse.status, scoreResponse.statusText);
        Alert.alert('Scoring Error', 'Failed to score your drawing. Please try again.');
        return;
      }

      const responseText = await scoreResponse.text();
      let scoreData;
      try {
        scoreData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        Alert.alert('Scoring Error', 'Invalid response from scoring service. Please try again.');
        return;
      }

      // Generate SVG string for storage
      const svgString = generateSVGString();
      
      // Create a unique filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `duel-drawing-${user.id}-${duelId}-${timestamp}.svg`;

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

      console.log('Generated SVG URL:', urlData.publicUrl);
      console.log('Uploaded filename:', filename);

      // Check duel status before submitting
      const { data: duelCheck, error: duelCheckError } = await supabase
        .from('duels')
        .select('id, status, challenger_id, opponent_id')
        .eq('id', duelId)
        .single();
      
      console.log('Duel check result:', duelCheck);
      console.log('Duel check error:', duelCheckError);
      
      if (duelCheckError || !duelCheck) {
        Alert.alert('Error', 'Could not find the duel. Please try again.');
        return;
      }
      
      if (duelCheck.status !== 'in_progress') {
        Alert.alert('Error', `Duel is not in progress. Current status: ${duelCheck.status}`);
        return;
      }

      // Submit drawing to duel
      const { error: submitError } = await supabase
        .rpc('submit_duel_drawing', {
          duel_uuid: duelId,
          svg_url: urlData.publicUrl,
          ai_score: scoreData.score,
          ai_message: scoreData.message
        });

      if (submitError) {
        console.error('Submit duel drawing error:', submitError);
        Alert.alert('Error', 'Failed to submit your drawing to the duel. Please try again.');
        return;
      }

      // Set the score and message to display above the canvas
      setScore(scoreData.score);
      setScoreMessage(scoreData.message);
      setHasSubmitted(true);

      // Check if duel is now completed and navigate to outcome screen
      const { data: updatedDuel, error: duelStatusError } = await supabase
        .from('duels')
        .select(`
          id,
          status,
          winner_id,
          challenger_id,
          opponent_id
        `)
        .eq('id', duelId)
        .single();

      if (!duelStatusError && updatedDuel && updatedDuel.status === 'completed') {
        // Set flag to prevent multiple navigations
        setHasNavigatedToOutcome(true);
        
        // Determine if current user won
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        const userWon = currentUser && updatedDuel.winner_id === currentUser.id;
        
        // Navigate to results screen
        navigation.replace('DuelFriendResults', {
          duelId: duelId
        });
      }

    } catch (error) {
      console.error('Submit error:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const colors = ['#000000', '#FF0000', '#00FF00', '#0000FF'];

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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Duel vs @{opponentUsername}</Text>
        </View>
        
        <View style={styles.wordContainer}>
          <Text style={styles.wordText}>{duelData.word}</Text>
        </View>
        
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
          </View>
        )}
        
        {/* Drawing Instructions and Submit Button - only show if not submitted yet */}
        {!hasSubmitted && (
          <View style={styles.drawingHeader}>
            <Text style={styles.subtitle}>Draw this word!</Text>
            <TouchableOpacity 
              style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]} 
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              <Text style={styles.submitButtonText}>
                {isSubmitting ? 'Submitting...' : 'Submit Drawing'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        
        {/* Show message if already submitted */}
        {hasSubmitted && score === null && (
          <View style={styles.submittedContainer}>
            <Text style={styles.submittedText}>Drawing Submitted!</Text>
            <Text style={styles.submittedSubtext}>Waiting for opponent to submit their drawing...</Text>
          </View>
        )}
        
        {/* Drawing Canvas */}
        <View style={styles.canvasContainer}>
          <View ref={canvasRef} style={styles.canvas} {...panResponder.panHandlers}>
            <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject}>
              {/* Render all completed paths */}
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
              
              {/* Render current path being drawn */}
              {currentPath && !isEraseMode && (
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

        {/* Drawing Tools - only show if not submitted yet */}
        {!hasSubmitted && (
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
              style={[styles.brushSizeButton, brushSize === 2 && styles.selectedBrushSize]}
              onPress={() => setBrushSize(2)}
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
    fontSize: 20,
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
    backgroundColor: '#FF6B6B',
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
    backgroundColor: '#FFFFFF',
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
  submittedContainer: {
    backgroundColor: '#f0f8ff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  submittedText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 4,
  },
  submittedSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
