import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../SUPABASE/supabaseConfig';

export default function SimpleSignInTest() {
  const [loading, setLoading] = useState(false);

  const testSignIn = async () => {
    setLoading(true);
    console.log('🧪 Testing sign-in flow...');
    
    try {
      // Test 1: Check if we can connect to Supabase
      console.log('🔍 Test 1: Testing Supabase connection...');
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        console.error('❌ Auth error:', authError);
        Alert.alert('Auth Error', authError.message);
        return;
      }
      
      console.log('✅ Auth connection works, user:', user?.id);
      
      // Test 2: Check if profiles table exists
      console.log('🔍 Test 2: Testing profiles table...');
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id')
        .limit(1);
      
      if (profilesError) {
        console.error('❌ Profiles table error:', profilesError);
        Alert.alert('Database Error', `Profiles table error: ${profilesError.message}`);
        return;
      }
      
      console.log('✅ Profiles table accessible');
      
      // Test 3: Try to create a test profile
      console.log('🔍 Test 3: Testing profile creation...');
      const testId = 'test-user-' + Date.now();
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: testId,
          email: 'test@example.com'
        });
      
      if (insertError) {
        console.error('❌ Profile creation error:', insertError);
        Alert.alert('Profile Creation Error', `Cannot create profile: ${insertError.message}`);
        return;
      }
      
      console.log('✅ Profile creation works');
      
      // Clean up test data
      await supabase
        .from('profiles')
        .delete()
        .eq('id', testId);
      
      Alert.alert('Success', 'All tests passed! Sign-in flow should work.');
      
    } catch (error) {
      console.error('❌ Test failed:', error);
      Alert.alert('Test Failed', `Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Simple Sign-In Test</Text>
      <Text style={styles.subtitle}>Test the core sign-in and database functionality</Text>
      
      <TouchableOpacity 
        style={[styles.button, loading && styles.buttonDisabled]} 
        onPress={testSignIn}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Testing...' : 'Test Sign-In Flow'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    width: 200,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
});
