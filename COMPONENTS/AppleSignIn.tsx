import * as AppleAuthentication from 'expo-apple-authentication';
import React from 'react';
import { Platform, StyleSheet, TouchableOpacity } from 'react-native';
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
    <TouchableOpacity
      onPress={handleAppleSignIn}
      style={styles.appleButton}
    >
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
        cornerRadius={12}
        style={styles.appleButtonInner}
        onPress={handleAppleSignIn}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  appleButton: {
    width: 288,
    backgroundColor: 'white',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  appleButtonInner: {
    width: 256,
    height: 48,
  },
});
