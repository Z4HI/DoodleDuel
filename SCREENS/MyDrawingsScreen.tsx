import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../SUPABASE/supabaseConfig';

interface Drawing {
  id: string;
  word: string;
  svg_url: string;
  svg_content: string;
  created_at: string;
  score?: number;
  message?: string;
}

export default function MyDrawingsScreen() {
  const navigation = useNavigation();
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDrawings();
  }, []);

  const fetchDrawings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to view your drawings.');
        return;
      }

      const { data, error } = await supabase
        .from('drawings')
        .select('id, word, svg_url, created_at, score, message')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching drawings:', error);
        Alert.alert('Error', 'Failed to load your drawings.');
        return;
      }

      // Fetch SVG content for each drawing
      const drawingsWithContent = await Promise.all(
        (data || []).map(async (drawing) => {
          try {
            const response = await fetch(drawing.svg_url);
            const svgContent = await response.text();
            return {
              ...drawing,
              svg_content: svgContent
            };
          } catch (error) {
            console.error('Error fetching SVG content:', error);
            return {
              ...drawing,
              svg_content: ''
            };
          }
        })
      );

      setDrawings(drawingsWithContent);
    } catch (error) {
      console.error('Error fetching drawings:', error);
      Alert.alert('Error', 'Something went wrong while loading your drawings.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const deleteDrawing = async (drawingId: string, svgUrl: string) => {
    try {
      // Extract filename from URL
      const urlParts = svgUrl.split('/');
      const filename = urlParts[urlParts.length - 1];

      // Delete from Supabase Storage
      const { error: storageError } = await supabase.storage
        .from('drawings')
        .remove([filename]);

      if (storageError) {
        console.error('Storage delete error:', storageError);
        // Continue with database deletion even if storage fails
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('drawings')
        .delete()
        .eq('id', drawingId);

      if (dbError) {
        console.error('Database delete error:', dbError);
        Alert.alert('Error', 'Failed to delete drawing from database.');
        return;
      }

      // Remove from local state
      setDrawings(prev => prev.filter(drawing => drawing.id !== drawingId));
      
    } catch (error) {
      console.error('Delete error:', error);
      Alert.alert('Error', 'Failed to delete drawing.');
    }
  };

  const handleDeleteDrawing = (drawing: Drawing) => {
    Alert.alert(
      'Delete Drawing',
      `Are you sure you want to delete your drawing of "${drawing.word}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteDrawing(drawing.id, drawing.svg_url),
        },
      ]
    );
  };

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
          d: match[1],
          stroke: match[2],
          strokeWidth: parseFloat(match[3]) || 3
        });
      }
      
      return { paths, viewBox };
    } catch (error) {
      console.error('Error parsing SVG:', error);
      return { paths: [], viewBox: '0 0 100% 100%' };
    }
  };

  const renderRightActions = (item: Drawing) => {
    return (
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDeleteDrawing(item)}
      >
        <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <Path
            d="M3 6h18l-2 13H5L3 6zM8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </TouchableOpacity>
    );
  };

  const SwipeableDrawingCard = ({ item }: { item: Drawing }) => {
    const { paths, viewBox } = parseSVGPaths(item.svg_content);

    return (
      <View style={styles.swipeableContainer}>
        <Swipeable
          renderRightActions={() => renderRightActions(item)}
          rightThreshold={40}
        >
          <View style={styles.drawingCard}>
            <View style={styles.cardContent}>
              <View style={styles.textContent}>
                <View style={styles.drawingHeader}>
                  <Text style={styles.wordText}>{item.word.toUpperCase()}</Text>
                  <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
                </View>
                
              {item.score && (
                <View style={styles.scoreContainer}>
                  <Text style={styles.scoreText}>Score: {item.score}%</Text>
                  {item.message && (
                    <Text style={styles.messageText}>{item.message}</Text>
                  )}
                </View>
              )}
              </View>
              
              <View style={styles.svgContainer}>
                {paths.length > 0 ? (
                  <Svg style={styles.svg} viewBox="50 0 300 400" preserveAspectRatio="xMidYMid meet">
                    {paths.map((path, index) => (
                      <Path
                        key={index}
                        d={path.d}
                        stroke={path.stroke}
                        strokeWidth={Math.max(1, path.strokeWidth * 0.8)}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                  </Svg>
                ) : (
                  <View style={styles.svgPlaceholder}>
                    <Text style={styles.placeholderText}>🎨</Text>
                    <Text style={styles.loadingText}>Loading...</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </Swipeable>
      </View>
    );
  };

  const renderDrawing = ({ item }: { item: Drawing }) => {
    return <SwipeableDrawingCard item={item} />;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>My Drawings</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading your drawings...</Text>
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
        <Text style={styles.title}>My Drawings</Text>
      </View>
      
      {drawings.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No Drawings Yet</Text>
          <Text style={styles.emptySubtitle}>
            Start drawing to see your creations here!
          </Text>
          <TouchableOpacity 
            style={styles.drawButton} 
            onPress={() => navigation.navigate('WordOfTheDay' as never)}
          >
            <Text style={styles.drawButtonText}>🎨 Start Drawing</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={drawings}
          renderItem={renderDrawing}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}
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
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 15,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
  drawButton: {
    backgroundColor: '#34C759',
    borderRadius: 8,
    padding: 16,
    minWidth: 150,
  },
  drawButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  listContainer: {
    padding: 20,
  },
  swipeableContainer: {
    marginBottom: 16,
  },
  drawingCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e9ecef',
    zIndex: 1,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textContent: {
    flex: 1,
    marginRight: 16,
  },
  drawingHeader: {
    marginBottom: 8,
  },
  wordText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 4,
  },
  dateText: {
    fontSize: 12,
    color: '#666',
  },
  svgContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
    alignItems: 'center',
    justifyContent: 'center',
    width: 100,
    height: 100,
    overflow: 'hidden',
  },
  svg: {
    width: 100,
    height: 100,
  },
  svgPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 100,
    height: 100,
  },
  placeholderText: {
    fontSize: 24,
    marginBottom: 4,
  },
  loadingText: {
    fontSize: 10,
    color: '#666',
  },
  scoreContainer: {
    backgroundColor: '#e8f5e8',
    borderRadius: 6,
    padding: 6,
    alignItems: 'center',
    marginTop: 8,
  },
  scoreText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#34C759',
  },
  messageText: {
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 60,
    height: '100%',
    borderRadius: 12,
  },
});
