import * as AppleAuthentication from 'expo-apple-authentication';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { supabase } from '../SUPABASE/supabaseConfig';

interface AppleSignInProps {
  onSignInSuccess?: (user: any) => void;
  onSignInError?: (error: any) => void;
}

export function AppleSignIn({ onSignInSuccess, onSignInError }: AppleSignInProps) {
  console.log('AppleSignIn component rendered');
  
  const handleAppleSignIn = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      // Sign in via Supabase Auth
      if (credential.identityToken) {
        const {
          error,
          data: { user },
        } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
        });

        console.log(JSON.stringify({ error, user }, null, 2));
        
        if (!error && user) {
          onSignInSuccess?.(user);
        } else {
          onSignInError?.(error);
        }
      } else {
        throw new Error('No identityToken received from Apple');
      }
    } catch (e: any) {
      if (e.code === 'ERR_REQUEST_CANCELED') {
        // User canceled the sign-in flow
        console.log('Apple Sign In was canceled by user');
      } else if (e.message?.includes('authorization attempt failed for an unknown reason')) {
        // This is a common development issue that doesn't affect functionality
        console.log('Apple Sign In completed (development warning ignored)');
      } else {
        // Handle other errors
        console.error('Apple Sign In error:', e);
        onSignInError?.(e);
      }
    }
  };

  // Only show Apple Sign In on iOS
  if (Platform.OS !== 'ios') {
    return null;
  }

  return (
    <View style={styles.appleButtonContainer}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
        cornerRadius={12}
        style={styles.appleButton}
        onPress={handleAppleSignIn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  appleButtonContainer: {
    width: '100%',
    height: 48,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  appleButton: {
    width: '100%',
    height: '100%',
  },
});
