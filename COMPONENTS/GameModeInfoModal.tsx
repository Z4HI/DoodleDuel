import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface GameModeInfoModalProps {
  visible: boolean;
  onClose: () => void;
  gameMode: string;
}

const gameModeInfo = {
  'Doodle Hunt Daily': {
    title: '🔍 Doodle Hunt Daily',
    description: 'A daily drawing challenge where you create artwork based on a specific word or theme. Each day brings a new creative prompt to test your artistic skills!',
    features: [
      'Daily word prompts',
      'Creative freedom',
      'Share your artwork',
      'See other artists\' interpretations'
    ]
  },
  'Doodle of the Day': {
    title: '🎨 Doodle of the Day',
    description: 'Create a drawing based on the word of the day. This is your personal creative space to express yourself through art!',
    features: [
      'Daily word inspiration',
      'Personal drawing space',
      'Save your creations',
      'Track your progress'
    ]
  },
  'Duel a Friend': {
    title: '⚔️ Duel a Friend',
    description: 'Challenge a friend to a drawing duel! Both players draw the same word, and the community votes on who created the best interpretation.',
    features: [
      'Challenge friends',
      'Same word for both players',
      'Community voting',
      'Real-time notifications'
    ]
  },
  'Multiplayer': {
    title: '🎮 Multiplayer',
    description: 'Join live multiplayer drawing sessions where multiple players compete in real-time drawing challenges with voting and scoring.',
    features: [
      'Real-time multiplayer',
      'Live voting system',
      'Quick rounds',
      'Leaderboards'
    ]
  },
  'My Drawings': {
    title: '📚 My Drawings',
    description: 'View and manage all your previous drawings. Browse through your artistic journey and see how your skills have evolved over time.',
    features: [
      'Gallery of all your artwork',
      'Organize by date',
      'Share your favorites',
      'Track your improvement'
    ]
  }
};

export default function GameModeInfoModal({
  visible,
  onClose,
  gameMode,
}: GameModeInfoModalProps) {
  const info = gameModeInfo[gameMode as keyof typeof gameModeInfo];

  if (!info) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.overlayTouchable} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity style={styles.modalContainer} activeOpacity={1}>
            <View style={styles.modalContent}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.title}>{info.title}</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              {/* Description */}
              <View style={styles.descriptionSection}>
                <Text style={styles.description}>{info.description}</Text>
              </View>

              {/* Features */}
              <View style={styles.featuresSection}>
                <Text style={styles.featuresTitle}>Features:</Text>
                {info.features.map((feature, index) => (
                  <View key={index} style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#34C759" />
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>

              {/* Close Button */}
              <View style={styles.closeSection}>
                <TouchableOpacity style={styles.closeButtonMain} onPress={onClose}>
                  <Text style={styles.closeButtonText}>Got it!</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  overlayTouchable: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  descriptionSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  description: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
  featuresSection: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  featuresTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  featureText: {
    fontSize: 14,
    color: '#333',
    marginLeft: 8,
    flex: 1,
  },
  closeSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  closeButtonMain: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
