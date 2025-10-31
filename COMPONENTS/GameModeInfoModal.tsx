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
    description: 'Guess the secret word by drawing! AI tries to identify what you drew. Build your streak for huge XP bonuses!',
    features: [
      'Daily word challenge',
      'AI guessing system',
      'Earn XP and level up'
    ],
    hasStreaks: true
  },
  'Doodle of the Day': {
    title: '🎨 Doodle of the Day',
    description: 'Create a drawing based on the word of the day. Build your streak to earn massive XP bonuses!',
    features: [
      'Daily word inspiration',
      'Personal drawing space',
      'Earn XP and level up'
    ],
    hasStreaks: true
  },
  'Doodle Hunt Dash': {
    title: '🎯 Doodle Hunt Dash',
    description: 'Solo challenge mode where you race against yourself! Draw and guess words that get progressively harder as you level up. How far can you go?',
    features: [
      'Solo gameplay - no waiting',
      'Progressive difficulty',
      'Each level gets harder',
      'Unlimited attempts',
      'Track your best level',
      'No daily limit - play anytime!'
    ],
    hasStreaks: false
  },
  'Duel a Friend': {
    title: '⚔️ Duel a Friend',
    description: 'Challenge your friends to a drawing duel! Send a challenge, they accept, and you both compete to see who draws better.',
    features: [
      'Send challenges to friends',
      'Get notified when accepted',
      '🎨 Doodle Duel: Both draw the same word - best drawing wins!',
      '🔍 Doodle Hunt: Both guess a secret word by drawing - fastest/best guess wins!',
      'Earn XP for wins and losses'
    ],
    hasStreaks: false
  },
  'Multiplayer': {
    title: '🎮 Multiplayer',
    description: 'Play online against other players in real-time! Get matched with opponents and compete in different game modes.',
    features: [
      'Play vs real players online',
      'Choose 2 or 4 player matches',
      '🎲 Roulette Mode: Take turns drawing while others watch. AI guesses each drawing. First to 100% wins or highest score after 5 turns per player!',
      '🎨 Doodle Mode: Everyone draws the same word simultaneously. Best drawing wins!',
      'Real-time matchmaking',
      'Earn XP for wins and losses'
    ],
    hasStreaks: false
  },
  'My Drawings': {
    title: '📚 My Drawings',
    description: 'View and manage all your previous drawings. Browse through your artistic journey and see how your skills have evolved over time.',
    features: [
      'Gallery of all your artwork',
      'Organize by date',
      'Share your favorites',
      'Track your improvement'
    ],
    hasStreaks: false
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

              {/* Streak Bonuses (if applicable) */}
              {info.hasStreaks && (
                <View style={styles.streakSection}>
                  <Text style={styles.streakTitle}>🔥 Daily Streak Bonuses:</Text>
                  <View style={styles.streakMilestones}>
                    <View style={styles.milestone}>
                      <Text style={styles.milestoneDay}>3</Text>
                      <Text style={styles.milestoneBonus}>+25%</Text>
                    </View>
                    <View style={styles.milestone}>
                      <Text style={styles.milestoneDay}>7</Text>
                      <Text style={styles.milestoneBonus}>+50%</Text>
                    </View>
                    <View style={styles.milestone}>
                      <Text style={styles.milestoneDay}>14</Text>
                      <Text style={styles.milestoneBonus}>+75%</Text>
                    </View>
                    <View style={styles.milestoneSpecial}>
                      <Text style={styles.milestoneDay}>30</Text>
                      <Text style={styles.milestoneBonusSpecial}>2x</Text>
                    </View>
                    <View style={styles.milestoneSpecial}>
                      <Text style={styles.milestoneDay}>100</Text>
                      <Text style={styles.milestoneBonusSpecial}>3x</Text>
                    </View>
                  </View>
                  <Text style={styles.streakNote}>Play daily to keep your streak alive!</Text>
                </View>
              )}

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
  streakSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFF5E1',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  streakTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  streakMilestones: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  milestone: {
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FF6B35',
    minWidth: 50,
  },
  milestoneSpecial: {
    alignItems: 'center',
    backgroundColor: '#FFD700',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FF6B35',
    minWidth: 50,
  },
  milestoneDay: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  milestoneBonus: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF6B35',
  },
  milestoneBonusSpecial: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D4AF37',
  },
  streakNote: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
