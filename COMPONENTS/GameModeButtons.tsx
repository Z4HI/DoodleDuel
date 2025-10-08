import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface GameModeButtonsProps {
  onWordOfTheDay?: () => void;
  onMultiplayer?: () => void;
  onDuelFriend?: () => void;
  onDoodleHunt?: () => void;
  onPractice?: () => void;
}

export function GameModeButtons({ 
  onWordOfTheDay, 
  onMultiplayer, 
  onDuelFriend, 
  onDoodleHunt,
  onPractice 
}: GameModeButtonsProps) {
  return (
    <View style={styles.container}>
      {/* Word of the Day */}
      <TouchableOpacity 
        style={[styles.button, styles.wordOfTheDayButton]} 
        onPress={onWordOfTheDay}
      >
        <View style={styles.buttonContent}>
          <Ionicons name="gift" size={24} color="#FF6B6B" />
          <View style={styles.textContainer}>
            <Text style={styles.buttonTitle}>Doodle of the Day</Text>
            <Text style={styles.buttonSubtitle}>🎁 (solo daily challenge)</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Multiplayer Matchmaking */}
      <TouchableOpacity 
        style={[styles.button, styles.multiplayerButton]} 
        onPress={onMultiplayer}
      >
        <View style={styles.buttonContent}>
          <Ionicons name="flash" size={24} color="#4ECDC4" />
          <View style={styles.textContainer}>
            <Text style={styles.buttonTitle}>Doodle Duel Multiplayer</Text>
            <Text style={styles.buttonSubtitle}>⚡ (random opponents)</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Duel a Friend */}
      <TouchableOpacity 
        style={[styles.button, styles.duelFriendButton]} 
        onPress={onDuelFriend}
      >
        <View style={styles.buttonContent}>
          <Ionicons name="people" size={24} color="#45B7D1" />
          <View style={styles.textContainer}>
            <Text style={styles.buttonTitle}>Doodle Duel a Friend</Text>
            <Text style={styles.buttonSubtitle}>👥 (invite or challenge)</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Doodle Hunt */}
      <TouchableOpacity 
        style={[styles.button, styles.doodleHuntButton]} 
        onPress={onDoodleHunt}
      >
        <View style={styles.buttonContent}>
          <Ionicons name="search" size={24} color="#FF6B35" />
          <View style={styles.textContainer}>
            <Text style={styles.buttonTitle}>Doodle Hunt</Text>
            <Text style={styles.buttonSubtitle}>🔍 (draw & guess word)</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Practice / Free Draw */}
      <TouchableOpacity 
        style={[styles.button, styles.practiceButton]} 
        onPress={onPractice}
      >
        <View style={styles.buttonContent}>
          <Ionicons name="pencil" size={24} color="#96CEB4" />
          <View style={styles.textContainer}>
            <Text style={styles.buttonTitle}>Practice / Free Draw</Text>
            <Text style={styles.buttonSubtitle}>✏️ (play casually, no points)</Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 16,
  },
  button: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textContainer: {
    marginLeft: 16,
    flex: 1,
  },
  buttonTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 4,
  },
  buttonSubtitle: {
    fontSize: 14,
    color: '#666666',
    fontStyle: 'italic',
  },
  // Individual button styles
  wordOfTheDayButton: {
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B6B',
  },
  multiplayerButton: {
    borderLeftWidth: 4,
    borderLeftColor: '#4ECDC4',
  },
  duelFriendButton: {
    borderLeftWidth: 4,
    borderLeftColor: '#45B7D1',
  },
  doodleHuntButton: {
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B35',
  },
  practiceButton: {
    borderLeftWidth: 4,
    borderLeftColor: '#96CEB4',
  },
});
