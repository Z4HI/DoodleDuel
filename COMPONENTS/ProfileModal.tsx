import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    Alert,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { getCurrentLevelProgress, getTierInfo } from '../utils/tierUtils';

interface ProfileModalProps {
  visible: boolean;
  onClose: () => void;
  onSignOut: () => void;
  userInfo?: {
    username?: string;
    email?: string;
    level?: number;
    total_xp?: number;
    tier?: number;
  } | null;
}

export default function ProfileModal({
  visible,
  onClose,
  onSignOut,
  userInfo,
}: ProfileModalProps) {
  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: onSignOut,
        },
      ]
    );
  };

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
              <Text style={styles.title}>Profile</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Text style={{ fontSize: 12, color: '#999', marginTop: 6 }}>
                  Lv {userInfo?.level || 1} | {userInfo?.total_xp || 0} XP
                </Text>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>
            </View>

            {/* User Info */}
            <View style={styles.userInfoSection}>
              {(() => {
                const tier = userInfo?.tier || 1;
                const tierInfo = getTierInfo(tier);
                
                // Create tier border style
                const borderStyle: any = {
                  borderWidth: tierInfo.borderWidth,
                  borderColor: tierInfo.color,
                  borderRadius: 40,
                  padding: 4,
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginBottom: 12,
                };

                // Add glow for higher tiers
                if (tierInfo.hasGlow && tierInfo.glowColor) {
                  borderStyle.shadowColor = tierInfo.glowColor;
                  borderStyle.shadowOffset = { width: 0, height: 0 };
                  borderStyle.shadowOpacity = 1;
                  borderStyle.shadowRadius = 10;
                  borderStyle.elevation = 8;
                }

                return (
                  <View style={borderStyle}>
                    {tierInfo.hasGradient && tierInfo.secondaryColor && (
                      <View style={{
                        position: 'absolute',
                        top: 2,
                        left: 2,
                        right: 2,
                        bottom: 2,
                        borderRadius: 36,
                        borderWidth: 2,
                        borderColor: tierInfo.secondaryColor,
                      }} />
                    )}
                    <View style={styles.avatarContainer}>
                      <Ionicons name="person" size={50} color="#007AFF" />
                    </View>
                  </View>
                );
              })()}

              {userInfo?.username && (
                <Text style={styles.username}>@{userInfo.username}</Text>
              )}
              {userInfo?.email && (
                <Text style={styles.email}>{userInfo.email}</Text>
              )}
              
              {/* Tier & Level Display */}
              <View style={styles.tierSection}>
                <View style={styles.tierBadge}>
                  <Text style={[styles.tierText, { color: getTierInfo(userInfo?.tier || 1).color }]}>
                    {getTierInfo(userInfo?.tier || 1).name}
                  </Text>
                  <Text style={styles.levelText}>Level {userInfo?.level || 1}</Text>
                </View>
                
                {/* XP Progress Bar */}
                <View style={styles.xpSection}>
                  {(() => {
                    const totalXP = userInfo?.total_xp || 0;
                    const level = userInfo?.level || 1;
                    const tier = userInfo?.tier || 1;
                    const progress = getCurrentLevelProgress(totalXP, level);
                    return (
                      <>
                        <View style={styles.xpBarContainer}>
                          <View style={[styles.xpBarFill, { 
                            width: `${progress.progressPercent}%`,
                            backgroundColor: getTierInfo(tier).color
                          }]} />
                        </View>
                        <Text style={styles.xpText}>
                          {progress.currentLevelXP} / {progress.xpForNextLevel} XP
                        </Text>
                      </>
                    );
                  })()}
                </View>
              </View>
            </View>

            {/* Settings Options */}
            <View style={styles.settingsSection}>
              <TouchableOpacity style={styles.settingItem}>
                <Ionicons name="settings-outline" size={20} color="#666" />
                <Text style={styles.settingText}>Settings</Text>
                <Ionicons name="chevron-forward" size={16} color="#ccc" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.settingItem}>
                <Ionicons name="notifications-outline" size={20} color="#666" />
                <Text style={styles.settingText}>Notifications</Text>
                <Ionicons name="chevron-forward" size={16} color="#ccc" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.settingItem}>
                <Ionicons name="help-circle-outline" size={20} color="#666" />
                <Text style={styles.settingText}>Help & Support</Text>
                <Ionicons name="chevron-forward" size={16} color="#ccc" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.settingItem}>
                <Ionicons name="information-circle-outline" size={20} color="#666" />
                <Text style={styles.settingText}>About</Text>
                <Ionicons name="chevron-forward" size={16} color="#ccc" />
              </TouchableOpacity>
            </View>

            {/* Sign Out Button */}
            <View style={styles.signOutSection}>
              <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
                <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
                <Text style={styles.signOutText}>Sign Out</Text>
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
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
  },
  closeButton: {
    padding: 4,
  },
  userInfoSection: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  avatarContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  username: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#666',
  },
  tierSection: {
    marginTop: 16,
    width: '100%',
    alignItems: 'center',
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  tierText: {
    fontSize: 16,
    fontWeight: '700',
  },
  levelText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  xpSection: {
    width: '100%',
    alignItems: 'center',
  },
  xpBarContainer: {
    width: '100%',
    height: 20,
    backgroundColor: '#E0E0E0',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 8,
  },
  xpBarFill: {
    height: '100%',
    borderRadius: 10,
  },
  xpText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  settingsSection: {
    paddingVertical: 8,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f8f8',
  },
  settingText: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    marginLeft: 12,
  },
  signOutSection: {
    marginTop: 'auto',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF3B30',
    backgroundColor: '#fff',
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF3B30',
    marginLeft: 8,
  },
});
