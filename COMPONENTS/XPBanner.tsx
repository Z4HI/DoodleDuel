import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface XPBannerProps {
  xpEarned: number;
  leveledUp?: boolean;
  newLevel?: number;
  tierUp?: boolean;
  style?: any;
}

export default function XPBanner({ xpEarned, leveledUp = false, newLevel, tierUp = false, style }: XPBannerProps) {
  if (!xpEarned || xpEarned <= 0) return null;

  return (
    <View style={[styles.xpSection, style]}>
      <Text style={styles.xpTitle}>💎 XP Earned</Text>
      <Text style={styles.xpAmount}>+{xpEarned} XP</Text>
      {leveledUp && newLevel !== undefined && (
        <Text style={styles.levelUpText}>🎉 Level Up! Now Level {newLevel}!</Text>
      )}
      {tierUp && (
        <Text style={styles.tierUpText}>🏆 TIER UP! You reached a new tier!</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  xpSection: {
    backgroundColor: '#E8F5E9',
    padding: 16,
    borderRadius: 12,
    marginVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  xpTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  xpAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 6,
  },
  levelUpText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B35',
    marginTop: 4,
  },
  tierUpText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFD700',
    marginTop: 2,
  },
});
