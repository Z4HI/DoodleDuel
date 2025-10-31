import React from 'react';
import { Image, View } from 'react-native';
import { getTierInfo } from '../utils/tierUtils';

interface TieredAvatarProps {
  avatarUri?: string;
  tier: number;
  size?: number;
}

export default function TieredAvatar({ avatarUri, tier, size = 60 }: TieredAvatarProps) {
  const tierInfo = getTierInfo(tier);
  const containerSize = size + (tierInfo.borderWidth * 2);
  
  // Create border style based on tier
  const borderStyle: any = {
    width: containerSize,
    height: containerSize,
    borderRadius: containerSize / 2,
    borderWidth: tierInfo.borderWidth,
    borderColor: tierInfo.color,
    justifyContent: 'center',
    alignItems: 'center',
  };

  // Add gradient effect for higher tiers (simulated with multiple borders)
  if (tierInfo.hasGradient && tierInfo.secondaryColor) {
    borderStyle.borderColor = tierInfo.color;
    // We'll use a second inner border for gradient effect
  }

  // Add glow/shadow for higher tiers
  if (tierInfo.hasGlow && tierInfo.glowColor) {
    borderStyle.shadowColor = tierInfo.glowColor;
    borderStyle.shadowOffset = { width: 0, height: 0 };
    borderStyle.shadowOpacity = 1;
    borderStyle.shadowRadius = tierInfo.tier >= 6 ? 12 : 8;
    borderStyle.elevation = tierInfo.tier >= 6 ? 10 : 6;
  }

  return (
    <View style={borderStyle}>
      {tierInfo.hasGradient && tierInfo.secondaryColor && (
        <View style={{
          position: 'absolute',
          width: containerSize - 4,
          height: containerSize - 4,
          borderRadius: (containerSize - 4) / 2,
          borderWidth: 2,
          borderColor: tierInfo.secondaryColor,
        }} />
      )}
      <View style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        backgroundColor: '#E0E0E0',
      }}>
        {avatarUri ? (
          <Image 
            source={{ uri: avatarUri }} 
            style={{
              width: size,
              height: size,
            }}
          />
        ) : (
          <View style={{
            width: size,
            height: size,
            backgroundColor: '#E0E0E0',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            {/* Default avatar placeholder */}
          </View>
        )}
      </View>
    </View>
  );
}

