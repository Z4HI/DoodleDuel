import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { Alert, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../SUPABASE/supabaseConfig';

const { width: screenWidth } = Dimensions.get('window');

interface DuelOutcomeRouteParams {
  duelId: string;
  opponent: {
    id: string;
    username: string;
    email: string;
  };
  userWon: boolean;
}

interface DrawingData {
  id: string;
  score: number;
  message: string;
  svg_url: string;
  user_id: string;
}

interface DuelData {
  id: string;
  word: string;
  difficulty: string;
  challenger_id: string;
  opponent_id: string;
  winner_id: string | null;
  challenger_drawing: DrawingData;
  opponent_drawing: DrawingData;
}

export default function DuelOutcomeScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { duelId, opponent, userWon } = route.params as DuelOutcomeRouteParams;
  
  const [duelData, setDuelData] = useState<DuelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [challengerPaths, setChallengerPaths] = useState<Array<{ path: string; color: string; strokeWidth: number }>>([]);
  const [opponentPaths, setOpponentPaths] = useState<Array<{ path: string; color: string; strokeWidth: number }>>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

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

  const loadDuelData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to view duel results.');
        return;
      }

      // Store current user ID for use in component
      setCurrentUserId(user.id);

      const { data, error } = await supabase
        .from('duels')
        .select(`
          id,
          word,
          difficulty,
          challenger_id,
          opponent_id,
          winner_id,
          challenger_drawing:challenger_drawing_id(score, message, svg_url, user_id),
          opponent_drawing:opponent_drawing_id(score, message, svg_url, user_id)
        `)
        .eq('id', duelId)
        .single();

      if (error || !data) {
        console.error('Error loading duel data:', error);
        Alert.alert('Error', 'Failed to load duel results.');
        return;
      }

      setDuelData(data);

      // Calculate if current user won based on the actual duel data
      const currentUserWon = data.winner_id === user.id;
      console.log('Duel outcome calculation:', {
        winner_id: data.winner_id,
        current_user_id: user.id,
        currentUserWon
      });

      // Load SVG content for both drawings
      if (data.challenger_drawing?.svg_url) {
        try {
          const response = await fetch(data.challenger_drawing.svg_url);
          const svgContent = await response.text();
          const { paths } = parseSVGPaths(svgContent);
          setChallengerPaths(paths);
        } catch (error) {
          console.error('Error loading challenger drawing:', error);
        }
      }

      if (data.opponent_drawing?.svg_url) {
        try {
          const response = await fetch(data.opponent_drawing.svg_url);
          const svgContent = await response.text();
          const { paths } = parseSVGPaths(svgContent);
          setOpponentPaths(paths);
        } catch (error) {
          console.error('Error loading opponent drawing:', error);
        }
      }

    } catch (error) {
      console.error('Error loading duel data:', error);
      Alert.alert('Error', 'Something went wrong while loading the duel results.');
    } finally {
      setLoading(false);
    }
  };

  const renderDrawing = (paths: Array<{ path: string; color: string; strokeWidth: number }>, title: string, score: number, message: string) => (
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
        <Text style={styles.messageText}>{message}</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading duel results...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!duelData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load duel results</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isCurrentUserChallenger = duelData.challenger_id === currentUserId;
  const challengerTitle = isCurrentUserChallenger ? 'Your Drawing' : `${opponent.username}'s Drawing`;
  const opponentTitle = isCurrentUserChallenger ? `${opponent.username}'s Drawing` : 'Your Drawing';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.navigate('DuelFriend')}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Duel Results</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.wordContainer}>
          <Text style={styles.wordText}>Word: {duelData.word.toUpperCase()}</Text>
          <Text style={styles.difficultyText}>Difficulty: {duelData.difficulty}</Text>
        </View>

        <View style={styles.resultContainer}>
          <Text style={styles.resultText}>
            {duelData.winner_id === currentUserId ? '🎉 You Won!' : 
             duelData.winner_id === null ? '🤝 It\'s a Tie!' : '😔 You Lost'}
          </Text>
        </View>

        <View style={styles.drawingsContainer}>
          {renderDrawing(
            challengerPaths,
            challengerTitle,
            duelData.challenger_drawing?.score || 0,
            duelData.challenger_drawing?.message || ''
          )}
          
          {renderDrawing(
            opponentPaths,
            opponentTitle,
            duelData.opponent_drawing?.score || 0,
            duelData.opponent_drawing?.message || ''
          )}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  placeholder: {
    width: 50,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  wordContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  wordText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  difficultyText: {
    fontSize: 16,
    color: '#666',
  },
  resultContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  resultText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
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
  },
  drawingSvg: {
    width: '100%',
    height: '100%',
  },
  scoreContainer: {
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  messageText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 16,
  },
  playAgainButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  playAgainButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
  },
});
