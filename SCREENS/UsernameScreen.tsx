import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppDispatch } from '../store/hooks';
import { authService } from '../store/services/authService';
import { supabase } from '../SUPABASE/supabaseConfig';

export default function UsernameScreen() {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateUsername = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Please enter a username');
      return;
    }

    if (username.length < 3) {
      Alert.alert('Error', 'Username must be at least 3 characters long');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      Alert.alert('Error', 'Username can only contain letters, numbers, and underscores');
      return;
    }

    setLoading(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        Alert.alert('Error', 'No user found. Please sign in again.');
        return;
      }

      // Check if username is available
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', username)
        .single();

      if (existingUser) {
        Alert.alert('Error', 'Username is already taken. Please choose another one.');
        setLoading(false);
        return;
      }

      // Update user profile with username
      const { error } = await supabase
        .from('profiles')
        .update({
          username: username,
          isNewUser: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) {
        console.error('Error updating profile:', error);
        Alert.alert('Error', 'Failed to create username. Please try again.');
        setLoading(false);
        return;
      }

      // Update Redux state with new user info
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await authService.fetchUserInfo(session)(dispatch);
      }

      // Navigate to home screen
      navigation.navigate('Home' as never);
      
    } catch (error) {
      console.error('Error creating username:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Choose Your Username</Text>
        <Text style={styles.subtitle}>
          Pick a unique username that others will see when you play games
        </Text>
        
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Enter username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
            editable={!loading}
          />
          <Text style={styles.characterCount}>{username.length}/20</Text>
        </View>

        <View style={styles.rulesContainer}>
          <Text style={styles.rulesTitle}>Username Rules:</Text>
          <Text style={styles.rule}>• At least 3 characters long</Text>
          <Text style={styles.rule}>• Only letters, numbers, and underscores</Text>
          <Text style={styles.rule}>• Must be unique</Text>
        </View>

        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={handleCreateUsername}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Creating...' : 'Create Username'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    color: '#666',
    lineHeight: 22,
  },
  inputContainer: {
    marginBottom: 30,
  },
  input: {
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    backgroundColor: '#f8f9fa',
  },
  characterCount: {
    textAlign: 'right',
    marginTop: 5,
    fontSize: 12,
    color: '#666',
  },
  rulesContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 40,
  },
  rulesTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  rule: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
  },
});
