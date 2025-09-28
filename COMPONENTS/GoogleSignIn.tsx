import { Ionicons } from '@expo/vector-icons';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { supabase } from '../SUPABASE/supabaseConfig';

WebBrowser.maybeCompleteAuthSession();

interface GoogleSignInProps {
  onSignInSuccess?: (user: any) => void;
  onSignInError?: (error: any) => void;
}

export function GoogleSignIn({ onSignInSuccess, onSignInError }: GoogleSignInProps) {
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '693976680551-u7chuhpmu8n6etgr17aktedrhf93boug.apps.googleusercontent.com',
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '693976680551-t4qqfhhjlsvvlj2l1hpjh38r3ukarua1.apps.googleusercontent.com',
    scopes: ['openid', 'profile', 'email'],

  });
  // Handle Google sign-in response
  useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response;
      if (authentication?.idToken) {
        signInWithGoogle(authentication.idToken);
      }
    }
  }, [response]);

  const signInWithGoogle = async (token: string) => {
    try {
      const { error, data } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token,
      });
      
      if (!error && data.user) {
        onSignInSuccess?.(data.user);
      } else {
        onSignInError?.(error);
      }
    } catch (error) {
      onSignInError?.(error);
    }
  };

  return (
    <TouchableOpacity 
      style={styles.googleButton} 
      onPress={() => promptAsync()} 
      disabled={!request}
    >
      <Ionicons name="logo-google" size={20} color="#fff" style={styles.socialIcon} />
      <Text style={styles.googleButtonText}>Continue with Google</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  googleButton: {
    backgroundColor: '#4285F4',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  googleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  socialIcon: {
    marginRight: 8,
  },
});
