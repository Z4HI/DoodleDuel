import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { Alert, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../SUPABASE/supabaseConfig';

const { width: screenWidth } = Dimensions.get('window');

interface RouteParams {
  matchId: string;
}

interface MatchResult {
  user_id: string;
  username: string;
  drawing_id: string;
  svg_url: string;
  score: number;
  message: string;
  ranking: number;
  submitted: boolean;
}

export default function MultiplayerResultsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { matchId } = route.params as RouteParams;
  
  const [results, setResults] = useState<MatchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [drawingPaths, setDrawingPaths] = useState<{[key: string]: Array<{ path: string; color: string; strokeWidth: number }>}>({});
  const [drawingViewBoxes, setDrawingViewBoxes] = useState<{[key: string]: string}>({});

  useEffect(() => {
    fetchResults();
    getCurrentUser();
  }, [matchId]);

  const getCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    } catch (error) {
      console.error('Error getting current user:', error);
    }
  };

  const fetchResults = async () => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase.functions.invoke('matchmaking', {
        body: {
          action: 'get_match_results',
          matchId: matchId
        }
      });

      if (error) {
        console.error('Error fetching results:', error);
        Alert.alert('Error', 'Failed to load results. Please try again.');
        return;
      }

      if (data.success) {
        setResults(data.results);
        
        // Load drawing paths for each result
        data.results.forEach((result: MatchResult) => {
          if (result.svg_url) {
            loadDrawingPaths(result.drawing_id, result.svg_url);
          }
        });
      }
    } catch (error) {
      console.error('Error in fetchResults:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getRankingText = (ranking: number) => {
    switch (ranking) {
      case 1:
        return '🥇 1st Place';
      case 2:
        return '🥈 2nd Place';
      case 3:
        return '🥉 3rd Place';
      default:
        return `${ranking}th Place`;
    }
  };

  const getRankingColor = (ranking: number) => {
    switch (ranking) {
      case 1:
        return '#FFD700';
      case 2:
        return '#C0C0C0';
      case 3:
        return '#CD7F32';
      default:
        return '#666';
    }
  };

  const isCurrentUser = (userId: string) => {
    return currentUserId === userId;
  };

  // Parse SVG content to extract paths and viewBox (same as DuelOutcomeScreen)
  const parseSVGContent = (svgContent: string) => {
    try {
      console.log('Parsing SVG content:', svgContent.substring(0, 200));
      
      const paths: Array<{ path: string; color: string; strokeWidth: number }> = [];
      
      // Extract viewBox from SVG, or use width/height if no viewBox
      let viewBox = '0 0 400 600'; // default
      const viewBoxMatch = svgContent.match(/viewBox="([^"]*)"/);
      if (viewBoxMatch) {
        viewBox = viewBoxMatch[1];
      } else {
        // Try to extract width and height to create viewBox
        const widthMatch = svgContent.match(/width="([^"]*)"/);
        const heightMatch = svgContent.match(/height="([^"]*)"/);
        if (widthMatch && heightMatch) {
          const width = parseInt(widthMatch[1]) || 400;
          const height = parseInt(heightMatch[1]) || 600;
          viewBox = `0 0 ${width} ${height}`;
        }
      }
      
      console.log('Using viewBox:', viewBox);
      
      // Extract path elements from SVG - try both stroke-width and strokeWidth
      const pathRegex = /<path[^>]*d="([^"]*)"[^>]*stroke="([^"]*)"[^>]*(?:stroke-width|strokeWidth)="([^"]*)"[^>]*\/>/g;
      let match;
      
      while ((match = pathRegex.exec(svgContent)) !== null) {
        paths.push({
          path: match[1],
          color: match[2] || '#000000',
          strokeWidth: parseFloat(match[3]) || 3
        });
      }
      
      console.log('Found paths:', paths.length);
      return { paths, viewBox };
    } catch (error) {
      console.error('Error parsing SVG:', error);
      return { paths: [], viewBox: '0 0 400 600' };
    }
  };

  // Load SVG content for a drawing
  const loadDrawingPaths = async (drawingId: string, svgUrl: string) => {
    try {
      console.log('Loading SVG from URL:', svgUrl);
      const response = await fetch(svgUrl);
      const svgContent = await response.text();
      console.log('SVG content loaded:', svgContent.substring(0, 100) + '...');
      
      const { paths, viewBox } = parseSVGContent(svgContent);
      console.log('Parsed paths:', paths.length);
      console.log('ViewBox:', viewBox);
      
      setDrawingPaths(prev => ({
        ...prev,
        [drawingId]: paths
      }));
      
      setDrawingViewBoxes(prev => ({
        ...prev,
        [drawingId]: viewBox
      }));
    } catch (error) {
      console.error('Error loading drawing paths:', error);
    }
  };

  // Render SVG drawing (same as DuelOutcomeScreen)
  const renderDrawing = (paths: Array<{ path: string; color: string; strokeWidth: number }>, title: string, score: number, message: string, drawingId: string) => {
    const viewBox = drawingViewBoxes[drawingId] || '0 0 400 600';
    
    console.log('Rendering drawing:', { title, pathsLength: paths.length, viewBox });
    
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
            <Text style={styles.scoreText}>Score: {score}</Text>
            {message && <Text style={styles.messageText}>{message}</Text>}
          </View>
        </View>
      );
    }

    return (
      <View style={styles.drawingContainer}>
        <Text style={styles.drawingTitle}>{title}</Text>
        <View style={styles.drawingCanvas}>
          <Svg style={styles.drawingSvg} viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
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
          <Text style={styles.scoreText}>Score: {score}</Text>
          {message && <Text style={styles.messageText}>{message}</Text>}
        </View>
      </View>
    );
  };

  const playAgain = () => {
    navigation.navigate('Multiplayer' as never);
  };

  const goHome = () => {
    navigation.navigate('Home' as never);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading results...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>🏆 Match Results</Text>
          <Text style={styles.subtitle}>Here's how everyone did!</Text>
        </View>

        {/* Winner Display */}
        <View style={styles.winnerContainer}>
          <Text style={styles.winnerText}>
            {results.length > 0 && results[0].user_id === currentUserId ? '🎉 You Won!' : 
             results.length > 0 ? `🏆 ${results[0].username} Won!` : '🤝 Match Complete!'}
          </Text>
        </View>

        {/* Drawings Side by Side */}
        <View style={styles.drawingsContainer}>
          {results
            .sort((a, b) => (a.ranking || 999) - (b.ranking || 999))
            .slice(0, 2) // Show top 2 players side by side
            .map((result, index) => {
              const paths = drawingPaths[result.drawing_id] || [];
              const title = isCurrentUser(result.user_id) ? 'Your Drawing' : `${result.username}'s Drawing`;
              
              return (
                <View key={result.user_id}>
                  {renderDrawing(
                    paths,
                    title,
                    result.score || 0,
                    result.message || '',
                    result.drawing_id
                  )}
                </View>
              );
            })}
        </View>

        {/* Full Results List */}
        <View style={styles.fullResultsContainer}>
          <Text style={styles.fullResultsTitle}>Full Results</Text>
          {results
            .sort((a, b) => (a.ranking || 999) - (b.ranking || 999))
            .map((result, index) => (
            <View 
              key={result.user_id} 
              style={[
                styles.resultRow,
                isCurrentUser(result.user_id) && styles.currentUserRow
              ]}
            >
              <Text style={styles.rankingText}>
                {getRankingText(result.ranking || index + 1)}
              </Text>
              <Text style={styles.usernameText}>{result.username}</Text>
              <Text style={styles.scoreText}>{result.score || 0}</Text>
            </View>
          ))}
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.playAgainButton} onPress={playAgain}>
            <Text style={styles.playAgainButtonText}>🎮 Play Again</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.homeButton} onPress={goHome}>
            <Text style={styles.homeButtonText}>🏠 Back to Home</Text>
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
  scrollView: {
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
  header: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  winnerContainer: {
    alignItems: 'center',
    marginBottom: 30,
    padding: 20,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
  },
  winnerText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  drawingsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  drawingContainer: {
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  drawingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  drawingCanvas: {
    width: 150,
    height: 150,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
    marginBottom: 10,
    padding: 5,
    overflow: 'hidden',
  },
  drawingSvg: {
    width: '100%',
    height: '100%',
  },
  fullResultsContainer: {
    marginBottom: 20,
  },
  fullResultsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  currentUserRow: {
    borderWidth: 2,
    borderColor: '#007AFF',
    backgroundColor: '#f0f8ff',
  },
  resultsContainer: {
    padding: 20,
  },
  resultCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  currentUserCard: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
    borderWidth: 2,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  rankingText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  youText: {
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '600',
  },
  usernameText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  scoreLabel: {
    fontSize: 16,
    color: '#666',
    marginRight: 10,
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#34C759',
  },
  messageContainer: {
    marginTop: 10,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  messageLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  messageText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  drawingSection: {
    marginTop: 15,
  },
  drawingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  drawingContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  drawingSvg: {
    backgroundColor: '#fff',
  },
  drawingPlaceholder: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  drawingPlaceholderText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  notSubmittedContainer: {
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  notSubmittedText: {
    color: '#D32F2F',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
  actionsContainer: {
    padding: 20,
    gap: 15,
  },
  playAgainButton: {
    backgroundColor: '#34C759',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  playAgainButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  homeButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  homeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
