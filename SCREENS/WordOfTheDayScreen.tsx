import { useNavigation } from '@react-navigation/native';
import React, { useRef, useState } from 'react';
import { Alert, Dimensions, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { supabase } from '../SUPABASE/supabaseConfig';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function WordOfTheDayScreen() {
  const navigation = useNavigation();
  const canvasRef = useRef<View>(null);
  
  // Word of the day variable for testing
  const wordOfTheDay = 'cat';
  
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
            const points = [];
            
            // Extract all coordinates from the path
            const coordMatches = pathString.match(/\d+\.?\d*,\d+\.?\d*/g);
            if (coordMatches) {
              coordMatches.forEach(coord => {
                const [x, y] = coord.split(',').map(Number);
                if (!isNaN(x) && !isNaN(y)) {
                  points.push({ x, y });
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

      // Capture the canvas as JPEG with optimized settings for cost reduction
      const jpegUri = await captureRef(canvasRef, {
        format: 'jpg',
        quality: 0.8, // 80% quality for high image clarity
        width: 112,    // Even smaller size for maximum compression
        height: 112,
      });

      // Convert JPEG to base64
      const response = await fetch(jpegUri);
      const blob = await response.blob();
      
      // Debug: Log the actual image size
      console.log('Image blob size:', blob.size, 'bytes');
      console.log('Image blob type:', blob.type);
      
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          // Remove the data:image/jpeg;base64, prefix to get just the base64 string
          const base64String = result.split(',')[1];
          console.log('Base64 string length:', base64String.length);
          resolve(base64String);
        };
        reader.readAsDataURL(blob);
      });

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
          <Text style={styles.wordText}>{wordOfTheDay}</Text>
        </View>
        {/* Drawing Instructions and Submit Button - only show if no score yet */}
        {score === null && (
          <View style={styles.drawingHeader}>
            <Text style={styles.subtitle}>Draw this word!</Text>
            <TouchableOpacity 
              style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]} 
              onPress={handleSubmit}
              disabled={isSubmitting}
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
          </View>
        )}
        
        {/* Drawing Canvas */}
        <View style={styles.canvasContainer}>
          <View ref={canvasRef} style={styles.canvas} {...panResponder.panHandlers}>
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

        {/* Drawing Tools */}
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
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e9ecef',
    marginBottom: 20,
    overflow: 'hidden',
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
});
