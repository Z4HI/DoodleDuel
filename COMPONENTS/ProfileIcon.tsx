import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { getTierInfo } from '../utils/tierUtils';

interface ProfileIconProps {
  onPress: () => void;
  tier?: number;
  avatarUri?: string;
}

export default function ProfileIcon({ onPress, tier = 1, avatarUri }: ProfileIconProps) {
  const tierInfo = getTierInfo(tier);
  
  // Create tier border style
  const borderStyle: any = {
    borderWidth: tierInfo.borderWidth,
    borderColor: tierInfo.color,
    borderRadius: 20,
    padding: 2,
  };

  // Add glow for higher tiers
  if (tierInfo.hasGlow && tierInfo.glowColor) {
    borderStyle.shadowColor = tierInfo.glowColor;
    borderStyle.shadowOffset = { width: 0, height: 0 };
    borderStyle.shadowOpacity = 1;
    borderStyle.shadowRadius = 6;
    borderStyle.elevation = 5;
  }

  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <View style={borderStyle}>
        {tierInfo.hasGradient && tierInfo.secondaryColor && (
          <View style={{
            position: 'absolute',
            top: 1,
            left: 1,
            right: 1,
            bottom: 1,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: tierInfo.secondaryColor,
          }} />
        )}
        <Ionicons name="person-circle" size={28} color="#007AFF" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 4,
    marginRight: 8,
  },
});
