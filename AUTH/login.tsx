import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppleSignIn } from '../COMPONENTS/AppleSignIn';
import { GoogleSignIn } from '../COMPONENTS/GoogleSignIn';

export default function Login() {
  console.log('Login component rendered');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.loginContainer}>
        <Text style={styles.title}>Welcome to Doodle Duel</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>
        
        {/* Google Sign In */}
        <GoogleSignIn 
          onSignInSuccess={(user) => {
            console.log('✅ Login: Google sign in successful');
          }}
          onSignInError={(error) => {
            console.error('❌ Login: Google sign in error:', error);
            console.error('❌ Login: Error details:', {
              message: error?.message,
              code: error?.code,
              status: error?.status
            });
            Alert.alert('Google Sign-In Error', error?.message || 'Unknown error occurred');
          }}
        />

        {/* Apple Sign In */}
        <AppleSignIn 
          onSignInSuccess={() => console.log('Apple sign in successful')}
          onSignInError={(error) => Alert.alert('Error', error.message)}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    color: '#666',
  },
});